/**
 * Main window manager
 * Responsible for managing main window creation, loading state and transitions
 */

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { WindowState, type WindowStateInfo } from './window-states';
import { ServerManager } from '../services/server-manager';
import { createWindow } from '../ui/window';
import { isDev } from '../utils/constants';

export class MainWindowManager {
  private window?: BrowserWindow;
  private serverManager: ServerManager;
  private currentState: WindowStateInfo;
  private readonly loadingTimeout = 60000; // 60 second timeout (increased to allow more time for server startup)

  constructor(serverManager: ServerManager) {
    this.serverManager = serverManager;
    this.currentState = {
      state: WindowState.LOADING,
      timestamp: Date.now()
    };
  }

  /**
   * Create and initialize main window
   */
  async createMainWindow(): Promise<BrowserWindow> {
    console.log('Creating main window...');

    // Show loading page first
    await this.showLoading();

    // Wait for service to be ready in background
    this.waitForServerAndLoad();

    return this.window!;
  }

  /**
   * Show loading page
   */
  private async showLoading(): Promise<void> {
    const loadingPath = isDev
      ? path.join(process.cwd(), 'electron/renderer/loading/index.html')
      : path.join(app.getAppPath(), 'renderer/loading/index.html');

    const loadingURL = `file://${loadingPath}`;
    console.log('Loading transition page:', loadingURL);

    this.window = await createWindow(loadingURL);
    this.updateState(WindowState.LOADING, 'Starting service...');

    console.log('Transition page loaded');
  }

  /**
   * Wait for service to be ready and load application
   */
  private async waitForServerAndLoad(): Promise<void> {
    try {
      console.log('Waiting for Next.js service...');

      // Wait for service to be ready (waitForServer handles its own timeout)
      const isServerReady = await this.serverManager.waitForServer(this.loadingTimeout);

      if (isServerReady) {
        await this.loadApplication();
      } else {
        throw new Error('Service startup timeout - server did not become ready within the timeout period');
      }
    } catch (error) {
      console.error('Service startup failed:', error);
      await this.handleLoadingError(error as Error);
    }
  }

  /**
   * Load main application
   */
  private async loadApplication(): Promise<void> {
    if (!this.window) {
      throw new Error('Window not initialized');
    }

    try {
      const baseURL = this.serverManager.getServerURL();
      // Load /main page directly (browser view with embedded AI agent)
      const appURL = `${baseURL}/main`;
      console.log('Loading application:', appURL);

      this.updateState(WindowState.READY, 'Service ready, loading browser...');

      await this.window.loadURL(appURL);

      console.log('Application loaded');
    } catch (error) {
      console.error('Application loading failed:', error);
      throw error;
    }
  }

  /**
   * Handle loading error
   */
  private async handleLoadingError(error: Error): Promise<void> {
    console.error('Handling loading error:', error);

    this.updateState(WindowState.ERROR, `Loading failed: ${error.message}`);

    if (!this.window) return;

    // Try to show error page or keep loading page but display error state
    try {
      // Can create an error page here, or update loading page state via JavaScript execution
      const errorMessage = isDev
        ? 'Next.js dev server is not running. Please start it with: pnpm run next (or use pnpm run dev to start both)'
        : 'Please check network connection or restart application';
      
      await this.window.webContents.executeJavaScript(`
        const mainText = document.querySelector('.main-text');
        const subText = document.querySelector('.sub-text');
        const progressFill = document.querySelector('.progress-fill');

        if (mainText) mainText.textContent = 'Service startup failed';
        if (subText) subText.textContent = ${JSON.stringify(errorMessage)};
        if (progressFill) {
          progressFill.style.background = '#ef4444';
          progressFill.style.width = '100%';
        }
      `);
    } catch (jsError) {
      console.error('Failed to update loading page error state:', jsError);
    }
  }

  /**
   * Update window state
   */
  private updateState(state: WindowState, message?: string): void {
    this.currentState = {
      state,
      message,
      timestamp: Date.now()
    };

    console.log(`Window state updated: ${state} - ${message || ''}`);
  }

  /**
   * Get current window state
   */
  getCurrentState(): WindowStateInfo {
    return { ...this.currentState };
  }

  /**
   * Get main window instance
   */
  getWindow(): BrowserWindow | undefined {
    return this.window;
  }

  /**
   * Reload application (for error recovery)
   */
  async reload(): Promise<void> {
    if (!this.window) return;

    console.log('Reloading application...');

    // Show loading page again
    await this.showLoading();

    // Wait for service again
    this.waitForServerAndLoad();
  }
}