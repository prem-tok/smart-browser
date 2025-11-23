/**
 * Enhanced Tab Strip Component
 * Chrome/Atlas-like tab management with drag-and-drop, pinning, grouping, and more
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Button,
  Dropdown,
  Tooltip,
  Spin,
  Badge,
} from 'antd';
import {
  PlusOutlined,
  CloseOutlined,
  PushpinOutlined,
  PushpinFilled,
  SoundOutlined,
  SoundFilled,
  CopyOutlined,
  ReloadOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Tab } from '@/hooks/useTabs';
import styles from './TabStrip.module.css';

interface TabStripProps {
  tabs: Tab[];
  activeTabId?: string;
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
  onNewTab?: () => void;
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
  onPinTab?: (tabId: string) => void;
  onDuplicateTab?: (tabId: string) => void;
  onCloseOtherTabs?: (tabId: string) => void;
  onCloseTabsToRight?: (tabId: string) => void;
  onSetTabGroup?: (tabId: string, groupId: string | undefined, color?: string) => void;
  developerMode?: boolean;
}

// Group colors (Chrome-like)
const GROUP_COLORS = [
  '#4285F4', // Blue
  '#EA4335', // Red
  '#FBBC04', // Yellow
  '#34A853', // Green
  '#FF6D01', // Orange
  '#9334E6', // Purple
  '#00ACED', // Cyan
  '#E91E63', // Pink
];

interface SortableTabProps {
  tab: Tab;
  isActive: boolean;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string, e: React.MouseEvent) => void;
  onPin: (tabId: string) => void;
  onDuplicate: (tabId: string) => void;
  onCloseOther: (tabId: string) => void;
  onCloseToRight: (tabId: string) => void;
  onSetGroup: (tabId: string, groupId: string | undefined, color?: string) => void;
  developerMode?: boolean;
}

const SortableTab: React.FC<SortableTabProps> = ({
  tab,
  isActive,
  onSelect,
  onClose,
  onPin,
  onDuplicate,
  onCloseOther,
  onCloseToRight,
  onSetGroup,
  developerMode,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const tabRef = useRef<HTMLDivElement>(null);
  const [showClose, setShowClose] = useState(false);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);

  // Context menu items
  const contextMenuItems: MenuProps['items'] = [
    {
      key: 'pin',
      label: tab.isPinned ? 'Unpin tab' : 'Pin tab',
      icon: tab.isPinned ? <PushpinFilled /> : <PushpinOutlined />,
      onClick: () => {
        onPin(tab.id);
        setContextMenuVisible(false);
      },
    },
    {
      key: 'duplicate',
      label: 'Duplicate tab',
      icon: <CopyOutlined />,
      onClick: () => {
        onDuplicate(tab.id);
        setContextMenuVisible(false);
      },
    },
    {
      type: 'divider',
    },
    {
      key: 'close-other',
      label: 'Close other tabs',
      onClick: () => {
        onCloseOther(tab.id);
        setContextMenuVisible(false);
      },
    },
    {
      key: 'close-right',
      label: 'Close tabs to the right',
      onClick: () => {
        onCloseToRight(tab.id);
        setContextMenuVisible(false);
      },
    },
    {
      type: 'divider',
    },
    {
      key: 'group',
      label: 'Add to group',
      children: GROUP_COLORS.map((color, idx) => ({
        key: `group-${idx}`,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: color,
              }}
            />
            <span>Group {idx + 1}</span>
          </div>
        ),
        onClick: () => {
          onSetGroup(tab.id, `group-${idx}`, color);
          setContextMenuVisible(false);
        },
      })),
    },
    {
      key: 'ungroup',
      label: 'Remove from group',
      disabled: !tab.groupId,
      onClick: () => {
        onSetGroup(tab.id, undefined);
        setContextMenuVisible(false);
      },
    },
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.tab} ${isActive ? styles.active : ''} ${tab.isPinned ? styles.pinned : ''} ${isDragging ? styles.dragging : ''}`}
      onMouseEnter={() => setShowClose(true)}
      onMouseLeave={() => setShowClose(false)}
      onClick={(e) => {
        if (e.button === 0) {
          onSelect(tab.id);
        }
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          // Middle click to close
          e.preventDefault();
          onClose(tab.id, e);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenuVisible(true);
      }}
    >
      {/* Group color indicator */}
      {tab.groupColor && (
        <div
          className={styles.groupIndicator}
          style={{ backgroundColor: tab.groupColor }}
        />
      )}

      {/* Pin indicator */}
      {tab.isPinned && (
        <div className={styles.pinIndicator}>
          <PushpinFilled />
        </div>
      )}

      {/* Favicon */}
      <div className={styles.tabFaviconContainer}>
        {tab.favicon ? (
          <img
            src={tab.favicon}
            alt=""
            className={styles.tabFavicon}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className={styles.tabFaviconPlaceholder} />
        )}
        {tab.isLoading && (
          <Spin size="small" className={styles.tabSpinner} />
        )}
      </div>

      {/* Title */}
      <span
        className={styles.tabTitle}
        title={tab.title}
        {...attributes}
        {...listeners}
      >
        {tab.isPinned ? '' : tab.title || 'New Tab'}
      </span>

      {/* Audio indicator */}
      {tab.isPlayingAudio && (
        <Tooltip title={tab.isMuted ? 'Tab is muted' : 'Tab is playing sound'}>
          <div className={styles.audioIndicator}>
            {tab.isMuted ? (
              <SoundOutlined className={styles.audioIcon} />
            ) : (
              <SoundFilled className={`${styles.audioIcon} ${styles.audioPlaying}`} />
            )}
          </div>
        </Tooltip>
      )}

      {/* Memory usage (developer mode) */}
      {developerMode && tab.memoryUsage !== undefined && (
        <Tooltip title={`Memory: ${tab.memoryUsage.toFixed(1)} MB`}>
          <span className={styles.memoryBadge}>
            {tab.memoryUsage.toFixed(0)}MB
          </span>
        </Tooltip>
      )}

      {/* Close button */}
      <Button
        type="text"
        icon={<CloseOutlined />}
        size="small"
        className={`${styles.tabClose} ${showClose || isActive ? styles.visible : ''}`}
        onClick={(e) => onClose(tab.id, e)}
        onMouseDown={(e) => e.stopPropagation()}
      />

      {/* Context menu */}
      <Dropdown
        menu={{ items: contextMenuItems }}
        open={contextMenuVisible}
        onOpenChange={setContextMenuVisible}
        trigger={['contextMenu']}
      >
        <div style={{ display: 'none' }} />
      </Dropdown>
    </div>
  );
};

