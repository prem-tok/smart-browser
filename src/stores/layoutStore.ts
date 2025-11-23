/**
 * Layout Store
 * Manages UI layout state including sidebars, theme, and window preferences
 */

import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface LayoutState {
  // Sidebar states
  leftSidebarCollapsed: boolean;
  rightSidebarOpen: boolean;
  agentSidebarOpen: boolean;
  
  // Theme
  themeMode: ThemeMode;
  
  // Window preferences
  windowWidth: number;
  windowHeight: number;
  
  // Actions
  toggleLeftSidebar: () => void;
  setLeftSidebarCollapsed: (collapsed: boolean) => void;
  toggleRightSidebar: () => void;
  setRightSidebarOpen: (open: boolean) => void;
  toggleAgentSidebar: () => void;
  setAgentSidebarOpen: (open: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setWindowSize: (width: number, height: number) => void;
}

// Load from localStorage on init
const loadFromStorage = (): Partial<LayoutState> => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem('layout-storage');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load layout from storage:', e);
  }
  return {};
};

// Save to localStorage
const saveToStorage = (state: Partial<LayoutState>) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('layout-storage', JSON.stringify({
      leftSidebarCollapsed: state.leftSidebarCollapsed,
      rightSidebarOpen: state.rightSidebarOpen,
      agentSidebarOpen: state.agentSidebarOpen,
      themeMode: state.themeMode,
    }));
  } catch (e) {
    console.warn('Failed to save layout to storage:', e);
  }
};

const stored = loadFromStorage();

export const useLayoutStore = create<LayoutState>((set, get) => ({
  // Initial state (load from storage)
  leftSidebarCollapsed: stored.leftSidebarCollapsed ?? false,
  rightSidebarOpen: stored.rightSidebarOpen ?? false,
  agentSidebarOpen: stored.agentSidebarOpen ?? false,
  themeMode: (stored.themeMode as ThemeMode) ?? 'auto',
  windowWidth: 1920,
  windowHeight: 1080,

  // Actions
  toggleLeftSidebar: () => {
    set((state) => {
      const newState = { leftSidebarCollapsed: !state.leftSidebarCollapsed };
      saveToStorage({ ...state, ...newState });
      return newState;
    });
  },
  setLeftSidebarCollapsed: (collapsed) => {
    set((state) => {
      const newState = { leftSidebarCollapsed: collapsed };
      saveToStorage({ ...state, ...newState });
      return newState;
    });
  },
  toggleRightSidebar: () => {
    set((state) => {
      const newState = { rightSidebarOpen: !state.rightSidebarOpen };
      saveToStorage({ ...state, ...newState });
      return newState;
    });
  },
  setRightSidebarOpen: (open) => {
    set((state) => {
      const newState = { rightSidebarOpen: open };
      saveToStorage({ ...state, ...newState });
      return newState;
    });
  },
  toggleAgentSidebar: () => {
    set((state) => {
      const newState = { agentSidebarOpen: !state.agentSidebarOpen };
      saveToStorage({ ...state, ...newState });
      return newState;
    });
  },
  setAgentSidebarOpen: (open) => {
    set((state) => {
      const newState = { agentSidebarOpen: open };
      saveToStorage({ ...state, ...newState });
      return newState;
    });
  },
  setThemeMode: (mode) => {
    set((state) => {
      const newState = { themeMode: mode };
      saveToStorage({ ...state, ...newState });
      return newState;
    });
  },
  setWindowSize: (width, height) => set({ windowWidth: width, windowHeight: height }),
}));

