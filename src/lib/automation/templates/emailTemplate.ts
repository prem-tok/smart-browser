/**
 * Email Automation Templates
 * Pre-built functions for bulk email sending and follow-ups with human-like behavior
 */

import { BatchExecutor, type BatchTask, type BatchExecutionOptions, type BatchProgressCallback } from '../batchExecutor';
import { sendEmail, type SendEmailOptions } from '../actionPatterns';
import { HumanBehavior, type BrowserPage } from '../humanBehavior';
import { randomDelay, randomInt, randomBoolean, randomFloat } from '../randomization';

/**
 * Email recipient information
 */
export interface EmailRecipient {
  /** Email address */
  email: string;
  /** Recipient name (optional, for personalization) */
  name?: string;
  /** Company name (optional, for personalization) */
  company?: string;
  /** Additional custom fields for template variables */
  customFields?: Record<string, string>;
}

/**
 * Email template with placeholders
 * Supports placeholders like {{name}}, {{company}}, {{email}}, etc.
 */
export interface EmailTemplate {
  /** Email subject template */
  subject: string;
  /** Email body template */
  body: string;
  /** Optional from name */
  fromName?: string;
}

/**
 * Email thread information for follow-ups
 */
export interface EmailThread {
  /** Thread identifier (subject, thread ID, or search criteria) */
  identifier: string;
  /** Search method: 'subject', 'threadId', or 'search' */
  searchMethod?: 'subject' | 'threadId' | 'search';
  /** Optional sender email to narrow search */
  senderEmail?: string;
}

/**
 * Options for bulk email sending
 */
export interface BulkEmailOptions extends BatchExecutionOptions {
  /** Maximum emails per session (safety limit) */
  maxEmailsPerSession?: number;
  /** Email provider: 'gmail' or 'outlook' (auto-detected if not specified) */
  provider?: 'gmail' | 'outlook' | 'auto';
  /** Probability of re-reading email before sending (0.0 to 1.0) */
  rereadProbability?: number;
  /** Compose time variation range in milliseconds */
  composeTimeVariation?: {
    min: number;
    max: number;
  };
  /** Whether to validate email addresses before sending */
  validateEmails?: boolean;
  /** Whether to detect and skip duplicate recipients */
  skipDuplicates?: boolean;
  /** Custom selectors for email client (overrides provider defaults) */
  selectors?: SendEmailOptions;
  /** Rate limiting: minimum delay between emails in milliseconds */
  minDelayBetweenEmails?: number;
}

/**
 * Result of bulk email sending
 */
export interface BulkEmailResult {
  /** Total recipients processed */
  total: number;
  /** Successfully sent */
  sent: number;
  /** Failed sends */
  failed: number;
  /** Skipped (duplicates or invalid) */
  skipped: number;
  /** Results for each recipient */
  results: Array<{
    recipient: EmailRecipient;
    success: boolean;
    skipped: boolean;
    skipReason?: 'duplicate' | 'invalid' | 'other';
    error?: string;
    executionTime: number;
  }>;
  /** Total execution time in milliseconds */
  totalTime: number;
}

/**
 * Options for follow-up emails
 */
export interface FollowUpEmailOptions {
  /** Email provider: 'gmail' or 'outlook' (auto-detected if not specified) */
  provider?: 'gmail' | 'outlook' | 'auto';
  /** Selector for reply button */
  replyButtonSelector?: string;
  /** Selector for reply input field */
  replyInputSelector?: string;
  /** Selector for send button */
  sendButtonSelector?: string;
  /** Timeout for finding thread */
  threadTimeout?: number;
  /** Probability of reading previous messages before replying */
  readPreviousProbability?: number;
  /** Time to spend reading previous messages in milliseconds */
  readPreviousDuration?: {
    min: number;
    max: number;
  };
  /** Custom selectors */
  selectors?: SendEmailOptions;
}

/**
 * Result of follow-up email
 */
export interface FollowUpEmailResult {
  /** Whether the follow-up was sent successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Whether thread was found */
  threadFound: boolean;
}

/**
 * Validates an email address format
 *
 * @param email - Email address to validate
 * @returns True if email format is valid
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Replaces template variables in a string
 * Supports placeholders like {{name}}, {{company}}, {{email}}, etc.
 *
 * @param template - Template string with placeholders
 * @param recipient - Recipient data for variable replacement
 * @returns String with variables replaced
 */
