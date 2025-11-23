/**
 * Pre-built action patterns for common automation tasks
 * Provides high-level functions for common browser automation scenarios
 */

import { HumanBehavior, type BrowserPage } from './humanBehavior';
import { randomDelay, randomInt, randomChoice, randomBoolean } from './randomization';

/**
 * Common options for action patterns
 */
export interface ActionPatternOptions {
  /** Dry-run mode: simulate actions without actually executing them */
  dryRun?: boolean;
  /** Maximum number of retries on failure */
  maxRetries?: number;
  /** Delay before retry in milliseconds */
  retryDelay?: number;
  /** Timeout for operations in milliseconds */
  timeout?: number;
  /** Whether to review profile before connecting (for connection requests) */
  reviewProfile?: boolean;
  /** Probability of reviewing profile (0.0 to 1.0) */
  reviewProfileProbability?: number;
}

/**
 * Result of an action pattern execution
 */
export interface ActionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Error message if action failed */
  error?: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Number of retries attempted */
  retries: number;
  /** Additional result data */
  data?: Record<string, any>;
}

/**
 * Options for sendConnectionRequest
 */
export interface SendConnectionRequestOptions extends ActionPatternOptions {
  /** Selector for the connect button */
  connectButtonSelector?: string;
  /** Selector for the message input field */
  messageInputSelector?: string;
  /** Selector for the send button */
  sendButtonSelector?: string;
  /** Whether to scroll through profile before connecting */
  scrollProfile?: boolean;
}

/**
 * Sends a connection request on a social/professional network
 *
 * @param page - Playwright or Puppeteer page instance
 * @param profileUrl - URL of the profile to connect with
 * @param message - Optional personalized message to include
 * @param options - Configuration options
 * @returns Promise that resolves with action result
 *
 * @example
 * ```typescript
 * const result = await sendConnectionRequest(
 *   page,
 *   'https://linkedin.com/in/johndoe',
 *   'Hi John, I would like to connect!',
 *   { reviewProfile: true }
 * );
 * ```
 */
