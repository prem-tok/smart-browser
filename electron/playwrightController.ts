/**
 * Playwright Controller
 * Manages Playwright browser instances and provides secure DOM-level actions
 */

import { chromium, type Browser, type Page, type BrowserContext, type CDPSession } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, type WebContentsView } from 'electron';
import log from 'electron-log';
import type { OverlayOptions } from 'sharp';
import { humanizedClick, humanizedType, humanizedScrollTo, humanizedMoveTo, generateGhostPath, type HumanOptions, type TypeOptions, type ScrollOptions } from './humanCursor';
import { analyzeScreenshot, type VisionAnalysisResult } from './services/vision-analyzer';
import { analyzeScreenshotWithLLM, type LLMVisionAnalysisResult } from './services/llm-vision-analyzer';
import { getActionIndicator } from './services/action-indicator';
// windowContextManager will be imported dynamically to avoid build issues

// Types
export interface PageInfo {
  windowId: string;
  url: string;
}

export interface ElementDescriptor {
  index?: number;  // Element index for EKO framework compatibility
  selector: string;
  innerText: string;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  tagName?: string;
  type?: string;
  role?: string;
  ariaLabel?: string;
  name?: string;
  id?: string;
  className?: string;
  href?: string;
  placeholder?: string;
  isVisible?: boolean;
  isEnabled?: boolean;
  isClickable?: boolean;
  suggestedSelector?: string;
  label?: string;  // Visual label for element (e.g., "Button 0", "Input 1")
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
const DEFAULT_ELEMENT_LIMIT = 200;
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second
const RATE_LIMIT_MAX_ACTIONS = 10; // 10 actions per second
const SELECTOR_MAX_LENGTH = 1000;
const TEXT_MAX_LENGTH = 10000;

// State
let browser: Browser | null = null;
const pageMap = new Map<string, Page>();
const contextMap = new Map<string, BrowserContext>();
const rateLimiters = new Map<string, RateLimiter>();
const cdpSessionMap = new Map<string, CDPSession>(); // CDP sessions for direct CDP access
const detailViewCdpMap = new Map<string, any>(); // CDP sessions for detailView (WebContentsView)

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
  // This is more reliable than looking for dialog containers
  try {
    // Check if compose window exists by looking for the "To" field
    // Use waitForSelector with longer timeout for better reliability
    const toField = await page.waitForSelector('input[aria-label*="To" i], input[aria-label*="Recipients" i]', {
      state: 'visible',
      timeout: Math.min(timeout, 4000)
    }).catch(() => null);
    
    if (toField) {
      const isVisible = await toField.isVisible().catch(() => false);
      if (isVisible) {
        // If To field is visible, compose window is likely present
        // Don't require dialog parent - Gmail compose might not always have role="dialog"
        log.info(`[Playwright] Gmail compose component detected via visible To field`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return true;
      }
      
      // Even if not visible, check if it exists in DOM (might be in a hidden dialog that's loading)
      const boundingBox = await toField.boundingBox().catch(() => null);
      if (boundingBox && (boundingBox.width > 0 || boundingBox.height > 0)) {
        log.info(`[Playwright] Gmail compose To field found in DOM (may be loading)`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        return true;
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
 * Get all interactive elements with indexes using CDP accessibility tree (like BrowserOS)
 * Returns elements sorted by visual position (top-to-bottom, left-to-right)
 * This approach is more comprehensive than CSS selectors and catches elements that
 * might be missed by DOM queries (e.g., shadow DOM, dynamic content, complex SPAs)
 */
async function getAllInteractiveElementsWithIndexes(
  page: Page
): Promise<Array<{
  index: number;
  selector: string;
  element: any;  // Playwright ElementHandle
  info: {
    tagName: string;
    innerText: string;
    boundingBox: { x: number; y: number; width: number; height: number } | null;
    type?: string;
    role?: string;
    ariaLabel?: string;
    name?: string;
    id?: string;
    className?: string;
    href?: string;
    placeholder?: string;
    isVisible?: boolean;
    isEnabled?: boolean;
    isClickable?: boolean;
    suggestedSelector?: string;
  };
}>> {
  // Try CDP accessibility tree first (like BrowserOS)
  // Use CDP to get accessibility tree, then query DOM using the information
  try {
    const context = page.context();
    const cdpSession = await context.newCDPSession(page);
    
    try {
      // Enable accessibility domain
      await cdpSession.send('Accessibility.enable');
      await cdpSession.send('DOM.enable');
      
      // Get full accessibility tree
      const accessibilityTree = await cdpSession.send('Accessibility.getFullAXTree');
      
      if (accessibilityTree?.nodes && accessibilityTree.nodes.length > 0) {
        const interactiveNodes: Array<{
          nodeId: string;
          role: string;
          name?: string;
          value?: string;
          backendDOMNodeId?: number;
          properties?: Array<{ name: string; value: { type: string; value: any } }>;
        }> = [];
        
        // Filter for interactive elements (similar to BrowserOS)
        for (const node of accessibilityTree.nodes) {
          const role = node.role?.value || '';
          const name = node.name?.value || '';
          
          // Categorize as clickable, typeable, or selectable (like BrowserOS)
          const isClickable = role === 'button' || role === 'link' || role === 'menuitem' || 
                             role === 'tab' || role === 'checkbox' || role === 'radio' ||
                             role === 'switch' || role === 'option';
          
          const isTypeable = role === 'textbox' || role === 'combobox' || role === 'searchbox' ||
                            role === 'spinbutton';
          
          const isSelectable = role === 'listbox' || role === 'menu' || role === 'menubar';
          
          if (isClickable || isTypeable || isSelectable) {
            // Extract properties
            const properties: Record<string, any> = {};
            if (node.properties) {
              for (const prop of node.properties) {
                if (prop.value?.value !== undefined) {
                  properties[prop.name] = prop.value.value;
                }
              }
            }
            
            interactiveNodes.push({
              nodeId: node.nodeId,
              role,
              name,
              value: node.value?.value,
              backendDOMNodeId: node.backendDOMNodeId,
              properties: node.properties
            });
          }
        }
        
        log.info(`[Playwright] Found ${interactiveNodes.length} interactive elements via CDP accessibility tree`);
        
        // Now query DOM using the accessibility information
        // Use a simpler approach: get bounding boxes from CDP, then query DOM by position/selector
        const uniqueElements: Array<{
          handle: any;
          info: any;
          boundingBox: { x: number; y: number; width: number; height: number } | null;
        }> = [];
        
        const seenKeys = new Set<string>();
        let successfulMappings = 0;
        let failedMappings = 0;
        
        for (const axNode of interactiveNodes) {
          try {
            // Extract properties first
            const properties: Record<string, any> = {};
            if (axNode.properties) {
              for (const prop of axNode.properties) {
                if (prop.value?.value !== undefined) {
                  properties[prop.name] = prop.value.value;
                }
              }
            }
            
            // Get bounding box directly from backendNodeId
            let boundingBox: { x: number; y: number; width: number; height: number } | null = null;
            let elementHandle: any = null;
            
            if (axNode.backendDOMNodeId) {
              try {
                // Get box model directly using backendNodeId
                const boxModel = await cdpSession.send('DOM.getBoxModel', {
                  backendNodeId: axNode.backendDOMNodeId
                });
                
                if (boxModel?.model?.content && boxModel.model.content.length >= 8) {
                  const content = boxModel.model.content;
                  const x = Math.min(...[content[0], content[2], content[4], content[6]]);
                  const y = Math.min(...[content[1], content[3], content[5], content[7]]);
                  const width = Math.max(...[content[0], content[2], content[4], content[6]]) - x;
                  const height = Math.max(...[content[1], content[3], content[5], content[7]]) - y;
                  
                  if (width > 0 && height > 0) {
                    boundingBox = { x, y, width, height };
                    
                    // Now try to find the element using multiple strategies
                    // Strategy 1: By ID
                    if (properties['id']) {
                      elementHandle = await page.$(`#${properties['id']}`).catch(() => null);
                    }
                    
                    // Strategy 2: By aria-label (exact match)
                    if (!elementHandle && axNode.name) {
                      // Escape special characters in aria-label
                      const escapedName = axNode.name.replace(/"/g, '\\"');
                      elementHandle = await page.$(`[aria-label="${escapedName}"]`).catch(() => null);
                    }
                    
                    // Strategy 3: By aria-label (contains, case-insensitive)
                    if (!elementHandle && axNode.name) {
                      const escapedName = axNode.name.replace(/"/g, '\\"');
                      const allElements = await page.$$(`[aria-label*="${escapedName}" i]`).catch(() => []);
                      // Find the one closest to our bounding box
                      for (const el of allElements) {
                        const box = await el.boundingBox().catch(() => null);
                        if (box && Math.abs(box.x - x) < 10 && Math.abs(box.y - y) < 10) {
                          elementHandle = el;
                          break;
                        }
                      }
                    }
                    
                    // Strategy 4: By role and text content
                    if (!elementHandle && axNode.role && axNode.name) {
                      const roleElements = await page.$$(`[role="${axNode.role}"]`).catch(() => []);
                      for (const el of roleElements) {
                        const text = await el.textContent().catch(() => '');
                        const ariaLabel = await el.getAttribute('aria-label').catch(() => '');
                        if ((text && text.trim() === axNode.name.trim()) || 
                            (ariaLabel && ariaLabel === axNode.name)) {
                          const box = await el.boundingBox().catch(() => null);
                          if (box && Math.abs(box.x - x) < 20 && Math.abs(box.y - y) < 20) {
                            elementHandle = el;
                            break;
                          }
                        }
                      }
                    }
                    
                    // Strategy 5: Query by coordinates (enhanced - walk up DOM tree to find interactive element)
                    if (!elementHandle && boundingBox) {
                      // Use evaluate to find element at coordinates and walk up to find interactive parent
                      elementHandle = await page.evaluateHandle(({ x, y, w, h }) => {
                        const centerX = x + w / 2;
                        const centerY = y + h / 2;
                        let el = document.elementFromPoint(centerX, centerY);
                        
                        if (!el) return null;
                        
                        // Walk up the DOM tree to find interactive element
                        let current: Element | null = el;
                        let depth = 0;
                        const maxDepth = 10; // Prevent infinite loops
                        
                        while (current && depth < maxDepth) {
                          const tag = current.tagName.toUpperCase();
                          const role = current.getAttribute('role')?.toLowerCase() || '';
                          const hasClickHandler = (current as any).onclick !== null;
                          const hasTabIndex = current.hasAttribute('tabindex');
                          const isContentEditable = (current as HTMLElement).isContentEditable;
                          
                          // Check if this element is interactive
                          if (['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(tag) ||
                              ['button', 'link', 'textbox', 'combobox', 'option', 'menuitem'].includes(role) ||
                              hasClickHandler || hasTabIndex || isContentEditable) {
                            return current;
                          }
                          
                          // Also check if element has interactive children (for complex components)
                          const hasInteractiveChild = Array.from(current.children).some(child => {
                            const childTag = child.tagName.toUpperCase();
                            const childRole = child.getAttribute('role')?.toLowerCase() || '';
                            return ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'].includes(childTag) ||
                                   ['button', 'link', 'textbox', 'combobox'].includes(childRole);
                          });
                          
                          if (hasInteractiveChild) {
                            return current; // Return parent container
                          }
                          
                          current = current.parentElement;
                          depth++;
                        }
                        
                        // If we didn't find interactive element, return original (might be clickable via JS)
                        return el;
                      }, { x, y, w: width, h: height }).catch(() => null);
                      
                      // Don't reject elements - even if not "traditionally" interactive, they might be clickable
                      // The accessibility tree already identified them as interactive
                    }
                    
                    // Build unique key
                    const uniqueKey = `${axNode.role}:${axNode.name || ''}:${Math.round(x)}:${Math.round(y)}`;
                    
                    if (!seenKeys.has(uniqueKey)) {
                      seenKeys.add(uniqueKey);
                      
                      if (elementHandle) {
                        successfulMappings++;
                        // Get full element info
                        const elementInfo = await elementHandle.evaluate((el: Element) => {
                          return {
                            tagName: el.tagName.toLowerCase(),
                            type: (el as HTMLElement).getAttribute('type') || undefined,
                            role: el.getAttribute('role') || undefined,
                            ariaLabel: el.getAttribute('aria-label') || undefined,
                            name: (el as HTMLInputElement).name || undefined,
                            id: el.id || undefined,
                            className: el.className || undefined,
                            href: (el as HTMLAnchorElement).href || undefined,
                            placeholder: (el as HTMLInputElement).placeholder || undefined,
                            innerText: el.textContent?.trim() || '',
                            isVisible: (el as HTMLElement).offsetParent !== null,
                            isEnabled: !(el as HTMLInputElement).disabled,
                            isClickable: el.tagName === 'BUTTON' || el.tagName === 'A' || 
                                        el.getAttribute('role') === 'button',
                            suggestedSelector: el.id ? `#${el.id}` :
                                              el.getAttribute('aria-label') ? `[aria-label="${el.getAttribute('aria-label')}"]` :
                                              el.tagName.toLowerCase()
                          };
                        }).catch(() => null);
                        
                        if (elementInfo) {
                          const isVisible = await elementHandle.isVisible().catch(() => false);
                          if (isVisible) {
                            uniqueElements.push({
                              handle: elementHandle,
                              info: {
                                ...elementInfo,
                                isVisible: true
                              },
                              boundingBox
                            });
                          }
                        }
                      } else {
                        // No handle found via strategies, but we have bounding box and info
                        // Try coordinate-based mapping as last resort (should have been tried in Strategy 5)
                        if (boundingBox && !elementHandle) {
                          try {
                            elementHandle = await page.evaluateHandle(({ x, y, w, h }) => {
                              const centerX = x + w / 2;
                              const centerY = y + h / 2;
                              return document.elementFromPoint(centerX, centerY);
                            }, { x, y, w: width, h: height }).catch(() => null);
                            
                            if (elementHandle) {
                              // Verify it's a valid element handle
                              const isValid = await elementHandle.evaluate((el: Element) => {
                                return el && el.nodeType === 1; // ELEMENT_NODE
                              }).catch(() => false);
                              
                              if (!isValid) {
                                elementHandle = null;
                              }
                            }
                          } catch (coordError) {
                            // Ignore coordinate errors
                          }
                        }
                        
                        if (elementHandle) {
                          successfulMappings++;
                          // Get full element info
                          const elementInfo = await elementHandle.evaluate((el: Element) => {
                            return {
                              tagName: el.tagName.toLowerCase(),
                              type: (el as HTMLElement).getAttribute('type') || undefined,
                              role: el.getAttribute('role') || undefined,
                              ariaLabel: el.getAttribute('aria-label') || undefined,
                              name: (el as HTMLInputElement).name || undefined,
                              id: el.id || undefined,
                              className: el.className || undefined,
                              href: (el as HTMLAnchorElement).href || undefined,
                              placeholder: (el as HTMLInputElement).placeholder || undefined,
                              innerText: el.textContent?.trim() || '',
                              isVisible: (el as HTMLElement).offsetParent !== null,
                              isEnabled: !(el as HTMLInputElement).disabled,
                              isClickable: el.tagName === 'BUTTON' || el.tagName === 'A' || 
                                          el.getAttribute('role') === 'button' ||
                                          el.hasAttribute('onclick') ||
                                          el.hasAttribute('tabindex'),
                              suggestedSelector: el.id ? `#${el.id}` :
                                                el.getAttribute('aria-label') ? `[aria-label="${el.getAttribute('aria-label')}"]` :
                                                el.tagName.toLowerCase()
                            };
                          }).catch(() => null);
                          
                          if (elementInfo) {
                            const isVisible = await elementHandle.isVisible().catch(() => false);
                            if (isVisible) {
                              uniqueElements.push({
                                handle: elementHandle,
                                info: {
                                  ...elementInfo,
                                  isVisible: true
                                },
                                boundingBox
                              });
                            }
                          }
                        } else {
                          // Still no handle, but add element with bounding box info (agent can still use coordinates)
                          failedMappings++;
                          uniqueElements.push({
                            handle: null,
                            info: {
                              tagName: properties['tag'] || axNode.role || 'div',
                              type: properties['type'] || undefined,
                              role: axNode.role,
                              ariaLabel: axNode.name || properties['aria-label'] || undefined,
                              name: properties['name'] || undefined,
                              id: properties['id'] || undefined,
                              className: properties['class'] || undefined,
                              href: properties['href'] || undefined,
                              placeholder: properties['placeholder'] || undefined,
                              innerText: axNode.name || axNode.value || '',
                              isVisible: true,
                              isEnabled: properties['disabled'] !== 'true',
                              isClickable: axNode.role === 'button' || axNode.role === 'link' || axNode.role === 'textbox',
                              suggestedSelector: properties['id'] ? `#${properties['id']}` : 
                                               axNode.name ? `[aria-label="${axNode.name}"]` :
                                               `[role="${axNode.role}"]`
                            },
                            boundingBox
                          });
                        }
                      }
                    }
                  }
                }
              } catch (boxError) {
                failedMappings++;
                continue;
              }
            }
          } catch (nodeError) {
            failedMappings++;
            continue;
          }
        }
        
        log.info(`[Playwright] CDP mapping: ${successfulMappings} successful, ${failedMappings} failed, ${uniqueElements.length} total elements`);
        
        await cdpSession.send('Accessibility.disable');
        await cdpSession.send('DOM.disable');
        await cdpSession.detach();
        
        // If we got good results from CDP, use them
        if (uniqueElements.length > 0) {
          log.info(`[Playwright] Successfully extracted ${uniqueElements.length} elements from accessibility tree`);
          
          // If we found very few elements (less than 10), supplement with DOM-based detection
          if (uniqueElements.length < 10) {
            log.warn(`[Playwright] CDP found only ${uniqueElements.length} elements, supplementing with DOM-based detection`);
            
            try {
              // Get additional elements via DOM queries
              const domSelectors = [
                'button', 'a[href]', 'input', 'textarea', 'select',
                '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="combobox"]',
                '[contenteditable="true"]', '[onclick]', '[tabindex]:not([tabindex="-1"])'
              ];
              
              const domHandles: any[] = [];
              for (const selector of domSelectors) {
                try {
                  const handles = await page.$$(selector);
                  domHandles.push(...handles);
                } catch {
                  continue;
                }
              }
              
              // Add DOM elements that aren't already in uniqueElements
              const existingCoords = new Set(
                uniqueElements
                  .filter(e => e.boundingBox)
                  .map(e => `${Math.round(e.boundingBox!.x)},${Math.round(e.boundingBox!.y)}`)
              );
              
              for (const handle of domHandles) {
                try {
                  const box = await handle.boundingBox().catch(() => null);
                  if (!box || box.width === 0 || box.height === 0) continue;
                  
                  const coordKey = `${Math.round(box.x)},${Math.round(box.y)}`;
                  if (existingCoords.has(coordKey)) continue; // Already have this element
                  
                  const isVisible = await handle.isVisible().catch(() => false);
                  if (!isVisible) continue;
                  
                  const elementInfo = await handle.evaluate((el: Element) => {
                    return {
                      tagName: el.tagName.toLowerCase(),
                      type: (el as HTMLElement).getAttribute('type') || undefined,
                      role: el.getAttribute('role') || undefined,
                      ariaLabel: el.getAttribute('aria-label') || undefined,
                      name: (el as HTMLInputElement).name || undefined,
                      id: el.id || undefined,
                      className: el.className || undefined,
                      href: (el as HTMLAnchorElement).href || undefined,
                      placeholder: (el as HTMLInputElement).placeholder || undefined,
                      innerText: el.textContent?.trim() || '',
                      isVisible: (el as HTMLElement).offsetParent !== null,
                      isEnabled: !(el as HTMLInputElement).disabled,
                      isClickable: el.tagName === 'BUTTON' || el.tagName === 'A' || 
                                  el.getAttribute('role') === 'button' ||
                                  el.hasAttribute('onclick') ||
                                  el.hasAttribute('tabindex'),
                      suggestedSelector: el.id ? `#${el.id}` :
                                        el.getAttribute('aria-label') ? `[aria-label="${el.getAttribute('aria-label')}"]` :
                                        el.tagName.toLowerCase()
                    };
                  }).catch(() => null);
                  
                  if (elementInfo) {
                    uniqueElements.push({
                      handle,
                      info: elementInfo,
                      boundingBox: box
                    });
                    existingCoords.add(coordKey);
                  }
                } catch {
                  continue;
                }
              }
              
              log.info(`[Playwright] Added ${uniqueElements.length - successfulMappings - failedMappings} additional elements via DOM detection`);
            } catch (domError) {
              log.warn(`[Playwright] DOM fallback failed: ${domError}`);
            }
          }
          
          // Sort by visual position
          uniqueElements.sort((a, b) => {
            const boxA = a.boundingBox!;
            const boxB = b.boundingBox!;
            if (Math.abs(boxA.y - boxB.y) < 10) {
              return boxA.x - boxB.x;
            }
            return boxA.y - boxB.y;
          });
          
          return uniqueElements.map((item, index) => ({
            index,
            selector: item.info.suggestedSelector || item.info.tagName,
            element: item.handle,
            info: {
              ...item.info,
              boundingBox: item.boundingBox
            }
          }));
        }
      }
    } catch (cdpError) {
      log.warn(`[Playwright] CDP accessibility tree failed, falling back to CSS selectors: ${cdpError}`);
      try {
        const context = page.context();
        const cdpSession = await context.newCDPSession(page);
        await cdpSession.send('Accessibility.disable').catch(() => {});
        await cdpSession.send('DOM.disable').catch(() => {});
        await cdpSession.detach().catch(() => {});
      } catch {}
    }
  } catch (cdpInitError) {
    log.warn(`[Playwright] Failed to create CDP session for accessibility tree: ${cdpInitError}`);
  }
  
  // Fallback to CSS selector-based detection (original implementation)
  log.info(`[Playwright] Using CSS selector-based element detection (fallback)`);
  
  const interactiveSelectors = [
    'button', 'input', 'textarea', 'select', 'a[href]',
    '[role="button"]', '[role="link"]', '[role="textbox"]', '[role="combobox"]',
    '[contenteditable="true"]', '[contenteditable]', '[onclick]', '[tabindex]',
    'div[contenteditable="true"]', 'div[contenteditable]',
    '[aria-label*="To" i]', '[aria-label*="Recipients" i]',
    '[aria-label*="Subject" i]', '[aria-label*="Cc" i]', '[aria-label*="Bcc" i]',
    '[placeholder*="To" i]', '[placeholder*="Recipients" i]',
    '[placeholder*="Subject" i]', '[placeholder*="email" i]',
    'input[type="text"]', 'input[type="email"]', 'input[type="search"]',
    'input[type="tel"]', 'input[type="url"]',
    'div[role="textbox"]', 'div[role="combobox"]',
    '[name]', '[id*="input" i]', '[id*="field" i]', '[id*="email" i]',
    '[class*="input" i]', '[class*="field" i]', '[class*="editor" i]',
    '[class*="compose" i]', '[class*="textarea" i]'
  ];

  const allHandles: any[] = [];
  for (const selector of interactiveSelectors) {
    try {
      const handles = await page.$$(selector);
      allHandles.push(...handles);
    } catch {
      continue;
    }
  }

  const uniqueElements: Array<{
    handle: any;
    info: any;
    boundingBox: { x: number; y: number; width: number; height: number } | null;
  }> = [];

  const seenSelectors = new Set<string>();

  for (const handle of allHandles) {
    try {
      const info = await handle.evaluate((el: Element) => {
        const getSelector = (element: Element): string => {
          if (element.id) return `#${element.id}`;
          if (element.getAttribute('aria-label')) {
            return `[aria-label="${element.getAttribute('aria-label')}"]`;
          }
          if (element.getAttribute('name')) {
            return `${element.tagName.toLowerCase()}[name="${element.getAttribute('name')}"]`;
          }
          if (element.getAttribute('data-testid')) {
            return `[data-testid="${element.getAttribute('data-testid')}"]`;
          }
          if (element.getAttribute('role')) {
            const role = element.getAttribute('role');
            const text = element.textContent?.trim().substring(0, 50);
            if (text) return `[role="${role}"][aria-label*="${text}"]`;
            return `[role="${role}"]`;
          }
          return element.tagName.toLowerCase();
        };

        return {
          tagName: el.tagName.toLowerCase(),
          type: (el as HTMLElement).getAttribute('type') || undefined,
          role: el.getAttribute('role') || undefined,
          ariaLabel: el.getAttribute('aria-label') || undefined,
          name: (el as HTMLInputElement).name || undefined,
          id: el.id || undefined,
          className: el.className || undefined,
          href: (el as HTMLAnchorElement).href || undefined,
          placeholder: (el as HTMLInputElement).placeholder || undefined,
          innerText: el.textContent?.trim() || '',
          isVisible: (el as HTMLElement).offsetParent !== null,
          isEnabled: !(el as HTMLInputElement).disabled,
          isClickable: el.tagName === 'BUTTON' || el.tagName === 'A' || 
                      el.getAttribute('role') === 'button' || 
                      el.getAttribute('onclick') !== null ||
                      (el as HTMLElement).style.cursor === 'pointer',
          suggestedSelector: getSelector(el)
        };
      });

      const boundingBox = await handle.boundingBox();
      
      let isActuallyVisible = false;
      try {
        isActuallyVisible = await handle.isVisible();
      } catch {
        isActuallyVisible = info.isVisible;
      }
      
      if (isActuallyVisible && boundingBox && boundingBox.width > 0 && boundingBox.height > 0) {
        const selector = info.suggestedSelector || 
                        (info.id ? `#${info.id}` : 
                        (info.ariaLabel ? `[aria-label="${info.ariaLabel}"]` : 
                        (info.name ? `${info.tagName}[name="${info.name}"]` : 
                        info.tagName)));
        
        const uniqueKey = `${selector}:${Math.round(boundingBox.x)}:${Math.round(boundingBox.y)}`;
        
        if (!seenSelectors.has(uniqueKey)) {
          seenSelectors.add(uniqueKey);
          uniqueElements.push({
            handle,
            info: {
              ...info,
              isVisible: isActuallyVisible
            },
            boundingBox: {
              x: boundingBox.x,
              y: boundingBox.y,
              width: boundingBox.width,
              height: boundingBox.height
            }
          });
        }
      }
    } catch {
      continue;
    }
  }

  uniqueElements.sort((a, b) => {
    const boxA = a.boundingBox!;
    const boxB = b.boundingBox!;
    if (Math.abs(boxA.y - boxB.y) < 10) {
      return boxA.x - boxB.x;
    }
    return boxA.y - boxB.y;
  });

  return uniqueElements.map((item, index) => ({
    index,
    selector: item.info.suggestedSelector || item.info.tagName,
    element: item.handle,
    info: {
      ...item.info,
      boundingBox: item.boundingBox
    }
  }));
}

/**
 * Generate visual label for element - enhanced for better AI understanding
 */
function generateElementLabel(element: any, index: number): string {
  // Prioritize aria-label (most descriptive)
  if (element.ariaLabel) {
    return element.ariaLabel;
  }
  
  // Check placeholder (common for input fields)
  if (element.placeholder) {
    return element.placeholder;
  }
  
  // Check name attribute
  if (element.name) {
    return `${element.name} input`;
  }
  
  // Check id for common patterns
  if (element.id) {
    const idLower = element.id.toLowerCase();
    if (idLower.includes('email') || idLower.includes('to') || idLower.includes('recipient')) {
      return 'Email/To field';
    }
    if (idLower.includes('subject')) {
      return 'Subject field';
    }
    if (idLower.includes('body') || idLower.includes('message') || idLower.includes('compose')) {
      return 'Message body';
    }
  }
  
  // Check role
  if (element.role === 'textbox' || element.role === 'combobox') {
    if (element.tagName === 'div' || element.tagName === 'p') {
      return 'Text editor';
    }
    return 'Text input';
  }
  
  // Use innerText for buttons and links
  if (element.innerText && element.innerText.length > 0 && element.innerText.length < 50) {
    return element.innerText.trim();
  }
  
  // Fallback to tag name + index
  return `${element.tagName || 'element'} ${index}`;
  if (element.id) return `#${element.id}`;
  if (element.name) return `${element.tagName}[name="${element.name}"]`;
  return `${element.tagName} ${index}`;
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
    
    // Create CDP session for direct CDP access (like Comet browser)
    try {
      const cdpSession = await context.newCDPSession(page);
      cdpSessionMap.set(windowId, cdpSession);
      log.debug(`[Playwright] CDP session created for windowId: ${windowId}`);
    } catch (cdpError) {
      log.warn(`[Playwright] Failed to create CDP session for ${windowId}:`, cdpError);
      // Continue without CDP - will use Playwright fallback
    }
    
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
 * Get a Playwright page by windowId (internal use)
 */
export function getPage(windowId: string): Page | undefined {
  return pageMap.get(windowId);
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
    // Clean up CDP session
    const cdpSession = cdpSessionMap.get(windowId);
    if (cdpSession) {
      try {
        await cdpSession.detach();
      } catch (error) {
        log.warn(`[Playwright] Error detaching CDP session for ${windowId}:`, error);
      }
      cdpSessionMap.delete(windowId);
    }
    
    // Clean up detailView CDP session
    const detailViewCdp = detailViewCdpMap.get(windowId);
    if (detailViewCdp?.attached) {
      try {
        detailViewCdp.webContents.debugger.detach();
        log.info(`[Playwright] CDP debugger detached from detailView for ${windowId}`);
      } catch (error) {
        log.warn(`[Playwright] Error detaching detailView CDP for ${windowId}:`, error);
      }
      detailViewCdpMap.delete(windowId);
    }
    
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
    // Use longer timeout for complex pages like Gmail
    const timeout = url.includes('mail.google.com') ? 30000 : 15000;
    
    // Wait for page to load - use 'load' for better reliability
    await page.goto(url, { 
      waitUntil: 'load',
      timeout 
    });
    
    // Additional wait for dynamic content (especially for Gmail)
    if (url.includes('mail.google.com')) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      // Wait for Gmail to be interactive
      try {
        await page.waitForSelector('body', { state: 'visible', timeout: 5000 });
      } catch {
        // Body should be there, but continue anyway
      }
    }
    
    const currentUrl = page.url();
    logAction('goto', windowId, { url: currentUrl });
    
    return createSuccessResponse<PageInfo>({
      windowId,
      url: currentUrl
    });
  } catch (error) {
    log.error(`[Playwright] Error navigating ${windowId} to ${url}:`, error);
    // Even if navigation times out, return success if we're on the right domain
    const currentUrl = page.url();
    if (currentUrl.includes(new URL(url).hostname)) {
      log.warn(`[Playwright] Navigation timeout but page is on correct domain: ${currentUrl}`);
      return createSuccessResponse<PageInfo>({
        windowId,
        url: currentUrl
      });
    }
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
      
      // Get all interactive elements with indexes for reference
      const allIndexedElements = await getAllInteractiveElementsWithIndexes(page);
      const indexedMap = new Map<string, number>();
      allIndexedElements.forEach(item => {
        indexedMap.set(item.selector, item.index);
      });
      
      for (const handle of limitedHandles) {
        try {
          // Extract comprehensive element information
          const elementInfo = await handle.evaluate((el) => {
            const getSelector = (element: Element): string => {
              // Generate best selector for element
              if (element.id) return `#${element.id}`;
              if (element.getAttribute('aria-label')) {
                return `[aria-label="${element.getAttribute('aria-label')}"]`;
              }
              if (element.getAttribute('name')) {
                return `${element.tagName.toLowerCase()}[name="${element.getAttribute('name')}"]`;
              }
              if (element.getAttribute('data-testid')) {
                return `[data-testid="${element.getAttribute('data-testid')}"]`;
              }
              if (element.getAttribute('role')) {
                const role = element.getAttribute('role');
                const text = element.textContent?.trim().substring(0, 50);
                if (text) return `[role="${role}"][aria-label*="${text}"]`;
                return `[role="${role}"]`;
              }
              return element.tagName.toLowerCase();
            };

            return {
              tagName: el.tagName.toLowerCase(),
              type: (el as HTMLElement).getAttribute('type') || undefined,
              role: el.getAttribute('role') || undefined,
              ariaLabel: el.getAttribute('aria-label') || undefined,
              name: (el as HTMLInputElement).name || undefined,
              id: el.id || undefined,
              className: el.className || undefined,
              href: (el as HTMLAnchorElement).href || undefined,
              placeholder: (el as HTMLInputElement).placeholder || undefined,
              innerText: el.textContent?.trim() || '',
              isVisible: (el as HTMLElement).offsetParent !== null,
              isEnabled: !(el as HTMLInputElement).disabled,
              isClickable: el.tagName === 'BUTTON' || el.tagName === 'A' || 
                          el.getAttribute('role') === 'button' || 
                          el.getAttribute('onclick') !== null ||
                          (el as HTMLElement).style.cursor === 'pointer',
              suggestedSelector: getSelector(el)
            };
          });

          const boundingBox = await handle.boundingBox();
          const suggestedSelector = elementInfo.suggestedSelector;
          const elementIndex = indexedMap.get(suggestedSelector);
          
          elements.push({
            index: elementIndex,
            selector,
            innerText: elementInfo.innerText.substring(0, 500),
            boundingBox: boundingBox ? {
              x: boundingBox.x,
              y: boundingBox.y,
              width: boundingBox.width,
              height: boundingBox.height
            } : null,
            tagName: elementInfo.tagName,
            type: elementInfo.type,
            role: elementInfo.role,
            ariaLabel: elementInfo.ariaLabel,
            name: elementInfo.name,
            id: elementInfo.id,
            className: elementInfo.className,
            href: elementInfo.href,
            placeholder: elementInfo.placeholder,
            isVisible: elementInfo.isVisible,
            isEnabled: elementInfo.isEnabled,
            isClickable: elementInfo.isClickable,
            suggestedSelector: suggestedSelector,
            label: elementIndex !== undefined ? generateElementLabel(elementInfo, elementIndex) : undefined
          });
        } catch (error) {
          // Skip elements that can't be read
          continue;
        }
      }
    } else {
      // List all interactive elements with indexes (for EKO framework compatibility)
      const indexedElements = await getAllInteractiveElementsWithIndexes(page);
      const limitedElements = indexedElements.slice(0, limit);
      
      for (const item of limitedElements) {
        elements.push({
          index: item.index,
          selector: item.selector,
          innerText: item.info.innerText.substring(0, 500),
          boundingBox: item.info.boundingBox,
          tagName: item.info.tagName,
          type: item.info.type,
          role: item.info.role,
          ariaLabel: item.info.ariaLabel,
          name: item.info.name,
          id: item.info.id,
          className: item.info.className,
          href: item.info.href,
          placeholder: item.info.placeholder,
          isVisible: item.info.isVisible,
          isEnabled: item.info.isEnabled,
          isClickable: item.info.isClickable,
          suggestedSelector: item.info.suggestedSelector,
          label: generateElementLabel(item.info, item.index)
        });
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
      
      // First, ensure compose dialog is ready - but be more lenient
      // If compose window appears but detection fails, still try to proceed
      const composeReady = await waitForGmailComposeComponent(page, 5000);
      if (!composeReady) {
        log.warn(`[Playwright] Gmail compose dialog not detected via standard methods. Checking for input fields directly...`);
        // Try a more lenient check - just look for the To field anywhere on page
        try {
          const toField = await page.waitForSelector('input[aria-label*="To" i], input[aria-label*="Recipients" i]', { 
            state: 'visible', 
            timeout: 3000 
          });
          if (toField) {
            log.info(`[Playwright] Found To field directly - compose window is likely present`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch {
          log.warn(`[Playwright] To field also not found, but proceeding anyway - user may have compose window open`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
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
        // Use humanized scrolling if enabled
        const useHumanized = options?.humanized !== false;
        if (useHumanized) {
          log.info(`[Playwright] Using humanized scroll to bring element into view`);
          await humanizedScrollTo(page, actualSelector, {
            steps: 8,
            minDelay: 10,
            maxDelay: 30
          });
        } else {
          await element.scrollIntoViewIfNeeded();
        }
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
      // Use humanized click for focus (if enabled)
      if (useHumanized) {
        const clickResult = await humanizedClick(page, actualSelector, { 
          steps: 10, 
          minDelay: 5, 
          maxDelay: 15 
        });
        if (!clickResult.ok) {
          log.warn(`[Playwright] Humanized click failed, trying focus instead...`);
          await page.focus(actualSelector);
        }
      } else {
        await element.click({ timeout: 2000 }).catch(() => {
          log.warn(`[Playwright] Click failed, trying focus instead...`);
          page.focus(actualSelector);
        });
      }
      await new Promise(resolve => setTimeout(resolve, isGmail ? 300 : 200));
    }
    
    if (useHumanized) {
      // Use humanized typing
      log.info(`[Playwright] Typing "${text.substring(0, 20)}${text.length > 20 ? '...' : ''}" into ${actualSelector} (humanized)`);
      log.info(`[Playwright] Typing character-by-character with natural delays and pauses`);
      await humanizedType(page, actualSelector, text, options?.typeOptions);
      log.info(`[Playwright] Typing completed! Text entered with human-like rhythm.`);
    } else {
      // Fallback to raw typing (only if humanized is explicitly disabled)
      log.info(`[Playwright] Typing "${text.substring(0, 20)}${text.length > 20 ? '...' : ''}" into ${actualSelector} (raw - humanized disabled)`);
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
          // Retry with more aggressive approach using humanized methods
          if (useHumanized) {
            const retryClickResult = await humanizedClick(page, actualSelector, { 
              steps: 8, 
              minDelay: 5, 
              maxDelay: 10 
            });
            if (retryClickResult.ok) {
              await page.keyboard.press('Control+A');
              await humanizedType(page, actualSelector, text, { 
                minDelay: 20, 
                maxDelay: 60,
                clearFirst: false 
              });
            } else {
              // Fallback to raw if humanized fails
              await element.click();
              await page.keyboard.press('Control+A');
              await page.keyboard.type(text, { delay: 30 });
            }
          } else {
            await element.click();
            await page.keyboard.press('Control+A');
            await page.keyboard.type(text, { delay: 30 });
          }
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
 * Click element by index (EKO framework compatible)
 * Uses element index from screenshot_and_html() or list_elements()
 */
export async function clickElementByIndex(
  windowId: string,
  index: number,
  options?: { timeout?: number; humanized?: boolean; humanOptions?: HumanOptions }
): Promise<ApiResponse> {
  const page = pageMap.get(windowId);
  if (!page) {
    return createErrorResponse('NOT_FOUND', `Page for windowId ${windowId} not found`);
  }

  if (!checkRateLimit(windowId)) {
    return createErrorResponse('THROTTLED', 'Rate limit exceeded');
  }

  if (index < 0) {
    return createErrorResponse('INVALID_ARG', 'Element index must be non-negative');
  }

  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const useHumanized = options?.humanized !== false;
  const humanOptions: HumanOptions = {
    forceRaw: !useHumanized,
    steps: options?.humanOptions?.steps ?? 20,
    jitter: options?.humanOptions?.jitter ?? 4,
    minDelay: options?.humanOptions?.minDelay ?? 8,
    maxDelay: options?.humanOptions?.maxDelay ?? 35,
    moveStrategy: options?.humanOptions?.moveStrategy ?? 'bezier',
    ...options?.humanOptions
  };

  try {
    // Use the same element detection logic as getAllInteractiveElementsWithIndexes for consistency
    const indexedElements = await getAllInteractiveElementsWithIndexes(page);
    
    if (index >= indexedElements.length) {
      log.warn(`[Playwright] Element index ${index} out of range. Available elements: ${indexedElements.length}`);
      return createErrorResponse('NOT_FOUND', 
        `Element with index ${index} not found. Available indexes: 0-${indexedElements.length - 1}. Use screenshot_and_html() to get current element indexes.`);
    }

    const elementItem = indexedElements[index];
    const elementData = {
      selector: elementItem.selector,
      boundingBox: elementItem.info.boundingBox
    };
    
    log.info(`[Playwright] Element at index ${index}:`, {
      selector: elementData.selector,
      tagName: elementItem.info.tagName,
      ariaLabel: elementItem.info.ariaLabel,
      placeholder: elementItem.info.placeholder,
      innerText: elementItem.info.innerText.substring(0, 50)
    });

    if (!elementData) {
      return createErrorResponse('NOT_FOUND', `Element with index ${index} not found. Use screenshot_and_html() to get current element indexes.`);
    }

    // Show visual feedback (like Comet browser's headed mode)
    // Pass windowId to ActionIndicator so it can restrict overlay to detailView bounds
    const actionIndicator = getActionIndicator({ windowId });
    actionIndicator.setWindowId(windowId); // Ensure bounds are updated
    
    let centerX = 0;
    let centerY = 0;
    if (elementItem.info.boundingBox) {
      centerX = elementItem.info.boundingBox.x + elementItem.info.boundingBox.width / 2;
      centerY = elementItem.info.boundingBox.y + elementItem.info.boundingBox.height / 2;
      // Coordinates are page-relative, ActionIndicator will transform them
      await actionIndicator.showClick(centerX, centerY, index);
    }

    // OPTIMIZATION: Try to click directly on detailView using CDP (faster and visible)
    // Extract ID from windowId (e.g., "main-2" -> 2)
    // Note: windowId can be main-{mainWindow.id} or main-{detailView.webContents.id}
    // We need to find the context by trying both
    const idMatch = windowId.match(/main-(\d+)/);
    if (idMatch && elementItem.info.boundingBox) {
      try {
        // Dynamic import to avoid build issues
        const { windowContextManager } = await import('./main/services/window-context-manager');
        const id = parseInt(idMatch[1], 10);
        // Try to get context by webContentsId first (most common case)
        let context = windowContextManager.getContext(id);
        
        // If not found, try to find by iterating all contexts (for mainWindow.id case)
        if (!context) {
          const allContexts = windowContextManager.getAllContexts();
          context = allContexts.find(ctx => ctx.window.id === id || ctx.detailView.webContents.id === id);
        }
        
        if (context?.detailView) {
        try {
          // Get or create CDP session for detailView
          let detailViewCdp = detailViewCdpMap.get(windowId);
          if (!detailViewCdp) {
            // Attach debugger to detailView
            context.detailView.webContents.debugger.attach('1.3');
            detailViewCdp = {
              webContents: context.detailView.webContents,
              attached: true
            };
            detailViewCdpMap.set(windowId, detailViewCdp);
            log.info(`[Playwright] CDP debugger attached to detailView for ${windowId}`);
          }
          
          // Use CDP to click directly on detailView (faster and visible)
          // CRITICAL: Use DOM.click() instead of mouse events for links to trigger navigation
          // Reuse centerX and centerY from above (already calculated at line 2250-2251)
          
          // Try DOM-based click first (triggers actual click events, works for links)
          try {
            // Escape selector for use in JavaScript
            const escapedSelector = elementData.selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
            
            // Use executeJavaScript to click the element directly (triggers DOM click event)
            const clickSuccess = await context.detailView.webContents.executeJavaScript(`
              (function() {
                try {
                  // Try selector first
                  let element = document.querySelector('${escapedSelector}');
                  
                  // If multiple elements match, find by position
                  if (!element || document.querySelectorAll('${escapedSelector}').length > 1) {
                    const elements = Array.from(document.querySelectorAll('${escapedSelector}'));
                    element = elements.find(el => {
                      const box = el.getBoundingClientRect();
                      const targetX = ${elementItem.info.boundingBox.x};
                      const targetY = ${elementItem.info.boundingBox.y};
                      return Math.abs(box.x - targetX) < 10 && Math.abs(box.y - targetY) < 10;
                    }) || elements[0];
                  }
                  
                  if (element) {
                    // Scroll into view first (synchronous)
                    element.scrollIntoView({ behavior: 'auto', block: 'center' });
                    // Click the element (triggers DOM click event)
                    element.click();
                    return true;
                  }
                  return false;
                } catch (e) {
                  console.error('Click error:', e);
                  return false;
                }
              })()
            `).catch(() => false);
            
            // Wait a bit for scroll to complete
            await new Promise(resolve => setTimeout(resolve, 200));
            
            if (clickSuccess) {
              log.info(`[Playwright] ✅ Clicked element at index ${index} via DOM.click() on detailView (selector: ${elementData.selector})`);
              // Wait longer for navigation (links need time to navigate)
              await new Promise(resolve => setTimeout(resolve, 2000));
              logAction('clickElementByIndex', windowId, { index, selector: elementData.selector, method: 'CDP-DOM-click', humanized: false });
              return createSuccessResponse(null);
            }
          } catch (domClickError) {
            log.debug(`[Playwright] DOM.click() via executeJavaScript failed, trying mouse events:`, domClickError);
          }
          
          // Fallback: Use mouse events (for elements that don't respond to click())
          // Move mouse to element first
          await context.detailView.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: centerX,
            y: centerY
          });
          
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Send CDP mouse events directly to detailView
          await context.detailView.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: centerX,
            y: centerY,
            button: 'left',
            clickCount: 1
          });
          
          await new Promise(resolve => setTimeout(resolve, 100)); // Longer delay for link clicks
          
          await context.detailView.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: centerX,
            y: centerY,
            button: 'left',
            clickCount: 1
          });
          
          log.info(`[Playwright] ✅ Clicked element at index ${index} directly on detailView via CDP mouse events (${centerX}, ${centerY})`);
          
          // Wait longer for navigation (links need time to navigate)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
            logAction('clickElementByIndex', windowId, { index, selector: elementData.selector, method: 'CDP-DOM-click', humanized: false });
            return createSuccessResponse(null);
          } catch (cdpError) {
            log.warn(`[Playwright] CDP click on detailView failed, falling back to real mouse movements:`, cdpError);
            // Fall through to real mouse click
          }
        }
      } catch (importError) {
        log.debug(`[Playwright] windowContextManager not available, using real mouse movements:`, importError);
        // Fall through to real mouse click
      }
    }
    
    // Use REAL mouse movements and clicks via Playwright (visible and reliable)
    log.info(`[Playwright] Clicking element at index ${index} using REAL mouse movements (selector: ${elementData.selector})`);
    
    // Reuse actionIndicator from above (already declared at line 2249)
    let finalX = centerX;
    let finalY = centerY;
    
    // Get element bounding box for mouse movement
    if (elementItem.info.boundingBox) {
      finalX = elementItem.info.boundingBox.x + elementItem.info.boundingBox.width / 2;
      finalY = elementItem.info.boundingBox.y + elementItem.info.boundingBox.height / 2;
    } else if (elementItem.element) {
      // Get bounding box from element handle
      const box = await elementItem.element.boundingBox().catch(() => null);
      if (box) {
        finalX = box.x + box.width / 2;
        finalY = box.y + box.height / 2;
      }
    }
    
    if (useHumanized) {
      // Use humanized mouse movement with visual cursor tracking
      log.info(`[Playwright] Moving mouse to (${finalX}, ${finalY}) with humanized movement`);
      
      // Get current mouse position (estimate)
      const currentPos = await page.evaluate(() => {
        // Try to get last known mouse position from page
        return (window as any).__lastMousePos || { x: 0, y: 0 };
      }).catch(() => ({ x: finalX - 100, y: finalY - 50 }));
      
      // Generate path for smooth movement
      const path = generateGhostPath(currentPos, { x: finalX, y: finalY }, {
        steps: humanOptions?.steps || 20,
        jitter: humanOptions?.jitter || 4,
        moveStrategy: humanOptions?.moveStrategy || 'bezier'
      });
      
      // Move along path with visual feedback
      for (let i = 0; i < path.length; i++) {
        const point = path[i];
        await page.mouse.move(point.x, point.y, { steps: 1 });
        
        // Update cursor position in overlay (throttled for performance)
        if (i % 3 === 0 || i === path.length - 1) { // Update every 3rd point + last point
          await actionIndicator.updateCursor(
            Math.round(point.x),
            Math.round(point.y)
          ).catch(() => {}); // Silently fail if overlay not ready
        }
        
        await new Promise(resolve => setTimeout(resolve, humanOptions?.minDelay || 8));
      }
      
      // Final precise move
      await page.mouse.move(finalX, finalY);
      await actionIndicator.updateCursor(Math.round(finalX), Math.round(finalY)).catch(() => {});
      
      // Reaction pause before click
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Perform REAL mouse click (down + up)
      log.info(`[Playwright] Performing REAL mouse click at (${finalX}, ${finalY})`);
      await actionIndicator.showCursorClick(); // Visual feedback
      await page.mouse.down();
      await new Promise(resolve => setTimeout(resolve, 50));
      await page.mouse.up();
      
      // Store mouse position for next movement
      await page.evaluate((pos) => {
        (window as any).__lastMousePos = pos;
      }, { x: finalX, y: finalY }).catch(() => {});
      
    } else {
      // Fast click without humanized movement
      await page.mouse.move(finalX, finalY);
      await actionIndicator.updateCursor(Math.round(finalX), Math.round(finalY)).catch(() => {});
      await page.mouse.down();
      await new Promise(resolve => setTimeout(resolve, 30));
      await page.mouse.up();
      await actionIndicator.showCursorClick().catch(() => {});
    }

    // Wait for potential popups after click
    await waitForPopupAfterAction(page, 5000);

    logAction('clickElementByIndex', windowId, { index, selector: elementData.selector, humanized: useHumanized, method: 'real-mouse' });
    return createSuccessResponse(null);
  } catch (error) {
    log.error(`[Playwright] Error clicking element at index ${index} in ${windowId}:`, error);
    return createErrorResponse('EXECUTION_ERROR',
      `Failed to click element at index ${index}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Input text into element by index (EKO framework compatible)
 * Uses element index from screenshot_and_html() or list_elements()
 */
export async function inputTextByIndex(
  windowId: string,
  index: number,
  text: string,
  options?: { timeout?: number; humanized?: boolean; typeOptions?: TypeOptions; enter?: boolean }
): Promise<ApiResponse> {
  const page = pageMap.get(windowId);
  if (!page) {
    return createErrorResponse('NOT_FOUND', `Page for windowId ${windowId} not found`);
  }

  if (!checkRateLimit(windowId)) {
    return createErrorResponse('THROTTLED', 'Rate limit exceeded');
  }

  if (index < 0) {
    return createErrorResponse('INVALID_ARG', 'Element index must be non-negative');
  }

  if (typeof text !== 'string' || text.length === 0 || text.length > TEXT_MAX_LENGTH) {
    return createErrorResponse('INVALID_ARG', `Text must be a non-empty string with max length ${TEXT_MAX_LENGTH}`);
  }

  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const useHumanized = options?.humanized !== false;

  try {
    // Use the same element detection logic as getAllInteractiveElementsWithIndexes for consistency
    const indexedElements = await getAllInteractiveElementsWithIndexes(page);
    
    if (index >= indexedElements.length) {
      log.warn(`[Playwright] Element index ${index} out of range. Available elements: ${indexedElements.length}`);
      return createErrorResponse('NOT_FOUND', 
        `Element with index ${index} not found. Available indexes: 0-${indexedElements.length - 1}. Use screenshot_and_html() to get current element indexes.`);
    }

    const elementItem = indexedElements[index];
    const tagName = elementItem.info.tagName;
    const isContentEditable = tagName === 'div' && (elementItem.info.role === 'textbox' || 
      elementItem.selector.includes('contenteditable'));
    const isInput = ['input', 'textarea'].includes(tagName) || isContentEditable;
    
    if (!isInput) {
      return createErrorResponse('INVALID_ARG', 
        `Element at index ${index} is not an input field (tag: ${tagName}, role: ${elementItem.info.role || 'none'})`);
    }

    const elementData = {
      selector: elementItem.selector,
      tagName,
      isContentEditable,
      boundingBox: elementItem.info.boundingBox
    };

    log.info(`[Playwright] Typing into element at index ${index}:`, {
      selector: elementData.selector,
      tagName,
      ariaLabel: elementItem.info.ariaLabel,
      placeholder: elementItem.info.placeholder,
      isContentEditable
    });

    // Show visual feedback (like Comet browser's headed mode)
    const actionIndicator = getActionIndicator();
    if (elementItem.info.boundingBox) {
      const centerX = elementItem.info.boundingBox.x + elementItem.info.boundingBox.width / 2;
      const centerY = elementItem.info.boundingBox.y + elementItem.info.boundingBox.height / 2;
      await actionIndicator.showType(text, index, centerX, centerY);
    }

    // For contenteditable, click first
    if (elementData.isContentEditable) {
      if (useHumanized) {
        await humanizedClick(page, elementData.selector, {
          steps: 10,
          minDelay: 5,
          maxDelay: 15
        });
      } else {
        await page.click(elementData.selector, { timeout: 2000 });
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Type text
    if (useHumanized) {
      await humanizedType(page, elementData.selector, text, options?.typeOptions);
    } else {
      await page.focus(elementData.selector);
      await page.fill(elementData.selector, '');
      await page.type(elementData.selector, text, { delay: 50 });
    }

    // Press Enter if requested
    if (options?.enter) {
      await page.keyboard.press('Enter');
    }

    logAction('inputTextByIndex', windowId, { 
      index, 
      selector: elementData.selector, 
      textLength: text.length,
      humanized: useHumanized 
    });

    return createSuccessResponse(null);
  } catch (error) {
    log.error(`[Playwright] Error typing into element at index ${index} in ${windowId}:`, error);
    return createErrorResponse('EXECUTION_ERROR',
      `Failed to type into element at index ${index}: ${error instanceof Error ? error.message : String(error)}`);
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
 * Label screenshot with element indexes
 * Overlays numbered labels on screenshot for visual identification (Phase 2)
 */
async function labelScreenshot(
  screenshotBuffer: Buffer,
  elements: ElementDescriptor[],
  options?: {
    enabled?: boolean;
    labelStyle?: {
      fontSize?: number;
      backgroundColor?: string;
      textColor?: string;
      borderColor?: string;
      borderWidth?: number;
      padding?: number;
      borderRadius?: number;
    };
  }
): Promise<Buffer> {
  // If labeling is disabled, return original buffer
  if (options?.enabled === false) {
    return screenshotBuffer;
  }

  try {
    // Dynamic import for sharp (native module, better for Electron)
    const sharp = (await import('sharp')).default;
    
    const labelStyle = options?.labelStyle || {};
    const fontSize = labelStyle.fontSize || 16;
    const backgroundColor = labelStyle.backgroundColor || '#FF6B6B';
    const textColor = labelStyle.textColor || '#FFFFFF';
    const borderColor = labelStyle.borderColor || '#FFFFFF';
    const borderWidth = labelStyle.borderWidth || 2;
    const padding = labelStyle.padding || 4;
    const borderRadius = labelStyle.borderRadius || 4;

    // Get image metadata
    const metadata = await sharp(screenshotBuffer).metadata();
    const imageWidth = metadata.width || 1280;
    const imageHeight = metadata.height || 720;

    // Create composite images for each label
    const composites: OverlayOptions[] = [];

    for (const element of elements) {
      // Skip elements without bounding box or index
      if (!element.boundingBox || element.index === undefined) {
        continue;
      }

      const { x, y, width, height } = element.boundingBox;
      
      // Create label text
      const labelText = String(element.index);
      
      // Calculate label dimensions (minimum size for single digit, scales for multi-digit)
      const minLabelSize = fontSize + (padding * 2);
      const textWidth = Math.max(minLabelSize, labelText.length * (fontSize * 0.65));
      const labelWidth = textWidth;
      const labelHeight = minLabelSize;
      
      // Calculate label position (top-left corner of element, with bounds checking)
      const labelX = Math.max(borderWidth, Math.min(x, imageWidth - labelWidth - borderWidth));
      const labelY = Math.max(borderWidth, Math.min(y, imageHeight - labelHeight - borderWidth));

      // Create SVG for label background and border
      const svgBackground = `
        <svg width="${labelWidth + borderWidth * 2}" height="${labelHeight + borderWidth * 2}">
          <rect 
            x="${borderWidth}" 
            y="${borderWidth}" 
            width="${labelWidth}" 
            height="${labelHeight}" 
            fill="${backgroundColor}" 
            stroke="${borderColor}" 
            stroke-width="${borderWidth}" 
            rx="${borderRadius}" 
            ry="${borderRadius}"
          />
          <text 
            x="${labelWidth / 2 + borderWidth}" 
            y="${labelHeight / 2 + borderWidth + fontSize / 3}" 
            font-family="Arial, sans-serif" 
            font-size="${fontSize}" 
            font-weight="bold" 
            fill="${textColor}" 
            text-anchor="middle" 
            dominant-baseline="middle"
          >${labelText}</text>
        </svg>
      `;

      // Add to composites
      composites.push({
        input: Buffer.from(svgBackground),
        left: Math.round(labelX - borderWidth),
        top: Math.round(labelY - borderWidth),
        blend: 'over'
      });
    }

    // Composite all labels onto the screenshot
    if (composites.length > 0) {
      const labeledBuffer = await sharp(screenshotBuffer)
        .composite(composites)
        .png()
        .toBuffer();
      
      return labeledBuffer;
    }

    return screenshotBuffer;
  } catch (error) {
    log.warn(`[Playwright] Error labeling screenshot: ${error}. Returning original screenshot.`);
    return screenshotBuffer;
  }
}

/**
 * Screenshot and HTML extraction with element indexes (EKO framework compatible)
 * Similar to EKO's screenshot_and_html() function
 */
export async function screenshotAndHtml(
  windowId: string,
  options?: { 
    fullPage?: boolean;
    labelScreenshot?: boolean;
    labelStyle?: {
      fontSize?: number;
      backgroundColor?: string;
      textColor?: string;
      borderColor?: string;
      borderWidth?: number;
      padding?: number;
      borderRadius?: number;
    };
  }
): Promise<ApiResponse<{
  screenshot: string;
  elements: ElementDescriptor[];
  html?: string;
}>> {
  const page = pageMap.get(windowId);
  if (!page) {
    return createErrorResponse('NOT_FOUND', `Page for windowId ${windowId} not found`);
  }

  if (!checkRateLimit(windowId)) {
    return createErrorResponse('THROTTLED', 'Rate limit exceeded');
  }

  try {
    // Capture screenshot - use CDP for better performance (like Comet browser)
    let buffer: Buffer;
    let currentUrl: string | undefined; // Will be set from detailView if available
    
    // OPTIMIZATION: Try to capture screenshot from detailView directly (what user sees)
    // Extract ID from windowId (e.g., "main-2" -> 2)
    const idMatch = windowId.match(/main-(\d+)/);
    if (idMatch) {
      try {
        // Dynamic import to avoid build issues
        const { windowContextManager } = await import('./main/services/window-context-manager');
        const id = parseInt(idMatch[1], 10);
        // Try to get context by webContentsId first (most common case)
        let context = windowContextManager.getContext(id);
        
        // If not found, try to find by iterating all contexts (for mainWindow.id case)
        if (!context) {
          const allContexts = windowContextManager.getAllContexts();
          context = allContexts.find(ctx => ctx.window.id === id || ctx.detailView.webContents.id === id);
        }
        
        if (context?.detailView) {
          try {
            // Capture screenshot from detailView (what user actually sees)
            const nativeImage = await context.detailView.webContents.capturePage();
            buffer = nativeImage.toPNG();
            
            // Get URL from detailView (what user actually sees) for accurate login detection
            currentUrl = context.detailView.webContents.getURL();
            
            // Save screenshot to disk for debugging (optional)
            const screenshotDir = path.join(app.getPath('logs'), 'screenshots');
            if (!fs.existsSync(screenshotDir)) {
              fs.mkdirSync(screenshotDir, { recursive: true });
            }
            const screenshotPath = path.join(screenshotDir, `screenshot-${windowId}-${Date.now()}.png`);
            fs.writeFileSync(screenshotPath, buffer);
            log.info(`[Playwright] 📸 Screenshot saved to: ${screenshotPath}`);
            
            log.debug(`[Playwright] Screenshot captured from detailView for ${windowId}, URL: ${currentUrl}`);
          } catch (detailViewError) {
            log.warn(`[Playwright] detailView screenshot failed, trying CDP/Playwright:`, detailViewError);
            // Fall through to CDP/Playwright
          }
        }
      } catch (importError) {
        log.debug(`[Playwright] windowContextManager not available, skipping detailView screenshot:`, importError);
        // Fall through to CDP/Playwright
      }
    }
    
    // Fallback: Use CDP or Playwright
    if (!buffer) {
      const cdpSession = cdpSessionMap.get(windowId);
      if (cdpSession) {
        try {
          // Use CDP for faster screenshot capture (Comet browser approach)
          const cdpResult = await cdpSession.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: options?.fullPage ?? false,
            quality: 100
          });
          buffer = Buffer.from(cdpResult.data, 'base64');
          log.debug(`[Playwright] Screenshot captured via CDP for ${windowId}`);
        } catch (cdpError) {
          // Fallback to Playwright if CDP fails
          log.warn(`[Playwright] CDP screenshot failed, using Playwright fallback:`, cdpError);
          buffer = await page.screenshot({
            fullPage: options?.fullPage ?? false,
            type: 'png'
          });
        }
      } else {
        // No CDP session available, use Playwright
        buffer = await page.screenshot({
          fullPage: options?.fullPage ?? false,
          type: 'png'
        });
      }
    }

    // Get all interactive elements with indexes
    const indexedElements = await getAllInteractiveElementsWithIndexes(page);

    // Convert to ElementDescriptor format with enhanced labels
    const elements: ElementDescriptor[] = indexedElements.map((item) => {
      const label = generateElementLabel(item.info, item.index);
      
      // Add descriptive text for AI understanding
      let description = label;
      if (item.info.ariaLabel && item.info.ariaLabel !== label) {
        description = `${label} (${item.info.ariaLabel})`;
      } else if (item.info.placeholder && item.info.placeholder !== label) {
        description = `${label} (${item.info.placeholder})`;
      }
      
      return {
        index: item.index,
        selector: item.selector,
        innerText: item.info.innerText.substring(0, 500),
        boundingBox: item.info.boundingBox,
        tagName: item.info.tagName,
        type: item.info.type,
        role: item.info.role,
        ariaLabel: item.info.ariaLabel,
        name: item.info.name,
        id: item.info.id,
        className: item.info.className,
        href: item.info.href,
        placeholder: item.info.placeholder,
        isVisible: item.info.isVisible,
        isEnabled: item.info.isEnabled,
        isClickable: item.info.isClickable,
        suggestedSelector: item.info.suggestedSelector,
        label: description // Enhanced label for better AI understanding
      };
    });
    
    // Log element summary for debugging
    log.info(`[Playwright] screenshotAndHtml found ${elements.length} interactive elements`);
    const inputFields = elements.filter(e => ['input', 'textarea'].includes(e.tagName || '') || 
      e.role === 'textbox' || e.role === 'combobox' || 
      (e.tagName === 'div' && (e.className?.includes('compose') || e.className?.includes('editor'))));
    if (inputFields.length > 0) {
      log.info(`[Playwright] Input fields found:`, inputFields.map(e => ({
        index: e.index,
        label: e.label,
        ariaLabel: e.ariaLabel,
        placeholder: e.placeholder
      })));
    }

    // Label screenshot if enabled (default: true for Phase 2)
    const shouldLabel = options?.labelScreenshot !== false; // Default to true
    if (shouldLabel) {
      buffer = await labelScreenshot(buffer, elements, {
        enabled: true,
        labelStyle: options?.labelStyle
      });
    }

    const screenshotBase64 = buffer.toString('base64');

    // Get HTML snapshot (optional)
    const html = options?.fullPage ? await page.content() : undefined;

    // Vision analysis (like Comet browser) - analyze page context
    // Use currentUrl from detailView (set above when capturing screenshot) or fallback to Playwright URL
    if (!currentUrl) {
      currentUrl = page.url();
    }
    
    let visionAnalysis: VisionAnalysisResult | undefined;
    try {
      visionAnalysis = await analyzeScreenshot(buffer, elements, html, currentUrl);
      log.debug(`[Playwright] Vision analysis: ${visionAnalysis.pageType}, isLoginPage: ${visionAnalysis.isLoginPage}, URL: ${currentUrl}, confidence: ${visionAnalysis.confidence.toFixed(2)}`);
    } catch (visionError) {
      log.warn('[Playwright] Vision analysis failed:', visionError);
      // Continue without vision analysis
    }

    // LLM Vision analysis (optional, non-blocking) - only if explicitly enabled
    // Disabled by default to follow EKO's standard workflow: screenshot -> analyze -> act
    // The agent should use the elements and visionAnalysis to decide actions, not rely on LLM suggestions
    let llmVisionAnalysis: LLMVisionAnalysisResult | undefined;
    // Skip LLM vision analysis to follow EKO's standard workflow
    // The agent will use the elements and visionAnalysis to make decisions

    logAction('screenshotAndHtml', windowId, { 
      elementCount: elements.length,
      fullPage: options?.fullPage,
      labeled: shouldLabel,
      pageType: visionAnalysis?.pageType,
      visionConfidence: visionAnalysis?.confidence,
      llmStuck: llmVisionAnalysis?.isStuck
    });

    return createSuccessResponse({
      screenshot: `data:image/png;base64,${screenshotBase64}`,
      elements,
      html,
      visionAnalysis, // Heuristic vision analysis (always available)
      llmVisionAnalysis // LLM vision analysis (like Comet browser) - suggests next actions
    });
  } catch (error) {
    log.error(`[Playwright] Error in screenshotAndHtml for ${windowId}:`, error);
    return createErrorResponse('EXECUTION_ERROR', 
      `Failed to capture screenshot and HTML: ${error instanceof Error ? error.message : String(error)}`);
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

