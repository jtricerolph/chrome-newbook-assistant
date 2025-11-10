# Chrome NewBook Assistant - JavaScript Functions Reference

Complete reference for all JavaScript functions in the NewBook Assistant Chrome extension.

## File: sidepanel.js

Current file size: 1,698 lines
Location: `chrome-newbook-assistant/sidepanel/sidepanel.js`

---

## Global State Management

### STATE Object

**Purpose:** Central state management for the extension

**Location:** Lines 2-29

**Structure:**
```javascript
const STATE = {
  currentTab: 'summary',                    // Active tab
  currentBookingId: null,                   // Selected hotel booking ID
  settings: null,                           // API settings
  badges: {
    summary: { critical: 0, warning: 0 },
    restaurant: { critical: 0, warning: 0 },
    checks: { critical: 0, warning: 0 }
  },
  timers: {
    summaryRefresh: null,
    summaryCountdown: null,
    inactivityTimeout: null
  },
  cache: {
    summary: null,
    restaurant: null,
    checks: null
  },
  newbookAuth: {
    isAuthenticated: false,
    checking: false
  },
  lastSummaryInteraction: Date.now(),
  lastSummaryUpdate: null,
  sessionLocked: false,
  createFormOpen: false,

  // NEW: Navigation context (TO BE ADDED)
  navigationContext: {
    returnTab: null,           // Tab to return to after action
    returnBookingId: null,     // Booking ID to re-expand
    targetDate: null,          // Date to scroll to in Restaurant tab
    expandCreateForm: false,   // Whether to auto-expand create form
    scrollAfterLoad: false     // Whether to scroll after load
  },

  // NEW: Scroll positions (TO BE ADDED)
  scrollPositions: {
    summary: 0,
    restaurant: 0,
    checks: 0
  }
};
```

**Usage:**
```javascript
// Get current tab
const currentTab = STATE.currentTab;

// Update booking ID
STATE.currentBookingId = '12345';

// Store navigation context
STATE.navigationContext.returnTab = 'summary';
STATE.navigationContext.targetDate = '2025-01-15';
```

---

## Navigation Functions (TO BE IMPLEMENTED)

### navigateToRestaurantDate(date, bookingId)

**Purpose:** Navigate to Restaurant tab with specific date pre-selected and form expanded

**Parameters:**
- `date` (string, required): Date in YYYY-MM-DD format
- `bookingId` (string, optional): Hotel booking ID to set as current

**Returns:** void

**Implementation:**
```javascript
function navigateToRestaurantDate(date, bookingId = null) {
  console.log('Navigating to Restaurant tab for date:', date);

  // Store navigation context
  STATE.navigationContext = {
    returnTab: STATE.currentTab,
    returnBookingId: STATE.currentBookingId,
    targetDate: date,
    expandCreateForm: true,
    scrollAfterLoad: true
  };

  // Set current booking ID if provided
  if (bookingId) {
    STATE.currentBookingId = bookingId;
    // Also store in chrome.storage for persistence
    chrome.storage.local.set({ currentBookingId: bookingId });
  }

  // Switch to restaurant tab (triggers loadRestaurantTab)
  switchTab('restaurant');
}
```

**Usage Example:**
```javascript
// From Summary tab - user clicks "Create Booking"
document.addEventListener('click', function(e) {
  const createLink = e.target.closest('.bma-create-booking-link');
  if (createLink) {
    e.preventDefault();
    const date = createLink.dataset.date;
    const bookingId = createLink.dataset.bookingId;
    navigateToRestaurantDate(date, bookingId);
  }
});
```

---

### returnToPreviousContext()

**Purpose:** Return to previous tab/state after completing an action

**Parameters:** None

**Returns:** void

**Implementation:**
```javascript
function returnToPreviousContext() {
  const context = STATE.navigationContext;

  if (!context.returnTab) {
    console.log('No return context available');
    return;
  }

  console.log('Returning to:', context.returnTab);

  if (context.returnTab === 'summary') {
    // Switch back to summary tab
    switchTab('summary');

    // Re-expand booking if it was expanded
    if (context.returnBookingId) {
      setTimeout(() => {
        const bookingCard = document.querySelector(`[data-booking-id="${context.returnBookingId}"]`);
        if (bookingCard && !bookingCard.classList.contains('expanded')) {
          const header = bookingCard.querySelector('.booking-header');
          if (header) header.click();
        }

        // Scroll to booking
        if (bookingCard) {
          bookingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);
    }
  } else if (context.returnTab === 'restaurant') {
    // Reload restaurant tab to show new booking
    loadRestaurantTab();

    // Scroll back to the date section
    if (context.targetDate) {
      setTimeout(() => {
        const dateSection = document.getElementById(`date-section-${context.targetDate}`);
        if (dateSection) {
          dateSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
    }
  }

  // Clear navigation context
  STATE.navigationContext = {
    returnTab: null,
    returnBookingId: null,
    targetDate: null,
    expandCreateForm: false,
    scrollAfterLoad: false
  };
}
```

