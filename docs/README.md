# NewBook Assistant Documentation

Welcome to the comprehensive documentation for the NewBook Assistant Chrome Extension.

---

## Overview

The NewBook Assistant is a Chrome Extension that provides a sidepanel interface for managing hotel bookings in the NewBook PMS system. It integrates with a WordPress REST API to provide restaurant reservation matching and booking management features.

---

## Documentation Index

### [FUNCTION_REFERENCE.md](FUNCTION_REFERENCE.md)
Complete reference for all key functions in the extension.

**Contents:**
- sidepanel.js functions (tab management, navigation, Gantt charts, API, forms, auth)
- content-script.js functions (booking detection, planner integration, popup detection, session management)
- background.js functions (message handling, tab management, settings)
- settings.js functions (settings management, validation, connection testing)
- Debug logging utilities
- Common patterns and examples

**Best for:**
- Understanding what each function does
- Looking up function parameters and return values
- Finding usage examples
- Learning function signatures

---

### [MESSAGE_PASSING_REFERENCE.md](MESSAGE_PASSING_REFERENCE.md)
Complete reference for Chrome Extension message passing architecture and communication patterns.

**Contents:**
- Message flow architecture diagrams
- Message types (booking detection, navigation, session management, settings, sidepanel control)
- Communication patterns
- Code examples for sending/receiving messages
- Error handling
- Message timing considerations
- Best practices
- Debugging tips

**Best for:**
- Understanding how components communicate
- Learning message formats and protocols
- Troubleshooting message passing issues
- Implementing new message types
- Understanding async message handling

---

### [STATE_MANAGEMENT.md](STATE_MANAGEMENT.md)
Complete reference for state management in the extension.

**Contents:**
- STATE object (sidepanel.js) - complete property reference
- Module-level state (content-script.js, background.js)
- Chrome Storage (chrome.storage.local, chrome.storage.sync)
- State synchronization patterns
- State lifecycle
- Best practices
- Debugging state

**Best for:**
- Understanding the STATE object structure
- Learning when and how state is updated
- Understanding storage synchronization
- Troubleshooting state issues
- Learning state lifecycle patterns

---

### [ARCHITECTURE.md](ARCHITECTURE.md)
Comprehensive architecture documentation for the extension.

**Contents:**
- High-level overview
- Component architecture diagrams
- File structure
- Communication patterns
- Data flow diagrams
- Tab management
- Settings and configuration
- WordPress REST API integration
- Extension permissions
- Security considerations
- Performance optimizations
- Browser compatibility
- Development workflow

**Best for:**
- Understanding the overall system design
- Learning how components fit together
- Understanding data flow
- Security and performance considerations
- Onboarding new developers
- Planning new features

---

### [FUNCTION_CHEAT_SHEET.md](FUNCTION_CHEAT_SHEET.md)
Quick reference guide for commonly used functions.

**Contents:**
- Tab management quick reference
- Data loading snippets
- Navigation helpers
- API call examples
- Gantt chart functions
- Form functions
- Message passing examples
- Storage operations
- Utilities
- Common patterns
- Quick tips

**Best for:**
- Quick lookups during development
- Copy-paste code snippets
- Common patterns reference
- Daily development workflow
- Quick refreshers

---

### [CSS_STYLING_GUIDE.md](CSS_STYLING_GUIDE.md)
Complete CSS styling guide for all UI components and booking creation enhancements.

**Contents:**
- Core component styles (date sections, booking headers, collapsible sections)
- Gantt chart container and elements
- Time slot button grid
- Form feedback messages and validation
- Navigation links and buttons
- Enhanced form rows and inputs
- Color palette reference
- Animation and timing specifications
- Responsive design patterns
- Accessibility enhancements
- Testing guidelines
- Performance considerations
- Print styles and dark mode support

**Best for:**
- Understanding UI component styling
- Implementing new UI elements
- Maintaining design consistency
- Accessibility compliance
- Responsive layout adjustments
- Debugging styling issues
- Learning the color palette and design system

---

## Quick Start Guide

### For New Developers

1. **Start with [ARCHITECTURE.md](ARCHITECTURE.md)** to understand the overall system
2. **Read [MESSAGE_PASSING_REFERENCE.md](MESSAGE_PASSING_REFERENCE.md)** to understand component communication
3. **Review [STATE_MANAGEMENT.md](STATE_MANAGEMENT.md)** to understand state patterns
4. **Read [CSS_STYLING_GUIDE.md](CSS_STYLING_GUIDE.md)** to understand UI styling and design system
5. **Keep [FUNCTION_CHEAT_SHEET.md](FUNCTION_CHEAT_SHEET.md)** open for quick reference
6. **Use [FUNCTION_REFERENCE.md](FUNCTION_REFERENCE.md)** for detailed function documentation

### For Experienced Developers

