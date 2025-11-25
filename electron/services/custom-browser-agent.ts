/**
 * Custom BrowserAgent with Comet Browser Features
 * 
 * This custom BrowserAgent uses our Playwright functions with Comet features:
 * - CDP integration for faster screenshots
 * - Vision analysis for better page understanding
 * - Visual action indicators (headed mode)
 * - Screenshot labeling with element indexes
 * - Humanized behavior (Bezier curves, typing delays)
 * 
 * This replaces BrowserAgent from @jarvis-agent/electron which bypasses our features.
 */

import { Log, type AgentContext, type Tool, Context, BaseBrowserLabelsAgent } from "@jarvis-agent/core";
import type { SimpleSseMcpClient } from "@jarvis-agent/core";
import { WebContentsView } from "electron";
import {
  screenshotAndHtml,
  clickElementByIndex,
  inputTextByIndex,
  goto,
  newPage,
  getPage,
  type ElementDescriptor
} from "../playwrightController";

export class CustomBrowserAgent extends BaseBrowserLabelsAgent {
  private detailView: WebContentsView;
  private customPrompt?: string;
  private windowId: string;
  
  // Screenshot loop prevention
  private lastScreenshotUrl: string = '';
  private lastScreenshotTime: number = 0;
  private lastScreenshotElementCount: number = 0;
  private consecutiveScreenshots: number = 0;
  private readonly SCREENSHOT_COOLDOWN_MS = 2000; // Minimum 2 seconds between screenshots
  private readonly MAX_CONSECUTIVE_SCREENSHOTS = 1; // Max 1 screenshot without action (stricter)
  
  // Navigation tracking
  private lastClickUrl: string = '';
  private lastClickTime: number = 0;
  private readonly NAVIGATION_TIMEOUT_MS = 5000; // Wait 5 seconds for navigation after click

  constructor(
    detailView: WebContentsView,
    mcpClient: SimpleSseMcpClient,
    customPrompt?: string
  ) {
    // Generate windowId from detailView's webContents id
    const windowId = `main-${detailView.webContents.id}`;
    
    // Initialize BaseBrowserLabelsAgent (it provides all browser tools automatically)
    super(undefined, undefined, mcpClient);

    this.detailView = detailView;
    this.customPrompt = customPrompt;
    this.windowId = windowId;
    
    Log.info('[CustomBrowserAgent] Initialized with Comet features enabled');
    Log.info('[CustomBrowserAgent] Extending BaseBrowserLabelsAgent - browser tools are automatically available');
    if (customPrompt) {
      Log.info('[CustomBrowserAgent] Custom prompt loaded (length:', customPrompt.length, 'chars)');
    }
  }

  /**
   * Override system prompt to include custom prompt
   * This ensures the custom prompt is actually used by the agent
   */
  protected async extSysPrompt(agentContext: AgentContext, tools: Tool[]): Promise<string> {
    // Get base system prompt from parent
    const basePrompt = await super.extSysPrompt(agentContext, tools);
    
    // Append custom prompt if available
    if (this.customPrompt) {
      return `${basePrompt}\n\n${this.customPrompt}`;
    }
    
    return basePrompt;
  }

  /**
   * Implement required abstract methods from BaseBrowserAgent
   * These methods are called by BaseBrowserLabelsAgent to provide browser functionality
   */
  
  /**
   * Capture a screenshot of the current page
   * This is used by BaseBrowserAgent and HumanInteractTool for login checking
   */
  protected async screenshot(agentContext: AgentContext): Promise<{
    imageBase64: string;
    imageType: "image/jpeg" | "image/png";
  }> {
    await this.ensurePlaywrightPage();
    const result = await screenshotAndHtml(this.windowId, { labelScreenshot: false });
    
    if (!result.ok || !result.data) {
      Log.error('[CustomBrowserAgent] Screenshot failed:', result.error);
      throw new Error(result.error?.message || "Screenshot failed");
    }
    
    // Get screenshot from result.data
    const screenshot = result.data.screenshot;
    if (!screenshot || typeof screenshot !== 'string') {
      Log.error('[CustomBrowserAgent] Screenshot data is invalid:', typeof screenshot);
      throw new Error("Screenshot data is invalid or missing");
    }
    
    // Ensure it's in the correct format (base64 string, optionally with data URL prefix)
    // The framework's toImage/toFile functions expect a string that has startsWith method
    // They might expect a data URL format or a file path
    let imageBase64: string;
    if (screenshot.startsWith('data:')) {
      // Already a data URL
      imageBase64 = screenshot;
    } else if (screenshot.startsWith('/') || screenshot.includes('\\')) {
      // Looks like a file path - this shouldn't happen with our implementation
      Log.warn('[CustomBrowserAgent] Screenshot appears to be a file path, converting to data URL');
      imageBase64 = `data:image/png;base64,${screenshot}`;
    } else {
      // Plain base64 string, add data URL prefix
      imageBase64 = `data:image/png;base64,${screenshot}`;
    }
    
    return {
      imageBase64: imageBase64,
      imageType: "image/png"
    };
  }

