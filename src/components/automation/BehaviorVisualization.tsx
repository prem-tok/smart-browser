import React, { useEffect, useRef, useState } from 'react';
import { Badge, Card, Progress, Tooltip, Space, Typography } from 'antd';
import {
  RobotOutlined,
  MouseOutlined,
  EditOutlined,
  ArrowDownOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useBehaviorVisualizationStore, type BehaviorAction } from '@/stores/behaviorVisualizationStore';

const { Text } = Typography;

/**
 * Action icon mapping
 */
const actionIcons: Record<BehaviorAction, React.ReactNode> = {
  idle: <RobotOutlined />,
  clicking: <MouseOutlined />,
  typing: <EditOutlined />,
  scrolling: <ArrowDownOutlined />,
  hovering: <EyeOutlined />,
  thinking: <ThunderboltOutlined />,
  reading: <EyeOutlined />,
  moving: <MouseOutlined />,
};

/**
 * Action labels
 */
const actionLabels: Record<BehaviorAction, string> = {
  idle: 'Idle',
  clicking: 'Clicking',
  typing: 'Typing',
  scrolling: 'Scrolling',
  hovering: 'Hovering',
  thinking: 'Thinking',
  reading: 'Reading',
  moving: 'Moving',
};

/**
 * Behavior Visualization Component
 * Small overlay showing live human behavior automation status
 */
