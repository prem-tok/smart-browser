/**
 * BatchExecutor class for handling bulk automation tasks
 * Provides randomized execution, delays, breaks, error handling, and progress tracking
 */

import { shuffleArray, randomDelay, randomInt } from './randomization';

/**
 * Represents a single task in a batch execution
 */
export interface BatchTask<T = any> {
  /** Unique identifier for the task */
  id: string;
  /** Target data for the task (e.g., user ID, URL, etc.) */
  target: T;
  /** Optional metadata for the task */
  metadata?: Record<string, any>;
}

/**
 * Options for batch execution
 */
export interface BatchExecutionOptions {
  /** Delay range between actions in milliseconds */
  delayRange?: {
    min: number;
    max: number;
  };
  /** Number of actions before taking a break */
  breakAfter?: number;
  /** Break duration range in milliseconds */
  breakDuration?: {
    min: number;
    max: number;
  };
  /** Maximum number of retries for failed tasks */
  maxRetries?: number;
  /** Delay before retry in milliseconds */
  retryDelay?: number;
  /** Whether to skip tasks on failure (instead of retrying) */
  skipOnFailure?: boolean;
  /** Whether to randomize execution order */
  randomizeOrder?: boolean;
  /** Maximum number of concurrent tasks (for future parallel execution) */
  concurrency?: number;
  /** Whether to continue execution after errors */
  continueOnError?: boolean;
}

/**
 * Progress callback function type
 *
 * @param progress - Progress information
 */
export type BatchProgressCallback = (progress: BatchProgress) => void;

/**
 * Progress information for batch execution
 */
export interface BatchProgress {
  /** Current task index (0-based) */
  currentIndex: number;
  /** Total number of tasks */
  total: number;
  /** Number of completed tasks */
  completed: number;
  /** Number of successful tasks */
  successful: number;
  /** Number of failed tasks */
  failed: number;
  /** Number of skipped tasks */
  skipped: number;
  /** Current task being executed */
  currentTask?: BatchTask;
  /** Percentage complete (0-100) */
  percentage: number;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
  /** Average time per task in milliseconds */
  averageTimePerTask?: number;
}

/**
 * Result of a single task execution
 */
export interface TaskResult<T = any> {
  /** Task that was executed */
  task: BatchTask<T>;
  /** Whether the task succeeded */
  success: boolean;
  /** Error message if task failed */
  error?: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Number of retries attempted */
  retries: number;
  /** Optional result data */
  result?: any;
}

/**
 * Overall batch execution result
 */
export interface BatchResult<T = any> {
  /** All task results */
  results: TaskResult<T>[];
  /** Summary statistics */
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    totalTime: number;
    averageTime: number;
  };
  /** Whether execution was paused */
  paused: boolean;
  /** Whether execution was cancelled */
  cancelled: boolean;
}

/**
 * Action function type for batch execution
 *
 * @param target - Target data for the action
 * @param task - Full task information
 * @returns Promise that resolves when action completes
 */
export type BatchAction<T = any> = (target: T, task: BatchTask<T>) => Promise<any>;

/**
 * BatchExecutor class for executing bulk automation tasks
 *
 * @example
 * ```typescript
 * const executor = new BatchExecutor();
 *
 * const tasks: BatchTask[] = [
 *   { id: '1', target: 'user1' },
 *   { id: '2', target: 'user2' },
 * ];
 *
 * await executor.execute(tasks, async (target) => {
 *   // Perform action on target
 *   await sendConnectionRequest(target);
 * }, {
 *   delayRange: { min: 1000, max: 3000 },
 *   breakAfter: 5,
 *   maxRetries: 2,
 * });
 * ```
 */
export class BatchExecutor<T = any> {
  private isPaused: boolean = false;
  private isCancelled: boolean = false;
  private pauseResumePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;
  private startTime: number = 0;
  private progressCallback: BatchProgressCallback | null = null;
  private executionLog: Array<{
    timestamp: number;
    level: 'info' | 'warn' | 'error' | 'success';
    message: string;
    taskId?: string;
  }> = [];

