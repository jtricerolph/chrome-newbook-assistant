# State Management Reference

Complete reference for state management in the NewBook Assistant Chrome Extension.

---

## Table of Contents

- [Overview](#overview)
- [STATE Object (sidepanel.js)](#state-object-sidepaneljs)
- [Module-Level State (content-script.js)](#module-level-state-content-scriptjs)
- [Module-Level State (background.js)](#module-level-state-backgroundjs)
- [Chrome Storage](#chrome-storage)
- [State Synchronization](#state-synchronization)
- [State Lifecycle](#state-lifecycle)
- [Best Practices](#best-practices)

---

## Overview

The extension uses multiple state management approaches:

1. **STATE object** - Sidepanel UI state (single source of truth)
2. **Module-level variables** - Component-specific state
3. **chrome.storage.local** - Persistent state (survives page reloads)
4. **chrome.storage.sync** - Settings (syncs across devices)

---

## STATE Object (sidepanel.js)

The main state object that manages the sidepanel UI and data.

### Full STATE Object Structure

```javascript
const STATE = {
  // Current tab selection
  currentTab: 'summary',             // 'summary' | 'restaurant' | 'checks' | 'staying'

  // Current booking context
  currentBookingId: null,            // string | null (e.g., '12345')
  isUrlTriggerBooking: false,        // boolean - if booking loaded from URL trigger (sticky)

  // Settings
  settings: null,                    // Settings object from chrome.storage.sync

  // Badge counters for each tab
  badges: {
    summary: { critical: 0, warning: 0 },
    restaurant: { critical: 0, warning: 0 },
    checks: { critical: 0, warning: 0 },
    staying: { critical: 0, warning: 0 }
  },

  // Timers
  timers: {
    summaryRefresh: null,            // setInterval timer for summary auto-refresh
    summaryCountdown: null,          // setInterval timer for countdown display
    inactivityTimeout: null,         // setTimeout for inactivity pause
    staleRefresh: null               // setTimeout for stale cache refresh
  },

  // Cached data for each tab
  cache: {
    summary: null,                   // Cached summary data
    restaurant: null,                // Cached restaurant suggestions
    checks: null,                    // Cached check-in/out data
    staying: null                    // Cached staying guests data
  },

  // NewBook authentication state
  newbookAuth: {
    isAuthenticated: false,          // boolean - if user logged into NewBook
    checking: false                  // boolean - if currently checking auth status
  },

  // User interaction tracking
  lastSummaryInteraction: Date.now(), // Timestamp of last user interaction on Summary tab
  lastSummaryUpdate: null,           // Timestamp when summary was last updated
  lastRestaurantUpdate: null,        // Timestamp when restaurant tab was last updated
  lastChecksUpdate: null,            // Timestamp when checks tab was last updated
  lastStayingUpdate: null,           // Timestamp when staying tab was last updated

  // Session state
  sessionLocked: false,              // boolean - if NewBook session lock dialog is showing
  createFormOpen: false,             // boolean - if any create booking form is open

  // Navigation context
  navigationContext: null,           // Navigation context for cross-tab navigation
  // Structure: {
  //   returnTab: string,            // Tab to return to
  //   returnBookingId: string,      // Booking ID to restore
  //   targetDate: string,           // Date to navigate to (YYYY-MM-DD)
  //   expandCreateForm: boolean,    // Whether to expand create form
  //   expandComparisonRow: {        // Comparison to expand
  //     resosBookingId: number,
  //     date: string
  //   },
  //   scrollAfterLoad: boolean,     // Whether to auto-scroll
  //   preserveBookingId: boolean    // Flag explicit navigation with booking ID
  // }

  // Loaded content tracking
  loadedBookingIds: {
    restaurant: null,                // string | null - booking ID loaded in Restaurant tab
    checks: null,                    // string | null - booking ID loaded in Checks tab
    summary: false,                  // boolean - if Summary tab has been loaded
    staying: null                    // string | null - date loaded in Staying tab (YYYY-MM-DD)
  },

  // Scroll positions per tab
  scrollPositions: {
    summary: 0,                      // number - scroll position in pixels
    restaurant: 0,
    checks: 0,
    staying: 0
  },

  // Restaurant bookings cache (by date)
  restaurantBookings: {},            // { '2026-01-31': [{time, people, name, room}, ...] }
  restaurantDate: '2025-01-31',      // Current date for restaurant summary view (YYYY-MM-DD)
  restaurantRequestId: 0,            // Counter to prevent race conditions

  // Staying tab date
  stayingDate: '2025-01-31'          // Current date for staying tab (YYYY-MM-DD)
};
```

### STATE Properties Detail

#### `currentTab`

**Type:** `string`

**Values:** `'summary'` | `'restaurant'` | `'checks'` | `'staying'`

**When Updated:**
- User clicks tab navigation button
- `switchTab()` function called
- Navigation functions (`navigateToRestaurantDate()`, `navigateToChecksTab()`)

**Usage:**
```javascript
if (STATE.currentTab === 'restaurant') {
  loadRestaurantTab();
}
```

---

#### `currentBookingId`

**Type:** `string | null`

**When Updated:**
- Booking detected from URL (`bookingDetected` message)
- Planner click (`plannerClick` message)
- Popup detection
- Navigation functions
- User selects booking from summary list

**Synchronized to:**
- `chrome.storage.local.currentBookingId`

**Usage:**
```javascript
STATE.currentBookingId = '12345';
chrome.storage.local.set({ currentBookingId: '12345' });
```

---

#### `isUrlTriggerBooking`

**Type:** `boolean`

**When Updated:**
- Set to `true` when booking detected from URL pattern
- Set to `false` when user manually changes booking

**Purpose:**
- Keeps booking "sticky" when navigating tabs if it came from URL
- Prevents losing context when switching tabs

**Usage:**
```javascript
if (STATE.isUrlTriggerBooking) {
  // Keep this booking context
} else {
  // Allow clearing booking context
}
```

---

#### `settings`

**Type:** `Object | null`

**Structure:**
```javascript
{
  apiRootUrl: string,                 // WordPress API URL
  username: string,                   // WP username
  applicationPassword: string,        // WP app password
  enableSidebarOnNewBook: boolean,
  recentBookingsCount: number,        // 1-50
  summaryRefreshRate: number,         // 10-300 seconds
  enablePlannerClickUpdate: boolean,
  highlightNewestMinutes: number,     // 0-1440
  autoRefreshOnStaleCache: boolean,
  autoRefreshPauseIdleMinutes: number,
  cancelledHours: number,
  includeFlaggedCancelled: boolean,
  inactivityTimeout: number,          // 10-600 seconds
  pauseInactivityWhenFormOpen: boolean,
  enableDebugLogging: boolean
}
```

**When Updated:**
- On sidepanel init (`loadSettings()`)
- On `settingsUpdated` message

**Synchronized from:**
- `chrome.storage.sync.settings`

**Usage:**
```javascript
const refreshRate = STATE.settings?.summaryRefreshRate || 60;
```

---

#### `badges`

**Type:** `Object`

**Structure:**
```javascript
{
  summary: { critical: number, warning: number },
  restaurant: { critical: number, warning: number },
  checks: { critical: number, warning: number },
  staying: { critical: number, warning: number }
}
```

**When Updated:**
- After loading tab data
- Badge counts extracted from API response
- `updateBadges()` function

**Purpose:**
- Display notification badges on tab buttons
- Indicate critical/warning items per tab

**Usage:**
```javascript
STATE.badges.summary.critical = 3;
STATE.badges.summary.warning = 5;
updateBadges();
```

---

#### `timers`

**Type:** `Object`

**Structure:**
```javascript
{
  summaryRefresh: NodeJS.Timeout | null,
  summaryCountdown: NodeJS.Timeout | null,
  inactivityTimeout: NodeJS.Timeout | null,
  staleRefresh: NodeJS.Timeout | null
}
```

**When Updated:**
- Timers created with `setInterval()` or `setTimeout()`
- Cleared with `clearInterval()` or `clearTimeout()`

**Purpose:**
- Auto-refresh summary tab
- Display countdown to next refresh
- Pause updates during inactivity
- Auto-refresh stale cached data

**Usage:**
```javascript
// Clear existing timer
if (STATE.timers.summaryRefresh) {
  clearInterval(STATE.timers.summaryRefresh);
}

// Create new timer
STATE.timers.summaryRefresh = setInterval(() => {
  loadSummaryTab(true);
}, refreshRate * 1000);
```

---

#### `cache`

**Type:** `Object`

**Structure:**
```javascript
{
  summary: Object | null,      // Full API response
  restaurant: Object | null,   // Full API response
  checks: Object | null,       // Full API response
  staying: Object | null       // Full API response
}
```

**When Updated:**
- After successful API fetch
- Cleared on force refresh
- Cleared on booking ID change

**Purpose:**
- Avoid redundant API calls
- Fast tab switching
- Offline support (until stale)

**Usage:**
```javascript
if (STATE.cache.summary && !force_refresh) {
  // Use cached data
  renderSummary(STATE.cache.summary);
} else {
  // Fetch fresh data
  const data = await fetchSummary();
  STATE.cache.summary = data;
}
```

---

#### `newbookAuth`

**Type:** `Object`

**Structure:**
```javascript
{
  isAuthenticated: boolean,
  checking: boolean
}
```

**When Updated:**
- On sidepanel init
- Periodically by auth checker
- After login/logout

**Purpose:**
- Show login prompt if not authenticated
- Prevent API calls if not logged in

**Usage:**
```javascript
if (!STATE.newbookAuth.isAuthenticated) {
  showLoginPrompt();
  return;
}
```

---

#### `lastSummaryInteraction`

**Type:** `number` (timestamp)

**When Updated:**
- User interacts with Summary tab (scroll, click)
- Tab becomes visible

**Purpose:**
- Track inactivity for auto-pause
- Prevent updates during active use

**Usage:**
```javascript
STATE.lastSummaryInteraction = Date.now();

// Check if inactive
const inactiveMs = Date.now() - STATE.lastSummaryInteraction;
if (inactiveMs > STATE.settings.inactivityTimeout * 1000) {
  pauseAutoRefresh();
}
```

---

#### `lastSummaryUpdate`, `lastRestaurantUpdate`, `lastChecksUpdate`, `lastStayingUpdate`

**Type:** `number | null` (timestamp)

**When Updated:**
- After successful tab data load

**Purpose:**
- Display "Last updated" timestamp in UI
- Calculate data staleness

**Usage:**
```javascript
STATE.lastSummaryUpdate = Date.now();

// Display in UI
const elapsed = Math.floor((Date.now() - STATE.lastSummaryUpdate) / 1000);
document.getElementById('last-updated').textContent = `${elapsed}s ago`;
```

---

#### `sessionLocked`

**Type:** `boolean`

**When Updated:**
- On `sessionLockChanged` message from content script

**Purpose:**
- Show login prompt
- Pause auto-refresh during lock
- Prevent API calls

**Usage:**
```javascript
STATE.sessionLocked = true;
showLoginPrompt();
pauseAllTimers();
```

---

#### `createFormOpen`

**Type:** `boolean`

**When Updated:**
- When create booking form is shown/hidden
- Form submission success/error

**Purpose:**
- Pause inactivity timeout when form is open
- Prevent auto-refresh during form editing

**Usage:**
```javascript
STATE.createFormOpen = true;
if (STATE.settings.pauseInactivityWhenFormOpen) {
  clearTimeout(STATE.timers.inactivityTimeout);
}
```

---

#### `navigationContext`

**Type:** `Object | null`

**Structure:**
```javascript
{
  returnTab: string,              // Tab to return to after task
  returnBookingId: string,        // Booking ID to restore
  targetDate: string,             // Date to navigate to
  expandCreateForm: boolean,      // Auto-expand create form
  expandComparisonRow: {          // Comparison to expand
    resosBookingId: number,
    date: string
  },
  scrollAfterLoad: boolean,       // Auto-scroll to target
  preserveBookingId: boolean      // Keep booking ID on return
}
```

**When Updated:**
- `navigateToRestaurantDate()` sets context
- `processNavigationContext()` processes and clears
- `returnToPreviousContext()` restores and clears

**Purpose:**
- Cross-tab navigation with context
- Return to previous state after task
- Auto-scroll and auto-expand UI

**Usage:**
```javascript
// Set context
STATE.navigationContext = {
  returnTab: 'summary',
  targetDate: '2025-01-31',
  expandCreateForm: true,
  scrollAfterLoad: true
};

// Process context
if (STATE.navigationContext?.expandCreateForm) {
  showCreateForm(STATE.navigationContext.targetDate);
}

// Clear context
STATE.navigationContext = null;
```

---

#### `loadedBookingIds`

**Type:** `Object`

**Structure:**
```javascript
{
  restaurant: string | null,  // Booking ID loaded in Restaurant tab
  checks: string | null,      // Booking ID loaded in Checks tab
  summary: boolean,           // If Summary tab loaded
  staying: string | null      // Date loaded in Staying tab (YYYY-MM-DD)
}
```

**When Updated:**
- After successful tab load
- Cleared on force refresh

**Purpose:**
- Detect when tab needs refresh (booking ID changed)
- Prevent redundant loads

**Usage:**
```javascript
if (STATE.loadedBookingIds.restaurant !== STATE.currentBookingId) {
  // Booking changed, force refresh
  await loadRestaurantTab(true);
  STATE.loadedBookingIds.restaurant = STATE.currentBookingId;
}
```

---

#### `scrollPositions`

**Type:** `Object`

**Structure:**
```javascript
{
  summary: number,     // Scroll position in pixels
  restaurant: number,
  checks: number,
  staying: number
}
```

**When Updated:**
- Before switching tabs (`switchTab()`)
- Navigation functions

**Purpose:**
- Restore scroll position when returning to tab
- Preserve user's position in long lists

**Usage:**
```javascript
// Save scroll position
const content = document.querySelector('[data-content="summary"]');
STATE.scrollPositions.summary = content.scrollTop;

// Restore scroll position
content.scrollTop = STATE.scrollPositions.summary;
```

---

#### `restaurantBookings`

**Type:** `Object`

**Structure:**
```javascript
{
  '2025-01-31': [
    {
      time: '19:00',
      people: 4,
      name: 'Smith',
      room: '101',
      is_resident: true
    },
    // ...
  ]
}
```

**When Updated:**
- After fetching all bookings for date

**Purpose:**
- Cache restaurant bookings by date
- Fast rendering of Gantt chart

**Usage:**
```javascript
const bookings = STATE.restaurantBookings[date] || [];
const html = buildGanttChart(openingHours, [], [], bookings);
```

---

#### `restaurantDate`

**Type:** `string` (YYYY-MM-DD)

**When Updated:**
- Date navigation in Restaurant tab
- Navigation context

**Purpose:**
- Track current date being viewed in Restaurant tab

**Usage:**
```javascript
STATE.restaurantDate = '2025-01-31';
await loadRestaurantTab(true);
```

---

#### `restaurantRequestId`

**Type:** `number`

**When Updated:**
- Incremented on each restaurant summary request

**Purpose:**
- Prevent race conditions from async requests
- Discard stale responses

**Usage:**
```javascript
const requestId = ++STATE.restaurantRequestId;
const data = await fetchRestaurantSummary();
if (requestId !== STATE.restaurantRequestId) {
  // Newer request already started, discard this response
  return;
}
```

---

#### `stayingDate`

**Type:** `string` (YYYY-MM-DD)

**When Updated:**
- Date navigation in Staying tab

**Purpose:**
- Track current date being viewed in Staying tab

**Usage:**
```javascript
STATE.stayingDate = '2025-01-31';
await loadStayingTab(STATE.stayingDate);
```

---

## Module-Level State (content-script.js)

Content script maintains minimal state:

```javascript
// Current booking context
let currentBookingId = null;  // string | null

// Settings cache
let settings = null;          // Settings object

// Click detection
let clickTimer = null;        // setTimeout for double-click detection
let clickCount = 0;           // number

// Sidepanel state
let sidepanelOpen = false;    // boolean

// Processed popups (prevent duplicates)
const processedPopupBookings = new Set();  // Set<string>

// Last URL (for SPA detection)
let lastUrl = window.location.href;  // string
```

### State Synchronization

Content script state is synchronized via:

1. **chrome.storage.local.currentBookingId** - Shared with sidepanel
2. **Messages** - `bookingDetected`, `sidepanelOpened`, etc.
3. **Settings updates** - Via `settingsUpdated` message

---

## Module-Level State (background.js)

Background script maintains:

```javascript
// Settings cache
let settings = null;          // Settings object

// Sidepanel tracking
let sidepanelOpenTabs = new Set();  // Set<number> - tab IDs
```

### State Synchronization

Background script state is synchronized via:

1. **chrome.storage.sync.settings** - Settings
2. **chrome.storage.local.sidepanelOpenTabs** - Persisted across browser restarts
3. **Messages** - Forwards between content script and sidepanel

---

## Chrome Storage

### chrome.storage.local

Persistent state that survives page reloads (not synced across devices).

**Schema:**
```javascript
{
  currentBookingId: string | null,     // Current booking context
  sidepanelOpenTabs: number[],         // Array of tab IDs with open sidepanel
  // Plus any other temporary state
}
```

**Access:**
```javascript
// Get
const { currentBookingId } = await chrome.storage.local.get('currentBookingId');

// Set
await chrome.storage.local.set({ currentBookingId: '12345' });

// Remove
await chrome.storage.local.remove('currentBookingId');

// Clear all
await chrome.storage.local.clear();
```

---

### chrome.storage.sync

Settings that sync across devices (limited to 8KB per item, 100KB total).

**Schema:**
```javascript
{
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

**Access:**
```javascript
// Get
const { settings } = await chrome.storage.sync.get('settings');

// Set (broadcasts to all components)
await chrome.storage.sync.set({ settings });
chrome.runtime.sendMessage({ action: 'settingsUpdated', settings });
```

---

## State Synchronization

### Booking ID Flow

```
Content Script                  Storage                     Sidepanel
     │                             │                            │
     │ Detect booking #12345       │                            │
     │                             │                            │
     │ Set storage                 │                            │
     │────────────────────────────>│                            │
     │   currentBookingId=12345    │                            │
     │                             │                            │
     │ Send message                │                            │
     │────────────────────────────────────────────────────────>│
     │   bookingDetected           │                            │
     │                             │                            │
     │                             │           Get storage      │
     │                             │<───────────────────────────│
     │                             │                            │
     │                             │  currentBookingId=12345    │
     │                             │───────────────────────────>│
     │                             │                            │
     │                             │                            │ STATE.currentBookingId = '12345'
     │                             │                            │ loadRestaurantTab()
```

### Settings Flow

```
Settings Page               Storage                  Background               Content Script   Sidepanel
     │                         │                          │                         │              │
     │ Save settings           │                          │                         │              │
     │                         │                          │                         │              │
     │ Set sync storage        │                          │                         │              │
     │────────────────────────>│                          │                         │              │
     │                         │                          │                         │              │
     │ Send message            │                          │                         │              │
     │─────────────────────────────────────────────────────>│                         │              │
     │   settingsUpdated       │                          │                         │              │
     │                         │                          │                         │              │
     │                         │                          │ settings = ...          │              │
     │                         │                          │                         │              │
     │                         │                          │ Forward message         │              │
     │                         │                          │────────────────────────>│              │
     │                         │                          │   settingsUpdated       │              │
     │                         │                          │                         │              │
     │                         │                          │                         │ settings = ...│
     │                         │                          │                         │              │
     │                         │                          │ Forward message         │              │
     │                         │                          │─────────────────────────────────────────>│
     │                         │                          │                         │  settingsUpdated
     │                         │                          │                         │              │
     │                         │                          │                         │              │ STATE.settings = ...
     │                         │                          │                         │              │ initializeApiClient()
```

---

## State Lifecycle

### Sidepanel Lifecycle

```
1. Window Load
   └─> init()
       ├─> loadSettings()
       │   └─> chrome.storage.sync.get('settings')
       │       └─> STATE.settings = settings
       │
       ├─> checkStoredBookingId()
       │   └─> chrome.storage.local.get('currentBookingId')
       │       └─> STATE.currentBookingId = bookingId
       │
       ├─> checkUrlTriggerPattern()
       │   └─> If URL matches booking pattern
       │       ├─> STATE.currentBookingId = bookingId
       │       └─> STATE.isUrlTriggerBooking = true
       │
       └─> switchTab('summary')
           └─> loadSummaryTab()

2. Message Received (bookingDetected)
   └─> STATE.currentBookingId = message.bookingId
       └─> If current tab === 'restaurant'
           └─> loadRestaurantTab(force=true)

3. User Switches Tab
   └─> switchTab(newTab)
       ├─> Save scroll position
       │   └─> STATE.scrollPositions[oldTab] = scrollTop
       │
       ├─> STATE.currentTab = newTab
       │
       └─> Load tab content
           └─> loadXXXTab()

4. Window Unload
   └─> beforeunload event
       └─> Send sidepanelClosed message
```

### Content Script Lifecycle

```
1. Page Load
   └─> init()
       ├─> loadSettings()
       │   └─> chrome.storage.sync.get('settings')
       │
       ├─> checkInitialSidepanelState()
       │   └─> Query if sidepanel already open
       │
       ├─> detectBookingPage()
       │   └─> If URL matches booking
       │       ├─> currentBookingId = bookingId
       │       └─> Send bookingDetected message
       │
       ├─> setupPlannerClickListeners()
       ├─> setupPopupDetection()
       ├─> setupSessionLockDetection()
       │
       └─> createOpenButton() (after 1s delay)

2. URL Change (SPA navigation)
   └─> checkUrlChange() or popstate event
       └─> detectBookingPage()

3. Planner Click
   └─> handlePlannerBlockClick()
       └─> After 250ms (if single-click)
           └─> Send plannerClick message

4. Popup Detected
   └─> handleBookingPopup()
       ├─> chrome.storage.local.set({ currentBookingId })
       └─> Send bookingDetected message

5. Session Lock
   └─> MutationObserver detects #locked_session_dialog
       └─> Send sessionLockChanged message
```

---

## Best Practices

### 1. Single Source of Truth

Use STATE object in sidepanel as primary state:

```javascript
// Good
STATE.currentBookingId = '12345';
chrome.storage.local.set({ currentBookingId: STATE.currentBookingId });

// Bad - state and storage out of sync
chrome.storage.local.set({ currentBookingId: '12345' });
// Forgot to update STATE.currentBookingId
```

### 2. Synchronize Critical State

Always sync critical state to chrome.storage:

```javascript
// Good - survives page reload
STATE.currentBookingId = '12345';
chrome.storage.local.set({ currentBookingId: '12345' });

// Bad - lost on page reload
STATE.currentBookingId = '12345';
```

### 3. Check State Before Using

Always check if state is available:

```javascript
// Good
if (STATE.settings?.summaryRefreshRate) {
  const rate = STATE.settings.summaryRefreshRate;
}

// Bad - may throw error
const rate = STATE.settings.summaryRefreshRate; // Error if settings is null
```

### 4. Clear Stale Cache

Clear cache when context changes:

```javascript
// Good
if (STATE.currentBookingId !== previousBookingId) {
  STATE.cache.restaurant = null; // Clear stale cache
  await loadRestaurantTab(true);
}

// Bad - shows stale data
await loadRestaurantTab(); // Uses cached data for wrong booking
```

### 5. Validate Storage Data

Always validate data from storage:

```javascript
// Good
const { currentBookingId } = await chrome.storage.local.get('currentBookingId');
if (currentBookingId && typeof currentBookingId === 'string') {
  STATE.currentBookingId = currentBookingId;
}

// Bad - trust storage data
const { currentBookingId } = await chrome.storage.local.get('currentBookingId');
STATE.currentBookingId = currentBookingId; // May be undefined
```

### 6. Use Timestamps for Staleness

Track when data was last updated:

```javascript
// Good
STATE.lastSummaryUpdate = Date.now();
const age = Date.now() - STATE.lastSummaryUpdate;
if (age > 5 * 60 * 1000) { // 5 minutes
  await loadSummaryTab(true); // Refresh stale data
}

// Bad - no staleness check
await loadSummaryTab(); // May use very old cached data
```

### 7. Clear Timers on Cleanup

Always clear timers when component unmounts:

```javascript
// Good
window.addEventListener('beforeunload', () => {
  clearInterval(STATE.timers.summaryRefresh);
  clearTimeout(STATE.timers.inactivityTimeout);
});

// Bad - timers continue running
// (wastes resources, may cause errors)
```

---

## Debugging State

### Log State Changes

```javascript
// Wrap state setters
const originalSet = Object.getOwnPropertyDescriptor(Object.prototype, '__lookupSetter__');
Object.defineProperty(STATE, 'currentBookingId', {
  get() {
    return this._currentBookingId;
  },
  set(value) {
    console.log('STATE.currentBookingId changed:', this._currentBookingId, '→', value);
    this._currentBookingId = value;
  }
});
```

### Inspect Storage

```javascript
// View all storage
chrome.storage.local.get(null, (items) => {
  console.log('Local storage:', items);
});

chrome.storage.sync.get(null, (items) => {
  console.log('Sync storage:', items);
});
```

### Monitor Storage Changes

```javascript
// Listen for storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log(`Storage [${areaName}] changed:`, changes);
});
```

---

## Next Steps

- See [FUNCTION_REFERENCE.md](FUNCTION_REFERENCE.md) for state modification functions
- See [MESSAGE_PASSING_REFERENCE.md](MESSAGE_PASSING_REFERENCE.md) for state synchronization
- See [ARCHITECTURE.md](ARCHITECTURE.md) for overall system design
