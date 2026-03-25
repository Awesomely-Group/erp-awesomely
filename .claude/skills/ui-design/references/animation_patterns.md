# Animation Patterns

## Micro-interactions
- **Hover**: Scale 1.02-1.05, background color change
- **Focus**: Outline with offset, glow effect
- **Click/Tap**: Scale 0.95 (press feedback)
- **Toggle**: Smooth state transition
- **Loading**: Spinner, skeleton, progress bar

## Duration Guidelines
- **Instant feedback**: 100-150ms (hover, focus)
- **Simple transitions**: 200-300ms (fade, color)
- **Complex transitions**: 300-500ms (slide, expand)
- **Page transitions**: 300-500ms (route changes)

## Easing Functions
- **Enter**: ease-out (starts fast, ends slow) — elements appearing
- **Exit**: ease-in (starts slow, ends fast) — elements leaving
- **Move**: ease-in-out — elements repositioning
- **Bounce**: cubic-bezier(0.68, -0.55, 0.265, 1.55) — playful UI

## GPU-Accelerated Properties
Only animate these for 60fps:
- `transform` (translate, scale, rotate)
- `opacity`

Avoid animating: width, height, top, left, margin, padding (triggers layout).

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Always respect this preference. Replace motion with instant state changes.

## Loading States
- **Skeleton screens**: Better than spinners for known layouts
- **Shimmer effect**: Animated gradient overlay on skeleton
- **Progress bars**: For determinate progress (uploads, etc.)
- **Spinner**: For indeterminate, unknown-duration waits