  /**
   * Navigate to a URL
   */
  protected async navigate_to(agentContext: AgentContext, url: string): Promise<{
    url: string;
    title?: string;
  }> {
    return await this.handleNavigateTo({ url });
  }

  /**
   * Get all tabs (for Electron, we only have one tab)
   */
  protected async get_all_tabs(agentContext: AgentContext): Promise<Array<{
    tabId: number;
    url: string;
    title: string;
  }>> {
    const url = this.detailView.webContents.getURL();
    const title = this.detailView.webContents.getTitle();
    return [{
      tabId: this.detailView.webContents.id,
      url: url || '',
      title: title || ''
    }];
  }

  /**
   * Switch to a different tab (for Electron, we only have one tab)
   */
  protected async switch_tab(agentContext: AgentContext, tabId: number): Promise<{
    tabId: number;
    url: string;
    title: string;
  }> {
    // In Electron, we only have one tab, so just return current tab info
    const url = this.detailView.webContents.getURL();
    const title = this.detailView.webContents.getTitle();
    return {
      tabId: this.detailView.webContents.id,
      url: url || '',
      title: title || ''
    };
  }

  /**
   * Execute JavaScript in the page
   */
  protected async execute_script(agentContext: AgentContext, func: (...args: any[]) => void, args: any[]): Promise<any> {
    await this.ensurePlaywrightPage();
    
    // Get the page from the map (newPage returns ApiResponse, not the page directly)
    const page = getPage(this.windowId);
    if (!page) {
      throw new Error('Playwright page not available');
    }
    
    return await page.evaluate(func, ...args);
  }

  /**
   * Go back in browser history
   */
  protected async go_back(agentContext: AgentContext): Promise<void> {
    if (this.detailView.webContents.canGoBack()) {
      this.detailView.webContents.goBack();
    }
  }

