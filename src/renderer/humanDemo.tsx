/**
 * Humanized Input Demo Component
 * Demonstrates humanized cursor movements, clicks, and typing
 */

import React, { useState, useEffect } from 'react';

interface ElementDescriptor {
  selector: string;
  innerText: string;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export function HumanDemo() {
  const [windowId] = useState('demo');
  const [url, setUrl] = useState('https://example.com');
  const [selector, setSelector] = useState('a');
  const [typeText, setTypeText] = useState('Hello, World!');
  const [elements, setElements] = useState<ElementDescriptor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [humanizedEnabled, setHumanizedEnabled] = useState(true);
  
  // Human options state
  const [humanOptions, setHumanOptions] = useState({
    steps: 18,
    jitter: 3,
    minDelay: 8,
    maxDelay: 30,
    moveStrategy: 'bezier' as 'bezier' | 'linear'
  });
  
  const [typeOptions, setTypeOptions] = useState({
    minDelay: 40,
    maxDelay: 180,
    clearFirst: true,
    perCharJitter: true
  });

  // Initialize page on mount
  useEffect(() => {
    const initPage = async () => {
      try {
        setLoading(true);
        setStatus('Creating Playwright page...');
        
        const result = await window.api.playwright.newPage(windowId) as ApiResponse;
        
        if (!result.ok) {
          throw new Error(result.error?.message || 'Failed to create page');
        }
        
        setStatus('Page created successfully');
        await navigateToUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setStatus('Failed to initialize');
      } finally {
        setLoading(false);
      }
    };
    
    initPage();
    
    return () => {
      window.api.playwright.closePage(windowId).catch(console.error);
    };
  }, []);

  const navigateToUrl = async (targetUrl: string) => {
    try {
      setLoading(true);
      setError(null);
      setStatus(`Navigating to ${targetUrl}...`);
      
      const result = await window.api.playwright.goto(windowId, targetUrl) as ApiResponse;
      
      if (!result.ok) {
        throw new Error(result.error?.message || 'Navigation failed');
      }
      
      setStatus(`Navigated to ${result.data?.url || targetUrl}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Navigation error');
      setStatus('Navigation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = () => {
    navigateToUrl(url);
  };

  const handleListElements = async () => {
    try {
      setLoading(true);
      setError(null);
      setStatus(`Listing elements matching "${selector}"...`);
      
      const result = await window.api.playwright.listElements(windowId, selector, { limit: 20 }) as ApiResponse<ElementDescriptor[]>;
      
      if (!result.ok) {
        throw new Error(result.error?.message || 'Failed to list elements');
      }
      
      setElements(result.data || []);
      setStatus(`Found ${result.data?.length || 0} elements`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'List elements error');
      setStatus('Failed to list elements');
    } finally {
      setLoading(false);
    }
  };

  const handleHumanClick = async (targetSelector?: string) => {
    const target = targetSelector || selector;
    try {
      setLoading(true);
      setError(null);
      setStatus(`Humanized click on "${target}"...`);
      
      const result = await window.api.playwright.click(windowId, target, {
        humanized: humanizedEnabled,
        humanOptions: humanizedEnabled ? humanOptions : undefined
      }) as ApiResponse;
      
      if (!result.ok) {
        throw new Error(result.error?.message || 'Click failed');
      }
      
      setStatus('Humanized click successful!');
      
      // Refresh elements after click
      setTimeout(() => {
        handleListElements();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Click error');
      setStatus('Click failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRawClick = async () => {
    try {
      setLoading(true);
      setError(null);
      setStatus(`Raw click on "${selector}"...`);
      
      const result = await window.api.playwright.click(windowId, selector, {
        humanized: false
      }) as ApiResponse;
      
      if (!result.ok) {
        throw new Error(result.error?.message || 'Click failed');
      }
      
      setStatus('Raw click successful!');
      
      setTimeout(() => {
        handleListElements();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Click error');
      setStatus('Click failed');
    } finally {
      setLoading(false);
    }
  };

  const handleHumanType = async () => {
    try {
      setLoading(true);
      setError(null);
      setStatus(`Humanized typing into "${selector}"...`);
      
      const result = await window.api.playwright.type(windowId, selector, typeText, {
        humanized: humanizedEnabled,
        typeOptions: humanizedEnabled ? typeOptions : undefined
      }) as ApiResponse;
      
      if (!result.ok) {
        throw new Error(result.error?.message || 'Type failed');
      }
      
      setStatus('Humanized typing successful!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Type error');
      setStatus('Type failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>🤖 Humanized Input Demo</h1>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Test human-like cursor movements, clicks, and typing with configurable options.
        Watch the cursor move in smooth Bezier curves with natural jitter and delays.
      </p>
      
      {error && (
        <div style={{ 
          padding: '12px', 
          background: '#fee', 
          border: '1px solid #fcc', 
          borderRadius: '6px',
          marginBottom: '15px',
          color: '#c00'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {status && (
        <div style={{ 
          padding: '12px', 
          background: '#eef', 
          border: '1px solid #ccf', 
          borderRadius: '6px',
          marginBottom: '15px'
        }}>
          <strong>Status:</strong> {status}
        </div>
      )}
      
      {/* Navigation */}
      <div style={{ marginBottom: '25px', padding: '15px', background: '#f9f9f9', borderRadius: '6px' }}>
        <h2>Navigation</h2>
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter URL"
            style={{ flex: 1, padding: '10px', fontSize: '14px', border: '1px solid #ddd', borderRadius: '4px' }}
            disabled={loading}
          />
          <button 
            onClick={handleNavigate}
            disabled={loading}
            style={{ padding: '10px 20px', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            Navigate
          </button>
        </div>
      </div>
      
      {/* Human Options */}
      <div style={{ marginBottom: '25px', padding: '15px', background: '#f0f8ff', borderRadius: '6px' }}>
        <h2>Humanized Options</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
          <input
            type="checkbox"
            checked={humanizedEnabled}
            onChange={(e) => setHumanizedEnabled(e.target.checked)}
            style={{ width: '18px', height: '18px' }}
          />
          <span>Enable humanized input (smooth cursor movements)</span>
        </label>
        
        {humanizedEnabled && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Steps</label>
              <input
                type="number"
                value={humanOptions.steps}
                onChange={(e) => setHumanOptions({ ...humanOptions, steps: parseInt(e.target.value) || 18 })}
                min="1"
                max="50"
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Jitter (px)</label>
              <input
                type="number"
                value={humanOptions.jitter}
                onChange={(e) => setHumanOptions({ ...humanOptions, jitter: parseFloat(e.target.value) || 3 })}
                min="0"
                max="20"
                step="0.5"
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Min Delay (ms)</label>
              <input
                type="number"
                value={humanOptions.minDelay}
                onChange={(e) => setHumanOptions({ ...humanOptions, minDelay: parseInt(e.target.value) || 8 })}
                min="0"
                max="1000"
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Max Delay (ms)</label>
              <input
                type="number"
                value={humanOptions.maxDelay}
                onChange={(e) => setHumanOptions({ ...humanOptions, maxDelay: parseInt(e.target.value) || 30 })}
                min="0"
                max="1000"
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Move Strategy</label>
              <select
                value={humanOptions.moveStrategy}
                onChange={(e) => setHumanOptions({ ...humanOptions, moveStrategy: e.target.value as 'bezier' | 'linear' })}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              >
                <option value="bezier">Bezier (curved)</option>
                <option value="linear">Linear (straight)</option>
              </select>
            </div>
          </div>
        )}
      </div>
      
      {/* Type Options */}
      <div style={{ marginBottom: '25px', padding: '15px', background: '#fff8f0', borderRadius: '6px' }}>
        <h2>Typing Options</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginTop: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Min Delay (ms)</label>
            <input
              type="number"
              value={typeOptions.minDelay}
              onChange={(e) => setTypeOptions({ ...typeOptions, minDelay: parseInt(e.target.value) || 40 })}
              min="0"
              max="1000"
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Max Delay (ms)</label>
              <input
                type="number"
                value={typeOptions.maxDelay}
                onChange={(e) => setTypeOptions({ ...typeOptions, maxDelay: parseInt(e.target.value) || 180 })}
                min="0"
                max="1000"
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
              <input
                type="checkbox"
                checked={typeOptions.clearFirst}
                onChange={(e) => setTypeOptions({ ...typeOptions, clearFirst: e.target.checked })}
              />
              <span>Clear field first</span>
            </label>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
              <input
                type="checkbox"
                checked={typeOptions.perCharJitter}
                onChange={(e) => setTypeOptions({ ...typeOptions, perCharJitter: e.target.checked })}
              />
              <span>Per-character jitter</span>
            </label>
          </div>
        </div>
      </div>
      
      {/* Actions */}
      <div style={{ marginBottom: '25px', padding: '15px', background: '#f9f9f9', borderRadius: '6px' }}>
        <h2>Actions</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Selector</label>
            <input
              type="text"
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              placeholder="CSS selector"
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              disabled={loading}
            />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Text to Type</label>
            <input
              type="text"
              value={typeText}
              onChange={(e) => setTypeText(e.target.value)}
              placeholder="Text to type"
              style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              disabled={loading}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '15px' }}>
          <button 
            onClick={handleListElements}
            disabled={loading}
            style={{ padding: '10px 16px', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            List Elements
          </button>
          <button 
            onClick={() => handleHumanClick()}
            disabled={loading}
            style={{ padding: '10px 16px', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            Human Click
          </button>
          <button 
            onClick={handleRawClick}
            disabled={loading}
            style={{ padding: '10px 16px', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            Raw Click
          </button>
          <button 
            onClick={handleHumanType}
            disabled={loading}
            style={{ padding: '10px 16px', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', background: '#ffc107', color: '#000', border: 'none', borderRadius: '4px' }}
          >
            Human Type
          </button>
        </div>
      </div>
      
      {/* Elements List */}
      <div>
        <h2>Elements ({elements.length})</h2>
        {elements.length === 0 ? (
          <p style={{ color: '#666', padding: '20px', textAlign: 'center' }}>
            No elements found. Click "List Elements" to populate.
          </p>
        ) : (
          <div style={{ 
            maxHeight: '400px', 
            overflow: 'auto', 
            border: '1px solid #ddd', 
            borderRadius: '6px',
            padding: '10px'
          }}>
            {elements.map((element, index) => (
              <div 
                key={index}
                style={{ 
                  padding: '12px', 
                  marginBottom: '10px', 
                  background: '#f9f9f9', 
                  borderRadius: '6px',
                  border: '1px solid #eee'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#007bff' }}>
                  {element.selector}
                </div>
                <div style={{ fontSize: '0.9em', color: '#666', marginBottom: '6px', lineHeight: '1.4' }}>
                  {element.innerText.substring(0, 150)}{element.innerText.length > 150 ? '...' : ''}
                </div>
                {element.boundingBox && (
                  <div style={{ fontSize: '0.8em', color: '#999', marginBottom: '8px' }}>
                    Position: ({Math.round(element.boundingBox.x)}, {Math.round(element.boundingBox.y)}) 
                    Size: {Math.round(element.boundingBox.width)}×{Math.round(element.boundingBox.height)}
                  </div>
                )}
                <button
                  onClick={() => handleHumanClick(element.selector)}
                  disabled={loading}
                  style={{ 
                    padding: '6px 12px', 
                    fontSize: '0.85em',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px'
                  }}
                >
                  Click This
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