1. **Use [FUNCTION_CHEAT_SHEET.md](FUNCTION_CHEAT_SHEET.md)** for quick lookups
2. **Refer to [FUNCTION_REFERENCE.md](FUNCTION_REFERENCE.md)** for detailed specs
3. **Check [MESSAGE_PASSING_REFERENCE.md](MESSAGE_PASSING_REFERENCE.md)** for message protocols
4. **Review [STATE_MANAGEMENT.md](STATE_MANAGEMENT.md)** for state patterns
5. **Consult [CSS_STYLING_GUIDE.md](CSS_STYLING_GUIDE.md)** for UI styling

### For Debugging

1. **[MESSAGE_PASSING_REFERENCE.md](MESSAGE_PASSING_REFERENCE.md)** - Message flow issues
2. **[STATE_MANAGEMENT.md](STATE_MANAGEMENT.md)** - State synchronization issues
3. **[FUNCTION_REFERENCE.md](FUNCTION_REFERENCE.md)** - Function behavior
4. **[CSS_STYLING_GUIDE.md](CSS_STYLING_GUIDE.md)** - Styling and UI issues
5. **[ARCHITECTURE.md](ARCHITECTURE.md)** - System-level issues

---

## File Locations

### Extension Files

```
chrome-newbook-assistant/
├── manifest.json                 # Extension manifest
├── background.js                 # Service Worker
├── content-script.js             # Content script (injected into NewBook)
├── sidepanel/
│   ├── sidepanel.html           # Sidepanel UI
│   ├── sidepanel.js             # Sidepanel logic
│   └── sidepanel.css            # Sidepanel styles
├── settings/
│   ├── settings.html            # Settings page
│   ├── settings.js              # Settings logic
│   └── settings.css             # Settings styles
└── icons/
    ├── icon16.png               # Extension icon (16x16)
    ├── icon48.png               # Extension icon (48x48)
    └── icon128.png              # Extension icon (128x128)
```

### Documentation Files

```
docs/
├── README.md                     # This file
├── ARCHITECTURE.md               # System architecture
├── FUNCTION_REFERENCE.md         # Function documentation
├── MESSAGE_PASSING_REFERENCE.md  # Message passing guide
├── STATE_MANAGEMENT.md           # State management guide
├── FUNCTION_CHEAT_SHEET.md       # Quick reference
└── CSS_STYLING_GUIDE.md          # CSS styling guide
```

---

## Key Concepts

### Components

The extension consists of three main components:

1. **Content Script** (`content-script.js`)
   - Runs in NewBook pages
   - Detects booking pages, popups, planner clicks
   - Monitors session lock dialog
   - Shows floating "Open Assistant" button

2. **Background Service Worker** (`background.js`)
   - Always running
   - Routes messages between components
   - Manages tab updates and sidepanel control
   - Synchronizes settings

3. **Sidepanel** (`sidepanel.js`)
   - UI in Chrome sidebar
   - Displays booking data (Summary, Restaurant, Checks, Staying)
   - Communicates with WordPress REST API
   - Manages STATE object

### Communication

Components communicate via Chrome's message passing API:

```
Content Script → Background → Sidepanel
```

Messages include:
- `bookingDetected` - Booking page/popup detected
- `plannerClick` - User clicked booking in planner
- `sessionLockChanged` - Session lock dialog shown/hidden
- `settingsUpdated` - Settings changed
- `openSidePanel` - Request to open sidepanel

### State Management

State is managed in multiple locations:

- **STATE object** (sidepanel.js) - Primary UI state
- **chrome.storage.local** - Persistent state (survives reloads)
- **chrome.storage.sync** - Settings (syncs across devices)
- **Module-level variables** - Component-specific state

### WordPress API

The extension communicates with a WordPress REST API for data:

**Endpoints:**
- `/summary` - Recent bookings
- `/restaurant` - Restaurant suggestions
- `/checks` - Check-in/out data
- `/staying` - Guests staying on date
- `/opening-hours` - Restaurant hours
- `/available-times` - Available booking times
- `/create-booking` - Create restaurant booking

---

## Common Tasks

### Add a New Function

1. Add function to appropriate file (sidepanel.js, content-script.js, etc.)
2. Document in [FUNCTION_REFERENCE.md](FUNCTION_REFERENCE.md)
3. Add to [FUNCTION_CHEAT_SHEET.md](FUNCTION_CHEAT_SHEET.md) if commonly used
4. Update [ARCHITECTURE.md](ARCHITECTURE.md) if it affects architecture

### Add a New Message Type

1. Define message in component (content-script.js, sidepanel.js, etc.)
2. Add listener in receiving component
3. Document in [MESSAGE_PASSING_REFERENCE.md](MESSAGE_PASSING_REFERENCE.md)
4. Add example to [FUNCTION_CHEAT_SHEET.md](FUNCTION_CHEAT_SHEET.md)

### Add a New STATE Property

1. Add property to STATE object in sidepanel.js
2. Document in [STATE_MANAGEMENT.md](STATE_MANAGEMENT.md)
3. Update [ARCHITECTURE.md](ARCHITECTURE.md) if affects data flow
4. Add usage example to [FUNCTION_CHEAT_SHEET.md](FUNCTION_CHEAT_SHEET.md)

