#!/usr/bin/env node
/**
 * Claude Flow v3 Task Router
 * Classifies tasks and routes to optimal agents based on capability matching.
 *
 * Usage:
 *   node router.js "<task description>"
 */

const AGENT_CAPABILITIES = {
  coder: {
    patterns: ['implement', 'build', 'create', 'add', 'write', 'code', 'develop', 'feature'],
    complexity: ['low', 'medium', 'high'],
    priority: 1,
  },
  tester: {
    patterns: ['test', 'spec', 'coverage', 'assert', 'verify', 'validate', 'e2e', 'unit'],
    complexity: ['low', 'medium'],
    priority: 2,
  },
  reviewer: {
    patterns: ['review', 'check', 'audit', 'inspect', 'quality', 'lint', 'standards'],
    complexity: ['low', 'medium'],
    priority: 3,
  },
  planner: {
    patterns: ['plan', 'design', 'architect', 'structure', 'decompose', 'strategy', 'scope'],
    complexity: ['medium', 'high'],
    priority: 2,
  },
  'security-auditor': {
    patterns: ['security', 'vulnerability', 'owasp', 'cve', 'secrets', 'auth', 'encrypt'],
    complexity: ['medium', 'high'],
    priority: 1,
  },
  researcher: {
    patterns: ['research', 'investigate', 'analyze', 'explore', 'find', 'search', 'understand'],
    complexity: ['low', 'medium', 'high'],
    priority: 3,
  },
};

function classifyTask(description) {
  const lower = description.toLowerCase();
  const scores = {};

  for (const [agent, config] of Object.entries(AGENT_CAPABILITIES)) {
    const matchCount = config.patterns.filter(p => lower.includes(p)).length;
    scores[agent] = matchCount * (4 - config.priority);
  }

  const sorted = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    return { agent: 'coder', confidence: 0.5, reason: 'default fallback' };
  }

  const [bestAgent, bestScore] = sorted[0];
  const confidence = Math.min(bestScore / 10, 1.0);

  return {
    agent: bestAgent,
    confidence: Math.round(confidence * 100) / 100,
    reason: `matched ${AGENT_CAPABILITIES[bestAgent].patterns.filter(p => lower.includes(p)).join(', ')}`,
    alternatives: sorted.slice(1, 3).map(([a]) => a),
  };
}

const task = process.argv.slice(2).join(' ');
if (!task) {
  console.error('Usage: router.js "<task description>"');
  process.exit(1);
}

const result = classifyTask(task);
console.log(JSON.stringify(result, null, 2));