export default function BehaviorVisualization() {
  const {
    isActive,
    currentAction,
    actionDetails,
    mousePath,
    isDelaying,
    delayDuration,
    delayProgress,
    position,
  } = useBehaviorVisualizationStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const [isMinimized, setIsMinimized] = useState(false);

  // Animate mouse path on canvas
  useEffect(() => {
    if (!isActive || !canvasRef.current || mousePath.length < 2) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (mousePath.length >= 2) {
        // Calculate bounds for scaling
        const xs = mousePath.map(p => p.x);
        const ys = mousePath.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        
        const rangeX = maxX - minX || 1;
        const rangeY = maxY - minY || 1;
        
        // Scale to fit canvas with padding
        const padding = 10;
        const scaleX = (canvas.width - padding * 2) / rangeX;
        const scaleY = (canvas.height - padding * 2) / rangeY;
        const scale = Math.min(scaleX, scaleY, 1); // Don't scale up
        
        // Center the path
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const offsetX = canvas.width / 2;
        const offsetY = canvas.height / 2;

        // Draw path with gradient
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, 'rgba(19, 194, 194, 0.3)');
        gradient.addColorStop(1, 'rgba(19, 194, 194, 0.8)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        const firstPoint = mousePath[0];
        const firstX = offsetX + (firstPoint.x - centerX) * scale;
        const firstY = offsetY + (firstPoint.y - centerY) * scale;
        ctx.moveTo(firstX, firstY);
        
        for (let i = 1; i < mousePath.length; i++) {
          const point = mousePath[i];
          const x = offsetX + (point.x - centerX) * scale;
          const y = offsetY + (point.y - centerY) * scale;
          ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Draw current position indicator
        if (mousePath.length > 0) {
          const lastPoint = mousePath[mousePath.length - 1];
          const lastX = offsetX + (lastPoint.x - centerX) * scale;
          const lastY = offsetY + (lastPoint.y - centerY) * scale;
          
          ctx.fillStyle = '#13c2c2';
          ctx.beginPath();
          ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
          ctx.fill();

          // Pulse effect
          ctx.strokeStyle = 'rgba(19, 194, 194, 0.5)';
          ctx.lineWidth = 2;
          const pulseSize = 8 + Math.sin(Date.now() / 200) * 2;
          ctx.beginPath();
          ctx.arc(lastX, lastY, pulseSize, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, mousePath]);

  // Update canvas size
  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = 200;
      canvas.height = 150;
    }
  }, []);

  // Don't render if not active
  if (!isActive) {
    return null;
  }

  const getActionColor = () => {
    switch (currentAction) {
      case 'clicking':
        return '#52c41a';
      case 'typing':
        return '#1890ff';
      case 'scrolling':
        return '#722ed1';
      case 'hovering':
        return '#fa8c16';
      case 'thinking':
        return '#eb2f96';
      case 'reading':
        return '#13c2c2';
      case 'moving':
        return '#13c2c2';
      default:
        return '#8c8c8c';
    }
  };

  const getActionText = () => {
    if (currentAction === 'typing' && actionDetails.text) {
      const preview = actionDetails.text.length > 20 
        ? `${actionDetails.text.substring(0, 20)}...` 
        : actionDetails.text;
      return `Typing: "${preview}"`;
    }
    if (currentAction === 'clicking' && actionDetails.selector) {
      const shortSelector = actionDetails.selector.length > 15
        ? `...${actionDetails.selector.slice(-15)}`
        : actionDetails.selector;
      return `Clicking: ${shortSelector}`;
    }
    return actionLabels[currentAction];
  };

  return (
    <div
      className="behavior-visualization-overlay"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 10000,
        pointerEvents: 'auto',
      }}
    >
      <Card
        size="small"
        className="behavior-visualization-card"
        style={{
          width: isMinimized ? '120px' : '280px',
          background: 'rgba(26, 35, 50, 0.95)',
          border: `1px solid ${getActionColor()}40`,
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          transition: 'all 0.3s ease',
        }}
        bodyStyle={{ padding: isMinimized ? '8px' : '12px' }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <Space size={8}>
            <Badge
              status="processing"
              color={getActionColor()}
              style={{ animation: 'pulse 2s infinite' }}
            />
            <Text
              strong
              style={{
                color: '#fff',
                fontSize: '12px',
              }}
            >
              Human Behavior
            </Text>
          </Space>
          {isMinimized && (
            <Text style={{ color: getActionColor(), fontSize: '10px' }}>
              {actionLabels[currentAction]}
            </Text>
          )}
        </div>

        {!isMinimized && (
          <>
            {/* Current Action */}
            <div style={{ marginBottom: '12px' }}>
              <Space size={8} align="center">
                <div
                  style={{
                    color: getActionColor(),
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {actionIcons[currentAction]}
                </div>
                <Tooltip title={getActionText()}>
                  <Text
                    style={{
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                  >
                    {getActionText()}
                  </Text>
                </Tooltip>
              </Space>

              {/* Typing Progress */}
              {currentAction === 'typing' && actionDetails.progress !== undefined && (
                <Progress
                  percent={actionDetails.progress}
                  size="small"
                  strokeColor={getActionColor()}
                  showInfo={false}
                  style={{ marginTop: '4px' }}
                />
              )}
            </div>

            {/* Mouse Path Visualization */}
            {mousePath.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <Text
                  style={{
                    color: 'rgba(255, 255, 255, 0.65)',
                    fontSize: '10px',
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  Mouse Path
                </Text>
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '100px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <canvas
                    ref={canvasRef}
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'block',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Delay Indicator */}
            {isDelaying && (
              <div style={{ marginBottom: '8px' }}>
                <Space size={8} align="center">
                  <PauseCircleOutlined
                    style={{
                      color: '#faad14',
                      fontSize: '12px',
                      animation: 'pulse 1s infinite',
                    }}
                  />
                  <Text
                    style={{
                      color: 'rgba(255, 255, 255, 0.65)',
                      fontSize: '10px',
                    }}
                  >
                    Random Delay
                  </Text>
                  {delayDuration > 0 && (
                    <Text
                      style={{
                        color: '#faad14',
                        fontSize: '10px',
                        fontWeight: 500,
                      }}
                    >
                      {delayDuration}ms
                    </Text>
                  )}
                </Space>
                {delayDuration > 0 && (
                  <Progress
                    percent={delayProgress}
                    size="small"
                    strokeColor="#faad14"
                    showInfo={false}
                    style={{ marginTop: '4px' }}
                  />
                )}
              </div>
            )}

            {/* State Indicators */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {(currentAction === 'thinking' || currentAction === 'reading') && (
                <Badge
                  status="processing"
                  color={getActionColor()}
                  text={
                    <Text
                      style={{
                        color: 'rgba(255, 255, 255, 0.65)',
                        fontSize: '10px',
                      }}
                    >
                      {currentAction === 'thinking' ? 'Processing...' : 'Reading content...'}
                    </Text>
                  }
                />
              )}

              {currentAction === 'idle' && (
                <Space size={4}>
                  <CheckCircleOutlined
                    style={{
                      color: '#52c41a',
                      fontSize: '12px',
                    }}
                  />
                  <Text
                    style={{
                      color: 'rgba(255, 255, 255, 0.65)',
                      fontSize: '10px',
                    }}
                  >
                    Ready
                  </Text>
                </Space>
              )}
            </div>
          </>
        )}
      </Card>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .behavior-visualization-overlay {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .behavior-visualization-card:hover {
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
        }
      `}</style>
    </div>
  );
}