**Usage Example:**
```javascript
// After successful booking creation
if (result.success) {
  showToast('✓ Booking created!', 'success');
  setTimeout(() => {
    returnToPreviousContext();
  }, 1500);
}
```

---

### processNavigationContext()

**Purpose:** Execute navigation actions after Restaurant tab loads

**Parameters:** None

**Returns:** void

**Implementation:**
```javascript
function processNavigationContext() {
  const context = STATE.navigationContext;

  if (!context.scrollAfterLoad || !context.targetDate) {
    return;
  }

  console.log('Processing navigation context for date:', context.targetDate);

  // Find the date section
  const dateSection = document.getElementById(`date-section-${context.targetDate}`);
  if (!dateSection) {
    console.warn('Date section not found:', context.targetDate);
    return;
  }

  // Scroll to date section
  dateSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Expand create form if requested
  if (context.expandCreateForm) {
    setTimeout(() => {
      const formId = `create-form-${context.targetDate}`;
      const form = document.getElementById(formId);
      const btn = document.getElementById(`create-btn-${context.targetDate}`);
      const status = document.getElementById(`status-${context.targetDate}`);

      if (form) {
        form.style.display = 'block';
        if (btn) btn.style.display = 'none';
        if (status) status.style.display = 'none';
        STATE.createFormOpen = true;

        // Scroll form into view
        setTimeout(() => {
          form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
    }, 500);
  }

  // Mark as processed
  context.scrollAfterLoad = false;
}
```

**Integration:**
Add to `loadRestaurantTab()` after content loads:
```javascript
async function loadRestaurantTab() {
  // ... existing code ...

  if (data.success && data.html) {
    showData('restaurant', data.html);
    updateBadge('restaurant', data.critical_count || 0, data.warning_count || 0);
    STATE.cache.restaurant = data;

    // NEW: Process navigation context
    setTimeout(() => {
      processNavigationContext();
    }, 200);
  }
}
```

---

### Enhanced switchTab(tabName) - TO BE MODIFIED

**Current Location:** Lines 1187-1220

**Modifications Needed:**
```javascript
function switchTab(tabName) {
  // NEW: Store current scroll position before switching
  const currentContent = document.querySelector('.tab-content.active');
  if (currentContent && STATE.currentTab) {
    STATE.scrollPositions[STATE.currentTab] = currentContent.scrollTop;
  }

  // Update state
  STATE.currentTab = tabName;

  // Update UI - toggle active classes
  document.querySelectorAll('.tab-button').forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    if (content.dataset.content === tabName) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  // Load tab content
  if (tabName === 'summary') {
    loadSummaryTab();
    resetInactivityTimer();
  } else if (tabName === 'restaurant') {
    loadRestaurantTab();
    startInactivityTimer();
  } else if (tabName === 'checks') {
    loadChecksTab();
    startInactivityTimer();
  }

  // NEW: Restore scroll position after content loads
  setTimeout(() => {
    const newContent = document.querySelector('.tab-content.active');
    if (newContent && STATE.scrollPositions[tabName]) {
      newContent.scrollTop = STATE.scrollPositions[tabName];
    }
  }, 100);
}
```

---

## Gantt Chart Functions (TO BE IMPLEMENTED)

### scrollGanttToTime(date, time, smooth)

**Purpose:** Scroll Gantt viewport to center on specific time

**Parameters:**
- `date` (string, required): Date identifier (YYYY-MM-DD)
- `time` (string, required): Time in HHMM format (e.g., "1900")
- `smooth` (boolean, optional): Use smooth scrolling, default true

**Returns:** void

**Implementation:**
```javascript
function scrollGanttToTime(date, time, smooth = true) {
  const viewport = document.getElementById(`gantt-${date}`);
  if (!viewport) {
    console.warn('Gantt viewport not found:', date);
    return;
  }

  // Convert HHMM to minutes since midnight
  const timeMinutes = parseInt(time.substring(0, 2)) * 60 + parseInt(time.substring(2, 4));

  // Calculate scroll position to center this time in viewport
  const viewportWidth = viewport.clientWidth;
  const totalDayMinutes = 24 * 60;
  const scrollPercentage = timeMinutes / totalDayMinutes;
  const scrollPosition = (viewport.scrollWidth * scrollPercentage) - (viewportWidth / 2);

  viewport.scrollTo({
    left: scrollPosition,
    behavior: smooth ? 'smooth' : 'auto'
  });
}
```

**Usage:**
```javascript
// Scroll to 7:00 PM smoothly
scrollGanttToTime('2025-01-15', '1900', true);

// Jump to 6:30 PM instantly
scrollGanttToTime('2025-01-15', '1830', false);
```

---

### scrollGanttViewport(date, minutes)

**Purpose:** Scroll Gantt viewport by relative amount (for arrow buttons)

