/**
 * Human-like Cursor/Input Adapter for Playwright
 * Provides humanized mouse movements, clicks, typing, and scrolling
 * with Bezier curve paths, jitter, and variable delays
 */

import { type Page, type Locator } from 'playwright';
import log from 'electron-log';

// Types
export interface HumanOptions {
  steps?: number;
  jitter?: number;
  minDelay?: number;
  maxDelay?: number;
  moveStrategy?: 'bezier' | 'linear';
  safety?: {
    maxSteps?: number;
    maxDurationMs?: number;
  };
  forceRaw?: boolean;
}

export interface MoveOptions {
  steps?: number;
  jitter?: number;
  minDelay?: number;
  maxDelay?: number;
  moveStrategy?: 'bezier' | 'linear';
}

export interface ScrollOptions {
  steps?: number;
  minDelay?: number;
  maxDelay?: number;
  behavior?: 'smooth' | 'auto';
}

export interface TypeOptions {
  minDelay?: number;
  maxDelay?: number;
  clearFirst?: boolean;
  perCharJitter?: boolean;
}

export interface ActionResult {
  ok: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export interface Point {
  x: number;
  y: number;
}

// Constants
const DEFAULT_STEPS = 18;
const DEFAULT_JITTER = 3;
const DEFAULT_MIN_DELAY = 8;
const DEFAULT_MAX_DELAY = 30;
const DEFAULT_MAX_STEPS = 50;
const DEFAULT_MAX_DURATION_MS = 5000;
const DEFAULT_SCROLL_STEPS = 8;
const DEFAULT_TYPE_MIN_DELAY = 40;
const DEFAULT_TYPE_MAX_DELAY = 180;

// Environment toggle - enabled by default for human-like behavior
// Set HUMANIZED_INPUT=false to disable (not recommended)
const HUMANIZED_INPUT_ENABLED = process.env.HUMANIZED_INPUT !== 'false' && process.env.HUMANIZED_INPUT !== '0';

// Log status on module load
if (HUMANIZED_INPUT_ENABLED) {
  log.info('[HumanCursor] Humanized input ENABLED - mouse movements and typing will be human-like');
} else {
  log.warn('[HumanCursor] Humanized input DISABLED - using raw automation (not recommended)');
}

// Utility functions
function random(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(random(min, max + 1));
}

function gaussianRandom(mean: number = 0, stdDev: number = 1): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  return mean + stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get current mouse position from Playwright page
 */
async function getCurrentMousePosition(page: Page): Promise<Point | null> {
  try {
    // Playwright doesn't expose current mouse position directly
    // We'll use a reasonable default or track it ourselves
    // For now, return null and let the caller provide a default
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate CSS selector
 */
function validateSelector(selector: string): void {
  if (typeof selector !== 'string' || selector.length === 0 || selector.length > 1000) {
    throw {
      code: 'INVALID_ARG',
      message: 'Selector must be a non-empty string (max 1000 chars)'
    };
  }
  
  if (selector.toLowerCase().includes('javascript:')) {
    throw {
      code: 'INVALID_ARG',
      message: 'Unsafe selector detected'
    };
  }
}

/**
 * Cubic Bezier interpolation
 * @param t - Parameter from 0 to 1
 * @param p0 - Start point
 * @param p1 - First control point
 * @param p2 - Second control point
 * @param p3 - End point
 */
function bezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  
  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
  };
}

/**
 * Generate a human-like cursor path using Bezier curves
 * @param start - Starting point
 * @param end - Target point
 * @param opts - Path generation options
 * @returns Array of points along the path
 */
export function generateGhostPath(
  start: Point,
  end: Point,
  opts: {
    steps?: number;
    jitter?: number;
    moveStrategy?: 'bezier' | 'linear';
  } = {}
): Point[] {
  const steps = opts.steps ?? DEFAULT_STEPS;
  const jitter = opts.jitter ?? DEFAULT_JITTER;
  const strategy = opts.moveStrategy ?? 'bezier';
  
  const path: Point[] = [];
  
  if (strategy === 'linear') {
    // Simple linear interpolation with jitter
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      
      path.push({
        x: x + gaussianRandom(0, jitter),
        y: y + gaussianRandom(0, jitter)
      });
    }
  } else {
    // Bezier curve with randomized control points
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Control points offset perpendicular to the main direction
    const perpX = -dy / dist;
    const perpY = dx / dist;
    
    // Randomize control point distance (30-60% of total distance)
    const cp1Dist = random(dist * 0.3, dist * 0.6);
    const cp2Dist = random(dist * 0.3, dist * 0.6);
    
    // Randomize perpendicular offset (-20% to +20% of distance)
    const offset1 = random(-dist * 0.2, dist * 0.2);
    const offset2 = random(-dist * 0.2, dist * 0.2);
    
    const cp1: Point = {
      x: start.x + dx * 0.3 + perpX * offset1,
      y: start.y + dy * 0.3 + perpY * offset1
    };
    
    const cp2: Point = {
      x: start.x + dx * 0.7 + perpX * offset2,
      y: start.y + dy * 0.7 + perpY * offset2
    };
    
    // Generate points along Bezier curve
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const point = bezierPoint(t, start, cp1, cp2, end);
      
      // Add Gaussian jitter
      path.push({
        x: point.x + gaussianRandom(0, jitter),
        y: point.y + gaussianRandom(0, jitter)
      });
    }
  }
  
  return path;
}

