/// <reference types="vite/client" />
import {
  app,
  BrowserWindow,
  dialog,
  WebContentsView,
  protocol,
} from "electron";
import log from "electron-log";
import path from "node:path";
import * as pkg from "../../package.json";
// import { setupAutoUpdater } from './utils/auto-update';
import { isDev } from "./utils/constants";
import { setupMenu } from "./ui/menu";
import { createTray } from "./ui/tray";
import { initCookies } from "./utils/cookie";
import { reloadOnChange } from "./utils/reload";
import { registerClientProtocol } from "./utils/protocol";
import { ConfigManager } from "./utils/config-manager";

// Initialize configuration manager
ConfigManager.getInstance().initialize();

import { createView } from "./ui/view";
import { EkoService } from "./services/eko-service";
import { ServerManager } from "./services/server-manager";
import { MainWindowManager } from "./windows/main-window";
import { taskScheduler } from "./services/task-scheduler";
import { windowContextManager, type WindowContext } from "./services/window-context-manager";
import { cwd } from "node:process";
import { registerAllIpcHandlers } from "./ipc";
import { startPlaywright, stopPlaywright, newPage as playwrightNewPage, closePage as playwrightClosePage } from "../playwrightController";

Object.assign(console, log.functions);

console.debug("main: import.meta.env:", import.meta.env);
console.log("main: isDev:", isDev);
console.log("NODE_ENV:", global.process.env.NODE_ENV);
console.log("isPackaged:", app.isPackaged);

// Log unhandled errors
process.on("uncaughtException", async (error) => {
  console.log("Uncaught Exception:", error);
});

process.on("unhandledRejection", async (error) => {
  console.log("Unhandled Rejection:", error);
});

(() => {
  const root =
    global.process.env.APP_PATH_ROOT ?? import.meta.env.VITE_APP_PATH_ROOT;

  if (root === undefined) {
    console.log(
      "no given APP_PATH_ROOT or VITE_APP_PATH_ROOT. default path is used."
    );
    return;
  }

  if (!path.isAbsolute(root)) {
    console.log("APP_PATH_ROOT must be absolute path.");
    global.process.exit(1);
  }

  console.log(`APP_PATH_ROOT: ${root}`);

  const subdirName = pkg.name;

  for (const [key, val] of [
    ["appData", ""],
    ["userData", subdirName],
    ["sessionData", subdirName],
  ] as const) {
    app.setPath(key, path.join(root, val));
  }

  app.setAppLogsPath(path.join(root, subdirName, "Logs"));
})();

console.log("appPath:", app.getAppPath());

// Register custom protocol scheme before app ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'client',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true
    }
  }
]);

const keys: Parameters<typeof app.getPath>[number][] = [
  "home",
  "appData",
  "userData",
  "sessionData",
  "logs",
  "temp",
];
keys.forEach((key) => console.log(`${key}:`, app.getPath(key)));

// Initialize server manager
const serverManager = new ServerManager();

// Start Next.js server in production environment
if (!isDev) {
  try {
    serverManager.startServer();
    console.log('Next.js server started successfully');
  } catch (error) {
    console.error('Failed to start Next.js server:', error);
  }
}

let mainWindow: BrowserWindow;
let detailView: WebContentsView;
let historyView: WebContentsView | null = null;
let ekoService: EkoService;
let mainWindowManager: MainWindowManager;

/**
 * Initialize main window and all related components
 * Including: detailView, ekoService, windowContext registration
 */