**Parameters:**
- `date` (string, required): Date identifier
- `minutes` (number, required): Minutes to scroll (negative = left, positive = right)

**Returns:** void

**Implementation:**
```javascript
function scrollGanttViewport(date, minutes) {
  const viewport = document.getElementById(`gantt-${date}`);
  if (!viewport) return;

  const pixelsPerMinute = viewport.scrollWidth / (24 * 60);
  const scrollAmount = minutes * pixelsPerMinute;

  viewport.scrollBy({
    left: scrollAmount,
    behavior: 'smooth'
  });
}
```

**Usage:**
```javascript
// Scroll left 1 hour
scrollGanttViewport('2025-01-15', -60);

// Scroll right 30 minutes
scrollGanttViewport('2025-01-15', 30);
```

---

### showGanttSightLine(date, time)

**Purpose:** Display vertical sight line on Gantt at specific time

**Parameters:**
- `date` (string, required): Date identifier
- `time` (string, required): Time in HHMM format

**Returns:** void

**Implementation:**
```javascript
function showGanttSightLine(date, time) {
  const viewport = document.getElementById(`gantt-${date}`);
  if (!viewport) return;

  // Create or update sight line element
  let sightLine = viewport.querySelector('.gantt-sight-line');
  if (!sightLine) {
    sightLine = document.createElement('div');
    sightLine.className = 'gantt-sight-line';
    sightLine.style.cssText = 'position: absolute; top: 0; width: 2px; background: #ef4444; z-index: 100; pointer-events: none;';
    viewport.appendChild(sightLine);
  }

  // Position at time
  const timeMinutes = parseInt(time.substring(0, 2)) * 60 + parseInt(time.substring(2, 4));
  const leftPercentage = (timeMinutes / (24 * 60)) * 100;
  sightLine.style.left = leftPercentage + '%';
  sightLine.style.display = 'block';

  // Get viewport height
  const height = viewport.querySelector('.gantt-bookings')?.offsetHeight || viewport.offsetHeight;
  sightLine.style.height = height + 'px';
}
```

---

### hideGanttSightLine(date)

**Purpose:** Hide the Gantt sight line

**Parameters:**
- `date` (string, required): Date identifier

**Returns:** void

**Implementation:**
```javascript
function hideGanttSightLine(date) {
  const viewport = document.getElementById(`gantt-${date}`);
  if (!viewport) return;

  const sightLine = viewport.querySelector('.gantt-sight-line');
  if (sightLine) {
    sightLine.style.display = 'none';
  }
}
```

---

### initializeGanttChart(date)

**Purpose:** Initialize Gantt chart controls and interactions

**Parameters:**
- `date` (string, required): Date identifier

**Returns:** void

**Implementation:**
```javascript
function initializeGanttChart(date) {
  const container = document.getElementById(`gantt-container-${date}`);
  if (!container) return;

  // Attach scroll button handlers
  const scrollButtons = container.querySelectorAll('.gantt-scroll-btn');
  scrollButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const direction = this.dataset.direction;
      const scrollAmount = direction === 'left' ? -60 : 60; // 1 hour
      scrollGanttViewport(date, scrollAmount);
    });
  });

  console.log('Gantt chart initialized for date:', date);
}
```

---

## Service Period Accordion Functions

### togglePeriodSection(date, periodIndex) - IMPLEMENTED

**Actual Location:** Lines 382-442 (in sidepanel.js)

**Purpose:** Toggle service period accordion section (expand/collapse) with exclusive behavior

**Parameters:**
- `date` (string, required): Date for the form
- `periodIndex` (number, required): Index of the period section to toggle

**Returns:** Promise<void>

**Behavior:**
- **Exclusive accordion**: When expanding a section, all other sections are collapsed first
- Only one period section can be open at a time
- Lazy loads available times when section is first expanded
- Updates collapse icons (▶ when collapsed, ▼ when expanded)

**Implementation:**
```javascript
async function togglePeriodSection(date, periodIndex) {
  const sectionsContainer = document.getElementById('service-period-sections-' + date);
  const allHeaders = sectionsContainer.querySelectorAll('.period-header');
  const allTimes = sectionsContainer.querySelectorAll('.period-times');
  const clickedHeader = sectionsContainer.querySelector(`.period-header[data-period-index="${periodIndex}"]`);
  const clickedTimes = sectionsContainer.querySelector(`.period-times[data-period-index="${periodIndex}"]`);

  const isCurrentlyExpanded = clickedHeader.classList.contains('expanded');

  if (isCurrentlyExpanded) {
    // Collapse it
    clickedHeader.classList.remove('expanded');
    clickedTimes.style.display = 'none';
    const icon = clickedHeader.querySelector('.collapse-icon');
    if (icon) icon.textContent = '▶';
  } else {
    // First, collapse all other sections (only one open at a time)
    allHeaders.forEach(header => {
      header.classList.remove('expanded');
      const icon = header.querySelector('.collapse-icon');
      if (icon) icon.textContent = '▶';
    });
    allTimes.forEach(times => {
      times.style.display = 'none';
    });

    // Then expand the clicked section
    clickedHeader.classList.add('expanded');
    clickedTimes.style.display = 'flex';
    const icon = clickedHeader.querySelector('.collapse-icon');
    if (icon) icon.textContent = '▼';

    // Check if times need to be loaded (lazy loading)
    const needsLoading = clickedTimes.innerHTML.includes('Loading available times...');
    if (needsLoading) {
      const periodId = clickedHeader.dataset.periodId;
      const form = document.getElementById('create-form-' + date);
      const people = form ? parseInt(form.querySelector('.form-people').value) || 2 : 2;
      await loadAvailableTimesForPeriod(date, people, periodId, periodIndex);
    }
  }
}
```

