/**
 * Next.js server manager
 * Responsible for managing Next.js development server startup and status detection
 */

import { app } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { HealthChecker } from './health-checker';
import { isDev, DEFAULT_PORT } from '../utils/constants';

export class ServerManager {
  private healthChecker: HealthChecker;
  private serverStarted: boolean = false;

  constructor() {
    this.healthChecker = new HealthChecker();
  }

  /**
   * Start Next.js server (production environment only)
   */
  async startServer(): Promise<void> {
    if (isDev || this.serverStarted) {
      console.log('Skipping server startup: development environment or server already started');
      return;
    }

    try {
      const serverPath = path.join(app.getAppPath(), "server.js");
      // Convert file path to correct file:// URL format, compatible with all operating systems
      const fileUrl = pathToFileURL(serverPath).href;
      console.log(`Starting Next.js server: ${serverPath}`);
      console.log(`File URL: ${fileUrl}`);

      await import(fileUrl);
      this.serverStarted = true;

      console.log('Next.js server started successfully');
    } catch (error) {
      console.error('Failed to start Next.js server:', error);
      throw new Error(`Failed to start Next.js server: ${error}`);
    }
  }

  /**
   * Wait for server to be ready
   * @param timeout Maximum wait time in milliseconds
   */
  async waitForServer(timeout: number = 30000): Promise<boolean> {
    // Check base URL for health (any route should work)
    const url = `http://localhost:${DEFAULT_PORT}`;
    const retryInterval = 1000; // Wait 1 second between retries
    const checkTimeout = 3000; // Each health check times out after 3 seconds
    // Calculate max retries based on timeout and retry interval
    // We use retryInterval as primary factor since failed checks timeout quickly
    // Add buffer to account for check timeout overhead
    const maxRetries = Math.max(1, Math.floor((timeout - checkTimeout) / retryInterval));

    console.log(`Waiting for Next.js server to be ready: ${url}, timeout: ${timeout}ms, max retries: ${maxRetries}`);

    const isHealthy = await this.healthChecker.waitUntilHealthy(url, {
      maxRetries,
      retryInterval,
      timeout: checkTimeout,
    });

    if (isHealthy) {
      console.log('Next.js server is ready');
    } else {
      if (isDev) {
        console.error('Next.js server startup timeout. In development mode, make sure to start the Next.js dev server first with: pnpm run next (or use pnpm run dev to start both)');
      } else {
        console.error('Next.js server startup timeout');
      }
    }

    return isHealthy;
  }

  /**
   * Check if server is running
   */
  async isServerRunning(): Promise<boolean> {
    const url = `http://localhost:${DEFAULT_PORT}`;
    return await this.healthChecker.checkHealth(url);
  }

  /**
   * Get server URL (base URL without path)
   */
  getServerURL(): string {
    return `http://localhost:${DEFAULT_PORT}`;
  }

  /**
   * Get home page URL (for backward compatibility)
   */
  getHomeURL(): string {
    return `http://localhost:${DEFAULT_PORT}/home`;
  }

  /**
   * Stop server (reserved interface)
   */
  async stopServer(): Promise<void> {
    // In current architecture, server is managed externally, this just marks it
    this.serverStarted = false;
    console.log('Server manager has been reset');
  }
}