  /**
   * Executes a batch of tasks with the specified action function
   *
   * @param tasks - Array of tasks to execute
   * @param action - Action function to execute for each task
   * @param options - Execution options
   * @param progressCallback - Optional progress callback
   * @returns Promise that resolves with batch execution results
   * @throws Error if execution fails critically
   */
  async execute(
    tasks: BatchTask<T>[],
    action: BatchAction<T>,
    options: BatchExecutionOptions = {},
    progressCallback?: BatchProgressCallback
  ): Promise<BatchResult<T>> {
    // Reset state
    this.isPaused = false;
    this.isCancelled = false;
    this.startTime = Date.now();
    this.progressCallback = progressCallback || null;
    this.executionLog = [];

    // Apply default options
    const opts: Required<BatchExecutionOptions> = {
      delayRange: options.delayRange || { min: 1000, max: 3000 },
      breakAfter: options.breakAfter ?? 10,
      breakDuration: options.breakDuration || { min: 5000, max: 15000 },
      maxRetries: options.maxRetries ?? 2,
      retryDelay: options.retryDelay ?? 2000,
      skipOnFailure: options.skipOnFailure ?? false,
      randomizeOrder: options.randomizeOrder ?? true,
      concurrency: options.concurrency ?? 1,
      continueOnError: options.continueOnError ?? true,
    };

    this.log('info', `Starting batch execution with ${tasks.length} tasks`);

    // Randomize order if requested
    let executionOrder = [...tasks];
    if (opts.randomizeOrder) {
      executionOrder = shuffleArray([...tasks]);
      this.log('info', 'Task order randomized');
    }

    const results: TaskResult<T>[] = [];
    let completed = 0;
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    // Execute tasks sequentially
    for (let i = 0; i < executionOrder.length; i++) {
      // Check if cancelled
      if (this.isCancelled) {
        this.log('warn', 'Execution cancelled by user');
        break;
      }

      // Wait if paused
      await this.waitIfPaused();

      const task = executionOrder[i];
      const taskStartTime = Date.now();

      this.log('info', `Executing task ${i + 1}/${executionOrder.length}: ${task.id}`, task.id);

      // Execute task with retry logic
      const taskResult = await this.executeTaskWithRetry(
        task,
        action,
        opts.maxRetries,
        opts.retryDelay,
        opts.skipOnFailure
      );

      const executionTime = Date.now() - taskStartTime;
      taskResult.executionTime = executionTime;

      results.push(taskResult);

      // Update statistics
      completed++;
      if (taskResult.success) {
        successful++;
        this.log('success', `Task ${task.id} completed successfully`, task.id);
      } else if (taskResult.error?.includes('skipped')) {
        skipped++;
        this.log('warn', `Task ${task.id} skipped: ${taskResult.error}`, task.id);
      } else {
        failed++;
        this.log('error', `Task ${task.id} failed: ${taskResult.error}`, task.id);
      }

      // Report progress
      this.reportProgress({
        currentIndex: i,
        total: executionOrder.length,
        completed,
        successful,
        failed,
        skipped,
        currentTask: task,
        percentage: Math.round((completed / executionOrder.length) * 100),
        estimatedTimeRemaining: this.calculateEstimatedTime(completed, executionOrder.length),
        averageTimePerTask: this.calculateAverageTime(completed),
      });

      // Take a break if needed
      if (opts.breakAfter > 0 && completed % opts.breakAfter === 0 && i < executionOrder.length - 1) {
        const breakDuration = randomInt(opts.breakDuration.min, opts.breakDuration.max);
        this.log('info', `Taking break after ${completed} tasks (${breakDuration}ms)`);
        await this.waitIfPaused();
        await randomDelay(breakDuration, breakDuration);
      }

      // Delay between actions (except for last task)
      if (i < executionOrder.length - 1 && !this.isCancelled) {
        const delay = randomInt(opts.delayRange.min, opts.delayRange.max);
        await this.waitIfPaused();
        await randomDelay(delay, delay);
      }
    }

    const totalTime = Date.now() - this.startTime;
    const averageTime = completed > 0 ? totalTime / completed : 0;

    this.log('info', `Batch execution completed: ${successful} successful, ${failed} failed, ${skipped} skipped`);

    return {
      results,
      summary: {
        total: executionOrder.length,
        successful,
        failed,
        skipped,
        totalTime,
        averageTime,
      },
      paused: this.isPaused,
      cancelled: this.isCancelled,
    };
  }