**Exposed to window:** `window.togglePeriodSection = togglePeriodSection;`

---

### loadAvailableTimesForPeriod(date, people, periodId, periodIndex) - IMPLEMENTED

**Actual Location:** Lines 1249-1304 (in sidepanel.js)

**Purpose:** Lazy load available time slots for a specific service period

**Parameters:**
- `date` (string, required): Date for the booking
- `people` (number, required): Party size
- `periodId` (string, required): Opening hour period ID
- `periodIndex` (number, required): Index of the period section

**Returns:** Promise<void>

**Behavior:**
- Fetches available times from WordPress API for specific period
- Populates period section with time slot buttons (without period headers)
- Adds click handlers to time slot buttons
- **Automatically captures period ID** when time slot clicked
- Updates booking summary header with selected time

**Implementation:**
```javascript
async function loadAvailableTimesForPeriod(date, people, periodId, periodIndex) {
  try {
    const timesData = await fetchAvailableTimes(date, people, periodId);
    const sectionsContainer = document.getElementById('service-period-sections-' + date);
    const periodTimes = sectionsContainer.querySelector(`.period-times[data-period-index="${periodIndex}"]`);

    if (timesData.success && timesData.html) {
      periodTimes.innerHTML = timesData.html;

      // Add click handlers to time slot buttons
      const timeButtons = periodTimes.querySelectorAll('.time-slot-btn');
      timeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
          // Remove selected class from ALL buttons
          const allButtons = sectionsContainer.querySelectorAll('.time-slot-btn');
          allButtons.forEach(b => b.classList.remove('selected'));
          // Mark clicked button as selected
          this.classList.add('selected');

          // Update hidden time field
          const timeValue = this.dataset.time || this.textContent.trim();
          document.getElementById('time-selected-' + date).value = timeValue;

          // Update hidden opening hour ID field
          const openingHourIdField = document.getElementById('opening-hour-id-' + date);
          if (openingHourIdField) {
            openingHourIdField.value = periodId;
          }

          // Update booking time display in summary header
          const bookingTimeDisplay = document.getElementById('booking-time-display-' + date);
          if (bookingTimeDisplay) {
            const displayTime = this.textContent.trim();
            bookingTimeDisplay.textContent = displayTime;
          }
        });
      });
    }
  } catch (error) {
    console.error('Error loading available times:', error);
  }
}
```

**Exposed to window:** `window.loadAvailableTimesForPeriod = loadAvailableTimesForPeriod;`

---

## Form Functions (TO BE IMPLEMENTED)

### toggleFormSection(sectionId)

**Purpose:** Expand/collapse collapsible form sections

**Parameters:**
- `sectionId` (string, required): ID of section content to toggle

**Returns:** void

**Implementation:**
```javascript
function toggleFormSection(sectionId) {
  const section = document.getElementById(sectionId);
  const toggle = document.querySelector(`[data-target="${sectionId}"]`);

  if (!section || !toggle) {
    console.warn('Section or toggle not found:', sectionId);
    return;
  }

  const isHidden = section.style.display === 'none';
  section.style.display = isHidden ? 'block' : 'none';

  const icon = toggle.querySelector('.material-symbols-outlined');
  if (icon) {
    icon.textContent = isHidden ? 'expand_less' : 'expand_more';
  }
}
```

**Event Delegation:**
```javascript
// Add to initialization
document.addEventListener('click', function(e) {
  const toggle = e.target.closest('.bma-section-toggle');
  if (toggle) {
    const targetId = toggle.dataset.target;
    toggleFormSection(targetId);
  }
});
```

---

### validateBookingForm(formData)

**Purpose:** Validate booking form data before submission

**Parameters:**
- `formData` (object, required): Form data object

**Returns:** `{valid: boolean, errors: string[]}`

