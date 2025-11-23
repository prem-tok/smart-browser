/**
 * HumanBehavior class for browser automation
 * Provides human-like interactions using ghost-cursor, config, and randomization utilities
 */

import { createCursor, type Cursor } from 'ghost-cursor';
import type { Page as PlaywrightPage } from 'playwright';
import type { Page as PuppeteerPage } from 'puppeteer';
import type { HumanBehaviorConfig } from '@/config/humanBehaviorConfig';
import { defaultHumanBehaviorConfig } from '@/config/humanBehaviorConfig';
import { randomDelay, randomInt, randomFloat, randomChoice } from './randomization';

/**
 * Union type for Playwright or Puppeteer page
 */
export type BrowserPage = PlaywrightPage | PuppeteerPage;

/**
 * Options for human click action
 */
export interface ClickOptions {
  /** Wait for element to be visible before clicking */
  waitForVisible?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Override click delay before (ms) */
  delayBefore?: { min: number; max: number };
  /** Override click delay after (ms) */
  delayAfter?: { min: number; max: number };
}

/**
 * Options for human typing action
 */
export interface TypeOptions {
  /** Clear field before typing */
  clearFirst?: boolean;
  /** Wait for element to be visible before typing */
  waitForVisible?: boolean;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Override typing speed (WPM range) */
  wpmRange?: { min: number; max: number };
  /** Override mistake probability */
  mistakeProbability?: number;
}

/**
 * Options for human scroll action
 */
export interface ScrollOptions {
  /** Scroll direction: 'down' or 'up' */
  direction?: 'down' | 'up';
  /** Override scroll speed variation */
  speedVariation?: { min: number; max: number };
  /** Override pause probability */
  pauseProbability?: number;
}

/**
 * HumanBehavior class for natural browser automation
 */
export class HumanBehavior {
  private page: BrowserPage;
  private cursor: Cursor | null = null;
  private config: HumanBehaviorConfig;
  private isPlaywright: boolean;

  /**
   * Creates a new HumanBehavior instance
   *
   * @param page - Playwright or Puppeteer page instance
   * @param config - Optional custom human behavior configuration
   */
  constructor(page: BrowserPage, config?: Partial<HumanBehaviorConfig>) {
    this.page = page;
    this.isPlaywright = this.detectPlaywright(page);
    this.config = this.mergeConfig(config || {});
    this.initializeCursor();
  }

  /**
   * Detects if the page is a Playwright page
   */
  private detectPlaywright(page: BrowserPage): boolean {
    // Playwright pages have a `context()` method, Puppeteer doesn't
    return typeof (page as any).context === 'function';
  }

  /**
   * Merges custom config with defaults
   */
  private mergeConfig(customConfig: Partial<HumanBehaviorConfig>): HumanBehaviorConfig {
    return {
      mouseMovement: {
        ...defaultHumanBehaviorConfig.mouseMovement,
        ...customConfig.mouseMovement,
      },
      click: {
        ...defaultHumanBehaviorConfig.click,
        ...customConfig.click,
      },
      typing: {
        ...defaultHumanBehaviorConfig.typing,
        ...customConfig.typing,
      },
      scroll: {
        ...defaultHumanBehaviorConfig.scroll,
        ...customConfig.scroll,
        speedVariation: {
          ...defaultHumanBehaviorConfig.scroll.speedVariation,
          ...customConfig.scroll?.speedVariation,
        },
      },
      idleBehavior: {
        ...defaultHumanBehaviorConfig.idleBehavior,
        ...customConfig.idleBehavior,
        randomMovementInterval: {
          ...defaultHumanBehaviorConfig.idleBehavior.randomMovementInterval,
          ...customConfig.idleBehavior?.randomMovementInterval,
        },
      },
    };
  }

  /**
   * Initializes the ghost-cursor instance
   */
  private initializeCursor(): void {
    try {
      this.cursor = createCursor(this.page as any);
    } catch (error) {
      console.warn('[HumanBehavior] Failed to initialize cursor:', error);
      this.cursor = null;
    }
  }

  /**
   * Gets element bounding box (works with both Playwright and Puppeteer)
   */
  private async getElementBounds(selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
    if (this.isPlaywright) {
      const page = this.page as PlaywrightPage;
      const element = await page.locator(selector).first();
      const box = await element.boundingBox();
      if (!box) {
        throw new Error(`Element ${selector} not found or not visible`);
      }
      return box;
    } else {
      const page = this.page as PuppeteerPage;
      const element = await page.$(selector);
      if (!element) {
        throw new Error(`Element ${selector} not found`);
      }
      const box = await element.boundingBox();
      if (!box) {
        throw new Error(`Element ${selector} not visible`);
      }
      return box;
    }
  }

