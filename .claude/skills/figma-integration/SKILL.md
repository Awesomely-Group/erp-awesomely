---
name: figma-integration
description: Figma to code workflow and design handoff
globs: ["**/*.tsx", "**/*.jsx"]
---

# Figma Integration Skill

## Setup
Requires the Figma MCP server. Add to .mcp.json:
```json
{
  "figma": {
    "command": "npx",
    "args": ["-y", "figma-developer-mcp", "--figma-api-key=YOUR_KEY", "--stdio"]
  }
}
```

## Workflow
1. Use MCP to fetch Figma node data
2. Extract colors, typography, spacing tokens
3. Map to design system tokens
4. Implement components matching the design
