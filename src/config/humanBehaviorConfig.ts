/**
 * Human behavior configuration for browser automation
 * Centralized configuration for human-like automation behaviors
 */

/**
 * Mouse movement settings
 */
export interface MouseMovementConfig {
  /** Movement speed in pixels per second */
  movementSpeed: number;
  /** Probability of overshooting the target (0.0 to 1.0) */
  overshootProbability: number;
  /** Maximum overshoot distance in pixels */
  overshootDistance: number;
  /** Jitter amount in pixels (random variation added to movement) */
  jitterAmount: number;
}

/**
 * Click settings
 */
export interface ClickConfig {
  /** Minimum delay before click in milliseconds */
  delayBeforeMin: number;
  /** Maximum delay before click in milliseconds */
  delayBeforeMax: number;
  /** Minimum delay after click in milliseconds */
  delayAfterMin: number;
  /** Maximum delay after click in milliseconds */
  delayAfterMax: number;
  /** Randomness radius in pixels for click position variation */
  positionRandomnessRadius: number;
}

/**
 * Typing settings
 */
export interface TypingConfig {
  /** Minimum typing speed in words per minute (WPM) */
  wpmMin: number;
  /** Maximum typing speed in words per minute (WPM) */
  wpmMax: number;
  /** Probability of making a typing mistake (0.0 to 1.0) */
  mistakeProbability: number;
  /** Delay in milliseconds before correcting a mistake */
  correctionDelay: number;
}

/**
 * Scroll settings
 */
export interface ScrollConfig {
  /** Scroll speed variation multiplier (0.5 = 50% slower, 1.5 = 50% faster) */
  speedVariation: {
    min: number;
    max: number;
  };
  /** Probability of pausing during scroll (0.0 to 1.0) */
  pauseProbability: number;
  /** Amount of micro-scroll in pixels (small random scrolls) */
  microScrollAmount: number;
}

/**
 * Idle behavior settings
 */
export interface IdleBehaviorConfig {
  /** Random movement interval in milliseconds (min, max) */
  randomMovementInterval: {
    min: number;
    max: number;
  };
  /** Probability of mouse wiggle during idle (0.0 to 1.0) */
  mouseWiggleProbability: number;
}

/**
 * Complete human behavior configuration
 */
export interface HumanBehaviorConfig {
  /** Mouse movement settings */
  mouseMovement: MouseMovementConfig;
  /** Click settings */
  click: ClickConfig;
  /** Typing settings */
  typing: TypingConfig;
  /** Scroll settings */
  scroll: ScrollConfig;
  /** Idle behavior settings */
  idleBehavior: IdleBehaviorConfig;
}

/**
 * Default human behavior configuration
 * Balanced settings for natural human-like behavior
 */
export const defaultHumanBehaviorConfig: HumanBehaviorConfig = {
  mouseMovement: {
    movementSpeed: 800, // pixels per second
    overshootProbability: 0.15, // 15% chance of overshooting
    overshootDistance: 10, // pixels
    jitterAmount: 3, // pixels
  },
  click: {
    delayBeforeMin: 50, // milliseconds
    delayBeforeMax: 200, // milliseconds
    delayAfterMin: 100, // milliseconds
    delayAfterMax: 300, // milliseconds
    positionRandomnessRadius: 2, // pixels
  },
  typing: {
    wpmMin: 40, // words per minute
    wpmMax: 80, // words per minute
    mistakeProbability: 0.02, // 2% chance of mistake
    correctionDelay: 200, // milliseconds
  },
  scroll: {
    speedVariation: {
      min: 0.7,
      max: 1.3,
    },
    pauseProbability: 0.1, // 10% chance of pausing
    microScrollAmount: 5, // pixels
  },
  idleBehavior: {
    randomMovementInterval: {
      min: 3000, // 3 seconds
      max: 8000, // 8 seconds
    },
    mouseWiggleProbability: 0.3, // 30% chance of wiggle
  },
};

