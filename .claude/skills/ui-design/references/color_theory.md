# Color Theory for UI

## Contrast Ratios

| Level | Normal Text | Large Text | UI Components |
|-------|------------|------------|---------------|
| AA    | 4.5:1      | 3:1        | 3:1           |
| AAA   | 7:1        | 4.5:1      | —             |

Tools: WebAIM Contrast Checker, Chrome DevTools color picker.

## Palette Generation

### Semantic Colors
- **Primary**: Brand color, CTAs, links
- **Secondary**: Supporting actions
- **Neutral**: Text, backgrounds, borders
- **Success**: Confirmations (green)
- **Warning**: Caution states (amber/yellow)
- **Error**: Errors, destructive actions (red)
- **Info**: Informational states (blue)

### Scale Generation
Generate 50-900 scale (50=lightest, 900=darkest):
- Use HSL: adjust lightness while keeping hue/saturation
- 500 = base color, 50 = tinted background, 900 = dark text

## Dark Mode

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0a0a0a;
    --text: #fafafa;
    --border: #262626;
  }
}
```

Rules: Don't just invert colors. Reduce contrast slightly (not pure white on pure black). Desaturate colors slightly. Use elevation (lighter = higher).

### OLED Considerations
True black (#000000) saves battery on OLED but can cause "smearing". Use near-black (#0a0a0a) instead.

## Color Blindness

- Don't use color as the only indicator (add icons, patterns, text)
- Red-green is most common — use shapes/icons alongside
- Test with color blindness simulators
