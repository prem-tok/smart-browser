/**
 * Automation Mode Manager
 * Manages headed/headless modes like Comet browser
 */

import log from 'electron-log';
import { getActionIndicator, type ActionIndicatorOptions } from './action-indicator';

export enum AutomationMode {
  HEADED = 'headed',    // Visual feedback, user can watch (like Comet's headed mode)
  HEADLESS = 'headless' // Background, no visual feedback (like Comet's headless mode)
}

export class AutomationModeManager {
  private mode: AutomationMode = AutomationMode.HEADED;
  private actionIndicator = getActionIndicator();
  
  constructor() {
    // Initialize with headed mode by default (transparent operation)
    this.setMode(AutomationMode.HEADED);
  }
  
  /**
   * Set automation mode
   */
  setMode(mode: AutomationMode): void {
    this.mode = mode;
    
    if (mode === AutomationMode.HEADED) {
      // Enable visual feedback
      this.actionIndicator.setEnabled(true);
      log.info('[AutomationMode] Switched to HEADED mode - visual feedback enabled');
    } else {
      // Disable visual feedback
      this.actionIndicator.setEnabled(false);
      log.info('[AutomationMode] Switched to HEADLESS mode - no visual feedback');
    }
  }
  
  /**
   * Get current mode
   */
  getMode(): AutomationMode {
    return this.mode;
  }
  
  /**
   * Check if visual feedback is enabled
   */
  isHeaded(): boolean {
    return this.mode === AutomationMode.HEADED;
  }
  
  /**
   * Get action indicator (for showing visual feedback)
   */
  getActionIndicator() {
    return this.actionIndicator;
  }
  
  /**
   * Configure action indicator options
   */
  configureActionIndicator(options: ActionIndicatorOptions): void {
    // Recreate action indicator with new options
    this.actionIndicator = getActionIndicator(options);
    if (this.mode === AutomationMode.HEADED) {
      this.actionIndicator.setEnabled(true);
    }
  }
  
  /**
   * Cleanup
   */
  destroy(): void {
    this.actionIndicator.destroy();
  }
}

// Singleton instance
let automationModeManagerInstance: AutomationModeManager | null = null;

export function getAutomationModeManager(): AutomationModeManager {
  if (!automationModeManagerInstance) {
    automationModeManagerInstance = new AutomationModeManager();
  }
  return automationModeManagerInstance;
}


