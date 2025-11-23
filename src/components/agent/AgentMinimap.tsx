/**
 * Agent Minimap Component
 * Shows a miniature viewport map indicating where the agent is on the page
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import styles from './AgentMinimap.module.css';

interface AgentMinimapProps {
  viewportRect?: DOMRect;
  pageRect?: DOMRect;
  agentPosition?: { x: number; y: number };
  visible?: boolean;
}

const AgentMinimap: React.FC<AgentMinimapProps> = ({
  viewportRect,
  pageRect,
  agentPosition,
  visible = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.1);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !viewportRect || !pageRect) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate scale
    const scaleX = canvas.width / pageRect.width;
    const scaleY = canvas.height / pageRect.height;
    const minScale = Math.min(scaleX, scaleY);
    setScale(minScale);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw page outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, pageRect.width * minScale, pageRect.height * minScale);

    // Draw viewport rectangle
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    const viewportX = viewportRect.left * minScale;
    const viewportY = viewportRect.top * minScale;
    const viewportWidth = viewportRect.width * minScale;
    const viewportHeight = viewportRect.height * minScale;
    ctx.fillRect(viewportX, viewportY, viewportWidth, viewportHeight);
    ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);

    // Draw agent position
    if (agentPosition) {
      const agentX = agentPosition.x * minScale;
      const agentY = agentPosition.y * minScale;
      
      // Draw pulsing dot
      ctx.fillStyle = '#10a37f';
      ctx.beginPath();
      ctx.arc(agentX, agentY, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw ring
      ctx.strokeStyle = '#10a37f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(agentX, agentY, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [viewportRect, pageRect, agentPosition]);

  useEffect(() => {
    if (!visible) return;

    const updateCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Set canvas size
      canvas.width = 200;
      canvas.height = 150;
      draw();
    };

    updateCanvas();
    const interval = setInterval(updateCanvas, 100);
    return () => clearInterval(interval);
  }, [visible, draw]);

  if (!visible) return null;

  return (
    <div ref={containerRef} className={styles.minimap}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={styles.label}>Minimap</div>
    </div>
  );
};

export default AgentMinimap;