/**
 * Fast human behavior configuration
 * Faster movements and actions for quicker automation
 */
export const fastHumanBehaviorConfig: HumanBehaviorConfig = {
  mouseMovement: {
    movementSpeed: 1200, // pixels per second
    overshootProbability: 0.1, // 10% chance
    overshootDistance: 5, // pixels
    jitterAmount: 2, // pixels
  },
  click: {
    delayBeforeMin: 30, // milliseconds
    delayBeforeMax: 100, // milliseconds
    delayAfterMin: 50, // milliseconds
    delayAfterMax: 150, // milliseconds
    positionRandomnessRadius: 1, // pixels
  },
  typing: {
    wpmMin: 60, // words per minute
    wpmMax: 100, // words per minute
    mistakeProbability: 0.01, // 1% chance
    correctionDelay: 150, // milliseconds
  },
  scroll: {
    speedVariation: {
      min: 0.9,
      max: 1.5,
    },
    pauseProbability: 0.05, // 5% chance
    microScrollAmount: 3, // pixels
  },
  idleBehavior: {
    randomMovementInterval: {
      min: 2000, // 2 seconds
      max: 5000, // 5 seconds
    },
    mouseWiggleProbability: 0.2, // 20% chance
  },
};

/**
 * Slow human behavior configuration
 * Slower, more deliberate movements for maximum realism
 */
export const slowHumanBehaviorConfig: HumanBehaviorConfig = {
  mouseMovement: {
    movementSpeed: 500, // pixels per second
    overshootProbability: 0.2, // 20% chance
    overshootDistance: 15, // pixels
    jitterAmount: 5, // pixels
  },
  click: {
    delayBeforeMin: 100, // milliseconds
    delayBeforeMax: 400, // milliseconds
    delayAfterMin: 200, // milliseconds
    delayAfterMax: 500, // milliseconds
    positionRandomnessRadius: 3, // pixels
  },
  typing: {
    wpmMin: 25, // words per minute
    wpmMax: 50, // words per minute
    mistakeProbability: 0.05, // 5% chance
    correctionDelay: 300, // milliseconds
  },
  scroll: {
    speedVariation: {
      min: 0.5,
      max: 1.1,
    },
    pauseProbability: 0.2, // 20% chance
    microScrollAmount: 8, // pixels
  },
  idleBehavior: {
    randomMovementInterval: {
      min: 5000, // 5 seconds
      max: 12000, // 12 seconds
    },
    mouseWiggleProbability: 0.4, // 40% chance
  },
};

/**
 * Get human behavior configuration based on preset name
 *
 * @param preset - Preset name: 'default', 'fast', 'slow', or 'custom'
 * @param customConfig - Optional custom configuration to merge
 * @returns Human behavior configuration
 */
export function getHumanBehaviorConfig(
  preset: 'default' | 'fast' | 'slow' | 'custom' = 'default',
  customConfig?: Partial<HumanBehaviorConfig>
): HumanBehaviorConfig {
  let baseConfig: HumanBehaviorConfig;

  switch (preset) {
    case 'fast':
      baseConfig = fastHumanBehaviorConfig;
      break;
    case 'slow':
      baseConfig = slowHumanBehaviorConfig;
      break;
    case 'custom':
      baseConfig = customConfig as HumanBehaviorConfig || defaultHumanBehaviorConfig;
      break;
    default:
      baseConfig = defaultHumanBehaviorConfig;
  }

  if (customConfig) {
    return {
      ...baseConfig,
      ...customConfig,
      mouseMovement: { ...baseConfig.mouseMovement, ...customConfig.mouseMovement },
      click: { ...baseConfig.click, ...customConfig.click },
      typing: { ...baseConfig.typing, ...customConfig.typing },
      scroll: {
        ...baseConfig.scroll,
        ...customConfig.scroll,
        speedVariation: {
          ...baseConfig.scroll.speedVariation,
          ...customConfig.scroll?.speedVariation,
        },
      },
      idleBehavior: {
        ...baseConfig.idleBehavior,
        ...customConfig.idleBehavior,
        randomMovementInterval: {
          ...baseConfig.idleBehavior.randomMovementInterval,
          ...customConfig.idleBehavior?.randomMovementInterval,
        },
      },
    };
  }

  return baseConfig;
}

