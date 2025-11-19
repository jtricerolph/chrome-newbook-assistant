# Message Passing Reference

Complete reference for Chrome Extension message passing architecture and communication patterns.

---

## Table of Contents

- [Overview](#overview)
- [Message Flow Architecture](#message-flow-architecture)
- [Message Types](#message-types)
  - [Booking Detection Messages](#booking-detection-messages)
  - [Navigation Messages](#navigation-messages)
  - [Session Management Messages](#session-management-messages)
  - [Settings Messages](#settings-messages)
  - [Sidepanel Control Messages](#sidepanel-control-messages)
- [Communication Patterns](#communication-patterns)
- [Code Examples](#code-examples)

---

## Overview

The NewBook Assistant extension uses Chrome's message passing API to communicate between:
- **Content Script** (runs in NewBook pages)
- **Background Service Worker** (always running)
- **Sidepanel** (UI in sidebar)

Message flow is primarily one-directional but can be bidirectional for queries.

---

## Message Flow Architecture

```
┌─────────────────┐
│  Content Script │ (NewBook page)
│                 │
│  Detects:       │
│  - Booking IDs  │
│  - Planner      │
│  - Popups       │
│  - Session Lock │
└────────┬────────┘
         │
         │ chrome.runtime.sendMessage()
         ▼
┌─────────────────┐
│   Background    │ (Service Worker)
│                 │
│  Routes:        │
│  - Messages     │
│  - Tab Events   │
│  - Settings     │
└────────┬────────┘
         │
         │ chrome.runtime.sendMessage()
         ▼
┌─────────────────┐
│   Sidepanel     │ (UI)
│                 │
│  Displays:      │
│  - Bookings     │
│  - Restaurant   │
│  - Checks       │
└─────────────────┘
```

---

## Message Types

### Booking Detection Messages

#### `bookingDetected`

Sent when a booking page/popup is detected.

**Direction:** Content Script → Background → Sidepanel

**Message Format:**
```javascript
{
  action: 'bookingDetected',
  bookingId: string,     // e.g., '12345'
  url: string,           // Current page URL
  source: string         // 'url', 'popup', 'easytoolip-popup', 'planner-single-click'
}
```

**Sender:** content-script.js
**Receivers:** background.js, sidepanel.js

**When Sent:**
- URL matches `/bookings_view/{id}` or `/bookings_checkin/{id}`
- NewBook popup opens (fieldset.make_popup_tab)
- EasyToolTip preview popup appears (double-click on planner)

**Usage Example:**
```javascript
// Content script
chrome.runtime.sendMessage({
  action: 'bookingDetected',
  bookingId: '12345',
  url: window.location.href,
  source: 'url'
});

// Sidepanel listener
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'bookingDetected') {
    STATE.currentBookingId = message.bookingId;
    loadRestaurantTab(); // Refresh with new booking
  }
});
```

---

#### `plannerClick`

Sent when user single-clicks a booking in the planner.

**Direction:** Content Script → Background → Sidepanel

**Message Format:**
```javascript
{
  action: 'plannerClick',
  bookingId: string,
  source: 'planner-single-click'
}
```

**Sender:** content-script.js
**Receivers:** background.js, sidepanel.js

**When Sent:**
- User single-clicks booking block in planner
- Double-click is detected and ignored (lets NewBook handle it)
- Only sent if `enablePlannerClickUpdate` setting is true

**Usage Example:**
```javascript
// Content script
chrome.runtime.sendMessage({
  action: 'plannerClick',
  bookingId: '12345',
  source: 'planner-single-click'
});

// Sidepanel listener
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'plannerClick') {
    STATE.currentBookingId = message.bookingId;
    chrome.storage.local.set({ currentBookingId: message.bookingId });

    // Refresh current tab
    if (STATE.currentTab === 'restaurant') {
      loadRestaurantTab(true); // Force refresh
    } else if (STATE.currentTab === 'checks') {
      loadChecksTab(true);
    }
  }
});
```

---

### Navigation Messages

#### `openSidePanel`

Requests sidepanel to open (has user gesture from content script).

**Direction:** Content Script → Background

**Message Format:**
```javascript
{
  action: 'openSidePanel'
}
```

**Sender:** content-script.js (from button click)
**Receiver:** background.js

**When Sent:**
- User clicks "Open Assistant" floating button

**Usage Example:**
```javascript
// Content script
button.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openSidePanel' });
});

// Background script
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'openSidePanel' && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id });
  }
});
```

---

#### `sidepanelOpened`

Notifies content script that sidepanel was opened.

**Direction:** Background → Content Script

**Message Format:**
```javascript
{
  action: 'sidepanelOpened'
}
```

**Sender:** background.js
**Receiver:** content-script.js

**When Sent:**
- Sidepanel successfully opens

**Usage Example:**
```javascript
// Background script
chrome.sidePanel.open({ tabId: tabId }).then(() => {
  chrome.tabs.sendMessage(tabId, { action: 'sidepanelOpened' });
});

// Content script listener
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'sidepanelOpened') {
    sidepanelOpen = true;
    removeOpenButton(); // Hide floating button
  }
});
```

---

#### `sidepanelClosed`

Notifies that sidepanel was closed.

**Direction:** Sidepanel → Background → Content Script

**Message Format:**
```javascript
{
  action: 'sidepanelClosed'
}
```

**Sender:** sidepanel.js (window.onbeforeunload)
**Receivers:** background.js, content-script.js

**When Sent:**
- User closes sidepanel
- Window/tab closes

**Usage Example:**
```javascript
// Sidepanel
window.addEventListener('beforeunload', () => {
  chrome.runtime.sendMessage({ action: 'sidepanelClosed' });
});

// Background script forwards to content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'sidepanelClosed') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'showOpenButton' });
      }
    });
  }
});

// Content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'showOpenButton') {
    sidepanelOpen = false;
    createOpenButton(); // Show floating button again
  }
});
```

---

#### `isSidepanelOpen`

Queries if sidepanel is currently open for a tab.

**Direction:** Content Script → Background (with response)

**Message Format:**
```javascript
// Request
{
  action: 'isSidepanelOpen'
}

// Response
{
  isOpen: boolean
}
```

**Sender:** content-script.js
**Receiver:** background.js (responds)

**When Sent:**
- Content script initialization
- Need to check sidepanel state before showing button

**Usage Example:**
```javascript
// Content script
const response = await chrome.runtime.sendMessage({
  action: 'isSidepanelOpen'
});
if (response.isOpen) {
  sidepanelOpen = true;
  // Don't show floating button
}

// Background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'isSidepanelOpen' && sender.tab?.id) {
    const isOpen = sidepanelOpenTabs.has(sender.tab.id);
    sendResponse({ isOpen: isOpen });
    return true; // Keep channel open for async response
  }
});
```

---

### Session Management Messages

#### `sessionLockChanged`

Notifies when NewBook session lock dialog appears/disappears.

**Direction:** Content Script → Background → Sidepanel

**Message Format:**
```javascript
{
  action: 'sessionLockChanged',
  isLocked: boolean
}
```

**Sender:** content-script.js
**Receivers:** background.js, sidepanel.js

**When Sent:**
- `#locked_session_dialog` appears (session idle timeout)
- Dialog is dismissed (user logs back in)

**Usage Example:**
```javascript
// Content script
const lockDialog = document.getElementById('locked_session_dialog');
const isLocked = lockDialog && lockDialog.style.display !== 'none';

chrome.runtime.sendMessage({
  action: 'sessionLockChanged',
  isLocked: isLocked
});

// Sidepanel listener
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'sessionLockChanged') {
    STATE.sessionLocked = message.isLocked;

    if (message.isLocked) {
      // Show login prompt in UI
      showLoginPrompt();
    } else {
      // Refresh current tab
      refreshCurrentTab();
    }
  }
});
```

---

### Settings Messages

#### `settingsUpdated`

Notifies all components that settings have changed.

**Direction:** Settings Page → Background → Content Script + Sidepanel

**Message Format:**
```javascript
{
  action: 'settingsUpdated',
  settings: {
    apiRootUrl: string,
    username: string,
    applicationPassword: string,
    enableSidebarOnNewBook: boolean,
    recentBookingsCount: number,
    summaryRefreshRate: number,
    enablePlannerClickUpdate: boolean,
    highlightNewestMinutes: number,
    autoRefreshOnStaleCache: boolean,
    autoRefreshPauseIdleMinutes: number,
    cancelledHours: number,
    includeFlaggedCancelled: boolean,
    inactivityTimeout: number,
    pauseInactivityWhenFormOpen: boolean,
    enableDebugLogging: boolean
  }
}
```

**Sender:** settings.js
**Receivers:** background.js, content-script.js, sidepanel.js

**When Sent:**
- User saves settings in settings page

**Usage Example:**
```javascript
// Settings page
await chrome.storage.sync.set({ settings });
chrome.runtime.sendMessage({ action: 'settingsUpdated', settings });

// Background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'settingsUpdated') {
    settings = message.settings;

    // Forward to sidepanel
    chrome.runtime.sendMessage(message);

    // Update all NewBook tabs
    chrome.tabs.query({ url: 'https://appeu.newbook.cloud/*' }, (tabs) => {
      tabs.forEach(tab => handleTabUpdate(tab.id, tab.url));
    });
  }
});

// Content script listener
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'settingsUpdated') {
    settings = message.settings;
  }
});

// Sidepanel listener
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'settingsUpdated') {
    STATE.settings = message.settings;
    // Recreate API client with new credentials
    initializeApiClient();
  }
});
```

---

### Sidepanel Control Messages

These messages are internal to the background script and not passed as runtime messages, but are important for understanding sidepanel behavior:

#### Tab Update Events

**Event:** `chrome.tabs.onUpdated`

**When Fired:**
- Page loads/reloads
- URL changes (SPA navigation)

**Action:**
- Enable/disable sidepanel based on domain
- Set badge indicator
- Detect booking pages from URL

---

#### Tab Activated Events

**Event:** `chrome.tabs.onActivated`

**When Fired:**
- User switches tabs

**Action:**
- Enable/disable sidepanel for newly active tab
- Update badge

---

#### History State Updated

**Event:** `chrome.webNavigation.onHistoryStateUpdated`

**When Fired:**
- SPA navigation (pushState/replaceState)

**Action:**
- Re-run tab update logic
- Detect booking page navigation

---

## Communication Patterns

### Pattern 1: Event Detection → Background → Sidepanel

Most common pattern for booking detection:

```
Content Script          Background             Sidepanel
     │                      │                      │
     │  Detect Event        │                      │
     │  (URL/Popup)         │                      │
     │                      │                      │
     │  sendMessage()       │                      │
     │─────────────────────>│                      │
     │   bookingDetected    │                      │
     │                      │                      │
     │                      │  sendMessage()       │
     │                      │─────────────────────>│
     │                      │  bookingDetected     │
     │                      │                      │
     │                      │                      │ Update UI
     │                      │                      │ Load Data
     │                      │                      │
```

### Pattern 2: User Action → Background → Content Script

Used for sidepanel control:

```
Content Script          Background             User Action
     │                      │                      │
     │                      │    Click Button      │
     │                      │<─────────────────────│
     │                      │                      │
     │                      │  sidePanel.open()    │
     │                      │                      │
     │  sendMessage()       │                      │
     │<─────────────────────│                      │
     │  sidepanelOpened     │                      │
     │                      │                      │
     │ removeOpenButton()   │                      │
     │                      │                      │
```

### Pattern 3: Settings Update → Broadcast

Settings changes broadcast to all components:

```
Settings Page         Background        Content Script    Sidepanel
     │                     │                   │              │
     │  Save Settings      │                   │              │
     │                     │                   │              │
     │  sendMessage()      │                   │              │
     │────────────────────>│                   │              │
     │  settingsUpdated    │                   │              │
     │                     │                   │              │
     │                     │  sendMessage()    │              │
     │                     │──────────────────>│              │
     │                     │  settingsUpdated  │              │
     │                     │                   │              │
     │                     │  sendMessage()    │              │
     │                     │─────────────────────────────────>│
     │                     │                   │  settingsUpdated
     │                     │                   │              │
     │                     │                   │ Update       │ Update
     │                     │                   │              │
```

### Pattern 4: Query/Response

Used for state queries:

```
Content Script          Background
     │                      │
     │  sendMessage()       │
     │─────────────────────>│
     │  isSidepanelOpen     │
     │                      │
     │                      │ Check State
     │                      │
     │  sendResponse()      │
     │<─────────────────────│
     │  {isOpen: true}      │
     │                      │
```

---

## Code Examples

### Sending Messages

```javascript
// Simple one-way message (no response expected)
chrome.runtime.sendMessage({
  action: 'bookingDetected',
  bookingId: '12345'
}).catch(error => {
  // Receiver might not be ready, that's okay
  console.log('Message not delivered:', error);
});

// Message with response
const response = await chrome.runtime.sendMessage({
  action: 'isSidepanelOpen'
});
console.log('Sidepanel open:', response.isOpen);

// Message to specific tab
chrome.tabs.sendMessage(tabId, {
  action: 'sidepanelOpened'
}).catch(() => {
  // Tab might not have content script
});
```

### Receiving Messages

```javascript
// Simple listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'bookingDetected') {
    handleBooking(message.bookingId);
  }
});

// Listener with async response
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'isSidepanelOpen') {
    const isOpen = checkSidepanelState(sender.tab.id);
    sendResponse({ isOpen: isOpen });
    return true; // IMPORTANT: Keep channel open for sendResponse
  }
});

// Listener with async/await
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchData') {
    (async () => {
      try {
        const data = await fetchSomeData();
        sendResponse({ success: true, data });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep channel open for async response
  }
});
```

### Error Handling

```javascript
// Always use .catch() for sendMessage
chrome.runtime.sendMessage({ action: 'test' })
  .catch(error => {
    // This is normal if receiver isn't ready
    console.log('Message not delivered:', error);
  });

// Or try/catch with async/await
try {
  await chrome.runtime.sendMessage({ action: 'test' });
} catch (error) {
  console.log('Message error:', error);
}

// Check if runtime is available (extension context)
if (chrome.runtime?.id) {
  chrome.runtime.sendMessage({ action: 'test' });
} else {
  console.error('Extension context invalidated');
}
```

---

## Message Timing Considerations

### Race Conditions

Messages may arrive before receivers are ready:

```javascript
// Background script may forward before sidepanel loads
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'bookingDetected') {
    // Forward to sidepanel (may fail if not open yet)
    chrome.runtime.sendMessage(message).catch(() => {
      // That's okay - sidepanel will load booking on init
    });
  }
});
```

### Initialization Order

1. Background script loads first (always available)
2. Content scripts load when page loads
3. Sidepanel loads when user opens it

**Implication:** Use storage to persist state between component lifecycles:

```javascript
// Content script stores booking ID
chrome.storage.local.set({ currentBookingId: '12345' });

// Sidepanel loads it on init (even if message was missed)
const { currentBookingId } = await chrome.storage.local.get('currentBookingId');
```

### Message Buffering

Chrome doesn't buffer messages if receiver isn't ready. Use storage as a message buffer:

```javascript
// Sender
chrome.storage.local.set({
  pendingBooking: { id: '12345', timestamp: Date.now() }
});
chrome.runtime.sendMessage({ action: 'bookingDetected', bookingId: '12345' });

// Receiver (checks storage on init)
const { pendingBooking } = await chrome.storage.local.get('pendingBooking');
if (pendingBooking && Date.now() - pendingBooking.timestamp < 5000) {
  handleBooking(pendingBooking.id);
}
```

---

## Best Practices

1. **Always use .catch() on sendMessage** - Receiver may not be ready
2. **Return true from listener** - If using sendResponse asynchronously
3. **Use storage for persistence** - Don't rely on messages for critical state
4. **Validate message structure** - Check for required fields
5. **Use specific action names** - Avoid generic names like 'update'
6. **Handle missing receivers gracefully** - Log but don't error
7. **Don't send large data** - Use storage or direct API calls instead
8. **Use chrome.storage for state** - Messages are ephemeral

---

## Debugging Messages

### Chrome DevTools

```javascript
// In any component
chrome.runtime.onMessage.addListener((message, sender) => {
  console.log('Received message:', message);
  console.log('From:', sender);
  return true;
});

// Log all outgoing messages
const originalSendMessage = chrome.runtime.sendMessage.bind(chrome.runtime);
chrome.runtime.sendMessage = function(...args) {
  console.log('Sending message:', args[0]);
  return originalSendMessage(...args);
};
```

### Extension Pages

- **Background Console**: Right-click extension icon → "Inspect service worker"
- **Content Script Console**: Regular page DevTools
- **Sidepanel Console**: Right-click sidepanel → Inspect

---

## Next Steps

- See [FUNCTION_REFERENCE.md](FUNCTION_REFERENCE.md) for function signatures
- See [STATE_MANAGEMENT.md](STATE_MANAGEMENT.md) for state object details
- See [ARCHITECTURE.md](ARCHITECTURE.md) for system overview