async function initializeMainWindow(): Promise<BrowserWindow> {
  console.log('[Main] Starting main window initialization...');

  // Create main window (includes transition page and service waiting logic)
  mainWindow = await mainWindowManager.createMainWindow();

  // Wait for loading page to finish
  await new Promise<void>((resolve) => {
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => resolve());
    } else {
      resolve();
    }
  });

  // Now wait for React app to finish loading (after server is ready and /main loads)
  // The main window will load /main after server is ready, so we wait for that
  await new Promise<void>((resolve) => {
    const checkUrlAndWait = () => {
      const currentUrl = mainWindow.webContents.getURL();
      // Check if we've loaded the React app (not the loading page)
      // Loading page is file://, React app is http://localhost:5173/main
      if (currentUrl.includes('localhost:5173') || currentUrl.includes('/main')) {
        // Wait for React app to finish loading
        if (mainWindow.webContents.isLoading()) {
          mainWindow.webContents.once('did-finish-load', () => {
            console.log('[Main] React app finished loading, creating detailView...');
            resolve();
          });
        } else {
          console.log('[Main] React app already loaded, creating detailView...');
          resolve();
        }
      } else {
        // Still on loading page (file://), wait for navigation to /main
        console.log('[Main] Waiting for React app to load, current URL:', currentUrl);
        mainWindow.webContents.once('did-navigate', checkUrlAndWait);
        // Also listen for did-finish-load in case we miss the navigate event
        mainWindow.webContents.once('did-finish-load', checkUrlAndWait);
      }
    };
    
    checkUrlAndWait();
  });

  // Now create detailView after React app is ready
  createDetailView();

  // Listen for window close event (close: triggered before closing, can be prevented)
  // Unified handling for Mac and Windows: check task status, prompt user
  mainWindow.on('close', async (event) => {
    // Check if any task is running
    const hasRunningTask = ekoService?.hasRunningTask() || false;

    if (hasRunningTask) {
      // Prevent default close behavior
      event.preventDefault();

      // Show confirmation dialog
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Task Running',
        message: 'A task is currently running. Closing the window will cause the task to fail',
        detail: 'Please choose an action:',
        buttons: process.platform === 'darwin'
          ? ['Cancel', 'Stop Task and Close']
          : ['Cancel', 'Stop Task and Minimize'],
        defaultId: 0,
        cancelId: 0
      });

      if (response === 1) {
        // Stop task
        console.log('[Main] User chose to stop task');

        // Get all task IDs
        const allTaskIds = ekoService?.['eko']?.getAllTaskId() || [];

        // Abort all tasks
        if (ekoService) {
          await ekoService.abortAllTasks();
        }

        // Send abort event (frontend will listen and update IndexedDB)
        allTaskIds.forEach(taskId => {
          mainWindow.webContents.send('task-aborted-by-system', {
            taskId,
            reason: 'User closed window, task terminated',
            timestamp: new Date().toISOString()
          });
        });

        // Delay to ensure message delivery and processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (process.platform === 'darwin') {
          // Mac: actually close window
          mainWindow.destroy();
        } else {
          // Windows/Linux: hide window
          mainWindow.hide();
        }
      }
      // response === 0: cancel close, do nothing
    } else {
      // No task running
      if (process.platform !== 'darwin') {
        // Windows/Linux: hide to tray
        event.preventDefault();
        mainWindow.hide();
        console.log('[Main] Main window hidden to tray');
      }
      // Mac: use default behavior (close window but keep app running)
    }
  });

  // Listen for window closed event (closed: triggered after window is closed)
  // Clean up context
  mainWindow.on('closed', async () => {
    console.log('[Main] Main window closed, cleaning up context');
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        windowContextManager.unregisterWindow(mainWindow.webContents.id);
        
        // Close Playwright page
        const windowId = `main-${mainWindow.id}`;
        await playwrightClosePage(windowId);
        console.log(`[Main] Playwright page closed for window: ${windowId}`);
      }
    } catch (error) {
      console.error('[Main] Failed to clean up main window context:', error);
    }
  });

  console.log('[Main] Main window initialization completed');
  return mainWindow;
}

/**
 * Create and setup detailView
 * This is called after React app is ready to avoid loading browser before UI is ready
 */
