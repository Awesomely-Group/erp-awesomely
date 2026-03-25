#!/usr/bin/env node
/**
 * Claude Flow v3 Hook Handler
 * Dispatches Claude Code hooks to ruflo for orchestration.
 *
 * Usage in .claude/settings.json hooks:
 *   node "$CLAUDE_PROJECT_DIR/.claude/helpers/hook-handler.cjs" <hook-type>
 *
 * Hook types: pre-bash, post-edit, session-start, session-end, pre-compact, post-task
 */

const { execSync } = require('child_process');
const path = require('path');

const hookType = process.argv[2];
if (!hookType) {
  console.error('Usage: hook-handler.cjs <hook-type>');
  process.exit(1);
}

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function runRuflo(args) {
  try {
    execSync(`npx ruflo hooks ${args}`, {
      cwd: PROJECT_DIR,
      stdio: 'pipe',
      timeout: 10000,
    });
  } catch (e) {
    // Hooks should not block Claude Code on failure
    if (process.env.CLAUDE_FLOW_DEBUG) {
      console.error(`[claude-flow] Hook ${hookType} failed:`, e.message);
    }
  }
}

const handlers = {
  'pre-bash': () => runRuflo('pre-bash'),
  'post-edit': () => runRuflo('post-edit'),
  'session-start': () => runRuflo('session-start'),
  'session-end': () => runRuflo('session-end'),
  'pre-compact': () => runRuflo('pre-compact'),
  'post-task': () => {
    const taskId = process.env.TASK_ID || 'unknown';
    const success = process.env.TASK_SUCCESS || 'true';
    runRuflo(`post-task --task-id ${taskId} --success ${success}`);
  },
};

const handler = handlers[hookType];
if (handler) {
  handler();
} else {
  console.error(`[claude-flow] Unknown hook type: ${hookType}`);
  process.exit(1);
}
