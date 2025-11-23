/**
 * Tab Management Hook
 * Manages browser tabs state and operations
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface Tab {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  isLoading?: boolean;
  isActive?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  createdAt: Date;
  // New Chrome-like features
  isPinned?: boolean;
  groupId?: string;
  groupColor?: string;
  isPlayingAudio?: boolean;
  isMuted?: boolean;
  memoryUsage?: number; // in MB, only in dev mode
}

interface UseTabsOptions {
  onTabChange?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  onNavigate?: (tabId: string, url: string) => void;
}

export function useTabs(options: UseTabsOptions = {}) {
  const { onTabChange, onTabClose, onNavigate } = options;
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: 'tab-1',
      title: 'New Tab',
      url: '',
      isActive: true,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      createdAt: new Date(),
      isPinned: false,
      isPlayingAudio: false,
      isMuted: false,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');
  const [closedTabs, setClosedTabs] = useState<Tab[]>([]); // For reopen closed tab
  const tabIdCounter = useRef(1);

  // Get active tab
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];

  // Create new tab
  const createTab = useCallback(
    (url?: string) => {
      tabIdCounter.current += 1;
      const newTab: Tab = {
        id: `tab-${tabIdCounter.current}`,
        title: 'New Tab',
        url: url || '',
        isActive: true,
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        createdAt: new Date(),
      };

      setTabs((prev) => prev.map((t) => ({ ...t, isActive: false })).concat(newTab));
      setActiveTabId(newTab.id);
      onTabChange?.(newTab.id);

      if (url) {
        onNavigate?.(newTab.id, url);
      }

      return newTab.id;
    },
    [onTabChange, onNavigate]
  );

  // Close tab
  const closeTab = useCallback(
    (tabId: string) => {
      if (tabs.length === 1) {
        // Don't close the last tab, just create a new one
        createTab();
        return;
      }

      const tabIndex = tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return;

      const closedTab = tabs.find((t) => t.id === tabId);
      if (closedTab) {
        // Save to closed tabs history (keep last 10)
        setClosedTabs((prev) => {
          const newClosed = [closedTab, ...prev].slice(0, 10);
          return newClosed;
        });
      }

      const newTabs = tabs.filter((t) => t.id !== tabId);
      
      // If closing active tab, switch to adjacent tab
      if (tabId === activeTabId) {
        const newActiveIndex = tabIndex > 0 ? tabIndex - 1 : 0;
        const newActiveTab = newTabs[newActiveIndex];
        if (newActiveTab) {
          setActiveTabId(newActiveTab.id);
          onTabChange?.(newActiveTab.id);
        }
      }

      setTabs(newTabs);
      onTabClose?.(tabId);
    },
    [tabs, activeTabId, onTabChange, onTabClose, createTab]
  );

  // Switch to tab
  const switchToTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => prev.map((t) => ({ ...t, isActive: t.id === tabId })));
      setActiveTabId(tabId);
      onTabChange?.(tabId);
    },
    [onTabChange]
  );

  // Update tab
  const updateTab = useCallback(
    (tabId: string, updates: Partial<Tab>) => {
      setTabs((prev) =>
        prev.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab))
      );
    },
    []
  );

  // Navigate tab
  const navigateTab = useCallback(
    (tabId: string, url: string) => {
      updateTab(tabId, { url, isLoading: true });
      onNavigate?.(tabId, url);
    },
    [updateTab, onNavigate]
  );

  // Reorder tabs (drag and drop)
  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      const newTabs = [...prev];
      const [removed] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, removed);
      return newTabs;
    });
  }, []);

  // Get tab by ID
  const getTab = useCallback(
    (tabId: string) => tabs.find((t) => t.id === tabId),
    [tabs]
  );

  // Close all tabs except
  const closeOtherTabs = useCallback(
    (keepTabId: string) => {
      setTabs((prev) => {
        const keepTab = prev.find((t) => t.id === keepTabId);
        if (!keepTab) return prev;
        return [keepTab].map((t) => ({ ...t, isActive: true }));
      });
      setActiveTabId(keepTabId);
      onTabChange?.(keepTabId);
    },
    [onTabChange]
  );

  // Close tabs to the right
  const closeTabsToRight = useCallback(
    (tabId: string) => {
      const tabIndex = tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return;

      setTabs((prev) => prev.slice(0, tabIndex + 1));
    },
    [tabs]
  );

  // Pin/unpin tab
  const togglePinTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const tab = prev.find((t) => t.id === tabId);
        if (!tab) return prev;
        
        const isPinned = !tab.isPinned;
        const updatedTab = { ...tab, isPinned };
        
        // Pinned tabs go to the front, unpinned go after pinned tabs
        const pinnedTabs = prev.filter((t) => t.isPinned && t.id !== tabId);
        const unpinnedTabs = prev.filter((t) => !t.isPinned && t.id !== tabId);
        
        if (isPinned) {
          return [...pinnedTabs, updatedTab, ...unpinnedTabs];
        } else {
          return [...pinnedTabs, ...unpinnedTabs, updatedTab];
        }
      });
    },
    []
  );

  // Duplicate tab
  const duplicateTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      tabIdCounter.current += 1;
      const duplicatedTab: Tab = {
        ...tab,
        id: `tab-${tabIdCounter.current}`,
        isActive: true,
        isPinned: false, // Duplicated tabs are not pinned
        createdAt: new Date(),
      };

      const tabIndex = tabs.findIndex((t) => t.id === tabId);
      setTabs((prev) => {
        const newTabs = [...prev];
        newTabs.splice(tabIndex + 1, 0, duplicatedTab);
        return newTabs.map((t) => ({ ...t, isActive: t.id === duplicatedTab.id }));
      });
      setActiveTabId(duplicatedTab.id);
      onTabChange?.(duplicatedTab.id);
      
      if (duplicatedTab.url) {
        onNavigate?.(duplicatedTab.id, duplicatedTab.url);
      }
    },
    [tabs, onTabChange, onNavigate]
  );

  // Reopen closed tab
  const reopenClosedTab = useCallback(
    () => {
      if (closedTabs.length === 0) return;
      
      const tabToReopen = closedTabs[0];
      setClosedTabs((prev) => prev.slice(1));
      
      const reopenedTab: Tab = {
        ...tabToReopen,
        id: `tab-${tabIdCounter.current + 1}`,
        isActive: true,
        createdAt: new Date(),
      };
      
      tabIdCounter.current += 1;
      
      setTabs((prev) => prev.map((t) => ({ ...t, isActive: false })).concat(reopenedTab));
      setActiveTabId(reopenedTab.id);
      onTabChange?.(reopenedTab.id);
      
      if (reopenedTab.url) {
        onNavigate?.(reopenedTab.id, reopenedTab.url);
      }
    },
    [closedTabs, onTabChange, onNavigate]
  );

  // Set tab group
  const setTabGroup = useCallback(
    (tabId: string, groupId: string | undefined, groupColor?: string) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === tabId
            ? { ...tab, groupId, groupColor }
            : tab
        )
      );
    },
    []
  );

  return {
    tabs,
    activeTab,
    activeTabId,
    createTab,
    closeTab,
    switchToTab,
    updateTab,
    navigateTab,
    reorderTabs,
    getTab,
    closeOtherTabs,
    closeTabsToRight,
    togglePinTab,
    duplicateTab,
    reopenClosedTab,
    setTabGroup,
    closedTabs,
  };
}

