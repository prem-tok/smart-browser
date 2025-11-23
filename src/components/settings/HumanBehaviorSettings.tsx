import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Switch,
  Slider,
  InputNumber,
  Form,
  Button,
  Space,
  Divider,
  Typography,
  Collapse,
  Row,
  Col,
  message,
  Badge,
} from 'antd';
import {
  SaveOutlined,
  ReloadOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  ShakeOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useHumanBehaviorStore } from '@/stores/humanBehaviorStore';
import type { HumanBehaviorSettings } from '@/stores/humanBehaviorStore';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

/**
 * Human Behavior Settings Component
 * Provides UI for configuring human-like automation behavior
 */
export default function HumanBehaviorSettings() {
  const {
    settings,
    isDirty,
    updateSettings,
    resetToDefaults,
    loadSettings,
    saveSettings,
    applyPreset,
    markDirty,
  } = useHumanBehaviorStore();

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    clickDelay: string;
    typeSpeed: string;
    scrollSpeed: string;
    breakInterval: string;
  }>({
    clickDelay: '',
    typeSpeed: '',
    scrollSpeed: '',
    breakInterval: '',
  });

  // Load settings on mount
  useEffect(() => {
    setLoading(true);
    loadSettings().finally(() => setLoading(false));
  }, [loadSettings]);

  // Update preview when settings change
  useEffect(() => {
    updatePreview();
  }, [settings]);

  const updatePreview = () => {
    const avgDelay = (settings.delayBetweenActions.min + settings.delayBetweenActions.max) / 2;
    const avgWPM = (settings.typingSpeed.min + settings.typingSpeed.max) / 2;
    const avgBreak = (settings.breakDuration.min + settings.breakDuration.max) / 2;

    setPreviewData({
      clickDelay: `${settings.advanced.clickDelayBefore.min}-${settings.advanced.clickDelayBefore.max}ms`,
      typeSpeed: `${avgWPM.toFixed(0)} WPM (${settings.typingSpeed.min}-${settings.typingSpeed.max})`,
      scrollSpeed: `${settings.mouseMovementSpeed} px/s`,
      breakInterval: `Every ${settings.breakFrequency} actions, ${(avgBreak / 1000).toFixed(1)}s break`,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings();
      message.success('Human behavior settings saved successfully');
      markDirty(false);
    } catch (error: any) {
      message.error(`Failed to save settings: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    resetToDefaults();
    message.info('Settings reset to defaults');
  };

  const handlePreset = (preset: 'minimal' | 'normal' | 'highlyRandom') => {
    applyPreset(preset);
    message.success(`Applied ${preset} preset`);
  };

  const handleRandomnessChange = (value: number) => {
    // Map randomness level (1-10) to actual settings
    const intensity = value / 10;
    
    updateSettings({
      randomnessLevel: value,
      delayBetweenActions: {
        min: Math.round(500 + intensity * 2000),
        max: Math.round(1000 + intensity * 4000),
      },
      typingSpeed: {
        min: Math.round(60 - intensity * 35),
        max: Math.round(100 - intensity * 50),
      },
      mouseMovementSpeed: Math.round(1200 - intensity * 700),
      breakFrequency: Math.max(5, Math.round(20 - intensity * 15)),
      breakDuration: {
        min: Math.round(2000 + intensity * 8000),
        max: Math.round(5000 + intensity * 25000),
      },
      advanced: {
        ...settings.advanced,
        clickDelayBefore: {
          min: Math.round(30 + intensity * 120),
          max: Math.round(100 + intensity * 400),
        },
        clickDelayAfter: {
          min: Math.round(50 + intensity * 200),
          max: Math.round(150 + intensity * 450),
        },
        typingMistakeProbability: intensity * 0.08,
        overshootProbability: intensity * 0.2,
        jitterAmount: Math.round(1 + intensity * 5),
      },
    });
  };

  const randomnessLabel = useMemo(() => {
    if (settings.randomnessLevel <= 3) return 'Minimal';
    if (settings.randomnessLevel <= 6) return 'Normal';
    if (settings.randomnessLevel <= 8) return 'High';
    return 'Extreme';
  }, [settings.randomnessLevel]);

  return (
    <div className="human-behavior-settings p-6">
      <div className="mb-6">
        <Title level={4} className="!text-text-01-dark !mb-2">
          Human Behavior Settings
        </Title>
        <Paragraph className="!text-text-12-dark !mb-0">
          Configure how the automation behaves to appear more human-like. Higher randomness makes actions slower but more natural.
        </Paragraph>
      </div>

      <Card
        className="!bg-main-view !border-border-message mb-4"
        bodyStyle={{ padding: '24px' }}
      >
        {/* Enable/Disable Toggle */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <Text strong className="text-text-01-dark">
                Enable Human Behavior
              </Text>
              <br />
              <Text type="secondary" className="text-text-12-dark text-sm">
                Toggle human-like automation behavior on/off
              </Text>
            </div>
            <Badge
              status={settings.enabled ? 'success' : 'default'}
              text={settings.enabled ? 'Enabled' : 'Disabled'}
              className="mr-4"
            />
            <Switch
              checked={settings.enabled}
              onChange={(checked) => updateSettings({ enabled: checked })}
              size="default"
            />
          </div>
        </div>

        {settings.enabled && (
          <>
            <Divider className="!border-border-message !my-6" />

            {/* Randomness Level Slider */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <Text strong className="text-text-01-dark">
                    Randomness Level
                  </Text>
                  <br />
                  <Text type="secondary" className="text-text-12-dark text-sm">
                    Controls overall randomness and delay intensity
                  </Text>
                </div>
                <Badge
                  count={randomnessLabel}
                  style={{
                    backgroundColor: settings.randomnessLevel <= 3 ? '#52c41a' : 
                                   settings.randomnessLevel <= 6 ? '#1890ff' : 
                                   settings.randomnessLevel <= 8 ? '#faad14' : '#ff4d4f',
                  }}
                  className="px-3 py-1 rounded"
                />
              </div>
              <Slider
                min={1}
                max={10}
                value={settings.randomnessLevel}
                onChange={handleRandomnessChange}
                marks={{
                  1: 'Min',
                  5: 'Med',
                  10: 'Max',
                }}
                tooltip={{ formatter: (value) => `${value}/10` }}
                className="mb-2"
              />
              <div className="flex justify-between text-xs text-text-12-dark">
                <span>Fast & Predictable</span>
                <span>Slow & Random</span>
              </div>
            </div>

            <Divider className="!border-border-message !my-6" />

            {/* Basic Settings */}
            <Row gutter={[16, 16]} className="mb-6">
              <Col xs={24} sm={12}>
                <div>
                  <Text strong className="text-text-01-dark block mb-2">
                    Delay Between Actions (ms)
                  </Text>
                  <Space>
                    <InputNumber
                      min={0}
                      max={10000}
                      value={settings.delayBetweenActions.min}
                      onChange={(val) =>
                        updateSettings({
                          delayBetweenActions: {
                            ...settings.delayBetweenActions,
                            min: val || 0,
                          },
                        })
                      }
                      className="!bg-main-view !border-border-message !text-text-01-dark w-24"
                    />
                    <span className="text-text-12-dark">to</span>
                    <InputNumber
                      min={0}
                      max={10000}
                      value={settings.delayBetweenActions.max}
                      onChange={(val) =>
                        updateSettings({
                          delayBetweenActions: {
                            ...settings.delayBetweenActions,
                            max: val || 0,
                          },
                        })
                      }
                      className="!bg-main-view !border-border-message !text-text-01-dark w-24"
                    />
                  </Space>
                </div>
              </Col>

              <Col xs={24} sm={12}>
                <div>
                  <Text strong className="text-text-01-dark block mb-2">
                    Typing Speed (WPM)
                  </Text>
                  <Space>
                    <InputNumber
                      min={10}
                      max={150}
                      value={settings.typingSpeed.min}
                      onChange={(val) =>
                        updateSettings({
                          typingSpeed: {
                            ...settings.typingSpeed,
                            min: val || 10,
                          },
                        })
                      }
                      className="!bg-main-view !border-border-message !text-text-01-dark w-24"
                    />
                    <span className="text-text-12-dark">to</span>
                    <InputNumber
                      min={10}
                      max={150}
                      value={settings.typingSpeed.max}
                      onChange={(val) =>
                        updateSettings({
                          typingSpeed: {
                            ...settings.typingSpeed,
                            max: val || 150,
                          },
                        })
                      }
                      className="!bg-main-view !border-border-message !text-text-01-dark w-24"
                    />
                  </Space>
                </div>
              </Col>

              <Col xs={24} sm={12}>
                <div>
                  <Text strong className="text-text-01-dark block mb-2">
                    Mouse Movement Speed (px/s)
                  </Text>
                  <InputNumber
                    min={100}
                    max={2000}
                    value={settings.mouseMovementSpeed}
                    onChange={(val) =>
                      updateSettings({ mouseMovementSpeed: val || 800 })
                    }
                    className="!bg-main-view !border-border-message !text-text-01-dark w-full"
                  />
                </div>
              </Col>

              <Col xs={24} sm={12}>
                <div>
                  <Text strong className="text-text-01-dark block mb-2">
                    Break Frequency
                  </Text>
                  <InputNumber
                    min={1}
                    max={50}
                    value={settings.breakFrequency}
                    onChange={(val) =>
                      updateSettings({ breakFrequency: val || 10 })
                    }
                    addonAfter="actions"
                    className="!bg-main-view !border-border-message !text-text-01-dark w-full"
                  />
                  <Text type="secondary" className="text-xs text-text-12-dark block mt-1">
                    Pause after this many actions
                  </Text>
                </div>
              </Col>

              <Col xs={24} sm={12}>
                <div>
                  <Text strong className="text-text-01-dark block mb-2">
                    Break Duration (ms)
                  </Text>
                  <Space>
                    <InputNumber
                      min={0}
                      max={60000}
                      value={settings.breakDuration.min}
                      onChange={(val) =>
                        updateSettings({
                          breakDuration: {
                            ...settings.breakDuration,
                            min: val || 0,
                          },
                        })
                      }
                      className="!bg-main-view !border-border-message !text-text-01-dark w-24"
                    />
                    <span className="text-text-12-dark">to</span>
                    <InputNumber
                      min={0}
                      max={60000}
                      value={settings.breakDuration.max}
                      onChange={(val) =>
                        updateSettings({
                          breakDuration: {
                            ...settings.breakDuration,
                            max: val || 60000,
                          },
                        })
                      }
                      className="!bg-main-view !border-border-message !text-text-01-dark w-24"
                    />
                  </Space>
                </div>
              </Col>
            </Row>

            <Divider className="!border-border-message !my-6" />

            {/* Preset Buttons */}
            <div className="mb-6">
              <Text strong className="text-text-01-dark block mb-3">
                Quick Presets
              </Text>
              <Space wrap>
                <Button
                  icon={<RocketOutlined />}
                  onClick={() => handlePreset('minimal')}
                  className="!border-border-message !text-text-01-dark hover:!border-primary"
                >
                  Minimal
                </Button>
                <Button
                  icon={<ThunderboltOutlined />}
                  onClick={() => handlePreset('normal')}
                  className="!border-border-message !text-text-01-dark hover:!border-primary"
                >
                  Normal
                </Button>
                <Button
                  icon={<ShakeOutlined />}
                  onClick={() => handlePreset('highlyRandom')}
                  className="!border-border-message !text-text-01-dark hover:!border-primary"
                >
                  Highly Random
                </Button>
              </Space>
            </div>

            <Divider className="!border-border-message !my-6" />

            {/* Advanced Settings Accordion */}
            <Collapse
              ghost
              className="!bg-transparent"
              expandIcon={({ isActive }) => (
                <SettingOutlined rotate={isActive ? 90 : 0} className="!text-text-12-dark" />
              )}
            >
              <Panel
                header={
                  <Text strong className="text-text-01-dark">
                    Advanced Settings
                  </Text>
                }
                key="advanced"
                className="!border-border-message"
              >
                <Row gutter={[16, 16]}>
                  <Col xs={24} sm={12}>
                    <div>
                      <Text className="text-text-01-dark block mb-2">
                        Click Delay Before (ms)
                      </Text>
                      <Space>
                        <InputNumber
                          min={0}
                          max={1000}
                          value={settings.advanced.clickDelayBefore.min}
                          onChange={(val) =>
                            updateSettings({
                              advanced: {
                                ...settings.advanced,
                                clickDelayBefore: {
                                  ...settings.advanced.clickDelayBefore,
                                  min: val || 0,
                                },
                              },
                            })
                          }
                          className="!bg-main-view !border-border-message !text-text-01-dark w-24"
                        />
                        <span className="text-text-12-dark">to</span>
                        <InputNumber
                          min={0}
                          max={1000}
                          value={settings.advanced.clickDelayBefore.max}
                          onChange={(val) =>
                            updateSettings({
                              advanced: {
                                ...settings.advanced,
                                clickDelayBefore: {
                                  ...settings.advanced.clickDelayBefore,
                                  max: val || 1000,
                                },
                              },
                            })
                          }
                          className="!bg-main-view !border-border-message !text-text-01-dark w-24"
                        />
                      </Space>
                    </div>
                  </Col>

                  <Col xs={24} sm={12}>
                    <div>
                      <Text className="text-text-01-dark block mb-2">
                        Click Delay After (ms)
                      </Text>
                      <Space>
                        <InputNumber
                          min={0}
                          max={1000}
                          value={settings.advanced.clickDelayAfter.min}
                          onChange={(val) =>
                            updateSettings({
                              advanced: {
                                ...settings.advanced,
                                clickDelayAfter: {
                                  ...settings.advanced.clickDelayAfter,
                                  min: val || 0,
                                },
                              },
                            })
                          }
                          className="!bg-main-view !border-border-message !text-text-01-dark w-24"
                        />
                        <span className="text-text-12-dark">to</span>
                        <InputNumber
                          min={0}
                          max={1000}
                          value={settings.advanced.clickDelayAfter.max}
                          onChange={(val) =>
                            updateSettings({
                              advanced: {
                                ...settings.advanced,
                                clickDelayAfter: {
                                  ...settings.advanced.clickDelayAfter,
                                  max: val || 1000,
                                },
                              },
                            })
                          }
                          className="!bg-main-view !border-border-message !text-text-01-dark w-24"
                        />
                      </Space>
                    </div>
                  </Col>

                  <Col xs={24} sm={12}>
                    <div>
                      <Text className="text-text-01-dark block mb-2">
                        Typing Mistake Probability
                      </Text>
                      <InputNumber
                        min={0}
                        max={0.2}
                        step={0.001}
                        value={settings.advanced.typingMistakeProbability}
                        onChange={(val) =>
                          updateSettings({
                            advanced: {
                              ...settings.advanced,
                              typingMistakeProbability: val || 0,
                            },
                          })
                        }
                        formatter={(value) => `${((value || 0) * 100).toFixed(1)}%`}
                        parser={(value) => parseFloat(value?.replace('%', '') || '0') / 100}
                        className="!bg-main-view !border-border-message !text-text-01-dark w-full"
                      />
                    </div>
                  </Col>

                  <Col xs={24} sm={12}>
                    <div>
                      <Text className="text-text-01-dark block mb-2">
                        Scroll Speed Variation
                      </Text>
                      <Space>
                        <InputNumber
                          min={0.1}
                          max={2.0}
                          step={0.1}
                          value={settings.advanced.scrollSpeedVariation.min}
                          onChange={(val) =>
                            updateSettings({
                              advanced: {
                                ...settings.advanced,
                                scrollSpeedVariation: {
                                  ...settings.advanced.scrollSpeedVariation,
                                  min: val || 0.1,
                                },
                              },
                            })
                          }
                          className="!bg-main-view !border-border-message !text-text-01-dark w-24"
                        />
                        <span className="text-text-12-dark">to</span>
                        <InputNumber
                          min={0.1}
                          max={2.0}
                          step={0.1}
                          value={settings.advanced.scrollSpeedVariation.max}
                          onChange={(val) =>
                            updateSettings({
                              advanced: {
                                ...settings.advanced,
                                scrollSpeedVariation: {
                                  ...settings.advanced.scrollSpeedVariation,
                                  max: val || 2.0,
                                },
                              },
                            })
                          }
                          className="!bg-main-view !border-border-message !text-text-01-dark w-24"
                        />
                      </Space>
                    </div>
                  </Col>

                  <Col xs={24} sm={12}>
                    <div>
                      <Text className="text-text-01-dark block mb-2">
                        Mouse Overshoot Probability
                      </Text>
                      <InputNumber
                        min={0}
                        max={1}
                        step={0.01}
                        value={settings.advanced.overshootProbability}
                        onChange={(val) =>
                          updateSettings({
                            advanced: {
                              ...settings.advanced,
                              overshootProbability: val || 0,
                            },
                          })
                        }
                        formatter={(value) => `${((value || 0) * 100).toFixed(0)}%`}
                        parser={(value) => parseFloat(value?.replace('%', '') || '0') / 100}
                        className="!bg-main-view !border-border-message !text-text-01-dark w-full"
                      />
                    </div>
                  </Col>

                  <Col xs={24} sm={12}>
                    <div>
                      <Text className="text-text-01-dark block mb-2">
                        Mouse Jitter Amount (px)
                      </Text>
                      <InputNumber
                        min={0}
                        max={20}
                        value={settings.advanced.jitterAmount}
                        onChange={(val) =>
                          updateSettings({
                            advanced: {
                              ...settings.advanced,
                              jitterAmount: val || 0,
                            },
                          })
                        }
                        className="!bg-main-view !border-border-message !text-text-01-dark w-full"
                      />
                    </div>
                  </Col>
                </Row>
              </Panel>
            </Collapse>

            <Divider className="!border-border-message !my-6" />

            {/* Real-time Preview */}
            <Card
              className="!bg-tool-call !border-border-message"
              title={
                <Text strong className="text-text-01-dark">
                  Behavior Preview
                </Text>
              }
            >
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12}>
                  <div>
                    <Text type="secondary" className="text-xs text-text-12-dark block mb-1">
                      Click Delay
                    </Text>
                    <Text strong className="text-text-01-dark">
                      {previewData.clickDelay}
                    </Text>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div>
                    <Text type="secondary" className="text-xs text-text-12-dark block mb-1">
                      Typing Speed
                    </Text>
                    <Text strong className="text-text-01-dark">
                      {previewData.typeSpeed}
                    </Text>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div>
                    <Text type="secondary" className="text-xs text-text-12-dark block mb-1">
                      Mouse Movement
                    </Text>
                    <Text strong className="text-text-01-dark">
                      {previewData.scrollSpeed}
                    </Text>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div>
                    <Text type="secondary" className="text-xs text-text-12-dark block mb-1">
                      Break Pattern
                    </Text>
                    <Text strong className="text-text-01-dark">
                      {previewData.breakInterval}
                    </Text>
                  </div>
                </Col>
              </Row>
            </Card>
          </>
        )}
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          icon={<ReloadOutlined />}
          onClick={handleReset}
          className="!border-border-message !text-text-01-dark"
        >
          Reset
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
          disabled={!isDirty}
          className="!bg-primary hover:!bg-primary-hover"
        >
          Save Settings
        </Button>
      </div>
    </div>
  );
}

