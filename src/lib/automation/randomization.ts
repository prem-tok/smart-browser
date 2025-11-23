/**
 * Randomization utilities for browser automation
 * Provides various random number generation and array manipulation functions
 */

/**
 * Returns a promise that resolves after a random number of milliseconds
 * between min and max (inclusive).
 *
 * @param min - Minimum delay in milliseconds
 * @param max - Maximum delay in milliseconds
 * @returns Promise that resolves after random delay
 *
 * @example
 * ```typescript
 * await randomDelay(100, 500); // Waits 100-500ms
 * ```
 */
export function randomDelay(min: number, max: number): Promise<void> {
  const delay = randomInt(min, max);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Returns a random integer between min and max (inclusive).
 *
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns Random integer in range [min, max]
 *
 * @example
 * ```typescript
 * randomInt(1, 10); // Returns 1-10
 * randomInt(0, 100); // Returns 0-100
 * ```
 */
export function randomInt(min: number, max: number): number {
  if (min > max) {
    throw new Error('min must be less than or equal to max');
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Returns a random floating-point number between min (inclusive) and max (exclusive).
 *
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (exclusive)
 * @returns Random float in range [min, max)
 *
 * @example
 * ```typescript
 * randomFloat(0, 1); // Returns 0.0 to 0.999...
 * randomFloat(1.5, 2.5); // Returns 1.5 to 2.499...
 * ```
 */
export function randomFloat(min: number, max: number): number {
  if (min > max) {
    throw new Error('min must be less than or equal to max');
  }
  return Math.random() * (max - min) + min;
}

/**
 * Picks a random item from an array.
 *
 * @param array - Array to pick from
 * @returns Random item from the array, or undefined if array is empty
 *
 * @example
 * ```typescript
 * randomChoice([1, 2, 3, 4, 5]); // Returns one of the numbers
 * randomChoice(['a', 'b', 'c']); // Returns one of the strings
 * ```
 */
export function randomChoice<T>(array: T[]): T | undefined {
  if (array.length === 0) {
    return undefined;
  }
  const index = randomInt(0, array.length - 1);
  return array[index];
}

/**
 * Shuffles an array in-place using the Fisher-Yates shuffle algorithm.
 * Returns the shuffled array for chaining.
 *
 * @param array - Array to shuffle
 * @returns The shuffled array (same reference)
 *
 * @example
 * ```typescript
 * const arr = [1, 2, 3, 4, 5];
 * shuffleArray(arr); // arr is now shuffled
 * ```
 */
export function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generates a random number with normal (Gaussian) distribution using
 * the Box-Muller transform.
 *
 * @param mean - Mean of the distribution (default: 0)
 * @param stdDev - Standard deviation of the distribution (default: 1)
 * @returns Random number following normal distribution
 *
 * @example
 * ```typescript
 * gaussianRandom(0, 1); // Standard normal distribution
 * gaussianRandom(100, 15); // Mean 100, std dev 15
 * ```
 */
export function gaussianRandom(mean: number = 0, stdDev: number = 1): number {
  // Box-Muller transform
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
  while (v === 0) v = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + stdDev * z0;
}

/**
 * Returns a random boolean value with a given probability of being true.
 *
 * @param probability - Probability of returning true (0.0 to 1.0, default: 0.5)
 * @returns Random boolean value
 *
 * @example
 * ```typescript
 * randomBoolean(); // 50% chance of true
 * randomBoolean(0.3); // 30% chance of true
 * randomBoolean(1.0); // Always true
 * ```
 */
export function randomBoolean(probability: number = 0.5): boolean {
  if (probability < 0 || probability > 1) {
    throw new Error('Probability must be between 0 and 1');
  }
  return Math.random() < probability;
}
