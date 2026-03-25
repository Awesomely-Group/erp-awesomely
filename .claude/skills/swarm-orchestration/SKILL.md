---
name: Swarm Orchestration
description: Multi-agent swarm coordination using Claude Flow v3 (Ruflo). Manages agent topologies, shared memory, task routing, consensus algorithms, and self-optimizing patterns for complex multi-step workflows.
---

# Swarm Orchestration

Coordinate multiple Claude Code agents in parallel using Claude Flow v3's swarm framework.

## What This Skill Does

This skill enables multi-agent orchestration for tasks that benefit from parallel execution, specialized agents, or coordinated workflows. It manages the full lifecycle of agent swarms — from initialization to task completion.

**Key Capabilities:**
- **Swarm Topologies**: Hierarchical, Mesh, Ring, Star, Hybrid, Adaptive
- **Consensus Algorithms**: Raft, PBFT, Gossip, CRDT, Voting
- **Shared Memory**: Hybrid backend with HNSW vector indexing
- **Task Routing**: 3-tier intelligent routing (WASM → Haiku/Sonnet → Opus)
- **Self-Optimization**: SONA learns from every task to improve routing accuracy
- **Hooks Integration**: Auto-routing via Claude Code's native hook system

## Prerequisites

**Required:**
- Node.js 20+
- Claude Code with MCP support
- Ruflo MCP server registered: `claude mcp add ruflo -- npx -y ruflo@latest mcp start`

**Optional:**
- `npx ruflo init --wizard` for full project setup
- Background daemon for learning workers: `npx ruflo daemon start`

## Quick Start

### 1. Initialize Swarm
```bash
# Simple hierarchical swarm
npx ruflo swarm init --topology hierarchical --max-agents 5

# Mesh topology for independent parallel tasks
npx ruflo swarm init --topology mesh --max-agents 8
```

### 2. Spawn Agents
```bash
npx ruflo agent spawn -t coder --name impl-agent
npx ruflo agent spawn -t tester --name test-agent
npx ruflo agent spawn -t reviewer --name review-agent
```

### 3. Execute Tasks
```bash
# Simple task delegation
npx ruflo hive-mind spawn "Implement user authentication" --queen-type tactical

# Monitor progress
npx ruflo hive-mind status
npx ruflo status
```

## Topology Selection Guide

| Topology | Best For | Trade-offs |
|----------|----------|------------|
| **Hierarchical** | Complex multi-step tasks with dependencies | Higher coordination overhead, clear chain of command |
| **Mesh** | Independent parallel tasks | Lower latency, potential for conflicts |
| **Ring** | Sequential pipeline processing | Ordered execution, single point of failure |
| **Star** | Centralized coordination with worker agents | Simple routing, coordinator bottleneck |
| **Hybrid** | Mixed workloads | Flexible, more complex setup |

## Memory Operations

```bash
# Store context for cross-agent use
npx ruflo memory store "feature:auth" "JWT with refresh tokens" --namespace project

# Search past patterns
npx ruflo memory search --query "authentication patterns" --namespace project

# Agent-scoped memory
npx ruflo memory store "preference:test-framework" "jest" --namespace agent:tester
```

## Hooks Integration

Claude Flow v3 integrates with Claude Code's hook system for automatic orchestration:

- **PreToolUse (Bash)**: Auto-routes bash commands through security validation
- **PostToolUse (Write|Edit)**: Captures code changes for pattern learning
- **SessionStart**: Initializes swarm state and loads learned patterns
- **SessionEnd**: Persists session metrics and learned optimizations
- **UserPromptSubmit**: Classifies incoming tasks for optimal routing

## Health & Diagnostics

```bash
# Full system diagnostics
npx ruflo doctor

# System status
npx ruflo status

# Swarm-specific status
npx ruflo swarm status
```

## Best Practices

1. **Start simple** — Use single agents before scaling to swarms
2. **Match topology to task** — Hierarchical for complex, mesh for parallel
3. **Monitor agent health** — Use `npx ruflo doctor` regularly
4. **Leverage memory** — Store patterns for reuse across sessions
5. **Use hive-mind for complex tasks** — Let the coordinator decompose work
6. **Enable daemon for learning** — Background workers improve routing over time
7. **Keep max-agents reasonable** — 5-8 agents is usually optimal; more adds coordination overhead
