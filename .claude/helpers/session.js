#!/usr/bin/env node
/**
 * Claude Flow v3 Session Manager
 * Cross-platform session lifecycle management.
 *
 * Usage:
 *   node session.js start   — Initialize a new session
 *   node session.js status  — Show current session info
 *   node session.js end     — End the current session
 */

const fs = require('fs');
const path = require('path');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SESSION_DIR = path.join(PROJECT_DIR, '.claude-flow', 'sessions');
const SESSION_FILE = path.join(SESSION_DIR, 'current.json');

const command = process.argv[2] || 'status';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function startSession() {
  ensureDir(SESSION_DIR);
  const session = {
    id: `session_${Date.now()}`,
    startedAt: new Date().toISOString(),
    status: 'active',
    agents: [],
    metrics: {
      tasksCompleted: 0,
      tasksRouted: 0,
      memoryOps: 0,
    },
  };
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
  console.log(`Session started: ${session.id}`);
  return session;
}

function getSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.log('No active session.');
    return null;
  }
  const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
  console.log(JSON.stringify(session, null, 2));
  return session;
}

function endSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.log('No active session to end.');
    return;
  }
  const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
  session.status = 'ended';
  session.endedAt = new Date().toISOString();

  // Archive session
  const archiveFile = path.join(SESSION_DIR, `${session.id}.json`);
  fs.writeFileSync(archiveFile, JSON.stringify(session, null, 2));
  fs.unlinkSync(SESSION_FILE);
  console.log(`Session ended: ${session.id}`);
}

const commands = { start: startSession, status: getSession, end: endSession };
const fn = commands[command];
if (fn) {
  fn();
} else {
  console.error(`Unknown command: ${command}. Use: start, status, end`);
  process.exit(1);
}
