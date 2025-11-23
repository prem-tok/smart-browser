import React from 'react';
import { Button, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import HumanBehaviorSettings from '@/components/settings/HumanBehaviorSettings';

const { Title, Paragraph } = Typography;

/**
 * Human Behavior Settings Page
 * Standalone page for configuring human-like automation behavior
 */
export default function HumanBehaviorSettingsPage() {
  const router = useRouter();
  const { t } = useTranslation('toolbox');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a1929 0%, #1a2332 100%)',
    }}>
      {/* Draggable Top Navigation Bar */}
      <div style={{
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push('/toolbox')}
          style={{
            color: '#fff',
            fontSize: '14px',
            padding: '6px 12px',
            height: 'auto',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          {t('back_to_toolbox') || 'Back to Toolbox'}
        </Button>
      </div>

      {/* Main Content */}
      <div style={{ padding: '32px 48px', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <Title level={1} style={{
            margin: 0,
            color: '#fff',
            fontSize: '36px',
            fontWeight: 700,
            letterSpacing: '-0.5px'
          }}>
            Human Behavior Settings
          </Title>
          <Paragraph style={{
            color: 'rgba(255, 255, 255, 0.65)',
            fontSize: '15px',
            margin: '10px 0 0 0',
            maxWidth: '600px'
          }}>
            Configure how automation behaves to appear more human-like. Adjust randomness, delays, and interaction patterns.
          </Paragraph>
        </div>

        {/* Settings Component */}
        <HumanBehaviorSettings />
      </div>
    </div>
  );
}

