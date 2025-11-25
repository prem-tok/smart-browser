/**
 * Workflow Executor for Browser Agent
 * 
 * Implements step-by-step execution pattern similar to Smart-agent.
 * After navigation, continues executing workflow steps automatically.
 */

import { Log } from "@jarvis-agent/core";
import type { AgentContext } from "@jarvis-agent/core";

export interface WorkflowStep {
  type: 'navigate' | 'click' | 'type' | 'wait' | 'scroll';
  url?: string;
  index?: number;
  text?: string;
  duration?: number;
  selector?: string;
  description?: string;
}

export interface WorkflowExecutionResult {
  success: boolean;
  stepIndex: number;
  stepType: string;
  error?: string;
  details?: any;
}

export class WorkflowExecutor {
  private steps: WorkflowStep[] = [];
  private currentStepIndex: number = 0;
  private isExecuting: boolean = false;
  private executionContext: AgentContext | null = null;
  private onStepComplete?: (result: WorkflowExecutionResult) => Promise<void>;
  private onWorkflowComplete?: () => Promise<void>;

  /**
   * Set workflow steps to execute
   */
  setSteps(steps: WorkflowStep[]): void {
    this.steps = steps;
    this.currentStepIndex = 0;
    Log.info(`[WorkflowExecutor] Set ${steps.length} workflow steps`);
  }

  /**
   * Start executing workflow
   */
  async execute(
    context: AgentContext,
    onStepComplete?: (result: WorkflowExecutionResult) => Promise<void>,
    onWorkflowComplete?: () => Promise<void>
  ): Promise<void> {
    if (this.isExecuting) {
      Log.warn('[WorkflowExecutor] Workflow already executing');
      return;
    }

    if (this.steps.length === 0) {
      Log.warn('[WorkflowExecutor] No steps to execute');
      return;
    }

    this.isExecuting = true;
    this.executionContext = context;
    this.onStepComplete = onStepComplete;
    this.onWorkflowComplete = onWorkflowComplete;
    this.currentStepIndex = 0;

    Log.info(`[WorkflowExecutor] Starting workflow execution with ${this.steps.length} steps`);

    try {
      await this.executeNextStep();
    } catch (error: any) {
      Log.error(`[WorkflowExecutor] Workflow execution failed: ${error.message}`);
      this.isExecuting = false;
    }
  }

  /**
   * Execute next step in workflow
   */
  private async executeNextStep(): Promise<void> {
    if (this.currentStepIndex >= this.steps.length) {
      // Workflow complete
      Log.info('[WorkflowExecutor] Workflow execution complete');
      this.isExecuting = false;
      if (this.onWorkflowComplete) {
        await this.onWorkflowComplete();
      }
      return;
    }

    const step = this.steps[this.currentStepIndex];
    Log.info(`[WorkflowExecutor] Executing step ${this.currentStepIndex + 1}/${this.steps.length}: ${step.type}`);

    try {
      const result = await this.executeStep(step);
      
      if (this.onStepComplete) {
        await this.onStepComplete(result);
      }

      // Move to next step
      this.currentStepIndex++;
      
      // Wait a bit before next step (like Smart-agent)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Continue with next step
      await this.executeNextStep();
    } catch (error: any) {
      Log.error(`[WorkflowExecutor] Step ${this.currentStepIndex + 1} failed: ${error.message}`);
      const result: WorkflowExecutionResult = {
        success: false,
        stepIndex: this.currentStepIndex,
        stepType: step.type,
        error: error.message
      };
      
      if (this.onStepComplete) {
        await this.onStepComplete(result);
      }
      
      this.isExecuting = false;
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: WorkflowStep): Promise<WorkflowExecutionResult> {
    if (!this.executionContext) {
      throw new Error('No execution context available');
    }

    switch (step.type) {
      case 'navigate':
        if (!step.url) {
          throw new Error('Navigate step requires URL');
        }
        // Navigation is handled by the agent's navigate_to tool
        // This executor just tracks it
        return {
          success: true,
          stepIndex: this.currentStepIndex,
          stepType: 'navigate',
          details: { url: step.url }
        };

      case 'click':
        if (step.index === undefined) {
          throw new Error('Click step requires element index');
        }
        // Click is handled by the agent's click_element tool
        return {
          success: true,
          stepIndex: this.currentStepIndex,
          stepType: 'click',
          details: { index: step.index }
        };

      case 'type':
        if (step.index === undefined || !step.text) {
          throw new Error('Type step requires element index and text');
        }
        // Type is handled by the agent's input_text tool
        return {
          success: true,
          stepIndex: this.currentStepIndex,
          stepType: 'type',
          details: { index: step.index, text: step.text }
        };

      case 'wait':
        const duration = step.duration || 2000;
        await new Promise(resolve => setTimeout(resolve, duration));
        return {
          success: true,
          stepIndex: this.currentStepIndex,
          stepType: 'wait',
          details: { duration }
        };

      case 'scroll':
        // Scroll is not directly supported, but we can log it
        return {
          success: true,
          stepIndex: this.currentStepIndex,
          stepType: 'scroll',
          details: { note: 'Scroll action logged but not executed' }
        };

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  /**
   * Stop workflow execution
   */
  stop(): void {
    this.isExecuting = false;
    Log.info('[WorkflowExecutor] Workflow execution stopped');
  }

  /**
   * Get current execution state
   */
  getState(): {
    isExecuting: boolean;
    currentStep: number;
    totalSteps: number;
  } {
    return {
      isExecuting: this.isExecuting,
      currentStep: this.currentStepIndex + 1,
      totalSteps: this.steps.length
    };
  }
}


