/**
 * Main Layout Component
 * Production-ready ChatGPT Atlas browser layout
 * Orchestrates all UI components and state management
 */

import React, { useEffect, useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useLayoutStore } from '@/stores/layoutStore';
import { useTabs } from '@/hooks/useTabs';
import { useChat } from '@/hooks/useChat';
import { useAgentMode } from '@/hooks/useAgentMode';
import { useTaskManager } from '@/hooks/useTaskManager';
import { useHistoryStore } from '@/stores/historyStore';
import styles from './MainLayout.module.css';

// Dynamic imports for client-only components
const LeftSidebar = dynamic(() => import('./LeftSidebar'), { ssr: false });
const TopNavBar = dynamic(() => import('./TopNavBar'), { ssr: false });
const RightSidebar = dynamic(() => import('./RightSidebar'), { ssr: false });
const LeftAgentSidebar = dynamic(() => import('./LeftAgentSidebar'), { ssr: false });
const AgentOverlay = dynamic(() => import('@/components/agent/AgentOverlay'), { ssr: false });
const BrowserViewport = dynamic(() => import('@/components/browser/BrowserViewport'), { ssr: false });

interface MainLayoutProps {
  children?: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const router = useRouter();
  const { leftSidebarCollapsed, rightSidebarOpen, agentSidebarOpen, toggleRightSidebar, toggleLeftSidebar, toggleAgentSidebar } = useLayoutStore();
  const { tasks, currentTaskId, setCurrentTaskId, createTask } = useTaskManager();
  const { selectHistoryTask } = useHistoryStore();