export function replaceTemplateVariables(template: string, recipient: EmailRecipient): string {
  let result = template;

  // Standard variables
  const variables: Record<string, string> = {
    name: recipient.name || 'there',
    email: recipient.email,
    company: recipient.company || '',
  };

  // Add custom fields
  if (recipient.customFields) {
    Object.assign(variables, recipient.customFields);
  }

  // Replace all {{variable}} placeholders
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
    result = result.replace(regex, value || '');
  }

  // Clean up any remaining placeholders
  result = result.replace(/\{\{[^}]+\}\}/g, '');

  return result;
}

/**
 * Detects duplicate email addresses in a recipient list
 *
 * @param recipients - Array of recipients
 * @returns Map of email addresses to their first occurrence index
 */
export function detectDuplicates(recipients: EmailRecipient[]): Map<string, number> {
  const seen = new Map<string, number>();
  const duplicates = new Map<string, number>();

  recipients.forEach((recipient, index) => {
    const email = recipient.email.toLowerCase().trim();
    if (seen.has(email)) {
      duplicates.set(email, seen.get(email)!);
    } else {
      seen.set(email, index);
    }
  });

  return duplicates;
}

/**
 * Gets email client selectors based on provider
 *
 * @param provider - Email provider ('gmail', 'outlook', or 'auto')
 * @param page - Browser page instance (for auto-detection)
 * @returns Selectors for the email client
 */
async function getEmailSelectors(
  provider: 'gmail' | 'outlook' | 'auto',
  page?: BrowserPage
): Promise<SendEmailOptions> {
  if (provider === 'auto' && page) {
    // Auto-detect provider by checking URL
    const url = page.url();
    if (url.includes('gmail.com') || url.includes('mail.google.com')) {
      provider = 'gmail';
    } else if (url.includes('outlook.com') || url.includes('office.com')) {
      provider = 'outlook';
    }
  }

  if (provider === 'gmail') {
    return {
      composeButtonSelector: 'div[role="button"][aria-label*="Compose"], div[role="button"]:has-text("Compose")',
      recipientInputSelector: 'input[type="email"][name="to"], input[aria-label*="To"]',
      subjectInputSelector: 'input[name="subjectbox"], input[aria-label*="Subject"]',
      bodyInputSelector: 'div[aria-label*="Message Body"], div[role="textbox"][aria-label*="Message"]',
      sendButtonSelector: 'div[role="button"][aria-label*="Send"], div[role="button"]:has-text("Send")',
    };
  } else if (provider === 'outlook') {
    return {
      composeButtonSelector: 'button[aria-label*="New message"], button:has-text("New message"), .ms-Button--primary',
      recipientInputSelector: 'input[type="email"][aria-label*="To"], input[placeholder*="To"]',
      subjectInputSelector: 'input[aria-label*="Subject"], input[placeholder*="Subject"]',
      bodyInputSelector: 'div[contenteditable="true"][aria-label*="Message"], iframe[title*="Message"]',
      sendButtonSelector: 'button[aria-label*="Send"], button:has-text("Send")',
    };
  }

  // Default selectors (work with most email clients)
  return {
    composeButtonSelector: 'button[aria-label*="Compose"], button[aria-label*="New"], button:has-text("Compose")',
    recipientInputSelector: 'input[type="email"], input[name*="to"], input[placeholder*="To"]',
    subjectInputSelector: 'input[name*="subject"], input[placeholder*="Subject"]',
    bodyInputSelector: 'textarea[placeholder*="Message"], div[contenteditable="true"], iframe[title*="Message"]',
    sendButtonSelector: 'button[aria-label*="Send"], button:has-text("Send")',
  };
}

/**
 * Sends bulk emails with template personalization
 * Supports Gmail and Outlook interfaces with human-like behavior
 *
 * @param page - Playwright or Puppeteer page instance
 * @param recipients - Array of email recipients
 * @param template - Email template with placeholders
 * @param options - Configuration options
 * @param progressCallback - Optional progress callback
 * @returns Promise that resolves with bulk email results
 *
 * @example
 * ```typescript
 * const template: EmailTemplate = {
 *   subject: 'Hello {{name}}',
 *   body: 'Hi {{name}},\n\nI hope this email finds you well at {{company}}.\n\nBest regards',
 * };
 *
 * const recipients: EmailRecipient[] = [
 *   { email: 'john@example.com', name: 'John', company: 'Acme Corp' },
 *   { email: 'jane@example.com', name: 'Jane', company: 'Tech Inc' },
 * ];
 *
 * const result = await sendBulkEmails(page, recipients, template, {
 *   maxEmailsPerSession: 50,
 *   validateEmails: true,
 *   skipDuplicates: true,
 * });
 * ```
 */