  /**
   * Performs a human-like click on an element
   *
   * @param selector - CSS selector for the element to click
   * @param options - Optional click configuration
   * @throws Error if element is not found or click fails
   *
   * @example
   * ```typescript
   * await humanBehavior.humanClick('button.submit');
   * await humanBehavior.humanClick('#login-btn', { delayBefore: { min: 100, max: 300 } });
   * ```
   */
  async humanClick(selector: string, options: ClickOptions = {}): Promise<void> {
    try {
      const {
        waitForVisible = true,
        timeout = 30000,
        delayBefore,
        delayAfter,
      } = options;

      // Wait for element if needed
      if (waitForVisible) {
        if (this.isPlaywright) {
          const page = this.page as PlaywrightPage;
          await page.locator(selector).first().waitFor({ state: 'visible', timeout });
        } else {
          const page = this.page as PuppeteerPage;
          await page.waitForSelector(selector, { visible: true, timeout });
        }
      }

      // Get element bounds
      const bounds = await this.getElementBounds(selector);

      // Calculate click position with randomness
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const radius = this.config.click.positionRandomnessRadius;

      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius;
      const clickX = centerX + Math.cos(angle) * distance;
      const clickY = centerY + Math.sin(angle) * distance;

      // Delay before click
      const beforeDelayMin = delayBefore
        ? delayBefore.min
        : this.config.click.delayBeforeMin;
      const beforeDelayMax = delayBefore
        ? delayBefore.max
        : this.config.click.delayBeforeMax;
      await randomDelay(beforeDelayMin, beforeDelayMax);

      // Move cursor to element using ghost-cursor if available
      if (this.cursor) {
        await this.cursor.move(clickX, clickY);
      } else {
        // Fallback: direct mouse move
        if (this.isPlaywright) {
          const page = this.page as PlaywrightPage;
          await page.mouse.move(clickX, clickY);
        } else {
          const page = this.page as PuppeteerPage;
          await page.mouse.move(clickX, clickY);
        }
      }

      // Small delay before actual click
      await randomDelay(50, 150);

      // Perform click
      if (this.isPlaywright) {
        const page = this.page as PlaywrightPage;
        await page.mouse.click(clickX, clickY);
      } else {
        const page = this.page as PuppeteerPage;
        await page.mouse.click(clickX, clickY);
      }

      // Delay after click
      const afterDelayMin = delayAfter
        ? delayAfter.min
        : this.config.click.delayAfterMin;
      const afterDelayMax = delayAfter
        ? delayAfter.max
        : this.config.click.delayAfterMax;
      await randomDelay(afterDelayMin, afterDelayMax);
    } catch (error) {
      throw new Error(`Human click failed on ${selector}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Types text with human-like delays and potential mistakes
   *
   * @param selector - CSS selector for the input element
   * @param text - Text to type
   * @param options - Optional typing configuration
   * @throws Error if element is not found or typing fails
   *
   * @example
   * ```typescript
   * await humanBehavior.humanType('input[name="email"]', 'user@example.com');
   * await humanBehavior.humanType('#password', 'secret123', { clearFirst: true });
   * ```
   */
  async humanType(selector: string, text: string, options: TypeOptions = {}): Promise<void> {
    try {
      const {
        clearFirst = true,
        waitForVisible = true,
        timeout = 30000,
        wpmRange,
        mistakeProbability,
      } = options;

      // Wait for element if needed
      if (waitForVisible) {
        if (this.isPlaywright) {
          const page = this.page as PlaywrightPage;
          await page.locator(selector).first().waitFor({ state: 'visible', timeout });
        } else {
          const page = this.page as PuppeteerPage;
          await page.waitForSelector(selector, { visible: true, timeout });
        }
      }

      // Focus element
      if (this.isPlaywright) {
        const page = this.page as PlaywrightPage;
        await page.locator(selector).first().focus();
      } else {
        const page = this.page as PuppeteerPage;
        await page.focus(selector);
      }

      // Clear field if needed
      if (clearFirst) {
        if (this.isPlaywright) {
          const page = this.page as PlaywrightPage;
          await page.locator(selector).first().fill('');
        } else {
          const page = this.page as PuppeteerPage;
          await page.evaluate((sel) => {
            const el = document.querySelector(sel) as HTMLInputElement;
            if (el) el.value = '';
          }, selector);
        }
      }

      // Calculate typing speed
      const wpmMin = wpmRange?.min ?? this.config.typing.wpmMin;
      const wpmMax = wpmRange?.max ?? this.config.typing.wpmMax;
      const wpm = randomInt(wpmMin, wpmMax);
      const charsPerSecond = (wpm * 5) / 60; // Average 5 chars per word
      const baseDelay = 1000 / charsPerSecond;

      // Type each character
      const mistakeProb = mistakeProbability ?? this.config.typing.mistakeProbability;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        let charToType = char;

        // Simulate typing mistake
        if (Math.random() < mistakeProb && i > 0) {
          // Type wrong character
          const wrongChar = randomChoice(['a', 'e', 'i', 'o', 'u', 's', 't', 'n']);
          if (wrongChar) {
            charToType = wrongChar;
          }
        }

        // Type character
        if (this.isPlaywright) {
          const page = this.page as PlaywrightPage;
          await page.keyboard.type(charToType, { delay: 0 });
        } else {
          const page = this.page as PuppeteerPage;
          await page.keyboard.type(charToType);
        }

        // Delay with variation
        const delay = baseDelay * randomFloat(0.7, 1.3);
        await randomDelay(Math.floor(delay), Math.floor(delay));

        // If mistake was made, correct it
        if (charToType !== char) {
          await randomDelay(
            this.config.typing.correctionDelay - 50,
            this.config.typing.correctionDelay + 50
          );

          // Backspace
          if (this.isPlaywright) {
            const page = this.page as PlaywrightPage;
            await page.keyboard.press('Backspace');
          } else {
            const page = this.page as PuppeteerPage;
            await page.keyboard.press('Backspace');
          }

          // Type correct character
          if (this.isPlaywright) {
            const page = this.page as PlaywrightPage;
            await page.keyboard.type(char, { delay: 0 });
          } else {
            const page = this.page as PuppeteerPage;
            await page.keyboard.type(char);
          }

          await randomDelay(Math.floor(delay), Math.floor(delay));
        }
      }
    } catch (error) {
      throw new Error(`Human type failed on ${selector}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Performs human-like scrolling
   *
   * @param distance - Distance to scroll in pixels (positive = down, negative = up)
   * @param options - Optional scroll configuration
   * @throws Error if scroll fails
   *
   * @example
   * ```typescript
   * await humanBehavior.humanScroll(500); // Scroll down 500px
   * await humanBehavior.humanScroll(-300, { direction: 'up' });
   * ```
   */
  async humanScroll(distance: number, options: ScrollOptions = {}): Promise<void> {
    try {
      const {
        direction = distance >= 0 ? 'down' : 'up',
        speedVariation,
        pauseProbability,
      } = options;

      const actualDistance = Math.abs(distance);
      const scrollDirection = direction === 'down' ? 1 : -1;

      // Get speed variation
      const speedMin = speedVariation?.min ?? this.config.scroll.speedVariation.min;
      const speedMax = speedVariation?.max ?? this.config.scroll.speedVariation.max;
      const speed = randomFloat(speedMin, speedMax);

      // Calculate scroll steps
      const steps = Math.max(5, Math.min(30, Math.floor(actualDistance / 50)));
      const stepSize = actualDistance / steps;
      const pauseProb = pauseProbability ?? this.config.scroll.pauseProbability;

      // Perform scroll in steps
      for (let i = 0; i < steps; i++) {
        const scrollAmount = stepSize * speed;
        const scrollY = scrollDirection * scrollAmount;

        // Add micro-scroll variation
        const microScroll = randomFloat(-this.config.scroll.microScrollAmount, this.config.scroll.microScrollAmount);
        const finalScroll = scrollY + microScroll;

        if (this.isPlaywright) {
          const page = this.page as PlaywrightPage;
          await page.mouse.wheel(0, finalScroll);
        } else {
          const page = this.page as PuppeteerPage;
          await page.evaluate((y) => {
            window.scrollBy(0, y);
          }, finalScroll);
        }

        // Random pause during scroll
        if (Math.random() < pauseProb) {
          await randomDelay(100, 500);
        } else {
          await randomDelay(10, 30);
        }
      }
    } catch (error) {
      throw new Error(`Human scroll failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Hovers over an element with human-like movement
   *
   * @param selector - CSS selector for the element to hover
   * @throws Error if element is not found or hover fails
   *
   * @example
   * ```typescript
   * await humanBehavior.humanHover('a.menu-item');
   * ```
   */
  async humanHover(selector: string): Promise<void> {
    try {
      // Wait for element
      if (this.isPlaywright) {
        const page = this.page as PlaywrightPage;
        await page.locator(selector).first().waitFor({ state: 'visible' });
      } else {
        const page = this.page as PuppeteerPage;
        await page.waitForSelector(selector, { visible: true });
      }

      // Get element bounds
      const bounds = await this.getElementBounds(selector);

      // Calculate hover position
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;

      // Move cursor using ghost-cursor if available
      if (this.cursor) {
        await this.cursor.move(centerX, centerY);
      } else {
        // Fallback: direct mouse move
        if (this.isPlaywright) {
          const page = this.page as PlaywrightPage;
          await page.mouse.move(centerX, centerY);
        } else {
          const page = this.page as PuppeteerPage;
          await page.mouse.move(centerX, centerY);
        }
      }

      // Small delay after hover
      await randomDelay(100, 300);
    } catch (error) {
      throw new Error(`Human hover failed on ${selector}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Performs random mouse movement to simulate human activity
   *
   * @throws Error if movement fails
   *
   * @example
   * ```typescript
   * await humanBehavior.randomMouseMovement();
   * ```
   */
  async randomMouseMovement(): Promise<void> {
    try {
      // Get viewport size
      let viewport: { width: number; height: number };
      if (this.isPlaywright) {
        const page = this.page as PlaywrightPage;
        viewport = page.viewportSize() || { width: 1920, height: 1080 };
      } else {
        const page = this.page as PuppeteerPage;
        viewport = await page.viewport() || { width: 1920, height: 1080 };
      }

      // Generate random target position
      const targetX = randomInt(100, viewport.width - 100);
      const targetY = randomInt(100, viewport.height - 100);

      // Move cursor using ghost-cursor if available
      if (this.cursor) {
        await this.cursor.move(targetX, targetY);
      } else {
        // Fallback: direct mouse move
        if (this.isPlaywright) {
          const page = this.page as PlaywrightPage;
          await page.mouse.move(targetX, targetY);
        } else {
          const page = this.page as PuppeteerPage;
          await page.mouse.move(targetX, targetY);
        }
      }

      // Random delay after movement
      await randomDelay(200, 800);
    } catch (error) {
      throw new Error(`Random mouse movement failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Simulates reading behavior with random delays
   *
   * @param duration - Optional duration in milliseconds (default: random based on config)
   * @throws Error if simulation fails
   *
   * @example
   * ```typescript
   * await humanBehavior.simulateReading(); // Random duration
   * await humanBehavior.simulateReading(5000); // 5 seconds
   * ```
   */
  async simulateReading(duration?: number): Promise<void> {
    try {
      const readingDuration = duration ?? randomInt(
        this.config.idleBehavior.randomMovementInterval.min,
        this.config.idleBehavior.randomMovementInterval.max
      );

      // Simulate reading with occasional micro-movements
      const steps = Math.floor(readingDuration / 1000);
      for (let i = 0; i < steps; i++) {
        // Small chance of micro-movement
        if (Math.random() < 0.1) {
          await this.randomMouseMovement();
        }
        await randomDelay(800, 1200);
      }

      // Remaining time
      const remaining = readingDuration % 1000;
      if (remaining > 0) {
        await randomDelay(Math.max(0, remaining - 100), remaining + 100);
      }
    } catch (error) {
      throw new Error(`Simulate reading failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Simulates thinking behavior with random delays
   *
   * @param duration - Optional duration in milliseconds (default: 500-2000ms)
   * @throws Error if simulation fails
   *
   * @example
   * ```typescript
   * await humanBehavior.simulateThinking(); // Random duration
   * await humanBehavior.simulateThinking(3000); // 3 seconds
   * ```
   */
  async simulateThinking(duration?: number): Promise<void> {
    try {
      const thinkingDuration = duration ?? randomInt(500, 2000);

      // Simulate thinking with occasional mouse wiggles
      if (Math.random() < this.config.idleBehavior.mouseWiggleProbability) {
        // Get viewport size for random position
        let viewport: { width: number; height: number };
        if (this.isPlaywright) {
          const page = this.page as PlaywrightPage;
          viewport = page.viewportSize() || { width: 1920, height: 1080 };
        } else {
          const page = this.page as PuppeteerPage;
          viewport = await page.viewport() || { width: 1920, height: 1080 };
        }

        // Small random movement within viewport
        const wiggleX = randomInt(Math.max(0, viewport.width / 2 - 50), Math.min(viewport.width, viewport.width / 2 + 50));
        const wiggleY = randomInt(Math.max(0, viewport.height / 2 - 50), Math.min(viewport.height, viewport.height / 2 + 50));

        if (this.cursor) {
          await this.cursor.move(wiggleX, wiggleY);
        } else if (this.isPlaywright) {
          const page = this.page as PlaywrightPage;
          await page.mouse.move(wiggleX, wiggleY, { steps: 5 });
        } else {
          const page = this.page as PuppeteerPage;
          await page.mouse.move(wiggleX, wiggleY, { steps: 5 });
        }
      }

      await randomDelay(Math.max(0, thinkingDuration - 200), thinkingDuration + 200);
    } catch (error) {
      throw new Error(`Simulate thinking failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Updates the configuration
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<HumanBehaviorConfig>): void {
    this.config = this.mergeConfig(config);
  }

  /**
   * Gets the current configuration
   *
   * @returns Current human behavior configuration
   */
  getConfig(): HumanBehaviorConfig {
    return { ...this.config };
  }
}
