# Function Cheat Sheet

Quick reference guide for commonly used functions in the NewBook Assistant Chrome Extension.

---

## Table of Contents

- [Tab Management](#tab-management)
- [Data Loading](#data-loading)
- [Navigation](#navigation)
- [API Calls](#api-calls)
- [Gantt Chart](#gantt-chart)
- [Forms](#forms)
- [Message Passing](#message-passing)
- [Storage](#storage)
- [Utilities](#utilities)

---

## Tab Management

### Switch to a Tab

```javascript
switchTab('summary');     // Switch to Summary tab
switchTab('restaurant');  // Switch to Restaurant tab
switchTab('checks');      // Switch to Checks tab
switchTab('staying');     // Switch to Staying tab
```

### Load Tab Content

```javascript
// Load without forcing refresh (uses cache if available)
await loadSummaryTab();
await loadRestaurantTab();
await loadChecksTab();
await loadStayingTab();

// Force refresh (bypass cache)
await loadSummaryTab(true);
await loadRestaurantTab(true);
await loadChecksTab(true);
await loadStayingTab('2025-01-31', true);
```

### Update Tab Badges

```javascript
STATE.badges.summary.critical = 3;
STATE.badges.summary.warning = 5;
updateBadges();
```

---

## Data Loading

### Fetch Summary Data

```javascript
const data = await fetch(`${window.apiClient.baseUrl}/summary?context=chrome-summary`, {
  method: 'GET',
  headers: {
    'Authorization': window.apiClient.authHeader,
    'Content-Type': 'application/json'
  }
});
const json = await data.json();
```

### Fetch Restaurant Suggestions

```javascript
const url = `${window.apiClient.baseUrl}/restaurant?booking_id=${bookingId}&context=chrome-extension`;
const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Authorization': window.apiClient.authHeader,
    'Content-Type': 'application/json'
  }
});
const data = await response.json();
```

### Fetch Checks Data

```javascript
const url = `${window.apiClient.baseUrl}/checks?booking_id=${bookingId}&context=chrome-extension`;
const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Authorization': window.apiClient.authHeader,
    'Content-Type': 'application/json'
  }
});
const data = await response.json();
```

### Fetch Staying Guests

```javascript
const url = `${window.apiClient.baseUrl}/staying?date=${date}&context=chrome-extension`;
const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Authorization': window.apiClient.authHeader,
    'Content-Type': 'application/json'
  }
});
const data = await response.json();
```

---

## Navigation

### Navigate to Restaurant Tab with Date

```javascript
// Simple navigation
navigateToRestaurantDate('2025-01-31');

// With booking ID
navigateToRestaurantDate('2025-01-31', 12345);

// With booking comparison
navigateToRestaurantDate('2025-01-31', 12345, 67890);
```

### Navigate to Checks Tab

```javascript
navigateToChecksTab(12345);
```

### Return to Previous Tab

```javascript
returnToPreviousContext();
```

### Set Navigation Context

```javascript
STATE.navigationContext = {
  returnTab: 'summary',
  returnBookingId: '12345',
  targetDate: '2025-01-31',
  expandCreateForm: true,
  scrollAfterLoad: true
};
```

---

## API Calls

### Fetch Opening Hours

```javascript
const data = await fetchOpeningHours('2025-01-31');
console.log(data.opening_hours);  // [{open: 1800, close: 2200, ...}]
```

### Fetch Available Times

```javascript
const data = await fetchAvailableTimes('2025-01-31', 4);
console.log(data.times);  // ['18:00', '18:15', '18:30']

// With opening hour period filter
const data = await fetchAvailableTimes('2025-01-31', 4, 'abc123');
```

### Fetch Dietary Choices

```javascript
const data = await fetchDietaryChoices();
console.log(data.choices);  // [{id: 1, name: 'Vegetarian'}, ...]
```

### Fetch Special Events

```javascript
const data = await fetchSpecialEvents('2025-12-25');
console.log(data.events);  // [{name: 'Closed', open: null, close: null}]
```

### Fetch All Bookings for Date

```javascript
const data = await fetchAllBookingsForDate('2025-01-31');
console.log(data.bookings);  // [{time: '19:00', people: 4, ...}]
```

### Create Restaurant Booking

```javascript
const response = await fetch(`${window.apiClient.baseUrl}/create-booking`, {
  method: 'POST',
  headers: {
    'Authorization': window.apiClient.authHeader,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    booking_id: 12345,
    date: '2025-01-31',
    time: '19:00',
    people: 4,
    opening_hour_id: 'abc123',
    guest_name: 'John Smith',
    email: 'john@example.com',
    room_number: '101',
    context: 'chrome-extension'
  })
});
const data = await response.json();
```

---

## Gantt Chart

### Build Gantt Chart

```javascript
const openingHours = [{open: 1800, close: 2200, interval: 15, duration: 120}];
const bookings = [{time: '19:00', people: 4, name: 'Smith', room: '101'}];
const html = buildGanttChart(
  openingHours,      // Opening hours array
  [],                // Special events (optional)
  [],                // Available times (optional)
  bookings,          // Existing bookings
  'compact',         // Display mode ('full' or 'compact')
  'gantt-2025-01-31', // Chart ID
  true               // Online booking available
);
document.getElementById('gantt-container').innerHTML = html;
```

### Scroll Gantt to Time

```javascript
scrollGanttToTime('gantt-2025-01-31', '19:00');        // Scroll to 7pm
scrollGanttToTime('gantt-2025-01-31', 1900);           // Same (HHMM format)
scrollGanttToTime('gantt-2025-01-31', 'now');          // Scroll to current time
scrollGanttToTime('gantt-2025-01-31', '19:00', false); // Instant scroll (no animation)
```

### Show/Hide Sight Line

```javascript
showGanttSightLine('gantt-2025-01-31', '19:30');  // Show at 7:30pm
showGanttSightLine('gantt-2025-01-31');           // Show at current time
hideGanttSightLine('gantt-2025-01-31');           // Hide (unless locked)
hideGanttSightLine('gantt-2025-01-31', true);     // Force hide
```

### Lock/Unlock Sight Line

```javascript
lockGanttSightLine('gantt-2025-01-31');    // Lock at current position
unlockGanttSightLine('gantt-2025-01-31');  // Unlock and hide
```

### Position Bookings on Grid

```javascript
const bookings = [{time: '19:00', people: 4, name: 'Smith'}];
const positioned = positionBookingsOnGrid(
  bookings,   // Bookings array
  18,         // Start hour (6pm)
  240,        // Total minutes (4 hours)
  120,        // Booking duration (2 hours)
  14          // Grid row height (pixels)
);
// positioned[0].grid_row = 0
// positioned[0].row_span = 3
```

---

## Forms

### Validate Form

```javascript
if (validateBookingForm('create-form-2025-01-31')) {
  // Form is valid, submit
  await submitCreateBooking('2025-01-31');
} else {
  // Validation errors shown to user
}
```

### Toggle Form Section

```javascript
// From HTML onclick
<button onclick="toggleFormSection('advanced-options', this)">
  Advanced Options
</button>
```

### Toggle Period Section

```javascript
await togglePeriodSection('2025-01-31', 0);  // Toggle first period (Lunch)
await togglePeriodSection('2025-01-31', 1);  // Toggle second period (Dinner)
```

---

## Message Passing

### Send Message (One-Way)

```javascript
// From content script or sidepanel
chrome.runtime.sendMessage({
  action: 'bookingDetected',
  bookingId: '12345',
  url: window.location.href
}).catch(error => {
  // Receiver not ready, that's okay
  console.log('Message not delivered:', error);
});
```

### Send Message (With Response)

```javascript
// Query sidepanel state
const response = await chrome.runtime.sendMessage({
  action: 'isSidepanelOpen'
});
console.log('Sidepanel open:', response.isOpen);
```

### Listen for Messages

```javascript
// Simple listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'bookingDetected') {
    STATE.currentBookingId = message.bookingId;
    loadRestaurantTab(true);
  }
});

// Listener with response
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'isSidepanelOpen') {
    sendResponse({ isOpen: sidepanelOpen });
    return true;  // Keep channel open
  }
});
```

### Common Messages

```javascript
// Booking detected
chrome.runtime.sendMessage({
  action: 'bookingDetected',
  bookingId: '12345',
  url: window.location.href,
  source: 'url'
});

// Planner click
chrome.runtime.sendMessage({
  action: 'plannerClick',
  bookingId: '12345',
  source: 'planner-single-click'
});

// Session lock changed
chrome.runtime.sendMessage({
  action: 'sessionLockChanged',
  isLocked: true
});

// Settings updated
chrome.runtime.sendMessage({
  action: 'settingsUpdated',
  settings: {...}
});

// Open sidepanel
chrome.runtime.sendMessage({
  action: 'openSidePanel'
});

// Sidepanel opened
chrome.runtime.sendMessage({
  action: 'sidepanelOpened'
});

// Sidepanel closed
chrome.runtime.sendMessage({
  action: 'sidepanelClosed'
});
```

---

## Storage

### Get from Storage

```javascript
// Get single value
const { currentBookingId } = await chrome.storage.local.get('currentBookingId');

// Get multiple values
const { currentBookingId, sidepanelOpenTabs } = await chrome.storage.local.get(['currentBookingId', 'sidepanelOpenTabs']);

// Get all values
const allData = await chrome.storage.local.get(null);

// Get settings (sync storage)
const { settings } = await chrome.storage.sync.get('settings');
```

### Set to Storage

```javascript
// Set single value
await chrome.storage.local.set({ currentBookingId: '12345' });

// Set multiple values
await chrome.storage.local.set({
  currentBookingId: '12345',
  lastUpdate: Date.now()
});

// Set settings (sync storage)
await chrome.storage.sync.set({ settings: {...} });
```

### Remove from Storage

```javascript
// Remove single value
await chrome.storage.local.remove('currentBookingId');

// Remove multiple values
await chrome.storage.local.remove(['currentBookingId', 'lastUpdate']);
```

### Clear Storage

```javascript
// Clear all local storage
await chrome.storage.local.clear();

// Clear all sync storage (use with caution)
await chrome.storage.sync.clear();
```

---

## Utilities

### Debug Logging

```javascript
BMA_LOG.log('Debug message');     // Only if enableDebugLogging=true
BMA_LOG.warn('Warning message');  // Only if enableDebugLogging=true
BMA_LOG.error('Error message');   // Always logged
BMA_LOG.info('Info message');     // Only if enableDebugLogging=true
```

### Update Current Booking

```javascript
// Update state and storage
STATE.currentBookingId = '12345';
await chrome.storage.local.set({ currentBookingId: '12345' });

// Check if booking is set
if (!STATE.currentBookingId) {
  showNoBookingMessage();
  return;
}
```

### Check NewBook Authentication

```javascript
const isAuthenticated = await AuthManager.checkNewBookAuth();
if (!isAuthenticated) {
  showLoginPrompt();
  return;
}
```

### Show/Hide Loading Spinner

```javascript
const content = document.querySelector('[data-content="summary"]');
content.innerHTML = '<div class="loading-spinner">Loading...</div>';

// After data loads
content.innerHTML = renderSummary(data);
```

### Format Timestamp

```javascript
const elapsed = Math.floor((Date.now() - STATE.lastSummaryUpdate) / 1000);
const minutes = Math.floor(elapsed / 60);
const seconds = elapsed % 60;
const text = `${minutes}m ${seconds}s ago`;
```

### Scroll Position Management

```javascript
// Save scroll position
const content = document.querySelector('[data-content="summary"]');
STATE.scrollPositions.summary = content.scrollTop;

// Restore scroll position
setTimeout(() => {
  content.scrollTop = STATE.scrollPositions.summary;
}, 100);
```

### Check URL Trigger Pattern

```javascript
const urlMatch = await checkUrlTriggerPattern();
if (urlMatch) {
  STATE.currentBookingId = urlMatch.bookingId;
  STATE.isUrlTriggerBooking = true;
}
```

### Timer Management

```javascript
// Start auto-refresh timer
STATE.timers.summaryRefresh = setInterval(() => {
  loadSummaryTab(true);
}, STATE.settings.summaryRefreshRate * 1000);

// Clear timer
if (STATE.timers.summaryRefresh) {
  clearInterval(STATE.timers.summaryRefresh);
  STATE.timers.summaryRefresh = null;
}

// Inactivity timeout
STATE.timers.inactivityTimeout = setTimeout(() => {
  pauseAutoRefresh();
}, STATE.settings.inactivityTimeout * 1000);
```

### Cache Management

```javascript
// Check cache
if (STATE.cache.summary && !force_refresh) {
  renderSummary(STATE.cache.summary);
  return;
}

// Update cache
const data = await fetchSummary();
STATE.cache.summary = data;
STATE.lastSummaryUpdate = Date.now();

// Clear cache
STATE.cache.restaurant = null;
STATE.loadedBookingIds.restaurant = null;
```

### Error Handling

```javascript
try {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.message || 'Request failed');
  }
  return data;
} catch (error) {
  BMA_LOG.error('API Error:', error);
  showErrorMessage(error.message);
  throw error;
}
```

---

## Common Patterns

### Load Tab with Booking Check

```javascript
async function loadRestaurantTab(force_refresh = false) {
  // Check if booking is set
  if (!STATE.currentBookingId) {
    showNoBookingMessage();
    return;
  }

  // Check if already loaded for this booking
  if (STATE.loadedBookingIds.restaurant === STATE.currentBookingId && !force_refresh) {
    // Already loaded, skip
    return;
  }

  // Show loading
  showLoadingSpinner();

  try {
    // Fetch data
    const data = await fetchRestaurantData(STATE.currentBookingId);

    // Update cache and state
    STATE.cache.restaurant = data;
    STATE.loadedBookingIds.restaurant = STATE.currentBookingId;
    STATE.lastRestaurantUpdate = Date.now();

    // Render UI
    renderRestaurant(data);

    // Process navigation context
    await processNavigationContext();
  } catch (error) {
    showErrorMessage(error.message);
  }
}
```

### Auto-Refresh Pattern

```javascript
function startAutoRefresh() {
  // Clear existing timer
  if (STATE.timers.summaryRefresh) {
    clearInterval(STATE.timers.summaryRefresh);
  }

  // Create new timer
  const refreshRate = STATE.settings?.summaryRefreshRate || 60;
  STATE.timers.summaryRefresh = setInterval(async () => {
    // Check inactivity
    const inactiveMs = Date.now() - STATE.lastSummaryInteraction;
    const timeoutMs = STATE.settings.inactivityTimeout * 1000;

    if (inactiveMs > timeoutMs) {
      // User is inactive, pause refresh
      pauseAutoRefresh();
      return;
    }

    // Refresh data
    await loadSummaryTab(true);
  }, refreshRate * 1000);
}
```

### Navigation with Context Pattern

```javascript
// Set context and navigate
function navigateToDate(date, bookingId) {
  // Save current state
  STATE.navigationContext = {
    returnTab: STATE.currentTab,
    returnBookingId: STATE.currentBookingId,
    targetDate: date,
    expandCreateForm: true,
    scrollAfterLoad: true
  };

  // Update booking ID
  STATE.currentBookingId = bookingId;
  chrome.storage.local.set({ currentBookingId: bookingId });

  // Switch tab
  switchTab('restaurant');
}

// Process context after load
async function processNavigationContext() {
  if (!STATE.navigationContext) return;

  const { targetDate, expandCreateForm, scrollAfterLoad } = STATE.navigationContext;

  // Find target section
  const section = document.getElementById(`date-section-${targetDate}`);
  if (!section) return;

  // Expand form
  if (expandCreateForm) {
    const form = document.getElementById(`create-form-${targetDate}`);
    if (form) form.style.display = 'block';
  }

  // Scroll to section
  if (scrollAfterLoad) {
    setTimeout(() => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }

  // Clear context
  STATE.navigationContext = null;
}
```

---

## Quick Tips

1. **Always check STATE.currentBookingId before loading restaurant/checks tabs**
2. **Use force_refresh=true to bypass cache**
3. **Clear timers on component unmount to prevent memory leaks**
4. **Use .catch() on chrome.runtime.sendMessage (receiver may not be ready)**
5. **Always validate data from chrome.storage (may be undefined)**
6. **Use BMA_LOG instead of console.log (respects debug setting)**
7. **Update STATE.loadedBookingIds after loading to prevent redundant loads**
8. **Save scroll positions before switching tabs**
9. **Use chrome.storage.local for state, chrome.storage.sync for settings**
10. **Process navigation context after tab loads to handle auto-scroll/expand**

---

## Next Steps

- See [FUNCTION_REFERENCE.md](FUNCTION_REFERENCE.md) for detailed documentation
- See [MESSAGE_PASSING_REFERENCE.md](MESSAGE_PASSING_REFERENCE.md) for message protocols
- See [STATE_MANAGEMENT.md](STATE_MANAGEMENT.md) for state patterns
- See [ARCHITECTURE.md](ARCHITECTURE.md) for system overview
