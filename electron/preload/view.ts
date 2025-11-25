import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

console.log("view preload");

(function () {
  'use strict';

  // Save original methods before overriding them
  (globalThis as any).Element.prototype._addEventListener = (globalThis as any).Element.prototype.addEventListener;
  (globalThis as any).Element.prototype._removeEventListener = (globalThis as any).Element.prototype.removeEventListener;

  /**
   * Add event listener
   * @param {[type]}  type       [Event type, e.g.: click]
   * @param {[type]}  listener   [Execution function]
   * @param {Boolean} useCapture [Trigger type, true=event executes in capture phase, false=bubbling phase]
   * @param {string} notes Optional, note text for event description, useful for distinguishing same events/functions for different features
   */
  (globalThis as any).Element.prototype.addEventListener = function (type: any, listener: any, useCapture = false, notes?: any) {
      // Declare event listener
      this._addEventListener(type, listener, useCapture);

      if (!this.eventListenerList) this.eventListenerList = {};
      if (!this.eventListenerList[type]) this.eventListenerList[type] = [];

      // Add listener to event tracking list
      this.eventListenerList[type].push({ type, listener, useCapture, notes });
  };

  /**
   * Remove event listener
   * @param  {[type]}  type       [Event type, e.g.: click]
   * @param  {[type]}  listener   [Execution function]
   * @param  {Boolean} useCapture [Trigger type]
   * @return {[type]}             [description]
   */
  (globalThis as any).Element.prototype.removeEventListener = function (type: any, listener: any, useCapture = false) {
      // Remove listener

      this._removeEventListener(type, listener, useCapture);

      if (!this.eventListenerList) this.eventListenerList = {};
      if (!this.eventListenerList[type]) this.eventListenerList[type] = [];

      // Find event in the list, if listener registered twice (with and without capture), remove each one separately.

      for (let i = 0; i < this.eventListenerList[type].length; i++) {
          if (this.eventListenerList[type][i].listener === listener && this.eventListenerList[type][i].useCapture === useCapture) {
              this.eventListenerList[type].splice(i, 1);
              break;
          }
      }
      // If no more events of deleted event type remain, delete the group
      if (this.eventListenerList[type].length == 0) delete this.eventListenerList[type];
  };


  /**
   * [Get event listeners]
   * @param  {[type]} type [Event type]
   * @return {[type]}      [Return all events of target]
   */
  (globalThis as any).Element.prototype.getEventListeners = function (type?: any) {
      if (!this.eventListenerList) this.eventListenerList = {};

      // Return required listener type or all listeners
      if (type === undefined) return this.eventListenerList;
      return this.eventListenerList[type];
  };

})();


// Custom APIs for renderer
const api = {
  // App information
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getPlatform: () => ipcRenderer.invoke("get-platform"),

  // Window controls
  onNewTab: (callback: () => void) => ipcRenderer.on("new-tab", callback),
  onCloseTab: (callback: () => void) => ipcRenderer.on("close-tab", callback),
  onNavigateBack: (callback: () => void) =>
    ipcRenderer.on("navigate-back", callback),
  onNavigateForward: (callback: () => void) =>
    ipcRenderer.on("navigate-forward", callback),
  onReloadPage: (callback: () => void) =>
    ipcRenderer.on("reload-page", callback),
  onShowAbout: (callback: () => void) => ipcRenderer.on("show-about", callback),

  // Remove listeners
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
  getHiddenWindowSourceId: () => ipcRenderer.invoke('get-hidden-window-source-id'),
  showViewWindow: () => ipcRenderer.invoke('show-view-window'),
  hideViewWindow: () => ipcRenderer.invoke('hide-view-window'),

    // Voice text transmission related APIs
    sendVoiceTextToChat: (text: string) => ipcRenderer.invoke('send-voice-text-to-chat', text),
    onVoiceTextReceived: (callback: (text: string) => void) => ipcRenderer.on('voice-text-received', (_, text) => callback(text)),

      // TTS subtitle related APIs
  sendTTSSubtitle: (text: string, isStart: boolean) => ipcRenderer.invoke('send-tts-subtitle', text, isStart),
  onTTSSubtitleReceived: (callback: (text: string, isStart: boolean) => void) => 
    ipcRenderer.on('tts-subtitle-received', (_, text, isStart) => callback(text, isStart)),
  getMainViewWindowNumber: () => ipcRenderer.invoke('get-main-view-window-number'),
  captureWindow: (winNo: number, scale = 1) => ipcRenderer.invoke('native:captureWindow', winNo, scale),
  captureWindowSync: (winNo: number, scale = 1) => ipcRenderer.sendSync('native:captureWindow:sync', winNo, scale),
  requestCapturePermission: () => ipcRenderer.invoke('native:requestCapturePermission'),
  onFileUpdated: (callback: (status: string, content: string) => void) => ipcRenderer.on('file-updated', (_, status, content) => callback(status, content)),

  // Generic invoke method (for config and other features)
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}

