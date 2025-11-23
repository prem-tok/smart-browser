import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // App information
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // Window controls
  onNewTab: (callback: () => void) => ipcRenderer.on('new-tab', callback),
  onCloseTab: (callback: () => void) => ipcRenderer.on('close-tab', callback),
  onNavigateBack: (callback: () => void) => ipcRenderer.on('navigate-back', callback),
  onNavigateForward: (callback: () => void) => ipcRenderer.on('navigate-forward', callback),
  onReloadPage: (callback: () => void) => ipcRenderer.on('reload-page', callback),
  onShowAbout: (callback: () => void) => ipcRenderer.on('show-about', callback),

  // Remove listeners
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),

  getHiddenWindowSourceId: () => ipcRenderer.invoke('get-hidden-window-source-id'),
  
  // Voice text transmission related APIs
  sendVoiceTextToChat: (text: string) => ipcRenderer.invoke('send-voice-text-to-chat', text),
  onVoiceTextReceived: (callback: (text: string) => void) => ipcRenderer.on('voice-text-received', (_, text) => callback(text)),
  
  // TTS subtitle related APIs
  sendTTSSubtitle: (text: string, isStart: boolean) => ipcRenderer.invoke('send-tts-subtitle', text, isStart),
  onTTSSubtitleReceived: (callback: (text: string, isStart: boolean) => void) => 
    ipcRenderer.on('tts-subtitle-received', (_, text, isStart) => callback(text, isStart)),
  
  // View window controls
  showViewWindow: () => ipcRenderer.invoke('show-view-window'),
  
  // EkoService related APIs
  ekoRun: (message: string) => ipcRenderer.invoke('eko:run', message),
  ekoModify: (taskId: string, message: string) => ipcRenderer.invoke('eko:modify', taskId, message),
  ekoExecute: (taskId: string) => ipcRenderer.invoke('eko:execute', taskId),
  ekoGetTaskStatus: (taskId: string) => ipcRenderer.invoke('eko:getTaskStatus', taskId),
  ekoCancelTask: (taskId: string) => ipcRenderer.invoke('eko:cancel-task', taskId),
  onEkoStreamMessage: (callback: (message: any) => void) => ipcRenderer.on('eko-stream-message', (_, message) => callback(message)),

  // Human interaction APIs
  sendHumanResponse: (response: any) => ipcRenderer.invoke('eko:human-response', response),

  // Task restoration APIs (for continuing conversation from history)
  ekoGetTaskContext: (taskId: string) => ipcRenderer.invoke('eko:get-task-context', taskId),
  ekoRestoreTask: (workflow: any, contextParams?: Record<string, any>, chainPlanRequest?: any, chainPlanResult?: string) =>
    ipcRenderer.invoke('eko:restore-task', workflow, contextParams, chainPlanRequest, chainPlanResult),

  // Model configuration APIs
  getUserModelConfigs: () => ipcRenderer.invoke('config:get-user-configs'),
  saveUserModelConfigs: (configs: any) => ipcRenderer.invoke('config:save-user-configs', configs),
  getModelConfig: (provider: 'deepseek' | 'qwen' | 'google' | 'anthropic' | 'openrouter') => ipcRenderer.invoke('config:get-model-config', provider),
  getApiKeySource: (provider: 'deepseek' | 'qwen' | 'google' | 'anthropic' | 'openrouter') => ipcRenderer.invoke('config:get-api-key-source', provider),
  getSelectedProvider: () => ipcRenderer.invoke('config:get-selected-provider'),
  setSelectedProvider: (provider: 'deepseek' | 'qwen' | 'google' | 'anthropic' | 'openrouter') => ipcRenderer.invoke('config:set-selected-provider', provider),

  // Agent configuration APIs
  getAgentConfig: () => ipcRenderer.invoke('agent:get-config'),
  saveAgentConfig: (config: any) => ipcRenderer.invoke('agent:save-config', config),

  // Human behavior settings APIs
  getHumanBehaviorSettings: () => ipcRenderer.invoke('config:get-human-behavior-settings'),
  saveHumanBehaviorSettings: (settings: any) => ipcRenderer.invoke('config:save-human-behavior-settings', settings),
  updateHumanBehaviorConfig: (settings: any) => ipcRenderer.invoke('config:update-human-behavior-config', settings),
  getMcpTools: () => ipcRenderer.invoke('agent:get-mcp-tools'),
  setMcpToolEnabled: (toolName: string, enabled: boolean) => ipcRenderer.invoke('agent:set-mcp-tool-enabled', toolName, enabled),
  reloadAgentConfig: () => ipcRenderer.invoke('agent:reload-config'),

  // Detail view control APIs
  setDetailViewVisible: (visible: boolean) => ipcRenderer.invoke('set-detail-view-visible', visible),
  navigateDetailView: (url: string) => ipcRenderer.invoke('navigate-detail-view', url),
  positionDetailView: (bounds: { x: number; y: number; width: number; height: number }) => 
    ipcRenderer.invoke('position-detail-view', bounds),
  // URL retrieval and monitoring APIs
  getCurrentUrl: () => ipcRenderer.invoke('get-current-url'),
  onUrlChange: (callback: (url: string) => void) => {
    ipcRenderer.on('url-changed', (_event, url) => callback(url));
  },
  // Screenshot related APIs
  getMainViewScreenshot: () => ipcRenderer.invoke('get-main-view-screenshot'),
  // History view management APIs
  showHistoryView: (screenshot: string) => ipcRenderer.invoke('show-history-view', screenshot),
  hideHistoryView: () => ipcRenderer.invoke('hide-history-view'),

  // Generic invoke method (for scheduler and other new features)
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),

  // Scheduled task execution completion listener
  onTaskExecutionComplete: (callback: (event: any) => void) =>
    ipcRenderer.on('task-execution-complete', (_, event) => callback(event)),

  // Open history panel listener
  onOpenHistoryPanel: (callback: (event: any) => void) =>
    ipcRenderer.on('open-history-panel', (_, event) => callback(event)),

  // Task aborted by system listener
  onTaskAbortedBySystem: (callback: (event: any) => void) =>
    ipcRenderer.on('task-aborted-by-system', (_, event) => callback(event)),

  // Playwright APIs
  playwright: {
    newPage: (windowId: string) => {
      if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
        return Promise.reject(new Error('Invalid windowId: must be a non-empty string (max 100 chars)'));
      }
      return ipcRenderer.invoke('playwright:newPage', windowId);
    },
    closePage: (windowId: string) => {
      if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
        return Promise.reject(new Error('Invalid windowId: must be a non-empty string (max 100 chars)'));
      }
      return ipcRenderer.invoke('playwright:closePage', windowId);
    },
    goto: (windowId: string, url: string) => {
      if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
        return Promise.reject(new Error('Invalid windowId: must be a non-empty string (max 100 chars)'));
      }
      if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
        return Promise.reject(new Error('Invalid url: must be a non-empty string (max 2048 chars)'));
      }
      return ipcRenderer.invoke('playwright:goto', windowId, url);
    },
    listElements: (windowId: string, selector?: string, options?: { limit?: number }) => {
      if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
        return Promise.reject(new Error('Invalid windowId: must be a non-empty string (max 100 chars)'));
      }
      if (selector !== undefined && (typeof selector !== 'string' || selector.length > 1000)) {
        return Promise.reject(new Error('Invalid selector: must be a string (max 1000 chars) or undefined'));
      }
      return ipcRenderer.invoke('playwright:listElements', windowId, selector, options);
    },
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
    }) => {
      if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
        return Promise.reject(new Error('Invalid windowId: must be a non-empty string (max 100 chars)'));
      }
      if (typeof selector !== 'string' || selector.length === 0 || selector.length > 1000) {
        return Promise.reject(new Error('Invalid selector: must be a non-empty string (max 1000 chars)'));
      }
      // Validate humanOptions if provided
      if (options?.humanOptions) {
        const ho = options.humanOptions;
        if (ho.steps !== undefined && (typeof ho.steps !== 'number' || ho.steps < 1 || ho.steps > 100)) {
          return Promise.reject(new Error('humanOptions.steps must be a number between 1 and 100'));
        }
        if (ho.jitter !== undefined && (typeof ho.jitter !== 'number' || ho.jitter < 0 || ho.jitter > 20)) {
          return Promise.reject(new Error('humanOptions.jitter must be a number between 0 and 20'));
        }
        if (ho.minDelay !== undefined && (typeof ho.minDelay !== 'number' || ho.minDelay < 0 || ho.minDelay > 1000)) {
          return Promise.reject(new Error('humanOptions.minDelay must be a number between 0 and 1000'));
        }
        if (ho.maxDelay !== undefined && (typeof ho.maxDelay !== 'number' || ho.maxDelay < 0 || ho.maxDelay > 1000)) {
          return Promise.reject(new Error('humanOptions.maxDelay must be a number between 0 and 1000'));
        }
        if (ho.moveStrategy !== undefined && ho.moveStrategy !== 'bezier' && ho.moveStrategy !== 'linear') {
          return Promise.reject(new Error('humanOptions.moveStrategy must be "bezier" or "linear"'));
        }
      }
      return ipcRenderer.invoke('playwright:click', windowId, selector, options);
    },
    type: (windowId: string, selector: string, text: string, options?: { 
      timeout?: number; 
      humanized?: boolean;
      typeOptions?: {
        minDelay?: number;
        maxDelay?: number;
        clearFirst?: boolean;
        perCharJitter?: boolean;
      }
    }) => {
      if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
        return Promise.reject(new Error('Invalid windowId: must be a non-empty string (max 100 chars)'));
      }
      if (typeof selector !== 'string' || selector.length === 0 || selector.length > 1000) {
        return Promise.reject(new Error('Invalid selector: must be a non-empty string (max 1000 chars)'));
      }
      if (typeof text !== 'string' || text.length === 0 || text.length > 10000) {
        return Promise.reject(new Error('Invalid text: must be a non-empty string (max 10000 chars)'));
      }
      // Validate typeOptions if provided
      if (options?.typeOptions) {
        const to = options.typeOptions;
        if (to.minDelay !== undefined && (typeof to.minDelay !== 'number' || to.minDelay < 0 || to.minDelay > 1000)) {
          return Promise.reject(new Error('typeOptions.minDelay must be a number between 0 and 1000'));
        }
        if (to.maxDelay !== undefined && (typeof to.maxDelay !== 'number' || to.maxDelay < 0 || to.maxDelay > 1000)) {
          return Promise.reject(new Error('typeOptions.maxDelay must be a number between 0 and 1000'));
        }
      }
      return ipcRenderer.invoke('playwright:type', windowId, selector, text, options);
    },
    screenshot: (windowId: string, options?: { fullPage?: boolean }) => {
      if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
        return Promise.reject(new Error('Invalid windowId: must be a non-empty string (max 100 chars)'));
      }
      return ipcRenderer.invoke('playwright:screenshot', windowId, options);
    },
    getDomSnapshot: (windowId: string, options?: { selector?: string }) => {
      if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
        return Promise.reject(new Error('Invalid windowId: must be a non-empty string (max 100 chars)'));
      }
      if (options?.selector !== undefined && (typeof options.selector !== 'string' || options.selector.length > 1000)) {
        return Promise.reject(new Error('Invalid selector: must be a string (max 1000 chars) or undefined'));
      }
      return ipcRenderer.invoke('playwright:getDomSnapshot', windowId, options);
    },
    waitForPopup: (windowId: string, options?: { timeout?: number; popupSelector?: string }) => {
      if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
        return Promise.reject(new Error('Invalid windowId: must be a non-empty string (max 100 chars)'));
      }
      if (options?.timeout !== undefined && (typeof options.timeout !== 'number' || options.timeout < 1000 || options.timeout > 30000)) {
        return Promise.reject(new Error('Invalid timeout: must be a number between 1000 and 30000'));
      }
      if (options?.popupSelector !== undefined && (typeof options.popupSelector !== 'string' || options.popupSelector.length > 1000)) {
        return Promise.reject(new Error('Invalid popupSelector: must be a string (max 1000 chars) or undefined'));
      }
      return ipcRenderer.invoke('playwright:waitForPopup', windowId, options);
    }
  }

}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
} 