### Add a New API Endpoint

1. Implement endpoint in WordPress plugin
2. Add fetch function in sidepanel.js
3. Document in [FUNCTION_REFERENCE.md](FUNCTION_REFERENCE.md)
4. Update [ARCHITECTURE.md](ARCHITECTURE.md) with endpoint details
5. Add example to [FUNCTION_CHEAT_SHEET.md](FUNCTION_CHEAT_SHEET.md)

---

## Troubleshooting

### Common Issues

**Problem:** Sidepanel not loading data

**Solutions:**
1. Check [ARCHITECTURE.md](ARCHITECTURE.md) - API integration section
2. Verify settings in extension settings page
3. Test API connection with "Test Connection" button
4. Check Chrome DevTools console for errors
5. Enable debug logging in settings

---

**Problem:** Messages not being received

**Solutions:**
1. Check [MESSAGE_PASSING_REFERENCE.md](MESSAGE_PASSING_REFERENCE.md) - debugging section
2. Verify sender and receiver are both loaded
3. Check Chrome DevTools console for errors
4. Use .catch() on sendMessage calls
5. Verify message format matches expected structure

---

**Problem:** State not synchronizing

**Solutions:**
1. Check [STATE_MANAGEMENT.md](STATE_MANAGEMENT.md) - synchronization section
2. Verify chrome.storage.set calls are awaited
3. Check if storage quota exceeded
4. Verify state is being read from storage on init
5. Check Chrome DevTools Application tab → Storage

---

**Problem:** Booking not being detected

**Solutions:**
1. Check [FUNCTION_REFERENCE.md](FUNCTION_REFERENCE.md) - detectBookingPage function
2. Verify URL matches pattern `/bookings_view/{id}` or `/bookings_checkin/{id}`
3. Check if content script is loaded (Chrome DevTools → Sources)
4. Enable debug logging to see detection attempts
5. Verify domain is in manifest.json host_permissions

---

## Development Workflow

### Local Development

```bash
# 1. Clone repository
git clone <repository-url>
cd chrome-newbook-assistant

# 2. Load extension in Chrome
# - Open chrome://extensions
# - Enable "Developer mode"
# - Click "Load unpacked"
# - Select extension directory

# 3. Make changes to code

# 4. Reload extension
# - Click reload icon in chrome://extensions
# - Or use Ctrl+R in extension management page
```

### Testing

```bash
# 1. Open NewBook page
# Navigate to https://appeu.newbook.cloud

# 2. Open sidepanel
# Click extension icon or "Open Assistant" button

# 3. Test features
# - Navigate to booking page
# - Click booking in planner
# - Test tab switching
# - Test form submission

# 4. Check console logs
# - Background: Right-click icon → "Inspect service worker"
# - Content: Regular page DevTools
# - Sidepanel: Right-click sidepanel → "Inspect"
```

### Debugging

```javascript
// Enable debug logging in settings
settings.enableDebugLogging = true;

// Use BMA_LOG instead of console.log
BMA_LOG.log('Debug message');
BMA_LOG.warn('Warning');
BMA_LOG.error('Error');

// Monitor messages
chrome.runtime.onMessage.addListener((message, sender) => {
  console.log('Message received:', message, 'from:', sender);
  return true;
});

// Monitor storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('Storage changed:', areaName, changes);
});

// Check state
console.log('Current STATE:', STATE);
console.log('Current booking:', STATE.currentBookingId);
```

---

## Contributing

When contributing to this project:

1. **Read the documentation** - Understand the architecture before making changes
2. **Follow existing patterns** - Maintain consistency with existing code
3. **Update documentation** - Keep docs in sync with code changes
4. **Test thoroughly** - Verify changes don't break existing functionality
5. **Use debug logging** - Add BMA_LOG calls for debugging
6. **Handle errors** - Use try/catch and display user-friendly errors
7. **Clear resources** - Clear timers and event listeners on cleanup

---

## Additional Resources

### Chrome Extension Documentation

- [Chrome Extensions Overview](https://developer.chrome.com/docs/extensions/)
- [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Message Passing](https://developer.chrome.com/docs/extensions/mv3/messaging/)
- [Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Side Panel API](https://developer.chrome.com/docs/extensions/reference/sidePanel/)

### WordPress REST API

- [WordPress REST API Handbook](https://developer.wordpress.org/rest-api/)
- [Authentication](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/)
- [Application Passwords](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/)

---

## Support

For questions or issues:

1. Check the relevant documentation file
2. Search Chrome DevTools console for errors
3. Enable debug logging in settings
4. Check Chrome extension error logs
5. Contact the development team

---

## License

[Add license information here]

---

## Version History

**v2.0.0** - Current version
- Comprehensive documentation added
- WordPress REST API integration
- Gantt chart visualization
- Auto-refresh functionality
- Planner integration
- Session lock detection

---

*Last updated: 2025-01-19*
