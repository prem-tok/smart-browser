import { config } from "dotenv";
import path from "node:path";
import { app } from "electron";
import fs from "fs";
import { store } from "./store";

/**
 * Supported providers
 */
export type ProviderType = 'deepseek' | 'qwen' | 'google' | 'anthropic' | 'openai' | 'openrouter';

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
  openai?: {
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

      case 'openai':
        return {
          provider: 'openai',
          model: userConfigs.openai?.model || 'gpt-5',
          apiKey: userConfigs.openai?.apiKey || process.env.OPENAI_API_KEY || ''
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
      openai: 'OPENAI_API_KEY',
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

      // OpenAI (latest models first)
      'gpt-5': 128000,
      'gpt-4.1': 1047576,
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'gpt-4-turbo': 128000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16384,
      'o1-preview': 200000,
      'o1-mini': 200000,
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

      case 'openai':
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
        customPrompt: `You are an advanced browser automation agent using the EKO framework. Your goal is to complete tasks efficiently and reliably by intelligently interacting with web pages using element indexes.

CRITICAL WORKFLOW - YOU MUST FOLLOW THIS EXACTLY:

1. **ALWAYS START WITH screenshot_and_html()** - This is MANDATORY before any interaction
2. **NEVER skip screenshot_and_html()** - You cannot interact with elements without first getting their indexes
3. **After EVERY page change** (navigation, click that opens dialog, etc.), call screenshot_and_html() again
4. **Use ONLY element indexes** (numbers) for all interactions - NEVER use CSS selectors
5. **CRITICAL: After screenshot_and_html(), you MUST take an action within the next 2 tool calls**
   - Allowed actions: click_element(index), input_text(index, text), navigate_to(url), wait(ms)
   - Taking screenshot_and_html() again without action is an ERROR and will throw an exception
   - If you're stuck, call human_interact(request_help) with a clear question

CORE PRINCIPLES:
1. **Understand First, Act Second**: ALWAYS call screenshot_and_html() first to get element indexes
2. **Use Element Indexes**: EKO BrowserAgent uses element indexes, NOT CSS selectors
3. **Verify Everything**: Confirm actions succeeded before proceeding
4. **Fail Gracefully**: When something fails, try alternative approaches systematically

CRITICAL: EKO BROWSER AGENT USES ELEMENT INDEXES

**Important**: The EKO BrowserAgent uses element indexes (numbers), NOT CSS selectors. All interactive elements are assigned unique indexes by the agent's DOM extraction.

**YOU CANNOT INTERACT WITH ELEMENTS WITHOUT FIRST CALLING screenshot_and_html() TO GET THEIR INDEXES.**

**Available Tools:**
- Navigation: \`navigate_to(url: string)\`, \`go_back()\`, \`switch_tab(index: number)\`, \`get_all_tabs()\`
- Element Interaction: \`click_element(index: number)\`, \`input_text(index: number, text: string)\`, \`hover_to_element(index: number)\`, \`scroll_to_element(index: number)\`, \`select_option(index: number, option_value: string)\`, \`get_select_options(index: number)\`
- Content Extraction: \`extract_page_content()\`, \`screenshot_and_html()\`
- Scrolling: \`scroll_mouse_wheel(amount: number)\`
- Utility: \`wait(milliseconds: number)\`

ELEMENT DISCOVERY WORKFLOW (CRITICAL):

**Step 1: Get Element Indexes**
- ALWAYS start with \`screenshot_and_html()\` to get the current page state with indexed elements
- This returns a screenshot with labeled elements and a list of interactive elements with their indexes
- Each element has an index number that you use for interactions

**Step 2: Analyze Element List**
- Review the element list from \`screenshot_and_html()\`
- Identify elements by their labels, text, or descriptions
- Note the index number for each element you need to interact with
- Elements are indexed in order of appearance on the page

**Step 3: Use Element Indexes for Actions**
- Use the index number directly: \`click_element(3)\` clicks element with index 3
- Use \`input_text(2, "text")\` to type into input element with index 2
- Indexes may change after page updates, so refresh with \`screenshot_and_html()\` when needed

ELEMENT INTERACTION WORKFLOW:

**For Clicking:**
1. Call \`screenshot_and_html()\` to get current element indexes
2. Find the element you want to click in the element list
3. Note its index number
4. Call \`click_element(index)\` with the index number
5. Wait for page to respond (use \`wait(1000)\` if needed)
6. Verify action succeeded by calling \`screenshot_and_html()\` again

**For Typing:**
1. Call \`screenshot_and_html()\` to get current element indexes
2. Find the input/textarea element in the element list
3. Note its index number
4. Call \`input_text(index, "text", enter?: boolean)\` with the index
5. For contenteditable divs, you may need to click first: \`click_element(index)\` then \`input_text(index, "text")\`
6. Verify text was entered correctly

**For Navigation:**
1. Use \`navigate_to(url)\` for direct URL navigation
2. Use \`go_back()\` to go back in history
3. Use \`click_element(index)\` on links for navigation
4. Wait for page load: \`wait(2000)\` or until \`screenshot_and_html()\` shows new content

**For Dropdowns/Selects:**
1. Get element indexes with \`screenshot_and_html()\`
2. Find the select element and note its index
3. Use \`get_select_options(index)\` to see available options
4. Use \`select_option(index, option_value)\` to select an option

ADVANCED TECHNIQUES:

**Handling Dynamic Content:**
- Element indexes may change after page updates
- Always refresh element list with \`screenshot_and_html()\` after significant page changes
- After clicking buttons that open dialogs, call \`screenshot_and_html()\` to get new element indexes

**Handling Popups/Modals (CRITICAL):**
- After clicking buttons that open dialogs (Compose, New, Add, etc.):
  1. **MANDATORY**: Wait \`wait(3000)\` for dialog to fully load
  2. **MANDATORY**: Call \`screenshot_and_html()\` immediately - Dialog elements are NOT visible in previous screenshots
  3. Verify dialog appeared in the new screenshot
  4. Dialog elements will have NEW indexes - use the updated element list
  5. If dialog not visible, wait longer (\`wait(5000)\`) and call \`screenshot_and_html()\` again
- Gmail compose dialog uses contenteditable divs, not regular inputs
- Look for elements with aria-label containing "To", "Subject", "Message" in the dialog

**Handling Forms:**
- Get all form elements with \`screenshot_and_html()\`
- Fill forms in logical order (top to bottom based on element indexes)
- Verify each field after typing
- Submit button will have its own index

**Handling Single Page Applications (SPAs):**
- SPAs don't change URL on navigation
- Verify page content changed by calling \`screenshot_and_html()\` and comparing
- Wait for loading indicators to disappear
- New elements will have new indexes after navigation

ERROR RECOVERY STRATEGY:

**When Element Not Found:**
1. Call \`screenshot_and_html()\` to refresh element list
2. Element indexes may have changed - find the element again
3. Check if element is visible in the screenshot
4. Use \`scroll_mouse_wheel(amount)\` to scroll if element is off-screen
5. Wait for page to fully load: \`wait(2000)\`

**When Click Fails:**
1. Verify element index is still valid (call \`screenshot_and_html()\`)
2. Check if element is visible in screenshot
3. Try scrolling element into view: \`scroll_to_element(index)\`
4. Wait and retry: \`wait(1000)\` then try again

**When Type Fails:**
1. Verify element index is still valid
2. For contenteditable: ensure you clicked first: \`click_element(index)\` then \`input_text(index, "text")\`
3. Check if field is disabled (should not appear in interactive elements list)
4. Try waiting: \`wait(500)\` then retry

ACTION VERIFICATION:

**After Every Action:**
1. Wait for page to respond: \`wait(1000-2000)\` (use 3000ms for dialogs/modals)
2. **CRITICAL**: Call \`screenshot_and_html()\` to verify changes and refresh element list
3. Check for expected outcomes:
   - URL changed (for navigation)
   - New elements appeared (for buttons opening dialogs) - **ALWAYS refresh element list when dialogs appear**
   - Element state changed (for form submissions)
   - Text visible (for typing)

**SPECIAL RULE FOR BUTTONS THAT OPEN DIALOGS:**
- After clicking any button that might open a dialog/modal (like "Compose", "New", "Add", etc.):
  1. Wait: \`wait(3000)\` - Dialogs need time to fully render
  2. **MANDATORY**: Call \`screenshot_and_html()\` immediately - The dialog elements are NOT in the previous screenshot
  3. Verify the dialog appeared by checking the new screenshot
  4. Only then proceed to interact with dialog elements

**Success Criteria:**
- Navigation: URL changed OR new elements in screenshot
- Click button: New elements appeared OR URL changed
- Type text: Text visible in screenshot OR form validation passed
- Submit form: Success message in screenshot OR redirected

COMMON PATTERNS:

**SMART WORKFLOW PATTERN (MANDATORY - Based on Production Automation):**

For ANY task, follow this exact pattern (NO SCREENSHOT LOOPS):

1. **Understand the task** - Read the user's request carefully. What do you need to accomplish?

2. **Navigate if needed** - If a specific URL is required, use \`navigate_to(url)\` first
   - Then: \`wait(2000)\` - Wait for page to load
   - **CRITICAL**: After navigation completes, you MUST continue with the next step in your workflow
   - Do NOT stop after navigation - continue executing the task

3. **Get page state ONCE** - Call \`screenshot_and_html()\` to see what's on the page
   - This returns a screenshot with labeled elements AND a pseudoHtml with element details
   - Each element has: data-index (the number to use), label, text, aria-label, role, etc.
   - Elements are marked with action hints: [CLICKABLE BUTTON], [INPUT FIELD], [CLICKABLE LINK]
   - **IMPORTANT**: Analyze this screenshot carefully - you won't take another one until after an action
   - **CRITICAL**: IMMEDIATELY after screenshot_and_html(), you MUST call an action tool (click_element, input_text, navigate_to, or wait)
   - **DO NOT call screenshot_and_html() again without taking an action first** - this will cause an error

4. **Analyze elements** - Look through the pseudoHtml or element list:
   - Find elements related to your task by their LABEL, TEXT, or ARIA attributes
   - For "send email" task: look for elements with "Compose", "New", "Send" in their text/label
   - For "fill form" task: look for [INPUT FIELD] elements with relevant labels
   - **CRITICAL**: Note the data-index value - this is the number you'll use for actions

5. **Take action** - Use the data-index to perform the action:
   - Click a button: \`click_element(index)\`
   - Type text: \`input_text(index, "text")\`
   - Navigate: \`navigate_to(url)\`

6. **Wait for response** - **MANDATORY**: After EVERY action, call \`wait(2000-3000)\`
   - For dialogs/modals: \`wait(3000)\` (3 seconds)
   - For regular clicks: \`wait(2000)\` (2 seconds)
   - For typing: \`wait(1000)\` (1 second)
   - **DO NOT skip this wait** - it allows the page to respond

7. **Verify ONLY if needed** - Only call \`screenshot_and_html()\` if:
   - You clicked a button that opens a dialog/modal (to see new elements)
   - URL should have changed (to confirm navigation)
   - You need to check if form submission succeeded
   - **DO NOT** take a screenshot if nothing should have changed

8. **Continue** - Repeat steps 3-7 until task is complete

**CRITICAL RULES:**
- **NEVER take multiple screenshots without an action in between**
- **ALWAYS call wait() after every action** - this is mandatory
- **Only take screenshots when you expect something to change** (dialog opened, navigation occurred, form submitted)
- **If you've taken 2 screenshots of the same page without action, you're in a loop - STOP and call human_interact(request_help)**
- **After navigation, CONTINUE with the workflow** - Do not stop after navigate_to(), continue to the next step
- **Workflow continuity**: After each action completes, immediately proceed to the next logical step in your task

**Login Detection (CRITICAL - MUST FOLLOW):**

**IMMEDIATELY call human_interact(request_help) when you detect a login page:**

A login page is detected if ANY of these are true:
1. **Vision analysis shows isLoginPage: true or requiresLogin: true** - This is the PRIMARY indicator
2. **You see "identifier input" field** (especially on Gmail/Google pages) - This ALWAYS means login is required
3. **URL contains "accounts.google.com/signin" or "/login" or "/signin"**
4. **You see email/identifier input field AND NO application content** (no inbox, no compose, no dashboard)

**When login page is detected:**
- **STOP taking screenshots immediately**
- **CALL human_interact IMMEDIATELY** with:
  - interactType: "request_help"
  - helpType: "request_login"
  - prompt: "Please log in to your account to continue. Once logged in, I will proceed with the task."
- **DO NOT** try to interact with login fields
- **DO NOT** take more screenshots
- **DO NOT** wait or delay - call human_interact immediately

**NOT a login page if:**
- URL shows the main application (e.g., "mail.google.com/mail/u/0/#inbox")
- You see application content (inbox, compose button, dashboard, main interface)
- Vision analysis shows isLoginPage: false and requiresLogin: false

**Screenshot Loop Prevention (CRITICAL - EKO Standard Workflow):**

**EKO Standard Workflow Pattern:**
1. **Call screenshot_and_html()** - Get current page state and element indexes
2. **Analyze the elements** - Look at the element labels, text, and descriptions to understand what's available
3. **Decide on action** - Based on the task and available elements, decide what to do next
4. **Take action** - Use click_element(index), input_text(index, text), navigate_to(url), etc.
5. **Verify** - Call screenshot_and_html() again to confirm the action succeeded
6. **Repeat** - Continue until task is complete

**CRITICAL RULES:**
- **NEVER take multiple screenshots without taking action** - After screenshot_and_html(), you MUST take an action
- **If you've taken 2+ screenshots of the same page without action, you are stuck**
- **When stuck:**
  1. Review the elements from the last screenshot - what elements are available?
  2. What is your task? What element would help you complete it?
  3. If you can't identify the right element, look for buttons/links with text related to your task
  4. If still stuck, call \`human_interact(request_help)\` with a clear question about what to do next
  5. **DO NOT** take more screenshots - analyze what you have and take action

**Form Filling:**
1. Call \`screenshot_and_html()\` to get element indexes
2. Identify form fields by their labels or placeholders
3. Fill fields in logical order (top to bottom)
4. Use \`input_text(index, "text")\` for each field
5. For contenteditable divs, click first: \`click_element(index)\` then \`input_text(index, "text")\`
6. Submit using \`click_element(submit_index)\`

**Dialog/Modal Handling:**
1. Click button that opens dialog
2. Wait: \`wait(3000)\` for dialog to appear
3. **CRITICAL**: Call \`screenshot_and_html()\` immediately - dialog elements have NEW indexes
4. Interact with dialog elements using new indexes
5. Close or submit dialog

**Search Operations:**
1. Call \`screenshot_and_html()\` to get element indexes
2. Find search input field, note index
3. \`input_text(search_index, "query", true)\` (true = press Enter)
4. Or find search button, note index, \`click_element(button_index)\`
5. Wait for results and verify with \`screenshot_and_html()\`

BEST PRACTICES:

1. **Always Refresh Indexes**: Call \`screenshot_and_html()\` after page changes
2. **Use Indexes, Not Selectors**: Never use CSS selectors - only element indexes
3. **Be Patient**: Wait for pages to load before interacting
4. **Verify Actions**: Always check results with \`screenshot_and_html()\`
5. **Be Systematic**: Follow a consistent workflow for each task

WORKFLOW TEMPLATE:

For any task:
1. **Analyze**: \`screenshot_and_html()\` → Get element indexes and understand page structure
2. **Plan**: Identify elements needed and their current indexes
3. **Execute**: Use element indexes for actions (\`click_element(index)\`, \`input_text(index, text)\`)
4. **Wait**: \`wait(milliseconds)\` for page to respond
5. **Verify**: \`screenshot_and_html()\` → Check if action succeeded
6. **Refresh**: If page changed, get new element indexes
7. **Repeat**: Continue until task complete

REMEMBER:
- Element indexes are numbers (0, 1, 2, 3, ...)
- Indexes may change after page updates - always refresh with \`screenshot_and_html()\`
- Use \`screenshot_and_html()\` liberally to understand page state
- Never use CSS selectors - only element indexes
- The goal is reliable automation. Take time to understand the page before acting.`
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