  // Browser state (declare first)
  const [currentUrl, setCurrentUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Tab management
  const {
    tabs,
    activeTab,
    activeTabId,
    createTab,
    closeTab,
    switchToTab,
    updateTab,
    navigateTab,
    reorderTabs,
    togglePinTab,
    duplicateTab,
    closeOtherTabs,
    closeTabsToRight,
    setTabGroup,
  } = useTabs({
    onTabChange: (tabId) => {
      // Tab change handled separately via useEffect
    },
    onTabClose: (tabId) => {
      // Handle tab close cleanup if needed
    },
    onNavigate: (tabId, url) => {
      // Navigation handled via navigateTab callback
    },
  });

  // Navigation handler (defined after useTabs to access updateTab)
  const handleNavigate = useCallback(
    (url: string) => {
      if (!url) return;

      let finalUrl = url.trim();

      // If it's not a URL, treat as search
      if (!finalUrl.match(/^https?:\/\//i)) {
        if (finalUrl.includes('.')) {
          finalUrl = `https://${finalUrl}`;
        } else {
          finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
        }
      }

      setCurrentUrl(finalUrl);
      setIsLoading(true);
      if (activeTabId) {
        updateTab(activeTabId, { url: finalUrl, isLoading: true });
      }

      // Navigate in Electron
      if (typeof window !== 'undefined' && window.api && (window.api as any).navigateDetailView) {
        (window.api as any).navigateDetailView(finalUrl);
      }
    },
    [activeTabId, updateTab]
  );

  // Handle tab change with navigation
  useEffect(() => {
    if (activeTab?.url && activeTab.url !== currentUrl) {
      handleNavigate(activeTab.url);
    }
  }, [activeTab?.url, currentUrl, handleNavigate]);

  // Chat management
  const {
    messages: chatMessages,
    input: chatInput,
    setInput: setChatInput,
    isLoading: isChatLoading,
    sendMessage: sendChatMessage,
  } = useChat({
    onSendMessage: async (message) => {
      // Connect to existing agent
      if (window.api && (window.api as any).ekoRun) {
        try {
          await (window.api as any).ekoRun(message);
        } catch (error) {
          console.error('Failed to send message:', error);
          throw error;
        }
      }
    },
  });

  // Agent mode management
  const {
    isActive: agentModeActive,
    isPaused: agentModePaused,
    currentAction: agentCurrentAction,
    actionHistory: agentActionHistory,
    progress: agentProgress,
    start: startAgent,
    stop: stopAgent,
    pause: pauseAgent,
    resume: resumeAgent,
  } = useAgentMode({
    onStart: async () => {
      // Start agent mode
      console.log('Starting agent mode');
    },
    onStop: async () => {
      // Stop agent mode
      console.log('Stopping agent mode');
    },
    onPause: async () => {
      // Pause agent mode
      console.log('Pausing agent mode');
    },
    onResume: async () => {
      // Resume agent mode
      console.log('Resuming agent mode');
    },
    onActionComplete: (actionId) => {
      // Handle action completion
      console.log('Action completed:', actionId);
    },
  });

  // Monitor URL changes from Electron
  useEffect(() => {
    if (window.api && (window.api as any).getCurrentUrl) {
      (window.api as any).getCurrentUrl().then((url: string) => {
        setCurrentUrl(url);
        updateTab(activeTabId, { url });
      });
    }

    if (window.api && (window.api as any).onUrlChange) {
      const handleUrlChange = (url: string) => {
        setCurrentUrl(url);
        updateTab(activeTabId, { url, isLoading: false });
        setIsLoading(false);
      };

      (window.api as any).onUrlChange(handleUrlChange);
      return () => {
        if ((window.api as any).removeAllListeners) {
          (window.api as any).removeAllListeners('url-change');
        }
      };
    }
  }, [activeTabId, updateTab]);

  const handleBack = useCallback(() => {
    if (window.api && (window.api as any).goBack) {
      (window.api as any).goBack();
    }
  }, []);

  const handleForward = useCallback(() => {
    if (window.api && (window.api as any).goForward) {
      (window.api as any).goForward();
    }
  }, []);

  const handleReload = useCallback(() => {
    setIsLoading(true);
    updateTab(activeTabId, { isLoading: true });
    if (window.api && (window.api as any).reload) {
      (window.api as any).reload();
    }
  }, [activeTabId, updateTab]);

  // Tab handlers
  const handleNewTab = useCallback(() => {
    createTab();
    // Create a new task with generated ID
    const newTaskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    createTask(newTaskId, {
      name: 'New Conversation',
      status: 'idle',
      createdAt: new Date(),
    });
    setCurrentTaskId(newTaskId);
  }, [createTab, createTask, setCurrentTaskId]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      closeTab(tabId);
    },
    [closeTab]
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      switchToTab(tabId);
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.url) {
        handleNavigate(tab.url);
      }
    },
    [switchToTab, tabs, handleNavigate]
  );

  // Agent mode handlers
  const handleToggleAgentMode = useCallback(() => {
    // Toggle the agent sidebar
    toggleAgentSidebar();
    // Optionally start agent mode when sidebar opens
    if (!agentSidebarOpen && !agentModeActive) {
      // Don't auto-start agent mode, let user control it from the sidebar
    }
  }, [toggleAgentSidebar, agentSidebarOpen, agentModeActive]);

  // Chat handlers
  const handleSendMessage = useCallback(
    (message: string) => {
      sendChatMessage(message);
    },
    [sendChatMessage]
  );

  // Task/conversation handlers
  const handleSelectConversation = useCallback(
    (taskId: string) => {
      setCurrentTaskId(taskId);
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        selectHistoryTask(task);
      }
    },
    [setCurrentTaskId, tasks, selectHistoryTask]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Toggle left sidebar: Cmd/Ctrl + B
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleLeftSidebar();
      }

      // Toggle right sidebar: Cmd/Ctrl + Shift + A
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        toggleRightSidebar();
      }

      // New tab: Cmd/Ctrl + T
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        handleNewTab();
      }

      // Close tab: Cmd/Ctrl + W
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        handleCloseTab(activeTabId);
      }

      // Switch tabs: Cmd/Ctrl + 1-9
      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (tabs[index]) {
          handleSelectTab(tabs[index].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [toggleLeftSidebar, toggleRightSidebar, handleNewTab, handleCloseTab, activeTabId, tabs, handleSelectTab]);

  // Get agent activity description
  const agentActivity = useMemo(() => {
    if (!agentCurrentAction) return undefined;
    return agentCurrentAction.description;
  }, [agentCurrentAction]);

  // Check if we should show new layout
  const showNewLayout = router.pathname === '/main' || router.pathname === '/';

  if (!showNewLayout) {
    // Use old layout for other pages
    return <>{children}</>;
  }

  return (
    <div className={styles.mainLayout}>
      {/* Left Sidebar */}
      <LeftSidebar
        onNewTab={handleNewTab}
        onSelectConversation={handleSelectConversation}
      />

      {/* Main Content Area */}
      <div className={styles.contentArea}>
        {/* Top Navigation Bar */}
        <TopNavBar
          tabs={tabs}
          activeTabId={activeTabId}
          currentUrl={currentUrl}
          isLoading={isLoading}
          onNewTab={handleNewTab}
          onCloseTab={handleCloseTab}
          onSelectTab={handleSelectTab}
          onNavigate={handleNavigate}
          onBack={handleBack}
          onForward={handleForward}
          onReload={handleReload}
          onAskChatGPT={() => toggleRightSidebar()}
          agentModeActive={agentModeActive}
          onToggleAgentMode={handleToggleAgentMode}
          onToolboxClick={() => router.push('/toolbox')}
          onReorderTabs={reorderTabs}
          onPinTab={togglePinTab}
          onDuplicateTab={duplicateTab}
          onCloseOtherTabs={closeOtherTabs}
          onCloseTabsToRight={closeTabsToRight}
          onSetTabGroup={setTabGroup}
          developerMode={process.env.NODE_ENV === 'development'}
        />

        {/* Browser Viewport with Embedded AI */}
        <div className={styles.viewport}>
          <BrowserViewport
            url={currentUrl}
            isLoading={isLoading}
            onNavigate={handleNavigate}
            agentModeActive={agentModeActive}
            onToggleAgentMode={handleToggleAgentMode}
          />

          {/* Enhanced Agent Overlay - Visual feedback only (highlights, tooltips, etc.) */}
          {agentModeActive && (
            <AgentOverlay
              active={agentModeActive}
              currentAction={agentCurrentAction}
              actionHistory={agentActionHistory}
              onActionComplete={(actionId) => {
                // Action completion handled by useAgentMode
              }}
              onUndoAction={(actionId) => {
                // TODO: Implement undo functionality
                console.log('Undo action:', actionId);
              }}
              onConfirmSensitiveAction={async (actionId) => {
                // TODO: Show confirmation dialog
                return window.confirm('This is a sensitive action. Are you sure you want to proceed?');
              }}
              enableVoiceNarration={false}
              enableScreenRecording={false}
            />
          )}
        </div>
      </div>

      {/* Right Agent Sidebar */}
      <LeftAgentSidebar
        onSendMessage={handleSendMessage}
      />

      {/* Right Sidebar - Hidden by default, can be toggled */}
      {/* AI Agent is now embedded in BrowserViewport */}
    </div>
  );
};

export default MainLayout;
