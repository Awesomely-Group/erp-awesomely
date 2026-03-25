# Typography Guide

## Type Scale

| Name  | Size   | Line Height | Use |
|-------|--------|-------------|-----|
| xs    | 12px   | 1.5         | Captions, labels |
| sm    | 14px   | 1.5         | Secondary text |
| base  | 16px   | 1.5         | Body text |
| lg    | 18px   | 1.5         | Lead paragraphs |
| xl    | 20px   | 1.4         | H4 |
| 2xl   | 24px   | 1.3         | H3 |
| 3xl   | 30px   | 1.2         | H2 |
| 4xl   | 36px   | 1.2         | H1 |
| 5xl   | 48px   | 1.1         | Display |

Common ratios: 1.2 (minor third), 1.25 (major third), 1.333 (perfect fourth).

## Line Height Rules
- Body text: 1.5 (150%)
- Headings: 1.1-1.3
- Tight spacing for large display text: 1.0-1.1

## Readability
- Optimal line length: 45-75 characters
- Don't justify text on web (causes uneven spacing)
- Sufficient paragraph spacing (1em minimum)
- Use `max-width: 65ch` for reading content

## System Fonts vs Custom

```css
/* System font stack (fastest, no download) */
font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;

/* Custom font (brand consistency) */
@font-face {
  font-family: 'Brand';
  src: url('/fonts/brand.woff2') format('woff2');
  font-display: swap;
}
```

- Prefer system fonts for performance
- If custom: use woff2, preload, font-display: swap
- Limit to 2 font families max

## Responsive Typography

```css
/* Fluid type with clamp() */
h1 { font-size: clamp(1.875rem, 4vw, 3rem); }
body { font-size: clamp(1rem, 1.5vw, 1.125rem); }
```
