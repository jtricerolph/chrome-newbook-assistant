# Function Reference

Complete reference for all key functions in the NewBook Assistant Chrome Extension.

---

## Table of Contents

- [sidepanel.js Functions](#sidepaneljs-functions)
  - [Tab Management](#tab-management)
  - [Navigation Functions](#navigation-functions)
  - [Gantt Chart Functions](#gantt-chart-functions)
  - [API Functions](#api-functions)
  - [Form Functions](#form-functions)
  - [Authentication Functions](#authentication-functions)
- [content-script.js Functions](#content-scriptjs-functions)
  - [Booking Detection](#booking-detection)
  - [Planner Integration](#planner-integration)
  - [Popup Detection](#popup-detection)
  - [Session Management](#session-management)
- [background.js Functions](#backgroundjs-functions)
  - [Message Handling](#message-handling)
  - [Tab Management](#tab-management-1)
  - [Settings Management](#settings-management)
- [settings.js Functions](#settingsjs-functions)

---

## sidepanel.js Functions

### Tab Management

#### `switchTab(tabName)`

Switches between tabs in the sidepanel interface.

**Parameters:**
- `tabName` (string): The name of the tab to switch to ('summary', 'restaurant', 'checks', 'staying')

**Returns:** None

**Usage Example:**
```javascript
switchTab('restaurant');
```

**Description:**
- Saves scroll position of current tab
- Updates UI to show selected tab
- Updates navigation badges
- Triggers tab content loading if not already loaded
- Resets inactivity timer

---

#### `loadSummaryTab(force_refresh = false)`

Loads or refreshes the Summary tab content.

**Parameters:**
- `force_refresh` (boolean, optional): Force refresh even if cached data exists. Default: `false`

**Returns:** `Promise<void>`

**Usage Example:**
```javascript
await loadSummaryTab(true); // Force refresh
```

**Description:**
- Fetches summary data from WordPress API
- Displays recent bookings
- Shows critical/warning badges
- Updates cache and timestamps
- Handles authentication errors
- Respects cache timeout settings

---

#### `loadRestaurantTab(force_refresh = false)`

Loads or refreshes the Restaurant tab content.

**Parameters:**
- `force_refresh` (boolean, optional): Force refresh even if cached data exists. Default: `false`

**Returns:** `Promise<void>`

**Usage Example:**
```javascript
await loadRestaurantTab();
```

**Description:**
- Fetches restaurant booking suggestions for current booking
- Displays Gantt chart visualization
- Shows available times and create booking form
- Processes navigation context (auto-scroll, expand forms)
- Updates cache and tracks loaded booking ID

---

#### `loadChecksTab(force_refresh = false)`

Loads or refreshes the Checks tab content.

**Parameters:**
- `force_refresh` (boolean, optional): Force refresh even if cached data exists. Default: `false`

**Returns:** `Promise<void>`

**Usage Example:**
```javascript
await loadChecksTab(true);
```

**Description:**
- Fetches check-in/check-out data for current booking
- Displays guest information and room assignments
- Shows dietary requirements and special requests
- Validates booking ID is set
- Updates cache and tracks loaded booking ID

---

#### `loadStayingTab(date = null, force_refresh = false)`

Loads or refreshes the Staying tab content for a specific date.

**Parameters:**
- `date` (string|null, optional): Date in YYYY-MM-DD format. Default: current date
- `force_refresh` (boolean, optional): Force refresh even if cached data exists. Default: `false`

**Returns:** `Promise<void>`

**Usage Example:**
```javascript
await loadStayingTab('2025-01-31', true);
```

**Description:**
- Fetches list of guests staying on specified date
- Displays guest cards with room and booking info
- Provides date navigation controls
- Updates cache and tracks loaded date

---

### Navigation Functions

#### `navigateToRestaurantDate(date, bookingId = null, resosBookingId = null)`

Navigates to Restaurant tab with specific date and optional booking context.

**Parameters:**
- `date` (string): Date in YYYY-MM-DD format
- `bookingId` (number|null, optional): NewBook booking ID to set as current
- `resosBookingId` (number|null, optional): Restaurant booking ID to compare/expand

**Returns:** None

**Usage Example:**
```javascript
navigateToRestaurantDate('2025-01-31', 12345);
```

**Description:**
- Saves current scroll position
- Sets navigation context (return tab, target date, auto-scroll settings)
- Updates current booking ID if provided
- Switches to restaurant tab
- Auto-expands create form or comparison view based on context

---

#### `navigateToChecksTab(bookingId)`

Navigates to Checks tab for a specific booking.

**Parameters:**
- `bookingId` (number): NewBook booking ID

**Returns:** None

**Usage Example:**
```javascript
navigateToChecksTab(12345);
```

**Description:**
- Saves current scroll position
- Updates current booking ID
- Switches to checks tab

---

#### `returnToPreviousContext()`

Returns to the previous tab/context after completing a task.

**Parameters:** None

**Returns:** None

**Usage Example:**
```javascript
returnToPreviousContext();
```

**Description:**
- Restores previous tab from navigation context
- Restores previous booking ID
- Restores scroll position
- Clears navigation context

---

#### `processNavigationContext(retryCount = 0)`

Processes navigation context after Restaurant tab loads (internal function).

**Parameters:**
- `retryCount` (number, optional): Number of retry attempts. Default: 0

**Returns:** `Promise<void>`

**Usage Example:**
```javascript
// Called automatically by loadRestaurantTab()
await processNavigationContext();
```

**Description:**
- Finds target date section in DOM
- Expands create booking form if requested
- Expands comparison view if requested
- Auto-scrolls to target section
- Handles retry logic if DOM not ready
- Clears navigation context when complete

---

### Gantt Chart Functions

#### `buildGanttChart(openingHours, specialEvents, availableTimes, bookings, displayMode, chartId, onlineBookingAvailable)`

Builds HTML for a Gantt chart visualization of restaurant bookings.

**Parameters:**
- `openingHours` (Array): Array of opening hour period objects `[{open: 1800, close: 2200, interval: 15, duration: 120}]`
- `specialEvents` (Array, optional): Array of special event objects (closures/restrictions)
- `availableTimes` (Array, optional): Array of available time slots in HH:MM format
- `bookings` (Array, optional): Array of existing bookings to display
- `displayMode` (string, optional): 'full' or 'compact'. Default: 'compact'
- `chartId` (string, optional): Unique chart ID for sight line. Default: 'gantt'
- `onlineBookingAvailable` (boolean, optional): Whether online booking is available. Default: true

**Returns:** `string` - HTML markup for the Gantt chart

**Usage Example:**
```javascript
const openingHours = [{open: 1800, close: 2200, interval: 15, duration: 120}];
const bookings = [{time: '19:00', people: 4, name: 'Smith', room: '101', is_resident: true}];
const html = buildGanttChart(openingHours, [], [], bookings, 'compact', 'gantt-1');
```

**Description:**
- Calculates time range from opening hours
- Positions bookings using grid algorithm (prevents overlaps)
- Generates time grid lines and labels
- Adds grey overlays for closed periods
- Adds grey overlays for fully booked slots
- Renders booking bars with color coding by status
- Includes sight line element for time highlighting

---

#### `scrollGanttToTime(chartId, time, smooth = true)`

Scrolls Gantt chart viewport to center on a specific time.

**Parameters:**
- `chartId` (string): ID of the Gantt chart container
- `time` (string|number): Time in HHMM format (e.g., 1900) or HH:MM format (e.g., "19:00"), or "now" for current time
- `smooth` (boolean, optional): Use smooth scrolling animation. Default: true

**Returns:** None

**Usage Example:**
```javascript
scrollGanttToTime('gantt-2025-01-31', '19:00', true);
scrollGanttToTime('gantt-today', 'now'); // Scroll to current time
```

**Description:**
- Converts time to HHMM format
- Calculates scroll position based on chart time range
- Centers time in viewport
- Supports smooth or instant scrolling

---

#### `showGanttSightLine(chartId, time = null)`

Shows a vertical sight line on the Gantt chart at a specific time.

**Parameters:**
- `chartId` (string): ID of the Gantt chart container
- `time` (string|null, optional): Time in HHMM or HH:MM format. Default: current time

**Returns:** None

**Usage Example:**
```javascript
showGanttSightLine('gantt-2025-01-31', '19:30');
showGanttSightLine('gantt-today'); // Show at current time
```

**Description:**
- Calculates time position as percentage of chart width
- Positions sight line element
- Hides sight line if time outside chart range
- Displays sight line at calculated position

---

#### `hideGanttSightLine(chartId, force = false)`

Hides the Gantt chart sight line.

**Parameters:**
- `chartId` (string): ID of the Gantt chart container
- `force` (boolean, optional): Force hide even if locked. Default: false

**Returns:** None

**Usage Example:**
```javascript
hideGanttSightLine('gantt-2025-01-31');
hideGanttSightLine('gantt-2025-01-31', true); // Force hide
```

**Description:**
- Checks if sight line is locked (from time selection)
- Hides sight line unless locked (or force=true)

---

#### `lockGanttSightLine(chartId)`

Locks the sight line at current position (when time is selected).

**Parameters:**
- `chartId` (string): ID of the Gantt chart container

**Returns:** None

**Usage Example:**
```javascript
lockGanttSightLine('gantt-2025-01-31');
```

---

#### `unlockGanttSightLine(chartId)`

Unlocks and hides the sight line.

**Parameters:**
- `chartId` (string): ID of the Gantt chart container

**Returns:** None

**Usage Example:**
```javascript
unlockGanttSightLine('gantt-2025-01-31');
```

---

#### `positionBookingsOnGrid(bookings, startHour, totalMinutes, bookingDuration, gridRowHeight)`

Positions bookings using grid-based layout algorithm to prevent overlaps.

**Parameters:**
- `bookings` (Array): Array of booking objects with time, people, name, room
- `startHour` (number): Starting hour of chart (e.g., 18 for 6pm)
- `totalMinutes` (number): Total minutes in chart time range
- `bookingDuration` (number): Default booking duration in minutes
- `gridRowHeight` (number): Height of each grid row in pixels

**Returns:** `Array` - Array of positioned booking objects with `grid_row` and `row_span` properties

**Usage Example:**
```javascript
const bookings = [{time: '19:00', people: 4, name: 'Smith'}];
const positioned = positionBookingsOnGrid(bookings, 18, 240, 120, 14);
// positioned[0].grid_row = 0
// positioned[0].row_span = 3
```

**Description:**
- Converts times to minutes from start
- Sorts bookings by time and party size
- Calculates row span based on party size
- Uses grid compaction algorithm to prevent overlaps
- Adds 5-minute buffer between bookings
- Returns positioned bookings with grid coordinates

---

### API Functions

#### `fetchOpeningHours(date = null)`

Fetches opening hours from the WordPress REST API.

**Parameters:**
- `date` (string|null, optional): Date in YYYY-MM-DD format. Default: null (uses default/today)

**Returns:** `Promise<Object>` - Opening hours data `{success: true, opening_hours: [...], special_events: [...]}`

**Usage Example:**
```javascript
const data = await fetchOpeningHours('2025-01-31');
console.log(data.opening_hours); // [{open: 1800, close: 2200, ...}]
```

**Description:**
- Makes GET request to `/opening-hours` endpoint
- Includes authentication header
- Returns parsed JSON response
- Throws error on HTTP errors

---

#### `fetchAvailableTimes(date, people, openingHourId = null)`

Fetches available booking times for a specific date and party size.

**Parameters:**
- `date` (string): Date in YYYY-MM-DD format
- `people` (number): Party size
- `openingHourId` (string|null, optional): Opening hour period ID to filter

**Returns:** `Promise<Object>` - Available times data `{success: true, times: ['18:00', '18:15', ...]}`

**Usage Example:**
```javascript
const data = await fetchAvailableTimes('2025-01-31', 4);
console.log(data.times); // ['18:00', '18:15', '18:30']
```

**Description:**
- Makes POST request to `/available-times` endpoint
- Sends date, people, and optional period ID in body
- Returns array of available time slots
- Throws error on HTTP errors

---

#### `fetchDietaryChoices()`

Fetches available dietary choices/requirements.

**Parameters:** None

**Returns:** `Promise<Object>` - Dietary choices data `{success: true, choices: [{id: 1, name: 'Vegetarian'}, ...]}`

**Usage Example:**
```javascript
const data = await fetchDietaryChoices();
console.log(data.choices); // [{id: 1, name: 'Vegetarian'}, ...]
```

---

#### `fetchSpecialEvents(date)`

Fetches special events (closures, restrictions) for a specific date.

**Parameters:**
- `date` (string): Date in YYYY-MM-DD format

**Returns:** `Promise<Object>` - Special events data `{success: true, events: [...]}`

**Usage Example:**
```javascript
const data = await fetchSpecialEvents('2025-12-25');
console.log(data.events); // [{name: 'Closed', open: null, close: null}]
```

---

#### `fetchAllBookingsForDate(date)`

Fetches all restaurant bookings for a specific date.

**Parameters:**
- `date` (string): Date in YYYY-MM-DD format

**Returns:** `Promise<Object>` - All bookings data `{success: true, bookings: [...]}`

**Usage Example:**
```javascript
const data = await fetchAllBookingsForDate('2025-01-31');
console.log(data.bookings); // [{time: '19:00', people: 4, name: 'Smith', ...}]
```

---

### Form Functions

#### `validateBookingForm(formId)`

Validates booking form inputs before submission.

**Parameters:**
- `formId` (string): ID of the form element to validate

**Returns:** `boolean` - True if valid, false otherwise

**Usage Example:**
```javascript
if (validateBookingForm('create-form-2025-01-31')) {
  // Submit form
}
```

**Description:**
- Validates required fields (guest name, people count)
- Validates email format (if provided)
- Validates phone format (if provided)
- Displays error feedback if validation fails
- Returns true/false for form submission control

---

#### `toggleFormSection(sectionId, toggleButton)`

Toggles collapsible form section visibility.

**Parameters:**
- `sectionId` (string): ID of the section content to toggle
- `toggleButton` (HTMLElement): Button element that was clicked

**Returns:** None

**Usage Example:**
```javascript
// From HTML onclick handler
toggleFormSection('advanced-options-2025-01-31', this);
```

---

#### `togglePeriodSection(date, periodIndex)`

Toggles collapsible service period section (Lunch/Dinner).

**Parameters:**
- `date` (string): Date string for the form
- `periodIndex` (number): Index of the period to toggle

**Returns:** `Promise<void>`

**Usage Example:**
```javascript
await togglePeriodSection('2025-01-31', 0); // Toggle first period
```

**Description:**
- Collapses other periods (only one open at a time)
- Expands/collapses target period
- Lazy loads available times if not yet loaded
- Updates collapse icon (▶/▼)

---

### Authentication Functions

#### `AuthManager.checkNewBookAuth()`

Checks if user has active NewBook session by checking cookies.

**Parameters:** None

**Returns:** `Promise<boolean>` - True if authenticated, false otherwise

**Usage Example:**
```javascript
const isLoggedIn = await AuthManager.checkNewBookAuth();
if (!isLoggedIn) {
  // Show login prompt
}
```

**Description:**
- Queries cookies from appeu.newbook.cloud and login.newbook.cloud domains
- Looks for PHPSESSID or session-related cookies
- Checks cookie expiration
- Returns authentication status

---

## content-script.js Functions

### Booking Detection

#### `detectBookingPage()`

Detects if current page is a booking view/check-in page.

**Parameters:** None

**Returns:** None

**Usage Example:**
```javascript
// Called automatically on page load and navigation
detectBookingPage();
```

**Description:**
- Matches URL pattern `/bookings_view/{id}` or `/bookings_checkin/{id}`
- Extracts booking ID from URL
- Sends `bookingDetected` message to background script if new booking detected
- Updates `currentBookingId` state
- Logs when leaving booking page

---

#### `findBookingIdFromContext()`

Multi-method booking ID detection with cascading fallbacks.

**Parameters:** None

**Returns:** `string|null` - Booking ID if found, null otherwise

**Usage Example:**
```javascript
const bookingId = findBookingIdFromContext();
if (bookingId) {
  console.log('Found booking:', bookingId);
}
```

**Description:**
- **Method 1**: Check URL pattern (highest priority)
- **Method 2**: Look for elements with `booking_id` attribute
- **Method 3**: Check for `data-booking-id` attributes
- **Method 4**: Search visible jQuery UI dialogs for booking title
- **Method 5**: Check for booking links in page
- Returns first match found or null

---

### Planner Integration

#### `handlePlannerBlockClick(event)`

Handles single/double click on planner booking blocks.

**Parameters:**
- `event` (Event): Click event object

**Returns:** None

**Usage Example:**
```javascript
// Attached to booking blocks automatically
bookingBlock.addEventListener('click', handlePlannerBlockClick);
```

**Description:**
- Extracts booking ID from clicked element (multiple methods)
- Implements 250ms double-click detection
- Single-click: Sends `plannerClick` message to refresh sidepanel
- Double-click: Allows NewBook to handle (open full booking view)
- Respects `enablePlannerClickUpdate` setting

---

#### `setupPlannerClickListeners()`

Sets up click listeners on planner booking blocks.

**Parameters:** None

**Returns:** None

**Usage Example:**
```javascript
// Called automatically on init
setupPlannerClickListeners();
```

**Description:**
- Finds all `div[booking_id]` elements (planner blocks)
- Attaches click listeners to each block
- Marks blocks to avoid duplicate listeners
- Uses MutationObserver to detect new blocks (navigation, date changes)
- Implements debouncing to optimize performance

---

### Popup Detection

#### `handleBookingPopup(popupElement)`

Handles NewBook booking popup detection.

**Parameters:**
- `popupElement` (HTMLElement): Popup element that was detected

**Returns:** None

**Usage Example:**
```javascript
// Called automatically by MutationObserver
handleBookingPopup(popupElement);
```

**Description:**
- Extracts booking ID from class name (`make_popup_tab_12345`)
- Prevents duplicate notifications (2-second cooldown)
- Marks element as processed
- Stores booking ID in chrome.storage.local
- Sends `bookingDetected` message to background script

---

#### `setupPopupDetection()`

Sets up detection for NewBook booking popups.

**Parameters:** None

**Returns:** None

**Usage Example:**
```javascript
// Called automatically on init
setupPopupDetection();
```

**Description:**
- Uses MutationObserver to watch for new `fieldset.make_popup_tab` elements
- Monitors style attribute changes (show/hide)
- Periodic polling as backup (every 2 seconds)
- Checks existing popups on load

---

### Session Management

#### `setupSessionLockDetection()`

Detects NewBook session lock dialog (idle timeout).

**Parameters:** None

**Returns:** None

**Usage Example:**
```javascript
// Called automatically on init
setupSessionLockDetection();
```

**Description:**
- Checks for `#locked_session_dialog` element
- Monitors dialog visibility (style.display)
- Sends `sessionLockChanged` message when lock state changes
- Uses MutationObserver to detect dialog appearance/removal
- Initial check on page load

---

#### `createOpenButton()`

Creates floating button to open sidepanel.

**Parameters:** None

**Returns:** None

**Usage Example:**
```javascript
// Called automatically on page load (1 second delay)
createOpenButton();
```

**Description:**
- Checks if button already exists
- Respects permanent dismissal (localStorage)
- Doesn't show if sidepanel already open
- Doesn't show if session is locked
- Creates gradient button with "Open Assistant" text
- Close button (×) permanently dismisses
- Main click opens sidepanel

---

#### `removeOpenButton()`

Removes the floating open button with fade animation.

**Parameters:** None

**Returns:** None

**Usage Example:**
```javascript
// Called when sidepanel opens
removeOpenButton();
```

---

### Settings Management

#### `loadSettings()`

Loads settings from chrome.storage.sync.

**Parameters:** None

**Returns:** `Promise<void>`

**Usage Example:**
```javascript
await loadSettings();
console.log(settings.enableDebugLogging);
```

**Description:**
- Fetches settings from chrome.storage.sync
- Updates module-level `settings` variable
- Used by debug logging utility

---

## background.js Functions

### Message Handling

#### `handleTabUpdate(tabId, url)`

Handles tab updates and navigation events.

**Parameters:**
- `tabId` (number): Chrome tab ID
- `url` (string): Current tab URL

**Returns:** `Promise<void>`

**Usage Example:**
```javascript
// Called automatically by tab listeners
await handleTabUpdate(12345, 'https://appeu.newbook.cloud/bookings_view/67890');
```

**Description:**
- Checks if URL is NewBook domain
- Enables sidepanel for NewBook tabs
- Sets badge indicator
- Detects booking pages from URL
- Stores current booking ID
- Forwards booking detection to sidepanel
- Disables sidepanel for non-NewBook tabs

---

### Tab Management

#### `loadSettings()`

Loads settings from chrome.storage.sync into background context.

**Parameters:** None

**Returns:** `Promise<Object>` - Settings object or null

**Usage Example:**
```javascript
const settings = await loadSettings();
console.log(settings.apiRootUrl);
```

---

#### `restoreSidepanelState()`

Restores sidepanel open/closed state from storage.

**Parameters:** None

**Returns:** `Promise<void>`

**Usage Example:**
```javascript
// Called on browser startup
await restoreSidepanelState();
```

**Description:**
- Fetches `sidepanelOpenTabs` from chrome.storage.local
- Restores Set of tab IDs with open sidepanels
- Used to track sidepanel state across browser restarts

---

### Settings Management

The background script listens for `settingsUpdated` messages and:
- Updates module-level settings variable
- Forwards message to sidepanel
- Triggers tab update for all NewBook tabs

---

## settings.js Functions

#### `loadSettings()`

Loads settings from chrome.storage.sync and populates form.

**Parameters:** None

**Returns:** `Promise<void>`

**Usage Example:**
```javascript
// Called on page load
await loadSettings();
```

**Description:**
- Fetches settings from chrome.storage.sync
- Populates all form inputs with current values
- Uses DEFAULT_SETTINGS as fallback

---

#### `saveSettings()`

Saves settings to chrome.storage.sync.

**Parameters:** None

**Returns:** `Promise<void>`

**Usage Example:**
```javascript
// Called on Save button click
await saveSettings();
```

**Description:**
- Validates all required fields
- Validates URL format (must be HTTPS)
- Validates numeric ranges
- Saves settings to chrome.storage.sync
- Sends `settingsUpdated` message to background script
- Shows success/error status message

---

#### `testConnection()`

Tests connection to WordPress REST API.

**Parameters:** None

**Returns:** `Promise<void>`

**Usage Example:**
```javascript
// Called on Test Connection button click
await testConnection();
```

**Description:**
- Validates API URL, username, password are set
- Makes GET request to `/summary` endpoint
- Shows success message if connection works
- Shows specific error messages for 401, 404, network errors
- Temporarily disables Test button during request

---

#### `showStatus(message, type = 'info')`

Shows status message in settings UI.

**Parameters:**
- `message` (string): Status message to display
- `type` (string, optional): Message type ('info', 'success', 'error'). Default: 'info'

**Returns:** None

**Usage Example:**
```javascript
showStatus('Settings saved successfully!', 'success');
showStatus('API URL is required', 'error');
```

**Description:**
- Updates status element text and class
- Auto-hides success messages after 5 seconds
- Keeps error/info messages visible

---

## Debug Logging

All modules use a consistent debug logging utility (`BMA_LOG`) that respects the `enableDebugLogging` setting:

```javascript
BMA_LOG.log('Debug message');     // Only logs if debug enabled
BMA_LOG.warn('Warning message');  // Only logs if debug enabled
BMA_LOG.error('Error message');   // Always logs (errors)
BMA_LOG.info('Info message');     // Only logs if debug enabled
```

---

## Common Patterns

### Async/Await Error Handling

```javascript
try {
  const data = await fetchOpeningHours('2025-01-31');
  // Process data
} catch (error) {
  BMA_LOG.error('Error fetching data:', error);
  // Show error UI
}
```

### Message Passing

```javascript
// Send message
chrome.runtime.sendMessage({
  action: 'bookingDetected',
  bookingId: '12345',
  url: window.location.href
}).catch(error => {
  BMA_LOG.log('Could not send message:', error);
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'bookingDetected') {
    handleBookingDetection(message.bookingId);
  }
  return true; // Keep channel open for async response
});
```

### Storage Access

```javascript
// Get from storage
const result = await chrome.storage.local.get('currentBookingId');
const bookingId = result.currentBookingId;

// Set to storage
await chrome.storage.local.set({ currentBookingId: '12345' });

// Sync storage (persists across devices)
await chrome.storage.sync.set({ settings: {...} });
```

---

## Next Steps

- See [MESSAGE_PASSING_REFERENCE.md](MESSAGE_PASSING_REFERENCE.md) for message types and flow
- See [STATE_MANAGEMENT.md](STATE_MANAGEMENT.md) for STATE object details
- See [ARCHITECTURE.md](ARCHITECTURE.md) for system architecture
- See [FUNCTION_CHEAT_SHEET.md](FUNCTION_CHEAT_SHEET.md) for quick reference