export async function sendBulkEmails(
  page: BrowserPage,
  recipients: EmailRecipient[],
  template: EmailTemplate,
  options: BulkEmailOptions = {},
  progressCallback?: BatchProgressCallback
): Promise<BulkEmailResult> {
  const startTime = Date.now();
  const {
    maxEmailsPerSession = 50,
    provider = 'auto',
    rereadProbability = 0.3,
    composeTimeVariation = { min: 2000, max: 8000 },
    validateEmails = true,
    skipDuplicates = true,
    selectors: customSelectors,
    minDelayBetweenEmails = 3000,
    delayRange = { min: 3000, max: 8000 },
    breakAfter = 10,
    breakDuration = { min: 15000, max: 30000 },
    maxRetries = 1,
    randomizeOrder = true,
    continueOnError = true,
  } = options;

  // Safety limit: don't exceed max emails per session
  const limitedRecipients = recipients.slice(0, maxEmailsPerSession);
  
  if (recipients.length > maxEmailsPerSession) {
    console.warn(
      `[Email] Limiting to ${maxEmailsPerSession} emails per session. ` +
      `${recipients.length - maxEmailsPerSession} recipients will be skipped.`
    );
  }

  // Validate and filter recipients
  const validRecipients: EmailRecipient[] = [];
  const invalidRecipients: Array<{ recipient: EmailRecipient; reason: string }> = [];

  for (const recipient of limitedRecipients) {
    if (validateEmails && !validateEmail(recipient.email)) {
      invalidRecipients.push({ recipient, reason: 'invalid' });
      continue;
    }
    validRecipients.push(recipient);
  }

  // Detect duplicates
  const duplicateMap = skipDuplicates ? detectDuplicates(validRecipients) : new Map();
  const uniqueRecipients: EmailRecipient[] = [];
  const duplicateRecipients: Array<{ recipient: EmailRecipient; reason: string }> = [];

  validRecipients.forEach((recipient, index) => {
    const email = recipient.email.toLowerCase().trim();
    if (duplicateMap.has(email) && duplicateMap.get(email) !== index) {
      duplicateRecipients.push({ recipient, reason: 'duplicate' });
    } else {
      uniqueRecipients.push(recipient);
    }
  });

  console.log(
    `[Email] Processing ${uniqueRecipients.length} unique recipients ` +
    `(${invalidRecipients.length} invalid, ${duplicateRecipients.length} duplicates skipped)`
  );

  // Get email client selectors
  const defaultSelectors = await getEmailSelectors(provider, page);
  const selectors = customSelectors || defaultSelectors;

  const humanBehavior = new HumanBehavior(page);
  const executor = new BatchExecutor<EmailRecipient>();

  // Create tasks
  const tasks: BatchTask<EmailRecipient>[] = uniqueRecipients.map((recipient, index) => ({
    id: `email-${index}`,
    target: recipient,
    metadata: {
      index,
      email: recipient.email,
    },
  }));

  // Execute with BatchExecutor
  const batchResult = await executor.execute(
    tasks,
    async (recipient: EmailRecipient, task: BatchTask<EmailRecipient>) => {
      // Personalize template
      const personalizedSubject = replaceTemplateVariables(template.subject, recipient);
      const personalizedBody = replaceTemplateVariables(template.body, recipient);

      // Add compose time variation (realistic behavior)
      const composeTime = randomInt(composeTimeVariation.min, composeTimeVariation.max);
      await randomDelay(composeTime * 0.3, composeTime * 0.5); // Initial thinking time

      // Send email using actionPatterns
      const emailResult = await sendEmail(
        page,
        recipient.email,
        personalizedSubject,
        personalizedBody,
        {
          ...selectors,
          maxRetries: maxRetries,
          timeout: 30000,
        }
      );

      if (!emailResult.success) {
        throw new Error(emailResult.error || 'Email send failed');
      }

      // Random re-reading before sending (realistic behavior)
      if (randomBoolean(rereadProbability)) {
        const rereadDuration = randomInt(2000, 5000);
        await humanBehavior.simulateReading(rereadDuration);
        
        // Sometimes make small edits (simulate finding a typo)
        if (randomBoolean(0.2)) {
          await randomDelay(500, 1000);
          // Could add logic here to make small edits, but for now just simulate
          await humanBehavior.simulateThinking(randomInt(500, 1500));
        }
      }

      // Ensure minimum delay between emails (rate limiting)
      if (minDelayBetweenEmails > 0) {
        const currentDelay = delayRange ? randomInt(delayRange.min, delayRange.max) : minDelayBetweenEmails;
        const actualDelay = Math.max(minDelayBetweenEmails, currentDelay);
        await randomDelay(actualDelay, actualDelay);
      }

      return {
        recipient,
        success: true,
        personalizedSubject,
        personalizedBody,
      };
    },
    {
      delayRange: {
        min: Math.max(minDelayBetweenEmails, delayRange?.min || 3000),
        max: delayRange?.max || 8000,
      },
      breakAfter,
      breakDuration,
      maxRetries,
      randomizeOrder,
      continueOnError,
    },
    progressCallback
  );

  // Process results
  const sent = batchResult.results.filter(r => r.success).length;
  const failed = batchResult.results.filter(r => !r.success).length;
  const skipped = invalidRecipients.length + duplicateRecipients.length;

  // Build results array
  const results: BulkEmailResult['results'] = [];

  // Add invalid recipients
  invalidRecipients.forEach(({ recipient, reason }) => {
    results.push({
      recipient,
      success: false,
      skipped: true,
      skipReason: reason as 'invalid',
      error: 'Invalid email address',
      executionTime: 0,
    });
  });

  // Add duplicate recipients
  duplicateRecipients.forEach(({ recipient, reason }) => {
    results.push({
      recipient,
      success: false,
      skipped: true,
      skipReason: reason as 'duplicate',
      error: 'Duplicate email address',
      executionTime: 0,
    });
  });

  // Add batch execution results
  batchResult.results.forEach((result, index) => {
    const recipient = uniqueRecipients[index];
    results.push({
      recipient,
      success: result.success,
      skipped: false,
      error: result.error,
      executionTime: result.executionTime,
    });
  });

  return {
    total: recipients.length,
    sent,
    failed,
    skipped,
    results,
    totalTime: Date.now() - startTime,
  };
}

