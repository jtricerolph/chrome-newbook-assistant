# Chrome NewBook Assistant - CSS Styles Reference

Complete CSS styling guide for all new UI components in the booking creation enhancement.

## File: sidepanel.css

Current file size: 606 lines
Location: `chrome-newbook-assistant/sidepanel/sidepanel.css`

---

## New Styles to Add

### 1. Date Section Wrapper

**Purpose:** Container for navigation targeting and scroll margin

```css
.bma-date-section {
  margin-bottom: 24px;
  scroll-margin-top: 20px;  /* Space from top when scrollIntoView */
}
```

**Usage:**
- Wraps each date's content in Restaurant tab
- Provides scroll target for navigation
- `scroll-margin-top` prevents content from being hidden under fixed headers

---

### 2. Compact Booking Header

**Purpose:** Show guest summary at top of create form

```css
.bma-booking-header {
  padding: 12px 16px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  margin-bottom: 16px;
}

.bma-booking-summary {
  font-size: 14px;
  color: #0c4a6e;
  display: block;
}

.bma-booking-summary strong {
  font-weight: 600;
  color: #075985;
}
```

**Example HTML:**
```html
<div class="bma-booking-header">
  <span class="bma-booking-summary">
    <strong>John Smith</strong> - #12345 (4 pax)
  </span>
</div>
```

---

### 3. Collapsible Sections

**Purpose:** Space-efficient expandable form sections with content indicators

**Current Implementation (Lines 664-719):**

```css
.bma-expandable-section {
  margin-bottom: 8px;  /* Reduced from 12px for compact layout */
}

.bma-section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px 12px;     /* Reduced from 12px 16px to match service period headers */
  font-size: 12px;       /* Reduced from 14px */
  font-weight: 600;      /* Increased from 500 for bold text */
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;
}

.bma-section-toggle:hover {
  background: #e5e7eb;
}

.bma-section-toggle .material-symbols-outlined {
  font-size: 16px;       /* Reduced from 20px */
  transition: transform 0.3s ease;
}

.bma-section-toggle[aria-expanded="true"] .material-symbols-outlined {
  transform: rotate(180deg);
}

/* Section title with flex-grow to push indicator to right */
.bma-section-toggle .section-title {
  flex: 1;
}

/* Content indicator - shows when section has user-entered data */
.bma-section-toggle .section-indicator {
  font-size: 16px;
  color: #10b981;        /* Green color */
  margin-left: auto;
  display: none;         /* Hidden by default */
}

.bma-section-toggle .section-indicator.has-content {
  display: block;        /* Shows when section has content */
}

.bma-section-content {
  border: 1px solid #e5e7eb;
  border-top: none;
  border-radius: 0 0 6px 6px;
  padding: 16px;
  background: white;
  animation: slideDown 0.3s ease-out;
}
```

**Features:**
- **Compact sizing**: Matches service period header styling for visual consistency
- **Content indicators**: Green "draw" icon appears when sections contain user data
- **Smart detection**: JavaScript monitors form fields and shows indicator when:
  - Details section: phone, email, or checkboxes have non-default values
  - Allergies section: any dietary options checked or "other" text entered
  - Note section: note textarea contains text
- **Real-time updates**: Indicators appear/disappear as user enters/removes content
- **Accessibility**: Uses aria-expanded attribute for screen readers

**JavaScript Integration:**
```javascript
// Add 'expanded' class when toggling
toggle.classList.toggle('expanded');
```

---

### 4. Gantt Chart Container

**Purpose:** Viewport wrapper with scroll controls

```css
.bma-gantt-container {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 16px;
  background: white;
}

.gantt-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.gantt-scroll-btn {
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 16px;
  color: #374151;
  transition: all 0.2s;
  min-width: 36px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.gantt-scroll-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.gantt-scroll-btn:active {
  background: #e5e7eb;
}

.gantt-title {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  flex-grow: 1;
  text-align: center;
}

.gantt-viewport {
  overflow-x: auto;
  overflow-y: hidden;
  height: 120px;  /* Compact mode height */
  position: relative;
  background: white;
}

/* Custom scrollbar for Gantt viewport */
.gantt-viewport::-webkit-scrollbar {
  height: 8px;
}

.gantt-viewport::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.gantt-viewport::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 4px;
}

.gantt-viewport::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
```

