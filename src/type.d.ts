// Supported providers
export type ProviderType = 'deepseek' | 'qwen' | 'google' | 'anthropic' | 'openai' | 'openrouter';

// Model configuration types
export interface UserModelConfigs {
  deepseek?: {
    apiKey?: string
    baseURL?: string
    model?: string
  }
  qwen?: {
    apiKey?: string
    model?: string
  }
  google?: {
    apiKey?: string
    model?: string
  }
  anthropic?: {
    apiKey?: string
    model?: string
  }
  openai?: {
    apiKey?: string
    model?: string
  }
  openrouter?: {
    apiKey?: string
    model?: string
  }
  selectedProvider?: ProviderType
}

// Agent configuration types
export interface AgentConfig {
  browserAgent: {
    enabled: boolean
    customPrompt: string
  }
  fileAgent: {
    enabled: boolean
    customPrompt: string
  }
  mcpTools: {
    [toolName: string]: {
      enabled: boolean
      config?: Record<string, any>
    }
  }
}

// MCP Tool types
export interface McpToolSchema {
  name: string
  description: string
  enabled: boolean
  inputSchema: {
    type: string
    properties: Record<string, any>
    required: string[]
  }
}

declare global {
  interface Window {
    api: {
      sendToMainViewExecuteCode: (func: string, args: any[]) => Promise<any>
      navigateTo: (url: string) => Promise<{ url: string; title: string }>
      getMainViewSize: () => Promise<{ width: number; height: number }>
      getMainViewScreenshot: () => Promise<{ imageBase64: string; imageType: "image/jpeg" | "image/png" }>
      getMainViewUrlAndTitle: () => Promise<{ url: string; title: string }>
      getHiddenWindowSourceId: () => Promise<string>
      showViewWindow: () => Promise<void>
      hideViewWindow: () => Promise<void>
      sendVoiceTextToChat: (text: string) => Promise<void>
      onVoiceTextReceived: (callback: (text: string) => void) => void
      sendTTSSubtitle: (text: string, isStart: boolean) => Promise<boolean>
      onTTSSubtitleReceived: (callback: (text: string, isStart: boolean) => void) => void
      removeAllListeners: (channel: string) => void,
      getMainViewWindowNumber: () => Promise<number>
      captureWindow: (winNo: number, scale?: number) => Promise<{ width: number; height: number; stride: number; data: Buffer; error?: string }>
      captureWindowSync: (winNo: number, scale?: number) => { width: number; height: number; stride: number; data: Buffer; error?: string }
      requestCapturePermission: () => Promise<boolean>
      ekoRun: (prompt: string) => Promise<any>
      ekoModify: (taskId: string, prompt: string) => Promise<any>
      ekoExecute: (taskId: string) => Promise<any>
      onEkoStreamMessage: (callback: (message: any) => void) => void
      ekoGetTaskStatus: (taskId: string) => Promise<any>
      ekoCancelTask: (taskId: string) => Promise<any>
      sendHumanResponse: (response: any) => Promise<{ success: boolean }>

      // Model configuration APIs
      getUserModelConfigs: () => Promise<UserModelConfigs>
      saveUserModelConfigs: (configs: UserModelConfigs) => Promise<{ success: boolean }>
      getModelConfig: (provider: ProviderType) => Promise<any>
      getApiKeySource: (provider: ProviderType) => Promise<'user' | 'env' | 'none'>
      getSelectedProvider: () => Promise<ProviderType>
      setSelectedProvider: (provider: ProviderType) => Promise<{ success: boolean }>

      // Agent configuration APIs
      getAgentConfig: () => Promise<{ success: boolean; data: AgentConfig }>
      saveAgentConfig: (config: AgentConfig) => Promise<{ success: boolean }>
      getMcpTools: () => Promise<{ success: boolean; data: McpToolSchema[] }>
      setMcpToolEnabled: (toolName: string, enabled: boolean) => Promise<{ success: boolean }>

      // Human behavior settings APIs
      getHumanBehaviorSettings: () => Promise<{ success: boolean; data: any }>
      saveHumanBehaviorSettings: (settings: any) => Promise<{ success: boolean; error?: string }>
      updateHumanBehaviorConfig: (settings: any) => Promise<{ success: boolean; error?: string }>
      reloadAgentConfig: () => Promise<{ success: boolean; data: AgentConfig }>

      // Detail view control APIs
      setDetailViewVisible: (visible: boolean) => Promise<{ success: boolean; visible: boolean }>
      navigateDetailView: (url: string) => Promise<{ success: boolean; url: string }>
      getCurrentUrl: () => Promise<string>
      positionDetailView: (bounds: { x: number; y: number; width: number; height: number }) => Promise<{ success: boolean; bounds: { x: number; y: number; width: number; height: number } }>
      onUrlChange: (callback: (url: string) => void) => void
      getMainViewScreenshot: () => Promise<{ imageBase64: string; imageType: "image/jpeg" | "image/png" }>
      showHistoryView: (screenshot: string) => Promise<{ success: boolean }>
      hideHistoryView: () => Promise<{ success: boolean }>

      // Playwright APIs
      playwright: {
        newPage: (windowId: string) => Promise<{ ok: boolean; data?: { windowId: string; url: string }; error?: { code: string; message: string } }>
        closePage: (windowId: string) => Promise<{ ok: boolean; data?: null; error?: { code: string; message: string } }>
        goto: (windowId: string, url: string) => Promise<{ ok: boolean; data?: { windowId: string; url: string }; error?: { code: string; message: string } }>
        listElements: (windowId: string, selector?: string, options?: { limit?: number }) => Promise<{ ok: boolean; data?: Array<{ index?: number; selector: string; innerText: string; boundingBox: { x: number; y: number; width: number; height: number } | null; tagName?: string; type?: string; role?: string; ariaLabel?: string; name?: string; id?: string; className?: string; href?: string; placeholder?: string; isVisible?: boolean; isEnabled?: boolean; isClickable?: boolean; suggestedSelector?: string; label?: string }>; error?: { code: string; message: string } }>
        click: (windowId: string, selector: string, options?: { 
          timeout?: number; 
          humanized?: boolean; 
          humanOptions?: {
            steps?: number;
            jitter?: number;
            minDelay?: number;
            maxDelay?: number;
            moveStrategy?: 'bezier' | 'linear';
            safety?: { maxSteps?: number; maxDurationMs?: number };
            forceRaw?: boolean;
          }
        }) => Promise<{ ok: boolean; data?: null; error?: { code: string; message: string } }>
        type: (windowId: string, selector: string, text: string, options?: { 
          timeout?: number; 
          humanized?: boolean;
          typeOptions?: {
            minDelay?: number;
            maxDelay?: number;
            clearFirst?: boolean;
            perCharJitter?: boolean;
          }
        }) => Promise<{ ok: boolean; data?: null; error?: { code: string; message: string } }>
        screenshot: (windowId: string, options?: { fullPage?: boolean }) => Promise<{ ok: boolean; data?: { imageBase64: string; width: number; height: number }; error?: { code: string; message: string } }>
        getDomSnapshot: (windowId: string, options?: { selector?: string }) => Promise<{ ok: boolean; data?: string; error?: { code: string; message: string } }>
        waitForPopup: (windowId: string, options?: { timeout?: number; popupSelector?: string }) => Promise<{ ok: boolean; data?: { found: boolean; selector?: string }; error?: { code: string; message: string } }>
        screenshotAndHtml: (windowId: string, options?: { 
          fullPage?: boolean;
          labelScreenshot?: boolean;
          labelStyle?: {
            fontSize?: number;
            backgroundColor?: string;
            textColor?: string;
            borderColor?: string;
            borderWidth?: number;
            padding?: number;
            borderRadius?: number;
          };
        }) => Promise<{ ok: boolean; data?: { screenshot: string; elements: Array<{ index: number; selector: string; innerText: string; boundingBox: { x: number; y: number; width: number; height: number } | null; tagName?: string; type?: string; role?: string; ariaLabel?: string; name?: string; id?: string; className?: string; href?: string; placeholder?: string; isVisible?: boolean; isEnabled?: boolean; isClickable?: boolean; suggestedSelector?: string; label?: string }>; html?: string; visionAnalysis?: { pageType: 'email' | 'form' | 'ecommerce' | 'social' | 'search' | 'unknown'; primaryActions: Array<{ elementIndex: number; action: 'click' | 'type' | 'scroll'; confidence: number; description: string }>; formFields: Array<{ elementIndex: number; fieldType: 'email' | 'password' | 'text' | 'textarea' | 'phone' | 'url'; label: string; required: boolean; placeholder?: string }>; context: { pageTitle: string; mainContent: string; suggestedActions: string[]; keyElements: string[] }; confidence: number } }; error?: { code: string; message: string } }>
        clickElementByIndex: (windowId: string, index: number, options?: { 
          timeout?: number; 
          humanized?: boolean; 
          humanOptions?: {
            steps?: number;
            jitter?: number;
            minDelay?: number;
            maxDelay?: number;
            moveStrategy?: 'bezier' | 'linear';
            safety?: { maxSteps?: number; maxDurationMs?: number };
            forceRaw?: boolean;
          }
        }) => Promise<{ ok: boolean; data?: null; error?: { code: string; message: string } }>
        inputTextByIndex: (windowId: string, index: number, text: string, options?: { 
          timeout?: number; 
          humanized?: boolean;
          typeOptions?: {
            minDelay?: number;
            maxDelay?: number;
            clearFirst?: boolean;
            perCharJitter?: boolean;
          };
          enter?: boolean;
        }) => Promise<{ ok: boolean; data?: null; error?: { code: string; message: string } }>
      }
    }
    // PDF.js type declarations
    pdfjsLib?: {
      GlobalWorkerOptions: {
        workerSrc: string;
      };
      getDocument: (params: any) => {
        promise: Promise<{
          numPages: number;
          getPage: (pageNum: number) => Promise<{
            getTextContent: () => Promise<{
              items: Array<{ str: string; [key: string]: any }>;
            }>;
          }>;
        }>;
      };
    };
  }
}

export {} 