export async function sendConnectionRequest(
  page: BrowserPage,
  profileUrl: string,
  message?: string,
  options: SendConnectionRequestOptions = {}
): Promise<ActionResult> {
  const startTime = Date.now();
  const {
    dryRun = false,
    maxRetries = 2,
    retryDelay = 2000,
    timeout = 30000,
    reviewProfile = false,
    reviewProfileProbability = 0.3,
    connectButtonSelector = 'button[aria-label*="Connect"], button[aria-label*="connect"], .connect-button, button:has-text("Connect")',
    messageInputSelector = 'textarea[placeholder*="message"], textarea[placeholder*="Message"], .message-input',
    sendButtonSelector = 'button[aria-label*="Send"], button:has-text("Send"), .send-button',
    scrollProfile = true,
  } = options;

  const humanBehavior = new HumanBehavior(page);
  let retries = 0;
  let lastError: Error | null = null;

  while (retries <= maxRetries) {
    try {
      if (dryRun) {
        return {
          success: true,
          executionTime: Date.now() - startTime,
          retries,
          data: { dryRun: true, profileUrl, message },
        };
      }

      // Navigate to profile
      const isPlaywright = typeof (page as any).context === 'function';
      if (isPlaywright) {
        await (page as any).goto(profileUrl, { timeout, waitUntil: 'networkidle' });
      } else {
        await (page as any).goto(profileUrl, { timeout, waitUntil: 'networkidle0' });
      }

      // Random scroll to view profile (realistic behavior)
      if (scrollProfile) {
        const scrollAmount = randomInt(200, 600);
        await humanBehavior.humanScroll(scrollAmount);
        await humanBehavior.simulateReading(randomInt(1000, 3000));
      }

      // Sometimes review profile before connecting (realistic path)
      const shouldReview = reviewProfile || (Math.random() < reviewProfileProbability);
      if (shouldReview) {
        // Scroll through more of the profile
        await humanBehavior.humanScroll(randomInt(300, 800));
        await humanBehavior.simulateReading(randomInt(2000, 5000));
        
        // Scroll back up a bit (like reviewing)
        await humanBehavior.humanScroll(-randomInt(100, 300));
        await humanBehavior.simulateThinking(randomInt(500, 1500));
      }

      // Find and click connect button
      const connectButton = await findElement(page, connectButtonSelector, timeout);
      if (!connectButton) {
        throw new Error('Connect button not found');
      }

      // Get button position and click
      const buttonBounds = await getElementBounds(page, connectButton);
      await humanBehavior.humanClick(connectButtonSelector);

      // Wait for modal/dialog if message is provided
      if (message) {
        await randomDelay(500, 1500);

        // Find message input
        const messageInput = await findElement(page, messageInputSelector, timeout);
        if (messageInput) {
          await humanBehavior.humanType(messageInputSelector, message, {
            clearFirst: true,
          });
          await randomDelay(300, 800);

          // Click send button
          const sendBtn = await findElement(page, sendButtonSelector, timeout);
          if (sendBtn) {
            await humanBehavior.humanClick(sendButtonSelector);
          }
        }
      }

      // Wait a bit after sending
      await randomDelay(1000, 2000);

      return {
        success: true,
        executionTime: Date.now() - startTime,
        retries,
        data: { profileUrl, message: message || null },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retries++;

      if (retries <= maxRetries) {
        await randomDelay(retryDelay, retryDelay * 1.5);
      } else {
        return {
          success: false,
          error: lastError.message,
          executionTime: Date.now() - startTime,
          retries: retries - 1,
        };
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    executionTime: Date.now() - startTime,
    retries,
  };
}

/**
 * Options for sendEmail
 */
export interface SendEmailOptions extends ActionPatternOptions {
  /** Selector for compose/new email button */
  composeButtonSelector?: string;
  /** Selector for recipient input field */
  recipientInputSelector?: string;
  /** Selector for subject input field */
  subjectInputSelector?: string;
  /** Selector for body/email content field */
  bodyInputSelector?: string;
  /** Selector for send button */
  sendButtonSelector?: string;
}

/**
 * Sends an email through a web email client
 *
 * @param page - Playwright or Puppeteer page instance
 * @param recipient - Email recipient address
 * @param subject - Email subject line
 * @param body - Email body content
 * @param options - Configuration options
 * @returns Promise that resolves with action result
 *
 * @example
 * ```typescript
 * const result = await sendEmail(
 *   page,
 *   'recipient@example.com',
 *   'Meeting Request',
 *   'Hi, I would like to schedule a meeting...'
 * );
 * ```
 */
export async function sendEmail(
  page: BrowserPage,
  recipient: string,
  subject: string,
  body: string,
  options: SendEmailOptions = {}
): Promise<ActionResult> {
  const startTime = Date.now();
  const {
    dryRun = false,
    maxRetries = 2,
    retryDelay = 2000,
    timeout = 30000,
    composeButtonSelector = 'button[aria-label*="Compose"], button[aria-label*="New"], .compose-button, button:has-text("Compose")',
    recipientInputSelector = 'input[type="email"], input[name*="to"], input[placeholder*="To"], .recipient-input',
    subjectInputSelector = 'input[name*="subject"], input[placeholder*="Subject"], .subject-input',
    bodyInputSelector = 'textarea[placeholder*="Message"], .email-body, iframe[title*="Message"]',
    sendButtonSelector = 'button[aria-label*="Send"], button:has-text("Send"), .send-button',
  } = options;

  const humanBehavior = new HumanBehavior(page);
  let retries = 0;
  let lastError: Error | null = null;

  while (retries <= maxRetries) {
    try {
      if (dryRun) {
        return {
          success: true,
          executionTime: Date.now() - startTime,
          retries,
          data: { dryRun: true, recipient, subject, bodyLength: body.length },
        };
      }

      // Click compose button
      const composeButton = await findElement(page, composeButtonSelector, timeout);
      if (!composeButton) {
        throw new Error('Compose button not found');
      }

      await humanBehavior.humanClick(composeButtonSelector);
      await randomDelay(1000, 2000);

      // Fill recipient with human typing
      const recipientInput = await findElement(page, recipientInputSelector, timeout);
      if (!recipientInput) {
        throw new Error('Recipient input not found');
      }

      await humanBehavior.humanType(recipientInputSelector, recipient, {
        clearFirst: true,
      });
      await randomDelay(500, 1000);

      // Fill subject
      const subjectInput = await findElement(page, subjectInputSelector, timeout);
      if (!subjectInput) {
        throw new Error('Subject input not found');
      }

      await humanBehavior.humanType(subjectInputSelector, subject, {
        clearFirst: true,
      });
      await humanBehavior.simulateThinking(randomInt(300, 800));
      await randomDelay(500, 1000);

      // Type email body with realistic speed and occasional mistakes
      const bodyInput = await findElement(page, bodyInputSelector, timeout);
      if (!bodyInput) {
        throw new Error('Body input not found');
      }

      // Check if body is in iframe
      const isIframe = bodyInputSelector.includes('iframe');
      if (isIframe) {
        // Handle iframe content
        const iframe = await findElement(page, bodyInputSelector, timeout);
        if (iframe) {
          const isPlaywright = typeof (page as any).context === 'function';
          if (isPlaywright) {
            const frame = await (iframe as any).contentFrame();
            if (frame) {
              await frame.locator('body').fill('');
              await frame.locator('body').type(body, { delay: randomInt(30, 100) });
            }
          } else {
            const frame = await (iframe as any).contentFrame();
            if (frame) {
              await frame.evaluate((text: string) => {
                const editor = document.body;
                editor.textContent = text;
              }, body);
            }
          }
        }
      } else {
        await humanBehavior.humanType(bodyInputSelector, body, {
          clearFirst: true,
          mistakeProbability: 0.01, // 1% chance of mistakes
        });
      }

      // Review email (realistic behavior)
      await humanBehavior.simulateReading(randomInt(1000, 3000));
      await randomDelay(500, 1500);

      // Click send
      const sendButton = await findElement(page, sendButtonSelector, timeout);
      if (!sendButton) {
        throw new Error('Send button not found');
      }

      await humanBehavior.humanClick(sendButtonSelector);
      await randomDelay(1000, 2000);

      return {
        success: true,
        executionTime: Date.now() - startTime,
        retries,
        data: { recipient, subject, bodyLength: body.length },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retries++;

      if (retries <= maxRetries) {
        await randomDelay(retryDelay, retryDelay * 1.5);
      } else {
        return {
          success: false,
          error: lastError.message,
          executionTime: Date.now() - startTime,
          retries: retries - 1,
        };
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    executionTime: Date.now() - startTime,
    retries,
  };
}

/**
 * Form field data structure
 */
export interface FormField {
  /** Field selector or name */
  selector: string;
  /** Value to fill */
  value: string;
  /** Field type (for special handling) */
  type?: 'text' | 'email' | 'password' | 'textarea' | 'select' | 'checkbox' | 'radio';
  /** Whether field is required */
  required?: boolean;
}

/**
 * Options for fillForm
 */
export interface FillFormOptions extends ActionPatternOptions {
  /** Selector for form container (optional) */
  formSelector?: string;
  /** Delay between fields in milliseconds */
  fieldDelay?: { min: number; max: number };
  /** Whether to use Tab key to navigate between fields */
  useTabNavigation?: boolean;
  /** Probability of using Tab vs Click (0.0 to 1.0) */
  tabNavigationProbability?: number;
}

/**
 * Fills a form with human-like behavior
 *
 * @param page - Playwright or Puppeteer page instance
 * @param formData - Array of form fields to fill
 * @param options - Configuration options
 * @returns Promise that resolves with action result
 *
 * @example
 * ```typescript
 * const result = await fillForm(page, [
 *   { selector: 'input[name="name"]', value: 'John Doe' },
 *   { selector: 'input[name="email"]', value: 'john@example.com' },
 *   { selector: 'textarea[name="message"]', value: 'Hello...' },
 * ]);
 * ```
 */
export async function fillForm(
  page: BrowserPage,
  formData: FormField[],
  options: FillFormOptions = {}
): Promise<ActionResult> {
  const startTime = Date.now();
  const {
    dryRun = false,
    maxRetries = 2,
    retryDelay = 2000,
    timeout = 30000,
    formSelector,
    fieldDelay = { min: 300, max: 800 },
    useTabNavigation = true,
    tabNavigationProbability = 0.7,
  } = options;

  const humanBehavior = new HumanBehavior(page);
  let retries = 0;
  let lastError: Error | null = null;

  while (retries <= maxRetries) {
    try {
      if (dryRun) {
        return {
          success: true,
          executionTime: Date.now() - startTime,
          retries,
          data: { dryRun: true, fieldsCount: formData.length },
        };
      }

      // Wait for form if selector provided
      if (formSelector) {
        await findElement(page, formSelector, timeout);
      }

      const filledFields: string[] = [];

      for (let i = 0; i < formData.length; i++) {
        const field = formData[i];
        const useTab = useTabNavigation && (Math.random() < tabNavigationProbability);

        // Navigate to field
        if (useTab && i > 0) {
          // Use Tab key to navigate
          const isPlaywright = typeof (page as any).context === 'function';
          if (isPlaywright) {
            await (page as any).keyboard.press('Tab');
          } else {
            await (page as any).keyboard.press('Tab');
          }
          await randomDelay(200, 500);
        } else {
          // Click to focus
          await humanBehavior.humanClick(field.selector, {
            waitForVisible: true,
            timeout,
          });
        }

        // Fill field based on type
        switch (field.type) {
          case 'select':
            // Handle select dropdown
            const isPlaywright = typeof (page as any).context === 'function';
            if (isPlaywright) {
              await (page as any).locator(field.selector).selectOption(field.value);
            } else {
              await (page as any).select(field.selector, field.value);
            }
            break;

          case 'checkbox':
          case 'radio':
            // Handle checkbox/radio
            const element = await findElement(page, field.selector, timeout);
            if (element) {
              const isChecked = await getElementProperty(page, element, 'checked');
              if (field.value === 'true' && !isChecked) {
                await humanBehavior.humanClick(field.selector);
              } else if (field.value === 'false' && isChecked) {
                await humanBehavior.humanClick(field.selector);
              }
            }
            break;

          case 'textarea':
            await humanBehavior.humanType(field.selector, field.value, {
              clearFirst: true,
            });
            break;

          default:
            // Text, email, password inputs
            await humanBehavior.humanType(field.selector, field.value, {
              clearFirst: true,
            });
        }

        filledFields.push(field.selector);

        // Thinking delay between fields (realistic behavior)
        if (i < formData.length - 1) {
          await humanBehavior.simulateThinking(randomInt(200, 800));
          await randomDelay(fieldDelay.min, fieldDelay.max);
        }
      }

      return {
        success: true,
        executionTime: Date.now() - startTime,
        retries,
        data: { fieldsFilled: filledFields.length, fields: filledFields },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retries++;

      if (retries <= maxRetries) {
        await randomDelay(retryDelay, retryDelay * 1.5);
      } else {
        return {
          success: false,
          error: lastError.message,
          executionTime: Date.now() - startTime,
          retries: retries - 1,
        };
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    executionTime: Date.now() - startTime,
    retries,
  };
}

/**
 * Options for searchAndClick
 */
export interface SearchAndClickOptions extends ActionPatternOptions {
  /** Selector for search input field */
  searchInputSelector?: string;
  /** Selector for search results container */
  resultsSelector?: string;
  /** Selector for individual result items */
  resultItemSelector?: string;
  /** Whether to wait for results to load */
  waitForResults?: boolean;
  /** Timeout for waiting for results */
  resultsTimeout?: number;
}

/**
 * Performs a search and clicks on a result
 *
 * @param page - Playwright or Puppeteer page instance
 * @param searchTerm - Search query to type
 * @param resultIndex - Index of result to click (0-based, random if not specified)
 * @param options - Configuration options
 * @returns Promise that resolves with action result
 *
 * @example
 * ```typescript
 * const result = await searchAndClick(
 *   page,
 *   'JavaScript tutorials',
 *   0, // Click first result
 *   { searchInputSelector: 'input[name="q"]' }
 * );
 * ```
 */
export async function searchAndClick(
  page: BrowserPage,
  searchTerm: string,
  resultIndex?: number,
  options: SearchAndClickOptions = {}
): Promise<ActionResult> {
  const startTime = Date.now();
  const {
    dryRun = false,
    maxRetries = 2,
    retryDelay = 2000,
    timeout = 30000,
    searchInputSelector = 'input[type="search"], input[name*="search"], input[name*="q"], .search-input',
    resultsSelector = '.search-results, .results, [role="list"]',
    resultItemSelector = '.result-item, .search-result, [role="listitem"]',
    waitForResults = true,
    resultsTimeout = 10000,
  } = options;

  const humanBehavior = new HumanBehavior(page);
  let retries = 0;
  let lastError: Error | null = null;

  while (retries <= maxRetries) {
    try {
      if (dryRun) {
        return {
          success: true,
          executionTime: Date.now() - startTime,
          retries,
          data: { dryRun: true, searchTerm, resultIndex: resultIndex ?? 'random' },
        };
      }

      // Find and focus search input
      const searchInput = await findElement(page, searchInputSelector, timeout);
      if (!searchInput) {
        throw new Error('Search input not found');
      }

      await humanBehavior.humanClick(searchInputSelector);
      await randomDelay(300, 700);

      // Type search term with human behavior
      await humanBehavior.humanType(searchInputSelector, searchTerm, {
        clearFirst: true,
      });

      // Sometimes pause before submitting (realistic behavior)
      if (randomBoolean(0.3)) {
        await humanBehavior.simulateThinking(randomInt(500, 1500));
      }

      // Submit search (Enter key)
      const isPlaywright = typeof (page as any).context === 'function';
      if (isPlaywright) {
        await (page as any).keyboard.press('Enter');
      } else {
        await (page as any).keyboard.press('Enter');
      }

      // Wait for results
      if (waitForResults) {
        await randomDelay(1000, 2000);
        
        // Wait for results container
        if (resultsSelector) {
          await findElement(page, resultsSelector, resultsTimeout);
        }

        // Wait a bit more for results to render
        await randomDelay(500, 1500);
      }

      // Random scroll to simulate browsing results
      if (randomBoolean(0.4)) {
        await humanBehavior.humanScroll(randomInt(100, 400));
        await humanBehavior.simulateReading(randomInt(500, 1500));
      }

      // Find results
      const results = await findElements(page, resultItemSelector, timeout);
      if (!results || results.length === 0) {
        throw new Error('No search results found');
      }

      // Determine which result to click
      const targetIndex = resultIndex !== undefined
        ? Math.min(resultIndex, results.length - 1)
        : randomInt(0, Math.min(results.length - 1, 4)); // Random, but prefer first few

      // Scroll to result if needed
      const targetResult = results[targetIndex];
      const resultBounds = await getElementBounds(page, targetResult);
      
      // Check if result is visible, scroll if needed
      const isPlaywrightCheck = typeof (page as any).context === 'function';
      let isVisible = false;
      if (isPlaywrightCheck) {
        const viewport = (page as any).viewportSize();
        isVisible = resultBounds.y >= 0 && resultBounds.y < (viewport?.height || 1080);
      } else {
        const viewport = await (page as any).viewport();
        isVisible = resultBounds.y >= 0 && resultBounds.y < (viewport?.height || 1080);
      }

      if (!isVisible) {
        const scrollAmount = resultBounds.y - 200; // Scroll to show result
        await humanBehavior.humanScroll(scrollAmount);
        await randomDelay(300, 700);
      }

      // Click result with human behavior
      const resultSelector = `${resultItemSelector}:nth-of-type(${targetIndex + 1})`;
      await humanBehavior.humanClick(resultSelector);

      await randomDelay(1000, 2000);

      return {
        success: true,
        executionTime: Date.now() - startTime,
        retries,
        data: { searchTerm, resultIndex: targetIndex, totalResults: results.length },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retries++;

      if (retries <= maxRetries) {
        await randomDelay(retryDelay, retryDelay * 1.5);
      } else {
        return {
          success: false,
          error: lastError.message,
          executionTime: Date.now() - startTime,
          retries: retries - 1,
        };
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error',
    executionTime: Date.now() - startTime,
    retries,
  };
}

/**
 * Helper function to find an element (works with both Playwright and Puppeteer)
 */
async function findElement(
  page: BrowserPage,
  selector: string,
  timeout: number = 30000
): Promise<any> {
  const isPlaywright = typeof (page as any).context === 'function';
  
  if (isPlaywright) {
    const pwPage = page as any;
    await pwPage.locator(selector).first().waitFor({ state: 'visible', timeout });
    return pwPage.locator(selector).first();
  } else {
    const ppPage = page as any;
    await ppPage.waitForSelector(selector, { visible: true, timeout });
    return await ppPage.$(selector);
  }
}

/**
 * Helper function to find multiple elements
 */
async function findElements(
  page: BrowserPage,
  selector: string,
  timeout: number = 30000
): Promise<any[]> {
  const isPlaywright = typeof (page as any).context === 'function';
  
  if (isPlaywright) {
    const pwPage = page as any;
    await pwPage.locator(selector).first().waitFor({ state: 'visible', timeout });
    const elements = await pwPage.locator(selector).all();
    return elements;
  } else {
    const ppPage = page as any;
    await ppPage.waitForSelector(selector, { visible: true, timeout });
    return await ppPage.$$(selector);
  }
}

/**
 * Helper function to get element bounds
 */
async function getElementBounds(
  page: BrowserPage,
  element: any
): Promise<{ x: number; y: number; width: number; height: number }> {
  const isPlaywright = typeof (page as any).context === 'function';
  
  if (isPlaywright) {
    const box = await element.boundingBox();
    if (!box) {
      throw new Error('Element not visible');
    }
    return box;
  } else {
    const box = await element.boundingBox();
    if (!box) {
      throw new Error('Element not visible');
    }
    return box;
  }
}

/**
 * Helper function to get element property
 */
async function getElementProperty(
  page: BrowserPage,
  element: any,
  property: string
): Promise<any> {
  const isPlaywright = typeof (page as any).context === 'function';
  
  if (isPlaywright) {
    return await element.getProperty(property);
  } else {
    return await (page as any).evaluate((el: any, prop: string) => {
      return (el as any)[prop];
    }, element, property);
  }
}