/**
 * Sends a follow-up email to an existing thread
 * Finds the thread, reads previous messages, and composes a reply
 *
 * @param page - Playwright or Puppeteer page instance
 * @param thread - Email thread information
 * @param followUpMessage - Message to send as follow-up
 * @param options - Configuration options
 * @returns Promise that resolves with follow-up result
 *
 * @example
 * ```typescript
 * const thread: EmailThread = {
 *   identifier: 'Meeting Request',
 *   searchMethod: 'subject',
 * };
 *
 * const result = await followUpEmails(
 *   page,
 *   thread,
 *   'Hi, just following up on our previous conversation...',
 *   {
 *     readPreviousProbability: 0.7,
 *   }
 * );
 * ```
 */
export async function followUpEmails(
  page: BrowserPage,
  thread: EmailThread,
  followUpMessage: string,
  options: FollowUpEmailOptions = {}
): Promise<FollowUpEmailResult> {
  const startTime = Date.now();
  const {
    provider = 'auto',
    replyButtonSelector,
    replyInputSelector,
    sendButtonSelector,
    threadTimeout = 30000,
    readPreviousProbability = 0.6,
    readPreviousDuration = { min: 3000, max: 8000 },
    selectors: customSelectors,
  } = options;

  const humanBehavior = new HumanBehavior(page);
  const isPlaywright = typeof (page as any).context === 'function';

  try {
    // Get email client selectors
    const defaultSelectors = await getEmailSelectors(provider, page);
    const selectors = customSelectors || defaultSelectors;

    // Find thread based on search method
    let threadFound = false;

    if (thread.searchMethod === 'subject' || !thread.searchMethod) {
      // Search by subject
      const searchSelector = provider === 'gmail'
        ? 'input[aria-label*="Search"], input[placeholder*="Search"]'
        : 'input[aria-label*="Search"], input[placeholder*="Search"]';

      const searchInput = await findElement(page, searchSelector, threadTimeout);
      if (searchInput) {
        await humanBehavior.humanType(searchSelector, `subject:"${thread.identifier}"`, {
          clearFirst: true,
        });
        await randomDelay(500, 1000);

        // Press Enter to search
        if (isPlaywright) {
          await (page as any).keyboard.press('Enter');
        } else {
          await (page as any).keyboard.press('Enter');
        }

        await randomDelay(2000, 4000); // Wait for search results

        // Check if results found
        const resultsSelector = provider === 'gmail'
          ? '.zA, [role="row"]'
          : '.ms-List-cell, [role="listitem"]';

        const results = await findElements(page, resultsSelector, 5000);
        threadFound = results.length > 0;
      }
    } else if (thread.searchMethod === 'threadId') {
      // Navigate directly to thread (if URL pattern is known)
      const threadUrl = provider === 'gmail'
        ? `https://mail.google.com/mail/u/0/#inbox/${thread.identifier}`
        : `https://outlook.live.com/mail/0/#inbox/${thread.identifier}`;

      try {
        if (isPlaywright) {
          await (page as any).goto(threadUrl, { waitUntil: 'networkidle' });
        } else {
          await (page as any).goto(threadUrl, { waitUntil: 'networkidle0' });
        }
        await randomDelay(2000, 3000);
        threadFound = true;
      } catch (error) {
        threadFound = false;
      }
    } else if (thread.searchMethod === 'search') {
      // Generic search
      const searchSelector = 'input[aria-label*="Search"], input[placeholder*="Search"]';
      const searchInput = await findElement(page, searchSelector, threadTimeout);
      if (searchInput) {
        await humanBehavior.humanType(searchSelector, thread.identifier, {
          clearFirst: true,
        });
        await randomDelay(500, 1000);

        if (isPlaywright) {
          await (page as any).keyboard.press('Enter');
        } else {
          await (page as any).keyboard.press('Enter');
        }

        await randomDelay(2000, 4000);
        threadFound = true; // Assume found if search executed
      }
    }

    if (!threadFound) {
      return {
        success: false,
        error: `Thread not found: ${thread.identifier}`,
        executionTime: Date.now() - startTime,
        threadFound: false,
      };
    }

    // Read previous messages (realistic behavior)
    if (randomBoolean(readPreviousProbability)) {
      const readDuration = randomInt(readPreviousDuration.min, readPreviousDuration.max);
      await humanBehavior.simulateReading(readDuration);
      
      // Sometimes scroll to see more of the conversation
      if (randomBoolean(0.4)) {
        await humanBehavior.humanScroll(randomInt(200, 500));
        await randomDelay(1000, 2000);
      }
    }

    // Find and click reply button
    const defaultReplySelector = provider === 'gmail'
      ? 'div[role="button"][aria-label*="Reply"], span:has-text("Reply")'
      : 'button[aria-label*="Reply"], button:has-text("Reply")';

    const replySelector = replyButtonSelector || defaultReplySelector;
    const replyButton = await findElement(page, replySelector, threadTimeout);

    if (!replyButton) {
      return {
        success: false,
        error: 'Reply button not found',
        executionTime: Date.now() - startTime,
        threadFound: true,
      };
    }

    await humanBehavior.humanClick(replySelector);
    await randomDelay(1000, 2000); // Wait for reply box to open

    // Find reply input
    const defaultReplyInputSelector = provider === 'gmail'
      ? 'div[aria-label*="Message Body"], div[role="textbox"][aria-label*="Message"]'
      : 'div[contenteditable="true"][aria-label*="Message"], iframe[title*="Message"]';

    const actualReplyInputSelector = replyInputSelector || defaultReplyInputSelector;
    await randomDelay(500, 1000);

    // Type follow-up message
    await humanBehavior.humanType(actualReplyInputSelector, followUpMessage, {
      clearFirst: false, // Don't clear, append to existing reply
      waitForVisible: true,
      timeout: threadTimeout,
    });

    // Simulate thinking before sending
    await humanBehavior.simulateThinking(randomInt(1000, 3000));

    // Sometimes re-read the reply
    if (randomBoolean(0.3)) {
      await humanBehavior.simulateReading(randomInt(1500, 4000));
    }

    // Find and click send button
    const defaultSendSelector = provider === 'gmail'
      ? 'div[role="button"][aria-label*="Send"], div[role="button"]:has-text("Send")'
      : 'button[aria-label*="Send"], button:has-text("Send")';

    const sendSelector = sendButtonSelector || defaultSendSelector;
    await humanBehavior.humanClick(sendSelector, {
      waitForVisible: true,
      timeout: threadTimeout,
    });

    await randomDelay(1000, 2000); // Wait for send to complete

    return {
      success: true,
      executionTime: Date.now() - startTime,
      threadFound: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTime: Date.now() - startTime,
      threadFound: false,
    };
  }
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

