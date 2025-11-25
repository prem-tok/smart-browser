/**
 * Action Indicator Service
 * Shows visual feedback for agent actions (like Comet browser's headed mode)
 * Provides transparency by showing what the agent is doing
 */

import { BrowserWindow, screen } from 'electron';
import log from 'electron-log';

export interface ActionIndicatorOptions {
  enabled?: boolean;
  showClick?: boolean;
  showType?: boolean;
  showScroll?: boolean;
  showCursor?: boolean; // Show real-time cursor movements
  animationDuration?: number;
  windowId?: string; // Window ID to restrict overlay to detailView bounds
}

export class ActionIndicator {
  private overlay: BrowserWindow | null = null;
  private options: Required<Omit<ActionIndicatorOptions, 'windowId'>> & { windowId?: string };
  private isVisible: boolean = false;
  private detailViewBounds: { x: number; y: number; width: number; height: number } | null = null;
  
  constructor(options: ActionIndicatorOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      showClick: options.showClick ?? true,
      showType: options.showType ?? true,
      showScroll: options.showScroll ?? true,
      showCursor: options.showCursor ?? true, // Enable cursor by default
      animationDuration: options.animationDuration ?? 500,
      windowId: options.windowId
    };
    
    // Update detailView bounds if windowId is provided
    if (options.windowId) {
      this.updateDetailViewBounds(options.windowId);
    }
  }
  
  /**
   * Update detailView bounds for coordinate transformation
   */
  private updateDetailViewBounds(windowId: string): void {
    try {
      // Dynamic import to avoid circular dependencies
      import('../main/services/window-context-manager').then(({ windowContextManager }) => {
        const idMatch = windowId.match(/main-(\d+)/);
        if (idMatch) {
          const id = parseInt(idMatch[1], 10);
          const context = windowContextManager.getContext(id);
          
          // If not found, try to find by iterating all contexts
          if (!context) {
            const allContexts = windowContextManager.getAllContexts();
            const foundContext = allContexts.find(ctx => 
              ctx.window.id === id || ctx.detailView.webContents.id === id
            );
            if (foundContext?.detailView) {
              this.detailViewBounds = foundContext.detailView.getBounds();
              log.debug(`[ActionIndicator] Updated detailView bounds from context:`, this.detailViewBounds);
            }
          } else if (context.detailView) {
            this.detailViewBounds = context.detailView.getBounds();
            log.debug(`[ActionIndicator] Updated detailView bounds:`, this.detailViewBounds);
          }
        }
      }).catch((error) => {
        log.warn('[ActionIndicator] Failed to update detailView bounds:', error);
      });
    } catch (error) {
      log.warn('[ActionIndicator] Failed to update detailView bounds:', error);
    }
  }
  
  /**
   * Set window ID and update bounds
   */
  setWindowId(windowId: string): void {
    this.options.windowId = windowId;
    this.updateDetailViewBounds(windowId);
  }
  
  /**
   * Transform page coordinates to overlay coordinates
   * Since overlay is positioned at detailView bounds, page coordinates map directly to overlay coordinates
   */
  private transformCoordinates(pageX: number, pageY: number): { x: number; y: number } {
    // Page coordinates are relative to the page viewport
    // Since overlay is positioned at detailView bounds, page coordinates map directly to overlay coordinates
    // No transformation needed - overlay coordinates are relative to overlay window (0,0 = top-left of overlay)
    return { x: pageX, y: pageY };
  }
  
  /**
   * Update cursor position (for real-time mouse movement visualization)
   * @param pageX - X coordinate relative to page viewport
   * @param pageY - Y coordinate relative to page viewport
   */
  async updateCursor(pageX: number, pageY: number): Promise<void> {
    if (!this.options.enabled || !this.options.showCursor) return;
    
    try {
      await this.ensureOverlay();
      if (!this.overlay || this.overlay.isDestroyed()) return;
      
      // Transform page coordinates to screen coordinates
      const screenCoords = this.transformCoordinates(pageX, pageY);
      
      // Check if coordinates are within detailView bounds
      if (this.detailViewBounds) {
        const relativeX = pageX; // Relative to detailView
        const relativeY = pageY; // Relative to detailView
        
        // Only show cursor if within detailView bounds
        if (relativeX < 0 || relativeY < 0 || 
            relativeX > this.detailViewBounds.width || 
            relativeY > this.detailViewBounds.height) {
          return; // Cursor outside detailView, don't show
        }
      }
      
      const script = `
        (function() {
          const cursor = document.getElementById('cursor');
          if (cursor) {
            cursor.style.left = '${screenCoords.x}px';
            cursor.style.top = '${screenCoords.y}px';
            cursor.style.display = 'block';
          }
        })();
      `;
      
      await this.overlay.webContents.executeJavaScript(script);
    } catch (error) {
      // Silently fail for cursor updates (high frequency)
    }
  }
  
  /**
   * Hide cursor
   */
  async hideCursor(): Promise<void> {
    if (!this.overlay || this.overlay.isDestroyed()) return;
    
    try {
      await this.overlay.webContents.executeJavaScript(`
        const cursor = document.getElementById('cursor');
        if (cursor) {
          cursor.style.display = 'none';
        }
      `);
    } catch (error) {
      // Silently fail
    }
  }
  
  /**
   * Initialize the overlay window
   * Restricts overlay to detailView bounds if windowId is provided
   */
  private async ensureOverlay(): Promise<void> {
    if (this.overlay && !this.overlay.isDestroyed()) {
      // Update bounds if detailView bounds changed
      if (this.detailViewBounds) {
        this.overlay.setBounds(this.detailViewBounds);
      }
      return;
    }
    
    try {
      let overlayBounds: { x: number; y: number; width: number; height: number };
      
      if (this.detailViewBounds) {
        // Restrict overlay to detailView bounds only
        overlayBounds = this.detailViewBounds;
        log.debug('[ActionIndicator] Creating overlay restricted to detailView bounds:', overlayBounds);
      } else {
        // Fallback: full screen (shouldn't happen if windowId is set)
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        overlayBounds = { x: 0, y: 0, width, height };
        log.warn('[ActionIndicator] No detailView bounds, using full screen overlay');
      }
      
      this.overlay = new BrowserWindow({
        width: overlayBounds.width,
        height: overlayBounds.height,
        x: overlayBounds.x,
        y: overlayBounds.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        focusable: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          backgroundThrottling: false
        }
      });
      
      // Load HTML for overlay
      await this.overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.getOverlayHTML())}`);
      
      // Make overlay click-through
      this.overlay.setIgnoreMouseEvents(true, { forward: true });
      
      log.debug('[ActionIndicator] Overlay window created with bounds:', overlayBounds);
    } catch (error) {
      log.error('[ActionIndicator] Failed to create overlay:', error);
    }
  }
  
  /**
   * Show click animation at coordinates
   * @param pageX - X coordinate relative to page viewport
   * @param pageY - Y coordinate relative to page viewport
   */
  async showClick(pageX: number, pageY: number, elementIndex?: number): Promise<void> {
    if (!this.options.enabled || !this.options.showClick) return;
    
    try {
      await this.ensureOverlay();
      if (!this.overlay || this.overlay.isDestroyed()) return;
      
      // Transform page coordinates to overlay coordinates
      const overlayCoords = this.transformCoordinates(pageX, pageY);
      
      const script = `
        (function() {
          const indicator = document.getElementById('click-indicator');
          if (indicator) {
            indicator.style.left = '${overlayCoords.x}px';
            indicator.style.top = '${overlayCoords.y}px';
            indicator.style.display = 'block';
            indicator.textContent = '${elementIndex !== undefined ? `[${elementIndex}]` : ''}';
            indicator.classList.add('animate');
            setTimeout(() => {
              indicator.classList.remove('animate');
              setTimeout(() => {
                indicator.style.display = 'none';
              }, ${this.options.animationDuration});
            }, ${this.options.animationDuration});
          }
        })();
      `;
      
      await this.overlay.webContents.executeJavaScript(script);
      this.isVisible = true;
    } catch (error) {
      log.warn('[ActionIndicator] Failed to show click indicator:', error);
    }
  }
  
  /**
   * Show typing animation
   * @param text - Text being typed
   * @param elementIndex - Element index
   * @param pageX - X coordinate relative to page viewport (optional)
   * @param pageY - Y coordinate relative to page viewport (optional)
   */
  async showType(text: string, elementIndex: number, pageX?: number, pageY?: number): Promise<void> {
    if (!this.options.enabled || !this.options.showType) return;
    
    try {
      await this.ensureOverlay();
      if (!this.overlay || this.overlay.isDestroyed()) return;
      
      const preview = text.length > 20 ? text.substring(0, 20) + '...' : text;
      let coordScript = '';
      if (pageX !== undefined && pageY !== undefined) {
        const overlayCoords = this.transformCoordinates(pageX, pageY);
        coordScript = `
          indicator.style.left = '${overlayCoords.x}px';
          indicator.style.top = '${overlayCoords.y}px';
        `;
      }
      
      const script = `
        (function() {
          const indicator = document.getElementById('type-indicator');
          if (indicator) {
            ${coordScript}
            indicator.style.display = 'block';
            indicator.textContent = '[${elementIndex}] Typing: "${preview}"';
            indicator.classList.add('animate');
            setTimeout(() => {
              indicator.classList.remove('animate');
              setTimeout(() => {
                indicator.style.display = 'none';
              }, ${this.options.animationDuration});
            }, ${this.options.animationDuration});
          }
        })();
      `;
      
      await this.overlay.webContents.executeJavaScript(script);
      this.isVisible = true;
    } catch (error) {
      log.warn('[ActionIndicator] Failed to show type indicator:', error);
    }
  }
  
  /**
   * Show scroll animation
   */
  async showScroll(direction: 'up' | 'down', amount: number): Promise<void> {
    if (!this.options.enabled || !this.options.showScroll) return;
    
    try {
      await this.ensureOverlay();
      if (!this.overlay || this.overlay.isDestroyed()) return;
      
      const script = `
        (function() {
          const indicator = document.getElementById('scroll-indicator');
          if (indicator) {
            indicator.style.display = 'block';
            indicator.textContent = 'Scrolling ${direction} (${amount}px)';
            indicator.classList.add('animate');
            setTimeout(() => {
              indicator.classList.remove('animate');
              setTimeout(() => {
                indicator.style.display = 'none';
              }, ${this.options.animationDuration});
            }, ${this.options.animationDuration});
          }
        })();
      `;
      
      await this.overlay.webContents.executeJavaScript(script);
      this.isVisible = true;
    } catch (error) {
      log.warn('[ActionIndicator] Failed to show scroll indicator:', error);
    }
  }
  
  /**
   * Show general action message
   */
  async showMessage(message: string, duration: number = 2000): Promise<void> {
    if (!this.options.enabled) return;
    
    try {
      await this.ensureOverlay();
      if (!this.overlay || this.overlay.isDestroyed()) return;
      
      const script = `
        (function() {
          const indicator = document.getElementById('message-indicator');
          if (indicator) {
            indicator.style.display = 'block';
            indicator.textContent = '${message}';
            indicator.classList.add('animate');
            setTimeout(() => {
              indicator.classList.remove('animate');
              setTimeout(() => {
                indicator.style.display = 'none';
              }, ${duration});
            }, ${duration});
          }
        })();
      `;
      
      await this.overlay.webContents.executeJavaScript(script);
      this.isVisible = true;
    } catch (error) {
      log.warn('[ActionIndicator] Failed to show message:', error);
    }
  }
  
  /**
   * Hide all indicators
   */
  hide(): void {
    if (this.overlay && !this.overlay.isDestroyed()) {
      try {
        this.overlay.webContents.executeJavaScript(`
          document.querySelectorAll('.indicator').forEach(el => {
            el.style.display = 'none';
          });
        `);
        this.hideCursor();
        this.isVisible = false;
      } catch (error) {
        log.warn('[ActionIndicator] Failed to hide indicators:', error);
      }
    }
  }
  
  /**
   * Show click animation on cursor
   */
  async showCursorClick(): Promise<void> {
    if (!this.options.enabled || !this.options.showCursor) return;
    
    try {
      await this.ensureOverlay();
      if (!this.overlay || this.overlay.isDestroyed()) return;
      
      await this.overlay.webContents.executeJavaScript(`
        const cursor = document.getElementById('cursor');
        if (cursor) {
          cursor.classList.add('clicking');
          setTimeout(() => {
            cursor.classList.remove('clicking');
          }, 300);
        }
      `);
    } catch (error) {
      // Silently fail
    }
  }
  
  /**
   * Destroy the overlay
   */
  destroy(): void {
    if (this.overlay && !this.overlay.isDestroyed()) {
      this.overlay.destroy();
      this.overlay = null;
      this.isVisible = false;
    }
  }
  
  /**
   * Enable or disable indicators
   */
  setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
    if (!enabled) {
      this.hide();
    }
  }
  
  /**
   * Get overlay HTML
   */
  private getOverlayHTML(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .indicator {
      position: absolute;
      pointer-events: none;
      z-index: 999999;
      font-size: 14px;
      font-weight: 600;
      padding: 8px 12px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      white-space: nowrap;
      display: none;
    }
    #click-indicator {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      transform: translate(-50%, -50%);
      animation: clickPulse 0.5s ease-out;
    }
    #type-indicator {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      color: white;
      transform: translate(-50%, -100%);
      margin-top: -10px;
      animation: typeSlide 0.5s ease-out;
    }
    #scroll-indicator {
      background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
      color: white;
      top: 20px;
      right: 20px;
      animation: scrollFade 0.5s ease-out;
    }
    #message-indicator {
      background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
      color: white;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      animation: messageSlide 0.5s ease-out;
    }
    .indicator.animate {
      animation-play-state: running;
    }
    @keyframes clickPulse {
      0% {
        transform: translate(-50%, -50%) scale(0.5);
        opacity: 0;
      }
      50% {
        transform: translate(-50%, -50%) scale(1.2);
        opacity: 1;
      }
      100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
      }
    }
    @keyframes typeSlide {
      0% {
        transform: translate(-50%, -100%) translateY(-10px);
        opacity: 0;
      }
      100% {
        transform: translate(-50%, -100%) translateY(0);
        opacity: 1;
      }
    }
    @keyframes scrollFade {
      0% {
        opacity: 0;
        transform: translateY(-10px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @keyframes messageSlide {
      0% {
        opacity: 0;
        transform: translateX(-50%) translateY(-10px);
      }
      100% {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    .cursor {
      position: absolute;
      pointer-events: none;
      z-index: 1000000;
      transform: translate(-50%, -50%);
      display: none;
      transition: left 0.05s linear, top 0.05s linear;
    }
    .cursor-dot {
      width: 8px;
      height: 8px;
      background: #3b82f6;
      border-radius: 50%;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
    }
    .cursor-ring {
      width: 32px;
      height: 32px;
      border: 2px solid rgba(59, 130, 246, 0.5);
      border-radius: 50%;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      animation: cursorPulse 1.5s ease-in-out infinite;
    }
    @keyframes cursorPulse {
      0%, 100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 0.5;
      }
      50% {
        transform: translate(-50%, -50%) scale(1.2);
        opacity: 0.3;
      }
    }
    .cursor.clicking .cursor-dot {
      background: #10b981;
      transform: translate(-50%, -50%) scale(1.5);
      transition: transform 0.1s ease;
    }
    .cursor.clicking .cursor-ring {
      border-color: rgba(16, 185, 129, 0.8);
      animation: clickRing 0.3s ease-out;
    }
    @keyframes clickRing {
      0% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 0.8;
      }
      100% {
        transform: translate(-50%, -50%) scale(2);
        opacity: 0;
      }
    }
  </style>
</head>
<body>
  <div id="click-indicator" class="indicator">Click</div>
  <div id="type-indicator" class="indicator">Type</div>
  <div id="scroll-indicator" class="indicator">Scroll</div>
  <div id="message-indicator" class="indicator">Message</div>
  <div id="cursor" class="cursor">
    <div class="cursor-dot"></div>
    <div class="cursor-ring"></div>
  </div>
</body>
</html>
    `;
  }
}

// Singleton instance
let actionIndicatorInstance: ActionIndicator | null = null;

export function getActionIndicator(options?: ActionIndicatorOptions): ActionIndicator {
  if (!actionIndicatorInstance) {
    actionIndicatorInstance = new ActionIndicator(options);
  }
  return actionIndicatorInstance;
}