/**
 * Scroll element into view if needed
 * Also handles popups/modals that might contain the element
 */
async function ensureElementVisible(page: Page, selector: string): Promise<void> {
  try {
    const locator = page.locator(selector);
    let box = await locator.boundingBox();
    
    // If element not found, try looking in popups/modals
    if (!box) {
      const popupSelectors = [
        '[role="dialog"]',
        '[class*="modal"]',
        '[class*="popup"]',
        '[class*="dialog"]',
        '[class*="compose"]',
        '[aria-label*="compose" i]'
      ];
      
      for (const popupSelector of popupSelectors) {
        try {
          const popup = await page.$(popupSelector);
          if (popup) {
            const isVisible = await popup.isVisible();
            if (isVisible) {
              // Try scoped selector
              const scopedLocator = page.locator(`${popupSelector} ${selector}`);
              box = await scopedLocator.boundingBox();
              if (box) {
                // Scroll popup into view if needed
                await popup.evaluate((el: Element) => {
                  el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
                });
                await delay(200);
                return;
              }
            }
          }
        } catch {
          continue;
        }
      }
    }
    
    if (!box) {
      // Try to scroll into view
      await locator.evaluate((el: Element) => {
        el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
      });
      
      // Wait a bit for scroll to complete
      await delay(100);
    }
  } catch (error) {
    // Ignore scroll errors, will be caught by boundingBox check
  }
}

/**
 * Humanized mouse movement to a point
 */
export async function humanizedMoveTo(
  page: Page,
  x: number,
  y: number,
  opts: MoveOptions = {}
): Promise<void> {
  if (!HUMANIZED_INPUT_ENABLED) {
    await page.mouse.move(x, y);
    return;
  }
  
  const steps = opts.steps ?? DEFAULT_STEPS;
  const minDelay = opts.minDelay ?? DEFAULT_MIN_DELAY;
  const maxDelay = opts.maxDelay ?? DEFAULT_MAX_DELAY;
  const jitter = opts.jitter ?? DEFAULT_JITTER;
  const strategy = opts.moveStrategy ?? 'bezier';
  
  // Get current position (estimate if not available)
  const currentPos = await getCurrentMousePosition(page) || { x: x - 100, y: y - 50 };
  
  // Generate path
  const path = generateGhostPath(currentPos, { x, y }, { steps, jitter, moveStrategy: strategy });
  
  // Move along path
  for (const point of path) {
    await page.mouse.move(point.x, point.y, { steps: 1 });
    await delay(randomInt(minDelay, maxDelay));
  }
  
  // Final precise move
  await page.mouse.move(x, y);
}

/**
 * Humanized click on an element
 */