// Debounce mechanism to prevent polling loops
let lastCallTime = 0;
let lastCallFunc = '';
let lastResult: any = null;
const DEBOUNCE_MS = 10000; // Minimum 10 seconds between identical calls (increased to reduce redundancy)
const URL_TITLE_CHECK_DEBOUNCE_MS = 30000; // 30 seconds for URL/title checks (aggressive debounce to prevent polling)

// Helper to detect if function is checking URL/title
function isUrlTitleCheck(funcString: string): boolean {
  return funcString.includes('window.location.href') || 
         funcString.includes('window.document.title') ||
         funcString.includes('location.href') ||
         funcString.includes('document.title');
}

// Helper function to enhance element detection for dialogs/modals
// This ensures input fields in Gmail compose and other dialogs are detected
function enhanceElementDetection(elements: any): any {
  if (!elements || typeof elements !== 'object') return elements;
  
  // If elements is an object with numeric keys (like BrowserAgent's format)
  const elementArray = Object.values(elements);
  
  // Check if we're missing input fields - check both direct properties and attributes
  const hasInputFields = elementArray.some((el: any) => {
    const tagName = el?.tagName?.toLowerCase();
    const role = el?.role || el?.attributes?.role;
    const contenteditable = el?.attributes?.contenteditable || el?.contenteditable;
    
    return tagName === 'input' || 
           tagName === 'textarea' || 
           contenteditable === 'true' ||
           role === 'textbox' ||
           (tagName === 'div' && contenteditable === 'true');
  });
  
    // Always try to find input fields in dialogs/modals (especially for Gmail)
    // Gmail compose uses contenteditable divs which might not be detected
    try {
      // Find all dialogs/modals (Gmail compose is usually in a dialog)
      // Gmail compose dialog has specific patterns - be more aggressive in finding it
      // CRITICAL: After clicking compose, the dialog appears dynamically - we MUST find it
      const dialogSelectors = [
        'div[role="dialog"]',
        'div[role="dialog"][aria-label*="compose" i]',
        'div[role="dialog"][aria-label*="New Message" i]',
        'div[role="dialog"][aria-label*="Message" i]',
        'div[aria-label*="compose" i]',
        'div[aria-label*="Compose" i]',
        'div[aria-label*="New Message" i]',
        'div[aria-label*="Message" i]',
        '[class*="compose"]',
        '[class*="Compose"]',
        '[class*="message"]',
        '[class*="Message"]',
        '.modal',
        '[class*="dialog"]',
        '[class*="modal"]',
        // Gmail-specific patterns
        'div[data-tooltip*="compose" i]',
        'div[data-tooltip*="Compose" i]',
        '[data-testid*="compose"]',
        '[data-testid*="Compose"]'
      ];
    
    const dialogs = new Set<Element>();
    dialogSelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(el => dialogs.add(el));
      } catch (e) {
        // Ignore selector errors
      }
    });
    
      // Also check for Gmail compose fields directly (they might be outside dialogs)
      // Gmail compose fields have very specific patterns
      const gmailComposeSelectors = [
        'div[aria-label*="To" i]',
        'div[aria-label*="Recipients" i]',
        'div[aria-label*="Subject" i]',
        'div[aria-label*="Message" i]',
        'div[aria-label*="Body" i]',
        'div[contenteditable="true"][aria-label*="To" i]',
        'div[contenteditable="true"][aria-label*="Subject" i]',
        'div[contenteditable="true"][aria-label*="Message" i]',
        'div[role="textbox"][aria-label*="To" i]',
        'div[role="textbox"][aria-label*="Subject" i]',
        'div[role="textbox"][aria-label*="Message" i]'
      ];
      
      // Add Gmail compose fields even if not in a dialog
      gmailComposeSelectors.forEach(selector => {
        try {
          document.querySelectorAll(selector).forEach(el => dialogs.add(el));
        } catch (e) {
          // Ignore selector errors
        }
      });
      
      let addedCount = 0;
      dialogs.forEach((dialog) => {
      // Check if dialog is visible
      const rect = dialog.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return; // Skip invisible dialogs
      }
      
      // Find all possible input fields - including contenteditable divs (Gmail uses these)
      // Gmail compose uses specific aria-labels: "To", "Subject", "Message body"
      const inputSelectors = [
        'input',
        'textarea',
        '[contenteditable="true"]',
        '[role="textbox"]',
        'div[contenteditable="true"]',
        'div[contenteditable]',
        // Gmail-specific patterns
        'div[aria-label*="To" i]',
        'div[aria-label*="Recipients" i]',
        'div[aria-label*="Subject" i]',
        'div[aria-label*="Message" i]',
        'div[aria-label*="Body" i]',
        // More generic patterns for contenteditable fields
        'div[contenteditable="true"][aria-label]',
        'div[contenteditable="true"][role="textbox"]'
      ];
      
      const inputs = new Set<Element>();
      inputSelectors.forEach(selector => {
        try {
          dialog.querySelectorAll(selector).forEach(el => inputs.add(el));
        } catch (e) {
          // Ignore selector errors
        }
      });
      
      inputs.forEach((input) => {
        const rect = input.getBoundingClientRect();
        // Check if element is visible and has reasonable size
        // For Gmail compose, fields might be small initially, so use lower threshold
        if (rect.width > 5 && rect.height > 5 && rect.top >= 0 && rect.left >= 0) {
          // Add to elements if not already present
          const xpath = getXPath(input);
          const exists = elementArray.some((el: any) => el?.xpath === xpath);
          
          if (!exists) {
            const newIndex = Object.keys(elements).length;
            const tagName = input.tagName.toLowerCase();
            const ariaLabel = input.getAttribute('aria-label') || '';
            const placeholder = (input as HTMLInputElement).placeholder || '';
            const contenteditable = input.getAttribute('contenteditable');
            
            // Create enhanced element descriptor
            (elements as any)[newIndex] = {
              tagName: tagName,
              xpath: xpath,
              highlightIndex: newIndex,
              attributes: {
                type: (input as HTMLInputElement).type || undefined,
                placeholder: placeholder || undefined,
                name: (input as HTMLInputElement).name || undefined,
                id: input.id || undefined,
                role: input.getAttribute('role') || undefined,
                'aria-label': ariaLabel || undefined,
                contenteditable: contenteditable || undefined,
                class: input.className || undefined
              },
              isVisible: true,
              isInteractive: true,
              isTopElement: true,
              shadowRoot: false,
              children: [],
              parent: null,
              // Add helpful labels for AI
              innerText: ariaLabel || placeholder || (tagName === 'div' && contenteditable === 'true' ? 'Contenteditable div' : '') || ''
            };
            
            addedCount++;
            // Silently add - no logging to reduce noise
          }
        }
      });
    });
    
    // Silently enhance - no logging to reduce noise
  } catch (e) {
    console.error('[View] Error enhancing element detection:', e);
  }
  
  return elements;
}

