import { config } from "dotenv";
import path from "node:path";
import { app } from "electron";
import fs from "fs";
import { store } from "./store";

/**
 * Supported providers
 */
export type ProviderType = 'deepseek' | 'qwen' | 'google' | 'anthropic' | 'openrouter';

/**
 * Model configuration interface
 */
export interface ModelConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
}

/**
 * User model configurations stored in electron-store
 */
export interface UserModelConfigs {
  deepseek?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  };
  qwen?: {
    apiKey?: string;
    model?: string;
  };
  google?: {
    apiKey?: string;
    model?: string;
  };
  anthropic?: {
    apiKey?: string;
    model?: string;
  };
  openrouter?: {
    apiKey?: string;
    model?: string;
  };
  selectedProvider?: ProviderType;
}

/**
 * Agent configuration interface
 */
export interface AgentConfig {
  browserAgent: {
    enabled: boolean;
    customPrompt: string;
  };
  fileAgent: {
    enabled: boolean;
    customPrompt: string;
  };
  // MCP Tools configuration - dynamically managed
  mcpTools: {
    [toolName: string]: {
      enabled: boolean;
      config?: Record<string, any>;
    };
  };
}

/**
 * Configuration Manager for handling environment variables in both development and production
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private initialized = false;

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Initialize configuration with bundled configuration support
   * Priority: Bundled .env.production > System env > Default values
   */
  public initialize(): void {
    if (this.initialized) {
      return;
    }

    const isDev = !app.isPackaged;

    // Development: load from .env.local
    if (isDev) {
      const envLocalPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envLocalPath)) {
        config({ path: envLocalPath });
        console.log('[ConfigManager] Loaded environment variables from .env.local');
        this.initialized = true;
        return;
      }
    }

    // Production: try to load bundled .env.production
    const bundledConfigPath = path.join(app.getAppPath(), '../../.env.production');

    if (fs.existsSync(bundledConfigPath)) {
      config({ path: bundledConfigPath });
      console.log('[ConfigManager] Loaded environment variables from bundled .env.production');
    } else {
      console.log('[ConfigManager] No bundled config found, using system environment variables');
    }

    this.logAvailableKeys();
    this.initialized = true;
  }

  /**
   * Get API key with fallback
   */
  public getApiKey(key: string, defaultValue: string = ''): string {
    return process.env[key] || defaultValue;
  }

  /**
   * Check if required API keys are configured
   */
  public validateApiKeys(): { isValid: boolean; missingKeys: string[] } {
    const requiredKeys = ['DEEPSEEK_API_KEY', 'BAILIAN_API_KEY'];
    const missingKeys = requiredKeys.filter(key => !this.getApiKey(key));

    return {
      isValid: missingKeys.length === 0,
      missingKeys
    };
  }

  /**
   * Log available API keys for debugging (masked)
   */
  private logAvailableKeys(): void {
    const availableKeys = ['DEEPSEEK_API_KEY', 'BAILIAN_API_KEY', 'OPENROUTER_API_KEY']
      .filter(key => process.env[key])
      .map(key => `${key.substring(0, 8)}...`);

    if (availableKeys.length > 0) {
      console.log('[ConfigManager] Available API keys:', availableKeys);
    } else {
      console.warn('[ConfigManager] No API keys found! Please configure your API keys in .env.production before building.');
    }

    // Validate required keys
    const validation = this.validateApiKeys();
    if (!validation.isValid) {
      console.warn('[ConfigManager] Missing required API keys:', validation.missingKeys);
    }
  }

  /**
   * Get user model configurations from electron-store
   */
  public getUserModelConfigs(): UserModelConfigs {
    return store.get('modelConfigs', {}) as UserModelConfigs;
  }

  /**
   * Save user model configurations to electron-store
   */
  public saveUserModelConfigs(configs: UserModelConfigs): void {
    store.set('modelConfigs', configs);
    console.log('[ConfigManager] User model configurations saved');
  }

  /**
   * Get final model configuration with priority: user config > env > default
   */
  public getModelConfig(provider: ProviderType): ModelConfig | null {
    const userConfigs = this.getUserModelConfigs();

    switch (provider) {
      case 'deepseek':
        return {
          provider: 'deepseek',
          model: userConfigs.deepseek?.model || 'deepseek-chat',
          apiKey: userConfigs.deepseek?.apiKey || process.env.DEEPSEEK_API_KEY || '',
          baseURL: userConfigs.deepseek?.baseURL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'
        };

      case 'qwen':
        return {
          provider: 'openai',
          model: userConfigs.qwen?.model || 'qwen-max',
          apiKey: userConfigs.qwen?.apiKey || process.env.QWEN_API_KEY || '',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
        };

      case 'google':
        return {
          provider: 'google',
          model: userConfigs.google?.model || 'gemini-2.5-flash',
          apiKey: userConfigs.google?.apiKey || process.env.GOOGLE_API_KEY || ''
        };

      case 'anthropic':
        return {
          provider: 'anthropic',
          model: userConfigs.anthropic?.model || 'claude-3-7-sonnet-20250219',
          apiKey: userConfigs.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || ''
        };

      case 'openrouter':
        return {
          provider: 'openrouter',
          model: userConfigs.openrouter?.model || 'anthropic/claude-3.7-sonnet',
          apiKey: userConfigs.openrouter?.apiKey || process.env.OPENROUTER_API_KEY || ''
        };

      default:
        return null;
    }
  }

  /**
   * Get API key source info (for UI display)
   */
  public getApiKeySource(provider: ProviderType): 'user' | 'env' | 'none' {
    const userConfigs = this.getUserModelConfigs();

    // Check user config first (highest priority)
    if (userConfigs[provider]?.apiKey) {
      return 'user';
    }

    // Then check environment variables
    const envKeys: Record<ProviderType, string> = {
      deepseek: 'DEEPSEEK_API_KEY',
      qwen: 'QWEN_API_KEY',
      google: 'GOOGLE_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      openrouter: 'OPENROUTER_API_KEY'
    };

    const envKey = envKeys[provider];
    if (process.env[envKey]) {
      return 'env';
    }

    return 'none';
  }

  /**
   * Get selected provider (with fallback)
   */
  public getSelectedProvider(): ProviderType {
    const userConfigs = this.getUserModelConfigs();
    return userConfigs.selectedProvider || 'deepseek';
  }

  /**
   * Set selected provider
   */
  public setSelectedProvider(provider: ProviderType): void {
    const userConfigs = this.getUserModelConfigs();
    userConfigs.selectedProvider = provider;
    this.saveUserModelConfigs(userConfigs);
  }

  /**
   * Get maxTokens for specific model
   */
  private getMaxTokensForModel(provider: ProviderType, model: string): number {
    // Define maxTokens for different models
    const tokenLimits: Record<string, number> = {
      // Deepseek
      'deepseek-chat': 8192,
      'deepseek-reasoner': 65536,

      // Google (latest models first)
      'gemini-2.5-pro': 8192,
      'gemini-2.5-flash': 8192,
      'gemini-2.5-flash-lite': 8192,
      'gemini-2.0-flash-exp': 8192,
      'gemini-2.0-flash-thinking-exp-01-21': 65536,
      'gemini-1.5-flash-latest': 8192,
      'gemini-1.5-pro-latest': 8192,
      'gemini-1.5-flash-002': 8192,
      'gemini-1.5-pro-002': 8192,
      'gemini-1.5-flash-8b': 8192,

      // Anthropic (latest models first)
      'claude-3-7-sonnet-20250219': 200000,
      'claude-3-5-sonnet-latest': 200000,
      'claude-3-5-haiku-latest': 200000,
      'claude-3-5-sonnet-20240620': 200000,

      // Qwen
      'qwen-max': 8192,
      'qwen-plus': 8192,
      'qwen-vl-max': 8192,
    };

    // Return specific token limit or default based on provider
    return tokenLimits[model] || (provider === 'openrouter' ? 8000 : 8192);
  }

  /**
   * Get LLMs configuration for Eko framework
   * Returns configured LLMs object based on selected provider
   */
  public getLLMsConfig(): any {
    const selectedProvider = this.getSelectedProvider();
    const providerConfig = this.getModelConfig(selectedProvider);

    if (!providerConfig) {
      console.error(`[ConfigManager] No config found for provider: ${selectedProvider}`);
      return { default: null };
    }

    const logInfo = (msg: string, ...args: any[]) => console.log(`[ConfigManager] ${msg}`, ...args);
    const maxTokens = this.getMaxTokensForModel(selectedProvider, providerConfig.model);

    // Build default LLM based on selected provider
    let defaultLLM: any;

    switch (selectedProvider) {
      case 'deepseek':
        defaultLLM = {
          provider: providerConfig.provider,
          model: providerConfig.model,
          apiKey: providerConfig.apiKey || "",
          config: {
            baseURL: providerConfig.baseURL || "https://api.deepseek.com/v1",
            maxTokens,
            mode: 'regular',
          },
          fetch: (url: string, options?: any) => {
            // Intercept request and add thinking parameter for deepseek
            const body = JSON.parse((options?.body as string) || '{}');
            body.thinking = { type: "disabled" };
            logInfo('Deepseek request:', providerConfig.model);
            return fetch(url, {
              ...options,
              body: JSON.stringify(body)
            });
          }
        };
        break;

      case 'qwen':
        defaultLLM = {
          provider: providerConfig.provider,
          model: providerConfig.model,
          apiKey: providerConfig.apiKey || "",
          config: {
            baseURL: providerConfig.baseURL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
            maxTokens,
            timeout: 60000,
            temperature: 0.7
          },
          fetch: (url: string, options?: any) => {
            logInfo('Qwen request:', providerConfig.model);
            return fetch(url, options);
          }
        };
        break;

      case 'google':
        defaultLLM = {
          provider: providerConfig.provider,
          model: providerConfig.model,
          apiKey: providerConfig.apiKey || "",
          config: {
            maxTokens,
            temperature: 0.7
          }
        };
        break;

      case 'anthropic':
        defaultLLM = {
          provider: providerConfig.provider,
          model: providerConfig.model,
          apiKey: providerConfig.apiKey || "",
          config: {
            maxTokens,
            temperature: 0.7
          }
        };
        break;

      case 'openrouter':
        defaultLLM = {
          provider: providerConfig.provider,
          model: providerConfig.model,
          apiKey: providerConfig.apiKey || "",
          config: {
            maxTokens
          }
        };
        break;

      default:
        console.error(`[ConfigManager] Unsupported provider: ${selectedProvider}`);
        return { default: null };
    }

    logInfo(`Using provider: ${selectedProvider}, model: ${providerConfig.model}, maxTokens: ${maxTokens}`);

    // Return LLMs configuration
    return {
      default: defaultLLM,
    };
  }

  /**
   * Get agent configurations from electron-store
   * Note: mcpTools will be merged with available tools dynamically
   */
  public getAgentConfig(): AgentConfig {
    const defaultConfig: AgentConfig = {
      browserAgent: {
        enabled: true,
        customPrompt: `You are a browser automation agent. Your task is to interact with web pages accurately and reliably.

IMPORTANT GUIDELINES:

1. **Element Identification** (CRITICAL):
   - **ALWAYS use list_elements tool FIRST** to discover available elements before attempting to click or type
   - This is especially important for Gmail compose fields which may have dynamic selectors
   - Example: Before typing email, run list_elements with selector "div[role='dialog']" to see all available input fields
   - Use specific selectors: aria-label, role, text content, or data attributes
   - For Gmail specifically:
     * **Compose button**: Look for "Compose" button in sidebar (div[role="button"] with text "Compose" or aria-label containing "Compose")
     * **To field**: Use list_elements first! Then try: input[aria-label*="To" i], input[name="to"], or input[type="email"][aria-label*="To" i] within compose dialog
     * **Subject field**: Use list_elements first! Then try: input[name="subjectbox"] (most reliable), or input[aria-label*="Subject" i] within compose dialog
     * **Body field**: Use list_elements first! Then try: div[aria-label*="Message Body" i], div[role="textbox"][aria-label*="Message" i], or div[contenteditable="true"][aria-label*="Message" i] within compose dialog. These are contenteditable divs, not input fields - click first then type
     * **Send button**: div[role="button"][aria-label*="Send" i] or button with text "Send" within compose dialog
     * **IMPORTANT**: If a selector fails, use list_elements to discover the actual selectors available on the page
   - Wait for elements to be visible before interacting (use wait_for_popup for modals/dialogs)
   - If element not found, DO NOT assume it doesn't exist - use list_elements to verify

2. **Action Verification**:
   - After clicking, verify the action succeeded by checking:
     * URL changed (for navigation)
     * New element appeared (for buttons that open dialogs)
     * Element state changed (for form submissions)
   - For Gmail compose: Wait for compose dialog to appear after clicking Compose
   - For email sending: Verify "Message sent" confirmation appears

3. **Gmail-Specific Instructions**:
   - Gmail uses dynamic class names, so rely on aria-label, role, and text content
   - Compose window is a dialog (div[role="dialog"]), wait for it to fully load
   - After clicking Compose, wait 1-2 seconds for compose window to appear
   - Fill fields in order: To → Subject → Body → Send
   - For Subject field: Use input[name="subjectbox"] - this is the most reliable selector
   - For Body field: Use div[aria-label*="Message Body" i] or div[role="textbox"][aria-label*="Message" i] - these are contenteditable divs, click first then type
   - Always scope selectors to compose dialog when possible: div[role="dialog"][aria-label*="compose" i] input[name="subjectbox"]
   - After clicking Send, wait for confirmation (usually "Message sent" toast or compose window closes)

4. **Error Handling**:
   - If element not found, try alternative selectors
   - Use list_elements to discover available elements
   - Take screenshot if stuck to see current page state
   - Report specific errors, don't assume success

5. **Best Practices**:
   - Always verify actions completed successfully
   - Don't report success until you've confirmed the action
   - Use screenshots to understand page state when uncertain
   - Be patient - wait for elements to load before interacting

6. **Human-Like Behavior**:
   - All actions use human-like mouse movements (Bezier curves, variable delays)
   - Typing is character-by-character with natural pauses
   - Clicks include reaction pauses and natural timing
   - This makes automation appear natural and reduces bot detection
   - Actions may take slightly longer but are more reliable and realistic`
      },
      fileAgent: {
        enabled: true,
        customPrompt: `You are a browser automation agent. Your task is to interact with web pages accurately and reliably.

IMPORTANT GUIDELINES:

1. **Element Identification** (CRITICAL):
   - **ALWAYS use list_elements tool FIRST** to discover available elements before attempting to click or type
   - This is especially important for Gmail compose fields which may have dynamic selectors
   - Example: Before typing email, run list_elements with selector "div[role='dialog']" to see all available input fields
   - Use specific selectors: aria-label, role, text content, or data attributes
   - For Gmail specifically:
     * **Compose button**: Look for "Compose" button in sidebar (div[role="button"] with text "Compose" or aria-label containing "Compose")
     * **To field**: Use list_elements first! Then try: input[aria-label*="To" i], input[name="to"], or input[type="email"][aria-label*="To" i] within compose dialog
     * **Subject field**: Use list_elements first! Then try: input[name="subjectbox"] (most reliable), or input[aria-label*="Subject" i] within compose dialog
     * **Body field**: Use list_elements first! Then try: div[aria-label*="Message Body" i], div[role="textbox"][aria-label*="Message" i], or div[contenteditable="true"][aria-label*="Message" i] within compose dialog. These are contenteditable divs, not input fields - click first then type
     * **Send button**: div[role="button"][aria-label*="Send" i] or button with text "Send" within compose dialog
     * **IMPORTANT**: If a selector fails, use list_elements to discover the actual selectors available on the page
   - Wait for elements to be visible before interacting (use wait_for_popup for modals/dialogs)
   - If element not found, DO NOT assume it doesn't exist - use list_elements to verify

2. **Action Verification**:
   - After clicking, verify the action succeeded by checking:
     * URL changed (for navigation)
     * New element appeared (for buttons that open dialogs)
     * Element state changed (for form submissions)
   - For Gmail compose: Wait for compose dialog to appear after clicking Compose
   - For email sending: Verify "Message sent" confirmation appears

3. **Gmail-Specific Instructions**:
   - Gmail uses dynamic class names, so rely on aria-label, role, and text content
   - Compose window is a dialog (div[role="dialog"]), wait for it to fully load
   - After clicking Compose, wait 1-2 seconds for compose window to appear
   - Fill fields in order: To → Subject → Body → Send
   - For Subject field: Use input[name="subjectbox"] - this is the most reliable selector
   - For Body field: Use div[aria-label*="Message Body" i] or div[role="textbox"][aria-label*="Message" i] - these are contenteditable divs, click first then type
   - Always scope selectors to compose dialog when possible: div[role="dialog"][aria-label*="compose" i] input[name="subjectbox"]
   - After clicking Send, wait for confirmation (usually "Message sent" toast or compose window closes)

4. **Error Handling**:
   - If element not found, try alternative selectors
   - Use list_elements to discover available elements
   - Take screenshot if stuck to see current page state
   - Report specific errors, don't assume success

5. **Best Practices**:
   - Always verify actions completed successfully
   - Don't report success until you've confirmed the action
   - Use screenshots to understand page state when uncertain
   - Be patient - wait for elements to load before interacting

6. **Human-Like Behavior**:
   - All actions use human-like mouse movements (Bezier curves, variable delays)
   - Typing is character-by-character with natural pauses
   - Clicks include reaction pauses and natural timing
   - This makes automation appear natural and reduces bot detection
   - Actions may take slightly longer but are more reliable and realistic`
      },
      mcpTools: {}  // Will be populated dynamically
    };

    return store.get('agentConfig', defaultConfig) as AgentConfig;
  }

  /**
   * Save agent configurations to electron-store
   */
  public saveAgentConfig(config: AgentConfig): void {
    store.set('agentConfig', config);
    console.log('[ConfigManager] Agent configurations saved');
  }

  /**
   * Get MCP tool configuration for a specific tool
   * If not configured, returns enabled by default
   */
  public getMcpToolConfig(toolName: string): { enabled: boolean; config?: Record<string, any> } {
    const agentConfig = this.getAgentConfig();
    return agentConfig.mcpTools[toolName] || { enabled: true };  // Default to enabled
  }

  /**
   * Set MCP tool configuration
   */
  public setMcpToolConfig(toolName: string, config: { enabled: boolean; config?: Record<string, any> }): void {
    const agentConfig = this.getAgentConfig();
    agentConfig.mcpTools[toolName] = config;
    this.saveAgentConfig(agentConfig);
  }

  /**
   * Get all MCP tools configuration
   * Merges with available tools from McpToolManager
   */
  public getAllMcpToolsConfig(availableTools: string[]): Record<string, { enabled: boolean; config?: Record<string, any> }> {
    const agentConfig = this.getAgentConfig();
    const result: Record<string, { enabled: boolean; config?: Record<string, any> }> = {};

    // For each available tool, get its config (default to enabled if not configured)
    availableTools.forEach(toolName => {
      result[toolName] = agentConfig.mcpTools[toolName] || { enabled: true };
    });

    return result;
  }

  /**
   * Get enabled MCP tools list
   */
  public getEnabledMcpTools(availableTools: string[]): string[] {
    const allConfigs = this.getAllMcpToolsConfig(availableTools);
    return Object.entries(allConfigs)
      .filter(([_, config]) => config.enabled)
      .map(([name, _]) => name);
  }
}