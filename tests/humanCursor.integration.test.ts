/**
 * Integration test for humanized cursor interactions
 * Tests the full flow with a real Playwright page
 */

import { test, expect } from '@playwright/test';
import { startPlaywright, newPage, goto, click, closePage, stopPlaywright } from '../electron/playwrightController';

test.describe('Humanized Cursor Integration', () => {
  const TEST_WINDOW_ID = 'test-humanized';
  const TEST_TIMEOUT = 30000;

  test.beforeAll(async () => {
    // Start Playwright browser
    await startPlaywright();
    
    // Create test page
    const result = await newPage(TEST_WINDOW_ID);
    if (!result.ok) {
      throw new Error(`Failed to create test page: ${result.error?.message}`);
    }
  });

  test.afterAll(async () => {
    // Cleanup
    await closePage(TEST_WINDOW_ID);
    await stopPlaywright();
  });

  test('should perform humanized click on a button', async () => {
    // Navigate to a test page
    const gotoResult = await goto(TEST_WINDOW_ID, 'https://example.com');
    expect(gotoResult.ok).toBe(true);

    // Wait a bit for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Perform humanized click on a link
    // Note: This will use humanized input by default (unless HUMANIZED_INPUT=false)
    const clickResult = await click(TEST_WINDOW_ID, 'a', {
      humanized: true,
      humanOptions: {
        steps: 12,
        jitter: 2,
        minDelay: 5,
        maxDelay: 20
      }
    });

    expect(clickResult.ok).toBe(true);
  }, TEST_TIMEOUT);

  test('should perform raw click when humanized is disabled', async () => {
    const gotoResult = await goto(TEST_WINDOW_ID, 'https://example.com');
    expect(gotoResult.ok).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Perform raw click (no humanization)
    const clickResult = await click(TEST_WINDOW_ID, 'body', {
      humanized: false
    });

    expect(clickResult.ok).toBe(true);
  }, TEST_TIMEOUT);

  test('should handle invalid selector gracefully', async () => {
    const gotoResult = await goto(TEST_WINDOW_ID, 'https://example.com');
    expect(gotoResult.ok).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try to click non-existent element
    const clickResult = await click(TEST_WINDOW_ID, '.non-existent-element-12345', {
      humanized: true
    });

    expect(clickResult.ok).toBe(false);
    expect(clickResult.error?.code).toBe('NOT_FOUND');
  }, TEST_TIMEOUT);

  test('should respect safety limits', async () => {
    const gotoResult = await goto(TEST_WINDOW_ID, 'https://example.com');
    expect(gotoResult.ok).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Try with very high steps but safety limit
    const clickResult = await click(TEST_WINDOW_ID, 'body', {
      humanized: true,
      humanOptions: {
        steps: 1000, // Very high
        safety: {
          maxSteps: 30, // Should be limited to this
          maxDurationMs: 2000
        }
      }
    });

    // Should still succeed (safety limits applied)
    expect(clickResult.ok).toBe(true);
  }, TEST_TIMEOUT);
});


