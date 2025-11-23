/**
 * HumanAgent - Integration wrapper for @jarvis-agent (Eko framework)
 * Intercepts browser actions and replaces them with human behavior equivalents
 */

import { HumanBehavior, type BrowserPage } from './humanBehavior';
import type { HumanBehaviorConfig } from '@/config/humanBehaviorConfig';
import {
  defaultHumanBehaviorConfig,
  fastHumanBehaviorConfig,
  slowHumanBehaviorConfig,
  getHumanBehaviorConfig,
} from '@/config/humanBehaviorConfig';
import { randomDelay, randomInt } from './randomization';

/**
 * Human behavior intensity levels
 */
export type HumanBehaviorIntensity = 'low' | 'medium' | 'high' | 'off';

/**
 * Configuration for HumanAgent
 */
export interface HumanAgentConfig {
  /** Enable or disable human behavior */
  enabled: boolean;
  /** Intensity level of human behavior */
  intensity: HumanBehaviorIntensity;
  /** Custom behavior configuration (overrides intensity preset) */
  customConfig?: Partial<HumanBehaviorConfig>;
  /** Enable detailed logging */
  enableLogging?: boolean;
  /** Log file path (optional) */
  logFilePath?: string;
}

/**
 * Action log entry
 */
export interface ActionLogEntry {
  timestamp: number;
  action: string;
  selector?: string;
  text?: string;
  duration: number;
  success: boolean;
  error?: string;
  intensity: HumanBehaviorIntensity;
}

/**
 * HumanAgent class that wraps browser automation actions
 * Intercepts agent calls and applies human behavior
 */
export class HumanAgent {
  private config: HumanAgentConfig;
  private behaviorInstances: Map<string, HumanBehavior> = new Map();
  private actionLogs: ActionLogEntry[] = [];
  private maxLogEntries = 1000;

  /**
   * Creates a new HumanAgent instance
   *
   * @param config - HumanAgent configuration
   */
  constructor(config: HumanAgentConfig) {
    this.config = {
      enabled: config.enabled ?? true,
      intensity: config.intensity ?? 'medium',
      customConfig: config.customConfig,
      enableLogging: config.enableLogging ?? true,
      logFilePath: config.logFilePath,
    };
  }

  /**
   * Gets or creates a HumanBehavior instance for a page
   *
   * @param pageId - Unique identifier for the page
   * @param page - Browser page instance
   * @returns HumanBehavior instance
   */
  private getBehaviorInstance(pageId: string, page: BrowserPage): HumanBehavior | null {
    if (!this.config.enabled || this.config.intensity === 'off') {
      return null;
    }

    if (!this.behaviorInstances.has(pageId)) {
      const behaviorConfig = this.getBehaviorConfig();
      const behavior = new HumanBehavior(page, behaviorConfig);
      this.behaviorInstances.set(pageId, behavior);
      this.log('info', `Created HumanBehavior instance for page: ${pageId}`);
    }

    return this.behaviorInstances.get(pageId)!;
  }

  /**
   * Gets behavior configuration based on intensity level
   */
  private getBehaviorConfig(): Partial<HumanBehaviorConfig> {
    if (this.config.customConfig) {
      return this.config.customConfig;
    }

    switch (this.config.intensity) {
      case 'low':
        return this.getLowIntensityConfig();
      case 'high':
        return this.getHighIntensityConfig();
      case 'medium':
      default:
        return {}; // Use default config
    }
  }

  /**
   * Gets low intensity configuration (faster, less random)
   */
  private getLowIntensityConfig(): Partial<HumanBehaviorConfig> {
    return {
      mouseMovement: {
        ...fastHumanBehaviorConfig.mouseMovement,
        overshootProbability: 0.05,
        jitterAmount: 1,
      },
      click: {
        ...fastHumanBehaviorConfig.click,
        delayBeforeMin: 30,
        delayBeforeMax: 100,
        delayAfterMin: 50,
        delayAfterMax: 150,
        positionRandomnessRadius: 1,
      },
      typing: {
        ...fastHumanBehaviorConfig.typing,
        mistakeProbability: 0.005,
      },
      scroll: {
        ...fastHumanBehaviorConfig.scroll,
        pauseProbability: 0.02,
      },
      idleBehavior: {
        ...fastHumanBehaviorConfig.idleBehavior,
        mouseWiggleProbability: 0.1,
      },
    };
  }