  /**
   * Override screenshot_and_html to use our Playwright implementation with Comet features
   * Includes smart screenshot loop prevention and computer vision fallback
   */
  protected async screenshot_and_html(agentContext: AgentContext): Promise<{
    imageBase64: string;
    imageType: "image/jpeg" | "image/png";
    pseudoHtml: string;
  }> {
    let currentUrl = this.detailView.webContents.getURL();
    const now = Date.now();
    
    // Smart screenshot strategy: Only take screenshot if:
    // 1. URL changed (navigation occurred)
    // 2. Enough time passed since last screenshot (cooldown)
    // 3. We haven't exceeded consecutive screenshot limit
    const urlChanged = currentUrl !== this.lastScreenshotUrl;
    const timeSinceLastScreenshot = now - this.lastScreenshotTime;
    const shouldTakeScreenshot = urlChanged || 
                                 (timeSinceLastScreenshot >= this.SCREENSHOT_COOLDOWN_MS && 
                                  this.consecutiveScreenshots < this.MAX_CONSECUTIVE_SCREENSHOTS);
    
    if (!shouldTakeScreenshot && !urlChanged) {
      // We're in a loop - throw error to force agent to stop and take action
      Log.error(`[CustomBrowserAgent] ❌ SCREENSHOT LOOP DETECTED - URL unchanged (${currentUrl}), consecutive screenshots: ${this.consecutiveScreenshots}`);
      Log.error(`[CustomBrowserAgent] ❌ Last screenshot was ${Math.round(timeSinceLastScreenshot / 1000)}s ago`);
      Log.error(`[CustomBrowserAgent] ❌ You MUST take an action (click_element, input_text, navigate_to, wait) before taking another screenshot`);
      
      // Throw error instead of returning empty screenshot - this forces the agent to handle it
      throw new Error(`Screenshot loop detected: ${this.consecutiveScreenshots} consecutive screenshots without action. You must call click_element(index), input_text(index, text), navigate_to(url), or wait(ms) before taking another screenshot. Current URL: ${currentUrl}. If you're stuck, call human_interact(request_help) with a clear question.`);
    }
    
    // Reset consecutive counter if URL changed
    if (urlChanged) {
      this.consecutiveScreenshots = 0;
      this.lastScreenshotUrl = currentUrl;
      Log.info(`[CustomBrowserAgent] 📸 URL changed, taking screenshot: ${currentUrl}`);
    } else {
      this.consecutiveScreenshots++;
      Log.info(`[CustomBrowserAgent] 📸 Taking screenshot (cooldown passed): ${currentUrl} (consecutive: ${this.consecutiveScreenshots})`);
    }
    
    this.lastScreenshotTime = now;
    
    await this.ensurePlaywrightPage();
    const result = await screenshotAndHtml(this.windowId, {
      labelScreenshot: true, // Enable screenshot labeling (Comet feature)
      labelStyle: {
        fontSize: 14,
        backgroundColor: "#3b82f6",
        textColor: "#ffffff",
        borderColor: "#1e40af",
        borderWidth: 2,
        padding: 4,
        borderRadius: 4
      }
    });

    if (!result.ok || !result.data) {
      throw new Error(result.error?.message || "Screenshot failed");
    }

    const data = result.data;
    this.lastScreenshotElementCount = data.elements.length;
    
    // Log LLM vision analysis if available (helps agent understand what to do next)
    if (data.llmVisionAnalysis) {
      const llm = data.llmVisionAnalysis;
      if (llm.isStuck) {
        Log.warn(`[CustomBrowserAgent] 🤖 LLM Vision: Agent appears STUCK - ${llm.nextAction.reason}`);
        Log.warn(`[CustomBrowserAgent] 🤖 LLM Vision suggestions: ${llm.suggestions.join(', ')}`);
      } else if (llm.nextAction.action !== 'none') {
        Log.info(`[CustomBrowserAgent] 🤖 LLM Vision suggests: ${llm.nextAction.action} on "${llm.nextAction.target}" - ${llm.nextAction.reason} (confidence: ${llm.nextAction.confidence.toFixed(2)})`);
      }
    }
    
    // Get current URL to help with login detection (refresh in case navigation occurred)
    currentUrl = this.detailView.webContents.getURL();
    const pageTitle = this.detailView.webContents.getTitle();
    
    // Get task context from agent context to provide better guidance
    const taskContext = agentContext?.taskDescription || agentContext?.userMessage || '';
    
    // Build pseudo HTML from elements (BaseBrowserLabelsAgent format)
    // Make it VERY clear which elements are actionable and what they do
    const pageContext = `<!-- Page Context: URL="${currentUrl}", Title="${pageTitle}" -->
<!-- Current Task: ${taskContext || 'General browsing'} -->
<!-- Total Interactive Elements: ${data.elements.length} -->
<!-- INSTRUCTIONS: Look for elements with data-index to interact with them. Use click_element(index) for buttons/links, input_text(index, "text") for input fields. -->`;
    
    const pseudoHtml = pageContext + '\n' + data.elements.map((el: ElementDescriptor) => {
      const attrs: string[] = [];
      
      // CRITICAL: Always include index - this is how agent identifies elements
      if (el.index !== undefined) {
        attrs.push(`data-index="${el.index}"`);
      }
      
      // Build a clear, actionable description
      const descriptions: string[] = [];
      if (el.label) descriptions.push(`LABEL: "${el.label}"`);
      if (el.ariaLabel) descriptions.push(`ARIA: "${el.ariaLabel}"`);
      if (el.innerText && el.innerText.trim()) descriptions.push(`TEXT: "${el.innerText.trim().substring(0, 50)}"`);
      if (el.placeholder) descriptions.push(`PLACEHOLDER: "${el.placeholder}"`);
      
      // Determine action type with explicit instructions
      let actionHint = '';
      if (el.role === 'button' || el.tagName?.toLowerCase() === 'button') {
        actionHint = ` [ACTION: click_element(${el.index}) to click this button]`;
      } else if (el.role === 'link' || el.tagName?.toLowerCase() === 'a' || el.href) {
        actionHint = ` [ACTION: click_element(${el.index}) to follow this link]`;
      } else if (el.type === 'text' || el.type === 'email' || el.type === 'password' || el.role === 'textbox' || el.tagName?.toLowerCase() === 'input' || el.tagName?.toLowerCase() === 'textarea') {
        actionHint = ` [ACTION: input_text(${el.index}, "your text here") to type into this field]`;
      } else if (el.isClickable) {
        actionHint = ` [ACTION: click_element(${el.index}) to interact with this element]`;
      }
      
      // Add role and other attributes
      if (el.role) attrs.push(`role="${el.role}"`);
      if (el.ariaLabel) attrs.push(`aria-label="${el.ariaLabel}"`);
      if (el.placeholder) attrs.push(`placeholder="${el.placeholder}"`);
      if (el.name) attrs.push(`name="${el.name}"`);
      if (el.id) attrs.push(`id="${el.id}"`);
      if (el.className) attrs.push(`class="${el.className}"`);
      if (el.href) attrs.push(`href="${el.href}"`);
      if (el.type) attrs.push(`type="${el.type}"`);
      
      // Build element description with explicit action instruction
      const description = descriptions.length > 0 
        ? ` <!-- ${descriptions.join(' | ')}${actionHint} -->` 
        : (actionHint ? ` <!-- ${actionHint} -->` : '');
      
      // Add explicit action instruction as attribute comment
      const actionComment = el.index !== undefined && actionHint 
        ? ` <!-- TO INTERACT: ${actionHint.replace(/\[ACTION: /, '').replace(/\]/, '')} -->`
        : '';
      
      return `<${el.tagName || 'div'} ${attrs.join(' ')}>${el.innerText || ''}</${el.tagName || 'div'}>${description}${actionComment}`;
    }).join('\n');
    
    // Add summary at the end to help agent understand what's available
    const buttonCount = data.elements.filter(e => e.role === 'button' || e.tagName?.toLowerCase() === 'button' || e.isClickable).length;
    const inputCount = data.elements.filter(e => e.type === 'text' || e.type === 'email' || e.role === 'textbox').length;
    const linkCount = data.elements.filter(e => e.tagName?.toLowerCase() === 'a' || e.href).length;
    
    // Suggest next action based on task context (BrowserOS-inspired)
    let suggestedAction = '';
    if (taskContext) {
      const task = taskContext.toLowerCase();
      
      // Email task: look for Compose button
      if (task.includes('email') || task.includes('send')) {
        const compose = data.elements.find(e => {
          const text = (e.innerText + ' ' + e.ariaLabel + ' ' + e.label).toLowerCase();
          return text.includes('compose') || text.includes('new') || text.includes('write');
        });
        if (compose && compose.index !== undefined) {
          suggestedAction = `\n<!-- SUGGESTED NEXT ACTION: Click element with data-index="${compose.index}" (Compose/New email button) to start composing email -->`;
        }
      }
      
      // Form task: look for first input field
      if (task.includes('form') || task.includes('fill')) {
        const firstInput = data.elements.find(e => 
          e.type === 'text' || e.type === 'email' || e.role === 'textbox'
        );
        if (firstInput && firstInput.index !== undefined) {
          suggestedAction = `\n<!-- SUGGESTED NEXT ACTION: Click element with data-index="${firstInput.index}" (${firstInput.label || 'input field'}) to start filling form -->`;
        }
      }
      
      // General: suggest first clickable button
      if (!suggestedAction) {
        const firstButton = data.elements.find(e => 
          (e.role === 'button' || e.tagName?.toLowerCase() === 'button' || e.isClickable) &&
          e.index !== undefined
        );
        if (firstButton && firstButton.index !== undefined) {
          suggestedAction = `\n<!-- SUGGESTED NEXT ACTION: Click element with data-index="${firstButton.index}" (${firstButton.label || firstButton.innerText || 'button'}) -->`;
        }
      }
    }
    
    const summary = `\n<!-- SUMMARY: ${buttonCount} buttons, ${inputCount} input fields, ${linkCount} links available. Use data-index values to interact. -->${suggestedAction}`;
    
    return {
      imageBase64: data.screenshot,
      imageType: "image/png",
      pseudoHtml: pseudoHtml + summary
    };
  }

