/**
 * Stealth configuration for browser automation
 * Provides comprehensive bot detection evasion capabilities
 */

import type { Page as PlaywrightPage } from 'playwright';
import type { Page as PuppeteerPage } from 'puppeteer';
import { randomChoice } from './randomization';

/**
 * Union type for Playwright or Puppeteer page
 */
export type BrowserPage = PlaywrightPage | PuppeteerPage;

/**
 * Browser launch options for Puppeteer
 */
export interface PuppeteerLaunchOptions {
  headless?: boolean | 'new';
  args?: string[];
  ignoreHTTPSErrors?: boolean;
  defaultViewport?: {
    width: number;
    height: number;
  };
  userDataDir?: string;
  executablePath?: string;
}

/**
 * Browser launch options for Playwright
 */
export interface PlaywrightLaunchOptions {
  headless?: boolean;
  args?: string[];
  ignoreHTTPSErrors?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
}

/**
 * Combined launch options (works for both)
 */
export interface BrowserLaunchConfig {
  headless?: boolean;
  args: string[];
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
  ignoreHTTPSErrors?: boolean;
}

/**
 * Pool of recent Chrome user agents (updated regularly)
 */
const USER_AGENT_POOL = [
  // Chrome 120+ on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  // Chrome 120+ on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  // Chrome 120+ on Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

/**
 * Common realistic viewport sizes
 */
const VIEWPORT_POOL = [
  { width: 1920, height: 1080 }, // Full HD
  { width: 1366, height: 768 },   // Common laptop
  { width: 1536, height: 864 },   // MacBook Pro
  { width: 1440, height: 900 },   // MacBook Air
  { width: 1280, height: 720 },   // HD
  { width: 1600, height: 900 },   // WXGA+
  { width: 2560, height: 1440 },  // 2K
];

/**
 * Common screen resolutions (for screen spoofing)
 */
const SCREEN_RESOLUTIONS = [
  { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 },
  { width: 1366, height: 768, availWidth: 1366, availHeight: 728 },
  { width: 1536, height: 864, availWidth: 1536, availHeight: 824 },
  { width: 2560, height: 1440, availWidth: 2560, availHeight: 1400 },
  { width: 1440, height: 900, availWidth: 1440, availHeight: 860 },
];

/**
 * Common timezones
 */
const TIMEZONES = [
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

/**
 * Browser launch arguments to avoid detection
 * These flags disable automation indicators and make the browser appear more human-like
 */
export const STEALTH_LAUNCH_ARGS = [
  // Disable automation flags
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--disable-setuid-sandbox',
  '--no-sandbox',
  '--disable-web-security',
  '--disable-features=IsolateOrigins,site-per-process',
  
  // Make browser appear more realistic
  '--disable-infobars',
  '--disable-notifications',
  '--disable-popup-blocking',
  '--disable-translate',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=TranslateUI',
  '--disable-ipc-flooding-protection',
  
  // Performance and stealth
  '--enable-features=NetworkService,NetworkServiceInProcess',
  '--force-color-profile=srgb',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-first-run',
  '--safebrowsing-disable-auto-update',
  '--enable-automation=false',
  '--password-store=basic',
  '--use-mock-keychain',
  
  // Extensions and plugins
  '--disable-extensions-except',
  '--disable-default-apps',
  '--disable-component-extensions-with-background-pages',
  
  // WebGL and Canvas fingerprinting evasion
  '--enable-webgl',
  '--enable-webgl2',
  '--ignore-gpu-blacklist',
  '--ignore-gpu-blocklist',
];

/**
 * Common browser extension fingerprints (for realistic plugin simulation)
 */
const EXTENSION_FINGERPRINTS = [
  {
    name: 'Chrome PDF Viewer',
    description: 'Portable Document Format',
    filename: 'internal-pdf-viewer',
  },
  {
    name: 'Chrome PDF Viewer',
    description: 'Portable Document Format',
    filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
  },
  {
    name: 'Web Store',
    description: 'Extension',
    filename: 'ahfgeienlihckogmohjhadlkjgocpleb',
  },
];

/**
 * Gets browser launch configuration with stealth settings
 *
 * @param options - Optional configuration overrides
 * @returns Browser launch configuration
 *
 * @example
 * ```typescript
 * const config = getBrowserLaunchConfig({ headless: false });
 * // Use with Puppeteer or Playwright
 * ```
 */
export function getBrowserLaunchConfig(
  options: Partial<BrowserLaunchConfig> = {}
): BrowserLaunchConfig {
  const viewport = options.viewport || randomChoice(VIEWPORT_POOL) || VIEWPORT_POOL[0];
  const userAgent = options.userAgent || randomChoice(USER_AGENT_POOL) || USER_AGENT_POOL[0];

  return {
    headless: options.headless ?? false,
    args: options.args || [...STEALTH_LAUNCH_ARGS],
    viewport,
    userAgent,
    ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? true,
  };
}

/**
 * Gets Puppeteer-specific launch options
 *
 * @param options - Optional configuration overrides
 * @returns Puppeteer launch options
 */
export function getPuppeteerLaunchOptions(
  options: Partial<PuppeteerLaunchOptions> = {}
): PuppeteerLaunchOptions {
  const config = getBrowserLaunchConfig();
  
  return {
    headless: options.headless ?? config.headless ?? false,
    args: options.args || config.args,
    ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? config.ignoreHTTPSErrors,
    defaultViewport: options.defaultViewport || config.viewport ? {
      width: config.viewport!.width,
      height: config.viewport!.height,
    } : undefined,
    userDataDir: options.userDataDir,
    executablePath: options.executablePath,
  };
}

/**
 * Gets Playwright-specific launch options
 *
 * @param options - Optional configuration overrides
 * @returns Playwright launch options
 */
export function getPlaywrightLaunchOptions(
  options: Partial<PlaywrightLaunchOptions> = {}
): PlaywrightLaunchOptions {
  const config = getBrowserLaunchConfig();
  
  return {
    headless: options.headless ?? config.headless ?? false,
    args: options.args || config.args,
    ignoreHTTPSErrors: options.ignoreHTTPSErrors ?? config.ignoreHTTPSErrors,
    viewport: options.viewport || config.viewport,
    userAgent: options.userAgent || config.userAgent,
  };
}

/**
 * Sets up comprehensive stealth mode on a page instance
 * Overrides various browser properties to avoid detection
 *
 * @param page - Playwright or Puppeteer page instance
 * @param options - Optional stealth configuration
 * @throws Error if setup fails
 *
 * @example
 * ```typescript
 * const page = await browser.newPage();
 * await setupStealthMode(page);
 * ```
 */
export async function setupStealthMode(
  page: BrowserPage,
  options: {
    userAgent?: string;
    viewport?: { width: number; height: number };
    timezone?: string;
    geolocation?: { latitude: number; longitude: number; accuracy?: number };
  } = {}
): Promise<void> {
  const isPlaywright = typeof (page as any).context === 'function';
  const userAgent = options.userAgent || randomChoice(USER_AGENT_POOL) || USER_AGENT_POOL[0];
  const viewport = options.viewport || randomChoice(VIEWPORT_POOL) || VIEWPORT_POOL[0];
  const screen = randomChoice(SCREEN_RESOLUTIONS) || SCREEN_RESOLUTIONS[0];
  const timezone = options.timezone || randomChoice(TIMEZONES) || TIMEZONES[0];
  const geolocation = options.geolocation || {
    latitude: 40.7128 + (Math.random() - 0.5) * 0.1, // New York area with variation
    longitude: -74.0060 + (Math.random() - 0.5) * 0.1,
    accuracy: 100,
  };

  try {
    // Set user agent
    if (isPlaywright) {
      const pwPage = page as PlaywrightPage;
      await pwPage.setExtraHTTPHeaders({
        'User-Agent': userAgent,
      });
      await pwPage.addInitScript((ua) => {
        Object.defineProperty(navigator, 'userAgent', {
          get: () => ua,
        });
      }, userAgent);
    } else {
      const ppPage = page as PuppeteerPage;
      await ppPage.setUserAgent(userAgent);
    }

    // Set viewport
    if (isPlaywright) {
      const pwPage = page as PlaywrightPage;
      await pwPage.setViewportSize(viewport);
    } else {
      const ppPage = page as PuppeteerPage;
      await ppPage.setViewport(viewport);
    }

    // Override navigator.webdriver
    if (isPlaywright) {
      const pwPage = page as PlaywrightPage;
      await pwPage.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
          configurable: true,
        });
        delete (navigator as any).__proto__.webdriver;
      });
    } else {
      const ppPage = page as PuppeteerPage;
      await ppPage.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
          configurable: true,
        });
        delete (navigator as any).__proto__.webdriver;
      });
    }

    // Add realistic Chrome runtime properties
    if (isPlaywright) {
      const pwPage = page as PlaywrightPage;
      await pwPage.addInitScript(() => {
        (window as any).chrome = {
          runtime: {
            onConnect: undefined,
            onMessage: undefined,
          },
          loadTimes: function() {},
          csi: function() {},
          app: {},
        };
      });
    } else {
      const ppPage = page as PuppeteerPage;
      await ppPage.evaluateOnNewDocument(() => {
        (window as any).chrome = {
          runtime: {
            onConnect: undefined,
            onMessage: undefined,
          },
          loadTimes: function() {},
          csi: function() {},
          app: {},
        };
      });
    }

    // Randomize plugins (realistic extension fingerprints)
    const plugins = EXTENSION_FINGERPRINTS.map((ext, index) => ({
      name: ext.name,
      description: ext.description,
      filename: ext.filename,
      length: index + 1,
    }));

    if (isPlaywright) {
      const pwPage = page as PlaywrightPage;
      await pwPage.addInitScript((plugs) => {
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const pluginArray = [];
            for (let i = 0; i < plugs.length; i++) {
              pluginArray.push({
                name: plugs[i].name,
                description: plugs[i].description,
                filename: plugs[i].filename,
                length: plugs[i].length,
              });
            }
            return pluginArray;
          },
          configurable: true,
        });
      }, plugins);
    } else {
      const ppPage = page as PuppeteerPage;
      await ppPage.evaluateOnNewDocument((plugs) => {
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const pluginArray = [];
            for (let i = 0; i < plugs.length; i++) {
              pluginArray.push({
                name: plugs[i].name,
                description: plugs[i].description,
                filename: plugs[i].filename,
                length: plugs[i].length,
              });
            }
            return pluginArray;
          },
          configurable: true,
        });
      }, plugins);
    }

    // Set realistic screen resolution
    if (isPlaywright) {
      const pwPage = page as PlaywrightPage;
      await pwPage.addInitScript((screenData) => {
        Object.defineProperty(screen, 'width', {
          get: () => screenData.width,
          configurable: true,
        });
        Object.defineProperty(screen, 'height', {
          get: () => screenData.height,
          configurable: true,
        });
        Object.defineProperty(screen, 'availWidth', {
          get: () => screenData.availWidth,
          configurable: true,
        });
        Object.defineProperty(screen, 'availHeight', {
          get: () => screenData.availHeight,
          configurable: true,
        });
      }, screen);
    } else {
      const ppPage = page as PuppeteerPage;
      await ppPage.evaluateOnNewDocument((screenData) => {
        Object.defineProperty(screen, 'width', {
          get: () => screenData.width,
          configurable: true,
        });
        Object.defineProperty(screen, 'height', {
          get: () => screenData.height,
          configurable: true,
        });
        Object.defineProperty(screen, 'availWidth', {
          get: () => screenData.availWidth,
          configurable: true,
        });
        Object.defineProperty(screen, 'availHeight', {
          get: () => screenData.availHeight,
          configurable: true,
        });
      }, screen);
    }

    // Randomize Canvas fingerprint
    if (isPlaywright) {
      const pwPage = page as PlaywrightPage;
      await pwPage.addInitScript(() => {
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type?: string) {
          const context = this.getContext('2d');
          if (context) {
            // Add slight noise to canvas
            const imageData = context.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] += Math.random() < 0.01 ? Math.floor(Math.random() * 3) - 1 : 0;
            }
            context.putImageData(imageData, 0, 0);
          }
          return originalToDataURL.apply(this, arguments as any);
        };
      });
    } else {
      const ppPage = page as PuppeteerPage;
      await ppPage.evaluateOnNewDocument(() => {
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type?: string) {
          const context = this.getContext('2d');
          if (context) {
            // Add slight noise to canvas
            const imageData = context.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] += Math.random() < 0.01 ? Math.floor(Math.random() * 3) - 1 : 0;
            }
            context.putImageData(imageData, 0, 0);
          }
          return originalToDataURL.apply(this, arguments as any);
        };
      });
    }

    // Randomize WebGL fingerprint
    if (isPlaywright) {
      const pwPage = page as PlaywrightPage;
      await pwPage.addInitScript(() => {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
          if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
            return 'Intel Inc.';
          }
          if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
            return 'Intel Iris OpenGL Engine';
          }
          return getParameter.apply(this, arguments as any);
        };
      });
    } else {
      const ppPage = page as PuppeteerPage;
      await ppPage.evaluateOnNewDocument(() => {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
          if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
            return 'Intel Inc.';
          }
          if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
            return 'Intel Iris OpenGL Engine';
          }
          return getParameter.apply(this, arguments as any);
        };
      });
    }

    // Set timezone
    if (isPlaywright) {
      const pwPage = page as PlaywrightPage;
      await pwPage.addInitScript((tz) => {
        const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
        Date.prototype.getTimezoneOffset = function() {
          // Return offset for specified timezone (simplified)
          return originalGetTimezoneOffset.apply(this);
        };
        // Set timezone via Intl
        try {
          Intl.DateTimeFormat = function(...args: any[]) {
            return new (Intl.DateTimeFormat as any)(...args, { timeZone: tz });
          } as any;
        } catch (e) {
          // Fallback
        }
      }, timezone);
    } else {
      const ppPage = page as PuppeteerPage;
      await ppPage.evaluateOnNewDocument((tz) => {
        const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
        Date.prototype.getTimezoneOffset = function() {
          return originalGetTimezoneOffset.apply(this);
        };
        try {
          Intl.DateTimeFormat = function(...args: any[]) {
            return new (Intl.DateTimeFormat as any)(...args, { timeZone: tz });
          } as any;
        } catch (e) {
          // Fallback
        }
      }, timezone);
    }

    // Set geolocation
    if (isPlaywright) {
      const pwPage = page as PlaywrightPage;
      await pwPage.context().grantPermissions(['geolocation'], { origin: pwPage.url() });
      await pwPage.addInitScript((geo) => {
        navigator.geolocation.getCurrentPosition = function(
          success: PositionCallback,
          error?: PositionErrorCallback,
          options?: PositionOptions
        ) {
          if (success) {
            success({
              coords: {
                latitude: geo.latitude,
                longitude: geo.longitude,
                accuracy: geo.accuracy || 100,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
              },
              timestamp: Date.now(),
            } as GeolocationPosition);
          }
        };
      }, geolocation);
    } else {
      const ppPage = page as PuppeteerPage;
      await ppPage.setGeolocation(geolocation);
      await ppPage.context().grantPermissions(['geolocation']);
    }

    // Override languages
    if (isPlaywright) {
      const pwPage = page as PlaywrightPage;
      await pwPage.addInitScript(() => {
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
          configurable: true,
        });
      });
    } else {
      const ppPage = page as PuppeteerPage;
      await ppPage.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
          configurable: true,
        });
      });
    }

    // Override permissions API
    if (isPlaywright) {
      const pwPage = page as PlaywrightPage;
      await pwPage.addInitScript(() => {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery(parameters);
      });
    } else {
      const ppPage = page as PuppeteerPage;
      await ppPage.evaluateOnNewDocument(() => {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery(parameters);
      });
    }
  } catch (error) {
    throw new Error(`Failed to setup stealth mode: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Gets a random user agent from the pool
 *
 * @returns Random user agent string
 */
export function getRandomUserAgent(): string {
  return randomChoice(USER_AGENT_POOL) || USER_AGENT_POOL[0];
}

/**
 * Gets a random viewport from the pool
 *
 * @returns Random viewport dimensions
 */
export function getRandomViewport(): { width: number; height: number } {
  return randomChoice(VIEWPORT_POOL) || VIEWPORT_POOL[0];
}
