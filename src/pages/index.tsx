/**
 * Root Index Page - Redirects to Main Page
 * This ensures the health check passes by providing a valid root route
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to main page on mount
    router.replace('/main');
  }, [router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#1a1a1a',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ 
          fontSize: '48px', 
          marginBottom: '16px',
          animation: 'pulse 2s ease-in-out infinite',
        }}>
          🚀
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: 0 }}>
          Loading Smart Browser
        </h1>
        <p style={{ fontSize: '14px', color: '#9ca3af', marginTop: '8px' }}>
          Redirecting to main page...
        </p>
      </div>
      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}

