/**
 * Browser Memories Component
 * Interface for saving and managing page contexts with key facts
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Card,
  Input,
  Button,
  Tag,
  Empty,
  Modal,
  Form,
  Input as AntInput,
  Space,
  Typography,
  Popconfirm,
  Switch,
  Select,
  message,
  Spin,
  Divider,
} from 'antd';
import {
  SearchOutlined,
  DeleteOutlined,
  EditOutlined,
  ArchiveOutlined,
  ExportOutlined,
  BookOutlined,
  LockOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  PlusOutlined,
  FilterOutlined,
  CalendarOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { formatDistanceToNow, format } from 'date-fns';
import styles from './BrowserMemories.module.css';

const { TextArea } = AntInput;
const { Text, Title } = Typography;
const { Option } = Select;

export interface BrowserMemory {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  keyFacts: string[];
  timestamp: Date;
  tags: string[];
  domain: string;
  isArchived: boolean;
  notes?: string;
}

interface BrowserMemoriesProps {
  onMemoryClick?: (memory: BrowserMemory) => void;
  onNavigateToUrl?: (url: string) => void;
}

const BrowserMemories: React.FC<BrowserMemoriesProps> = ({
  onMemoryClick,
  onNavigateToUrl,
}) => {
  const [memories, setMemories] = useState<BrowserMemory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | undefined>();
  // Date range filter (simplified - can be enhanced with DatePicker later)
  // const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'domain'>('date');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingMemory, setEditingMemory] = useState<BrowserMemory | null>(null);
  const [isPrivacyEnabled, setIsPrivacyEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // Load memories from storage
  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      // Try to load from IPC (electron-store) or fallback to localStorage
      if (typeof window !== 'undefined' && (window.api as any)?.getBrowserMemories) {
        const stored = await (window.api as any).getBrowserMemories();
        if (stored) {
          setMemories(stored.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })));
        }
      } else {
        // Fallback to localStorage
        const stored = localStorage.getItem('browser-memories');
        if (stored) {
          const parsed = JSON.parse(stored);
          setMemories(parsed.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          })));
        }
      }
    } catch (error) {
      console.error('Failed to load memories:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveMemories = useCallback(async (newMemories: BrowserMemory[]) => {
    try {
      // Try to save via IPC or fallback to localStorage
      if (typeof window !== 'undefined' && (window.api as any)?.saveBrowserMemories) {
        await (window.api as any).saveBrowserMemories(newMemories);
      } else {
        localStorage.setItem('browser-memories', JSON.stringify(newMemories));
      }
      setMemories(newMemories);
    } catch (error) {
      console.error('Failed to save memories:', error);
      message.error('Failed to save memories');
    }
  }, []);

  // Extract unique tags and domains
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    memories.forEach((m) => m.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [memories]);

  const allDomains = useMemo(() => {
    const domainSet = new Set<string>();
    memories.forEach((m) => domainSet.add(m.domain));
    return Array.from(domainSet).sort();
  }, [memories]);

  // Filter and sort memories
  const filteredMemories = useMemo(() => {
    let filtered = memories.filter((m) => !m.isArchived);

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.title.toLowerCase().includes(query) ||
          m.url.toLowerCase().includes(query) ||
          m.keyFacts.some((fact) => fact.toLowerCase().includes(query)) ||
          m.notes?.toLowerCase().includes(query)
      );
    }

    // Tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter((m) =>
        selectedTags.some((tag) => m.tags.includes(tag))
      );
    }

    // Domain filter
    if (selectedDomain) {
      filtered = filtered.filter((m) => m.domain === selectedDomain);
    }

    // Date range filter (disabled for now - can be enhanced later)
    // if (dateRange[0] || dateRange[1]) {
    //   filtered = filtered.filter((m) => {
    //     const memDate = m.timestamp.getTime();
    //     if (dateRange[0] && memDate < dateRange[0].getTime()) return false;
    //     if (dateRange[1] && memDate > dateRange[1].getTime()) return false;
    //     return true;
    //   });
    // }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'domain':
          return a.domain.localeCompare(b.domain);
        case 'date':
        default:
          return b.timestamp.getTime() - a.timestamp.getTime();
      }
    });

    return filtered;
  }, [memories, searchQuery, selectedTags, selectedDomain, sortBy]);

  const handleSaveMemory = useCallback(
    async (values: any) => {
      const memory: BrowserMemory = {
        id: editingMemory?.id || `memory-${Date.now()}`,
        title: values.title,
        url: values.url,
        favicon: values.favicon,
        keyFacts: values.keyFacts
          ? values.keyFacts.split('\n').filter((f: string) => f.trim())
          : [],
        tags: values.tags || [],
        domain: new URL(values.url).hostname,
        timestamp: editingMemory?.timestamp || new Date(),
        isArchived: editingMemory?.isArchived || false,
        notes: values.notes,
      };

      const updated = editingMemory
        ? memories.map((m) => (m.id === editingMemory.id ? memory : m))
        : [...memories, memory];

      await saveMemories(updated);
      setIsModalVisible(false);
      setEditingMemory(null);
      form.resetFields();
      message.success(editingMemory ? 'Memory updated' : 'Memory saved');
    },
    [memories, editingMemory, form, saveMemories]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const updated = memories.filter((m) => m.id !== id);
      await saveMemories(updated);
      message.success('Memory deleted');
    },
    [memories, saveMemories]
  );

  const handleArchive = useCallback(
    async (id: string) => {
      const updated = memories.map((m) =>
        m.id === id ? { ...m, isArchived: true } : m
      );
      await saveMemories(updated);
      message.success('Memory archived');
    },
    [memories, saveMemories]
  );

  const handleExport = useCallback(() => {
    const dataStr = JSON.stringify(memories, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `browser-memories-${format(new Date(), 'yyyy-MM-dd')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    message.success('Memories exported');
  }, [memories]);

  const handleNewMemory = useCallback(() => {
    setEditingMemory(null);
    form.resetFields();
    setIsModalVisible(true);
  }, [form]);

  const handleEdit = useCallback(
    (memory: BrowserMemory) => {
      setEditingMemory(memory);
      form.setFieldsValue({
        title: memory.title,
        url: memory.url,
        favicon: memory.favicon,
        keyFacts: memory.keyFacts.join('\n'),
        tags: memory.tags,
        notes: memory.notes,
      });
      setIsModalVisible(true);
    },
    [form]
  );

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <Title level={4} className={styles.title}>
          <BookOutlined /> Browser Memories
        </Title>
        <Space>
          <Switch
            checked={isPrivacyEnabled}
            onChange={setIsPrivacyEnabled}
            checkedChildren={<EyeOutlined />}
            unCheckedChildren={<EyeInvisibleOutlined />}
          />
          <Button
            icon={<ExportOutlined />}
            onClick={handleExport}
            disabled={memories.length === 0}
          >
            Export
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleNewMemory}>
            New Memory
          </Button>
        </Space>
      </div>

      {/* Search and Filters */}
      <div className={styles.filters}>
        <Input
          placeholder="Search memories..."
          prefix={<SearchOutlined />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
        <Space className={styles.filterControls}>
          <Select
            mode="tags"
            placeholder="Filter by tags"
            value={selectedTags}
            onChange={setSelectedTags}
            style={{ minWidth: 200 }}
            allowClear
          >
            {allTags.map((tag) => (
              <Option key={tag} value={tag}>
                {tag}
              </Option>
            ))}
          </Select>
          <Select
            placeholder="Filter by domain"
            value={selectedDomain}
            onChange={setSelectedDomain}
            style={{ minWidth: 200 }}
            allowClear
          >
            {allDomains.map((domain) => (
              <Option key={domain} value={domain}>
                {domain}
              </Option>
            ))}
          </Select>
          <Select
            value={sortBy}
            onChange={setSortBy}
            style={{ width: 150 }}
          >
            <Option value="date">Sort by Date</Option>
            <Option value="title">Sort by Title</Option>
            <Option value="domain">Sort by Domain</Option>
          </Select>
        </Space>
      </div>

      {/* Memories List */}
      <div className={styles.memoriesList}>
        {loading ? (
          <Spin size="large" style={{ display: 'block', textAlign: 'center', padding: '40px' }} />
        ) : filteredMemories.length === 0 ? (
          <Empty
            description="No memories found"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={handleNewMemory}>
              Create First Memory
            </Button>
          </Empty>
        ) : (
          <div className={styles.memoriesGrid}>
            {filteredMemories.map((memory) => (
              <Card
                key={memory.id}
                className={styles.memoryCard}
                hoverable
                actions={[
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(memory)}
                    key="edit"
                  />,
                  <Popconfirm
                    title="Archive this memory?"
                    onConfirm={() => handleArchive(memory.id)}
                    key="archive"
                  >
                    <Button type="text" icon={<ArchiveOutlined />} />
                  </Popconfirm>,
                  <Popconfirm
                    title="Delete this memory?"
                    onConfirm={() => handleDelete(memory.id)}
                    key="delete"
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <div
                  className={styles.memoryContent}
                  onClick={() => {
                    onMemoryClick?.(memory);
                    onNavigateToUrl?.(memory.url);
                  }}
                >
                  <div className={styles.memoryHeader}>
                    {memory.favicon && (
                      <img
                        src={memory.favicon}
                        alt=""
                        className={styles.favicon}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div className={styles.memoryTitle}>
                      <Text strong>{memory.title}</Text>
                      <Text type="secondary" className={styles.domain}>
                        {memory.domain}
                      </Text>
                    </div>
                  </div>
                  <Text type="secondary" className={styles.timestamp}>
                    {formatDistanceToNow(memory.timestamp, { addSuffix: true })}
                  </Text>
                  <div className={styles.keyFacts}>
                    {memory.keyFacts.slice(0, 3).map((fact, idx) => (
                      <Text key={idx} className={styles.fact}>
                        • {fact}
                      </Text>
                    ))}
                    {memory.keyFacts.length > 3 && (
                      <Text type="secondary">
                        +{memory.keyFacts.length - 3} more
                      </Text>
                    )}
                  </div>
                  {memory.tags.length > 0 && (
                    <div className={styles.tags}>
                      {memory.tags.map((tag) => (
                        <Tag key={tag} icon={<TagOutlined />}>
                          {tag}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit/Create Modal */}
      <Modal
        title={editingMemory ? 'Edit Memory' : 'New Memory'}
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false);
          setEditingMemory(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        width={600}
      >
        <Form form={form} onFinish={handleSaveMemory} layout="vertical">
          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: 'Please enter a title' }]}
          >
            <Input placeholder="Page title" />
          </Form.Item>
          <Form.Item
            name="url"
            label="URL"
            rules={[
              { required: true, message: 'Please enter a URL' },
              { type: 'url', message: 'Please enter a valid URL' },
            ]}
          >
            <Input placeholder="https://example.com" />
          </Form.Item>
          <Form.Item name="favicon" label="Favicon URL (optional)">
            <Input placeholder="https://example.com/favicon.ico" />
          </Form.Item>
          <Form.Item
            name="keyFacts"
            label="Key Facts (one per line)"
            rules={[{ required: true, message: 'Please enter at least one key fact' }]}
          >
            <TextArea
              rows={4}
              placeholder="Enter key facts, one per line..."
            />
          </Form.Item>
          <Form.Item name="tags" label="Tags">
            <Select
              mode="tags"
              placeholder="Add tags"
              tokenSeparators={[',']}
            />
          </Form.Item>
          <Form.Item name="notes" label="Notes (optional)">
            <TextArea rows={3} placeholder="Additional notes..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default BrowserMemories;

