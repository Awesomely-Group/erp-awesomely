# Monitoring & Observability

## Structured Logging

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// Use structured fields
logger.info('Request processed', {
  method: req.method,
  path: req.path,
  statusCode: res.statusCode,
  duration: Date.now() - start,
  userId: req.user?.id,
});
```

## Key Metrics

- **Latency**: P50, P95, P99 response times
- **Error rate**: 4xx and 5xx per endpoint
- **Throughput**: Requests per second
- **Saturation**: CPU, memory, disk, connections

## Alerting Rules

- Error rate > 1% for 5 minutes → Warning
- Error rate > 5% for 2 minutes → Critical
- P95 latency > 500ms for 5 minutes → Warning
- Service down (health check) → Critical

## Request Tracing

Add correlation ID to every request:

```typescript
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);
  next();
});
```
