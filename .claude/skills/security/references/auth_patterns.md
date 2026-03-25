# Authentication & Authorization Patterns

## OAuth2 Flows

### Authorization Code Flow (Web Apps)
1. Redirect user to authorization server
2. User authenticates and consents
3. Authorization server redirects back with code
4. Exchange code for tokens server-side

### Authorization Code + PKCE (SPAs, Mobile)
Same as above but with code_verifier/code_challenge to prevent interception.
Always use PKCE for public clients (no client secret).

### Client Credentials (Server-to-Server)
Direct token exchange using client_id + client_secret. No user involvement.

## JWT Best Practices

```typescript
// Signing
const token = jwt.sign(
  { sub: user.id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '15m', algorithm: 'HS256' }
);

// Verification
const decoded = jwt.verify(token, process.env.JWT_SECRET);
```

### Rules
- Short expiration (15m access, 7d refresh)
- Store refresh tokens server-side (DB or Redis)
- Rotate refresh tokens on use (one-time use)
- Include minimal claims (sub, role — never passwords)
- Use HttpOnly cookies for web (not localStorage)
- Implement token revocation for logout

## Session Management

### Server-Side Sessions
```typescript
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,      // HTTPS only
    httpOnly: true,     // No JS access
    sameSite: 'strict', // CSRF protection
    maxAge: 3600000     // 1 hour
  },
  store: new RedisStore({ client: redisClient })
}));
```

## Password Handling

```typescript
import bcrypt from 'bcrypt';

// Hash with cost factor 12
const hash = await bcrypt.hash(password, 12);

// Verify
const isValid = await bcrypt.compare(inputPassword, storedHash);
```

**Requirements**: Minimum 8 characters, check against breached password lists (haveibeenpwned API), don't require complex rules (they reduce security).

## RBAC Pattern

```typescript
const PERMISSIONS = {
  admin: ['read', 'write', 'delete', 'manage_users'],
  editor: ['read', 'write'],
  viewer: ['read'],
};

function authorize(...requiredPermissions: string[]) {
  return (req, res, next) => {
    const userPerms = PERMISSIONS[req.user.role] || [];
    const hasAll = requiredPermissions.every(p => userPerms.includes(p));
    if (!hasAll) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

app.delete('/api/posts/:id', authenticate, authorize('delete'), deletePost);
```