  /**
   * Gets high intensity configuration (slower, more random)
   */
  private getHighIntensityConfig(): Partial<HumanBehaviorConfig> {
    return {
      mouseMovement: {
        ...slowHumanBehaviorConfig.mouseMovement,
        overshootProbability: 0.25,
        jitterAmount: 6,
      },
      click: {
        ...slowHumanBehaviorConfig.click,
        delayBeforeMin: 150,
        delayBeforeMax: 500,
        delayAfterMin: 250,
        delayAfterMax: 600,
        positionRandomnessRadius: 4,
      },
      typing: {
        ...slowHumanBehaviorConfig.typing,
        mistakeProbability: 0.08,
      },
      scroll: {
        ...slowHumanBehaviorConfig.scroll,
        pauseProbability: 0.3,
      },
      idleBehavior: {
        ...slowHumanBehaviorConfig.idleBehavior,
        mouseWiggleProbability: 0.5,
      },
    };
  }

  /**
   * Wraps a click action with human behavior
   *
   * @param pageId - Page identifier
   * @param page - Browser page instance
   * @param selector - Element selector
   * @param options - Click options
   * @returns Promise that resolves when click completes
   */
  async humanClick(
    pageId: string,
    page: BrowserPage,
    selector: string,
    options?: { timeout?: number; forceRaw?: boolean }
  ): Promise<void> {
    const startTime = Date.now();
    const behavior = this.getBehaviorInstance(pageId, page);

    if (!behavior || options?.forceRaw) {
      // Fallback to raw click
      const isPlaywright = typeof (page as any).context === 'function';
      if (isPlaywright) {
        await (page as any).click(selector, { timeout: options?.timeout });
      } else {
        await (page as any).click(selector, { timeout: options?.timeout });
      }
      this.logAction('click', selector, Date.now() - startTime, true, 'off');
      return;
    }

    try {
      this.log('info', `[HumanAgent] Human click: ${selector}`, { selector, intensity: this.config.intensity });
      await behavior.humanClick(selector, {
        waitForVisible: true,
        timeout: options?.timeout,
      });
      this.logAction('click', selector, Date.now() - startTime, true);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('error', `[HumanAgent] Click failed: ${errorMsg}`, { selector, error: errorMsg });
      this.logAction('click', selector, Date.now() - startTime, false, this.config.intensity, errorMsg);
      throw error;
    }
  }

  /**
   * Wraps a type action with human behavior
   *
   * @param pageId - Page identifier
   * @param page - Browser page instance
   * @param selector - Element selector
   * @param text - Text to type
   * @param options - Type options
   * @returns Promise that resolves when typing completes
   */
  async humanType(
    pageId: string,
    page: BrowserPage,
    selector: string,
    text: string,
    options?: { timeout?: number; forceRaw?: boolean }
  ): Promise<void> {
    const startTime = Date.now();
    const behavior = this.getBehaviorInstance(pageId, page);

    if (!behavior || options?.forceRaw) {
      // Fallback to raw type
      const isPlaywright = typeof (page as any).context === 'function';
      if (isPlaywright) {
        await (page as any).fill(selector, text);
      } else {
        await (page as any).type(selector, text);
      }
      this.logAction('type', selector, Date.now() - startTime, true, 'off', undefined, text);
      return;
    }

    try {
      this.log('info', `[HumanAgent] Human type: ${selector} (${text.length} chars)`, {
        selector,
        textLength: text.length,
        intensity: this.config.intensity,
      });
      await behavior.humanType(selector, text, {
        clearFirst: true,
        waitForVisible: true,
        timeout: options?.timeout,
      });
      this.logAction('type', selector, Date.now() - startTime, true, this.config.intensity, undefined, text);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('error', `[HumanAgent] Type failed: ${errorMsg}`, { selector, error: errorMsg });
      this.logAction('type', selector, Date.now() - startTime, false, this.config.intensity, errorMsg, text);
      throw error;
    }
  }

