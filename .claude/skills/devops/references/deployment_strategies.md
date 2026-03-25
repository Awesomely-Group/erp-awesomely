# Deployment Strategies

## Blue-Green Deployment

Two identical environments. Route traffic from blue (current) to green (new).

**Pros**: Instant rollback, zero downtime.
**Cons**: Double infrastructure cost.

## Canary Deployment

Route small % of traffic to new version. Gradually increase if healthy.

**Steps**:
1. Deploy new version alongside current
2. Route 5% traffic to new version
3. Monitor errors, latency, metrics
4. Gradually increase (25%, 50%, 100%)
5. Roll back if issues detected

## Rolling Update

Replace instances one at a time. Default for Kubernetes.

**Configuration**:
```yaml
strategy:
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

## Health Checks

```typescript
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/health/ready', async (req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});
```

## Rollback

- Keep previous version tagged and deployable
- Automate rollback on health check failure
- Test rollback procedures regularly
- Database migrations must be backward-compatible
