# Design Systems

## Design Tokens

```css
:root {
  /* Colors */
  --color-primary-50: #eff6ff;
  --color-primary-500: #3b82f6;
  --color-primary-900: #1e3a8a;
  --color-neutral-50: #fafafa;
  --color-neutral-900: #171717;
  --color-success: #22c55e;
  --color-error: #ef4444;
  --color-warning: #f59e0b;

  /* Spacing (4px base) */
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
  --space-12: 3rem;    /* 48px */
  --space-16: 4rem;    /* 64px */

  /* Typography */
  --font-sans: system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --text-xs: 0.75rem;   /* 12px */
  --text-sm: 0.875rem;  /* 14px */
  --text-base: 1rem;    /* 16px */
  --text-lg: 1.125rem;  /* 18px */
  --text-xl: 1.25rem;   /* 20px */
  --text-2xl: 1.5rem;   /* 24px */
  --text-3xl: 1.875rem; /* 30px */

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);

  /* Border radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-full: 9999px;

  /* Breakpoints */
  --bp-sm: 640px;
  --bp-md: 768px;
  --bp-lg: 1024px;
  --bp-xl: 1280px;
}
```

## Spacing Scale

Use 4px (0.25rem) base. Common scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.
Be consistent — don't use arbitrary values like 13px or 37px.

## Grid System

```css
.grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-4);
}

/* Responsive */
@media (max-width: 768px) {
  .grid { grid-template-columns: repeat(4, 1fr); }
}
```

## Component API Design

```typescript
// Good component API
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}
```

Principles: Consistent prop names across components, sensible defaults, forward refs, compose with className.

## Theme Structure

```typescript
const theme = {
  colors: {
    light: { bg: '#ffffff', text: '#171717', primary: '#3b82f6' },
    dark: { bg: '#0a0a0a', text: '#fafafa', primary: '#60a5fa' },
  }
};
```

Support dark mode with CSS media query: `@media (prefers-color-scheme: dark)`.
