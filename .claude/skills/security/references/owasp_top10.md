# OWASP Top 10 — 2021 Reference

## A01:2021 — Broken Access Control

The most common web vulnerability. Users act outside their intended permissions.

### Vulnerable Pattern
```typescript
// BAD: No authorization check
app.get('/api/users/:id', async (req, res) => {
  const user = await db.users.findById(req.params.id);
  res.json(user); // Any user can access any other user's data
});
```

### Secure Pattern
```typescript
// GOOD: Verify ownership
app.get('/api/users/:id', authenticate, async (req, res) => {
  if (req.user.id !== req.params.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const user = await db.users.findById(req.params.id);
  res.json(user);
});
```

**Mitigations**: Deny by default, enforce ownership, disable directory listing, log access failures, rate limit APIs.

## A02:2021 — Cryptographic Failures

Exposure of sensitive data due to weak or missing encryption.

### Vulnerable Pattern
```typescript
// BAD: MD5/SHA1 for passwords
const hash = crypto.createHash('md5').update(password).digest('hex');

// BAD: Storing sensitive data in JWT payload
const token = jwt.sign({ password, ssn, creditCard }, secret);
```

### Secure Pattern
```typescript
// GOOD: bcrypt for passwords
import bcrypt from 'bcrypt';
const hash = await bcrypt.hash(password, 12);
const isValid = await bcrypt.compare(input, hash);

// GOOD: Minimal JWT payload
const token = jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: '1h' });
```

**Mitigations**: Use TLS everywhere, encrypt sensitive data at rest, use strong algorithms (bcrypt, argon2), don't store sensitive data unnecessarily.

## A03:2021 — Injection

Untrusted data sent to an interpreter as part of a command or query.

### SQL Injection
```typescript
// BAD: String concatenation
const query = `SELECT * FROM users WHERE email = '${email}'`;

// GOOD: Parameterized query
const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);

// GOOD: ORM (Prisma)
const user = await prisma.user.findUnique({ where: { email } });
```

### Command Injection
```typescript
// BAD: User input in shell command
exec(`convert ${userFile} output.png`);

// GOOD: Use library APIs instead
import sharp from 'sharp';
await sharp(userFile).toFile('output.png');
```

### NoSQL Injection
```typescript
// BAD: Direct user input
db.users.find({ username: req.body.username, password: req.body.password });

// GOOD: Validate type and sanitize
const username = String(req.body.username);
const password = String(req.body.password);
```

## A04:2021 — Insecure Design

Missing or ineffective security controls in the design phase.

**Mitigations**: Threat modeling, secure design patterns, rate limiting, account lockout, business logic validation.

## A05:2021 — Security Misconfiguration

Default configurations, incomplete setups, verbose error messages.

```typescript
// BAD: Verbose errors in production
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});

// GOOD: Generic errors in production
app.use((err, req, res, next) => {
  logger.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
```

**Security Headers** (use `helmet` middleware):
```typescript
import helmet from 'helmet';
app.use(helmet());
// Sets: X-Content-Type-Options, X-Frame-Options, CSP, HSTS, etc.
```

## A06:2021 — Vulnerable and Outdated Components

Using components with known vulnerabilities.

```bash
# Check for vulnerabilities
npm audit
pnpm audit
npx snyk test

# Fix automatically
npm audit fix
```

## A07:2021 — Identification and Authentication Failures

Weak passwords, session fixation, credential stuffing.

**Mitigations**: MFA, strong password policies, rate limiting on login, account lockout, secure session management.

## A08:2021 — Software and Data Integrity Failures

Insecure CI/CD pipelines, unsigned updates, insecure deserialization.

**Mitigations**: Verify signatures, use trusted sources, review CI/CD security, validate serialized data.

## A09:2021 — Security Logging and Monitoring Failures

Insufficient logging makes it impossible to detect attacks.

```typescript
// Log security events
logger.warn('Failed login attempt', { email, ip: req.ip, userAgent: req.headers['user-agent'] });
logger.error('Authorization failure', { userId: req.user.id, resource, action });
```

## A10:2021 — Server-Side Request Forgery (SSRF)

Application fetches a remote resource without validating the user-supplied URL.

```typescript
// BAD: Unvalidated URL fetch
const response = await fetch(req.body.url);

// GOOD: Whitelist allowed domains
const ALLOWED_HOSTS = ['api.example.com', 'cdn.example.com'];
const url = new URL(req.body.url);
if (!ALLOWED_HOSTS.includes(url.hostname)) {
  return res.status(400).json({ error: 'URL not allowed' });
}
```
