#!/usr/bin/env node

/**
 * ALIA 2.0 Development Server Helper
 * Displays useful URLs and status after dev server starts
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function header(text) {
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  ${text}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n`);
}

function section(title) {
  console.log(`${colors.bright}${colors.blue}▶ ${title}${colors.reset}`);
}

function item(name, url, description) {
  console.log(`  ${colors.green}✓${colors.reset} ${colors.bright}${name}${colors.reset}`);
  console.log(`    ${colors.cyan}${url}${colors.reset}`);
  if (description) {
    console.log(`    ${description}`);
  }
}

function warning(text) {
  console.log(`${colors.yellow}⚠️  ${text}${colors.reset}`);
}

function envCheck() {
  const envPath = path.join(__dirname, '.env');
  const hasEnv = fs.existsSync(envPath);
  
  if (!hasEnv) {
    console.log(`${colors.yellow}⚠️  No .env file found - create one with:${colors.reset}`);
    console.log(`    NVIDIA_API_KEY=nvapi-your-key`);
    console.log(`    SUPABASE_URL=your-url`);
    console.log(`    SUPABASE_ANON_KEY=your-key\n`);
    return false;
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const hasNvidiaKey = envContent.includes('NVIDIA_API_KEY');
  
  if (!hasNvidiaKey) {
    warning('NVIDIA_API_KEY not set in .env');
    return false;
  }
  
  return true;
}

// Main output
header('ALIA 2.0 Medical Training - Development Environment');

console.log(`${colors.green}✓${colors.reset} Dev server running on ${colors.cyan}http://localhost:5173${colors.reset}\n`);

// Quick Links
section('Quick Links');
item('Chat Interface', 'http://localhost:5173', 'Full training interface with avatar');
item('Status Dashboard', 'http://localhost:5173/status', 'System health check');
item('Setup Guide', 'http://localhost:5173/test.audio2face', 'Configuration & integration guide');
item('API Test', 'http://localhost:5173/api/test.audio2face', 'Verify Audio2Face connectivity');

// Environment
console.log();
section('Environment');
const envOk = envCheck();
if (envOk) {
  console.log(`  ${colors.green}✓${colors.reset} ${colors.bright}.env configured${colors.reset}`);
}

// Components
console.log();
section('Ready Components');
console.log(`  ${colors.green}✓${colors.reset} ${colors.bright}Avatar 3D Renderer${colors.reset} - GLB model support`);
console.log(`  ${colors.green}✓${colors.reset} ${colors.bright}Lip-Sync Engine${colors.reset} - 30fps interpolation`);
console.log(`  ${colors.green}✓${colors.reset} ${colors.bright}Audio2Face API${colors.reset} - Blendshape generation`);
console.log(`  ${colors.green}✓${colors.reset} ${colors.bright}Memory OS${colors.reset} - Context storage & retrieval`);

// Next Steps
console.log();
section('Next Steps (Week 2)');
console.log(`  ${colors.bright}1.${colors.reset} Test the chat interface - visit ${colors.cyan}http://localhost:5173${colors.reset}`);
console.log(`  ${colors.bright}2.${colors.reset} Run API test - visit ${colors.cyan}http://localhost:5173/api/test.audio2face${colors.reset}`);
console.log(`  ${colors.bright}3.${colors.reset} Install LangGraph - ${colors.cyan}npm install @langchain/core @langchain/langgraph${colors.reset}`);
console.log(`  ${colors.bright}4.${colors.reset} Build orchestration - Create ${colors.cyan}app/lib/orchestration.server.ts${colors.reset}`);

// Documentation
console.log();
section('Documentation');
console.log(`  ${colors.bright}Complete Reference:${colors.reset}`);
console.log(`    ${colors.cyan}docs/LIP_SYNC_GUIDE.md${colors.reset} - Technical deep dive (500+ lines)`);
console.log(`    ${colors.cyan}docs/AUDIO2FACE_QUICKSTART.md${colors.reset} - Integration examples (200+ lines)`);
console.log(`    ${colors.cyan}AUDIO2FACE_IMPLEMENTATION.md${colors.reset} - Architecture overview`);

console.log();
section('Dev Tips');
console.log(`  • Browser DevTools: F12 to see debug logs with "✅" and "❌" prefixes`);
console.log(`  • WebSocket: Currently not running at ws://localhost:3001`);
console.log(`  • Mock Data: Audio2Face automatically falls back to realistic test data`);
console.log(`  • Models: avatar.glb must be in ${colors.cyan}public/${colors.reset} folder`);

// Status summary
console.log();
console.log(`${colors.bright}Status Summary:${colors.reset}`);
console.log(`  Architecture: 7-layer decoupled system ✓`);
console.log(`  Week 2 Progress: Avatar + Audio2Face complete (40%)`);
console.log(`  Pending: LangGraph orchestration + WebSocket + TTS`);

console.log();
console.log(`${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`);
console.log(`Ready to continue development! Press ${colors.bright}Ctrl+C${colors.reset} to stop.\n`);