---

### 5. Gantt Chart Elements

**Purpose:** Styles for Gantt chart content (supplement PHP-generated inline styles)

```css
/* Sight line for time button hover */
.gantt-sight-line {
  position: absolute;
  top: 0;
  width: 2px;
  background: #ef4444;
  z-index: 100;
  pointer-events: none;
  display: none;
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.5);
}

/* Enhance booking bars with hover effect */
.gantt-booking-bar {
  cursor: pointer;
  transition: all 0.2s;
}

.gantt-booking-bar:hover {
  transform: scale(1.02);
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* Tooltip for booking bars */
.gantt-booking-bar::after {
  content: attr(data-name) ' - ' attr(data-people) ' people at ' attr(data-time);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  padding: 6px 10px;
  background: #1f2937;
  color: white;
  font-size: 11px;
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  z-index: 1000;
}

.gantt-booking-bar:hover::after {
  opacity: 1;
}
```

---

### 6. Time Slot Button Grid

**Purpose:** Interactive time selection interface

```css
.bma-time-slots-wrapper {
  margin-bottom: 16px;
}

.bma-time-slots-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.time-slot-period {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;
  background: white;
}

.time-slot-period-header {
  padding: 8px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.time-slot-buttons {
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.time-slot-btn {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  min-width: 60px;
  text-align: center;
  color: #374151;
}

.time-slot-btn:hover {
  background: #f0f9ff;
  border-color: #3b82f6;
  color: #1e40af;
}

.time-slot-btn.selected {
  background: #3b82f6;
  color: white;
  border-color: #2563eb;
  box-shadow: 0 1px 3px rgba(59, 130, 246, 0.5);
}

.time-slot-btn.unavailable {
  background: #f3f4f6;
  color: #9ca3af;
  border-color: #e5e7eb;
}

.time-slot-btn.unavailable:hover {
  cursor: pointer;  /* Still clickable for override */
  background: #fef3c7;
  border-color: #fbbf24;
  color: #92400e;
}

/* Tooltip for unavailable times */
.time-slot-btn.unavailable::before {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  padding: 6px 10px;
  background: #1f2937;
  color: white;
  font-size: 11px;
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  z-index: 1000;
}

.time-slot-btn.unavailable:hover::before {
  opacity: 1;
}
```

---

### 7. Form Feedback Enhancements

**Purpose:** Inline form feedback styling

```css
.bma-form-feedback {
  margin-top: 12px;
  padding: 12px;
  border-radius: 6px;
  font-size: 13px;
  display: none;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.bma-form-feedback.success {
  background: #d1fae5;
  color: #065f46;
  border: 1px solid #10b981;
  display: block;
}

.bma-form-feedback.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #ef4444;
  display: block;
}

.bma-form-feedback.info {
  background: #dbeafe;
  color: #1e40af;
  border: 1px solid #3b82f6;
  display: block;
}

/* Icon before feedback text */
.bma-form-feedback::before {
  margin-right: 8px;
  font-weight: bold;
}

.bma-form-feedback.success::before {
  content: '✓';
}

.bma-form-feedback.error::before {
  content: '✕';
}

.bma-form-feedback.info::before {
  content: 'ℹ';
}
```

---

### 8. Navigation Link Styles

**Purpose:** "Create Booking" links in Summary tab

```css
.bma-create-booking-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: #3b82f6;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  margin-top: 8px;
  cursor: pointer;
  border: none;
}

.bma-create-booking-link:hover {
  background: #2563eb;
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);
}

.bma-create-booking-link:active {
  background: #1d4ed8;
  transform: translateY(1px);
}

.bma-create-booking-link .material-symbols-outlined {
  font-size: 18px;
}
```

---

### 9. Enhanced Form Row Styles

**Purpose:** Improve existing form row styling