// Helper to generate XPath for an element
function getXPath(element: Element): string {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }
  if (element === document.body) {
    return '/html/body';
  }
  
  let ix = 0;
  const siblings = element.parentNode?.childNodes || [];
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i] as Element;
    if (sibling === element) {
      return getXPath(element.parentNode as Element) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
    }
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
      ix++;
    }
  }
  return '';
}

ipcRenderer.on("call-view-func", async (_event, { payload, replyChannel }) => {
  const now = Date.now();
  const funcString = payload.func || '';
  const isUrlTitle = isUrlTitleCheck(funcString);
  
  // Use longer debounce for URL/title checks (most common polling pattern)
  const debounceWindow = isUrlTitle ? URL_TITLE_CHECK_DEBOUNCE_MS : DEBOUNCE_MS;
  
  // Check if this is a duplicate call (same function, called within debounce window)
  const isDuplicate = funcString === lastCallFunc && (now - lastCallTime) < debounceWindow;
  
  if (isDuplicate && lastResult) {
    // Return cached result for duplicate calls within debounce window
    if (isUrlTitle) {
      // Silently return cached result for URL/title checks to reduce log noise
      ipcRenderer.send(replyChannel, lastResult);
    } else {
      console.log("call-view-func (cached, debounced)", lastResult);
      ipcRenderer.send(replyChannel, lastResult);
    }
    return;
  }

  let func;
  try {
    // @ts-ignore (define in dts) Use eval to maintain execution context
    func = window.eval(`(${funcString})`);
  } catch (e: any) {
    console.error("Failed to deserialize function:", e);
    ipcRenderer.send(replyChannel, { error: e.message });
    return;
  }

  let result;
  try {
    // @ts-ignore (define in dts)
    result = await func(...payload.args);
    
    // Enhance element detection if result contains elements
    // Check if this looks like an element detection result (object with numeric keys)
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      const keys = Object.keys(result);
      // If it has numeric keys (like '0', '1', '2', etc.), it's likely element detection
      const hasNumericKeys = keys.length > 0 && keys.every(key => /^\d+$/.test(key));
      if (hasNumericKeys) {
        // Silently enhance - no logging
        result = enhanceElementDetection(result);
      }
    }
  } catch (e: any) {
    result = { error: e.message };
  }

  // Cache result and update tracking
  lastCallTime = now;
  lastCallFunc = funcString;
  lastResult = result;

  // Completely disable all logging for call-view-func results
  // This prevents verbose logs that clutter the console and slow down browser automation
  // Only log errors (which are handled above)

  ipcRenderer.send(replyChannel, result);
});