# Architecture Overview

Comprehensive architecture documentation for the NewBook Assistant Chrome Extension.

---

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Component Architecture](#component-architecture)
- [File Structure](#file-structure)
- [Communication Patterns](#communication-patterns)
- [Data Flow](#data-flow)
- [Tab Management](#tab-management)
- [Settings and Configuration](#settings-and-configuration)
- [WordPress REST API Integration](#wordpress-rest-api-integration)
- [Extension Permissions](#extension-permissions)
- [Security Considerations](#security-considerations)
- [Performance Optimizations](#performance-optimizations)

---

## High-Level Overview

The NewBook Assistant is a Chrome Extension that provides a sidepanel interface for managing hotel bookings in the NewBook PMS system. It integrates with a WordPress REST API to provide restaurant reservation matching and booking management features.

### Key Features

- **Booking Detection** - Automatically detects when viewing a booking in NewBook
- **Restaurant Matching** - Suggests restaurant reservation matches for hotel bookings
- **Gantt Visualization** - Visual timeline of restaurant bookings
- **Check-in/out Summary** - Quick view of guest information and requirements
- **Staying Guests** - List of guests staying on a specific date
- **Planner Integration** - Single-click refresh from NewBook planner
- **Auto-refresh** - Configurable auto-refresh with inactivity detection

---

## Component Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         Chrome Browser                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────┐         ┌──────────────────┐           │
│  │  NewBook Page    │         │   Sidepanel UI   │           │
│  │  ───────────     │         │   ────────────   │           │
│  │                  │         │                  │           │
│  │  ┌────────────┐  │         │  ┌────────────┐  │           │
│  │  │  Content   │  │         │  │  sidepanel │  │           │
│  │  │  Script    │  │         │  │    .js     │  │           │
│  │  │            │  │         │  │            │  │           │
│  │  │  Detects:  │  │         │  │  Displays: │  │           │
│  │  │  - URLs    │  │         │  │  - Summary │  │           │
│  │  │  - Popups  │  │         │  │  - Rest.   │  │           │
│  │  │  - Planner │  │         │  │  - Checks  │  │           │
│  │  │  - Session │  │         │  │  - Staying │  │           │
│  │  └────────────┘  │         │  └────────────┘  │           │
│  └──────────────────┘         └──────────────────┘           │
│           │                             │                     │
│           │                             │                     │
│           └──────────┬──────────────────┘                     │
│                      │                                        │
│               ┌──────▼──────┐                                │
│               │  Background  │                                │
│               │   Service    │                                │
│               │   Worker     │                                │
│               │              │                                │
│               │  Routes:     │                                │
│               │  - Messages  │                                │
│               │  - Tab Evts  │                                │
│               │  - Settings  │                                │
│               └──────┬───────┘                                │
│                      │                                        │
│               ┌──────▼──────┐                                │
│               │   Storage    │                                │
│               │   ────────   │                                │
│               │  - local     │                                │
│               │  - sync      │                                │
│               └──────────────┘                                │
│                                                                │
└────────────────────────────────────────────────────────────────┘
                         │
                         │ HTTPS Requests
                         ▼
           ┌──────────────────────────┐
           │   WordPress REST API     │
           │   ───────────────────    │
           │                          │
           │  Endpoints:              │
           │  - /summary              │
           │  - /restaurant           │
           │  - /checks               │
           │  - /staying              │
           │  - /opening-hours        │
           │  - /available-times      │
           │  - /create-booking       │
           └──────────────────────────┘
```

---

## File Structure

```
chrome-newbook-assistant/
├── manifest.json                 # Extension manifest (MV3)
│
├── background.js                 # Service Worker
│   ├── Message routing
│   ├── Tab management
│   ├── Sidepanel control
│   └── Settings synchronization
│
├── content-script.js             # Injected into NewBook pages
│   ├── URL/popup detection
│   ├── Planner integration
│   ├── Session lock detection
│   └── Floating button
│
├── sidepanel/
│   ├── sidepanel.html           # Sidepanel UI
│   ├── sidepanel.js             # Sidepanel logic
│   │   ├── STATE management
│   │   ├── Tab switching
│   │   ├── API client
│   │   ├── Data fetching
│   │   ├── Gantt chart builder
│   │   └── Form handling
│   └── sidepanel.css            # Sidepanel styles
│
├── settings/
│   ├── settings.html            # Settings page UI
│   ├── settings.js              # Settings logic
│   │   ├── Form validation
│   │   ├── Storage management
│   │   └── Connection testing
│   └── settings.css             # Settings styles
│
├── icons/
│   ├── icon16.png               # Extension icon (16x16)
│   ├── icon48.png               # Extension icon (48x48)
│   ├── icon128.png              # Extension icon (128x128)
│   └── generate-icons.html      # Icon generator tool
│
└── docs/
    ├── FUNCTION_REFERENCE.md
    ├── MESSAGE_PASSING_REFERENCE.md
    ├── STATE_MANAGEMENT.md
    ├── ARCHITECTURE.md              # This file
    └── FUNCTION_CHEAT_SHEET.md
```

---

## Communication Patterns

### Pattern 1: Booking Detection

When a user navigates to a booking page:

```
1. User navigates to /bookings_view/12345
2. content-script.js detects URL pattern
3. Extracts booking ID: 12345
4. Stores in chrome.storage.local
5. Sends bookingDetected message to background.js
6. background.js forwards to sidepanel.js
7. sidepanel.js updates STATE.currentBookingId
8. sidepanel.js loads Restaurant tab data for booking 12345
```

### Pattern 2: Planner Single-Click

When a user single-clicks a booking in the planner:

```
1. User clicks booking block in planner
2. content-script.js detects click
3. Waits 250ms to detect double-click
4. If single-click confirmed:
   - Extracts booking ID from element
   - Sends plannerClick message to background.js
   - background.js forwards to sidepanel.js
   - sidepanel.js refreshes current tab with new booking
5. If double-click detected:
   - Cancels single-click action
   - Lets NewBook open full booking view
```

### Pattern 3: Settings Update

When a user saves settings:

```
1. User clicks "Save Settings" button
2. settings.js validates all fields
3. Saves to chrome.storage.sync
4. Sends settingsUpdated message to background.js
5. background.js:
   - Updates local settings cache
   - Forwards to content-script.js (all tabs)
   - Forwards to sidepanel.js
   - Triggers handleTabUpdate for all NewBook tabs
6. content-script.js updates settings cache
7. sidepanel.js:
   - Updates STATE.settings
   - Reinitializes API client with new credentials
   - Reloads current tab data
```

### Pattern 4: Auto-Refresh

Summary tab auto-refresh cycle:

```
1. User loads Summary tab
2. sidepanel.js starts refresh timer (based on summaryRefreshRate)
3. Timer fires after N seconds
4. Checks inactivity:
   - If user inactive > inactivityTimeout: pause refresh
   - If user active: continue
5. Fetches fresh summary data from API
6. Updates UI with new data
7. Updates lastSummaryUpdate timestamp
8. Restarts timer for next cycle
9. User interacts with page:
   - Updates lastSummaryInteraction
   - Resumes refresh if paused
```

---

## Data Flow

### Summary Tab Data Flow

```
User Opens Sidepanel
         │
         ▼
   switchTab('summary')
         │
         ▼
   loadSummaryTab()
         │
         ├─> Check cache
         │   └─> If cached & fresh: render from cache
         │
         └─> Fetch from API
             │
             ▼
       GET /summary?context=chrome-summary
             │
             ▼
       WordPress REST API
             │
             ▼
       {
         success: true,
         recent_bookings: [...],
         badges: { critical: N, warning: N },
         totals: {...}
       }
             │
             ▼
       Cache data (STATE.cache.summary)
       Update STATE.badges.summary
       Update STATE.lastSummaryUpdate
             │
             ▼
       Render UI
         - Recent bookings list
         - Badge counts
         - Last updated timestamp
             │
             ▼
       Start auto-refresh timer
```

### Restaurant Tab Data Flow

```
User Clicks Restaurant Tab
         │
         ▼
   switchTab('restaurant')
         │
         ▼
   loadRestaurantTab()
         │
         ├─> Check STATE.currentBookingId
         │   └─> If null: show "No booking selected"
         │
         └─> Fetch from API
             │
             ▼
       GET /restaurant?booking_id=12345&context=chrome-extension
             │
             ▼
       WordPress REST API
         │
         ├─> Query NewBook booking details
         ├─> Query restaurant bookings for date
         ├─> Match by guest name/room
         ├─> Calculate match scores
         └─> Return suggestions
             │
             ▼
       {
         success: true,
         booking: {...},
         date: '2025-01-31',
         suggestions: [...],
         opening_hours: [...],
         available_times: [...],
         all_bookings: [...]
       }
             │
             ▼
       Cache data (STATE.cache.restaurant)
       Update STATE.loadedBookingIds.restaurant
       Update STATE.lastRestaurantUpdate
             │
             ▼
       Render UI
         - Booking info card
         - Match suggestions
         - Gantt chart
         - Create booking form
         - Return to Summary button
             │
             ▼
       Process navigation context
         - Auto-scroll to date
         - Auto-expand form
         - Auto-expand comparison
```

### Create Booking Flow

```
User Fills Form & Clicks Create
         │
         ▼
   validateBookingForm()
         │
         ├─> Validate guest name
         ├─> Validate people count
         ├─> Validate time selected
         └─> Validate email/phone format
         │
         ▼
   submitCreateBooking()
         │
         ▼
   POST /create-booking
       {
         booking_id: 12345,
         date: '2025-01-31',
         time: '19:00',
         people: 4,
         opening_hour_id: 'abc123',
         guest_name: 'John Smith',
         room_number: '101',
         ...
       }
         │
         ▼
   WordPress REST API
         │
         ├─> Validate availability
         ├─> Create reservation
         └─> Return confirmation
         │
         ▼
   {
     success: true,
     booking_id: 67890,
     message: 'Booking created'
   }
         │
         ▼
   Show success message
   Clear form
   Reload restaurant tab (fresh data)
         │
         ▼
   User sees new booking in Gantt chart
```

---

## Tab Management

### Tab Lifecycle

Each tab follows a consistent lifecycle:

1. **Not Loaded** - Tab button visible but content not loaded
2. **Loading** - Spinner shown, data being fetched
3. **Loaded** - Content displayed, data cached
4. **Stale** - Data older than threshold, needs refresh
5. **Refreshing** - Updating with fresh data

### Tab Switching Logic

```javascript
function switchTab(tabName) {
  // 1. Save current scroll position
  STATE.scrollPositions[STATE.currentTab] = currentScrollTop;

  // 2. Update active tab
  STATE.currentTab = tabName;

  // 3. Update UI (hide old, show new)
  hideAllTabContents();
  showTabContent(tabName);

  // 4. Update navigation badges
  updateBadges();

  // 5. Load tab content if needed
  if (!isTabLoaded(tabName) || needsRefresh(tabName)) {
    loadTabContent(tabName);
  } else {
    // Restore scroll position
    restoreScrollPosition(tabName);
  }

  // 6. Reset inactivity timer
  resetInactivityTimer();
}
```

### Tab Loading Strategy

**Summary Tab:**
- Auto-loads on sidepanel open
- Auto-refreshes every N seconds (configurable)
- Pauses on inactivity
- Always shows latest data

**Restaurant Tab:**
- Loads when tab selected OR booking detected
- Requires booking ID to be set
- Caches data per booking ID
- Force refreshes on booking ID change

**Checks Tab:**
- Loads when tab selected
- Requires booking ID to be set
- Caches data per booking ID
- Force refreshes on booking ID change

**Staying Tab:**
- Loads when tab selected
- Loads for current date by default
- Caches data per date
- Date navigation triggers refresh

---

## Settings and Configuration

### Settings Storage

Settings are stored in `chrome.storage.sync` for cross-device synchronization:

```javascript
{
  settings: {
    // API Configuration
    apiRootUrl: 'https://admin.hotelnumberfour.com/wp-json/bma/v1',
    username: 'admin',
    applicationPassword: 'xxxx xxxx xxxx xxxx',

    // UI Settings
    enableSidebarOnNewBook: true,        // Auto-enable sidepanel on NewBook tabs
    recentBookingsCount: 10,             // Number of recent bookings to show (1-50)

    // Auto-Refresh Settings
    summaryRefreshRate: 60,              // Auto-refresh interval in seconds (10-300)
    inactivityTimeout: 60,               // Pause after N seconds idle (10-600)
    pauseInactivityWhenFormOpen: true,   // Pause when create form is open

    // Planner Integration
    enablePlannerClickUpdate: true,      // Enable single-click refresh from planner

    // Display Settings
    highlightNewestMinutes: 60,          // Highlight bookings created in last N minutes
    cancelledHours: 24,                  // Show cancelled bookings from last N hours
    includeFlaggedCancelled: true,       // Include flagged cancelled bookings

    // Cache Settings
    autoRefreshOnStaleCache: true,       // Auto-refresh stale cached data
    autoRefreshPauseIdleMinutes: 5,      // Pause stale refresh if idle > N minutes

    // Debug
    enableDebugLogging: false            // Enable console debug logs
  }
}
```

### Default Settings

Defined in `settings.js`:

```javascript
const DEFAULT_SETTINGS = {
  apiRootUrl: '',
  username: '',
  applicationPassword: '',
  enableSidebarOnNewBook: true,
  recentBookingsCount: 10,
  summaryRefreshRate: 60,
  enablePlannerClickUpdate: true,
  highlightNewestMinutes: 60,
  inactivityTimeout: 60,
  pauseInactivityWhenFormOpen: true,
  autoRefreshOnStaleCache: true,
  autoRefreshPauseIdleMinutes: 5,
  cancelledHours: 24,
  includeFlaggedCancelled: true,
  enableDebugLogging: false
};
```

### Settings Validation

Settings are validated on save:

- **apiRootUrl**: Must be valid HTTPS URL
- **username**: Required, non-empty string
- **applicationPassword**: Required, non-empty string
- **recentBookingsCount**: 1-50
- **summaryRefreshRate**: 10-300 seconds
- **highlightNewestMinutes**: 0-1440 minutes
- **inactivityTimeout**: 10-600 seconds

---

## WordPress REST API Integration

### API Client

The sidepanel initializes an API client with credentials:

```javascript
window.apiClient = {
  baseUrl: settings.apiRootUrl,
  authHeader: 'Basic ' + btoa(settings.username + ':' + settings.applicationPassword)
};
```

### API Endpoints

All endpoints under `/wp-json/bma/v1`:

#### GET `/summary`

Returns summary of recent bookings.

**Query Parameters:**
- `context`: 'chrome-summary' (identifies request source)

**Response:**
```json
{
  "success": true,
  "recent_bookings": [
    {
      "id": 12345,
      "guest_name": "John Smith",
      "room": "101",
      "checkin": "2025-01-31",
      "checkout": "2025-02-02",
      "status": "confirmed",
      "created": "2025-01-30T15:30:00",
      "flags": ["restaurant_match", "dietary_requirements"]
    }
  ],
  "badges": {
    "critical": 2,
    "warning": 5
  },
  "totals": {
    "arrivals": 10,
    "departures": 8,
    "in_house": 50
  }
}
```

---

#### GET `/restaurant`

Returns restaurant suggestions for a booking.

**Query Parameters:**
- `booking_id`: NewBook booking ID
- `context`: 'chrome-extension'

**Response:**
```json
{
  "success": true,
  "booking": {
    "id": 12345,
    "guest_name": "John Smith",
    "room": "101",
    "checkin": "2025-01-31",
    "checkout": "2025-02-02"
  },
  "date": "2025-01-31",
  "suggestions": [
    {
      "id": 67890,
      "time": "19:00",
      "people": 4,
      "guest_name": "Smith",
      "match_score": 95,
      "match_reasons": ["name_match", "room_match"]
    }
  ],
  "opening_hours": [
    {
      "id": "abc123",
      "name": "Dinner",
      "open": 1800,
      "close": 2200,
      "interval": 15,
      "duration": 120
    }
  ],
  "available_times": ["18:00", "18:15", "18:30"],
  "all_bookings": [...]
}
```

---

#### GET `/checks`

Returns check-in/out data for a booking.

**Query Parameters:**
- `booking_id`: NewBook booking ID
- `context`: 'chrome-extension'

**Response:**
```json
{
  "success": true,
  "booking": {
    "id": 12345,
    "guest_name": "John Smith",
    "room": "101",
    "checkin": "2025-01-31",
    "checkout": "2025-02-02",
    "adults": 2,
    "children": 0
  },
  "dietary_requirements": ["Vegetarian", "Gluten-free"],
  "special_requests": "Early check-in",
  "room_ready": true
}
```

---

#### GET `/staying`

Returns guests staying on a specific date.

**Query Parameters:**
- `date`: YYYY-MM-DD
- `context`: 'chrome-extension'

**Response:**
```json
{
  "success": true,
  "date": "2025-01-31",
  "guests": [
    {
      "booking_id": 12345,
      "guest_name": "John Smith",
      "room": "101",
      "checkin": "2025-01-31",
      "checkout": "2025-02-02",
      "adults": 2,
      "children": 0
    }
  ]
}
```

---

#### GET `/opening-hours`

Returns restaurant opening hours.

**Query Parameters:**
- `date`: YYYY-MM-DD (optional)
- `context`: 'chrome-extension'

**Response:**
```json
{
  "success": true,
  "opening_hours": [
    {
      "id": "abc123",
      "name": "Dinner",
      "open": 1800,
      "close": 2200,
      "interval": 15,
      "duration": 120
    }
  ],
  "special_events": [
    {
      "name": "Private Event",
      "open": 1900,
      "close": 2100
    }
  ]
}
```

---

#### POST `/available-times`

Returns available booking times for a date and party size.

**Request Body:**
```json
{
  "date": "2025-01-31",
  "people": 4,
  "opening_hour_id": "abc123",
  "context": "chrome-extension"
}
```

**Response:**
```json
{
  "success": true,
  "times": ["18:00", "18:15", "18:30", "19:00"]
}
```

---

#### POST `/create-booking`

Creates a new restaurant booking.

**Request Body:**
```json
{
  "booking_id": 12345,
  "date": "2025-01-31",
  "time": "19:00",
  "people": 4,
  "opening_hour_id": "abc123",
  "guest_name": "John Smith",
  "email": "john@example.com",
  "phone": "123-456-7890",
  "room_number": "101",
  "dietary_requirements": [1, 2],
  "special_requests": "Window seat",
  "context": "chrome-extension"
}
```

**Response:**
```json
{
  "success": true,
  "booking_id": 67890,
  "message": "Booking created successfully"
}
```

---

### API Error Handling

All API functions use try/catch and display user-friendly errors:

```javascript
try {
  const response = await fetch(url, options);

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication failed. Check settings.');
    } else if (response.status === 404) {
      throw new Error('API endpoint not found.');
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.message || 'API request failed');
  }

  return data;
} catch (error) {
  BMA_LOG.error('API Error:', error);
  showErrorMessage(error.message);
  throw error;
}
```

---

## Extension Permissions

Defined in `manifest.json`:

### Required Permissions

- **sidePanel** - Enable side panel API
- **storage** - Access chrome.storage API
- **tabs** - Query tab information
- **webNavigation** - Detect SPA navigation
- **cookies** - Check NewBook authentication status

### Host Permissions

- `https://appeu.newbook.cloud/*` - NewBook PMS
- `https://login.newbook.cloud/*` - NewBook login
- `https://admin.hotelnumberfour.com/*` - WordPress API (production)
- `https://n4admindev.pterois.co.uk/*` - WordPress API (development)

---

## Security Considerations

### 1. Credential Storage

- Application password stored in `chrome.storage.sync` (encrypted by Chrome)
- Never logged to console (unless debug mode enabled)
- Transmitted over HTTPS only

### 2. Content Script Isolation

- Content script runs in isolated world
- Cannot access page JavaScript
- Uses message passing for communication

### 3. API Authentication

- Basic authentication with application password
- HTTPS required for all API requests
- WordPress application passwords are revocable

### 4. Input Validation

- All user inputs validated before submission
- Email/phone format validation
- Numeric range validation for settings
- URL format validation

### 5. XSS Prevention

- All dynamic content sanitized before rendering
- HTML entities escaped in user-generated content
- No `eval()` or `innerHTML` with user data

---

## Performance Optimizations

### 1. Caching Strategy

- Cache API responses per tab
- Invalidate cache on booking ID change
- Stale cache auto-refresh (configurable)
- Prevents redundant API calls on tab switching

### 2. Lazy Loading

- Tabs load content only when selected
- Available times lazy-loaded when period expanded
- Gantt chart built on-demand

### 3. Debouncing

- MutationObserver debounced (100ms)
- Planner click detection debounced (250ms)
- URL change detection throttled (500ms)

### 4. Efficient DOM Updates

- Batch DOM updates
- Use DocumentFragment for list rendering
- Minimize reflows with `display: none` toggle

### 5. Memory Management

- Clear timers on component unmount
- Remove event listeners on cleanup
- Limit cache size (single booking per tab)

### 6. Network Optimization

- Concurrent requests for independent data
- Request cancellation for outdated requests
- Retry logic with exponential backoff

---

## Browser Compatibility

### Chrome Version Requirements

- **Minimum:** Chrome 116+ (Manifest V3 support)
- **Recommended:** Latest stable Chrome

### API Dependencies

- Chrome Extension APIs (Manifest V3)
- Side Panel API (Chrome 114+)
- Chrome Storage API
- Chrome Tabs API
- Chrome Web Navigation API
- Chrome Cookies API

---

## Development Workflow

### Local Development

1. Clone repository
2. Open Chrome Extensions (`chrome://extensions`)
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select extension directory

### Testing

1. Navigate to NewBook page
2. Open sidepanel (click extension icon)
3. Test booking detection
4. Test tab switching
5. Test API integration
6. Test form submission

### Debugging

- **Background Console:** Right-click icon → "Inspect service worker"
- **Content Script:** Regular page DevTools
- **Sidepanel:** Right-click sidepanel → "Inspect"
- **Enable Debug Logging:** Settings → Enable Debug Logging

---

## Error Handling

### Error Categories

1. **Network Errors** - API unreachable, timeout
2. **Authentication Errors** - Invalid credentials
3. **Validation Errors** - Invalid form input
4. **API Errors** - Server-side errors
5. **Extension Errors** - Chrome API failures

### Error Display

- Toast notifications for transient errors
- Inline form feedback for validation errors
- Full-page error for critical failures (auth)
- Console logging for debugging

---

## Future Enhancements

### Planned Features

- Offline mode with service worker caching
- Push notifications for critical updates
- Bulk booking operations
- Advanced filtering and search
- Export functionality (PDF, CSV)
- Multi-property support

### Architectural Improvements

- TypeScript migration
- Component-based UI framework (React/Vue)
- State management library (Redux/Zustand)
- Unit testing (Jest)
- E2E testing (Playwright)

---

## Next Steps

- See [FUNCTION_REFERENCE.md](FUNCTION_REFERENCE.md) for detailed function documentation
- See [MESSAGE_PASSING_REFERENCE.md](MESSAGE_PASSING_REFERENCE.md) for message protocols
- See [STATE_MANAGEMENT.md](STATE_MANAGEMENT.md) for state patterns
- See [FUNCTION_CHEAT_SHEET.md](FUNCTION_CHEAT_SHEET.md) for quick reference
