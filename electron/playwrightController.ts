/**
 * Playwright Controller
 * Manages Playwright browser instances and provides secure DOM-level actions
 */

import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import log from 'electron-log';
import { humanizedClick, humanizedType, type HumanOptions, type TypeOptions } from './humanCursor';

// Types
export interface PageInfo {
  windowId: string;
  url: string;
}

export interface ElementDescriptor {
  selector: string;
  innerText: string;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

export interface ScreenshotResult {
  imageBase64: string;
  width: number;
  height: number;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

interface RateLimiter {
  actions: number[];
  maxActions: number;
  windowMs: number;
}

// Constants
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_ELEMENT_LIMIT = 20;
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second
const RATE_LIMIT_MAX_ACTIONS = 10; // 10 actions per second
const SELECTOR_MAX_LENGTH = 1000;
const TEXT_MAX_LENGTH = 10000;

// State
let browser: Browser | null = null;
const pageMap = new Map<string, Page>();
const contextMap = new Map<string, BrowserContext>();
const rateLimiters = new Map<string, RateLimiter>();

// Logging setup
const logDir = path.join(app.getPath('logs'), 'playwright');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logFile = path.join(logDir, 'playwright-actions.log');

function logAction(action: string, windowId: string, details?: Record<string, any>): void {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    windowId,
    ...(details && Object.keys(details).length > 0 ? { details: sanitizeLogDetails(details) } : {})
  };
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
}

function sanitizeLogDetails(details: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(details)) {
    if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.substring(0, 200) + '...';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Validate CSS selector for security
 */
function validateSelector(selector: string): boolean {
  if (typeof selector !== 'string' || selector.length === 0 || selector.length > SELECTOR_MAX_LENGTH) {
    return false;
  }
  
  // Reject javascript: protocol
  if (selector.toLowerCase().includes('javascript:')) {
    return false;
  }
  
  // Reject suspicious patterns
  const suspiciousPatterns = [
    /eval\s*\(/i,
    /function\s*\(/i,
    /<script/i,
    /on\w+\s*=/i, // onclick=, onerror=, etc.
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(selector)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check rate limit for a windowId
 */
function checkRateLimit(windowId: string): boolean {
  const now = Date.now();
  let limiter = rateLimiters.get(windowId);
  
  if (!limiter) {
    limiter = {
      actions: [],
      maxActions: RATE_LIMIT_MAX_ACTIONS,
      windowMs: RATE_LIMIT_WINDOW_MS
    };
    rateLimiters.set(windowId, limiter);
  }
  
  // Remove old actions outside the window
  limiter.actions = limiter.actions.filter(timestamp => now - timestamp < limiter.windowMs);
  
  if (limiter.actions.length >= limiter.maxActions) {
    return false;
  }
  
  limiter.actions.push(now);
  return true;
}

/**
 * Wait for element with enhanced popup/modal support
 * Handles cases where elements appear in popups, modals, or overlays after actions
 */
async function waitForElementWithPopupSupport(
  page: Page,
  selector: string,
  timeout: number
): Promise<void> {
  try {
    // First, try standard wait
    await page.waitForSelector(selector, { state: 'visible', timeout });
    log.debug(`[Playwright] Element found immediately: ${selector}`);
    return;
  } catch (error) {
    // If standard wait fails, try waiting for common popup/modal patterns
    log.warn(`[Playwright] Standard wait failed for ${selector}, trying popup/modal detection...`);
    
    // Wait longer for popups to appear (especially for Gmail compose)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try waiting again with longer timeout
    try {
      await page.waitForSelector(selector, { state: 'visible', timeout: Math.min(timeout, 5000) });
      log.debug(`[Playwright] Element found after delay: ${selector}`);
      return;
    } catch (retryError) {
      // Check if we're on Gmail and look for compose component first
      const currentUrl = page.url();
      const isGmail = currentUrl.includes('mail.google.com');
      if (isGmail) {
        log.debug(`[Playwright] On Gmail (${currentUrl}), checking for compose component...`);
        const composeFound = await waitForGmailComposeComponent(page, Math.min(timeout, 5000));
        if (composeFound) {
          // Compose component found, try the selector again
          try {
            await page.waitForSelector(selector, { state: 'visible', timeout: Math.min(timeout, 5000) });
            log.info(`[Playwright] Found element in Gmail compose component: ${selector}`);
            return;
          } catch {
            // Try scoped to compose component - use multiple strategies
            const composeSelectors = [
              'div[role="dialog"][aria-label*="compose" i]',
              'div[role="dialog"][aria-label*="Compose"]',
              'div[role="dialog"]', // Any dialog
              'div[class*="aYF"]',
              'div[class*="nH"]'
            ];
            for (const composeSelector of composeSelectors) {
              try {
                // Try scoped selector
                const scopedSelector = `${composeSelector} ${selector}`;
                await page.waitForSelector(scopedSelector, { state: 'visible', timeout: 3000 });
                log.info(`[Playwright] Found element in compose using scoped selector: ${scopedSelector}`);
                return;
              } catch {
                // Try without visibility requirement
                try {
                  await page.waitForSelector(scopedSelector, { timeout: 2000 });
                  log.info(`[Playwright] Found element (may not be fully visible): ${scopedSelector}`);
                  return;
                } catch {
                  continue;
                }
              }
            }
            
            // Last resort: try to find the element by searching within any visible dialog
            try {
              const dialogs = await page.$$('div[role="dialog"]');
              for (const dialog of dialogs) {
                const isVisible = await dialog.isVisible();
                if (isVisible) {
                  const elementInDialog = await dialog.$(selector);
                  if (elementInDialog) {
                    log.info(`[Playwright] Found element in visible dialog: ${selector}`);
                    return;
                  }
                }
              }
            } catch (err) {
              log.debug(`[Playwright] Error searching in dialogs: ${err}`);
            }
          }
        } else {
          log.warn(`[Playwright] Gmail compose component not found, but we're on Gmail. URL: ${currentUrl}`);
        }
      }
      
      // Try looking for common popup/modal/component containers
      const popupSelectors = [
        // Gmail compose component (high priority)
        'div[role="dialog"][aria-label*="compose" i]',
        'div[role="dialog"][aria-label*="Compose"]',
        'div[class*="aYF"]', // Gmail compose container
        'div[class*="nH"]', // Gmail compose window
        '[class*="compose"]',
        '[aria-label*="compose" i]',
        '[aria-label*="Compose"]',
        // General popup/modal patterns
        '[role="dialog"]',
        '.modal',
        '.popup',
        '[class*="modal"]',
        '[class*="popup"]',
        '[class*="dialog"]',
        '[class*="overlay"]',
        '[id*="modal"]',
        '[id*="popup"]',
        '[id*="dialog"]',
        '[data-tooltip*="compose" i]'
      ];
      
      // Check if any popup containers exist
      let foundPopup = false;
      for (const popupSelector of popupSelectors) {
        try {
          const popup = await page.$(popupSelector);
          if (popup) {
            const isVisible = await popup.isVisible();
            if (isVisible) {
              foundPopup = true;
              log.info(`[Playwright] Found popup container: ${popupSelector}, retrying element wait for: ${selector}`);
              // Wait longer for Gmail compose content to fully render
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              // Try the original selector again (popup might be in focus now)
              try {
                await page.waitForSelector(selector, { state: 'visible', timeout: Math.min(timeout, 5000) });
                log.info(`[Playwright] Found element after popup detection: ${selector}`);
                return;
              } catch {
                // Try scoped selector
                const scopedSelector = `${popupSelector} ${selector}`;
                try {
                  await page.waitForSelector(scopedSelector, { state: 'visible', timeout: 3000 });
                  log.info(`[Playwright] Found element in popup using scoped selector: ${scopedSelector}`);
                  return;
                } catch {
                  // Try without state requirement (element might be present but not yet visible)
                  try {
                    await page.waitForSelector(selector, { timeout: 2000 });
                    log.info(`[Playwright] Found element (may not be fully visible yet): ${selector}`);
                    return;
                  } catch {
                    continue;
                  }
                }
              }
            }
          }
        } catch (err) {
          log.debug(`[Playwright] Error checking popup selector ${popupSelector}:`, err);
          continue;
        }
      }
      
      if (foundPopup) {
        log.warn(`[Playwright] Popup found but element ${selector} still not visible. This may indicate a selector issue.`);
      }
      
      // If all else fails, throw the original error with more context
      throw new Error(`Element ${selector} not found, even after checking popups/modals. Timeout: ${timeout}ms`);
    }
  }
}

/**
 * Wait for Gmail compose component to be ready
 * Gmail compose is a separate component, not a popup/modal
 */
async function waitForGmailComposeComponent(page: Page, timeout: number = 5000): Promise<boolean> {
  // First check if we're actually on Gmail
  const currentUrl = page.url();
  if (!currentUrl.includes('mail.google.com')) {
    log.warn(`[Playwright] Not on Gmail (URL: ${currentUrl}), skipping compose component detection`);
    return false;
  }
  
  const composeSelectors = [
    // Gmail compose component specific selectors (priority order)
    // Try more specific selectors first
    'div[role="dialog"][aria-label*="compose" i]',
    'div[role="dialog"][aria-label*="Compose"]',
    'div[role="dialog"][aria-label*="New Message" i]',
    // Try by aria-label alone
    'div[aria-label*="compose" i]',
    'div[aria-label*="Compose"]',
    'div[aria-label*="New Message" i]',
    // Try by role and class combinations
    '[class*="compose"][role="dialog"]',
    '[class*="Compose"][role="dialog"]',
    // Gmail's compose window class patterns (these are dynamic but common)
    'div[class*="nH"][class*="aYF"]', // Common Gmail compose container pattern
    'div[class*="aYF"]', // Gmail compose container
    'div[class*="nH"]', // Gmail compose window class pattern
    // More generic patterns
    '[class*="compose"]',
    '[data-tooltip*="compose" i]',
    // Try finding by input fields that are unique to compose
    'div[role="dialog"] input[aria-label*="To" i]',
    'div[role="dialog"] input[aria-label*="Recipients" i]'
  ];
  
  // Wait a bit for component to start appearing
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Try to find compose component by checking for its unique input fields
  try {
    // Check if compose window exists by looking for the "To" field
    const toField = await page.$('input[aria-label*="To" i], input[aria-label*="Recipients" i]');
    if (toField) {
      const isVisible = await toField.isVisible();
      if (isVisible) {
        // Check if it's within a dialog (compose window)
        const parentDialog = await toField.evaluateHandle((el) => {
          let parent = el.parentElement;
          while (parent) {
            if (parent.getAttribute('role') === 'dialog' || 
                parent.getAttribute('aria-label')?.toLowerCase().includes('compose') ||
                parent.className.includes('compose') ||
                parent.className.includes('aYF')) {
              return parent;
            }
            parent = parent.parentElement;
          }
          return null;
        });
        
        const dialogValue = await parentDialog.jsonValue();
        if (dialogValue) {
          log.info(`[Playwright] Gmail compose component detected via To field in dialog`);
          await new Promise(resolve => setTimeout(resolve, 1500));
          return true;
        }
      }
    }
  } catch (err) {
    log.debug(`[Playwright] Error checking for To field: ${err}`);
  }
  
  // Fallback to selector-based detection
  for (const selector of composeSelectors) {
    try {
      const element = await page.waitForSelector(selector, { state: 'visible', timeout });
      if (element) {
        log.info(`[Playwright] Gmail compose component detected: ${selector}`);
        // Wait for compose component content to fully render (inputs, buttons, etc.)
        await new Promise(resolve => setTimeout(resolve, 1500));
        return true;
      }
    } catch {
      continue;
    }
  }
  
  // Last resort: check if any dialog exists and has compose-related content
  try {
    const dialogs = await page.$$('div[role="dialog"]');
    for (const dialog of dialogs) {
      const isVisible = await dialog.isVisible();
      if (isVisible) {
        // Check if dialog contains compose-related elements
        const hasToField = await dialog.$('input[aria-label*="To" i], input[aria-label*="Recipients" i]');
        const hasSubjectField = await dialog.$('input[aria-label*="Subject" i]');
        if (hasToField || hasSubjectField) {
          log.info(`[Playwright] Gmail compose component detected via dialog with compose fields`);
          await new Promise(resolve => setTimeout(resolve, 1500));
          return true;
        }
      }
    }
  } catch (err) {
    log.debug(`[Playwright] Error in fallback compose detection: ${err}`);
  }
  
  return false;
}

/**
 * Wait for popup/modal/component to appear after an action
 * Handles both traditional popups and component overlays like Gmail compose
 */
async function waitForPopupAfterAction(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  // First, try to detect Gmail compose component specifically
  const isGmail = page.url().includes('mail.google.com');
  if (isGmail) {
    const composeFound = await waitForGmailComposeComponent(page, timeout);
    if (composeFound) {
      return;
    }
  }
  
  // Fallback to general popup/modal detection
  const popupSelectors = [
    '[role="dialog"]',
    '.modal',
    '.popup',
    '[class*="modal"]',
    '[class*="popup"]',
    '[class*="dialog"]',
    '[class*="overlay"]',
    '[class*="compose"]',
    '[aria-label*="compose" i]',
    '[aria-label*="Compose"]',
    '[data-tooltip*="compose" i]'
  ];
  
  // Wait a bit for component/popup to start appearing
  await new Promise(resolve => setTimeout(resolve, 300));
  
  for (const selector of popupSelectors) {
    try {
      await page.waitForSelector(selector, { state: 'visible', timeout });
      log.info(`[Playwright] Component/popup detected: ${selector}`);
      // Wait longer for content to fully render
      await new Promise(resolve => setTimeout(resolve, 1000));
      return;
    } catch {
      continue;
    }
  }
  
  // If no component/popup found, that's okay - not all actions trigger them
  log.debug('[Playwright] No component/popup detected after action');
}

/**
 * Create error response
 */
function createErrorResponse(code: string, message: string): ApiResponse {
  return {
    ok: false,
    error: { code, message }
  };
}

/**
 * Create success response
 */
function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    ok: true,
    data
  };
}

/**
 * Start Playwright browser instance
 */
export async function startPlaywright(): Promise<void> {
  if (browser) {
    log.warn('[Playwright] Browser already started');
    return;
  }
  
  // Default to headless mode to prevent separate Chrome window from opening
  // Set PLAYWRIGHT_HEADLESS=false in environment to show browser window and see mouse movements
  // Force headless=true by default (only show browser if explicitly set to false)
  const headless = process.env.PLAYWRIGHT_HEADLESS === 'false' ? false : true;
  
  // Log status for user visibility
  if (headless === false) {
    log.info('[Playwright] Headless mode DISABLED - browser window will be VISIBLE. You can see mouse movements and cursor!');
    log.info('[Playwright] To hide browser window, set PLAYWRIGHT_HEADLESS=true in .env.local');
  } else {
    log.info('[Playwright] Headless mode ENABLED - browser runs invisibly. Mouse movements not visible.');
    log.info('[Playwright] To see mouse movements, set PLAYWRIGHT_HEADLESS=false in .env.local');
  }
  
  try {
    browser = await chromium.launch({
      headless,
      args: ['--disable-blink-features=AutomationControlled']
    });
    log.info(`[Playwright] Browser started (headless: ${headless})`);
    logAction('start', 'system', { headless });
  } catch (error) {
    log.error('[Playwright] Failed to start browser:', error);
    throw error;
  }
}

/**
 * Stop Playwright browser instance
 */
export async function stopPlaywright(): Promise<void> {
  if (!browser) {
    return;
  }
  
  try {
    // Close all pages first
    for (const [windowId, page] of pageMap.entries()) {
      try {
        await page.close();
      } catch (error) {
        log.warn(`[Playwright] Error closing page ${windowId}:`, error);
      }
    }
    pageMap.clear();
    contextMap.clear();
    rateLimiters.clear();
    
    await browser.close();
    browser = null;
    log.info('[Playwright] Browser stopped');
    logAction('stop', 'system');
  } catch (error) {
    log.error('[Playwright] Error stopping browser:', error);
    throw error;
  }
}

/**
 * Ensure browser is started (lazy initialization)
 */
async function ensureBrowserStarted(): Promise<void> {
  if (!browser) {
    log.info('[Playwright] Browser not started, starting now (lazy initialization)...');
    await startPlaywright();
  }
}

/**
 * Create a new Playwright page for a window
 */
export async function newPage(windowId: string): Promise<ApiResponse<PageInfo>> {
  // Lazy start browser if not already started
  await ensureBrowserStarted();
  
  if (!browser) {
    return createErrorResponse('INTERNAL', 'Failed to start Playwright browser');
  }
  
  if (pageMap.has(windowId)) {
    return createErrorResponse('INVALID_ARG', `Page for windowId ${windowId} already exists`);
  }
  
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT);
    
    pageMap.set(windowId, page);
    contextMap.set(windowId, context);
    
    const url = page.url();
    log.info(`[Playwright] Created page for windowId: ${windowId}`);
    logAction('newPage', windowId, { url });
    
    return createSuccessResponse<PageInfo>({
      windowId,
      url
    });
  } catch (error) {
    log.error(`[Playwright] Error creating page for ${windowId}:`, error);
    return createErrorResponse('INTERNAL', `Failed to create page: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Close a Playwright page
 */
export async function closePage(windowId: string): Promise<ApiResponse> {
  const page = pageMap.get(windowId);
  const context = contextMap.get(windowId);
  
  if (!page || !context) {
    return createErrorResponse('NOT_FOUND', `Page for windowId ${windowId} not found`);
  }
  
  try {
    await page.close();
    await context.close();
    pageMap.delete(windowId);
    contextMap.delete(windowId);
    rateLimiters.delete(windowId);
    
    log.info(`[Playwright] Closed page for windowId: ${windowId}`);
    logAction('closePage', windowId);
    
    return createSuccessResponse(null);
  } catch (error) {
    log.error(`[Playwright] Error closing page ${windowId}:`, error);
    return createErrorResponse('INTERNAL', `Failed to close page: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Navigate to a URL
 */
export async function goto(windowId: string, url: string): Promise<ApiResponse<PageInfo>> {
  // Ensure browser is started
  await ensureBrowserStarted();
  
  const page = pageMap.get(windowId);
  if (!page) {
    return createErrorResponse('NOT_FOUND', `Page for windowId ${windowId} not found`);
  }
  
  if (!checkRateLimit(windowId)) {
    return createErrorResponse('THROTTLED', 'Rate limit exceeded');
  }
  
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return createErrorResponse('INVALID_ARG', 'Invalid URL');
  }
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const currentUrl = page.url();
    logAction('goto', windowId, { url: currentUrl });
    
    return createSuccessResponse<PageInfo>({
      windowId,
      url: currentUrl
    });
  } catch (error) {
    log.error(`[Playwright] Error navigating ${windowId} to ${url}:`, error);
    return createErrorResponse('TIMEOUT', `Navigation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * List elements matching a selector
 */
export async function listElements(
  windowId: string,
  selector?: string,
  options?: { limit?: number }
): Promise<ApiResponse<ElementDescriptor[]>> {
  const page = pageMap.get(windowId);
  if (!page) {
    return createErrorResponse('NOT_FOUND', `Page for windowId ${windowId} not found`);
  }
  
  if (!checkRateLimit(windowId)) {
    return createErrorResponse('THROTTLED', 'Rate limit exceeded');
  }
  
  const limit = options?.limit ?? DEFAULT_ELEMENT_LIMIT;
  if (limit < 1 || limit > 100) {
    return createErrorResponse('INVALID_ARG', 'Limit must be between 1 and 100');
  }
  
  try {
    let elements: ElementDescriptor[] = [];
    
    if (selector) {
      if (!validateSelector(selector)) {
        return createErrorResponse('INVALID_ARG', 'Invalid or unsafe selector');
      }
      
      // First try to find elements in the main page
      let handles = await page.$$(selector);
      
      // If no elements found, try looking in components/popups/modals
      if (handles.length === 0) {
        // Check if we're on Gmail and look for compose component first
        const isGmail = page.url().includes('mail.google.com');
        if (isGmail) {
          const composeSelectors = [
            'div[role="dialog"][aria-label*="compose" i]',
            'div[role="dialog"][aria-label*="Compose"]',
            'div[class*="aYF"]', // Gmail compose container
            'div[class*="nH"]', // Gmail compose window
            '[class*="compose"]',
            '[aria-label*="compose" i]'
          ];
          
          for (const composeSelector of composeSelectors) {
            try {
              const compose = await page.$(composeSelector);
              if (compose) {
                const isVisible = await compose.isVisible();
                if (isVisible) {
                  // Try scoped selector within compose component
                  const scopedSelector = `${composeSelector} ${selector}`;
                  handles = await page.$$(scopedSelector);
                  if (handles.length > 0) {
                    log.info(`[Playwright] Found ${handles.length} elements in Gmail compose component using: ${scopedSelector}`);
                    break;
                  }
                }
              }
            } catch {
              continue;
            }
          }
        }
        
        // Fallback to general popup/modal detection
        if (handles.length === 0) {
          const popupSelectors = [
            '[role="dialog"]',
            '[class*="modal"]',
            '[class*="popup"]',
            '[class*="dialog"]',
            '[class*="overlay"]',
            '[class*="compose"]',
            '[aria-label*="compose" i]'
          ];
          
          for (const popupSelector of popupSelectors) {
            try {
              const popup = await page.$(popupSelector);
              if (popup) {
                const isVisible = await popup.isVisible();
                if (isVisible) {
                  // Try scoped selector within popup
                  const scopedSelector = `${popupSelector} ${selector}`;
                  handles = await page.$$(scopedSelector);
                  if (handles.length > 0) {
                    log.info(`[Playwright] Found ${handles.length} elements in popup/component using: ${scopedSelector}`);
                    break;
                  }
                }
              }
            } catch {
              continue;
            }
          }
        }
      }
      
      const limitedHandles = handles.slice(0, limit);
      
      for (const handle of limitedHandles) {
        try {
          const innerText = await handle.textContent() || '';
          const boundingBox = await handle.boundingBox();
          
          elements.push({
            selector,
            innerText: innerText.substring(0, 500), // Limit text length
            boundingBox: boundingBox ? {
              x: boundingBox.x,
              y: boundingBox.y,
              width: boundingBox.width,
              height: boundingBox.height
            } : null
          });
        } catch (error) {
          // Skip elements that can't be read
          continue;
        }
      }
    } else {
      // List all elements (simplified - just body children)
      const bodyHandle = await page.$('body');
      if (bodyHandle) {
        const children = await bodyHandle.$$(':scope > *');
        const limitedChildren = children.slice(0, limit);
        
        for (const child of limitedChildren) {
          try {
            const tagName = await child.evaluate(el => el.tagName.toLowerCase());
            const innerText = await child.textContent() || '';
            const boundingBox = await child.boundingBox();
            
            elements.push({
              selector: tagName,
              innerText: innerText.substring(0, 500),
              boundingBox: boundingBox ? {
                x: boundingBox.x,
                y: boundingBox.y,
                width: boundingBox.width,
                height: boundingBox.height
              } : null
            });
          } catch (error) {
            continue;
          }
        }
      }
    }
    
    logAction('listElements', windowId, { selector, count: elements.length });
    
    return createSuccessResponse(elements);
  } catch (error) {
    log.error(`[Playwright] Error listing elements for ${windowId}:`, error);
    return createErrorResponse('INTERNAL', `Failed to list elements: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Click an element
 */
export async function click(
  windowId: string,
  selector: string,
  options?: { timeout?: number; humanized?: boolean; humanOptions?: HumanOptions }
): Promise<ApiResponse> {
  const page = pageMap.get(windowId);
  if (!page) {
    return createErrorResponse('NOT_FOUND', `Page for windowId ${windowId} not found`);
  }
  
  if (!checkRateLimit(windowId)) {
    return createErrorResponse('THROTTLED', 'Rate limit exceeded');
  }
  
  if (!validateSelector(selector)) {
    return createErrorResponse('INVALID_ARG', 'Invalid or unsafe selector');
  }
  
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  if (timeout < 1000 || timeout > 60000) {
    return createErrorResponse('INVALID_ARG', 'Timeout must be between 1000 and 60000ms');
  }
  
  // Always use humanized by default for realistic human-like behavior
  // This ensures real mouse movements, Bezier curves, variable delays, and natural typing
  const useHumanized = options?.humanized !== false;
  const humanOptions: HumanOptions = {
    forceRaw: !useHumanized,
    // Enhanced human options for more realistic behavior
    steps: options?.humanOptions?.steps ?? 20, // More steps for smoother movement
    jitter: options?.humanOptions?.jitter ?? 4, // Slight jitter for natural movement
    minDelay: options?.humanOptions?.minDelay ?? 8,
    maxDelay: options?.humanOptions?.maxDelay ?? 35,
    moveStrategy: options?.humanOptions?.moveStrategy ?? 'bezier', // Bezier curves for natural paths
    ...options?.humanOptions
  };
  
  try {
    // Wait for element to be visible, with enhanced popup/modal support
    log.info(`[Playwright] Waiting for element to click: ${selector} (windowId: ${windowId})`);
    await waitForElementWithPopupSupport(page, selector, timeout);
    
    // Use humanized click (or raw if disabled)
    log.info(`[Playwright] Clicking ${selector} (humanized: ${useHumanized})`);
    if (useHumanized) {
      log.info(`[Playwright] Mouse will move along Bezier curve path to element`);
    }
    const result = await humanizedClick(page, selector, humanOptions);
    
    if (!result.ok) {
      log.error(`[Playwright] Click failed: ${result.error?.message}`);
      log.error(`[Playwright] Error details: ${JSON.stringify(result.error)}`);
      return result;
    }
    
    log.info(`[Playwright] Click successful! Element clicked with human-like movement.`);
    
    // After clicking, wait for potential popups/modals to appear
    // This is especially important for buttons like "Compose" that open popups
    // Use longer timeout for Gmail compose (5 seconds)
    log.info(`[Playwright] Waiting for popup after clicking ${selector}...`);
    await waitForPopupAfterAction(page, 5000);
    
    logAction('click', windowId, { selector, humanized: useHumanized });
    log.info(`[Playwright] Successfully clicked ${selector}`);
    
    return createSuccessResponse(null);
  } catch (error) {
    log.error(`[Playwright] Error clicking ${selector} in ${windowId}:`, error);
    if (error instanceof Error && error.message.includes('timeout')) {
      return createErrorResponse('TIMEOUT', `Element not found or not visible: ${selector}. If this is a popup/modal, it may not have appeared yet.`);
    }
    return createErrorResponse('INTERNAL', `Click failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Type text into an element
 */
export async function type(
  windowId: string,
  selector: string,
  text: string,
  options?: { timeout?: number; humanized?: boolean; typeOptions?: TypeOptions }
): Promise<ApiResponse> {
  const page = pageMap.get(windowId);
  if (!page) {
    return createErrorResponse('NOT_FOUND', `Page for windowId ${windowId} not found`);
  }
  
  if (!checkRateLimit(windowId)) {
    return createErrorResponse('THROTTLED', 'Rate limit exceeded');
  }
  
  if (!validateSelector(selector)) {
    return createErrorResponse('INVALID_ARG', 'Invalid or unsafe selector');
  }
  
  if (typeof text !== 'string' || text.length === 0 || text.length > TEXT_MAX_LENGTH) {
    return createErrorResponse('INVALID_ARG', 'Text must be a non-empty string (max 10000 chars)');
  }
  
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  if (timeout < 1000 || timeout > 60000) {
    return createErrorResponse('INVALID_ARG', 'Timeout must be between 1000 and 60000ms');
  }
  
    // Always use humanized by default for realistic human-like behavior
    // Character-by-character typing with variable delays, pauses, and natural rhythm
    const useHumanized = options?.humanized !== false;
  
  try {
    // Handle index-based selectors (e.g., "index 40" from agent framework)
    let actualSelector = selector;
    const indexMatch = selector.match(/^index\s+(\d+)$/i);
    if (indexMatch) {
      const index = parseInt(indexMatch[1], 10);
      log.warn(`[Playwright] Received index-based selector "${selector}", this is not a valid CSS selector. The agent should use proper selectors.`);
      // Try to find the element by getting all input/textarea elements and using index
      // This is a fallback, but the agent should really use proper selectors
      const isGmail = page.url().includes('mail.google.com');
      if (isGmail) {
        // For Gmail compose, try common input field selectors
        const gmailInputSelectors = [
          'input[aria-label*="To" i]',
          'input[aria-label*="Subject" i]',
          'div[aria-label*="Message" i]',
          'div[contenteditable="true"]',
          'textarea[aria-label*="Message" i]'
        ];
        // This is a workaround - ideally the agent should provide proper selectors
        log.warn(`[Playwright] Index-based selector not supported. Please use proper CSS selectors like: ${gmailInputSelectors.join(', ')}`);
        return createErrorResponse('INVALID_ARG', `Index-based selector "${selector}" is not supported. Please use proper CSS selectors like input[aria-label*="To"], input[aria-label*="Subject"], or div[contenteditable="true"]`);
      }
    }
    
    // Gmail-specific handling: improve selectors for compose fields
    const isGmail = page.url().includes('mail.google.com');
    if (isGmail) {
      log.info(`[Playwright] Detected Gmail, using enhanced element detection...`);
      
      // First, ensure compose dialog is ready
      const composeReady = await waitForGmailComposeComponent(page, 5000);
      if (!composeReady) {
        log.warn(`[Playwright] Gmail compose dialog not detected. Waiting longer...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Try to find element within compose dialog if selector doesn't work directly
      const composeDialog = await page.$('div[role="dialog"][aria-label*="compose" i], div[role="dialog"][aria-label*="Compose"], div[role="dialog"]');
      if (composeDialog) {
        log.info(`[Playwright] Compose dialog found, trying scoped selectors...`);
        // For Gmail, try scoped selectors within compose dialog
        const scopedSelector = `div[role="dialog"] ${actualSelector}`;
        try {
          await page.waitForSelector(scopedSelector, { state: 'visible', timeout: Math.min(timeout, 5000) });
          actualSelector = scopedSelector;
          log.info(`[Playwright] Found element using scoped selector within Gmail compose dialog`);
        } catch {
          // Fall back to original selector
          log.debug(`[Playwright] Scoped selector failed, trying field-specific detection...`);
        }
      }
      
      // Gmail-specific selector improvements - try ALL common selectors
      if (actualSelector.includes('To') || actualSelector.includes('to') || actualSelector.includes('Recipient') || actualSelector.includes('recipient')) {
        log.info(`[Playwright] Detected To/Recipient field, trying Gmail-specific selectors...`);
        const toSelectors = [
          'input[aria-label*="To" i]',
          'input[name="to"]',
          'input[type="email"][aria-label*="To" i]',
          'div[role="dialog"] input[aria-label*="To" i]',
          'div[role="dialog"] input[name="to"]',
          'input[aria-label*="Recipients" i]',
          'div[role="dialog"] input[aria-label*="Recipients" i]'
        ];
        for (const toSelector of toSelectors) {
          try {
            const toElement = await page.$(toSelector);
            if (toElement) {
              const isVisible = await toElement.isVisible();
              if (isVisible) {
                actualSelector = toSelector;
                log.info(`[Playwright] ✓ Found Gmail To field using: ${actualSelector}`);
                break;
              }
            }
          } catch {
            continue;
          }
        }
      }
      
      if (actualSelector.includes('Subject') || actualSelector.includes('subject')) {
        log.info(`[Playwright] Detected Subject field, trying Gmail-specific selectors...`);
        // Try multiple Gmail subject field selectors
        const subjectSelectors = [
          'input[name="subjectbox"]',
          'input[aria-label*="Subject" i]',
          'div[role="dialog"] input[name="subjectbox"]',
          'div[role="dialog"] input[aria-label*="Subject" i]',
          'input[placeholder*="Subject" i]',
          'div[role="dialog"] input[placeholder*="Subject" i]'
        ];
        for (const subjSelector of subjectSelectors) {
          try {
            const subjElement = await page.$(subjSelector);
            if (subjElement) {
              const isVisible = await subjElement.isVisible();
              if (isVisible) {
                actualSelector = subjSelector;
                log.info(`[Playwright] ✓ Found Gmail Subject field using: ${actualSelector}`);
                break;
              }
            }
          } catch {
            continue;
          }
        }
      }
      
      if (actualSelector.includes('Message') || actualSelector.includes('Body') || actualSelector.includes('contenteditable') || actualSelector.includes('textbox')) {
        log.info(`[Playwright] Detected Body/Message field, trying Gmail-specific selectors...`);
        // Try multiple Gmail body field selectors
        const bodySelectors = [
          'div[aria-label*="Message Body" i]',
          'div[role="textbox"][aria-label*="Message" i]',
          'div[contenteditable="true"][aria-label*="Message" i]',
          'div[role="dialog"] div[aria-label*="Message Body" i]',
          'div[role="dialog"] div[role="textbox"][aria-label*="Message" i]',
          'div[role="dialog"] div[contenteditable="true"][aria-label*="Message" i]',
          'div[contenteditable="true"][role="textbox"]',
          'div[role="dialog"] div[contenteditable="true"][role="textbox"]'
        ];
        for (const bodySelector of bodySelectors) {
          try {
            const bodyElement = await page.$(bodySelector);
            if (bodyElement) {
              const isVisible = await bodyElement.isVisible();
              if (isVisible) {
                actualSelector = bodySelector;
                log.info(`[Playwright] ✓ Found Gmail Body field using: ${actualSelector}`);
                break;
              }
            }
          } catch {
            continue;
          }
        }
      }
      
      // If still no match, try to find ANY input/textarea/contenteditable in compose dialog
      if (actualSelector === selector) {
        log.warn(`[Playwright] Original selector failed, trying to find any input field in compose dialog...`);
        const fallbackSelectors = [
          'div[role="dialog"] input',
          'div[role="dialog"] textarea',
          'div[role="dialog"] div[contenteditable="true"]',
          'div[role="dialog"] [contenteditable="true"]'
        ];
        for (const fallbackSelector of fallbackSelectors) {
          try {
            const fallbackElement = await page.$(fallbackSelector);
            if (fallbackElement) {
              const isVisible = await fallbackElement.isVisible();
              if (isVisible) {
                log.warn(`[Playwright] Using fallback selector: ${fallbackSelector} (original: ${selector})`);
                actualSelector = fallbackSelector;
                break;
              }
            }
          } catch {
            continue;
          }
        }
      }
    }
    
    // Wait for element with popup/modal support
    log.info(`[Playwright] Waiting for element to type into: ${actualSelector} (windowId: ${windowId})`);
    try {
      await waitForElementWithPopupSupport(page, actualSelector, timeout);
    } catch (waitError) {
      log.error(`[Playwright] Failed to wait for element: ${actualSelector}`);
      log.error(`[Playwright] Error: ${waitError}`);
      
      // For Gmail, try to list available elements to help debug
      if (isGmail) {
        log.info(`[Playwright] Attempting to discover available input fields in Gmail compose...`);
        try {
          const composeDialog = await page.$('div[role="dialog"]');
          if (composeDialog) {
            const inputs = await composeDialog.$$eval('input, textarea, [contenteditable="true"]', (elements) => {
              return elements.map((el, idx) => ({
                index: idx,
                tag: el.tagName.toLowerCase(),
                ariaLabel: el.getAttribute('aria-label') || '',
                name: el.getAttribute('name') || '',
                placeholder: el.getAttribute('placeholder') || '',
                role: el.getAttribute('role') || '',
                contenteditable: el.getAttribute('contenteditable') || '',
                visible: (el as HTMLElement).offsetParent !== null
              }));
            });
            log.info(`[Playwright] Available input fields in compose dialog:`, JSON.stringify(inputs, null, 2));
          }
        } catch (listError) {
          log.warn(`[Playwright] Could not list elements: ${listError}`);
        }
      }
      
      return createErrorResponse('NOT_FOUND', `Element ${actualSelector} not found. ${isGmail ? 'Try using list_elements tool to see available fields.' : 'Element may not be visible or may be in a popup/modal.'}`);
    }
    
    // Verify element is still visible and focusable
    const element = await page.$(actualSelector);
    if (!element) {
      log.error(`[Playwright] Element ${actualSelector} not found after wait`);
      return createErrorResponse('NOT_FOUND', `Element ${actualSelector} not found after wait. ${isGmail ? 'Use list_elements tool to discover available fields.' : ''}`);
    }
    
    const isVisible = await element.isVisible();
    if (!isVisible) {
      log.warn(`[Playwright] Element ${actualSelector} exists but is not visible. Attempting to scroll into view...`);
      try {
        await element.scrollIntoViewIfNeeded();
        await new Promise(resolve => setTimeout(resolve, 500));
        // Re-check visibility
        const stillNotVisible = !(await element.isVisible());
        if (stillNotVisible) {
          log.warn(`[Playwright] Element still not visible after scroll. Proceeding anyway...`);
        }
      } catch (scrollError) {
        log.warn(`[Playwright] Scroll failed: ${scrollError}. Proceeding anyway...`);
      }
    }
    
    // For input fields, click first to ensure focus
    const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
    const isInput = ['input', 'textarea'].includes(tagName) || await element.evaluate((el) => el.getAttribute('contenteditable') === 'true');
    
    if (isInput) {
      log.info(`[Playwright] Element is an input field (${tagName}), clicking to ensure focus...`);
      // For Gmail, wait a bit longer and ensure compose dialog is ready
      if (isGmail) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      await element.click({ timeout: 2000 }).catch(() => {
        log.warn(`[Playwright] Click failed, trying focus instead...`);
      });
      await new Promise(resolve => setTimeout(resolve, isGmail ? 300 : 200));
    }
    
    if (useHumanized) {
      // Use humanized typing
      log.info(`[Playwright] Typing "${text.substring(0, 20)}${text.length > 20 ? '...' : ''}" into ${actualSelector} (humanized)`);
      log.info(`[Playwright] Typing character-by-character with natural delays and pauses`);
      await humanizedType(page, actualSelector, text, options?.typeOptions);
      log.info(`[Playwright] Typing completed! Text entered with human-like rhythm.`);
    } else {
      // Fallback to raw typing
      log.info(`[Playwright] Typing "${text.substring(0, 20)}${text.length > 20 ? '...' : ''}" into ${actualSelector} (raw)`);
      await page.focus(actualSelector);
      await page.fill(actualSelector, '');
      await page.type(actualSelector, text, { delay: 50 + Math.random() * 100 });
    }
    
    // Verify text was actually entered (for input/textarea elements)
    if (isInput && tagName !== 'div') {
      try {
        const enteredValue = await element.inputValue();
        if (enteredValue !== text) {
          log.warn(`[Playwright] Text mismatch! Expected: "${text}", Got: "${enteredValue}". Retrying...`);
          // Retry with more aggressive approach
          await element.click();
          await page.keyboard.press('Control+A');
          await page.keyboard.type(text, { delay: 30 });
          await new Promise(resolve => setTimeout(resolve, 300));
          const retryValue = await element.inputValue();
          if (retryValue !== text) {
            log.error(`[Playwright] Text still not matching after retry. Expected: "${text}", Got: "${retryValue}"`);
          } else {
            log.info(`[Playwright] Text successfully entered after retry`);
          }
        } else {
          log.info(`[Playwright] Verified text was entered correctly: "${enteredValue.substring(0, 30)}${enteredValue.length > 30 ? '...' : ''}"`);
        }
      } catch (verifyError) {
        log.warn(`[Playwright] Could not verify text entry: ${verifyError}`);
      }
    }
    
    logAction('type', windowId, { selector: actualSelector, textLength: text.length, humanized: useHumanized });
    log.info(`[Playwright] Successfully typed into ${actualSelector}`);
    
    return createSuccessResponse(null);
  } catch (error: any) {
    log.error(`[Playwright] Error typing into ${selector} in ${windowId}:`, error);
    if (error instanceof Error && error.message.includes('timeout')) {
      const isGmail = page.url().includes('mail.google.com');
      const suggestion = isGmail 
        ? ' Use list_elements tool to discover available input fields in the Gmail compose dialog.'
        : ' If this is in a popup/modal, ensure it has appeared. Use list_elements to see available elements.';
      return createErrorResponse('TIMEOUT', `Element not found or not visible: ${selector}.${suggestion}`);
    }
    
    // Handle humanizedType errors
    if (error.code && error.message) {
      return createErrorResponse(error.code, error.message);
    }
    
    const isGmail = page.url().includes('mail.google.com');
    const suggestion = isGmail 
      ? ' Try using list_elements tool to discover the correct selector for Gmail compose fields.'
      : ' Use list_elements tool to see available elements on the page.';
    return createErrorResponse('INTERNAL', `Type failed: ${error instanceof Error ? error.message : String(error)}.${suggestion}`);
  }
}

/**
 * Take a screenshot
 */
export async function screenshot(
  windowId: string,
  options?: { fullPage?: boolean }
): Promise<ApiResponse<ScreenshotResult>> {
  const page = pageMap.get(windowId);
  if (!page) {
    return createErrorResponse('NOT_FOUND', `Page for windowId ${windowId} not found`);
  }
  
  if (!checkRateLimit(windowId)) {
    return createErrorResponse('THROTTLED', 'Rate limit exceeded');
  }
  
  try {
    const buffer = await page.screenshot({
      fullPage: options?.fullPage ?? false,
      type: 'png'
    });
    
    const imageBase64 = buffer.toString('base64');
    const viewport = page.viewportSize();
    
    logAction('screenshot', windowId, { fullPage: options?.fullPage });
    
    return createSuccessResponse<ScreenshotResult>({
      imageBase64,
      width: viewport?.width ?? 1280,
      height: viewport?.height ?? 720
    });
  } catch (error) {
    log.error(`[Playwright] Error taking screenshot for ${windowId}:`, error);
    return createErrorResponse('INTERNAL', `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Wait for popup/modal to appear
 * Useful after clicking buttons that open popups (like Gmail Compose)
 */
export async function waitForPopup(
  windowId: string,
  options?: { timeout?: number; popupSelector?: string }
): Promise<ApiResponse<{ found: boolean; selector?: string }>> {
  const page = pageMap.get(windowId);
  if (!page) {
    return createErrorResponse('NOT_FOUND', `Page for windowId ${windowId} not found`);
  }
  
  if (!checkRateLimit(windowId)) {
    return createErrorResponse('THROTTLED', 'Rate limit exceeded');
  }
  
  const timeout = options?.timeout ?? 5000;
  if (timeout < 1000 || timeout > 30000) {
    return createErrorResponse('INVALID_ARG', 'Timeout must be between 1000 and 30000ms');
  }
  
  try {
    const popupSelectors = options?.popupSelector 
      ? [options.popupSelector]
      : [
          '[role="dialog"]',
          '.modal',
          '.popup',
          '[class*="modal"]',
          '[class*="popup"]',
          '[class*="dialog"]',
          '[class*="overlay"]',
          '[class*="compose"]', // Gmail-specific
          '[aria-label*="compose" i]', // Gmail-specific
          '[aria-label*="Compose"]', // Gmail-specific
          '[data-tooltip*="compose" i]' // Gmail-specific
        ];
    
    for (const selector of popupSelectors) {
      try {
        await page.waitForSelector(selector, { state: 'visible', timeout });
        log.info(`[Playwright] Popup found: ${selector}`);
        // Wait a bit more for content to fully render
        await new Promise(resolve => setTimeout(resolve, 500));
        
        logAction('waitForPopup', windowId, { selector, found: true });
        
        return createSuccessResponse({ found: true, selector });
      } catch {
        continue;
      }
    }
    
    logAction('waitForPopup', windowId, { found: false });
    return createSuccessResponse({ found: false });
  } catch (error) {
    log.error(`[Playwright] Error waiting for popup in ${windowId}:`, error);
    return createErrorResponse('INTERNAL', `Failed to wait for popup: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get DOM snapshot
 */
export async function getDomSnapshot(
  windowId: string,
  options?: { selector?: string }
): Promise<ApiResponse<string>> {
  const page = pageMap.get(windowId);
  if (!page) {
    return createErrorResponse('NOT_FOUND', `Page for windowId ${windowId} not found`);
  }
  
  if (!checkRateLimit(windowId)) {
    return createErrorResponse('THROTTLED', 'Rate limit exceeded');
  }
  
  try {
    let html: string;
    
    if (options?.selector) {
      if (!validateSelector(options.selector)) {
        return createErrorResponse('INVALID_ARG', 'Invalid or unsafe selector');
      }
      
      const element = await page.$(options.selector);
      if (!element) {
        return createErrorResponse('NOT_FOUND', `Element with selector ${options.selector} not found`);
      }
      
      html = await element.evaluate(el => el.outerHTML);
    } else {
      html = await page.content();
    }
    
    logAction('getDomSnapshot', windowId, { selector: options?.selector });
    
    return createSuccessResponse(html);
  } catch (error) {
    log.error(`[Playwright] Error getting DOM snapshot for ${windowId}:`, error);
    return createErrorResponse('INTERNAL', `DOM snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