/**
 * Validate human behavior configuration
 *
 * @param config - Configuration to validate
 * @returns Validation result with errors if any
 */
export function validateHumanBehaviorConfig(
  config: HumanBehaviorConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate mouse movement
  if (config.mouseMovement.movementSpeed <= 0) {
    errors.push('Mouse movement speed must be greater than 0');
  }
  if (config.mouseMovement.overshootProbability < 0 || config.mouseMovement.overshootProbability > 1) {
    errors.push('Overshoot probability must be between 0 and 1');
  }
  if (config.mouseMovement.overshootDistance < 0) {
    errors.push('Overshoot distance must be non-negative');
  }
  if (config.mouseMovement.jitterAmount < 0) {
    errors.push('Jitter amount must be non-negative');
  }

  // Validate click settings
  if (config.click.delayBeforeMin < 0 || config.click.delayBeforeMax < 0) {
    errors.push('Click delays must be non-negative');
  }
  if (config.click.delayBeforeMin > config.click.delayBeforeMax) {
    errors.push('Click delayBeforeMin must be less than or equal to delayBeforeMax');
  }
  if (config.click.delayAfterMin > config.click.delayAfterMax) {
    errors.push('Click delayAfterMin must be less than or equal to delayAfterMax');
  }
  if (config.click.positionRandomnessRadius < 0) {
    errors.push('Click position randomness radius must be non-negative');
  }

  // Validate typing settings
  if (config.typing.wpmMin <= 0 || config.typing.wpmMax <= 0) {
    errors.push('Typing WPM must be greater than 0');
  }
  if (config.typing.wpmMin > config.typing.wpmMax) {
    errors.push('Typing wpmMin must be less than or equal to wpmMax');
  }
  if (config.typing.mistakeProbability < 0 || config.typing.mistakeProbability > 1) {
    errors.push('Mistake probability must be between 0 and 1');
  }
  if (config.typing.correctionDelay < 0) {
    errors.push('Correction delay must be non-negative');
  }

  // Validate scroll settings
  if (config.scroll.speedVariation.min <= 0 || config.scroll.speedVariation.max <= 0) {
    errors.push('Scroll speed variation must be greater than 0');
  }
  if (config.scroll.speedVariation.min > config.scroll.speedVariation.max) {
    errors.push('Scroll speedVariation.min must be less than or equal to max');
  }
  if (config.scroll.pauseProbability < 0 || config.scroll.pauseProbability > 1) {
    errors.push('Scroll pause probability must be between 0 and 1');
  }
  if (config.scroll.microScrollAmount < 0) {
    errors.push('Micro scroll amount must be non-negative');
  }

  // Validate idle behavior
  if (config.idleBehavior.randomMovementInterval.min < 0 || config.idleBehavior.randomMovementInterval.max < 0) {
    errors.push('Random movement interval must be non-negative');
  }
  if (config.idleBehavior.randomMovementInterval.min > config.idleBehavior.randomMovementInterval.max) {
    errors.push('Random movement interval min must be less than or equal to max');
  }
  if (config.idleBehavior.mouseWiggleProbability < 0 || config.idleBehavior.mouseWiggleProbability > 1) {
    errors.push('Mouse wiggle probability must be between 0 and 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a custom configuration by merging with defaults
 *
 * @param overrides - Partial configuration to override defaults
 * @returns Complete configuration with overrides applied
 */
export function createCustomConfig(
  overrides: Partial<HumanBehaviorConfig>
): HumanBehaviorConfig {
  return getHumanBehaviorConfig('default', overrides);
}