function createDetailView(): void {
  if (detailView) {
    console.log('[Main] DetailView already exists, skipping creation');
    return;
  }

  console.log('[Main] Creating detailView after React app is ready...');
  
  // Create detailView with Google - browser opens with search engine ready
  detailView = createView('https://www.google.com', "view", '1');
  
  // Add detailView to main window's contentView
  mainWindow.contentView.addChildView(detailView);
  
  // Initial bounds - will be updated by React when BrowserViewport mounts
  // Position to fill main viewport area (below TopNavBar, accounting for LeftSidebar)
  const leftSidebarWidth = 280; // Width of left sidebar when expanded
  const topNavBarHeight = 48; // Height of top navigation bar
  const windowBounds = mainWindow.getBounds();
  
  detailView.setBounds({
    x: leftSidebarWidth,
    y: topNavBarHeight,
    width: windowBounds.width - leftSidebarWidth,
    height: windowBounds.height - topNavBarHeight,
  });

  // Set detail view visible by default (browser is primary view)
  detailView.setVisible(true);
  
  // Ensure detailView is on top (z-order)
  mainWindow.contentView.setBounds({
    x: 0,
    y: 0,
    width: windowBounds.width,
    height: windowBounds.height,
  });
  
  console.log('[Main] DetailView created and positioned:', {
    x: leftSidebarWidth,
    y: topNavBarHeight,
    width: windowBounds.width - leftSidebarWidth,
    height: windowBounds.height - topNavBarHeight,
  });

  // Prevent detailView from opening new windows - keep everything embedded
  detailView.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Main] Blocking new window from detailView, loading in current view:', url);
    detailView.webContents.loadURL(url);
    return {
      action: "deny",
    };
  });

  // Also prevent main window from opening new windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Main] Blocking new window from main window, loading in detailView:', url);
    if (detailView) {
      detailView.webContents.loadURL(url);
    }
    return {
      action: "deny",
    };
  });

  // Set zoom factor for detailView
  const setDetailViewZoom = () => {
    try {
      detailView.webContents.setZoomFactor(0.7); // 130% zoom (30% zoom in)
      console.log('[Main] DetailView zoom factor set to 0.7');
    } catch (error) {
      console.error('[Main] Failed to set detailView zoom factor:', error);
    }
  };

  // Set zoom immediately after detailView is created
  setTimeout(() => {
    setDetailViewZoom();
  }, 100);

  // Listen for detail view URL changes and sync with Playwright page
  detailView.webContents.on('did-navigate', async (_event, url) => {
    console.log('detail view did-navigate:', url);
    mainWindow?.webContents.send('url-changed', url);
    setDetailViewZoom(); // Set zoom on navigation
    
    // Sync Playwright page URL if it exists
    if (url && url.startsWith('http')) {
      try {
        const { goto: playwrightGoto } = await import('../playwrightController');
        const windowId = `main-${mainWindow.id}`;
        const gotoResult = await playwrightGoto(windowId, url);
        if (gotoResult.ok) {
          console.log(`[Main] Synced Playwright page to: ${url}`);
        }
      } catch (error) {
        // Playwright page might not exist yet, that's okay
        console.log('[Main] Playwright page not available for sync (will be created when needed)');
      }
    }
  });

  detailView.webContents.on('did-navigate-in-page', (_event, url) => {
    console.log('detail view did-navigate-in-page:', url);
    mainWindow?.webContents.send('url-changed', url);
    setDetailViewZoom(); // Set zoom on in-page navigation
  });

  // Also set zoom when page finishes loading
  detailView.webContents.on('did-finish-load', () => {
    setDetailViewZoom();
  });

  // Initialize EkoService (will be created when detailView is ready)
  if (!ekoService) {
    ekoService = new EkoService(mainWindow, detailView);
  }

  // Register main window to windowContextManager
  const mainWindowContext: WindowContext = {
    window: mainWindow,
    detailView,
    historyView,
    ekoService: ekoService!,
    webContentsId: mainWindow.webContents.id,
    windowType: 'main'
  };
  windowContextManager.registerWindow(mainWindowContext);
  console.log('[Main] Main window registered to WindowContextManager');

  // Note: Playwright page is NOT created on startup to prevent separate browser window
  // Pages will be created on-demand when AI agent needs to perform automation tasks
  // This keeps the UI clean with only the Electron window visible
  console.log('[Main] Playwright page will be created on-demand when needed');
}

(async () => {
  await app.whenReady();
  console.log("App is ready");

  // Note: Playwright browser is NOT started on app startup
  // It will be started automatically when first needed by the AI agent
  // This prevents any browser windows from appearing and saves resources
  console.log('[Main] Playwright browser will start on-demand when AI agent needs it');

  // Register global client protocol
  registerClientProtocol(protocol);

  if (isDev) {
    const iconPath = path.join(cwd(), "assets/icons/logo.png");
    console.log("Setting app icon:", iconPath);
    app.dock?.setIcon(iconPath);
  }

  // Load any existing cookies from ElectronStore, set as cookie
  await initCookies();

  // Initialize main window manager
  mainWindowManager = new MainWindowManager(serverManager);

  // Initialize main window and all related components
  mainWindow = await initializeMainWindow();

  // Create system tray
  createTray(mainWindow);
  console.log('[Main] System tray created');

  // Start task scheduler
  taskScheduler.start();
  console.log('[Main] TaskScheduler started');

  // macOS activate event handler
  app.on("activate", async () => {
    // Check if main window exists (regardless of task windows)
    const hasMainWindow = mainWindow && !mainWindow.isDestroyed();

    if (!hasMainWindow) {
      // Create main window if it doesn't exist (even if task windows exist)
      console.log('[Main] App activated, main window does not exist, creating main window');
      mainWindow = await initializeMainWindow();
      setupMenu(mainWindow);
    } else {
      // Main window exists, show and focus
      console.log('[Main] App activated, main window exists, showing and focusing');
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return mainWindow;
})().then((win) => setupMenu(win));

// Don't quit app when all windows are closed, keep running in background (for scheduled tasks)
// User needs to use "Quit" option in tray menu to actually quit the app
app.on("window-all-closed", () => {
  console.log('[Main] All windows closed, app continues running in background');
  // Don't call app.quit(), let app continue running
  // Scheduled tasks will continue executing in background
});

// Clean up Playwright on app quit
app.on("before-quit", async () => {
  console.log('[Main] App quitting, stopping Playwright');
  try {
    await stopPlaywright();
  } catch (error) {
    console.error('[Main] Error stopping Playwright:', error);
  }
});

// Register all IPC handlers
registerAllIpcHandlers();

reloadOnChange();
// setupAutoUpdater();
