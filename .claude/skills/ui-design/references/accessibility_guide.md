# Accessibility Guide — WCAG 2.1 AA

## Perceivable

### Text Alternatives
- All images need alt text (descriptive or empty for decorative)
- Videos need captions and audio descriptions
- Icons with meaning need accessible labels

### Color Contrast
- Normal text: 4.5:1 ratio minimum
- Large text (18px+ or 14px+ bold): 3:1 ratio minimum
- UI components and graphics: 3:1 ratio minimum
- Don't rely on color alone to convey information

## Operable

### Keyboard Navigation
- All interactive elements focusable with Tab
- Logical tab order (follows DOM order)
- Skip navigation link at top of page
- No keyboard traps (user can always tab away)
- Visible focus indicators

```css
/* Good focus indicator */
:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 2px;
}
```

### Focus Management
- Move focus to modal when opened
- Return focus to trigger when modal closes
- Focus trap inside modals/dialogs

```typescript
// Focus trap hook
function useFocusTrap(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const focusable = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    first?.focus();
    // Handle Tab and Shift+Tab to cycle within trap
  }, [ref]);
}
```

## Understandable

### Labels and Instructions
- Every form field has a visible label
- Required fields clearly marked
- Error messages are specific and helpful
- Instructions provided before complex interactions

### Consistent Navigation
- Navigation is consistent across pages
- Interactive elements behave predictably
- Language is specified in HTML: `<html lang="en">`

## Robust

### ARIA Roles and Properties

```html
<!-- Dialog/Modal -->
<div role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title">Confirm Delete</h2>
</div>

<!-- Tabs -->
<div role="tablist">
  <button role="tab" aria-selected="true" aria-controls="panel-1">Tab 1</button>
</div>
<div role="tabpanel" id="panel-1">Content</div>

<!-- Alert -->
<div role="alert">Form submitted successfully</div>

<!-- Live regions -->
<div aria-live="polite">Loading complete</div>
```

### ARIA Rules
1. Don't use ARIA if native HTML works (use `<button>` not `<div role="button">`)
2. All ARIA roles need required properties
3. Don't change native semantics
4. All interactive ARIA elements must be focusable

## Testing

- axe DevTools browser extension
- Lighthouse accessibility audit
- Screen reader testing (VoiceOver, NVDA)
- Keyboard-only navigation test
- Color contrast checker tools
