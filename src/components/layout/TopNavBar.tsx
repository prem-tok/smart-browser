/**
 * Top Navigation Bar Component
 * Browser chrome with tabs, address bar, and controls
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Button, Dropdown, Badge, Tooltip, Drawer } from 'antd';
import type { MenuProps } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  ReloadOutlined,
  HomeOutlined,
  ApiOutlined,
  DownloadOutlined,
  UserOutlined,
  RobotOutlined,
  ToolOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useLayoutStore } from '@/stores/layoutStore';
import TabStrip from './TabStrip';
import AddressBar from './AddressBar';
import type { Tab } from '@/hooks/useTabs';
import { ModelConfigBar } from '@/components/ModelConfigBar';
import styles from './TopNavBar.module.css';

// Tab interface is now imported from useTabs

interface TopNavBarProps {
  tabs: Tab[];
  activeTabId?: string;
  currentUrl?: string;
  isLoading?: boolean;
  onNewTab?: () => void;
  onCloseTab?: (tabId: string) => void;
  onSelectTab?: (tabId: string) => void;
  onNavigate?: (url: string) => void;
  onBack?: () => void;
  onForward?: () => void;
  onReload?: () => void;
  onHome?: () => void;
  onBookmark?: () => void;
  onAskChatGPT?: () => void;
  agentModeActive?: boolean;
  onToggleAgentMode?: () => void;
  onToolboxClick?: () => void;
  // Enhanced tab features
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
  onPinTab?: (tabId: string) => void;
  onDuplicateTab?: (tabId: string) => void;
  onCloseOtherTabs?: (tabId: string) => void;
  onCloseTabsToRight?: (tabId: string) => void;
  onSetTabGroup?: (tabId: string, groupId: string | undefined, color?: string) => void;
  developerMode?: boolean;
}

const TopNavBar: React.FC<TopNavBarProps> = ({
  tabs,
  activeTabId,
  currentUrl = '',
  isLoading = false,
  onNewTab,
  onCloseTab,
  onSelectTab,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onHome,
  onBookmark,
  onAskChatGPT,
  agentModeActive = false,
  onToggleAgentMode,
  onToolboxClick,
  onReorderTabs,
  onPinTab,
  onDuplicateTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onSetTabGroup,
  developerMode = false,
}) => {
  const { agentSidebarOpen } = useLayoutStore();
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);

  // Handle tab reorder
  const handleReorderTabs = useCallback(
    (fromIndex: number, toIndex: number) => {
      onReorderTabs?.(fromIndex, toIndex);
    },
    [onReorderTabs]
  );

  // Get security level
  const getSecurityLevel = useCallback((): 'secure' | 'insecure' | 'unknown' => {
    if (!currentUrl) return 'unknown';
    if (currentUrl.startsWith('https://')) return 'secure';
    if (currentUrl.startsWith('http://')) return 'insecure';
    return 'unknown';
  }, [currentUrl]);

  // Profile menu
  const profileMenu: MenuProps['items'] = useMemo(() => [
    {
      key: 'model-settings',
      label: 'AI Model Settings',
      icon: <RobotOutlined />,
      onClick: () => setSettingsDrawerOpen(true),
    },
    {
      key: 'profile',
      label: 'Profile',
    },
    {
      key: 'settings',
      label: 'Settings',
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'extensions',
      label: 'Extensions',
    },
    {
      key: 'downloads',
      label: 'Downloads',
    },
  ], []);

  return (
    <div className={styles.navBar}>
      {/* Browser Controls */}
      <div className={styles.controls}>
        <Tooltip title="Back">
          <Button
            type="text"
            icon={<LeftOutlined />}
            onClick={onBack}
            className={styles.controlButton}
          />
        </Tooltip>
        <Tooltip title="Forward">
          <Button
            type="text"
            icon={<RightOutlined />}
            onClick={onForward}
            className={styles.controlButton}
          />
        </Tooltip>
        <Tooltip title="Reload">
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={onReload}
            className={`${styles.controlButton} ${isLoading ? styles.spinning : ''}`}
          />
        </Tooltip>
        {onHome && (
          <Tooltip title="Home">
            <Button
              type="text"
              icon={<HomeOutlined />}
              onClick={onHome}
              className={styles.controlButton}
            />
          </Tooltip>
        )}
      </div>

      {/* Enhanced Tab Strip */}
      <TabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onNewTab={onNewTab}
        onReorderTabs={handleReorderTabs}
        onPinTab={onPinTab}
        onDuplicateTab={onDuplicateTab}
        onCloseOtherTabs={onCloseOtherTabs}
        onCloseTabsToRight={onCloseTabsToRight}
        onSetTabGroup={onSetTabGroup}
        developerMode={developerMode}
      />

      {/* Enhanced Address Bar */}
      <AddressBar
        currentUrl={currentUrl}
        isLoading={isLoading}
        tabs={tabs}
        onNavigate={onNavigate}
        onBookmark={onBookmark}
        onAskChatGPT={onAskChatGPT}
        securityLevel={getSecurityLevel()}
      />

      {/* Right Corner Actions */}
      <div className={styles.rightActions}>
        {onToolboxClick && (
          <Tooltip title="Toolbox">
            <Button
              type="text"
              icon={<ToolOutlined />}
              className={styles.actionButton}
              onClick={onToolboxClick}
            />
          </Tooltip>
        )}
        <Tooltip title="Extensions">
          <Button
            type="text"
            icon={<ApiOutlined />}
            className={styles.actionButton}
          />
        </Tooltip>
        <Tooltip title="Downloads">
          <Badge count={0} showZero={false}>
            <Button
              type="text"
              icon={<DownloadOutlined />}
              className={styles.actionButton}
            />
          </Badge>
        </Tooltip>
        <Tooltip title={agentSidebarOpen ? 'Close Agent Panel' : 'Open Agent Panel'}>
          <Button
            type={agentSidebarOpen ? 'primary' : 'text'}
            icon={<RobotOutlined />}
            className={`${styles.actionButton} ${agentSidebarOpen ? styles.agentModeActive : ''}`}
            onClick={onToggleAgentMode || (() => {})}
            disabled={!onToggleAgentMode}
          >
            
          </Button>
        </Tooltip>
        <Dropdown menu={{ items: profileMenu }} placement="bottomRight">
          <Button
            type="text"
            icon={<UserOutlined />}
            className={styles.actionButton}
          />
        </Dropdown>
      </div>

      {/* Model Settings Drawer */}
      <Drawer
        title="AI Model Configuration"
        placement="right"
        onClose={() => setSettingsDrawerOpen(false)}
        open={settingsDrawerOpen}
        width={400}
        styles={{
          body: {
            padding: '16px',
            background: 'var(--background-primary)',
          },
        }}
      >
        <ModelConfigBar />
      </Drawer>
    </div>
  );
};

export default TopNavBar;

