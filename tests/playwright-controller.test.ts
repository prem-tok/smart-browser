/**
 * Playwright Controller Integration Test
 * Tests the Playwright controller with Electron main process
 */

import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

let electronProcess: ChildProcess | null = null;
const TEST_TIMEOUT = 30000; // 30 seconds

/**
 * Start Electron app for testing
 */
async function startElectron(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const electronPath = require('electron');
    const mainPath = path.join(__dirname, '../dist/electron/main/index.mjs');
    
    if (!fs.existsSync(mainPath)) {
      reject(new Error(`Main process not found at ${mainPath}. Run build first.`));
      return;
    }
    
    electronProcess = spawn(electronPath, [mainPath], {
      env: {
        ...process.env,
        PLAYWRIGHT_HEADLESS: '1',
        NODE_ENV: 'test'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Wait a bit for Electron to start
    setTimeout(() => {
      if (electronProcess && !electronProcess.killed) {
        resolve(electronProcess);
      } else {
        reject(new Error('Electron process failed to start'));
      }
    }, 5000);
    
    electronProcess.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Stop Electron app
 */
async function stopElectron(): Promise<void> {
  if (electronProcess) {
    electronProcess.kill();
    electronProcess = null;
    // Wait for process to fully terminate
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

test.describe('Playwright Controller Integration', () => {
  test.beforeAll(async () => {
    // Start Electron app
    try {
      await startElectron();
      console.log('Electron app started for testing');
    } catch (error) {
      console.error('Failed to start Electron app:', error);
      throw error;
    }
  });
  
  test.afterAll(async () => {
    // Stop Electron app
    await stopElectron();
    console.log('Electron app stopped');
  });
  
  test('should create a page and navigate to example.com', async () => {
    // This test would require IPC communication with the Electron main process
    // Since we can't directly call the controller from the test, we'll test
    // the controller functions directly by importing them
    
    // Note: This is a simplified test. In a real scenario, you might want to:
    // 1. Use Electron's remote testing capabilities
    // 2. Create a test harness that exposes the controller API
    // 3. Use Spectron or similar Electron testing framework
    
    const { startPlaywright, newPage, goto, listElements, stopPlaywright, closePage } = require('../electron/playwrightController');
    
    try {
      // Start Playwright
      await startPlaywright();
      
      // Create a test page
      const newPageResult = await newPage('test-window');
      expect(newPageResult.ok).toBe(true);
      expect(newPageResult.data?.windowId).toBe('test-window');
      
      // Navigate to example.com
      const gotoResult = await goto('test-window', 'https://example.com');
      expect(gotoResult.ok).toBe(true);
      expect(gotoResult.data?.url).toContain('example.com');
      
      // List h1 elements
      const listResult = await listElements('test-window', 'h1');
      expect(listResult.ok).toBe(true);
      expect(Array.isArray(listResult.data)).toBe(true);
      
      // Verify we found the "Example Domain" heading
      if (listResult.data && listResult.data.length > 0) {
        const h1Text = listResult.data[0].innerText;
        expect(h1Text.toLowerCase()).toContain('example');
      }
      
      // Cleanup
      await closePage('test-window');
      await stopPlaywright();
    } catch (error) {
      // Ensure cleanup even on error
      try {
        await stopPlaywright();
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
      throw error;
    }
  }, TEST_TIMEOUT);
  
  test('should handle invalid selectors', async () => {
    const { startPlaywright, newPage, listElements, stopPlaywright, closePage } = require('../electron/playwrightController');
    
    try {
      await startPlaywright();
      await newPage('test-window-2');
      
      // Try with invalid selector (javascript:)
      const result = await listElements('test-window-2', 'javascript:alert(1)');
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('INVALID_ARG');
      
      await closePage('test-window-2');
      await stopPlaywright();
    } catch (error) {
      try {
        await stopPlaywright();
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
      throw error;
    }
  }, TEST_TIMEOUT);
  
  test('should handle rate limiting', async () => {
    const { startPlaywright, newPage, goto, click, stopPlaywright, closePage } = require('../electron/playwrightController');
    
    try {
      await startPlaywright();
      await newPage('test-window-3');
      await goto('test-window-3', 'https://example.com');
      
      // Try to perform more than 10 actions rapidly (rate limit is 10/sec)
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(click('test-window-3', 'body'));
      }
      
      const results = await Promise.all(promises);
      
      // At least some should be throttled
      const throttled = results.filter(r => !r.ok && r.error?.code === 'THROTTLED');
      expect(throttled.length).toBeGreaterThan(0);
      
      await closePage('test-window-3');
      await stopPlaywright();
    } catch (error) {
      try {
        await stopPlaywright();
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
      throw error;
    }
  }, TEST_TIMEOUT);
});

