import type { MetaFunction } from '@remix-run/node';
import { Link } from '@remix-run/react';

export const meta: MetaFunction = () => {
  return [
    { title: 'ALIA 2.0 - Medical Sales Training' },
    { name: 'description', content: 'Enterprise AI Training Platform' },
  ];
};

export default function Index() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.8', padding: '2rem' }}>
      <h1>🎯 ALIA 2.0 - Medical Sales Training Platform</h1>
      
      <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f0f9ff', borderRadius: '8px' }}>
        <h2>✅ Week 1 Progress: Memory OS (Layer 1)</h2>
        <ul>
          <li>✅ Database schema created (9 tables + pgvector)</li>
          <li>✅ Memory OS library implemented (3-tier hierarchy)</li>
          <li>✅ API routes created (store, retrieve, profile)</li>
          <li>🔄 <strong>Next: Run migration in Supabase</strong></li>
        </ul>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2>🔌 API Endpoints</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '0.5rem' }}>
            <Link to="/api/health" style={{ color: '#2563eb', textDecoration: 'none' }}>
              GET /api/health
            </Link>
            {' '}- Health check
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <code>POST /api/memory/store-episode</code> - Store training session
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <code>POST /api/memory/retrieve</code> - Semantic memory search
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <code>GET /api/memory/profile/:rep_id</code> - Get rep profile + trajectory
          </li>
        </ul>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#fef3c7', borderRadius: '8px' }}>
        <h3>⚠️ Setup Required</h3>
        <ol>
          <li>Go to <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">Supabase Dashboard</a></li>
          <li>Open SQL Editor → New Query</li>
          <li>Copy contents of <code>supabase/migrations/001_memory_os.sql</code></li>
          <li>Run the migration</li>
          <li>Update <code>.env</code> with your credentials</li>
        </ol>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2>📚 Documentation</h2>
        <ul>
          <li><Link to="/docs/API.md">API Documentation</Link></li>
          <li><Link to="/docs/MASTER_ROADMAP.md">Master Roadmap (4-week plan)</Link></li>
          <li><Link to="/docs/README.md">Project README</Link></li>
        </ul>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#dcfce7', borderRadius: '8px' }}>
        <h3>🎯 Competition Goal</h3>
        <p>
          <strong>UN SDG AI Innovation Challenge 2026</strong><br />
          Deadline: March 25, 2026 (28 days)<br />
          Category: Enterprise AI Training
        </p>
      </div>
    </div>
  );
}
