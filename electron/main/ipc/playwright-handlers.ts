/**
 * Playwright IPC Handlers
 * Secure IPC endpoints for Playwright operations
 */

import { ipcMain } from 'electron';
import {
  newPage,
  closePage,
  goto,
  listElements,
  click,
  type as typeText,
  screenshot,
  getDomSnapshot,
  waitForPopup,
  type ApiResponse
} from '../../playwrightController';
import log from 'electron-log';

/**
 * Validate IPC arguments
 */
function validateArgs(args: any[], expectedLength: number, validators: Array<(arg: any) => boolean>): boolean {
  if (!Array.isArray(args) || args.length !== expectedLength) {
    return false;
  }
  
  for (let i = 0; i < validators.length; i++) {
    if (!validators[i](args[i])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Register all Playwright IPC handlers
 */
export function registerPlaywrightHandlers(): void {
  // playwright:newPage
  ipcMain.handle('playwright:newPage', async (_event, ...args: any[]): Promise<ApiResponse> => {
    if (!validateArgs(args, 1, [arg => typeof arg === 'string' && arg.length > 0 && arg.length <= 100])) {
      log.warn('[Playwright IPC] Invalid arguments for newPage:', args);
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'Invalid arguments: windowId must be a non-empty string (max 100 chars)' }
      };
    }
    
    const [windowId] = args;
    return await newPage(windowId);
  });
  
  // playwright:closePage
  ipcMain.handle('playwright:closePage', async (_event, ...args: any[]): Promise<ApiResponse> => {
    if (!validateArgs(args, 1, [arg => typeof arg === 'string' && arg.length > 0 && arg.length <= 100])) {
      log.warn('[Playwright IPC] Invalid arguments for closePage:', args);
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'Invalid arguments: windowId must be a non-empty string (max 100 chars)' }
      };
    }
    
    const [windowId] = args;
    return await closePage(windowId);
  });
  
  // playwright:goto
  ipcMain.handle('playwright:goto', async (_event, ...args: any[]): Promise<ApiResponse> => {
    if (!validateArgs(args, 2, [
      arg => typeof arg === 'string' && arg.length > 0 && arg.length <= 100,
      arg => typeof arg === 'string' && arg.length > 0 && arg.length <= 2048
    ])) {
      log.warn('[Playwright IPC] Invalid arguments for goto:', args);
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'Invalid arguments: windowId and url must be non-empty strings' }
      };
    }
    
    const [windowId, url] = args;
    return await goto(windowId, url);
  });
  
  // playwright:listElements
  ipcMain.handle('playwright:listElements', async (_event, ...args: any[]): Promise<ApiResponse> => {
    if (!Array.isArray(args) || args.length < 1 || args.length > 2) {
      log.warn('[Playwright IPC] Invalid arguments for listElements:', args);
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'Invalid arguments: expected [windowId, selector?]' }
      };
    }
    
    const [windowId, selector] = args;
    
    if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'windowId must be a non-empty string (max 100 chars)' }
      };
    }
    
    if (selector !== undefined && (typeof selector !== 'string' || selector.length > 1000)) {
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'selector must be a string (max 1000 chars) or undefined' }
      };
    }
    
    const options = args.length === 3 && typeof args[2] === 'object' ? args[2] : undefined;
    return await listElements(windowId, selector, options);
  });
  
  // playwright:click
  ipcMain.handle('playwright:click', async (_event, ...args: any[]): Promise<ApiResponse> => {
    if (!Array.isArray(args) || args.length < 2 || args.length > 3) {
      log.warn('[Playwright IPC] Invalid arguments for click:', args);
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'Invalid arguments: expected [windowId, selector, options?]' }
      };
    }
    
    const [windowId, selector] = args;
    
    if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'windowId must be a non-empty string (max 100 chars)' }
      };
    }
    
    if (typeof selector !== 'string' || selector.length === 0 || selector.length > 1000) {
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'selector must be a non-empty string (max 1000 chars)' }
      };
    }
    
    const options = args.length === 3 && typeof args[2] === 'object' ? args[2] : undefined;
    return await click(windowId, selector, options);
  });
  
  // playwright:type
  ipcMain.handle('playwright:type', async (_event, ...args: any[]): Promise<ApiResponse> => {
    if (!Array.isArray(args) || args.length < 3 || args.length > 4) {
      log.warn('[Playwright IPC] Invalid arguments for type:', args);
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'Invalid arguments: expected [windowId, selector, text, options?]' }
      };
    }
    
    const [windowId, selector, text] = args;
    
    if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'windowId must be a non-empty string (max 100 chars)' }
      };
    }
    
    if (typeof selector !== 'string' || selector.length === 0 || selector.length > 1000) {
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'selector must be a non-empty string (max 1000 chars)' }
      };
    }
    
    if (typeof text !== 'string' || text.length === 0 || text.length > 10000) {
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'text must be a non-empty string (max 10000 chars)' }
      };
    }
    
    const options = args.length === 4 && typeof args[3] === 'object' ? args[3] : undefined;
    return await typeText(windowId, selector, text, options);
  });
  
  // playwright:screenshot
  ipcMain.handle('playwright:screenshot', async (_event, ...args: any[]): Promise<ApiResponse> => {
    if (!Array.isArray(args) || args.length < 1 || args.length > 2) {
      log.warn('[Playwright IPC] Invalid arguments for screenshot:', args);
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'Invalid arguments: expected [windowId, options?]' }
      };
    }
    
    const [windowId] = args;
    
    if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'windowId must be a non-empty string (max 100 chars)' }
      };
    }
    
    const options = args.length === 2 && typeof args[1] === 'object' ? args[1] : undefined;
    return await screenshot(windowId, options);
  });
  
  // playwright:getDomSnapshot
  ipcMain.handle('playwright:getDomSnapshot', async (_event, ...args: any[]): Promise<ApiResponse> => {
    if (!Array.isArray(args) || args.length < 1 || args.length > 2) {
      log.warn('[Playwright IPC] Invalid arguments for getDomSnapshot:', args);
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'Invalid arguments: expected [windowId, options?]' }
      };
    }
    
    const [windowId] = args;
    
    if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'windowId must be a non-empty string (max 100 chars)' }
      };
    }
    
    const options = args.length === 2 && typeof args[1] === 'object' ? args[1] : undefined;
    return await getDomSnapshot(windowId, options);
  });
  
  // playwright:waitForPopup
  ipcMain.handle('playwright:waitForPopup', async (_event, ...args: any[]): Promise<ApiResponse> => {
    if (!Array.isArray(args) || args.length < 1 || args.length > 2) {
      log.warn('[Playwright IPC] Invalid arguments for waitForPopup:', args);
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'Invalid arguments: expected [windowId, options?]' }
      };
    }
    
    const [windowId] = args;
    
    if (typeof windowId !== 'string' || windowId.length === 0 || windowId.length > 100) {
      return {
        ok: false,
        error: { code: 'INVALID_ARG', message: 'windowId must be a non-empty string (max 100 chars)' }
      };
    }
    
    const options = args.length === 2 && typeof args[1] === 'object' ? args[1] : undefined;
    return await waitForPopup(windowId, options);
  });
  
  log.info('[Playwright IPC] All Playwright IPC handlers registered');
}