**Implementation:**
```javascript
function validateBookingForm(formData) {
  const errors = [];

  // Required fields
  if (!formData.guest_name || formData.guest_name.trim() === '') {
    errors.push('Guest name is required');
  }

  if (!formData.time || formData.time === '') {
    errors.push('Please select a time slot');
  }

  if (!formData.people || formData.people < 1) {
    errors.push('Party size must be at least 1');
  }

  if (!formData.opening_hour_id || formData.opening_hour_id === '') {
    errors.push('Please select a service period');
  }

  // Optional field validation
  if (formData.email && !isValidEmail(formData.email)) {
    errors.push('Invalid email format');
  }

  if (formData.phone && formData.phone.length > 0 && formData.phone.length < 10) {
    errors.push('Phone number too short');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
```

**Usage:**
```javascript
const validation = validateBookingForm(formData);
if (!validation.valid) {
  showFeedback(feedback, 'Errors: ' + validation.errors.join(', '), 'error');
  return;
}
```

---

### submitCreateBooking(date) - IMPLEMENTED

**Actual Location:** Lines 927-1035+ (in sidepanel.js)

**Implementation:**
```javascript
async function submitCreateBooking(date) {
  // Prevent duplicate submissions
  if (createProcessing) {
    console.log('Create operation already in progress, ignoring');
    return;
  }

  const formId = 'create-form-' + date;
  const form = document.getElementById(formId);
  if (!form) return;

  // Validate basic fields
  if (!validateBookingForm(formId)) {
    console.log('Form validation failed');
    return;
  }

  const feedbackId = 'feedback-create-' + date;
  const feedback = document.getElementById(feedbackId);

  // Collect dietary requirements from checkboxes
  const dietaryCheckboxes = form.querySelectorAll('.diet-checkbox:checked');
  const dietaryChoiceIds = Array.from(dietaryCheckboxes)
    .map(cb => cb.dataset.choiceId)
    .join(',');

  // Get time from hidden field (populated by time slot button click)
  const timeField = form.querySelector('.form-time-selected') || document.getElementById('time-selected-' + date);
  const timeValue = timeField ? timeField.value : '';

  if (!timeValue) {
    showFeedback(feedback, 'Please select a time slot', 'error');
    return;
  }

  // Get opening hour ID from hidden field (populated when time slot button clicked)
  const openingHourIdField = form.querySelector('.form-opening-hour-id') || document.getElementById('opening-hour-id-' + date);
  const openingHourId = openingHourIdField ? openingHourIdField.value : '';

  if (!openingHourId) {
    showFeedback(feedback, 'Please select a time slot from a service period', 'error');
    return;
  }

  // Collect form data using class selectors
  const formData = {
    date: date,
    time: timeValue,
    people: parseInt(form.querySelector('.form-people').value),
    guest_name: form.querySelector('.form-guest-name').value,
    opening_hour_id: openingHourId
  };

  // Add optional fields if present
  const phoneField = form.querySelector('.form-phone');
  if (phoneField && phoneField.value) {
    formData.guest_phone = phoneField.value;
  }

  const emailField = form.querySelector('.form-email');
  if (emailField && emailField.value) {
    formData.guest_email = emailField.value;
  }

  const hotelGuestField = form.querySelector('.form-hotel-guest');
  if (hotelGuestField) {
    formData.hotel_guest = hotelGuestField.checked ? 'Yes' : 'No';
  }

  const dbbField = form.querySelector('.form-dbb');
  if (dbbField) {
    formData.dbb = dbbField.checked ? 'Yes' : 'No';
  }

  const dietOtherField = form.querySelector('.form-diet-other');
  if (dietOtherField && dietOtherField.value) {
    formData.dietary_other = dietOtherField.value;
  }

  const noteField = form.querySelector('.form-booking-note');
  if (noteField && noteField.value) {
    formData.booking_note = noteField.value;
  }

  // Add dietary requirements if any selected
  if (dietaryChoiceIds) {
    formData.dietary_requirements = dietaryChoiceIds;
  }

  // Add notification preferences
  const notificationSMS = form.querySelector('.form-notification-sms');
  if (notificationSMS) {
    formData.notification_sms = notificationSMS.checked;
  }

  const notificationEmail = form.querySelector('.form-notification-email');
  if (notificationEmail) {
    formData.notification_email = notificationEmail.checked;
  }

  // Add booking reference from data attribute
  const bookingRef = form.dataset.bookingId;
  if (bookingRef) {
    formData.booking_ref = bookingRef;
  }

  createProcessing = true;

  // Update button state
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating...';

  // Show inline feedback
  showFeedback(feedback, 'Creating booking...', 'info');

  try {
    const response = await fetch(`${window.apiClient.baseUrl}/bookings/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': window.apiClient.authHeader
      },
      body: JSON.stringify(formData)
    });

    const result = await response.json();

    if (result.success) {
      // Success feedback
      showFeedback(feedback, '✓ Booking created successfully!', 'success');
      showToast(`✓ Booking created! ID: ${result.booking_id || 'N/A'}`, 'success', 5000);

      // NEW: Return to previous context or reload
      setTimeout(() => {
        form.style.display = 'none';

        if (STATE.navigationContext.returnTab) {
          returnToPreviousContext();
        } else {
          window.reloadRestaurantTab();
        }
      }, 1500);

    } else {
      // Error feedback
      const errorMessage = result.message || 'Unknown error occurred';
      showFeedback(feedback, 'Error: ' + errorMessage, 'error');
      showToast(`Error: ${errorMessage}`, 'error', 6000);

      // Re-enable button
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Booking';
    }

  } catch (error) {
    console.error('Booking creation error:', error);
    showFeedback(feedback, 'Error: ' + error.message, 'error');
    showToast(`Error: ${error.message}`, 'error', 6000);

    // Re-enable button
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Booking';

  } finally {
    createBookingProcessing = false;
  }
}
```

---

## API Fetch Functions (TO BE IMPLEMENTED)

### fetchOpeningHours(date)

**Purpose:** Fetch opening hours from API

**Parameters:**
- `date` (string, optional): YYYY-MM-DD format

**Returns:** Promise<Object>

**Implementation:**
```javascript
async function fetchOpeningHours(date = null) {
  const url = date
    ? `${window.apiClient.baseUrl}/opening-hours?date=${date}`
    : `${window.apiClient.baseUrl}/opening-hours`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': window.apiClient.authHeader
      }
    });

    const result = await response.json();

    if (result.success) {
      return result.data;
    } else {
      console.error('Failed to fetch opening hours:', result.message);
      return [];
    }
  } catch (error) {
    console.error('Error fetching opening hours:', error);
    return [];
  }
}
```

---

### fetchAvailableTimes(date, people, openingHourId)

**Purpose:** Fetch available time slots

**Parameters:**
- `date` (string, required): YYYY-MM-DD
- `people` (number, required): Party size
- `openingHourId` (string, optional): Filter by period

**Returns:** Promise<Object>

**Implementation:**
```javascript
async function fetchAvailableTimes(date, people, openingHourId = null) {
  try {
    const response = await fetch(`${window.apiClient.baseUrl}/available-times`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': window.apiClient.authHeader
      },
      body: JSON.stringify({
        date: date,
        people: people,
        opening_hour_id: openingHourId,
        context: 'chrome-extension'
      })
    });

    const result = await response.json();
    return result;

  } catch (error) {
    console.error('Error fetching available times:', error);
    return { success: false, times: [], periods: [] };
  }
}
```

---

### fetchDietaryChoices()

**Purpose:** Fetch dietary requirement choices

**Returns:** Promise<Array>

**Implementation:**
```javascript
// Cache dietary choices globally
window.dietaryChoicesCache = null;

