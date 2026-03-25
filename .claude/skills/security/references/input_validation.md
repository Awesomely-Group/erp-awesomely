# Input Validation & Sanitization

## XSS Prevention

### Output Encoding
```typescript
// Use framework auto-escaping (React, Vue do this by default)
// React: <div>{userInput}</div> — auto-escaped
// DANGEROUS: <div dangerouslySetInnerHTML={{__html: userInput}} />

// Server-side: encode HTML entities
import { encode } from 'html-entities';
const safe = encode(userInput);
```

### Content Security Policy
```typescript
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'strict-dynamic'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https://api.example.com"],
  }
}));
```

## SQL Injection Prevention

Always use parameterized queries or ORM:

```typescript
// Prisma (safe by default)
const user = await prisma.user.findUnique({ where: { email } });

// Raw query with parameters
const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

// NEVER concatenate user input into SQL
```

## CSRF Protection

```typescript
// Use SameSite cookies (primary defense)
cookie: { sameSite: 'strict' }

// For older browsers, add CSRF tokens
import csrf from 'csurf';
app.use(csrf({ cookie: true }));
```

## File Upload Validation

```typescript
// Validate file type by content, not extension
import fileType from 'file-type';

const type = await fileType.fromBuffer(buffer);
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
if (!type || !ALLOWED.includes(type.mime)) {
  throw new Error('Invalid file type');
}

// Limit file size
app.use(express.json({ limit: '1mb' }));
multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB
```

## API Input Validation (Zod)

```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  age: z.number().int().min(13).max(150).optional(),
});

// In controller
const parsed = CreateUserSchema.safeParse(req.body);
if (!parsed.success) {
  return res.status(400).json({ errors: parsed.error.issues });
}
```