export async function humanizedClick(
  page: Page,
  selector: string,
  opts: HumanOptions = {}
): Promise<ActionResult> {
  try {
    validateSelector(selector);
    
    // Check if humanized input is disabled or forceRaw is set
    if (!HUMANIZED_INPUT_ENABLED || opts.forceRaw) {
      await page.click(selector);
      return { ok: true };
    }
    
    const steps = opts.steps ?? DEFAULT_STEPS;
    const jitter = opts.jitter ?? DEFAULT_JITTER;
    const minDelay = opts.minDelay ?? DEFAULT_MIN_DELAY;
    const maxDelay = opts.maxDelay ?? DEFAULT_MAX_DELAY;
    const maxSteps = opts.safety?.maxSteps ?? DEFAULT_MAX_STEPS;
    const maxDuration = opts.safety?.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
    
    // Ensure element is visible
    await ensureElementVisible(page, selector);
    
    // Get element bounding box
    const locator = page.locator(selector);
    const box = await locator.boundingBox();
    
    if (!box) {
      return {
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Element with selector "${selector}" not found or not visible`
        }
      };
    }
    
    // Calculate target point (center with small random offset)
    const jitterAmount = Math.min(jitter, box.width / 4, box.height / 4);
    const targetX = box.x + box.width / 2 + gaussianRandom(0, jitterAmount);
    const targetY = box.y + box.height / 2 + gaussianRandom(0, jitterAmount);
    
    // Get current mouse position (estimate if not available)
    const currentPos = await getCurrentMousePosition(page) || {
      x: targetX - random(50, 150),
      y: targetY - random(30, 80)
    };
    
    // Generate path with safety limits
    const actualSteps = Math.min(steps, maxSteps);
    const path = generateGhostPath(currentPos, { x: targetX, y: targetY }, {
      steps: actualSteps,
      jitter,
      moveStrategy: opts.moveStrategy ?? 'bezier'
    });
    
    // Move along path with timing safety
    const startTime = Date.now();
    const stepDelay = (maxDuration - 200) / path.length; // Reserve 200ms for click
    
    for (let i = 0; i < path.length; i++) {
      // Check duration limit
      if (Date.now() - startTime > maxDuration - 200) {
        // Skip to end
        await page.mouse.move(targetX, targetY);
        break;
      }
      
      const point = path[i];
      await page.mouse.move(point.x, point.y, { steps: 1 });
      
      const delayMs = Math.min(
        randomInt(minDelay, maxDelay),
        stepDelay
      );
      await delay(delayMs);
    }
    
    // Final precise move
    await page.mouse.move(targetX, targetY);
    
    // Reaction pause before click
    await delay(randomInt(40, 120));
    
    // Perform click
    await page.mouse.down();
    await delay(randomInt(30, 90));
    await page.mouse.up();
    
    return { ok: true };
  } catch (error: any) {
    return {
      ok: false,
      error: {
        code: error.code || 'INTERNAL',
        message: error.message || String(error)
      }
    };
  }
}

/**
 * Humanized scrolling
 */
export async function humanizedScrollTo(
  page: Page,
  selectorOrDelta: string | { dx?: number; dy?: number },
  opts: ScrollOptions = {}
): Promise<void> {
  if (!HUMANIZED_INPUT_ENABLED) {
    if (typeof selectorOrDelta === 'string') {
      await page.locator(selectorOrDelta).scrollIntoViewIfNeeded();
    } else {
      await page.mouse.wheel(selectorOrDelta.dx || 0, selectorOrDelta.dy || 0);
    }
    return;
  }
  
  const steps = opts.steps ?? DEFAULT_SCROLL_STEPS;
  const minDelay = opts.minDelay ?? DEFAULT_MIN_DELAY;
  const maxDelay = opts.maxDelay ?? DEFAULT_MAX_DELAY;
  
  if (typeof selectorOrDelta === 'string') {
    // Scroll to element
    const locator = page.locator(selectorOrDelta);
    const box = await locator.boundingBox();
    
    if (box) {
      const targetY = box.y + box.height / 2;
      const viewport = page.viewportSize();
      const currentY = viewport ? viewport.height / 2 : 0;
      const deltaY = targetY - currentY;
      
      // Scroll in steps
      const stepSize = deltaY / steps;
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, stepSize);
        await delay(randomInt(minDelay, maxDelay));
      }
    } else {
      // Fallback to scrollIntoView
      await locator.evaluate((el: Element) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  } else {
    // Scroll by delta
    const dx = selectorOrDelta.dx || 0;
    const dy = selectorOrDelta.dy || 0;
    const stepDx = dx / steps;
    const stepDy = dy / steps;
    
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(stepDx, stepDy);
      await delay(randomInt(minDelay, maxDelay));
    }
  }
}

/**
 * Humanized typing
 */
export async function humanizedType(
  page: Page,
  selector: string,
  text: string,
  opts: TypeOptions = {}
): Promise<void> {
  validateSelector(selector);
  
  if (typeof text !== 'string' || text.length === 0) {
    throw {
      code: 'INVALID_ARG',
      message: 'Text must be a non-empty string'
    };
  }
  
  // Check if humanized input is disabled
  if (!HUMANIZED_INPUT_ENABLED) {
    await page.fill(selector, text);
    return;
  }
  
  const minDelay = opts.minDelay ?? DEFAULT_TYPE_MIN_DELAY;
  const maxDelay = opts.maxDelay ?? DEFAULT_TYPE_MAX_DELAY;
  const clearFirst = opts.clearFirst ?? true;
  const perCharJitter = opts.perCharJitter ?? true;
  
  // Ensure element is visible and focused
  await ensureElementVisible(page, selector);
  
  // Get the element to check its type
  const element = await page.$(selector);
  if (!element) {
    throw {
      code: 'NOT_FOUND',
      message: `Element with selector "${selector}" not found`
    };
  }
  
  // Click the element first to ensure it's focused (especially important for Gmail compose fields)
  const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
  const isContentEditable = await element.evaluate((el) => el.getAttribute('contenteditable') === 'true');
  
  log.debug(`[HumanCursor] Element type: ${tagName}, contenteditable: ${isContentEditable}`);
  
  // Click to ensure focus, especially for Gmail compose fields
  try {
    await element.click({ timeout: 2000 });
    await delay(100);
  } catch (clickError) {
    log.warn(`[HumanCursor] Click failed, trying focus: ${clickError}`);
    await page.focus(selector);
  }
  
  // Clear if requested
  if (clearFirst) {
    if (isContentEditable || tagName === 'div') {
      // For contenteditable divs (like Gmail body), select all and delete
      await page.keyboard.press('Control+A');
      await delay(50);
      await page.keyboard.press('Delete');
    } else {
      await page.fill(selector, '');
    }
    await delay(randomInt(50, 150));
  }
  
  // Type character by character with variable delays
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // Calculate delay with optional per-character jitter
    let charDelay = randomInt(minDelay, maxDelay);
    if (perCharJitter) {
      // Add slight variation based on character type
      if (char === ' ') {
        charDelay += randomInt(0, 30); // Longer pause for spaces
      } else if (char.match(/[A-Z]/)) {
        charDelay += randomInt(0, 20); // Slight pause for capitals (Shift key)
      } else if (char.match(/[.,!?;:]/)) {
        charDelay += randomInt(10, 40); // Pause after punctuation
      }
    }
    
    await page.keyboard.type(char, { delay: charDelay });
    
    // Occasional longer pauses (simulating thinking)
    if (Math.random() < 0.05 && i < text.length - 1) {
      await delay(randomInt(100, 300));
    }
  }
  
  // Verify text was entered (for non-contenteditable inputs)
  if (!isContentEditable && (tagName === 'input' || tagName === 'textarea')) {
    try {
      const enteredValue = await element.inputValue();
      if (enteredValue !== text) {
        log.warn(`[HumanCursor] Text mismatch after typing. Expected: "${text}", Got: "${enteredValue}"`);
      }
    } catch (verifyError) {
      // Verification failed, but typing might still have worked
      log.debug(`[HumanCursor] Could not verify text entry: ${verifyError}`);
    }
  }
}