  /**
   * Executes a single task with retry logic
   */
  private async executeTaskWithRetry(
    task: BatchTask<T>,
    action: BatchAction<T>,
    maxRetries: number,
    retryDelay: number,
    skipOnFailure: boolean
  ): Promise<TaskResult<T>> {
    let retries = 0;
    let lastError: Error | null = null;

    while (retries <= maxRetries) {
      try {
        // Check if cancelled or paused
        if (this.isCancelled) {
          return {
            task,
            success: false,
            error: 'Task cancelled',
            executionTime: 0,
            retries,
          };
        }

        await this.waitIfPaused();

        // Execute action
        const result = await action(task.target, task);

        return {
          task,
          success: true,
          executionTime: 0, // Will be set by caller
          retries,
          result,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Skip on failure if configured
        if (skipOnFailure && retries === 0) {
          return {
            task,
            success: false,
            error: `Skipped: ${lastError.message}`,
            executionTime: 0,
            retries: 0,
          };
        }

        // Retry if attempts remaining
        if (retries < maxRetries) {
          retries++;
          this.log('warn', `Task ${task.id} failed, retrying (${retries}/${maxRetries})`, task.id);
          await randomDelay(retryDelay, retryDelay);
        } else {
          // Max retries reached
          return {
            task,
            success: false,
            error: lastError.message,
            executionTime: 0,
            retries,
          };
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    return {
      task,
      success: false,
      error: lastError?.message || 'Unknown error',
      executionTime: 0,
      retries,
    };
  }

  /**
   * Reports progress to the callback
   */
  private reportProgress(progress: BatchProgress): void {
    if (this.progressCallback) {
      try {
        this.progressCallback(progress);
      } catch (error) {
        // Don't let progress callback errors break execution
        console.warn('[BatchExecutor] Progress callback error:', error);
      }
    }
  }

  /**
   * Calculates estimated time remaining
   */
  private calculateEstimatedTime(completed: number, total: number): number | undefined {
    if (completed === 0) {
      return undefined;
    }

    const elapsed = Date.now() - this.startTime;
    const averageTimePerTask = elapsed / completed;
    const remaining = total - completed;

    return Math.round(averageTimePerTask * remaining);
  }

  /**
   * Calculates average time per task
   */
  private calculateAverageTime(completed: number): number | undefined {
    if (completed === 0) {
      return undefined;
    }

    const elapsed = Date.now() - this.startTime;
    return Math.round(elapsed / completed);
  }

  /**
   * Waits if execution is paused
   */
  private async waitIfPaused(): Promise<void> {
    while (this.isPaused && !this.isCancelled) {
      if (!this.pauseResumePromise) {
        this.pauseResumePromise = new Promise<void>((resolve) => {
          this.pauseResolve = resolve;
        });
      }
      await this.pauseResumePromise;
      this.pauseResumePromise = null;
      this.pauseResolve = null;
    }
  }

  /**
   * Pauses the batch execution
   *
   * @example
   * ```typescript
   * executor.pause();
   * // Execution will pause after current task completes
   * ```
   */
  pause(): void {
    if (!this.isPaused) {
      this.isPaused = true;
      this.log('info', 'Execution paused');
    }
  }

  /**
   * Resumes the batch execution
   *
   * @example
   * ```typescript
   * executor.resume();
   * // Execution will resume from where it paused
   * ```
   */
  resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      this.log('info', 'Execution resumed');
      if (this.pauseResolve) {
        this.pauseResolve();
        this.pauseResolve = null;
        this.pauseResumePromise = null;
      }
    }
  }

  /**
   * Cancels the batch execution
   *
   * @example
   * ```typescript
   * executor.cancel();
   * // Execution will stop after current task completes
   * ```
   */
  cancel(): void {
    if (!this.isCancelled) {
      this.isCancelled = true;
      this.isPaused = false; // Cancel also resumes if paused
      this.log('warn', 'Execution cancelled');
      if (this.pauseResolve) {
        this.pauseResolve();
        this.pauseResolve = null;
        this.pauseResumePromise = null;
      }
    }
  }

  /**
   * Checks if execution is currently paused
   *
   * @returns True if paused, false otherwise
   */
  isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Checks if execution is cancelled
   *
   * @returns True if cancelled, false otherwise
   */
  isCancelledState(): boolean {
    return this.isCancelled;
  }

  /**
   * Gets the execution log
   *
   * @returns Array of log entries
   */
  getLog(): Array<{
    timestamp: number;
    level: 'info' | 'warn' | 'error' | 'success';
    message: string;
    taskId?: string;
  }> {
    return [...this.executionLog];
  }

  /**
   * Clears the execution log
   */
  clearLog(): void {
    this.executionLog = [];
  }

  /**
   * Logs a message
   */
  private log(
    level: 'info' | 'warn' | 'error' | 'success',
    message: string,
    taskId?: string
  ): void {
    const entry = {
      timestamp: Date.now(),
      level,
      message,
      taskId,
    };

    this.executionLog.push(entry);

    // Also log to console
    const prefix = taskId ? `[BatchExecutor:${taskId}]` : '[BatchExecutor]';
    const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[consoleMethod](`${prefix} ${message}`);
  }
}

