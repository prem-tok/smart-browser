import { Eko, Log, SimpleSseMcpClient, type LLMs, type StreamCallbackMessage, type AgentContext } from "@jarvis-agent/core";
import { FileAgent } from "@jarvis-agent/electron";
import type { EkoResult } from "@jarvis-agent/core/types";
import { BrowserWindow, WebContentsView, app } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ConfigManager } from "../utils/config-manager";
import type { HumanRequestMessage, HumanResponseMessage, HumanInteractionContext } from "../../../src/models/human-interaction";
import { CustomBrowserAgent } from "../../services/custom-browser-agent";

export class EkoService {
  private eko: Eko | null = null;
  private mainWindow: BrowserWindow;
  private detailView: WebContentsView;
  private mcpClient!: SimpleSseMcpClient;
  private agents!: any[];
  private windowId: string;

  // Store pending human interaction requests
  private pendingHumanRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
  }>();

  // Map toolId to requestId for human interactions
  private toolIdToRequestId = new Map<string, string>();

  // Store current human_interact toolId
  private currentHumanInteractToolId: string | null = null;

  constructor(mainWindow: BrowserWindow, detailView: WebContentsView) {
    this.mainWindow = mainWindow;
    this.detailView = detailView;
    this.windowId = `main-${mainWindow.id}`;
    this.initializeEko();
  }

  /**
   * Create stream callback handler
   */
  // Track finished tasks to prevent polling loops
  private finishedTasks = new Set<string>();
  // Track workflow messages to deduplicate excessive logging
  private workflowMessageCache = new Map<string, { lastLogged: number; count: number; lastContent?: string }>();
  private readonly WORKFLOW_LOG_INTERVAL = 5000; // Only log workflow messages once per 5 seconds max (increased to reduce noise)
  
  // Screenshot loop detection - track consecutive screenshots to prevent loops
  private screenshotHistory = new Map<string, Array<{ timestamp: number; url: string; elementCount: number }>>();
  private readonly MAX_CONSECUTIVE_SCREENSHOTS = 3; // Max screenshots in 10 seconds before warning
  private readonly SCREENSHOT_LOOP_WINDOW_MS = 10000; // 10 seconds

  private createCallback() {
    return {
      onMessage: (message: StreamCallbackMessage): Promise<void> => {
        // Skip ALL processing (including logging) if task is already finished
        // This prevents repeated finish messages from triggering any actions or logging
        if (message.taskId && this.finishedTasks.has(message.taskId)) {
          // Silently skip - task is already finished, no need to process further
          // This includes finish, agent_result, and other messages for finished tasks
          // Only allow error messages through for debugging
          if (message.type !== 'error') {
            return Promise.resolve();
          }
        }

        // Deduplicate workflow messages - only process once per 5 seconds per task
        // This prevents hundreds of duplicate workflow messages from being sent to renderer
        if (message.type === 'workflow' && message.taskId) {
          const cacheKey = message.taskId;
          const now = Date.now();
          const workflowContent = JSON.stringify(message.workflow || {});
          const cached = this.workflowMessageCache.get(cacheKey);
          
          if (cached) {
            const timeSinceLastLog = now - cached.lastLogged;
            const isSameContent = cached.lastContent === workflowContent;
            
            // If same content and within interval, skip completely
            if (isSameContent && timeSinceLastLog < this.WORKFLOW_LOG_INTERVAL) {
              // Too soon to process again - just increment counter and skip completely
              cached.count++;
              // CRITICAL: Skip both logging AND sending to renderer to prevent loops
              // Early return here prevents the message from being sent to renderer
              return Promise.resolve();
            } else if (!isSameContent) {
              // Different content - update cache and process
              cached.lastLogged = now;
              cached.count = 1;
              cached.lastContent = workflowContent;
              // Continue processing this message (will be sent to renderer below)
            } else {
              // Same content but enough time passed - just update timestamp
              cached.lastLogged = now;
              cached.count = 1;
              // Continue processing this message (will be sent to renderer below)
            }
          } else {
            // First workflow message for this task
            this.workflowMessageCache.set(cacheKey, { 
              lastLogged: now, 
              count: 1,
              lastContent: workflowContent
            });
            // Continue processing this message (will be sent to renderer below)
          }
        }

        // Mark task as finished - DO NOT abort, let it complete naturally
        // Aborting causes "Operation was interrupted" errors
        if (message.type === 'finish' && message.taskId) {
          if (!this.finishedTasks.has(message.taskId)) {
            // First finish message - mark as finished
            this.finishedTasks.add(message.taskId);
            
            // Clean up workflow message cache for this task
            this.workflowMessageCache.delete(message.taskId);
            
            // DO NOT abort the task - let it complete naturally
            // The EKO framework will handle cleanup when execution completes
          } else {
            // Subsequent finish messages - skip completely (no logging, no processing)
            return Promise.resolve();
          }
        }

        // Window destroyed, return directly to avoid errors
        if (!this.mainWindow || this.mainWindow.isDestroyed()) {
          Log.warn('Main window destroyed, skipping message processing');
          return Promise.resolve();
        }

        // Log all tool_use messages to debug browser automation
        if (message.type === 'tool_use') {
          const toolUseMsg = message as any;
          const params = message.params || toolUseMsg.paramsText || 'no params';
          
          // Special logging for browser automation tools
          if (message.agentName === 'Browser') {
            const paramsStr = typeof params === 'object' ? JSON.stringify(params, null, 2) : params;
            Log.info(`[EkoService] 🔧 BrowserAgent tool call: ${message.toolName}`, {
              toolId: message.toolId,
              params: paramsStr
            });
            
            // Check if using index-based tools (as per BROWSER_AGENT_UPDATE.md)
            if (message.toolName === 'screenshot_and_html') {
              // Detect screenshot loops
              const taskId = message.taskId || 'unknown';
              const now = Date.now();
              const history = this.screenshotHistory.get(taskId) || [];
              
              // Get current URL for comparison
              const currentUrl = this.detailView?.webContents.getURL() || '';
              
              // Clean old entries (older than window)
              const recentHistory = history.filter(h => now - h.timestamp < this.SCREENSHOT_LOOP_WINDOW_MS);
              
              // Check if we're in a loop (same URL, similar element count, multiple screenshots)
              if (recentHistory.length >= this.MAX_CONSECUTIVE_SCREENSHOTS) {
                const sameUrlCount = recentHistory.filter(h => h.url === currentUrl).length;
                if (sameUrlCount >= this.MAX_CONSECUTIVE_SCREENSHOTS) {
                  Log.warn(`[EkoService] ⚠️ SCREENSHOT LOOP DETECTED: ${sameUrlCount} screenshots of same URL in ${this.SCREENSHOT_LOOP_WINDOW_MS}ms at ${currentUrl}`);
                  Log.warn(`[EkoService] ⚠️ Agent appears stuck - check llmVisionAnalysis in screenshot result for suggestions`);
                  Log.warn(`[EkoService] ⚠️ If llmVisionAnalysis.isStuck is true, follow the suggestions or call human_interact`);
                }
              }
              
              // Add to history
              recentHistory.push({ timestamp: now, url: currentUrl, elementCount: 0 }); // elementCount will be updated in tool_result
              this.screenshotHistory.set(taskId, recentHistory);
              
              Log.info('[EkoService] ✅ Using screenshot_and_html() - BrowserAgent will refresh element list');
            } else if (message.toolName === 'click_element') {
              Log.info(`[EkoService] ✅ Using click_element(index) - BrowserAgent will click element. Params: ${paramsStr}`);
              // Parse params to see what index
              try {
                const parsedParams = typeof params === 'string' ? JSON.parse(params) : params;
                if (parsedParams && typeof parsedParams === 'object') {
                  const index = parsedParams.index !== undefined ? parsedParams.index : (Array.isArray(parsedParams) ? parsedParams[0] : null);
                  Log.info(`[EkoService] 📍 Clicking element at index: ${index}`);
                  // CRITICAL: After clicking, BrowserAgent MUST call screenshot_and_html() again
                  // This is especially important for dialogs like Gmail compose
                  Log.info('[EkoService] ⚠️ IMPORTANT: After click_element(), BrowserAgent should call screenshot_and_html() to refresh element list');
                }
              } catch (e) {
                // Ignore parse errors
              }
            } else if (message.toolName === 'input_text') {
              Log.info(`[EkoService] ✅ Using input_text(index, text) - BrowserAgent will type text. Params: ${paramsStr}`);
              // Parse params to see what index and text
              try {
                const parsedParams = typeof params === 'string' ? JSON.parse(params) : params;
                if (parsedParams && typeof parsedParams === 'object') {
                  const index = parsedParams.index !== undefined ? parsedParams.index : (Array.isArray(parsedParams) ? parsedParams[0] : null);
                  const text = parsedParams.text !== undefined ? parsedParams.text : (Array.isArray(parsedParams) ? parsedParams[1] : 'N/A');
                  Log.info(`[EkoService] ⌨️  Typing into element at index: ${index}, text: "${text}"`);
                }
              } catch (e) {
                // Ignore parse errors
              }
            } else if (message.toolName === 'click' || message.toolName === 'type') {
              Log.warn(`[EkoService] ⚠️ Using old selector-based tool: ${message.toolName} - should use index-based tools instead!`);
            } else if (message.toolName === 'wait') {
              Log.info(`[EkoService] ⏳ BrowserAgent waiting: ${paramsStr}`);
            } else if (message.toolName === 'navigate_to') {
              Log.info(`[EkoService] 🌐 BrowserAgent navigating: ${paramsStr}`);
              // Parse params to see the URL
              try {
                const parsedParams = typeof params === 'string' ? JSON.parse(params) : params;
                if (parsedParams && typeof parsedParams === 'object' && parsedParams.url) {
                  Log.info(`[EkoService] 📍 Navigation URL: ${parsedParams.url}`);
                }
              } catch (e) {
                // Ignore parse errors
              }
            } else {
              // Log other BrowserAgent tools to see what it's actually using
              Log.info(`[EkoService] 🔍 BrowserAgent using tool: ${message.toolName} (not in expected list)`);
            }
          } else {
            Log.info(`[EkoService] Tool call: ${message.toolName}`, {
              toolId: message.toolId,
              agentName: message.agentName,
              params: typeof params === 'object' ? JSON.stringify(params) : params
            });
          }
        }
        
        // Log tool results to see what BrowserAgent is receiving
        if (message.type === 'tool_result' && message.agentName === 'Browser') {
          const toolResult = message as any;
          const success = toolResult.result?.success !== false;
          const hasError = !!toolResult.result?.error;
          const status = success ? '✅' : (hasError ? '❌' : '⚠️');
          Log.info(`[EkoService] ${status} BrowserAgent tool result: ${toolResult.toolName || 'unknown'}`, {
            toolId: toolResult.toolId,
            success,
            hasError,
            error: hasError ? toolResult.result?.error : undefined
          });
          
          // Update screenshot history with element count
          if (toolResult.toolName === 'screenshot_and_html' && toolResult.result?.data) {
            const taskId = message.taskId || 'unknown';
            const history = this.screenshotHistory.get(taskId);
            if (history && history.length > 0) {
              const lastEntry = history[history.length - 1];
              const elementCount = toolResult.result.data.elements?.length || 0;
              lastEntry.elementCount = elementCount;
            }
          }
          
          // CRITICAL: After click_element completes, check if next tool is screenshot_and_html
          // If not, log a warning that BrowserAgent might be missing the refresh step
          if (toolResult.toolName === 'click_element' && success) {
            Log.info('[EkoService] ⚠️ After click_element() completed - BrowserAgent should call screenshot_and_html() next to refresh element list');
            Log.info('[EkoService] ⚠️ This is especially critical for dialogs/modals like Gmail compose');
          }
        }
        
        // Log agent thinking/planning messages
        if (message.type === 'thinking' && message.agentName === 'Browser') {
          const thinkingContent = (message as any).content || (message as any).text || 'no content';
          Log.info(`[EkoService] 💭 BrowserAgent thinking: ${thinkingContent.substring(0, 200)}${thinkingContent.length > 200 ? '...' : ''}`);
        }
        
        // Log text messages from BrowserAgent to see what it's saying
        if (message.type === 'text' && message.agentName === 'Browser') {
          const textContent = (message as any).content || (message as any).text || '';
          if (textContent.length > 0) {
            Log.info(`[EkoService] 💬 BrowserAgent message: ${textContent.substring(0, 200)}${textContent.length > 200 ? '...' : ''}`);
          }
        }

        // Capture human_interact tool's toolId when tool is being used
        if (message.type === 'tool_use' && message.toolName === 'human_interact' && message.toolId) {
          this.currentHumanInteractToolId = message.toolId;
          const params = (message as any).params || {};
          Log.info('[EkoService] 🔔 Captured human_interact toolId:', {
            toolId: message.toolId,
            interactType: params.interactType || 'unknown',
            prompt: params.prompt?.substring(0, 100) || 'no prompt'
          });
          Log.info('[EkoService] ⏸️ Agent execution paused, waiting for human response...');
        }
        
        // Log when tool_result is received for human_interact to track continuation
        if (message.type === 'tool_result' && (message as any).toolName === 'human_interact') {
          const toolResult = message as any;
          Log.info('[EkoService] 🔔 Human interaction tool result received:', {
            toolId: toolResult.toolId,
            hasResult: !!toolResult.result,
            resultType: typeof toolResult.result,
            resultPreview: typeof toolResult.result === 'object' 
              ? JSON.stringify(toolResult.result).substring(0, 200) 
              : String(toolResult.result).substring(0, 200)
          });
          Log.info('[EkoService] ✅ Agent should continue execution after human interaction');
        }

        // Log tool results and agent results to see what's happening
        if (message.type === 'tool_result') {
          const toolResult = message as any;
          Log.info(`[EkoService] Tool result: ${toolResult.toolName}`, {
            toolId: toolResult.toolId,
            agentName: message.agentName,
            success: toolResult.result?.success !== false,
            hasError: !!toolResult.result?.error,
            resultPreview: typeof toolResult.result === 'string' 
              ? toolResult.result.substring(0, 100) 
              : JSON.stringify(toolResult.result).substring(0, 100)
          });
          
          // Special logging for human_interact tool results
          if (toolResult.toolName === 'human_interact') {
            Log.info('[EkoService] 🔔 Human interaction tool result received, agent should continue now');
          }
          
          // If screenshot failed, ensure view is visible and log details
          if (toolResult.toolName === 'screenshot_and_html' && toolResult.result?.error) {
            Log.error(`[EkoService] Screenshot failed: ${toolResult.result.error}`);
            if (this.detailView) {
              Log.info('[EkoService] Re-enabling detailView visibility after screenshot error...');
              this.detailView.setVisible(true);
              // Use setTimeout instead of await in non-async context
              setTimeout(() => {
                // View should be ready now
              }, 300);
            }
          }
        }
        
        if (message.type === 'agent_result') {
          Log.info(`[EkoService] Agent result: ${message.agentName}`, {
            result: (message as any).result
          });
        }
        
        if (message.type === 'error') {
          const errorMsg = message as any;
          Log.error(`[EkoService] Error in ${message.agentName || 'unknown'}:`, errorMsg.error || errorMsg);
          
          // If error is about screenshot capture, ensure view is visible
          const errorString = typeof errorMsg.error === 'string' ? errorMsg.error : String(errorMsg.error || '');
          if (errorString.includes('display surface not available') || 
              errorString.includes('Current display surface not available')) {
            Log.warn('[EkoService] Screenshot capture error detected, ensuring view visibility...');
            if (this.detailView) {
              this.detailView.setVisible(true);
              // Use setTimeout instead of await in non-async context
              setTimeout(() => {
                // View should be ready now
              }, 500);
            }
          }
        }

        return new Promise((resolve) => {
           // Send stream message to renderer process via IPC
        this.mainWindow.webContents.send('eko-stream-message', message);

        // When file is modified, main view window loads file content display page
        if (message.type === 'tool_streaming' && message.toolName === 'file_write') {

          let args;
          try {
            args = JSON.parse(message.paramsText);
          } catch (error) {
            Log.error('File stream incomplete! Need to complete')
          }

          try {
            args = JSON.parse(`${message.paramsText}\"}`);
          } catch (error) {
            Log.error('File stream completion failed!');
          }

          if (args && args.content) {
            Log.info('File write detected, loading file-view in mainView', args.content);
            const url = this.detailView.webContents.getURL();
            Log.info('current URL', url, !url.includes('file-view'))
            if (!url.includes('file-view')) {
              this.detailView.webContents.loadURL(`http://localhost:5173/file-view`);
              this.detailView.webContents.once('did-finish-load', () => {
                this.detailView.webContents.send('file-updated', 'code', args.content);
                resolve();
              });
            } else {
              this.detailView.webContents.send('file-updated',  'code', args.content);
              resolve();
            }
          } else {
            resolve();
          }
        } else {
          resolve();
        }
        })
      },

      // Human interaction callbacks
      onHumanConfirm: async (agentContext: AgentContext, prompt: string): Promise<boolean> => {
        Log.info('[EkoService] onHumanConfirm called:', { prompt });
        
        try {
          Log.info('[EkoService] Requesting human interaction for confirm...');
          const result = await this.requestHumanInteraction(agentContext, {
            interactType: 'confirm',
            prompt
          });
          
          const booleanResult = Boolean(result);
          Log.info('[EkoService] onHumanConfirm resolved with:', { result, booleanResult });
          Log.info('[EkoService] ✅ onHumanConfirm returning, agent should continue execution');
          return booleanResult;
        } catch (error) {
          Log.error('[EkoService] ❌ Error in onHumanConfirm:', error);
          throw error;
        }
      },

      onHumanInput: async (agentContext: AgentContext, prompt: string): Promise<string> => {
        Log.info('[EkoService] onHumanInput called:', { prompt });
        
        try {
          Log.info('[EkoService] Requesting human interaction for input...');
          const result = await this.requestHumanInteraction(agentContext, {
            interactType: 'input',
            prompt
          });
          
          const stringResult = String(result ?? '');
          Log.info('[EkoService] onHumanInput resolved with:', { result, stringResult });
          Log.info('[EkoService] ✅ onHumanInput returning, agent should continue execution');
          return stringResult;
        } catch (error) {
          Log.error('[EkoService] ❌ Error in onHumanInput:', error);
          throw error;
        }
      },

      onHumanSelect: async (
        agentContext: AgentContext,
        prompt: string,
        options: string[],
        multiple?: boolean,
        _extInfo?: any
      ): Promise<string[]> => {
        Log.info('[EkoService] onHumanSelect called:', { prompt, options, multiple });
        
        // CRITICAL: After human interaction, agent MUST navigate to the selected service
        const isWebmailSelection = prompt.includes('webmail service') || prompt.includes('email service');
        if (isWebmailSelection) {
          Log.info('[EkoService] ⚠️ Webmail service selection detected - agent MUST navigate after this');
        }
        
        try {
          Log.info('[EkoService] Requesting human interaction for select...');
          const result = await this.requestHumanInteraction(agentContext, {
            interactType: 'select',
            prompt,
            selectOptions: options,
            selectMultiple: multiple ?? false
          });
          
          const arrayResult = Array.isArray(result) ? result : [];
          Log.info('[EkoService] onHumanSelect resolved with:', { result, arrayResult });
          
          // CRITICAL: If webmail service was selected, log reminder that agent must navigate
          if (isWebmailSelection && arrayResult.length > 0) {
            const selectedService = arrayResult[0];
            Log.info('[EkoService] 🚨 CRITICAL: Agent received webmail service selection:', selectedService);
            Log.info('[EkoService] 🚨 Agent MUST call navigate_to() IMMEDIATELY - this is MANDATORY');
            if (selectedService === 'Gmail' || selectedService?.includes('Gmail')) {
              Log.info('[EkoService] 🚨 Expected next action: navigate_to("https://mail.google.com")');
            } else if (selectedService === 'Outlook' || selectedService?.includes('Outlook')) {
              Log.info('[EkoService] 🚨 Expected next action: navigate_to("https://outlook.live.com")');
            }
          }
          
          Log.info('[EkoService] ✅ onHumanSelect returning, agent should continue execution');
          return arrayResult;
        } catch (error) {
          Log.error('[EkoService] ❌ Error in onHumanSelect:', error);
          throw error;
        }
      },

      onHumanHelp: async (
        agentContext: AgentContext,
        helpType: 'request_login' | 'request_assistance',
        prompt: string
      ): Promise<boolean> => {
        Log.info('[EkoService] onHumanHelp called:', { helpType, prompt });
        
        // Get current page information for context
        let context: HumanInteractionContext | undefined;
        try {
          const url = this.detailView.webContents.getURL();
          if (url && url.startsWith('http')) {
            const hostname = new URL(url).hostname;
            context = {
              siteName: hostname,
              actionUrl: url
            };
          }
        } catch (error) {
          Log.error('Failed to get URL for human help context:', error);
        }

        Log.info('[EkoService] Requesting human interaction for help...');
        const result = await this.requestHumanInteraction(agentContext, {
          interactType: 'request_help',
          prompt,
          helpType,
          context
        });
        
        const booleanResult = Boolean(result);
        Log.info('[EkoService] onHumanHelp resolved with:', { result, booleanResult });
        return booleanResult;
      }
    };
  }

  private initializeEko() {
    // Get LLMs configuration from ConfigManager
    // Priority: user config > env > default
    const configManager = ConfigManager.getInstance();
    const llms: LLMs = configManager.getLLMsConfig();

    // Validate LLM configuration
    if (!llms || !llms.default) {
      const errorMsg = 'LLM configuration is invalid or missing. Please check your model configuration.';
      Log.error(errorMsg);
      this.sendErrorToFrontend(errorMsg);
      return;
    }

    // Check apiKey - handle both string and function types
    const apiKeyValue = typeof llms.default.apiKey === 'string' 
      ? llms.default.apiKey 
      : (typeof llms.default.apiKey === 'function' ? undefined : llms.default.apiKey);
    
    if (!apiKeyValue || (typeof apiKeyValue === 'string' && apiKeyValue.trim().length === 0)) {
      const errorMsg = 'API key is missing. Please configure your API key in Settings > Model Configuration.';
      Log.error(errorMsg);
      this.sendErrorToFrontend(errorMsg);
      return;
    }

    // Get agent configuration
    const agentConfig = configManager.getAgentConfig();

    // Get correct application path
    const appPath = app.isPackaged
      ? path.join(app.getPath('userData'), 'static')  // Packaged path
      : path.join(process.cwd(), 'public', 'static');    // Development environment path

    Log.info(`FileAgent working path: ${appPath}`);

    // MCP client configuration - configure based on your MCP server address
    const sseUrl = "http://localhost:5173/api/mcp/sse";
    this.mcpClient = new SimpleSseMcpClient(sseUrl);

    // Create agents with custom prompts
    this.agents = [];

    if (agentConfig.browserAgent.enabled) {
      // Use CustomBrowserAgent with Comet features instead of BrowserAgent from @jarvis-agent/electron
      // This enables: CDP integration, vision analysis, visual indicators, screenshot labeling
      this.agents.push(
        new CustomBrowserAgent(
          this.detailView,
          this.mcpClient,
          agentConfig.browserAgent.customPrompt
        )
      );
      Log.info('[EkoService] ✅ CustomBrowserAgent enabled with Comet features (CDP, Vision, Visual Indicators)');
      Log.info('[EkoService] Custom prompt:', agentConfig.browserAgent.customPrompt ? 'Yes' : 'No');
    }

    if (agentConfig.fileAgent.enabled) {
      this.agents.push(
        new FileAgent(
          this.detailView,
          appPath,
          this.mcpClient,
          agentConfig.fileAgent.customPrompt
        )
      );
      Log.info('FileAgent enabled with custom prompt:', agentConfig.fileAgent.customPrompt ? 'Yes' : 'No');
    }

    // Validate that at least one agent is enabled
    if (this.agents.length === 0) {
      const errorMsg = 'No agents are enabled. Please enable at least one agent in Settings.';
      Log.error(errorMsg);
      this.sendErrorToFrontend(errorMsg);
      return;
    }

    // Create callback and initialize Eko instance
    const callback = this.createCallback();
    try {
      this.eko = new Eko({ llms, agents: this.agents, callback });
      Log.info('EkoService initialized with LLMs:', llms.default?.model);
    } catch (error: any) {
      const errorMsg = `Failed to initialize Eko framework: ${error?.message || error?.toString() || 'Unknown error'}`;
      Log.error(errorMsg, error);
      this.sendErrorToFrontend(errorMsg);
      this.eko = null;
    }
  }

  /**
   * Reload LLM and agent configuration and reinitialize Eko instance
   * Called when user changes model or agent configuration in UI
   */
  public reloadConfig(): void {
    Log.info('Reloading EkoService configuration...');

    // Abort all running tasks before reloading
    if (this.eko) {
      const allTaskIds = this.eko.getAllTaskId();
      allTaskIds.forEach((taskId: any) => {
        try {
          this.eko!.abortTask(taskId, 'config-reload');
        } catch (error) {
          Log.error(`Failed to abort task ${taskId}:`, error);
        }
      });
    }

    // Reject all pending human interactions
    this.rejectAllHumanRequests(new Error('EkoService configuration reloaded'));

    // Get new configurations
    const configManager = ConfigManager.getInstance();
    const llms: LLMs = configManager.getLLMsConfig();
    const agentConfig = configManager.getAgentConfig();

    Log.info('New LLMs config:', llms.default?.model);
    Log.info('Reloading agent config with custom prompts');

    // Recreate agents with updated config
    const appPath = app.isPackaged
      ? path.join(app.getPath('userData'), 'static')
      : path.join(process.cwd(), 'public', 'static');

    this.agents = [];

    if (agentConfig.browserAgent.enabled) {
      // Use CustomBrowserAgent with Comet features
      this.agents.push(
        new CustomBrowserAgent(
          this.detailView,
          this.mcpClient,
          agentConfig.browserAgent.customPrompt
        )
      );
      Log.info('[EkoService] ✅ CustomBrowserAgent reloaded with Comet features');
      Log.info('[EkoService] Custom prompt:', agentConfig.browserAgent.customPrompt ? 'Yes' : 'No');
    }

    if (agentConfig.fileAgent.enabled) {
      this.agents.push(
        new FileAgent(
          this.detailView,
          appPath,
          this.mcpClient,
          agentConfig.fileAgent.customPrompt
        )
      );
      Log.info('FileAgent reloaded with custom prompt:', agentConfig.fileAgent.customPrompt ? 'Yes' : 'No');
    }

    // Create new Eko instance with updated config and fresh callback
    const callback = this.createCallback();
    this.eko = new Eko({ llms, agents: this.agents, callback });

    Log.info('EkoService configuration reloaded successfully');

    // Notify frontend about config reload
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    this.mainWindow.webContents.send('eko-config-reloaded', {
      model: llms.default?.model,
      provider: llms.default?.provider
    });
  }

  /**
   * Ensure Playwright page exists and is synced with detailView
   * This is needed for our Comet features (CDP, vision analysis, visual indicators)
   * BrowserAgent from @jarvis-agent/electron uses detailView directly, but we need
   * Playwright page for our enhanced features
   */
  private async ensurePlaywrightPage(): Promise<void> {
    try {
      const { newPage, goto } = await import('../../playwrightController');
      const currentUrl = this.detailView.webContents.getURL();
      
      // Create new Playwright page if it doesn't exist
      // The newPage function will check if page already exists
      const result = await newPage(this.windowId);
      if (!result.ok) {
        Log.warn('[EkoService] Failed to create Playwright page:', result.error);
        return;
      }
      
      // Sync URL if detailView has navigated to a real page
      if (currentUrl && currentUrl !== 'about:blank' && !currentUrl.startsWith('chrome://')) {
        try {
          await goto(this.windowId, currentUrl);
          Log.info('[EkoService] Playwright page synced with detailView URL:', currentUrl);
        } catch (error) {
          // Navigation might fail if page is still loading, that's okay
          Log.debug('[EkoService] Playwright page URL sync attempted:', currentUrl);
        }
      }
    } catch (error) {
      Log.warn('[EkoService] Failed to ensure Playwright page:', error);
    }
  }

  /**
   * Run new task
   */
  async run(message: string): Promise<EkoResult | null> {
    if (!this.eko) {
      const errorMsg = 'Eko service not initialized';
      Log.error(errorMsg);
      this.sendErrorToFrontend(errorMsg);
      return null;
    }

    // Generate taskId for screenshot history tracking
    const taskId = `task-${Date.now()}`;
    // Clear screenshot history for new task
    this.screenshotHistory.delete(taskId);

    // Validate message is not empty or null
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      const errorMsg = 'Task message cannot be empty';
      Log.error(errorMsg);
      this.sendErrorToFrontend(errorMsg);
      return null;
    }

    const trimmedMessage = message.trim();
    
    // Ensure detailView is visible and ready for BrowserAgent screenshot capture
    // BrowserAgent uses WebContentsView.capturePage() which requires the view to be visible
    try {
      if (this.detailView) {
        this.detailView.setVisible(true);
        // Wait a bit for the view to be ready
        await new Promise(resolve => setTimeout(resolve, 100));
        Log.info('[EkoService] DetailView made visible for BrowserAgent');
      }
    } catch (error) {
      Log.warn('[EkoService] Failed to ensure detailView visibility:', error);
    }
    
    // CRITICAL: Ensure Playwright page exists for our Comet features
    // This enables CDP, vision analysis, and visual indicators
    await this.ensurePlaywrightPage();
    
    // Validate LLM configuration before running
    const configManager = ConfigManager.getInstance();
    const llms = configManager.getLLMsConfig();
    if (!llms?.default) {
      const errorMsg = 'LLM configuration is missing. Please configure your model in Settings > Model Configuration.';
      Log.error(errorMsg);
      this.sendErrorToFrontend(errorMsg);
      return null;
    }
    
    // Check apiKey - handle both string and function types
    const apiKeyValue = typeof llms.default.apiKey === 'string' 
      ? llms.default.apiKey 
      : (typeof llms.default.apiKey === 'function' ? undefined : llms.default.apiKey);
    
    if (!apiKeyValue || (typeof apiKeyValue === 'string' && apiKeyValue.trim().length === 0)) {
      const errorMsg = 'API key is missing. Please configure your API key in Settings > Model Configuration.';
      Log.error(errorMsg);
      this.sendErrorToFrontend(errorMsg);
      return null;
    }
    
    // Validate that agents are available
    if (!this.agents || this.agents.length === 0) {
      const errorMsg = 'No agents are available. Please enable at least one agent in Settings.';
      Log.error(errorMsg);
      this.sendErrorToFrontend(errorMsg);
      return null;
    }

    // Clear finished tasks set and workflow cache when starting a new task
    this.finishedTasks.clear();
    this.workflowMessageCache.clear();

    // NOTE: We don't sync Playwright page here because BrowserAgent uses detailView.capturePage() for screenshots
    // Playwright page will be created on-demand when index-based actions (clickElementByIndex, inputTextByIndex) are called
    // This eliminates redundancy: BrowserAgent screenshots come from detailView, not Playwright
    
    // Ensure detailView is visible for BrowserAgent screenshot capture
    // BrowserAgent uses WebContentsView.capturePage() which requires visible view
    // We need to maintain visibility throughout execution, not just at the start
    if (this.detailView) {
      this.detailView.setVisible(true);
      // Give the view more time to become ready for capture (Gmail needs more time)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify view is actually visible
      const bounds = this.detailView.getBounds();
      const isVisible = bounds.width > 0 && bounds.height > 0;
      if (!isVisible) {
        Log.warn('[EkoService] DetailView bounds are zero, waiting longer...');
        await new Promise(resolve => setTimeout(resolve, 500));
        // Try again
        this.detailView.setVisible(true);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Set up periodic visibility check to ensure view stays visible during execution
      // BrowserAgent may call screenshot_and_html() multiple times during execution
      const visibilityCheckInterval = setInterval(() => {
        if (this.detailView) {
          const currentBounds = this.detailView.getBounds();
          if (currentBounds.width === 0 || currentBounds.height === 0) {
            Log.warn('[EkoService] DetailView became invisible, re-enabling...');
            this.detailView.setVisible(true);
          }
        }
      }, 2000); // Check every 2 seconds
      
      // Store interval ID to clear it later
      (this as any)._visibilityCheckInterval = visibilityCheckInterval;
      
      Log.info('[EkoService] DetailView visibility ensured for BrowserAgent', {
        visible: isVisible || (this.detailView.getBounds().width > 0),
        bounds: this.detailView.getBounds()
      });
    }
    
    let result = null;
    try {
      // Double-check Eko instance is still valid before running
      if (!this.eko) {
        throw new Error('Eko instance is null. Please check your model configuration and try again.');
      }
      
      result = await this.eko.run(trimmedMessage);
    } catch (error: any) {
      Log.error('EkoService run error:', error);
      Log.error('Error stack:', error?.stack);

      // Check for specific null reference errors from Eko framework
      if (error?.message?.includes('taskPrompt') || 
          error?.message?.includes('Cannot read properties of null') ||
          error?.stack?.includes('Planner.doPlan')) {
        // This is a known issue with the Eko framework where the Planner's chain object is null
        // This typically happens when:
        // 1. The LLM API call fails during planning
        // 2. The API returns an invalid response
        // 3. There's a network timeout
        const errorMsg = 'Planning failed: The AI model could not create a plan for your task.\n\n' +
          'Possible causes:\n' +
          '1. ❌ API key is invalid or expired - Check Settings > Model Configuration\n' +
          '2. 🌐 Network connectivity issues - Check your internet connection\n' +
          '3. 💰 API quota exceeded - Check your API provider dashboard\n' +
          '4. 🔧 Model configuration error - Try switching to a different model\n\n' +
          'Please verify your API key and model configuration, then try again.';
        Log.error(errorMsg);
        this.sendErrorToFrontend(errorMsg, error);
      } else {
        // Extract and format error message with better handling for API errors
        const errorMessage = this.formatErrorMessage(error);
        this.sendErrorToFrontend(errorMessage, error);
      }
    }
    return result;
  }

  /**
   * Format error message with special handling for API quota/rate limit errors
   */
  private formatErrorMessage(error: any): string {
    const rawMessage = error?.message || error?.toString() || 'Unknown error occurred';
    
    // Check for quota/rate limit errors
    if (rawMessage.includes('quota') || rawMessage.includes('exceeded') || rawMessage.includes('rate limit') || rawMessage.includes('rate-limits')) {
      const isGoogleError = rawMessage.includes('Gemini') || rawMessage.includes('google') || rawMessage.includes('AI_APICallError');
      
      if (isGoogleError) {
        // Extract suggested model if mentioned in error
        const modelMatch = rawMessage.match(/models\/([^\s\)]+)/);
        const suggestedModel = modelMatch ? modelMatch[1] : 'gemini-2.5-flash';
        
        return `🚫 Google API Quota Exceeded\n\n` +
               `Your Google Gemini API quota has been reached. Here are your options:\n\n` +
               `1. ⏱️  Wait a few minutes and try again\n` +
               `2. 🔄 Switch to a different model:\n` +
               `   - ${suggestedModel} (suggested by Google)\n` +
               `   - gemini-2.5-flash (latest, recommended)\n` +
               `   - gemini-2.5-flash-lite (faster, lower cost)\n` +
               `   - gemini-2.5-pro (for complex tasks)\n` +
               `   - gemini-2.0-flash-exp (alternative)\n` +
               `   - gemini-1.5-flash-latest (stable fallback)\n\n` +
               `3. 🔑 Check your Google Cloud Console for quota limits\n` +
               `   https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com/quotas\n\n` +
               `4. 🔀 Temporarily switch to a different provider (DeepSeek, Qwen, etc.)\n\n` +
               `💡 Tip: You can change the model in Settings > Model Configuration\n\n` +
               `Original error: ${rawMessage.substring(0, 200)}${rawMessage.length > 200 ? '...' : ''}`;
      }
      
      return `🚫 API Quota/Rate Limit Exceeded\n\n` +
             `${rawMessage}\n\n` +
             `Please wait a few minutes before trying again, or switch to a different model/provider in Settings.`;
    }
    
    // Check for authentication errors
    if (rawMessage.includes('API key') || rawMessage.includes('authentication') || rawMessage.includes('401') || rawMessage.includes('403')) {
      return `🔐 Authentication Error\n\n` +
             `Please check your API key configuration in Settings > Model Configuration.\n\n` +
             `Error: ${rawMessage}`;
    }
    
    // Return original message for other errors
    return rawMessage;
  }

  /**
   * Send error message to frontend
   */
  private sendErrorToFrontend(errorMessage: string, error?: any, taskId?: string): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      Log.warn('Main window destroyed, cannot send error message');
      return;
    }

    this.mainWindow.webContents.send('eko-stream-message', {
      type: 'error',
      error: errorMessage,
      detail: error?.stack || error?.toString() || errorMessage,
      taskId: taskId // Include taskId if available
    });
  }

  /**
   * Modify existing task
   */
  async modify(taskId: string, message: string): Promise<EkoResult | null> {
    if (!this.eko) {
      const errorMsg = 'Eko service not initialized';
      Log.error(errorMsg);
      this.sendErrorToFrontend(errorMsg, undefined, taskId);
      return null;
    }

    // Clear screenshot history for modified task
    this.screenshotHistory.delete(taskId);

    // NOTE: We don't sync Playwright page here because BrowserAgent uses detailView.capturePage() for screenshots
    // Playwright page will be created on-demand when index-based actions (clickElementByIndex, inputTextByIndex) are called
    // This eliminates redundancy: BrowserAgent screenshots come from detailView, not Playwright
    
    // Ensure detailView is visible for BrowserAgent screenshot capture
    if (this.detailView) {
      this.detailView.setVisible(true);
      // Give the view more time to become ready for capture
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verify view is actually visible
      const isVisible = this.detailView.getBounds().width > 0 && this.detailView.getBounds().height > 0;
      if (!isVisible) {
        Log.warn('[EkoService] DetailView bounds are zero (modify), waiting longer...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      Log.info('[EkoService] DetailView visibility ensured for BrowserAgent (modify)', {
        visible: isVisible || (this.detailView.getBounds().width > 0),
        bounds: this.detailView.getBounds()
      });
    }

    let result = null;
    try {
      await this.eko.modify(taskId, message);
      result = await this.eko.execute(taskId);
    } catch (error: any) {
      Log.error('EkoService modify error:', error);
      const errorMessage = this.formatErrorMessage(error);
      this.sendErrorToFrontend(errorMessage, error, taskId);
    } finally {
      // Clear visibility check interval when execution completes
      if ((this as any)._visibilityCheckInterval) {
        clearInterval((this as any)._visibilityCheckInterval);
        delete (this as any)._visibilityCheckInterval;
      }
    }
    return result;
  }

  /**
   * Execute task
   */
  async execute(taskId: string): Promise<EkoResult | null> {
    if (!this.eko) {
      const errorMsg = 'Eko service not initialized';
      Log.error(errorMsg);
      this.sendErrorToFrontend(errorMsg, undefined, taskId);
      return null;
    }

    console.log('EkoService executing task:', taskId);
    try {
      return await this.eko.execute(taskId);
    } catch (error: any) {
      Log.error('EkoService execute error:', error);
      const errorMessage = this.formatErrorMessage(error);
      this.sendErrorToFrontend(errorMessage, error, taskId);
      return null;
    }
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<any> {
    if (!this.eko) {
      throw new Error('Eko service not initialized');
    }

    // If Eko has a method to get task status, it can be called here
    // return await this.eko.getTaskStatus(taskId);
    console.log('EkoService getting task status:', taskId);
    return { taskId, status: 'unknown' };
  }

  /**
   * Cancel task
   */
  async cancleTask(taskId: string): Promise<any> {
    if (!this.eko) {
      throw new Error('Eko service not initialized');
    }

    const res = await this.eko.abortTask(taskId, 'cancle');
    return res;
  }

  /**
   * Check if any task is running
   */
  hasRunningTask(): boolean {
    if (!this.eko) {
      return false;
    }

    const allTaskIds = this.eko.getAllTaskId();

    // Iterate through all tasks, check if any task is not terminated
    for (const taskId of allTaskIds) {
      const context = this.eko.getTask(taskId);
      if (context && !context.controller.signal.aborted) {
        // Task exists and not terminated, meaning it may be running
        return true;
      }
    }

    return false;
  }

  /**
   * Get task context (for restoring conversation)
   * Returns workflow, contextParams, and chain history needed to restore the task
   */
  getTaskContext(taskId: string): {
    workflow: any;
    contextParams: Record<string, any>;
    chainPlanRequest?: any;
    chainPlanResult?: string;
  } | null {
    if (!this.eko) {
      Log.error('Eko service not initialized');
      return null;
    }

    const context = this.eko.getTask(taskId);
    if (!context) {
      Log.error(`Task ${taskId} not found in Eko`);
      return null;
    }

    // Extract workflow and convert variables Map to plain object
    const workflow = context.workflow;
    const contextParams: Record<string, any> = {};

    // Convert Map to plain object for serialization
    context.variables.forEach((value, key) => {
      contextParams[key] = value;
    });

    // Extract chain history (critical for replan to maintain conversation context)
    const chainPlanRequest = context.chain?.planRequest;
    const chainPlanResult = context.chain?.planResult;

    Log.info('Extracted task context:', {
      taskId,
      hasWorkflow: !!workflow,
      contextParamsCount: Object.keys(contextParams).length,
      hasChainHistory: !!(chainPlanRequest && chainPlanResult)
    });

    return {
      workflow,
      contextParams,
      chainPlanRequest,
      chainPlanResult
    };
  }

  /**
   * Restore task from saved workflow and contextParams
   * Used to continue conversation from history
   */
  async restoreTask(
    workflow: any,
    contextParams?: Record<string, any>,
    chainPlanRequest?: any,
    chainPlanResult?: string
  ): Promise<string> {
    if (!this.eko) {
      throw new Error('Eko service not initialized');
    }

    try {
      Log.info('Restoring task from workflow:', workflow.taskId);

      // Use Eko's initContext to restore the task
      const context = await this.eko.initContext(workflow, contextParams);

      // Restore chain history (critical for replan to maintain conversation context)
      if (chainPlanRequest && chainPlanResult) {
        context.chain.planRequest = chainPlanRequest;
        context.chain.planResult = chainPlanResult;
        Log.info('Chain history restored successfully');
      } else {
        Log.warn('No chain history to restore - replan will treat as new task');
      }

      Log.info('Task restored successfully:', workflow.taskId);
      return workflow.taskId;
    } catch (error: any) {
      Log.error('Failed to restore task:', error);
      throw error;
    }
  }

  /**
   * Abort all running tasks
   */
  async abortAllTasks(): Promise<void> {
    if (!this.eko) {
      return;
    }

    const allTaskIds = this.eko.getAllTaskId();
    const abortPromises = allTaskIds.map((taskId: any) => this.eko!.abortTask(taskId, 'window-closing'));

    await Promise.all(abortPromises);

    // Reject all pending human interactions (also clears toolId mappings)
    this.rejectAllHumanRequests(new Error('All tasks aborted'));

    Log.info('All tasks aborted');
  }

  /**
   * Request human interaction
   * Sends interaction request to frontend and waits for user response
   */
  private requestHumanInteraction(
    agentContext: AgentContext,
    payload: Omit<HumanRequestMessage, 'type' | 'requestId' | 'timestamp'>
  ): Promise<any> {
    const requestId = randomUUID();
    const message: HumanRequestMessage = {
      type: 'human_interaction',
      requestId,
      taskId: agentContext?.context?.taskId,
      agentName: agentContext?.agent?.Name,
      timestamp: new Date(),
      ...payload
    };

    return new Promise((resolve, reject) => {
      // Store promise resolver/rejector
      this.pendingHumanRequests.set(requestId, { resolve, reject });

      // Map toolId to requestId for frontend response matching
      // Frontend sends toolId as requestId, so we need to map it to the actual requestId
      if (this.currentHumanInteractToolId) {
        this.toolIdToRequestId.set(this.currentHumanInteractToolId, requestId);
        Log.info('[EkoService] ✅ Mapped toolId to requestId for human interaction:', {
          toolId: this.currentHumanInteractToolId,
          requestId,
          interactType: payload.interactType
        });
        // Clear after mapping
        this.currentHumanInteractToolId = null;
      } else {
        Log.warn('[EkoService] ⚠️ No currentHumanInteractToolId set when creating human interaction request', {
          requestId,
          interactType: payload.interactType
        });
      }

      // Listen for task abort signal
      const controllerSignal = agentContext?.context?.controller?.signal;
      if (controllerSignal) {
        controllerSignal.addEventListener('abort', () => {
          this.pendingHumanRequests.delete(requestId);
          reject(new Error('Task aborted during human interaction'));
        });
      }

      // Send request to frontend as a special message
      if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        this.pendingHumanRequests.delete(requestId);
        reject(new Error('Main window destroyed, cannot request human interaction'));
        return;
      }

      Log.info('Requesting human interaction:', { requestId, interactType: payload.interactType, prompt: payload.prompt });
      this.mainWindow.webContents.send('eko-stream-message', message);
    });
  }

  /**
   * Handle human response from frontend
   * Called via IPC when user completes interaction
   */
  public handleHumanResponse(response: HumanResponseMessage): boolean {
    Log.info('[EkoService] Received human response:', {
      requestId: response.requestId,
      success: response.success,
      result: response.result
    });

    // First try direct requestId match
    let pending = this.pendingHumanRequests.get(response.requestId);
    let actualRequestId = response.requestId;

    // If not found, try to find via toolId mapping (frontend sends toolId as requestId)
    if (!pending) {
      Log.info('[EkoService] Direct requestId not found, checking toolId mapping...', {
        requestId: response.requestId,
        toolIdMapSize: this.toolIdToRequestId.size,
        pendingRequestsSize: this.pendingHumanRequests.size
      });
      
      // Log all mappings for debugging
      if (this.toolIdToRequestId.size > 0) {
        Log.info('[EkoService] Current toolId mappings:', 
          Array.from(this.toolIdToRequestId.entries()).map(([toolId, reqId]) => ({ toolId, reqId }))
        );
      }
      
      const mappedRequestId = this.toolIdToRequestId.get(response.requestId);
      if (mappedRequestId) {
        pending = this.pendingHumanRequests.get(mappedRequestId);
        actualRequestId = mappedRequestId;
        Log.info('[EkoService] ✅ Found requestId via toolId mapping:', {
          toolId: response.requestId,
          actualRequestId: mappedRequestId,
          pendingFound: !!pending
        });
      } else {
        Log.warn('[EkoService] ⚠️ No mapping found for toolId:', response.requestId);
        // Try reverse lookup - maybe requestId is actually the mapped requestId
        for (const [toolId, reqId] of this.toolIdToRequestId.entries()) {
          if (reqId === response.requestId) {
            pending = this.pendingHumanRequests.get(response.requestId);
            actualRequestId = response.requestId;
            Log.info('[EkoService] ✅ Found via reverse lookup (requestId matches mapped value):', {
              toolId,
              requestId: reqId
            });
            break;
          }
        }
      }
    } else {
      Log.info('[EkoService] ✅ Found pending request via direct requestId match');
    }

    if (!pending) {
      Log.error(`[EkoService] ❌ Human interaction request ${response.requestId} not found or already processed`, {
        requestId: response.requestId,
        toolIdMapSize: this.toolIdToRequestId.size,
        pendingRequestsSize: this.pendingHumanRequests.size,
        availableRequestIds: Array.from(this.pendingHumanRequests.keys()),
        availableToolIds: Array.from(this.toolIdToRequestId.keys())
      });
      return false;
    }

    // Clean up both maps BEFORE resolving to prevent duplicate responses
    this.pendingHumanRequests.delete(actualRequestId);
    this.toolIdToRequestId.delete(response.requestId);

    if (response.success) {
      // Log what we're resolving with
      Log.info('[EkoService] ✅ Resolving human interaction promise:', {
        actualRequestId,
        result: response.result,
        resultType: typeof response.result
      });

      // Resolve promise immediately - AI should continue execution
      try {
        pending.resolve(response.result);
        Log.info('[EkoService] ✅ Human interaction promise resolved successfully, agent should continue execution');
      } catch (error) {
        Log.error('[EkoService] ❌ Error resolving human interaction promise:', error);
        // Still try to reject to prevent hanging
        try {
          pending.reject(error);
        } catch (rejectError) {
          Log.error('[EkoService] ❌ Error rejecting promise after resolve error:', rejectError);
        }
      }

      // Send result message to frontend to update card state
      if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        Log.warn('[EkoService] Main window destroyed, cannot send interaction result');
        return true;
      }

      this.mainWindow.webContents.send('eko-stream-message', {
        type: 'human_interaction_result',
        requestId: response.requestId,
        result: response.result,
        timestamp: new Date()
      });
    } else {
      // Reject promise, AI handles error
      Log.warn('[EkoService] Rejecting human interaction promise:', response.error);
      try {
        pending.reject(new Error(response.error || 'Human interaction cancelled'));
        Log.info('[EkoService] ✅ Human interaction promise rejected, agent should handle error');
      } catch (error) {
        Log.error('[EkoService] ❌ Error rejecting human interaction promise:', error);
      }
    }

    return true;
  }

  /**
   * Reject all pending human interaction requests
   * Used when config reloads or service shuts down
   */
  private rejectAllHumanRequests(error: Error): void {
    if (this.pendingHumanRequests.size === 0) {
      return;
    }

    Log.info(`Rejecting ${this.pendingHumanRequests.size} pending human interaction requests`);

    for (const pending of this.pendingHumanRequests.values()) {
      pending.reject(error);
    }

    this.pendingHumanRequests.clear();
    this.toolIdToRequestId.clear();
    this.currentHumanInteractToolId = null;
  }

  /**
   * Destroy service
   */
  destroy() {
    Log.info('EkoService destroyed');
    this.rejectAllHumanRequests(new Error('EkoService destroyed'));
    this.eko = null;
  }
}