async function fetchDietaryChoices() {
  // Return cache if available
  if (window.dietaryChoicesCache) {
    return window.dietaryChoicesCache;
  }

  try {
    const response = await fetch(`${window.apiClient.baseUrl}/dietary-choices`, {
      headers: {
        'Authorization': window.apiClient.authHeader
      }
    });

    const result = await response.json();

    if (result.success) {
      window.dietaryChoicesCache = result.choices;
      return result.choices;
    }

    return [];

  } catch (error) {
    console.error('Error fetching dietary choices:', error);
    return [];
  }
}
```

---

### fetchSpecialEvents(date)

**Purpose:** Fetch special events for date

**Parameters:**
- `date` (string, required): YYYY-MM-DD

**Returns:** Promise<Array>

**Implementation:**
```javascript
async function fetchSpecialEvents(date) {
  try {
    const response = await fetch(`${window.apiClient.baseUrl}/special-events?date=${date}`, {
      headers: {
        'Authorization': window.apiClient.authHeader
      }
    });

    const result = await response.json();
    return result.success ? result.events : [];

  } catch (error) {
    console.error('Error fetching special events:', error);
    return [];
  }
}
```

---

## Form Initialization Functions

**STATUS:** ✅ **IMPLEMENTED** (Automatic via template inline script)

### Automatic Form Initialization

The form initialization is handled **automatically** by inline JavaScript in the WordPress template (`chrome-sidepanel-response.php` lines 527-643). Each create form has its own initialization script that uses a MutationObserver to detect when the form becomes visible.

**How it works:**
1. MutationObserver watches for style changes on the form element
2. When `display` changes from `none` to `block`, initialization triggers
3. Only initializes once per form (uses `initialized` flag)
4. Calls `initializeCreateForm(date)` which:
   - Fetches and populates opening hours dropdown
   - Fetches and populates dietary requirement checkboxes
   - Adds event listener to opening hour selector
   - Loads available times when service period is selected
   - Adds click handlers to time slot buttons

**Template Code Structure:**
```javascript
(function() {
  const formId = 'create-form-2025-01-15'; // Example
  const date = '2025-01-15';
  const form = document.getElementById(formId);
  let initialized = false;

  // Watch for form becoming visible
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.attributeName === 'style') {
        const isVisible = form.style.display !== 'none';
        if (isVisible && !initialized) {
          initialized = true;
          initializeCreateForm(date);
        }
      }
    });
  });

  observer.observe(form, { attributes: true, attributeFilter: ['style'] });

  async function initializeCreateForm(date) {
    // Fetch opening hours
    const openingHoursData = await fetchOpeningHours(date);
    const selector = document.getElementById('opening-hour-selector-' + date);

    // Populate dropdown with <option> elements
    if (openingHoursData.success && openingHoursData.html) {
      selector.innerHTML = '<option value="">Select service period...</option>' + openingHoursData.html;
    }

    // Add listener for opening hour selection
    selector.addEventListener('change', async function() {
      if (this.value) {
        const people = parseInt(form.querySelector('.form-people').value) || 2;
        await loadAvailableTimes(date, people, this.value);
      }
    });

    // Fetch dietary choices
    const dietaryData = await fetchDietaryChoices();
    const container = document.getElementById('dietary-checkboxes-' + date);
    // Populate with checkboxes...
  }

  async function loadAvailableTimes(date, people, openingHourId) {
    const timesData = await fetchAvailableTimes(date, people, openingHourId);
    const container = document.getElementById('time-slots-grid-' + date);

    // Populate time slot buttons
    container.innerHTML = timesData.html;

    // Add click handlers
    const timeButtons = container.querySelectorAll('.time-slot-btn');
    timeButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        // Mark as selected and store time
        timeButtons.forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
        const timeValue = this.dataset.time || this.textContent.trim();
        document.getElementById('time-selected-' + date).value = timeValue;
      });
    });
  }
})();
```

**No manual initialization required** - each form initializes itself automatically when opened.

---

### initializeCreateForm(date) - Template Function

**Purpose:** Initialize create booking form with all dynamic data (called automatically by MutationObserver)

**Parameters:**
- `date` (string, required): Date for the form

**Returns:** Promise<void>

**Implementation:**
```javascript
async function initializeCreateForm(date) {
  console.log('Initializing create form for date:', date);

  const form = document.getElementById(`create-form-${date}`);
  if (!form) return;

  // 1. Load opening hours into selector
  const openingHours = await fetchOpeningHours(date);
  const selector = form.querySelector('.form-opening-hour');

  if (selector && openingHours.length > 0) {
    selector.innerHTML = '<option value="">Select service period...</option>';

    openingHours.forEach(period => {
      const option = document.createElement('option');
      option.value = period._id;

      const openTime = Math.floor(period.open / 100) + ':' + String(period.open % 100).padStart(2, '0');
      const closeTime = Math.floor(period.close / 100) + ':' + String(period.close % 100).padStart(2, '0');

      option.textContent = period.name
        ? `${period.name} (${openTime}-${closeTime})`
        : `${openTime}-${closeTime}`;

      selector.appendChild(option);
    });

    // Auto-select last period (usually dinner)
    if (openingHours.length > 0) {
      selector.value = openingHours[openingHours.length - 1]._id;

      // Trigger time slots load
      await loadTimeSlots(date);
    }
  }

  // 2. Load dietary choices
  const choices = await fetchDietaryChoices();
  const dietaryContainer = form.querySelector(`#dietary-checkboxes-${date}`);

  if (dietaryContainer && choices.length > 0) {
    dietaryContainer.innerHTML = '';

    choices.forEach(choice => {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.marginBottom = '8px';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'diet-checkbox';
      checkbox.dataset.choiceId = choice._id;
      checkbox.dataset.choiceName = choice.name;

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(' ' + choice.name));
      dietaryContainer.appendChild(label);
    });
  }

  // 3. Initialize Gantt chart
  initializeGanttChart(date);

  // 4. Attach event listeners
  attachFormEventListeners(date);
}
```

---

### loadTimeSlots(date)

**Purpose:** Load time slot buttons based on selected opening hour and party size

**Parameters:**
- `date` (string, required): Date identifier

**Returns:** Promise<void>

**Implementation:**
```javascript
async function loadTimeSlots(date) {
  const form = document.getElementById(`create-form-${date}`);
  if (!form) return;

  const people = parseInt(form.querySelector('.form-people').value) || 2;
  const openingHourId = form.querySelector('.form-opening-hour').value;

  if (!openingHourId) {
    console.log('No opening hour selected');
    return;
  }

  const timeSlotsContainer = document.getElementById(`time-slots-grid-${date}`);
  timeSlotsContainer.innerHTML = '<p style="padding: 10px; text-align: center; color: #666;">Loading times...</p>';

  // Fetch available times
  const result = await fetchAvailableTimes(date, people, openingHourId);

  if (result.success && result.html) {
    // Use HTML from API
    timeSlotsContainer.innerHTML = result.html;

    // Attach click handlers to time buttons
    const timeButtons = timeSlotsContainer.querySelectorAll('.time-slot-btn');
    timeButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        // Remove selected class from all buttons
        timeButtons.forEach(b => b.classList.remove('selected'));

        // Add selected class to clicked button
        this.classList.add('selected');

        // Store selected time in hidden field
        const selectedTime = this.dataset.time;
        const hiddenField = form.querySelector('.form-time-selected');
        if (hiddenField) {
          hiddenField.value = selectedTime;
        }

        console.log('Time selected:', selectedTime);
      });

      // Hover to scroll Gantt
      btn.addEventListener('mouseenter', function() {
        const time = this.dataset.time;
        scrollGanttToTime(date, time, true);
        showGanttSightLine(date, time);
      });

      btn.addEventListener('mouseleave', function() {
        hideGanttSightLine(date);
      });
    });
  }
}
```

---

### attachFormEventListeners(date)

**Purpose:** Attach all event listeners to form elements

**Parameters:**
- `date` (string, required): Date identifier

**Returns:** void

**Implementation:**
```javascript
function attachFormEventListeners(date) {
  const form = document.getElementById(`create-form-${date}`);
  if (!form) return;

  // Opening hour change -> reload time slots
  const selector = form.querySelector('.form-opening-hour');
  if (selector) {
    selector.addEventListener('change', () => loadTimeSlots(date));
  }

  // Party size change -> reload time slots
  const peopleInput = form.querySelector('.form-people');
  if (peopleInput) {
    peopleInput.addEventListener('change', () => loadTimeSlots(date));
  }

  console.log('Form event listeners attached for date:', date);
}
```

---

## Utility Functions (EXISTING)

### showToast(message, type, duration)

**Location:** Lines 945-970

**Already Implemented** - No changes needed

---

### showFeedback(element, message, type)

**Location:** Lines 1055-1060

**Already Implemented** - No changes needed

---

## Implementation Checklist

- [ ] Add `navigationContext` to STATE object
- [ ] Add `scrollPositions` to STATE object
- [ ] Implement `navigateToRestaurantDate()`
- [ ] Implement `returnToPreviousContext()`
- [ ] Implement `processNavigationContext()`
- [ ] Modify `switchTab()` for scroll preservation
- [ ] Modify `loadRestaurantTab()` to call `processNavigationContext()`
- [ ] Implement `scrollGanttToTime()`
- [ ] Implement `scrollGanttViewport()`
- [ ] Implement `showGanttSightLine()`
- [ ] Implement `hideGanttSightLine()`
- [ ] Implement `initializeGanttChart()`
- [ ] Implement `toggleFormSection()`
- [ ] Add event delegation for section toggles
- [ ] Implement `validateBookingForm()`
- [ ] Enhance `submitCreateBooking()` with all new fields
- [ ] Implement `fetchOpeningHours()`
- [ ] Implement `fetchAvailableTimes()`
- [ ] Implement `fetchDietaryChoices()`
- [ ] Implement `fetchSpecialEvents()`
- [ ] Implement `initializeCreateForm()`
- [ ] Implement `loadTimeSlots()`
- [ ] Implement `attachFormEventListeners()`
- [ ] Add event delegation for create booking links
- [ ] Test all navigation flows
- [ ] Test form submission with all fields
- [ ] Test Gantt chart interactions

---

## Testing

### Manual Testing Steps

1. **Navigation Flow:**
   - Click "Create Booking" in Summary tab
   - Verify navigation to Restaurant tab
   - Verify form expands for correct date
   - Verify scroll to correct date section

2. **Form Initialization:**
   - Verify opening hours load
   - Verify time slots load on period selection
   - Verify dietary choices load
   - Verify Gantt chart displays

3. **Form Interactions:**
   - Toggle collapsible sections
   - Change party size → time slots refresh
   - Change opening hour → time slots refresh
   - Select time slot → highlight and store
   - Hover time slot → Gantt scrolls and sight line shows

4. **Form Submission:**
   - Fill all required fields
   - Submit form
   - Verify "Creating..." state
   - Verify success message
   - Verify return to previous tab/state

5. **Error Handling:**
   - Submit with missing fields → validation errors
   - Simulate API error → error display
   - Verify button re-enables after error

### Console Logging

Add strategic console.log statements:
```javascript
console.log('BMA: Navigation context set:', STATE.navigationContext);
console.log('BMA: Scrolling Gantt to time:', time);
console.log('BMA: Form data collected:', formData);
console.log('BMA: API response:', result);
```

---

## Performance Notes

1. **Cache Dietary Choices:** Only fetch once per session
2. **Debounce Party Size Change:** Prevent rapid API calls
3. **Lazy Load Gantt Charts:** Only when form expanded
4. **Cleanup Event Listeners:** Remove when form hidden

---

## Future Enhancements

1. **Auto-save Form State:** LocalStorage backup
2. **Keyboard Navigation:** Tab through time slots
3. **Accessibility:** ARIA labels and screen reader support
4. **Offline Mode:** Queue submissions when offline
5. **Form Templates:** Save/load common booking configurations
