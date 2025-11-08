# NewBook Assistant - Comprehensive Extension Summary

**Version**: 2.0.0
**Type**: Chrome Extension (Manifest V3)
**Technology**: Vanilla JavaScript (no build tools)
**Purpose**: Sidepanel assistant for NewBook PMS booking management and restaurant reservation matching

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [File Structure & Responsibilities](#file-structure--responsibilities)
3. [State Management](#state-management)
4. [API Integration](#api-integration)
5. [Message Passing](#message-passing)
6. [UI Components](#ui-components)
7. [Settings Schema](#settings-schema)
8. [Key Features](#key-features)
9. [Code Patterns](#code-patterns)
10. [Common Editing Tasks](#common-editing-tasks)

---

## Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Browser                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────┐         ┌──────────────────┐                │
│  │ NewBook Page   │────────>│ Background       │                │
│  │ (Content       │ Messages│ Service Worker   │                │
│  │  Script)       │<────────│                  │                │
│  └────────────────┘         └──────────────────┘                │
│         │                            │                           │
│         │ Detects booking            │ Routes messages           │
│         │ Monitors planner           │ Manages sidepanel         │
│         │                            │ state per tab             │
│         │                            │                           │
│         │                    ┌───────▼───────┐                   │
│         │                    │   Sidepanel   │                   │
│         │                    │   (UI)        │                   │
│         └───────────────────>│               │                   │
│           Direct messages    │ 3 Tabs:       │                   │
│                              │ - Summary     │                   │
│                              │ - Restaurant  │                   │
│                              │ - Checks      │                   │
│                              └───────┬───────┘                   │
│                                      │                           │
│                                      │ API Calls                 │
│                                      │                           │
└──────────────────────────────────────┼───────────────────────────┘
                                       │
                                       ▼
                              ┌────────────────┐
                              │  WordPress API │
                              │  (External)    │
                              └────────────────┘
```

### Component Interaction

1. **Content Script** runs on all `appeu.newbook.cloud` pages
   - Detects booking URLs via pattern matching
   - Monitors planner clicks (single-click with 250ms debounce)
   - Sends messages to background worker

2. **Background Worker** manages extension state
   - Enables/disables sidepanel based on domain
   - Stores current booking ID in `chrome.storage.local`
   - Routes messages between content script and sidepanel

3. **Sidepanel** provides user interface
   - Loads independently (separate HTML page)
   - Makes API calls directly (not through background)
   - Manages own state with global `STATE` object
   - Listens for messages from background worker

4. **Settings Page** configures extension
   - Stores config in `chrome.storage.sync` (syncs across devices)
   - Broadcasts settings updates to all components
   - Validates API credentials with "Test Connection"

---

## File Structure & Responsibilities

### manifest.json
**Purpose**: Extension configuration (Manifest V3)

**Key Sections**:
```json
{
  "permissions": ["sidePanel", "storage", "tabs", "webNavigation"],
  "host_permissions": ["https://appeu.newbook.cloud/*", "API URLs"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{ "matches": ["https://appeu.newbook.cloud/*"], "js": ["content-script.js"] }],
  "side_panel": { "default_path": "sidepanel/sidepanel.html" },
  "options_page": "settings/settings.html"
}
```

**When to edit**:
- Adding new permissions (e.g., `notifications`, `contextMenus`)
- Changing content script match patterns
- Adding new host permissions for different API endpoints

---

### background.js
**Purpose**: Background service worker (persistent event handler)

**Responsibilities**:
- Listen for tab updates (`chrome.tabs.onUpdated`)
- Listen for SPA navigation (`chrome.webNavigation.onHistoryStateUpdated`)
- Enable/disable sidepanel based on domain and settings
- Detect booking pages from URL patterns: `/bookings_view/(\d+)`
- Store current booking ID in `chrome.storage.local`
- Route messages between content script and sidepanel
- React to settings changes

**State**:
```javascript
let settings = null; // Loaded from chrome.storage.sync
```

**Key Functions**:
- `loadSettings()` - Load settings from storage
- `handleTabUpdate(tabId, url)` - Enable/disable sidepanel, detect bookings
- Message handler - Routes messages from content script/settings page

**Message Types Handled**:
- `settingsUpdated` - Reload settings, update all tabs
- `plannerClick` - Forward to sidepanel

**Message Types Sent**:
- `bookingDetected` - When booking page detected
- `settingsUpdated` - Forward to sidepanel

**When to edit**:
- Changing booking URL detection pattern
- Adding new message types
- Modifying sidepanel enable/disable logic
- Adding new background tasks (periodic checks, notifications)

---

### content-script.js
**Purpose**: Runs on all NewBook pages, detects events

**Responsibilities**:
- Detect booking pages from URL
- Monitor planner single-clicks (250ms debounce for single vs double-click)
- Detect tooltips (`easyToolTip` elements)
- Monitor SPA navigation (URL changes without page reload)
- Send messages to background worker

**State**:
```javascript
let currentBookingId = null;
let settings = null;
let clickTimer = null;
let clickCount = 0;
```

**Detection Patterns**:
```javascript
// Booking page: /bookings_view/12345
const bookingIdMatch = url.match(/\/bookings_view\/(\d+)/i);

// Planner elements (various selectors)
const plannerElement = target.closest('[data-booking-id], .booking-block, .planner-booking');

// Tooltip: easyToolTip with ID pattern
const idMatch = node.id?.match(/booking[_-](\d+)/i);
```

**Key Functions**:
- `detectBookingPage()` - Check URL for booking pattern
- `handlePlannerClick(event)` - Debounced click detection
- `detectTooltip()` - MutationObserver for tooltip elements
- `checkUrlChange()` - Poll for SPA navigation (500ms interval)

**Message Types Sent**:
- `bookingDetected` - When booking page/tooltip detected
- `plannerClick` - When planner single-click detected (if setting enabled)

**When to edit**:
- Changing booking URL pattern (if NewBook changes)
- Adding new planner element selectors
- Adjusting debounce timing
- Adding new event detection (e.g., booking form submissions)

---

### sidepanel/sidepanel.html
**Purpose**: Sidepanel UI structure

**Structure**:
```html
<div class="sidepanel-container">
  <nav class="tab-nav">
    <!-- 3 tab buttons with badges -->
  </nav>
  <div class="tab-contents">
    <div class="tab-content" data-content="summary">
      <div class="tab-loading"><!-- Spinner --></div>
      <div class="tab-data hidden"><!-- API content --></div>
      <div class="tab-error hidden"><!-- Error message --></div>
      <div class="summary-countdown hidden"><!-- Countdown timer --></div>
    </div>
    <!-- Restaurant and Checks tabs similar structure -->
  </div>
  <footer class="sidepanel-footer">
    <button id="settingsButton">Settings</button>
  </footer>
</div>
```

**When to edit**:
- Adding new tabs
- Changing tab icons (Material Symbols)
- Modifying empty/error state messages
- Adding footer buttons

---

### sidepanel/sidepanel.js
**Purpose**: Sidepanel logic, state management, API calls

**State Object**:
```javascript
const STATE = {
  currentTab: 'summary',           // Active tab name
  currentBookingId: null,          // Current booking ID (number)
  settings: null,                  // Loaded from chrome.storage.sync
  badges: {                        // Badge counts per tab
    summary: 0,
    restaurant: 0,
    checks: 0
  },
  timers: {                        // Active timers
    summaryRefresh: null,          // Auto-refresh interval (unused - countdown does refresh)
    summaryCountdown: null,        // Countdown interval
    inactivityTimeout: null        // Return to summary after 60s
  },
  cache: {                         // Cached API responses
    summary: null,
    restaurant: null,
    checks: null
  }
};
```

**APIClient Class**:
```javascript
class APIClient {
  constructor(settings) {
    this.baseUrl = settings.apiRootUrl;
    this.authHeader = 'Basic ' + btoa(`${username}:${password}`);
  }

  async fetchSummary() { /* GET /summary?context=chrome-summary */ }
  async fetchRestaurantMatch(bookingId) { /* POST /bookings/match */ }
  async fetchChecks(bookingId) { /* GET /checks/{bookingId}?context=chrome-checks */ }
}
```

**Key Functions**:

**UI Helpers**:
- `showLoading(tabName)` - Show spinner
- `showData(tabName, html)` - Display API-returned HTML
- `showError(tabName, message)` - Show error state
- `showEmpty(tabName)` - Show "navigate to booking" message
- `updateBadge(tabName, count, isWarning)` - Update tab badge

**Tab Management**:
- `switchTab(tabName)` - Change active tab, load content if needed
- `startInactivityTimer()` - Start 60s timer to return to summary
- `resetInactivityTimer()` - Clear inactivity timer

**Tab Loaders**:
- `loadSummaryTab()` - Load summary with countdown
- `loadRestaurantTab()` - Load restaurant matches (requires booking ID)
- `loadChecksTab()` - Load validation checks (requires booking ID)
- `showSummaryCountdown()` - Start countdown timer, refresh at 0

**Booking Handler**:
- `handleBookingDetected(bookingId)` - Load Restaurant + Checks in parallel, switch to tab with issues
- `loadRestaurantTabSilently()` - Load restaurant data without showing (for badge update)
- `loadChecksTabSilently()` - Load checks data without showing (for badge update)

**Message Listener**:
```javascript
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'bookingDetected') { handleBookingDetected(message.bookingId); }
  else if (message.action === 'plannerClick') { /* ... */ }
  else if (message.action === 'settingsUpdated') { /* reload current tab */ }
});
```

**Initialization**:
- `loadSettings()` - Load settings from storage
- `init()` - Load settings, load summary tab, check for stored booking ID

**When to edit**:
- Adding new tabs (add to STATE, create load function, add to switchTab)
- Changing refresh intervals
- Modifying API endpoints
- Adding new message types
- Changing tab switching logic

---

### sidepanel/sidepanel.css
**Purpose**: Sidepanel styling

**Key Sections**:
- `.tab-nav` - Tab navigation bar (sticky top)
- `.tab-button` - Individual tab buttons with icons and badges
- `.tab-badge` - Red/yellow badge indicators
- `.tab-content` - Tab content containers
- `.tab-loading` - Loading spinner
- `.tab-data` - API content display
- `.tab-error` - Error state
- `.tab-empty` - Empty state (no booking selected)
- `.summary-countdown` - Countdown timer (sticky bottom of summary tab)
- `.sidepanel-footer` - Footer with settings button

**Color Scheme**:
- Primary: `#3b82f6` (blue)
- Error: `#ef4444` (red)
- Warning: `#f59e0b` (orange/yellow)
- Background: `#f9fafb` (light gray)
- Border: `#e5e7eb` (gray)

**When to edit**:
- Changing colors/branding
- Adjusting spacing/layout
- Adding animations
- Modifying responsive behavior

---

### settings/settings.html
**Purpose**: Settings page UI

**Form Fields**:
1. `apiRootUrl` - API endpoint (required, HTTPS)
2. `username` - WordPress username (required)
3. `applicationPassword` - WordPress app password (required)
4. `enableSidebarOnNewBook` - Checkbox (default: true)
5. `recentBookingsCount` - Number input (1-50, default: 10)
6. `summaryRefreshRate` - Number input (10-300, default: 60)
7. `enablePlannerClickUpdate` - Checkbox (default: true)

**Buttons**:
- `testConnection` - Test API with current credentials
- `saveSettings` - Validate and save to `chrome.storage.sync`

**Status Display**:
- `.status.success` - Green success message
- `.status.error` - Red error message
- `.status.info` - Blue info message

**When to edit**:
- Adding new settings fields
- Changing validation rules
- Modifying UI layout

---

### settings/settings.js
**Purpose**: Settings page logic

**State**:
```javascript
const DEFAULT_SETTINGS = {
  apiRootUrl: '',
  username: '',
  applicationPassword: '',
  enableSidebarOnNewBook: true,
  recentBookingsCount: 10,
  summaryRefreshRate: 60,
  enablePlannerClickUpdate: true
};
```

**Key Functions**:
- `loadSettings()` - Load from `chrome.storage.sync`, populate form
- `saveSettings()` - Validate, save, broadcast update message
- `testConnection()` - Try API call with current credentials
- `showStatus(message, type)` - Display success/error/info message

**Validation Rules**:
- API URL must be HTTPS
- All required fields must be filled
- `recentBookingsCount`: 1-50
- `summaryRefreshRate`: 10-300 seconds
- Application password has spaces removed before saving

**Message Broadcast**:
```javascript
chrome.runtime.sendMessage({
  action: 'settingsUpdated',
  settings: settings
});
```

**When to edit**:
- Adding new validation rules
- Changing default values
- Modifying test connection logic
- Adding new settings fields

---

## State Management

### Storage Types

**chrome.storage.sync** (syncs across devices):
```javascript
{
  settings: {
    apiRootUrl: "https://...",
    username: "reception",
    applicationPassword: "xxxx",
    enableSidebarOnNewBook: true,
    recentBookingsCount: 10,
    summaryRefreshRate: 60,
    enablePlannerClickUpdate: true
  }
}
```

**chrome.storage.local** (device-specific):
```javascript
{
  currentBookingId: "12345"  // Last viewed booking
}
```

### State Locations

| State | Location | Scope |
|-------|----------|-------|
| Settings | `chrome.storage.sync` | Global, synced |
| Current booking ID | `chrome.storage.local` | Global, local |
| Current tab | `STATE.currentTab` in sidepanel.js | Sidepanel session |
| Tab badges | `STATE.badges` in sidepanel.js | Sidepanel session |
| Cached API data | `STATE.cache` in sidepanel.js | Sidepanel session |
| Active timers | `STATE.timers` in sidepanel.js | Sidepanel session |

### State Persistence

- **Settings**: Persist across browser restarts (synced)
- **Current booking ID**: Persists across browser restarts (local)
- **Sidepanel state**: Lost when sidepanel closes (re-initialized on open)

---

## API Integration

### Endpoints

**1. Summary Endpoint**
- **URL**: `GET {apiRootUrl}/summary?context=chrome-summary`
- **Auth**: Basic Auth
- **Purpose**: Get recent bookings needing attention
- **Response**:
  ```json
  {
    "success": true,
    "html": "<div>...</div>",
    "badge_count": 0
  }
  ```

**2. Restaurant Match Endpoint**
- **URL**: `POST {apiRootUrl}/bookings/match`
- **Auth**: Basic Auth
- **Body**:
  ```json
  {
    "booking_id": 12345,
    "context": "chrome-sidepanel"
  }
  ```
- **Purpose**: Match hotel booking with restaurant reservations
- **Response**:
  ```json
  {
    "success": true,
    "html": "<div>...</div>",
    "badge_count": 2,
    "should_auto_open": false
  }
  ```

**3. Checks Endpoint**
- **URL**: `GET {apiRootUrl}/checks/{bookingId}?context=chrome-checks`
- **Auth**: Basic Auth
- **Purpose**: Run validation checks on booking
- **Response**:
  ```json
  {
    "success": true,
    "html": "<div>...</div>",
    "badge_count": 1
  }
  ```

### Authentication

**Method**: HTTP Basic Auth

```javascript
const authHeader = 'Basic ' + btoa(`${username}:${applicationPassword}`);

fetch(url, {
  headers: {
    'Authorization': authHeader,
    'Content-Type': 'application/json'
  }
});
```

**Note**: Application password has spaces removed before encoding:
```javascript
settings.applicationPassword.trim().replace(/\s/g, '')
```

### Error Handling

```javascript
try {
  const response = await fetch(...);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
  // ... use data
} catch (error) {
  showError(tabName, error.message);
}
```

**Common Errors**:
- `401` - Authentication failed (wrong credentials)
- `404` - Endpoint not found (wrong API URL)
- `Failed to fetch` - Network error or CORS issue

---

## Message Passing

### Message Flow Diagram

```
Content Script ────> Background Worker ────> Sidepanel
     │                      │                    │
     │ bookingDetected      │                    │
     │─────────────────────>│                    │
     │                      │ bookingDetected    │
     │                      │───────────────────>│
     │                      │                    │
     │ plannerClick         │                    │
     │─────────────────────>│                    │
     │                      │ plannerClick       │
     │                      │───────────────────>│
     │                      │                    │
Settings Page              │                    │
     │                      │                    │
     │ settingsUpdated      │                    │
     │─────────────────────>│                    │
     │                      │ settingsUpdated    │
     │                      │───────────────────>│
```

### Message Types

**bookingDetected**
```javascript
// Sent by: content-script.js, background.js
// Received by: background.js, sidepanel.js
{
  action: 'bookingDetected',
  bookingId: '12345',
  url: 'https://appeu.newbook.cloud/bookings_view/12345'
}
```

**plannerClick**
```javascript
// Sent by: content-script.js
// Received by: background.js, sidepanel.js
{
  action: 'plannerClick',
  bookingId: '12345'
}
```

**settingsUpdated**
```javascript
// Sent by: settings.js
// Received by: background.js, sidepanel.js
{
  action: 'settingsUpdated',
  settings: { /* full settings object */ }
}
```

### How to Add New Message Type

1. **Define message structure** in this document
2. **Send from source**:
   ```javascript
   chrome.runtime.sendMessage({ action: 'newAction', data: {...} });
   ```
3. **Receive in target**:
   ```javascript
   chrome.runtime.onMessage.addListener((message) => {
     if (message.action === 'newAction') {
       handleNewAction(message.data);
     }
   });
   ```

---

## UI Components

### Tab System

**Structure**:
- Navigation: `.tab-nav` with `.tab-button` elements
- Content: `.tab-contents` with `.tab-content` elements
- Active state: `.active` class on both button and content

**Switching Tabs**:
```javascript
function switchTab(tabName) {
  // Update active classes
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.dataset.content === tabName);
  });

  // Load tab content
  if (tabName === 'summary') loadSummaryTab();
  else if (tabName === 'restaurant') loadRestaurantTab();
  else if (tabName === 'checks') loadChecksTab();
}
```

### Badge System

**Display**:
```html
<span class="tab-badge hidden" data-badge="summary">0</span>
```

**Update**:
```javascript
function updateBadge(tabName, count, isWarning = false) {
  const badge = document.querySelector(`[data-badge="${tabName}"]`);
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
    badge.classList.toggle('warning', isWarning);
  } else {
    badge.classList.add('hidden');
  }
}
```

**Colors**:
- Red (`.tab-badge`): Errors/critical issues
- Yellow (`.tab-badge.warning`): Warnings

### Loading States

Each tab has 4 possible states:

1. **Loading** (`.tab-loading`): Show spinner
2. **Data** (`.tab-data`): Show API HTML content
3. **Error** (`.tab-error`): Show error message + retry button
4. **Empty** (`.tab-empty`): Show "navigate to booking" message

**State Transitions**:
```javascript
// Show loading
function showLoading(tabName) {
  const tab = document.querySelector(`[data-content="${tabName}"]`);
  tab.querySelector('.tab-loading').classList.remove('hidden');
  tab.querySelector('.tab-data').classList.add('hidden');
  tab.querySelector('.tab-error').classList.add('hidden');
  tab.querySelector('.tab-empty')?.classList.add('hidden');
}

// Similar for showData, showError, showEmpty
```

### Countdown Timer

**Location**: Bottom of Summary tab (`.summary-countdown`)

**Behavior**:
- Counts down from `settings.summaryRefreshRate` seconds
- Updates every second
- At 0, triggers `loadSummaryTab()` which restarts countdown
- Only visible when Summary tab is active

**Implementation**:
```javascript
function showSummaryCountdown() {
  const countdown = document.querySelector('[data-content="summary"] .summary-countdown');
  const text = countdown.querySelector('.countdown-text strong');

  countdown.classList.remove('hidden');
  clearInterval(STATE.timers.summaryCountdown);

  let secondsLeft = STATE.settings.summaryRefreshRate;
  text.textContent = secondsLeft;

  STATE.timers.summaryCountdown = setInterval(() => {
    secondsLeft--;
    text.textContent = secondsLeft;
    if (secondsLeft <= 0) {
      loadSummaryTab(); // Restarts countdown
    }
  }, 1000);
}
```

---

## Settings Schema

### Complete Settings Object

```javascript
{
  // API Configuration (required)
  apiRootUrl: "https://n4admindev.pterois.co.uk/wp-json/bma/v1",
  username: "reception",
  applicationPassword: "vbcFvMFd2z9JeBa7df51YJXI",  // Spaces removed

  // Sidebar Behavior
  enableSidebarOnNewBook: true,  // Enable sidepanel on NewBook domain

  // Summary Tab Settings
  recentBookingsCount: 10,       // Number of recent bookings (1-50)
  summaryRefreshRate: 60,        // Refresh rate in seconds (10-300)

  // Planner Integration
  enablePlannerClickUpdate: true // Update booking on planner single-click
}
```

### Setting Details

| Setting | Type | Default | Range | Description |
|---------|------|---------|-------|-------------|
| `apiRootUrl` | string | "" | HTTPS only | WordPress API base URL |
| `username` | string | "" | Any | WordPress username |
| `applicationPassword` | string | "" | Any | WordPress app password |
| `enableSidebarOnNewBook` | boolean | true | true/false | Auto-enable sidepanel |
| `recentBookingsCount` | number | 10 | 1-50 | Summary bookings count |
| `summaryRefreshRate` | number | 60 | 10-300 | Summary refresh seconds |
| `enablePlannerClickUpdate` | boolean | true | true/false | Planner click updates |

---

## Key Features

### 1. Booking Detection

**Trigger**: URL matches `/bookings_view/(\d+)`

**Flow**:
1. Content script detects URL change
2. Extracts booking ID from URL
3. Sends `bookingDetected` message to background
4. Background stores ID in `chrome.storage.local`
5. Background forwards message to sidepanel
6. Sidepanel calls `handleBookingDetected(bookingId)`

**Code Location**: `content-script.js` line ~20

### 2. Parallel Tab Loading

**Trigger**: Booking detected

**Flow**:
1. `handleBookingDetected()` called with booking ID
2. Load Restaurant and Checks tabs in parallel with `Promise.all()`
3. Compare `badge_count` from both responses
4. Auto-switch to tab with highest priority:
   - Restaurant has priority if `badge_count > 0`
   - Otherwise Checks if `badge_count > 0`
   - Otherwise stay on current tab

**Code Location**: `sidepanel.js` line ~240

### 3. Auto-Refresh Summary

**Trigger**: Summary tab active

**Flow**:
1. `loadSummaryTab()` fetches data from API
2. `showSummaryCountdown()` starts countdown
3. Countdown updates every second
4. At 0 seconds, triggers `loadSummaryTab()` again
5. Loop continues while Summary tab is active

**Code Location**: `sidepanel.js` line ~180

### 4. Inactivity Timer

**Trigger**: Switch to Restaurant or Checks tab

**Flow**:
1. `startInactivityTimer()` called
2. Sets timeout for 60 seconds
3. If timeout fires, switches back to Summary tab
4. Clicking or switching tabs resets timer
5. Summary tab clears timer (no auto-return from Summary)

**Code Location**: `sidepanel.js` line ~260

### 5. Planner Single-Click

**Trigger**: Click on planner element

**Flow**:
1. Click event captured by content script
2. 250ms debounce to distinguish single vs double-click
3. If single-click confirmed, extract booking ID from element
4. Send `plannerClick` message to background
5. Background forwards to sidepanel
6. If `enablePlannerClickUpdate` is true, update sidepanel

**Code Location**: `content-script.js` line ~60

### 6. Sidepanel Enable/Disable

**Trigger**: Tab URL changes

**Flow**:
1. Background listens for `chrome.tabs.onUpdated`
2. Check if URL contains `appeu.newbook.cloud`
3. Check if `enableSidebarOnNewBook` is true
4. If both true, enable sidepanel for that tab
5. Otherwise, disable sidepanel for that tab

**Code Location**: `background.js` line ~40

---

## Code Patterns

### Pattern 1: Tab Content Loading

```javascript
async function loadXxxTab() {
  // 1. Check settings
  if (!STATE.settings) {
    showError('xxx', 'Please configure settings first');
    return;
  }

  // 2. Check prerequisites (if needed)
  if (!STATE.currentBookingId) {
    showEmpty('xxx');
    return;
  }

  // 3. Show loading state
  showLoading('xxx');

  try {
    // 4. Make API call
    const api = new APIClient(STATE.settings);
    const data = await api.fetchXxx(...);

    // 5. Handle success
    if (data.success && data.html) {
      showData('xxx', data.html);
      updateBadge('xxx', data.badge_count || 0);
      STATE.cache.xxx = data;
    } else {
      showEmpty('xxx');
    }
  } catch (error) {
    // 6. Handle error
    console.error('Error loading xxx tab:', error);
    showError('xxx', error.message);
  }
}
```

### Pattern 2: Message Handling

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Switch on action type
  if (message.action === 'actionName') {
    handleAction(message.data);
  } else if (message.action === 'anotherAction') {
    handleAnotherAction(message.data);
  }

  // Return true if async (optional)
  return true;
});
```

### Pattern 3: Settings Update Broadcast

```javascript
// In settings.js after saving
chrome.runtime.sendMessage({
  action: 'settingsUpdated',
  settings: newSettings
});

// In background.js
if (message.action === 'settingsUpdated') {
  settings = message.settings;
  // Forward to sidepanel
  chrome.runtime.sendMessage(message).catch(() => {});
}

// In sidepanel.js
if (message.action === 'settingsUpdated') {
  await loadSettings();
  // Reload current tab with new settings
}
```

### Pattern 4: Storage Access

```javascript
// Read
const result = await chrome.storage.sync.get('settings');
const settings = result.settings || DEFAULT_SETTINGS;

// Write
await chrome.storage.sync.set({ settings: newSettings });

// Listen for changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (changes.settings && areaName === 'sync') {
    const newSettings = changes.settings.newValue;
    // React to change
  }
});
```

---

## Common Editing Tasks

### Add a New Tab

1. **Update HTML** (`sidepanel/sidepanel.html`):
   ```html
   <!-- Add button in .tab-nav -->
   <button class="tab-button" data-tab="newtab">
     <span class="material-symbols-outlined">icon_name</span>
     <span class="tab-label">New Tab</span>
     <span class="tab-badge hidden" data-badge="newtab">0</span>
   </button>

   <!-- Add content in .tab-contents -->
   <div class="tab-content" data-content="newtab">
     <div class="tab-loading">...</div>
     <div class="tab-data hidden"></div>
     <div class="tab-error hidden">...</div>
   </div>
   ```

2. **Update STATE** (`sidepanel/sidepanel.js`):
   ```javascript
   const STATE = {
     ...
     badges: {
       summary: 0,
       restaurant: 0,
       checks: 0,
       newtab: 0  // Add new tab
     },
     cache: {
       summary: null,
       restaurant: null,
       checks: null,
       newtab: null  // Add new tab
     }
   };
   ```

3. **Add API method** (if needed):
   ```javascript
   class APIClient {
     async fetchNewTab(...) {
       const response = await fetch(`${this.baseUrl}/newtab`, ...);
       return response.json();
     }
   }
   ```

4. **Add load function**:
   ```javascript
   async function loadNewTab() {
     if (!STATE.settings) {
       showError('newtab', 'Please configure settings first');
       return;
     }

     showLoading('newtab');

     try {
       const api = new APIClient(STATE.settings);
       const data = await api.fetchNewTab();

       if (data.success && data.html) {
         showData('newtab', data.html);
         updateBadge('newtab', data.badge_count || 0);
         STATE.cache.newtab = data;
       }
     } catch (error) {
       showError('newtab', error.message);
     }
   }
   ```

5. **Update switchTab**:
   ```javascript
   function switchTab(tabName) {
     // ... existing code

     if (tabName === 'summary') loadSummaryTab();
     else if (tabName === 'restaurant') loadRestaurantTab();
     else if (tabName === 'checks') loadChecksTab();
     else if (tabName === 'newtab') loadNewTab();  // Add this
   }
   ```

### Add a New Setting

1. **Update HTML** (`settings/settings.html`):
   ```html
   <div class="form-group">
     <label for="newSetting">New Setting Label</label>
     <input type="text" id="newSetting" placeholder="Default value">
     <small>Description of what this setting does</small>
   </div>
   ```

2. **Update DEFAULT_SETTINGS** (`settings/settings.js`):
   ```javascript
   const DEFAULT_SETTINGS = {
     ...existing,
     newSetting: 'default value'
   };
   ```

3. **Update loadSettings** (`settings/settings.js`):
   ```javascript
   async function loadSettings() {
     const result = await chrome.storage.sync.get('settings');
     const settings = result.settings || DEFAULT_SETTINGS;

     // ... existing fields
     document.getElementById('newSetting').value = settings.newSetting || '';
   }
   ```

4. **Update saveSettings** (`settings/settings.js`):
   ```javascript
   async function saveSettings() {
     // ... existing validation

     const settings = {
       ...existing,
       newSetting: document.getElementById('newSetting').value
     };

     await chrome.storage.sync.set({ settings });
     chrome.runtime.sendMessage({ action: 'settingsUpdated', settings });
   }
   ```

5. **Use in code** (wherever needed):
   ```javascript
   if (STATE.settings.newSetting) {
     // Use the setting
   }
   ```

### Add a New API Endpoint

1. **Add method to APIClient** (`sidepanel/sidepanel.js`):
   ```javascript
   class APIClient {
     async fetchNewEndpoint(param) {
       const response = await fetch(`${this.baseUrl}/new-endpoint`, {
         method: 'POST',  // or GET
         headers: {
           'Authorization': this.authHeader,
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({ param: param })  // If POST
       });

       if (!response.ok) {
         throw new Error(`HTTP ${response.status}: ${response.statusText}`);
       }

       return response.json();
     }
   }
   ```

2. **Call from appropriate function**:
   ```javascript
   const api = new APIClient(STATE.settings);
   const data = await api.fetchNewEndpoint(someParam);
   ```

### Change Booking Detection Pattern

**Location**: `content-script.js` and `background.js`

**Current Pattern**: `/bookings_view/(\d+)`

**To Change**:
1. Update regex in `content-script.js`:
   ```javascript
   const bookingIdMatch = url.match(/NEW_PATTERN_HERE/i);
   ```

2. Update regex in `background.js`:
   ```javascript
   const bookingIdMatch = url.match(/NEW_PATTERN_HERE/i);
   ```

**Example** - Add support for `/reservations/` URLs:
```javascript
// Old
const bookingIdMatch = url.match(/\/bookings_view\/(\d+)/i);

// New (supports both patterns)
const bookingIdMatch = url.match(/\/(bookings_view|reservations)\/(\d+)/i);
const bookingId = bookingIdMatch[2];  // Changed from [1] to [2]
```

### Add New Planner Selector

**Location**: `content-script.js`

**Current Selectors**:
```javascript
const plannerElement = target.closest('[data-booking-id], .booking-block, .planner-booking');
```

**To Add**:
```javascript
const plannerElement = target.closest('[data-booking-id], .booking-block, .planner-booking, .new-selector');
```

### Change Inactivity Timeout Duration

**Location**: `sidepanel/sidepanel.js`

**Current**: 60 seconds (60000ms)

**To Change**:
```javascript
function startInactivityTimer() {
  resetInactivityTimer();

  STATE.timers.inactivityTimeout = setTimeout(() => {
    if (STATE.currentTab !== 'summary') {
      switchTab('summary');
    }
  }, 120000);  // Change to 120 seconds (2 minutes)
}
```

### Modify Badge Colors

**Location**: `sidepanel/sidepanel.css`

**Current**:
- Red: `#ef4444`
- Yellow/Warning: `#f59e0b`

**To Change**:
```css
.tab-badge {
  background-color: #ff0000;  /* New red */
}

.tab-badge.warning {
  background-color: #ffaa00;  /* New yellow */
}
```

### Add New Message Type

1. **Define message structure** (document here)
2. **Send message** (from source component):
   ```javascript
   chrome.runtime.sendMessage({
     action: 'newMessageType',
     data: { key: 'value' }
   });
   ```

3. **Handle message** (in receiving component):
   ```javascript
   chrome.runtime.onMessage.addListener((message) => {
     if (message.action === 'newMessageType') {
       handleNewMessage(message.data);
     }
   });
   ```

4. **Route through background** (if needed):
   ```javascript
   // In background.js
   chrome.runtime.onMessage.addListener((message) => {
     if (message.action === 'newMessageType') {
       // Forward to sidepanel or other component
       chrome.runtime.sendMessage(message).catch(() => {});
     }
   });
   ```

---

## Debugging Tips

### Check Extension Console

1. Open `chrome://extensions/`
2. Find "NewBook Assistant"
3. Click "Inspect views: service worker" (background script console)
4. Open sidepanel, right-click, "Inspect" (sidepanel console)

### Enable Verbose Logging

Add to any file:
```javascript
const DEBUG = true;

function log(...args) {
  if (DEBUG) console.log('[NewBook]', ...args);
}

log('Booking detected:', bookingId);
```

### Check Storage

In any console:
```javascript
// View all storage
chrome.storage.sync.get(null, (data) => console.log(data));
chrome.storage.local.get(null, (data) => console.log(data));

// View specific key
chrome.storage.sync.get('settings', (data) => console.log(data.settings));
```

### Test Message Passing

In content script console:
```javascript
chrome.runtime.sendMessage({ action: 'bookingDetected', bookingId: '12345' });
```

In sidepanel console:
```javascript
chrome.runtime.onMessage.addListener((msg) => {
  console.log('Received message:', msg);
});
```

### Check Current State

In sidepanel console:
```javascript
console.log(STATE);  // View entire state object
console.log(STATE.currentBookingId);  // Check booking ID
console.log(STATE.settings);  // Check settings
```

---

## Version History

- **2.0.0** (Current) - Clean rebuild with sidepanel interface
- **1.x** (Old extension) - Popup-based interface in `chrome-hotel-link-extention`

---

## Related Files

- [README.md](README.md) - User-facing documentation
- [QUICKSTART.md](QUICKSTART.md) - Installation guide
- [manifest.json](manifest.json) - Extension configuration

---

**Last Updated**: 2025-11-08
**Maintained By**: Development Team
**For**: Future Claude sessions and developers
