/**
 * Type definitions for browser automation utilities
 */

export interface HumanBehaviorOptions {
  /** Enable human-like behavior */
  enabled: boolean;
  /** Mouse movement options */
  mouse?: MouseBehaviorOptions;
  /** Typing behavior options */
  typing?: TypingBehaviorOptions;
  /** Scroll behavior options */
  scroll?: ScrollBehaviorOptions;
}

export interface MouseBehaviorOptions {
  /** Number of steps for mouse movement (1-50) */
  steps?: number;
  /** Pixel jitter amount (0-20) */
  jitter?: number;
  /** Minimum delay between steps in ms */
  minDelay?: number;
  /** Maximum delay between steps in ms */
  maxDelay?: number;
  /** Movement strategy: 'bezier' (curved) or 'linear' (straight) */
  moveStrategy?: 'bezier' | 'linear';
  /** Safety limits */
  safety?: {
    maxSteps?: number;
    maxDurationMs?: number;
  };
}

export interface TypingBehaviorOptions {
  /** Minimum delay per character in ms */
  minDelay?: number;
  /** Maximum delay per character in ms */
  maxDelay?: number;
  /** Clear field before typing */
  clearFirst?: boolean;
  /** Add variation per character */
  perCharJitter?: boolean;
}

export interface ScrollBehaviorOptions {
  /** Smooth scrolling enabled */
  smooth?: boolean;
  /** Scroll speed multiplier (0.1-2.0) */
  speed?: number;
  /** Randomize scroll pauses */
  randomizePauses?: boolean;
}

export interface StealthConfig {
  /** Enable stealth mode */
  enabled: boolean;
  /** User agent string */
  userAgent?: string;
  /** Viewport configuration */
  viewport?: {
    width: number;
    height: number;
  };
  /** Additional stealth plugins */
  plugins?: string[];
}

export interface RandomizationConfig {
  /** Random delay range in ms */
  delayRange?: {
    min: number;
    max: number;
  };
  /** Random mouse offset in pixels */
  mouseOffset?: {
    x: number;
    y: number;
  };
  /** Randomize action timing */
  randomizeTiming?: boolean;
}

