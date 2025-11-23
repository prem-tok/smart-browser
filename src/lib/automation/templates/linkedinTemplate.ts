/**
 * LinkedIn Automation Templates
 * Pre-built functions for common LinkedIn automation tasks with human-like behavior
 */

import { BatchExecutor, type BatchTask, type BatchExecutionOptions, type BatchProgressCallback } from '../batchExecutor';
import { sendConnectionRequest, type SendConnectionRequestOptions } from '../actionPatterns';
import { HumanBehavior, type BrowserPage } from '../humanBehavior';
import { randomDelay, randomInt, randomBoolean, randomChoice, shuffleArray } from '../randomization';

/**
 * Options for bulk connection requests
 */
export interface BulkConnectionRequestOptions extends BatchExecutionOptions {
  /** Maximum connections per session (safety limit) */
  maxConnectionsPerSession?: number;
  /** Probability of skipping a profile (0.0 to 1.0) */
  skipProbability?: number;
  /** Whether to view profile before connecting */
  viewProfile?: boolean;
  /** Profile viewing duration range in milliseconds */
  profileViewDuration?: {
    min: number;
    max: number;
  };
  /** Whether to personalize messages */
  personalizeMessages?: boolean;
  /** Custom message template (use {name} for name placeholder) */
  messageTemplate?: string;
  /** Connection request specific options */
  connectionOptions?: SendConnectionRequestOptions;
}

/**
 * Result of bulk connection requests
 */
export interface BulkConnectionRequestResult {
  /** Total profiles processed */
  total: number;
  /** Successfully connected */
  connected: number;
  /** Failed connections */
  failed: number;
  /** Skipped profiles */
  skipped: number;
  /** Results for each profile */
  results: Array<{
    profileUrl: string;
    success: boolean;
    skipped: boolean;
    error?: string;
    executionTime: number;
  }>;
  /** Total execution time in milliseconds */
  totalTime: number;
}

/**
 * Options for bulk messages
 */
export interface BulkMessageOptions extends BatchExecutionOptions {
  /** Selector for messages/conversations list */
  conversationsListSelector?: string;
  /** Selector for message input field */
  messageInputSelector?: string;
  /** Selector for send button */
  sendButtonSelector?: string;
  /** Timeout for finding conversations */
  conversationTimeout?: number;
}

/**
 * Result of bulk messages
 */
export interface BulkMessageResult {
  /** Total conversations processed */
  total: number;
  /** Successfully sent */
  sent: number;
  /** Failed sends */
  failed: number;
  /** Results for each conversation */
  results: Array<{
    name: string;
    success: boolean;
    error?: string;
    executionTime: number;
  }>;
  /** Total execution time in milliseconds */
  totalTime: number;
}

/**
 * Options for skill endorsements
 */
export interface EndorseSkillsOptions {
  /** Maximum number of skills to endorse */
  maxSkills?: number;
  /** Selector for skills section */
  skillsSectionSelector?: string;
  /** Selector for skill items */
  skillItemSelector?: string;
  /** Selector for endorse button */
  endorseButtonSelector?: string;
  /** Whether to avoid already endorsed skills */
  avoidEndorsed?: boolean;
  /** Timeout for operations */
  timeout?: number;
  /** Dry-run mode */
  dryRun?: boolean;
}

/**
 * Result of skill endorsement
 */
export interface EndorseSkillsResult {
  /** Total skills endorsed */
  endorsed: number;
  /** Skills that were already endorsed */
  alreadyEndorsed: number;
  /** Failed endorsements */
  failed: number;
  /** Total execution time in milliseconds */
  executionTime: number;
  /** Details of each endorsement */
  details: Array<{
    skillName: string;
    success: boolean;
    alreadyEndorsed: boolean;
    error?: string;
  }>;
}

/**
 * Sends bulk connection requests on LinkedIn
 * Uses BatchExecutor for safe, randomized execution with human-like behavior
 *
 * @param page - Playwright or Puppeteer page instance
 * @param profileUrls - Array of LinkedIn profile URLs to connect with
 * @param message - Optional message to include (or use messageTemplate in options)
 * @param options - Configuration options
 * @param progressCallback - Optional progress callback
 * @returns Promise that resolves with bulk connection results
 *
 * @example
 * ```typescript
 * const result = await sendBulkConnectionRequests(
 *   page,
 *   ['https://linkedin.com/in/user1', 'https://linkedin.com/in/user2'],
 *   'Hi, I would like to connect!',
 *   {
 *     maxConnectionsPerSession: 20,
 *     viewProfile: true,
 *     skipProbability: 0.1,
 *   },
 *   (progress) => console.log(`Progress: ${progress.percentage}%`)
 * );
 * ```
 */
