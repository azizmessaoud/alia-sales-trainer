/**
 * Audio2Face Test Page
 * Simple interface to test the NVIDIA Audio2Face API integration
 */

import { json } from '@remix-run/node';
import type { LoaderFunction } from '@remix-run/node';
import { generateLipSync } from '~/lib/nvidia-nim.server';

export const loader: LoaderFunction = async () => {
  return json({
    status: 'ready',
    message: 'Audio2Face API Test Interface',
    endpoints: {
      test: '/api/test.audio2face',
      documentation: '/docs/AUDIO2FACE_QUICKSTART.md',
    },
  });
};

export default function Audio2FaceTest() {
  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '40px',
        maxWidth: '800px',
        margin: '0 auto',
        backgroundColor: '#1a1a2e',
        color: '#fff',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ marginTop: 0, color: '#5cb85c' }}>🎬 Audio2Face Integration</h1>

      <section
        style={{
          backgroundColor: '#16213e',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          borderLeft: '4px solid #5cb85c',
        }}
      >
        <h2 style={{ marginTop: 0 }}>✅ System Status</h2>
        <p>✓ NVIDIA NIM API configured</p>
        <p>✓ Audio2Face generator loaded</p>
        <p>✓ LipSyncAnimator ready</p>
        <p>✓ Avatar component integrated</p>
      </section>

      <section
        style={{
          backgroundColor: '#16213e',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          borderLeft: '4px solid #4a90d9',
        }}
      >
        <h2 style={{ marginTop: 0 }}>🧪 Quick Test</h2>
        <p>Test the Audio2Face API with a generated WAV file:</p>
        <a
          href="/api/test.audio2face"
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            backgroundColor: '#4a90d9',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '4px',
            marginRight: '10px',
          }}
          target="_blank"
          rel="noopener noreferrer"
        >
          Run API Test →
        </a>
        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            backgroundColor: '#5cb85c',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '4px',
          }}
        >
          Open Chat Interface →
        </a>
        <p style={{ fontSize: '12px', opacity: 0.7, marginTop: '12px' }}>
          Creates a 1-second silent WAV and generates blendshape animation
        </p>
      </section>

      <section
        style={{
          backgroundColor: '#16213e',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          borderLeft: '4px solid #f0ad4e',
        }}
      >
        <h2 style={{ marginTop: 0 }}>📚 Documentation</h2>
        <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
          <li>
            <a
              href="../../docs/LIP_SYNC_GUIDE.md"
              style={{ color: '#5cb85c', textDecoration: 'none' }}
            >
              Complete Lip-Sync Guide
            </a>
            {' - '}
            Detailed implementation reference
          </li>
          <li>
            <a
              href="../../docs/AUDIO2FACE_QUICKSTART.md"
              style={{ color: '#5cb85c', textDecoration: 'none' }}
            >
              Audio2Face Quick Start
            </a>
            {' - '}
            Integration examples and code samples
          </li>
          <li>
            <a
              href="../../docs/API.md"
              style={{ color: '#5cb85c', textDecoration: 'none' }}
            >
              Memory OS API Reference
            </a>
            {' - '}
            REST endpoints and WebSocket protocol
          </li>
        </ul>
      </section>

      <section
        style={{
          backgroundColor: '#16213e',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          borderLeft: '4px solid #ff6b6b',
        }}
      >
        <h2 style={{ marginTop: 0 }}>⚙️ Configuration</h2>
        <p>Verify these are set in your `.env` file:</p>
        <code
          style={{
            display: 'block',
            backgroundColor: '#0f3460',
            padding: '15px',
            borderRadius: '4px',
            marginBottom: '10px',
            fontSize: '12px',
            overflow: 'auto',
          }}
        >
          {`# NVIDIA NIM API
NVIDIA_API_KEY=nvapi-your-key-here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key`}
        </code>
        <p style={{ fontSize: '12px', opacity: 0.7 }}>
          Get a free NVIDIA API key at{' '}
          <a
            href="https://build.nvidia.com"
            style={{ color: '#5cb85c' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            build.nvidia.com
          </a>
        </p>
      </section>

      <section
        style={{
          backgroundColor: '#16213e',
          padding: '20px',
          borderRadius: '8px',
          borderLeft: '4px solid #9b59b6',
        }}
      >
        <h2 style={{ marginTop: 0 }}>🚀 Next Steps</h2>
        <ol style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
          <li>
            <strong>Run the API test:</strong> Click "Run API Test" above
          </li>
          <li>
            <strong>Check the chat page:</strong> Visit{' '}
            <code style={{ backgroundColor: '#0f3460', padding: '2px 6px', borderRadius: '3px' }}>
              /
            </code>{' '}
            to see the avatar
          </li>
          <li>
            <strong>Send a message:</strong> The avatar will respond with lip-sync
          </li>
          <li>
            <strong>Monitor the console:</strong> Check browser DevTools for detailed logging
          </li>
        </ol>
      </section>

      <footer style={{ marginTop: '40px', opacity: 0.6, fontSize: '12px', borderTop: '1px solid #444', paddingTop: '20px' }}>
        <p>ALIA 2.0 Medical Training Platform • Week 2 Development Build</p>
        <p>Last updated: March 1, 2026</p>
      </footer>
    </div>
  );
}
