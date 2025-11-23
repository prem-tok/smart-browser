/**
 * Example Playwright API Usage
 * Demonstrates how to use the Playwright controller from the renderer
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

export function PlaywrightTest() {
  const [windowId] = useState('main');
  const [url, setUrl] = useState('https://example.com');
  const [elements, setElements] = useState<ElementDescriptor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

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
        
        // Navigate to initial URL
        await navigateToUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setStatus('Failed to initialize');
      } finally {
        setLoading(false);
      }
    };
    
    initPage();
    
    // Cleanup on unmount
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

  const handleListElements = async (selector?: string) => {
    try {
      setLoading(true);
      setError(null);
      setStatus(`Listing elements${selector ? ` matching "${selector}"` : ''}...`);
      
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

  const handleClick = async (selector: string) => {
    try {
      setLoading(true);
      setError(null);
      setStatus(`Clicking "${selector}"...`);
      
      const result = await window.api.playwright.click(windowId, selector) as ApiResponse;
      
      if (!result.ok) {
        throw new Error(result.error?.message || 'Click failed');
      }
      
      setStatus('Click successful');
      
      // Wait a bit then refresh elements
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

  const handleType = async (selector: string, text: string) => {
    try {
      setLoading(true);
      setError(null);
      setStatus(`Typing into "${selector}"...`);
      
      const result = await window.api.playwright.type(windowId, selector, text) as ApiResponse;
      
      if (!result.ok) {
        throw new Error(result.error?.message || 'Type failed');
      }
      
      setStatus('Type successful');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Type error');
      setStatus('Type failed');
    } finally {
      setLoading(false);
    }
  };

  const handleScreenshot = async () => {
    try {
      setLoading(true);
      setError(null);
      setStatus('Taking screenshot...');
      
      const result = await window.api.playwright.screenshot(windowId) as ApiResponse<{ imageBase64: string; width: number; height: number }>;
      
      if (!result.ok) {
        throw new Error(result.error?.message || 'Screenshot failed');
      }
      
      // Display screenshot in a new window or download
      const img = document.createElement('img');
      img.src = `data:image/png;base64,${result.data?.imageBase64}`;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head><title>Screenshot</title></head>
            <body style="margin:0;padding:20px;background:#f0f0f0;">
              <h1>Screenshot (${result.data?.width}x${result.data?.height})</h1>
              ${img.outerHTML}
            </body>
          </html>
        `);
      }
      
      setStatus('Screenshot taken');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Screenshot error');
      setStatus('Screenshot failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGetDomSnapshot = async () => {
    try {
      setLoading(true);
      setError(null);
      setStatus('Getting DOM snapshot...');
      
      const result = await window.api.playwright.getDomSnapshot(windowId) as ApiResponse<string>;
      
      if (!result.ok) {
        throw new Error(result.error?.message || 'DOM snapshot failed');
      }
      
      // Display in a new window
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head><title>DOM Snapshot</title></head>
            <body style="margin:0;padding:20px;background:#fff;">
              <h1>DOM Snapshot</h1>
              <pre style="background:#f5f5f5;padding:10px;overflow:auto;max-height:80vh;">${escapeHtml(result.data || '')}</pre>
            </body>
          </html>
        `);
      }
      
      setStatus('DOM snapshot retrieved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DOM snapshot error');
      setStatus('DOM snapshot failed');
    } finally {
      setLoading(false);
    }
  };

  const escapeHtml = (text: string) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Playwright Controller Test</h1>
      
      {error && (
        <div style={{ 
          padding: '10px', 
          background: '#fee', 
          border: '1px solid #fcc', 
          borderRadius: '4px',
          marginBottom: '10px',
          color: '#c00'
        }}>
          Error: {error}
        </div>
      )}
      
      {status && (
        <div style={{ 
          padding: '10px', 
          background: '#eef', 
          border: '1px solid #ccf', 
          borderRadius: '4px',
          marginBottom: '10px'
        }}>
          Status: {status}
        </div>
      )}
      
      <div style={{ marginBottom: '20px' }}>
        <h2>Navigation</h2>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter URL"
            style={{ flex: 1, padding: '8px' }}
            disabled={loading}
          />
          <button 
            onClick={handleNavigate}
            disabled={loading}
            style={{ padding: '8px 16px' }}
          >
            Navigate
          </button>
        </div>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h2>Actions</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => handleListElements()}
            disabled={loading}
            style={{ padding: '8px 16px' }}
          >
            List All Elements
          </button>
          <button 
            onClick={() => handleListElements('a')}
            disabled={loading}
            style={{ padding: '8px 16px' }}
          >
            List Links
          </button>
          <button 
            onClick={() => handleListElements('h1, h2, h3')}
            disabled={loading}
            style={{ padding: '8px 16px' }}
          >
            List Headings
          </button>
          <button 
            onClick={handleScreenshot}
            disabled={loading}
            style={{ padding: '8px 16px' }}
          >
            Screenshot
          </button>
          <button 
            onClick={handleGetDomSnapshot}
            disabled={loading}
            style={{ padding: '8px 16px' }}
          >
            DOM Snapshot
          </button>
        </div>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h2>Quick Actions</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => handleClick('a')}
            disabled={loading}
            style={{ padding: '8px 16px' }}
          >
            Click First Link
          </button>
          <button 
            onClick={() => handleType('input[type="text"]', 'Hello, World!')}
            disabled={loading}
            style={{ padding: '8px 16px' }}
          >
            Type in First Input
          </button>
        </div>
      </div>
      
      <div>
        <h2>Elements ({elements.length})</h2>
        {elements.length === 0 ? (
          <p>No elements found. Click "List All Elements" or "List Links" to populate.</p>
        ) : (
          <div style={{ 
            maxHeight: '400px', 
            overflow: 'auto', 
            border: '1px solid #ddd', 
            borderRadius: '4px',
            padding: '10px'
          }}>
            {elements.map((element, index) => (
              <div 
                key={index}
                style={{ 
                  padding: '8px', 
                  marginBottom: '8px', 
                  background: '#f9f9f9', 
                  borderRadius: '4px',
                  border: '1px solid #eee'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                  {element.selector}
                </div>
                <div style={{ fontSize: '0.9em', color: '#666', marginBottom: '4px' }}>
                  {element.innerText.substring(0, 100)}{element.innerText.length > 100 ? '...' : ''}
                </div>
                {element.boundingBox && (
                  <div style={{ fontSize: '0.8em', color: '#999' }}>
                    Position: ({Math.round(element.boundingBox.x)}, {Math.round(element.boundingBox.y)}) 
                    Size: {Math.round(element.boundingBox.width)}x{Math.round(element.boundingBox.height)}
                  </div>
                )}
                <button
                  onClick={() => handleClick(element.selector)}
                  disabled={loading}
                  style={{ 
                    marginTop: '4px', 
                    padding: '4px 8px', 
                    fontSize: '0.8em',
                    cursor: 'pointer'
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