export async function sendBulkConnectionRequests(
  page: BrowserPage,
  profileUrls: string[],
  message?: string,
  options: BulkConnectionRequestOptions = {},
  progressCallback?: BatchProgressCallback
): Promise<BulkConnectionRequestResult> {
  const startTime = Date.now();
  const {
    maxConnectionsPerSession = 20,
    skipProbability = 0.1,
    viewProfile = true,
    profileViewDuration = { min: 2000, max: 5000 },
    personalizeMessages = false,
    messageTemplate,
    connectionOptions = {},
    delayRange = { min: 3000, max: 8000 },
    breakAfter = 5,
    breakDuration = { min: 10000, max: 30000 },
    maxRetries = 1,
    randomizeOrder = true,
    continueOnError = true,
  } = options;

  // Safety limit: don't exceed max connections per session
  const limitedUrls = profileUrls.slice(0, maxConnectionsPerSession);
  
  if (profileUrls.length > maxConnectionsPerSession) {
    console.warn(
      `[LinkedIn] Limiting to ${maxConnectionsPerSession} connections per session. ` +
      `${profileUrls.length - maxConnectionsPerSession} profiles will be skipped.`
    );
  }

  const humanBehavior = new HumanBehavior(page);
  const executor = new BatchExecutor<string>();

  // Create tasks
  const tasks: BatchTask<string>[] = limitedUrls.map((url, index) => ({
    id: `connection-${index}`,
    target: url,
    metadata: {
      index,
      url,
    },
  }));

  // Execute with BatchExecutor
  const batchResult = await executor.execute(
    tasks,
    async (profileUrl: string, task: BatchTask<string>) => {
      // Simulate occasional skipping (realistic behavior)
      if (randomBoolean(skipProbability)) {
        throw new Error('Skipped: Random skip simulation');
      }

      // View profile briefly before connecting (realistic behavior)
      if (viewProfile) {
        try {
          const isPlaywright = typeof (page as any).context === 'function';
          if (isPlaywright) {
            await (page as any).goto(profileUrl, { waitUntil: 'networkidle' });
          } else {
            await (page as any).goto(profileUrl, { waitUntil: 'networkidle0' });
          }

          // Random scroll to view profile
          const scrollAmount = randomInt(200, 600);
          await humanBehavior.humanScroll(scrollAmount);
          
          // Simulate reading profile
          const viewDuration = randomInt(profileViewDuration.min, profileViewDuration.max);
          await humanBehavior.simulateReading(viewDuration);

          // Sometimes scroll back up a bit (like reviewing)
          if (randomBoolean(0.3)) {
            await humanBehavior.humanScroll(-randomInt(100, 300));
            await humanBehavior.simulateThinking(randomInt(500, 1500));
          }
        } catch (error) {
          console.warn(`[LinkedIn] Failed to view profile ${profileUrl}:`, error);
          // Continue anyway
        }
      }

      // Prepare message
      let finalMessage = message;
      if (personalizeMessages && messageTemplate) {
        // Extract name from URL or use generic
        const nameMatch = profileUrl.match(/\/in\/([^/]+)/);
        const name = nameMatch ? nameMatch[1].replace(/-/g, ' ') : 'there';
        finalMessage = messageTemplate.replace('{name}', name);
      }

      // Send connection request
      const result = await sendConnectionRequest(
        page,
        profileUrl,
        finalMessage,
        {
          ...connectionOptions,
          reviewProfile: viewProfile,
          reviewProfileProbability: 0.2,
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Connection request failed');
      }

      return { profileUrl, success: true };
    },
    {
      delayRange,
      breakAfter,
      breakDuration,
      maxRetries,
      randomizeOrder,
      continueOnError,
      skipOnFailure: false, // Don't skip on failure, retry instead
    },
    progressCallback
  );

  // Process results
  const connected = batchResult.results.filter(r => r.success).length;
  const failed = batchResult.results.filter(r => !r.success && !r.error?.includes('Skipped')).length;
  const skipped = batchResult.results.filter(r => r.error?.includes('Skipped')).length;

  return {
    total: limitedUrls.length,
    connected,
    failed,
    skipped,
    results: batchResult.results.map((result, index) => ({
      profileUrl: limitedUrls[index],
      success: result.success,
      skipped: result.error?.includes('Skipped') || false,
      error: result.error,
      executionTime: result.executionTime,
    })),
    totalTime: Date.now() - startTime,
  };
}

/**
 * Sends bulk messages on LinkedIn
 * Opens LinkedIn messages and sends messages to multiple conversations
 *
 * @param page - Playwright or Puppeteer page instance
 * @param conversations - Array of conversations with name and message
 * @param options - Configuration options
 * @param progressCallback - Optional progress callback
 * @returns Promise that resolves with bulk message results
 *
 * @example
 * ```typescript
 * const result = await sendBulkMessages(
 *   page,
 *   [
 *     { name: 'John Doe', message: 'Hi John, how are you?' },
 *     { name: 'Jane Smith', message: 'Hello Jane!' },
 *   ],
 *   { maxRetries: 2 }
 * );
 * ```
 */
export async function sendBulkMessages(
  page: BrowserPage,
  conversations: Array<{ name: string; message: string }>,
  options: BulkMessageOptions = {},
  progressCallback?: BatchProgressCallback
): Promise<BulkMessageResult> {
  const startTime = Date.now();
  const {
    conversationsListSelector = '[data-test-id="conversation-list"] a, .msg-conversation-listitem, .conversation-item',
    messageInputSelector = 'div[contenteditable="true"][role="textbox"], .msg-send-message__input, textarea[placeholder*="message"]',
    sendButtonSelector = 'button[aria-label*="Send"], button:has-text("Send"), .msg-send-button',
    conversationTimeout = 30000,
    delayRange = { min: 2000, max: 5000 },
    breakAfter = 3,
    breakDuration = { min: 5000, max: 15000 },
    maxRetries = 2,
    randomizeOrder = true,
    continueOnError = true,
  } = options;

  const humanBehavior = new HumanBehavior(page);
  const executor = new BatchExecutor<{ name: string; message: string }>();

  // Navigate to LinkedIn messages
  try {
    const isPlaywright = typeof (page as any).context === 'function';
    if (isPlaywright) {
      await (page as any).goto('https://www.linkedin.com/messaging/', { waitUntil: 'networkidle' });
    } else {
      await (page as any).goto('https://www.linkedin.com/messaging/', { waitUntil: 'networkidle0' });
    }
    await randomDelay(1000, 2000);
  } catch (error) {
    throw new Error(`Failed to navigate to LinkedIn messages: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Create tasks
  const tasks: BatchTask<{ name: string; message: string }>[] = conversations.map((conv, index) => ({
    id: `message-${index}`,
    target: conv,
    metadata: {
      index,
      name: conv.name,
    },
  }));

  // Execute with BatchExecutor
  const batchResult = await executor.execute(
    tasks,
    async (conversation: { name: string; message: string }, task: BatchTask<{ name: string; message: string }>) => {
      const { name, message } = conversation;

      // Find conversation by name
      const isPlaywright = typeof (page as any).context === 'function';
      let conversationElement;

      if (isPlaywright) {
        // Try to find conversation link by name
        const conversationLink = await (page as any).locator(
          `text="${name}"`
        ).first().waitFor({ state: 'visible', timeout: conversationTimeout }).catch(() => null);

        if (!conversationLink) {
          throw new Error(`Conversation with "${name}" not found`);
        }

        await humanBehavior.humanClick(`text="${name}"`);
        await randomDelay(1000, 2000);
      } else {
        // Puppeteer: find by text content
        conversationElement = await (page as any).evaluateHandle((searchName: string) => {
          const elements = Array.from(document.querySelectorAll('a, div'));
          return elements.find((el: any) => 
            el.textContent?.includes(searchName) && 
            (el.closest('[data-test-id="conversation-list"]') || el.closest('.msg-conversation-listitem'))
          );
        }, name);

        if (!conversationElement || (await conversationElement.evaluate((el: any) => el)) === null) {
          throw new Error(`Conversation with "${name}" not found`);
        }

        await conversationElement.click();
        await randomDelay(1000, 2000);
      }

      // Wait for message input to be ready
      await randomDelay(500, 1000);

      // Type and send message
      await humanBehavior.humanType(messageInputSelector, message, {
        clearFirst: true,
        waitForVisible: true,
        timeout: conversationTimeout,
      });

      // Small delay before sending
      await humanBehavior.simulateThinking(randomInt(300, 800));
      await randomDelay(200, 500);

      // Click send button
      await humanBehavior.humanClick(sendButtonSelector, {
        waitForVisible: true,
        timeout: conversationTimeout,
      });

      // Wait for message to send
      await randomDelay(1000, 2000);

      return { name, success: true };
    },
    {
      delayRange,
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

  return {
    total: conversations.length,
    sent,
    failed,
    results: batchResult.results.map((result, index) => ({
      name: conversations[index].name,
      success: result.success,
      error: result.error,
      executionTime: result.executionTime,
    })),
    totalTime: Date.now() - startTime,
  };
}

/**
 * Endorses skills on a LinkedIn profile
 * Navigates to profile and endorses random skills with human-like behavior
 *
 * @param page - Playwright or Puppeteer page instance
 * @param profileUrl - LinkedIn profile URL
 * @param skillCount - Number of skills to endorse (default: 3-5 random)
 * @param options - Configuration options
 * @returns Promise that resolves with endorsement results
 *
 * @example
 * ```typescript
 * const result = await endorseSkills(
 *   page,
 *   'https://linkedin.com/in/johndoe',
 *   5,
 *   { avoidEndorsed: true }
 * );
 * ```
 */
export async function endorseSkills(
  page: BrowserPage,
  profileUrl: string,
  skillCount?: number,
  options: EndorseSkillsOptions = {}
): Promise<EndorseSkillsResult> {
  const startTime = Date.now();
  const {
    maxSkills = 10,
    skillsSectionSelector = '#skills-section, [data-section="skills"], .pv-profile-section__card-item[data-section="skills"]',
    skillItemSelector = '.pv-skill-category-entity__skill-wrapper, .skill-category-entity__skill, [data-test-id="skill-item"]',
    endorseButtonSelector = 'button[aria-label*="Endorse"], button:has-text("Endorse"), .endorse-button',
    avoidEndorsed = true,
    timeout = 30000,
    dryRun = false,
  } = options;

  const humanBehavior = new HumanBehavior(page);
  const targetSkillCount = skillCount || randomInt(3, 5);

  if (dryRun) {
    return {
      endorsed: 0,
      alreadyEndorsed: 0,
      failed: 0,
      executionTime: 0,
      details: [],
    };
  }

  try {
    // Navigate to profile
    const isPlaywright = typeof (page as any).context === 'function';
    if (isPlaywright) {
      await (page as any).goto(profileUrl, { waitUntil: 'networkidle' });
    } else {
      await (page as any).goto(profileUrl, { waitUntil: 'networkidle0' });
    }

    await randomDelay(1000, 2000);

    // Scroll to skills section with human behavior
    const skillsSection = await findElement(page, skillsSectionSelector, timeout);
    if (!skillsSection) {
      throw new Error('Skills section not found');
    }

    // Scroll to skills section
    if (isPlaywright) {
      await (page as any).locator(skillsSectionSelector).first().scrollIntoViewIfNeeded();
    } else {
      await skillsSection.scrollIntoView();
    }

    await randomDelay(500, 1000);
    await humanBehavior.simulateReading(randomInt(1000, 2000));

    // Find all skill items
    const skillItems = await findElements(page, skillItemSelector, timeout);
    if (!skillItems || skillItems.length === 0) {
      throw new Error('No skills found on profile');
    }

    // Filter out already endorsed skills if needed
    let availableSkills = skillItems;
    if (avoidEndorsed) {
      const unendorsedSkills: any[] = [];
      
      for (const skillItem of skillItems) {
        const isEndorsed = await checkIfEndorsed(page, skillItem, endorseButtonSelector);
        if (!isEndorsed) {
          unendorsedSkills.push(skillItem);
        }
      }
      
      availableSkills = unendorsedSkills;
      
      if (availableSkills.length === 0) {
        return {
          endorsed: 0,
          alreadyEndorsed: skillItems.length,
          failed: 0,
          executionTime: Date.now() - startTime,
          details: skillItems.map(() => ({
            skillName: 'Unknown',
            success: false,
            alreadyEndorsed: true,
          })),
        };
      }
    }

    // Select random skills to endorse
    const skillsToEndorse = shuffleArray([...availableSkills]).slice(0, Math.min(targetSkillCount, availableSkills.length));

    const details: EndorseSkillsResult['details'] = [];
    let endorsed = 0;
    let alreadyEndorsed = 0;
    let failed = 0;

    // Endorse each skill
    for (let i = 0; i < skillsToEndorse.length; i++) {
      const skillItem = skillsToEndorse[i];
      
      try {
        // Get skill name
        const skillName = await getSkillName(page, skillItem);
        
        // Check if already endorsed (double-check)
        if (avoidEndorsed) {
          const isEndorsed = await checkIfEndorsed(page, skillItem, endorseButtonSelector);
          if (isEndorsed) {
            alreadyEndorsed++;
            details.push({
              skillName: skillName || 'Unknown',
              success: false,
              alreadyEndorsed: true,
            });
            continue;
          }
        }

        // Find and click endorse button for this skill
        const endorseButton = await findEndorseButton(page, skillItem, endorseButtonSelector);
        if (!endorseButton) {
          throw new Error('Endorse button not found');
        }

        // Click endorse button with human behavior
        if (isPlaywright) {
          await (page as any).locator(endorseButtonSelector).nth(i).click();
        } else {
          await endorseButton.click();
        }

        await randomDelay(500, 1000);
        endorsed++;

        details.push({
          skillName: skillName || 'Unknown',
          success: true,
          alreadyEndorsed: false,
        });

        // Small delay between endorsements
        if (i < skillsToEndorse.length - 1) {
          await randomDelay(800, 1500);
        }
      } catch (error) {
        failed++;
        details.push({
          skillName: 'Unknown',
          success: false,
          alreadyEndorsed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      endorsed,
      alreadyEndorsed,
      failed,
      executionTime: Date.now() - startTime,
      details,
    };
  } catch (error) {
    throw new Error(
      `Failed to endorse skills: ${error instanceof Error ? error.message : String(error)}`
    );
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

/**
 * Check if a skill is already endorsed
 */
async function checkIfEndorsed(
  page: BrowserPage,
  skillElement: any,
  endorseButtonSelector: string
): Promise<boolean> {
  const isPlaywright = typeof (page as any).context === 'function';
  
  try {
    if (isPlaywright) {
      // Check if endorse button exists and is visible
      const button = skillElement.locator(endorseButtonSelector).first();
      const count = await button.count();
      if (count === 0) {
        return true; // No button = already endorsed
      }
      
      // Check button text/state
      const buttonText = await button.textContent().catch(() => '');
      return buttonText?.toLowerCase().includes('endorsed') || 
             buttonText?.toLowerCase().includes('remove');
    } else {
      // Puppeteer: check if button exists
      const button = await skillElement.$(endorseButtonSelector);
      if (!button) {
        return true; // No button = already endorsed
      }
      
      const buttonText = await button.evaluate((el: any) => el.textContent || '');
      return buttonText.toLowerCase().includes('endorsed') || 
             buttonText.toLowerCase().includes('remove');
    }
  } catch (error) {
    // If we can't determine, assume not endorsed
    return false;
  }
}

/**
 * Find endorse button for a skill item
 */
async function findEndorseButton(
  page: BrowserPage,
  skillElement: any,
  endorseButtonSelector: string
): Promise<any> {
  const isPlaywright = typeof (page as any).context === 'function';
  
  if (isPlaywright) {
    return skillElement.locator(endorseButtonSelector).first();
  } else {
    return await skillElement.$(endorseButtonSelector);
  }
}

/**
 * Get skill name from skill element
 */
async function getSkillName(page: BrowserPage, skillElement: any): Promise<string> {
  const isPlaywright = typeof (page as any).context === 'function';
  
  try {
    if (isPlaywright) {
      // Try to find skill name in common locations
      const nameSelectors = [
        '.pv-skill-category-entity__name',
        '.skill-category-entity__name',
        'span[data-test-id="skill-name"]',
        'a',
      ];
      
      for (const selector of nameSelectors) {
        const nameElement = skillElement.locator(selector).first();
        const count = await nameElement.count();
        if (count > 0) {
          const text = await nameElement.textContent();
          if (text && text.trim()) {
            return text.trim();
          }
        }
      }
      
      // Fallback: get all text
      const text = await skillElement.textContent();
      return text?.split('\n')[0]?.trim() || 'Unknown';
    } else {
      // Puppeteer: try to find skill name
      const nameSelectors = [
        '.pv-skill-category-entity__name',
        '.skill-category-entity__name',
        'span[data-test-id="skill-name"]',
        'a',
      ];
      
      for (const selector of nameSelectors) {
        const nameElement = await skillElement.$(selector);
        if (nameElement) {
          const text = await nameElement.evaluate((el: any) => el.textContent);
          if (text && text.trim()) {
            return text.trim();
          }
        }
      }
      
      // Fallback: get all text
      const text = await skillElement.evaluate((el: any) => el.textContent);
      return text?.split('\n')[0]?.trim() || 'Unknown';
    }
  } catch (error) {
    return 'Unknown';
  }
}