  /**
   * Override click_element to use our Playwright implementation with visual indicators
   * Includes navigation detection after clicks
   */
  protected async click_element(
    agentContext: AgentContext,
    index: number,
    num_clicks: number = 1,
    button: "left" | "right" | "middle" = "left"
  ): Promise<any> {
    // Track URL before click to detect navigation
    const urlBeforeClick = this.detailView.webContents.getURL();
    this.lastClickUrl = urlBeforeClick;
    this.lastClickTime = Date.now();
    
    // Reset screenshot counter - click is an action, so next screenshot is valid
    this.consecutiveScreenshots = 0;
    
    await this.ensurePlaywrightPage();
    const result = await clickElementByIndex(this.windowId, index, {
      humanized: true,
      humanOptions: {
        moveStrategy: 'bezier',
        steps: 20,
        jitter: 4
      },
      clickCount: num_clicks,
      button
    });

    if (!result.ok) {
      throw new Error(result.error?.message || "Click failed");
    }

    // Wait longer for potential navigation (links need more time)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check if navigation occurred (check multiple times as navigation can be delayed)
    let urlAfterClick = this.detailView.webContents.getURL();
    let navigationDetected = urlAfterClick !== urlBeforeClick;
    
    // If no immediate navigation, wait a bit more and check again (for slow-loading pages)
    if (!navigationDetected) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      urlAfterClick = this.detailView.webContents.getURL();
      navigationDetected = urlAfterClick !== urlBeforeClick;
    }
    