```css
.bma-form-row {
  margin-bottom: 12px;
}

.bma-form-row label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
}

.bma-form-row input[type="text"],
.bma-form-row input[type="email"],
.bma-form-row input[type="tel"],
.bma-form-row input[type="number"],
.bma-form-row select,
.bma-form-row textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  color: #1f2937;
  transition: border-color 0.2s;
}

.bma-form-row input:focus,
.bma-form-row select:focus,
.bma-form-row textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.bma-form-row input:read-only {
  background: #f9fafb;
  color: #6b7280;
  cursor: not-allowed;
}

/* Checkbox labels */
.bma-form-row label input[type="checkbox"] {
  margin-right: 8px;
  cursor: pointer;
}

.bma-form-row label:has(input[type="checkbox"]) {
  display: flex;
  align-items: center;
  font-weight: 400;
  cursor: pointer;
}
```

---

### 10. Button Enhancements

**Purpose:** Improve button states and animations

```css
.bma-btn-submit,
.bma-btn-cancel {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.bma-btn-submit {
  background: #3b82f6;
  color: white;
}

.bma-btn-submit:hover:not(:disabled) {
  background: #2563eb;
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);
}

.bma-btn-submit:active:not(:disabled) {
  background: #1d4ed8;
  transform: translateY(1px);
}

.bma-btn-submit:disabled {
  background: #9ca3af;
  cursor: not-allowed;
  opacity: 0.6;
}

.bma-btn-cancel {
  background: #f3f4f6;
  color: #374151;
}

.bma-btn-cancel:hover {
  background: #e5e7eb;
}

.bma-btn-cancel:active {
  background: #d1d5db;
  transform: translateY(1px);
}

/* Loading state for submit button */
.bma-btn-submit:disabled::after {
  content: '';
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-left: 8px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

---

### 11. Responsive Adjustments

**Purpose:** Optimize for narrow sidebar width

```css
/* For very narrow viewports (< 350px) */
@media (max-width: 350px) {
  .time-slot-btn {
    padding: 6px 8px;
    font-size: 12px;
    min-width: 50px;
  }

  .gantt-controls {
    padding: 6px 8px;
  }

  .gantt-title {
    font-size: 12px;
  }

  .bma-booking-header {
    padding: 10px 12px;
  }

  .bma-section-toggle {
    padding: 10px 12px;
    font-size: 13px;
  }
}
```

---

### 12. Accessibility Enhancements

**Purpose:** Improve keyboard navigation and screen reader support

```css
/* Focus styles */
.time-slot-btn:focus,
.gantt-scroll-btn:focus,
.bma-section-toggle:focus,
.bma-btn-submit:focus,
.bma-btn-cancel:focus {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

/* Skip to content link (for keyboard users) */
.skip-to-form:focus {
  position: absolute;
  top: 10px;
  left: 10px;
  background: #3b82f6;
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  z-index: 10000;
}

/* Screen reader only text */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

---

## Complete Style Integration

### Where to Add

Add all new styles to **`chrome-newbook-assistant/sidepanel/sidepanel.css`** at the end of the file (after line 606).

### Organization

```css
/* ========================================
   BOOKING CREATION ENHANCEMENTS
   ======================================== */

/* Date Section Wrapper */
.bma-date-section { ... }

/* Compact Booking Header */
.bma-booking-header { ... }

/* Collapsible Sections */
.bma-expandable-section { ... }

/* Gantt Chart Container */
.bma-gantt-container { ... }

/* Gantt Chart Elements */
.gantt-sight-line { ... }

/* Time Slot Grid */
.bma-time-slots-wrapper { ... }

/* Form Feedback */
.bma-form-feedback { ... }

/* Navigation Links */
.bma-create-booking-link { ... }

/* Enhanced Form Rows */
.bma-form-row { ... }

/* Button Enhancements */
.bma-btn-submit { ... }

/* Responsive */
@media (max-width: 350px) { ... }

/* Accessibility */
.skip-to-form:focus { ... }
```

---

## Testing Checklist

### Visual Testing

- [ ] All sections collapse/expand smoothly
- [ ] Gantt chart viewport scrolls correctly
- [ ] Time slot buttons show correct states (available/unavailable/selected)
- [ ] Form feedback messages display with correct colors
- [ ] Buttons show proper hover/active/disabled states
- [ ] Navigation links are clickable and styled correctly
- [ ] Tooltips appear on hover for unavailable times
- [ ] Gantt sight line appears/disappears correctly

### Responsive Testing

- [ ] Layout works at 350px width (minimum sidebar)
- [ ] Layout works at 500px width (typical sidebar)
- [ ] Text doesn't overflow or wrap incorrectly
- [ ] Buttons remain clickable at all sizes
- [ ] Gantt chart is usable with horizontal scroll

### Accessibility Testing

- [ ] All interactive elements are keyboard accessible
- [ ] Focus indicators are visible
- [ ] Color contrast meets WCAG AA standards
- [ ] Screen reader announces form states correctly

### Browser Testing

- [ ] Chrome (primary target)
- [ ] Edge (Chromium-based, should match Chrome)
- [ ] Safari (if Mac users)

---

## Color Palette Reference

```css
/* Primary Colors */
--blue-600: #3b82f6;    /* Primary action color */
--blue-700: #2563eb;    /* Primary hover */
--blue-800: #1d4ed8;    /* Primary active */

/* Success Colors */
--green-100: #d1fae5;   /* Success background */
--green-800: #065f46;   /* Success text */
--green-500: #10b981;   /* Success border */

/* Error Colors */
--red-100: #fee2e2;     /* Error background */
--red-800: #991b1b;     /* Error text */
--red-500: #ef4444;     /* Error border */

/* Info Colors */
--blue-100: #dbeafe;    /* Info background */
--blue-800: #1e40af;    /* Info text */
--blue-500: #3b82f6;    /* Info border */

/* Neutral Colors */
--gray-50: #f9fafb;     /* Light background */
--gray-100: #f3f4f6;    /* Hover background */
--gray-200: #e5e7eb;    /* Border */
--gray-300: #d1d5db;    /* Input border */
--gray-400: #9ca3af;    /* Disabled text */
--gray-500: #6b7280;    /* Secondary text */
--gray-700: #374151;    /* Primary text */
--gray-900: #1f2937;    /* Heading text */
```

---

## Animation Timing

```css
/* Standard transitions */
transition: all 0.2s ease-out;

/* Hover effects */
transition: background 0.2s, border-color 0.2s, transform 0.2s;

/* Smooth scrolling */
behavior: smooth;

/* Fade in */
animation: fadeIn 0.2s ease-out;

/* Loading spinner */
animation: spin 0.6s linear infinite;
```

---

## Z-Index Hierarchy

```css
.gantt-sight-line       { z-index: 100; }
.gantt-booking-bar      { z-index: 1; }
.gantt-booking-bar:hover { z-index: 10; }
.time-slot-btn::before  { z-index: 1000; }  /* Tooltip */
.gantt-booking-bar::after { z-index: 1000; }  /* Tooltip */
.bma-custom-modal       { z-index: 10000; }  /* Modal overlay */
.skip-to-form:focus     { z-index: 10000; }  /* Accessibility */
```

---

## Performance Considerations

1. **Use CSS Transitions Over Animations** - More performant
2. **Limit Box Shadows** - Can impact scroll performance
3. **Avoid Layout Thrashing** - Batch DOM reads/writes
4. **Use `will-change` Sparingly** - Only for actively animating elements

```css
/* Only on interactive elements that will transform */
.gantt-booking-bar {
  will-change: transform;
}
```

---

## Print Styles (Optional)

```css
@media print {
  .gantt-controls,
  .time-slot-buttons,
  .bma-section-toggle,
  .bma-form-actions {
    display: none;
  }

  .bma-section-content {
    display: block !important;
  }

  .gantt-viewport {
    overflow: visible;
    height: auto;
  }
}
```

---

## Dark Mode Support (Future)

```css
@media (prefers-color-scheme: dark) {
  .bma-booking-header {
    background: #1e3a5f;
    border-color: #2563eb;
    color: #bfdbfe;
  }

  .bma-section-toggle {
    background: #1f2937;
    color: #f3f4f6;
  }

  .time-slot-btn {
    background: #374151;
    border-color: #4b5563;
    color: #f3f4f6;
  }

  /* ... etc */
}
```
