# Docker Best Practices

## Multi-Stage Build

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
```

## Layer Optimization

- Copy package.json first, then install, then copy source (cache deps)
- Use .dockerignore (node_modules, .git, .env, tests)
- Minimize number of layers (combine RUN commands)
- Use alpine base images (smaller)

## .dockerignore

```
node_modules
.git
.env
.env.*
dist
coverage
*.md
.github
```

## Security

- Use non-root user (`USER node`)
- Don't store secrets in images
- Scan images: `docker scout cves`
- Pin base image versions
- Use distroless or alpine images