    if (navigationDetected) {
      Log.info(`[CustomBrowserAgent] ✅ Navigation detected after click: ${urlBeforeClick} → ${urlAfterClick}`);
      // URL changed - next screenshot will be taken (urlChanged = true)
      this.lastScreenshotUrl = ''; // Force screenshot on next call
      // Reset screenshot counter since navigation occurred
      this.consecutiveScreenshots = 0;
    } else {
      Log.info(`[CustomBrowserAgent] ℹ️ No navigation after click, URL unchanged: ${urlBeforeClick}`);
      Log.info(`[CustomBrowserAgent] ℹ️ This might be a button that opens a dialog/modal, or the click didn't trigger navigation`);
      // No navigation - agent should wait and check for dialog/modal
      // But don't reset screenshot counter - we still need to verify what happened
    }

    return { success: true };
  }

  /**
   * Override input_text to use our Playwright implementation with visual indicators
   * Resets screenshot counter since typing is an action
   */
  protected async input_text(
    agentContext: AgentContext,
    index: number,
    text: string,
    enter: boolean = false
  ): Promise<any> {
    // Reset screenshot counter - typing is an action
    this.consecutiveScreenshots = 0;
    
    await this.ensurePlaywrightPage();
    const result = await inputTextByIndex(this.windowId, index, text, {
      humanized: true,
      typeOptions: {
        delay: 50,
        jitter: 10
      },
      enter
    });

    if (!result.ok) {
      throw new Error(result.error?.message || "Input failed");
    }

    return { success: true };
  }

  /**
   * Override handleMessages to safely handle image processing errors
   * The base implementation may fail if image data format is unexpected
   */
  protected async handleMessages(
    agentContext: AgentContext,
    messages: any,
    tools: Tool[]
  ): Promise<void> {
    try {
      // Call parent implementation
      await super.handleMessages(agentContext, messages, tools);
    } catch (error: any) {
      // If error is about undefined startsWith, it's likely an image processing issue
      // This happens when BaseBrowserLabelsAgent tries to process image parts
      // but the image data format doesn't match expectations
      if (error?.message?.includes('startsWith') || 
          error?.message?.includes('Cannot read properties of undefined') ||
          error?.stack?.includes('toFile') ||
          error?.stack?.includes('toImage')) {
        Log.warn('[CustomBrowserAgent] Image processing error in handleMessages (non-fatal):', error.message);
        // Continue execution - this is not critical for browser automation
        // The base class tries to process images for display, but we can continue without it
        return;
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Handle screenshot_and_html with Comet features
   */
  private async handleScreenshotAndHtml(params: any): Promise<any> {
    const result = await screenshotAndHtml(this.windowId, {
      fullPage: params?.fullPage ?? false,
      labelScreenshot: true, // Enable screenshot labeling (Comet feature)
      labelStyle: {
        fontSize: 14,
        backgroundColor: "#3b82f6",
        textColor: "#ffffff",
        borderColor: "#1e40af",
        borderWidth: 2,
        padding: 4,
        borderRadius: 4
      }
    });

    if (!result.ok) {
      return {
        success: false,
        error: result.error?.message || "Screenshot failed"
      };
    }

    // Transform to match EKO's expected format
    const data = result.data!;
    return {
      success: true,
      screenshot: data.screenshot, // Base64 image with labels
      elements: data.elements.map((el: ElementDescriptor, idx: number) => ({
        index: el.index ?? idx,
        selector: el.selector,
        label: el.label || `Element ${el.index ?? idx}`,
        innerText: el.innerText,
        boundingBox: el.boundingBox,
        tagName: el.tagName,
        role: el.role,
        ariaLabel: el.ariaLabel,
        placeholder: el.placeholder,
        name: el.name,
        id: el.id,
        className: el.className,
        href: el.href,
        isVisible: el.isVisible,
        isEnabled: el.isEnabled,
        isClickable: el.isClickable
      })),
      html: data.html,
      visionAnalysis: (data as any).visionAnalysis // Include vision analysis (Comet feature)
    };
  }

  /**
   * Handle click_element with visual indicators (Comet feature)
   */
  private async handleClickElement(params: any): Promise<any> {
    const index = params?.index;
    if (typeof index !== 'number' || index < 0) {
      return {
        success: false,
        error: "Invalid element index. Must be a non-negative number from screenshot_and_html()"
      };
    }

    const result = await clickElementByIndex(this.windowId, index, {
      humanized: true, // Enable humanized behavior
      humanOptions: {
        moveStrategy: 'bezier', // Bezier curve movement (Comet feature)
        steps: 20,
        jitter: 4
      }
    });

    if (!result.ok) {
      return {
        success: false,
        error: result.error?.message || "Click failed"
      };
    }

    return {
      success: true,
      message: `Clicked element at index ${index}`
    };
  }

  /**
   * Handle input_text with visual indicators (Comet feature)
   */
  private async handleInputText(params: any): Promise<any> {
    const index = params?.index;
    const text = params?.text;
    const enter = params?.enter ?? false;

    if (typeof index !== 'number' || index < 0) {
      return {
        success: false,
        error: "Invalid element index. Must be a non-negative number from screenshot_and_html()"
      };
    }

    if (typeof text !== 'string') {
      return {
        success: false,
        error: "Text must be a string"
      };
    }

    const result = await inputTextByIndex(this.windowId, index, text, {
      humanized: true, // Enable humanized typing (Comet feature)
      typeOptions: {
        delay: 50, // Typing delay for human-like behavior
        jitter: 10
      },
      enter
    });

    if (!result.ok) {
      return {
        success: false,
        error: result.error?.message || "Input failed"
      };
    }

    return {
      success: true,
      message: `Typed text into element at index ${index}`
    };
  }

  /**
   * Handle navigate_to
   */
  private async handleNavigateTo(params: any): Promise<any> {
    const url = params?.url;
    if (typeof url !== 'string' || !url) {
      return {
        success: false,
        error: "URL must be a non-empty string"
      };
    }

    Log.info('[CustomBrowserAgent] Navigating to URL:', url);
    Log.info('[CustomBrowserAgent] detailView exists:', !!this.detailView);
    Log.info('[CustomBrowserAgent] detailView visible:', this.detailView?.getBounds().width > 0);

    // Navigate detailView (the visible browser in UI)
    try {
      Log.info('[CustomBrowserAgent] Loading URL in detailView:', url);
      Log.info('[CustomBrowserAgent] detailView webContents ready:', !this.detailView.webContents.isDestroyed());
      
      // Check if detailView is ready for navigation
      if (this.detailView.webContents.isDestroyed()) {
        Log.error('[CustomBrowserAgent] detailView webContents is destroyed, cannot navigate');
        return {
          success: false,
          error: "Browser view is not available"
        };
      }
      
      // Use loadURL with error handling
      // Note: loadURL returns a Promise that resolves when navigation starts, not when it completes
      await this.detailView.webContents.loadURL(url, {
        // Add timeout to prevent hanging
        timeout: 30000
      }).catch((error: any) => {
        // ERR_ABORTED (-3) is expected when navigation is superseded by another navigation
        if (error.code === -3 || error.message?.includes('ERR_ABORTED')) {
          Log.info('[CustomBrowserAgent] Navigation superseded (expected when rapid navigation occurs)');
          // This is okay - navigation was superseded, which means another navigation started
          return; // Don't throw, navigation attempt was made
        } else {
          Log.error('[CustomBrowserAgent] DetailView navigation error:', {
            code: error.code,
            message: error.message,
            url: url
          });
          throw error; // Re-throw unexpected errors
        }
      });
      
      Log.info('[CustomBrowserAgent] ✅ detailView navigation initiated successfully');
    } catch (error: any) {
      Log.error('[CustomBrowserAgent] ❌ DetailView navigation failed:', {
        error: error.message || String(error),
        code: error.code,
        url: url
      });
      // Don't fail completely - try Playwright navigation anyway
    }

    // Navigate Playwright page (for automation actions)
    Log.info('[CustomBrowserAgent] Syncing Playwright page to:', url);
    const result = await goto(this.windowId, url);
    if (!result.ok) {
      Log.warn('[CustomBrowserAgent] Playwright navigation failed:', result.error);
      // Still return success if detailView navigation worked
      return {
        success: true,
        url: url,
        message: `Navigated detailView to ${url} (Playwright sync failed)`
      };
    }

    Log.info('[CustomBrowserAgent] ✅ Navigation complete:', result.data?.url || url);
    return {
      success: true,
      url: result.data?.url || url,
      message: `Navigated to ${url}`
    };
  }

  /**
   * Handle wait
   */
  private async handleWait(params: any): Promise<any> {
    const milliseconds = params?.milliseconds;
    if (typeof milliseconds !== 'number' || milliseconds < 0) {
      return {
        success: false,
        error: "Milliseconds must be a non-negative number"
      };
    }

    await new Promise(resolve => setTimeout(resolve, milliseconds));
    return {
      success: true,
      message: `Waited ${milliseconds}ms`
    };
  }

  /**
   * Ensure Playwright page exists and is synced with detailView
   */
  private async ensurePlaywrightPage(): Promise<void> {
    const maxRetries = 5;
    const retryDelay = 500;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Check if page already exists
        let page = getPage(this.windowId);
        
        // Only create a new page if it doesn't exist
        if (!page) {
          const result = await newPage(this.windowId);
          if (!result.ok) {
            // If it's not an "already exists" error, log it
            if (result.error?.code !== 'INVALID_ARG' || !result.error?.message?.includes('already exists')) {
              Log.warn('[CustomBrowserAgent] Failed to create Playwright page:', result.error);
            }
            // Try to get the page again in case it was created by another call
            page = getPage(this.windowId);
            if (!page && attempt < maxRetries - 1) {
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              continue;
            }
          } else {
            // Page was created successfully, get it
            page = getPage(this.windowId);
          }
        }

        // Verify page is ready
        if (page) {
          try {
            // Wait for page to be ready (with short timeout)
            await page.waitForLoadState('domcontentloaded', { timeout: 2000 }).catch(() => {
              // If timeout, page might still be usable
            });
            
            // Sync URL if detailView has navigated and page exists
            const currentUrl = this.detailView.webContents.getURL();
            const pageUrl = page.url();
            
            // Only sync if URLs are different and detailView has a valid URL
            if (currentUrl && 
                currentUrl !== 'about:blank' && 
                !currentUrl.startsWith('chrome://') &&
                currentUrl !== pageUrl) {
              try {
                await goto(this.windowId, currentUrl);
              } catch (error) {
                // Navigation might fail if page is still loading, that's okay
                Log.debug('[CustomBrowserAgent] URL sync attempted:', currentUrl);
              }
            }
            
            // Success - page is ready
            return;
          } catch (pageError) {
            // Page exists but not ready, retry
            if (attempt < maxRetries - 1) {
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              continue;
            }
          }
        } else if (attempt < maxRetries - 1) {
          // Page doesn't exist, retry
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      } catch (error) {
        Log.warn(`[CustomBrowserAgent] Failed to ensure Playwright page (attempt ${attempt + 1}/${maxRetries}):`, error);
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      }
    }
    
    // If we get here, all retries failed
    throw new Error(`Failed to ensure Playwright page for ${this.windowId} after ${maxRetries} retries`);
  }
}