const TabStrip: React.FC<TabStripProps> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onReorderTabs,
  onPinTab,
  onDuplicateTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onSetTabGroup,
  developerMode = false,
}) => {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const [visibleTabs, setVisibleTabs] = useState<Tab[]>(tabs);
  const [overflowTabs, setOverflowTabs] = useState<Tab[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Calculate visible tabs based on container width
  useEffect(() => {
    const updateVisibleTabs = () => {
      if (!tabsContainerRef.current) return;

      const container = tabsContainerRef.current;
      const containerWidth = container.offsetWidth;
      const tabElements = container.querySelectorAll(`.${styles.tab}`);
      
      if (tabElements.length === 0) {
        setVisibleTabs(tabs);
        setOverflowTabs([]);
        return;
      }

      let totalWidth = 0;
      const visible: Tab[] = [];
      const overflow: Tab[] = [];

      // Reserve space for new tab button (40px) and overflow button (40px)
      const maxWidth = containerWidth - 80;

      tabs.forEach((tab, index) => {
        const tabElement = tabElements[index] as HTMLElement;
        if (!tabElement) {
          visible.push(tab);
          return;
        }

        const tabWidth = tabElement.offsetWidth || 200; // Default width estimate
        if (totalWidth + tabWidth <= maxWidth || visible.length === 0) {
          totalWidth += tabWidth;
          visible.push(tab);
        } else {
          overflow.push(tab);
        }
      });

      setVisibleTabs(visible);
      setOverflowTabs(overflow);
      setShowOverflow(overflow.length > 0);
    };

    updateVisibleTabs();
    window.addEventListener('resize', updateVisibleTabs);
    return () => window.removeEventListener('resize', updateVisibleTabs);
  }, [tabs]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = tabs.findIndex((tab) => tab.id === active.id);
    const newIndex = tabs.findIndex((tab) => tab.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderTabs?.(oldIndex, newIndex);
    }
  };


  const handleTabClose = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onCloseTab?.(tabId);
    },
    [onCloseTab]
  );

  // Overflow menu items
  const overflowMenuItems: MenuProps['items'] = overflowTabs.map((tab) => ({
    key: tab.id,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {tab.favicon && (
          <img src={tab.favicon} alt="" style={{ width: 16, height: 16 }} />
        )}
        <span>{tab.title || 'New Tab'}</span>
        {tab.isPlayingAudio && (
          <SoundFilled style={{ marginLeft: 'auto', color: '#10A37F' }} />
        )}
      </div>
    ),
    onClick: () => onSelectTab?.(tab.id),
  }));

  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);

  return (
    <div className={styles.tabStrip}>
      <div ref={tabsContainerRef} className={styles.tabsContainer}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tabIds}
            strategy={horizontalListSortingStrategy}
          >
            <div className={styles.tabs}>
              {tabs.map((tab) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  onSelect={(id) => onSelectTab?.(id)}
                  onClose={(id, e) => {
                    e.stopPropagation();
                    onCloseTab?.(id);
                  }}
                  onPin={(id) => onPinTab?.(id)}
                  onDuplicate={(id) => onDuplicateTab?.(id)}
                  onCloseOther={(id) => onCloseOtherTabs?.(id)}
                  onCloseToRight={(id) => onCloseTabsToRight?.(id)}
                  onSetGroup={(id, groupId, color) => onSetTabGroup?.(id, groupId, color)}
                  developerMode={developerMode}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Overflow dropdown */}
      {showOverflow && (
        <Dropdown menu={{ items: overflowMenuItems }} trigger={['click']}>
          <Button
            type="text"
            icon={<MoreOutlined />}
            className={styles.overflowButton}
            title={`${overflowTabs.length} more tabs`}
          />
        </Dropdown>
      )}

      {/* New Tab button */}
      <Tooltip title="New Tab (Ctrl+T)">
        <Button
          type="text"
          icon={<PlusOutlined />}
          onClick={onNewTab}
          className={styles.newTabButton}
        />
      </Tooltip>
    </div>
  );
};

export default TabStrip;