  /**
   * Wraps a scroll action with human behavior
   *
   * @param pageId - Page identifier
   * @param page - Browser page instance
   * @param distance - Scroll distance in pixels
   * @param options - Scroll options
   * @returns Promise that resolves when scroll completes
   */
  async humanScroll(
    pageId: string,
    page: BrowserPage,
    distance: number,
    options?: { direction?: 'down' | 'up'; forceRaw?: boolean }
  ): Promise<void> {
    const startTime = Date.now();
    const behavior = this.getBehaviorInstance(pageId, page);

    if (!behavior || options?.forceRaw) {
      // Fallback to raw scroll
      const isPlaywright = typeof (page as any).context === 'function';
      if (isPlaywright) {
        await (page as any).mouse.wheel(0, distance);
      } else {
        await (page as any).evaluate((d: number) => window.scrollBy(0, d), distance);
      }
      this.logAction('scroll', undefined, Date.now() - startTime, true, 'off');
      return;
    }

    try {
      this.log('info', `[HumanAgent] Human scroll: ${distance}px`, {
        distance,
        direction: options?.direction,
        intensity: this.config.intensity,
      });
      await behavior.humanScroll(distance, {
        direction: options?.direction,
      });
      this.logAction('scroll', undefined, Date.now() - startTime, true);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('error', `[HumanAgent] Scroll failed: ${errorMsg}`, { distance, error: errorMsg });
      this.logAction('scroll', undefined, Date.now() - startTime, false, this.config.intensity, errorMsg);
      throw error;
    }
  }

  /**
   * Wraps a hover action with human behavior
   *
   * @param pageId - Page identifier
   * @param page - Browser page instance
   * @param selector - Element selector
   * @returns Promise that resolves when hover completes
   */
  async humanHover(
    pageId: string,
    page: BrowserPage,
    selector: string
  ): Promise<void> {
    const startTime = Date.now();
    const behavior = this.getBehaviorInstance(pageId, page);

    if (!behavior) {
      // Fallback to raw hover
      const isPlaywright = typeof (page as any).context === 'function';
      if (isPlaywright) {
        await (page as any).hover(selector);
      } else {
        await (page as any).hover(selector);
      }
      this.logAction('hover', selector, Date.now() - startTime, true, 'off');
      return;
    }

    try {
      this.log('info', `[HumanAgent] Human hover: ${selector}`, { selector, intensity: this.config.intensity });
      await behavior.humanHover(selector);
      this.logAction('hover', selector, Date.now() - startTime, true);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log('error', `[HumanAgent] Hover failed: ${errorMsg}`, { selector, error: errorMsg });
      this.logAction('hover', selector, Date.now() - startTime, false, this.config.intensity, errorMsg);
      throw error;
    }
  }

  /**
   * Adds random delay based on intensity
   *
   * @param min - Minimum delay in milliseconds
   * @param max - Maximum delay in milliseconds
   * @returns Promise that resolves after delay
   */
  async randomDelay(min: number, max: number): Promise<void> {
    if (!this.config.enabled || this.config.intensity === 'off') {
      return;
    }

    // Adjust delay based on intensity
    let adjustedMin = min;
    let adjustedMax = max;

    switch (this.config.intensity) {
      case 'low':
        adjustedMin = min * 0.5;
        adjustedMax = max * 0.7;
        break;
      case 'high':
        adjustedMin = min * 1.5;
        adjustedMax = max * 2.0;
        break;
    }

    await randomDelay(adjustedMin, adjustedMax);
  }

  /**
   * Simulates reading behavior
   *
   * @param pageId - Page identifier
   * @param page - Browser page instance
   * @param duration - Optional duration in milliseconds
   * @returns Promise that resolves after reading simulation
   */
  async simulateReading(
    pageId: string,
    page: BrowserPage,
    duration?: number
  ): Promise<void> {
    const behavior = this.getBehaviorInstance(pageId, page);
    if (behavior) {
      await behavior.simulateReading(duration);
    }
  }

  /**
   * Simulates thinking behavior
   *
   * @param pageId - Page identifier
   * @param page - Browser page instance
   * @param duration - Optional duration in milliseconds
   * @returns Promise that resolves after thinking simulation
   */
  async simulateThinking(
    pageId: string,
    page: BrowserPage,
    duration?: number
  ): Promise<void> {
    const behavior = this.getBehaviorInstance(pageId, page);
    if (behavior) {
      await behavior.simulateThinking(duration);
    }
  }

