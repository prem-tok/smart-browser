/**
 * Settings Panel Component
 * Comprehensive settings interface with tabbed sections
 */

import React, { useState, useEffect } from 'react';
import {
  Tabs,
  Form,
  Input,
  Select,
  Switch,
  Slider,
  Button,
  Card,
  Typography,
  Divider,
  Space,
  InputNumber,
  message,
  Modal,
  Checkbox,
} from 'antd';
import {
  SettingOutlined,
  RobotOutlined,
  LockOutlined,
  UserOutlined,
  ExtensionOutlined,
  SaveOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/router';
import HumanBehaviorSettings from './HumanBehaviorSettings';
import styles from './SettingsPanel.module.css';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface SettingsPanelProps {
  onClose?: () => void;
}

interface GeneralSettings {
  defaultSearchEngine: string;
  homePageUrl: string;
  theme: 'light' | 'dark' | 'auto';
  density: 'comfortable' | 'compact';
  language: string;
}

interface AISettings {
  model: string;
  temperature: number;
  maxTokens: number;
  customInstructions: string;
  enableBrowserMemories: boolean;
}

interface PrivacySettings {
  enableCookies: boolean;
  enablePasswordManager: boolean;
  enableTrackingProtection: boolean;
  enableDataSharing: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const router = useRouter();
  const [generalForm] = Form.useForm();
  const [aiForm] = Form.useForm();
  const [privacyForm] = Form.useForm();
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // Load general settings
      if (typeof window !== 'undefined' && (window.api as any)?.getSettings) {
        const settings = await (window.api as any).getSettings();
        if (settings) {
          generalForm.setFieldsValue(settings.general || {});
          aiForm.setFieldsValue(settings.ai || {});
          privacyForm.setFieldsValue(settings.privacy || {});
        }
      } else {
        // Fallback to localStorage
        const general = JSON.parse(localStorage.getItem('settings-general') || '{}');
        const ai = JSON.parse(localStorage.getItem('settings-ai') || '{}');
        const privacy = JSON.parse(localStorage.getItem('settings-privacy') || '{}');
        
        generalForm.setFieldsValue(general);
        aiForm.setFieldsValue(ai);
        privacyForm.setFieldsValue(privacy);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveGeneralSettings = async (values: GeneralSettings) => {
    try {
      if (typeof window !== 'undefined' && (window.api as any)?.saveSettings) {
        await (window.api as any).saveSettings({ general: values });
      } else {
        localStorage.setItem('settings-general', JSON.stringify(values));
      }
      message.success('General settings saved');
    } catch (error) {
      message.error('Failed to save settings');
    }
  };

  const saveAISettings = async (values: AISettings) => {
    try {
      if (typeof window !== 'undefined' && (window.api as any)?.saveSettings) {
        await (window.api as any).saveSettings({ ai: values });
      } else {
        localStorage.setItem('settings-ai', JSON.stringify(values));
      }
      message.success('AI settings saved');
    } catch (error) {
      message.error('Failed to save settings');
    }
  };

  const savePrivacySettings = async (values: PrivacySettings) => {
    try {
      if (typeof window !== 'undefined' && (window.api as any)?.saveSettings) {
        await (window.api as any).saveSettings({ privacy: values });
      } else {
        localStorage.setItem('settings-privacy', JSON.stringify(values));
      }
      message.success('Privacy settings saved');
    } catch (error) {
      message.error('Failed to save settings');
    }
  };

  const handleClearBrowsingData = () => {
    Modal.confirm({
      title: 'Clear Browsing Data',
      content: 'This will clear all browsing history, cookies, and cached data. This action cannot be undone.',
      okText: 'Clear',
      okType: 'danger',
      onOk: async () => {
        try {
          if (typeof window !== 'undefined' && (window.api as any)?.clearBrowsingData) {
            await (window.api as any).clearBrowsingData();
          } else {
            // Clear localStorage items
            const keys = Object.keys(localStorage);
            keys.forEach((key) => {
              if (key.startsWith('browser-') || key.startsWith('history-')) {
                localStorage.removeItem(key);
              }
            });
          }
          message.success('Browsing data cleared');
        } catch (error) {
          message.error('Failed to clear browsing data');
        }
      },
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Title level={3}>
          <SettingOutlined /> Settings
        </Title>
        {onClose && (
          <Button type="text" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        className={styles.tabs}
        items={[
          {
            key: 'general',
            label: (
              <span>
                <SettingOutlined /> General
              </span>
            ),
            children: (
              <Card className={styles.tabContent}>
                <Form
                  form={generalForm}
                  layout="vertical"
                  onFinish={saveGeneralSettings}
                  initialValues={{
                    defaultSearchEngine: 'google',
                    homePageUrl: 'about:newtab',
                    theme: 'auto',
                    density: 'comfortable',
                    language: 'en',
                  }}
                >
                  <Title level={4}>Search & Navigation</Title>
                  <Form.Item name="defaultSearchEngine" label="Default Search Engine">
                    <Select>
                      <Option value="google">Google</Option>
                      <Option value="bing">Bing</Option>
                      <Option value="duckduckgo">DuckDuckGo</Option>
                      <Option value="chatgpt">ChatGPT</Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="homePageUrl" label="Home Page URL">
                    <Input placeholder="about:newtab" />
                  </Form.Item>

                  <Divider />

                  <Title level={4}>Appearance</Title>
                  <Form.Item name="theme" label="Theme">
                    <Select>
                      <Option value="light">Light</Option>
                      <Option value="dark">Dark</Option>
                      <Option value="auto">Auto (System)</Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="density" label="UI Density">
                    <Select>
                      <Option value="comfortable">Comfortable</Option>
                      <Option value="compact">Compact</Option>
                    </Select>
                  </Form.Item>

                  <Divider />

                  <Title level={4}>Language</Title>
                  <Form.Item name="language" label="Language">
                    <Select>
                      <Option value="en">English</Option>
                      <Option value="zh">中文</Option>
                      <Option value="es">Español</Option>
                      <Option value="fr">Français</Option>
                      <Option value="de">Deutsch</Option>
                    </Select>
                  </Form.Item>

                  <Form.Item>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                      Save General Settings
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            ),
          },
          {
            key: 'ai',
            label: (
              <span>
                <RobotOutlined /> AI Assistant
              </span>
            ),
            children: (
              <Card className={styles.tabContent}>
                <Form
                  form={aiForm}
                  layout="vertical"
                  onFinish={saveAISettings}
                  initialValues={{
                    model: 'gpt-4',
                    temperature: 0.7,
                    maxTokens: 2000,
                    customInstructions: '',
                    enableBrowserMemories: true,
                  }}
                >
                  <Title level={4}>Model Configuration</Title>
                  <Form.Item name="model" label="AI Model">
                    <Select>
                      <Option value="gpt-4">GPT-4</Option>
                      <Option value="gpt-4o">GPT-4o</Option>
                      <Option value="gpt-3.5-turbo">GPT-3.5 Turbo</Option>
                      <Option value="claude-3-opus">Claude 3 Opus</Option>
                      <Option value="claude-3-sonnet">Claude 3 Sonnet</Option>
                    </Select>
                  </Form.Item>
                  <Form.Item
                    name="temperature"
                    label={`Temperature: ${aiForm.getFieldValue('temperature') || 0.7}`}
                  >
                    <Slider min={0} max={2} step={0.1} />
                  </Form.Item>
                  <Form.Item name="maxTokens" label="Max Tokens">
                    <InputNumber min={100} max={8000} step={100} style={{ width: '100%' }} />
                  </Form.Item>

                  <Divider />

                  <Title level={4}>Custom Instructions</Title>
                  <Form.Item name="customInstructions" label="System Instructions">
                    <TextArea
                      rows={6}
                      placeholder="Enter custom instructions for the AI assistant..."
                    />
                  </Form.Item>

                  <Divider />

                  <Title level={4}>Features</Title>
                  <Form.Item name="enableBrowserMemories" valuePropName="checked">
                    <Space>
                      <Switch />
                      <Text>Enable Browser Memories</Text>
                    </Space>
                    <Paragraph type="secondary" style={{ marginTop: 8 }}>
                      Allow the AI to save and recall page contexts for better assistance
                    </Paragraph>
                  </Form.Item>

                  <Form.Item>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                      Save AI Settings
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            ),
          },
          {
            key: 'privacy',
            label: (
              <span>
                <LockOutlined /> Privacy & Security
              </span>
            ),
            children: (
              <Card className={styles.tabContent}>
                <Form
                  form={privacyForm}
                  layout="vertical"
                  onFinish={savePrivacySettings}
                  initialValues={{
                    enableCookies: true,
                    enablePasswordManager: true,
                    enableTrackingProtection: true,
                    enableDataSharing: false,
                  }}
                >
                  <Title level={4}>Cookie Settings</Title>
                  <Form.Item name="enableCookies" valuePropName="checked">
                    <Space>
                      <Switch />
                      <Text>Enable Cookies</Text>
                    </Space>
                    <Paragraph type="secondary" style={{ marginTop: 8 }}>
                      Allow websites to store cookies for better functionality
                    </Paragraph>
                  </Form.Item>

                  <Divider />

                  <Title level={4}>Security</Title>
                  <Form.Item name="enablePasswordManager" valuePropName="checked">
                    <Space>
                      <Switch />
                      <Text>Enable Password Manager</Text>
                    </Space>
                    <Paragraph type="secondary" style={{ marginTop: 8 }}>
                      Automatically save and fill passwords
                    </Paragraph>
                  </Form.Item>
                  <Form.Item name="enableTrackingProtection" valuePropName="checked">
                    <Space>
                      <Switch />
                      <Text>Enable Tracking Protection</Text>
                    </Space>
                    <Paragraph type="secondary" style={{ marginTop: 8 }}>
                      Block tracking scripts and protect your privacy
                    </Paragraph>
                  </Form.Item>

                  <Divider />

                  <Title level={4}>Data Sharing</Title>
                  <Form.Item name="enableDataSharing" valuePropName="checked">
                    <Space>
                      <Switch />
                      <Text>Enable Data Sharing</Text>
                    </Space>
                    <Paragraph type="secondary" style={{ marginTop: 8 }}>
                      Share usage data to improve the application (anonymized)
                    </Paragraph>
                  </Form.Item>

                  <Divider />

                  <Title level={4}>Clear Browsing Data</Title>
                  <Paragraph>
                    Remove browsing history, cookies, and cached data
                  </Paragraph>
                  <Button
                    danger
                    onClick={handleClearBrowsingData}
                    icon={<ReloadOutlined />}
                  >
                    Clear Browsing Data
                  </Button>

                  <Form.Item>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                      Save Privacy Settings
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            ),
          },
          {
            key: 'human-behavior',
            label: (
              <span>
                <UserOutlined /> Human Behavior
              </span>
            ),
            children: (
              <Card className={styles.tabContent}>
                <HumanBehaviorSettings />
              </Card>
            ),
          },
          {
            key: 'extensions',
            label: (
              <span>
                <ExtensionOutlined /> Extensions
              </span>
            ),
            children: (
              <Card className={styles.tabContent}>
                <Title level={4}>Extensions</Title>
                <Paragraph>
                  Extension management is coming soon. You'll be able to:
                </Paragraph>
                <ul>
                  <li>Browse and install extensions</li>
                  <li>Manage extension permissions</li>
                  <li>Enable/disable extensions</li>
                  <li>View extension details</li>
                </ul>
                <Button
                  type="primary"
                  icon={<ExtensionOutlined />}
                  onClick={() => message.info('Extension store coming soon')}
                >
                  Open Extension Store
                </Button>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
};

export default SettingsPanel;

