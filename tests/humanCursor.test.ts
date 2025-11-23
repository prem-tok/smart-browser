/**
 * Unit tests for humanCursor path generation
 */

import { describe, test, expect } from '@jest/globals';
import { generateGhostPath, type Point } from '../electron/humanCursor';

describe('generateGhostPath', () => {
  const start: Point = { x: 0, y: 0 };
  const end: Point = { x: 100, y: 100 };

  test('should generate path with correct number of steps', () => {
    const steps = 10;
    const path = generateGhostPath(start, end, { steps });
    
    expect(path.length).toBe(steps + 1); // Includes start and end
  });

  test('should start at start point (approximately)', () => {
    const path = generateGhostPath(start, end, { steps: 5, jitter: 0 });
    const firstPoint = path[0];
    
    // Allow small floating point error
    expect(Math.abs(firstPoint.x - start.x)).toBeLessThan(1);
    expect(Math.abs(firstPoint.y - start.y)).toBeLessThan(1);
  });

  test('should end at end point (approximately)', () => {
    const path = generateGhostPath(start, end, { steps: 5, jitter: 0 });
    const lastPoint = path[path.length - 1];
    
    // Allow small floating point error
    expect(Math.abs(lastPoint.x - end.x)).toBeLessThan(1);
    expect(Math.abs(lastPoint.y - end.y)).toBeLessThan(1);
  });

  test('should generate non-linear path with bezier strategy', () => {
    const path = generateGhostPath(start, end, { 
      steps: 20, 
      jitter: 0, 
      moveStrategy: 'bezier' 
    });
    
    // Check that path is not a straight line
    // For a bezier curve, at least one middle point should not be on the line
    const midPoint = path[Math.floor(path.length / 2)];
    const expectedLinearY = midPoint.x; // For 45-degree line
    const deviation = Math.abs(midPoint.y - expectedLinearY);
    
    // Bezier should have some curvature (deviation > 5px for this test)
    expect(deviation).toBeGreaterThan(5);
  });

  test('should generate linear path with linear strategy', () => {
    const path = generateGhostPath(start, end, { 
      steps: 10, 
      jitter: 0, 
      moveStrategy: 'linear' 
    });
    
    // Linear path should be approximately straight
    for (let i = 1; i < path.length - 1; i++) {
      const t = i / (path.length - 1);
      const expectedX = start.x + (end.x - start.x) * t;
      const expectedY = start.y + (end.y - start.y) * t;
      
      // Allow small floating point error
      expect(Math.abs(path[i].x - expectedX)).toBeLessThan(0.1);
      expect(Math.abs(path[i].y - expectedY)).toBeLessThan(0.1);
    }
  });

  test('should add jitter to points', () => {
    const pathNoJitter = generateGhostPath(start, end, { 
      steps: 10, 
      jitter: 0 
    });
    const pathWithJitter = generateGhostPath(start, end, { 
      steps: 10, 
      jitter: 5 
    });
    
    // With jitter, at least some points should differ
    let hasDifference = false;
    for (let i = 0; i < pathNoJitter.length; i++) {
      const diffX = Math.abs(pathNoJitter[i].x - pathWithJitter[i].x);
      const diffY = Math.abs(pathNoJitter[i].y - pathWithJitter[i].y);
      if (diffX > 0.1 || diffY > 0.1) {
        hasDifference = true;
        break;
      }
    }
    
    expect(hasDifference).toBe(true);
  });

  test('should handle zero distance', () => {
    const samePoint: Point = { x: 50, y: 50 };
    const path = generateGhostPath(samePoint, samePoint, { steps: 5 });
    
    expect(path.length).toBeGreaterThan(0);
    // All points should be approximately at the same location
    path.forEach(point => {
      expect(Math.abs(point.x - samePoint.x)).toBeLessThan(10);
      expect(Math.abs(point.y - samePoint.y)).toBeLessThan(10);
    });
  });

  test('should handle large distances', () => {
    const farEnd: Point = { x: 1000, y: 1000 };
    const path = generateGhostPath(start, farEnd, { steps: 20 });
    
    expect(path.length).toBe(21);
    expect(path[0].x).toBeCloseTo(start.x, 1);
    expect(path[path.length - 1].x).toBeCloseTo(farEnd.x, 1);
  });

  test('should generate points within reasonable bounds', () => {
    const path = generateGhostPath(start, end, { steps: 10, jitter: 10 });
    
    // All points should be within a reasonable bounding box
    const minX = Math.min(start.x, end.x) - 50;
    const maxX = Math.max(start.x, end.x) + 50;
    const minY = Math.min(start.y, end.y) - 50;
    const maxY = Math.max(start.y, end.y) + 50;
    
    path.forEach(point => {
      expect(point.x).toBeGreaterThanOrEqual(minX);
      expect(point.x).toBeLessThanOrEqual(maxX);
      expect(point.y).toBeGreaterThanOrEqual(minY);
      expect(point.y).toBeLessThanOrEqual(maxY);
    });
  });

  test('should use default options when not provided', () => {
    const path = generateGhostPath(start, end);
    
    expect(path.length).toBeGreaterThan(0);
    expect(path[0].x).toBeCloseTo(start.x, 1);
    expect(path[path.length - 1].x).toBeCloseTo(end.x, 1);
  });
});


