import { app, BrowserWindow, clipboard, Menu, shell, WebContentsView } from 'electron';
import path from 'node:path';
import { isDev } from '../utils/constants';
import { store } from '../utils/store';
import { registerClientProtocol } from '../utils/protocol';

interface VideoUrlInfo {
  videoUrl: string;
  timestamp: number;
  platform: string;
}

export function createView(rendererURL: string, preloadFileName: string, id?: string) {
  console.log('Creating window with URL:', rendererURL);

  const bounds = store.get('bounds');
  console.log('restored bounds:', bounds);

  const preloadPath = isDev ? path.join(app.getAppPath(), '..', 'preload', `${preloadFileName}.cjs`) : path.join(app.getAppPath(),'dist', 'electron', 'preload', `${preloadFileName}.cjs`);

  console.log('preload path:', preloadPath);
  const mainView = new WebContentsView({
    webPreferences: {
      preload: preloadPath,
      contextIsolation: false,
      partition: `persist:detail-view-${id}`, // Key
      webSecurity: true, // Allow custom protocols
    },
  });

  // Register client protocol for current view's session (check if already registered to avoid duplicates)
  try {
    // Check if protocol is already registered
    const session = mainView.webContents.session;
    const isRegistered = session.protocol.isProtocolHandled('client');

    if (!isRegistered) {
      registerClientProtocol(session.protocol);
      console.log('[View] Client protocol registered for partition:', id);
    } else {
      console.log('[View] Client protocol already registered for partition:', id);
    }
  } catch (error) {
    console.error('[View] Failed to register protocol:', error);
  }

  // Set zoom factor immediately and on all navigation events
  const setZoom = () => {
    try {
      mainView.webContents.setZoomFactor(0.7); // 130% zoom (30% zoom in)
      console.log(`[View] Zoom factor set to 0.7 for ${preloadFileName}`);
    } catch (error) {
      console.error(`[View] Failed to set zoom factor:`, error);
    }
  };

  // Set zoom immediately
  setZoom();

  // Set zoom on page load
  mainView.webContents.on("did-finish-load", () => {
    console.log(`${preloadFileName} did-finish-load`);
    setZoom();
  });

  // Set zoom on navigation
  mainView.webContents.on('did-navigate', () => {
    setZoom();
  });

  mainView.webContents.on('did-navigate-in-page', () => {
    setZoom();
  });

  // Listen for network requests to capture real Xiaohongshu video URLs
  mainView.webContents.session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const url = details.url;
    const currentPageUrl = mainView.webContents.getURL();

    // Detect Xiaohongshu video requests - based on actual CDN domain observed
    if (url.includes('xhscdn.com') && url.includes('/stream/') && url.includes('.mp4')) {
      console.log('🎥 Detected Xiaohongshu video request:', url);

      // Get existing video URL mapping
      const videoUrlMap = store.get('videoUrlMap', {}) as Record<string, VideoUrlInfo>;

      // Store mapping between page URL and video URL
      videoUrlMap[currentPageUrl] = {
        videoUrl: url,
        timestamp: Date.now(),
        platform: 'xiaohongshu'
      };

      // Save to store
      store.set('videoUrlMap', videoUrlMap);

      console.log('Video URL saved to store:', currentPageUrl, '->', url);
    }

    callback({});
  });

  
  // Prevent new windows from opening - keep everything in the same view
  mainView.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[View] Blocking new window, loading in current view:', url);
    mainView.webContents.loadURL(url);
    return { action: 'deny' };
  });

  mainView.webContents.loadURL(rendererURL)

  mainView.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.log(`${preloadFileName} Failed to load:`, errorCode, errorDescription);
  });

  mainView.webContents.on("context-menu", (event, params) => {
    const menuTemplate: Electron.MenuItemConstructorOptions[] = [];

    // 📎 Links
    if (params.linkURL) {
      menuTemplate.push(
        {
          label: "Open Link in New Window",
          click: () => shell.openExternal(params.linkURL),
        },
        {
          label: "Copy Link Address",
          click: () => clipboard.writeText(params.linkURL),
        },
        { type: "separator" }
      );
    }

    // 🖼️ Images
    if (params.mediaType === "image" && params.srcURL) {
      menuTemplate.push(
        {
          label: "Copy Image Address",
          click: () => clipboard.writeText(params.srcURL),
        },
        {
          label: "Open Image in New Window",
          click: () => shell.openExternal(params.srcURL),
        },
        { type: "separator" }
      );
    }

    // 📝 Text selection
    if (params.selectionText) {
      menuTemplate.push({ label: "Copy", role: "copy" }, { type: "separator" });
    }

    // ⌨️ Input fields (text box/input area)
    if (params.isEditable) {
      menuTemplate.push(
        { label: "Cut", role: "cut" },
        { label: "Copy", role: "copy" },
        { label: "Paste", role: "paste" },
        { type: "separator" }
      );
    }

    // 🧪 Finally provide "Inspect Element" uniformly
    menuTemplate.push({
      label: "Inspect Element",
      click: () => mainView.webContents.inspectElement(params.x, params.y),
    }, {
      label: "Refresh",
      click: () => mainView.webContents.reload(),
    });

    const menu = Menu.buildFromTemplate(menuTemplate);

    menu.popup({
      window: BrowserWindow.fromWebContents(mainView.webContents) || undefined,
    });
  });

  return mainView;
}