  /**
   * Updates the configuration
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<HumanAgentConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      customConfig: config.customConfig || this.config.customConfig,
    };

    // Clear behavior instances to force recreation with new config
    this.behaviorInstances.clear();
    this.log('info', `[HumanAgent] Configuration updated`, { config: this.config });
  }

  /**
   * Gets the current configuration
   *
   * @returns Current configuration
   */
  getConfig(): HumanAgentConfig {
    return { ...this.config };
  }

  /**
   * Enables human behavior
   */
  enable(): void {
    this.config.enabled = true;
    this.log('info', '[HumanAgent] Human behavior enabled');
  }

  /**
   * Disables human behavior
   */
  disable(): void {
    this.config.enabled = false;
    this.log('info', '[HumanAgent] Human behavior disabled');
  }

  /**
   * Sets the intensity level
   *
   * @param intensity - Intensity level
   */
  setIntensity(intensity: HumanBehaviorIntensity): void {
    this.config.intensity = intensity;
    this.behaviorInstances.clear(); // Clear instances to use new intensity
    this.log('info', `[HumanAgent] Intensity set to: ${intensity}`);
  }

  /**
   * Removes a behavior instance (cleanup)
   *
   * @param pageId - Page identifier
   */
  removeBehaviorInstance(pageId: string): void {
    this.behaviorInstances.delete(pageId);
    this.log('info', `[HumanAgent] Removed behavior instance: ${pageId}`);
  }

  /**
   * Gets action logs
   *
   * @param limit - Maximum number of logs to return
   * @returns Array of action log entries
   */
  getActionLogs(limit?: number): ActionLogEntry[] {
    const logs = [...this.actionLogs];
    if (limit) {
      return logs.slice(-limit);
    }
    return logs;
  }

  /**
   * Clears action logs
   */
  clearActionLogs(): void {
    this.actionLogs = [];
    this.log('info', '[HumanAgent] Action logs cleared');
  }

  /**
   * Logs an action
   */
  private logAction(
    action: string,
    selector?: string,
    duration: number = 0,
    success: boolean = true,
    intensity: HumanBehaviorIntensity = this.config.intensity,
    error?: string,
    text?: string
  ): void {
    if (!this.config.enableLogging) {
      return;
    }

    const entry: ActionLogEntry = {
      timestamp: Date.now(),
      action,
      selector,
      text: text ? (text.length > 100 ? `${text.substring(0, 100)}...` : text) : undefined,
      duration,
      success,
      error,
      intensity,
    };

    this.actionLogs.push(entry);

    // Keep only last N entries
    if (this.actionLogs.length > this.maxLogEntries) {
      this.actionLogs = this.actionLogs.slice(-this.maxLogEntries);
    }
  }

  /**
   * Internal logging method
   */
  private log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    if (!this.config.enableLogging) {
      return;
    }

    const prefix = '[HumanAgent]';
    const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;

    switch (level) {
      case 'error':
        console.error(prefix, logMessage);
        break;
      case 'warn':
        console.warn(prefix, logMessage);
        break;
      default:
        console.log(prefix, logMessage);
    }
  }
}

/**
 * Global HumanAgent instance (singleton pattern)
 */
let globalHumanAgent: HumanAgent | null = null;

/**
 * Gets or creates the global HumanAgent instance
 *
 * @param config - Optional configuration (only used on first call)
 * @returns Global HumanAgent instance
 */
export function getHumanAgent(config?: HumanAgentConfig): HumanAgent {
  if (!globalHumanAgent && config) {
    globalHumanAgent = new HumanAgent(config);
  } else if (!globalHumanAgent) {
    // Default configuration
    globalHumanAgent = new HumanAgent({
      enabled: true,
      intensity: 'medium',
      enableLogging: true,
    });
  }
  return globalHumanAgent;
}

/**
 * Sets the global HumanAgent instance
 *
 * @param agent - HumanAgent instance
 */
export function setHumanAgent(agent: HumanAgent): void {
  globalHumanAgent = agent;
}

