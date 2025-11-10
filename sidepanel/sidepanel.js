// State management
const STATE = {
  currentTab: 'summary',
  currentBookingId: null,
  settings: null,
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
  lastSummaryInteraction: Date.now(), // Track last user interaction on Summary tab
  lastSummaryUpdate: null, // Track when summary was last updated
  sessionLocked: false, // Track NewBook session lock dialog status
  createFormOpen: false, // Track if any create booking form is open
  navigationContext: null, // Track navigation context for cross-tab navigation
  scrollPositions: {}, // Track scroll positions per tab/date
  restaurantBookings: {} // Store restaurant bookings by date: { '2026-01-31': [{time, people, name, room}, ...] }
};

// Global API client (exposed for use by injected template content)
window.apiClient = null;

// =============================================================================
// Navigation Helper Functions
// =============================================================================

/**
 * Navigate to Restaurant tab with a specific date pre-selected
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number|null} bookingId - Optional booking ID to set as current
 */
function navigateToRestaurantDate(date, bookingId = null) {
  console.log('Navigating to Restaurant tab for date:', date, 'bookingId:', bookingId);

  // Save current scroll position
  const currentContent = document.querySelector(`[data-content="${STATE.currentTab}"]`);
  if (currentContent) {
    STATE.scrollPositions[STATE.currentTab] = currentContent.scrollTop;
  }

  // Set navigation context
  STATE.navigationContext = {
    returnTab: STATE.currentTab,
    returnBookingId: STATE.currentBookingId,
    targetDate: date,
    expandCreateForm: true,
    scrollAfterLoad: true
  };

  // Update current booking ID if provided
  if (bookingId) {
    STATE.currentBookingId = bookingId;
    chrome.storage.local.set({ currentBookingId: bookingId });
  }

  // Switch to restaurant tab
  switchTab('restaurant');
}

/**
 * Return to the previous context after completing a task
 */
function returnToPreviousContext() {
  if (!STATE.navigationContext || !STATE.navigationContext.returnTab) {
    console.log('No previous context to return to');
    return;
  }

  console.log('Returning to previous context:', STATE.navigationContext.returnTab);

  const returnTab = STATE.navigationContext.returnTab;
  const returnBookingId = STATE.navigationContext.returnBookingId;

  // Restore booking ID
  if (returnBookingId) {
    STATE.currentBookingId = returnBookingId;
    chrome.storage.local.set({ currentBookingId: returnBookingId });
  }

  // Clear navigation context
  STATE.navigationContext = null;

  // Switch back to previous tab
  switchTab(returnTab);

  // Restore scroll position
  setTimeout(() => {
    const content = document.querySelector(`[data-content="${returnTab}"]`);
    if (content && STATE.scrollPositions[returnTab]) {
      content.scrollTop = STATE.scrollPositions[returnTab];
    }
  }, 100);
}

/**
 * Process navigation context after Restaurant tab loads
 * Called from loadRestaurantTab() to handle navigation intent
 */
async function processNavigationContext() {
  if (!STATE.navigationContext) {
    return;
  }

  const { targetDate, expandCreateForm, scrollAfterLoad } = STATE.navigationContext;

  console.log('Processing navigation context:', STATE.navigationContext);

  // Find the date section
  const dateSection = document.getElementById(`date-section-${targetDate}`);

  if (!dateSection) {
    console.warn('Target date section not found:', targetDate);
    // Clear navigation context even on error to prevent re-triggering
    STATE.navigationContext = null;
    return;
  }

  // Expand create form if requested
  if (expandCreateForm) {
    const createBtn = document.getElementById(`create-btn-${targetDate}`);
    const createForm = document.getElementById(`create-form-${targetDate}`);

    if (createForm && createBtn) {
      // Show the form
      createForm.style.display = 'block';
      createBtn.style.display = 'none';
      STATE.createFormOpen = true;

      // Initialize form if not already initialized
      if (!createForm.dataset.initialized && typeof window.initializeCreateFormForDate === 'function') {
        console.log('Manually initializing form for date:', targetDate);
        createForm.dataset.initialized = 'true';
        await window.initializeCreateFormForDate(targetDate, createForm);
        console.log('Form initialization complete');
      } else {
        console.log('Form already initialized or function not available');
      }
    }
  }

  // Scroll to the bma-night section within the date section
  if (scrollAfterLoad) {
    console.log('Autoscroll: scrollAfterLoad=true, attempting to scroll');
    setTimeout(() => {
      // Try to find the bma-night element within the date section for more precise scrolling
      const nightSection = dateSection.querySelector('.bma-night');
      const targetElement = nightSection || dateSection;
      console.log('Autoscroll: nightSection found?', !!nightSection, 'targetElement?', !!targetElement);

      if (targetElement) {
        // Get the scrolling container (tab-content)
        const scrollContainer = targetElement.closest('.tab-content');
        console.log('Autoscroll: scrollContainer found?', !!scrollContainer);
        if (scrollContainer) {
          // Calculate position with offset (10px below tabs)
          const elementTop = targetElement.offsetTop;
          const offset = 10; // Additional pixels below the top
          const scrollTop = elementTop - offset;
          console.log('Autoscroll: scrolling to', scrollTop, '(elementTop:', elementTop, 'offset:', offset, ')');
          scrollContainer.scrollTo({ top: scrollTop, behavior: 'smooth' });
        } else {
          // Fallback to standard scrollIntoView
          console.log('Autoscroll: using fallback scrollIntoView');
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else {
        console.log('Autoscroll: targetElement not found, skipping scroll');
      }
    }, 100);
  } else {
    console.log('Autoscroll: scrollAfterLoad=false, skipping scroll');
  }

  // Clear navigation context after processing to prevent re-triggering
  STATE.navigationContext = null;
}

// =============================================================================
// Gantt Chart Functions
// =============================================================================

/**
 * Scroll Gantt chart to a specific time
 * @param {string} chartId - ID of the Gantt chart container
 * @param {number} time - Time in HHMM format (e.g., 1830 for 18:30)
 * @param {boolean} smooth - Use smooth scrolling
 */
function scrollGanttToTime(chartId, time, smooth = true) {
  const chart = document.getElementById(chartId);
  if (!chart) {
    console.warn('Gantt chart not found:', chartId);
    return;
  }

  const viewport = chart.querySelector('.gantt-viewport-container');
  if (!viewport) {
    console.warn('Gantt viewport not found in chart:', chartId);
    return;
  }

  // Calculate scroll position based on time
  // Each hour is typically 60px wide in the chart
  const hour = Math.floor(time / 100);
  const minute = time % 100;
  const totalMinutes = (hour * 60) + minute;

  // Assuming chart starts at 0:00 and each minute is 1px
  const scrollLeft = totalMinutes;

  if (smooth) {
    viewport.scrollTo({ left: scrollLeft, behavior: 'smooth' });
  } else {
    viewport.scrollLeft = scrollLeft;
  }
}

/**
 * Scroll Gantt viewport using control buttons
 * @param {string} chartId - ID of the Gantt chart container
 * @param {string} direction - 'left' or 'right'
 */
function scrollGanttViewport(chartId, direction) {
  const chart = document.getElementById(chartId);
  if (!chart) {
    console.warn('Gantt chart not found:', chartId);
    return;
  }

  const viewport = chart.querySelector('.gantt-viewport-container');
  if (!viewport) {
    console.warn('Gantt viewport not found in chart:', chartId);
    return;
  }

  // Scroll by 1 hour (60 minutes)
  const scrollAmount = direction === 'left' ? -60 : 60;
  viewport.scrollBy({ left: scrollAmount, behavior: 'smooth' });
}

/**
 * Show sight line on Gantt chart at a specific time
 * @param {string} chartId - ID of the Gantt chart container
 * @param {string} time - Time in HHMM format (e.g., "1900") or HH:MM format (e.g., "19:00")
 */
function showGanttSightLine(chartId, time = null) {
  const chart = document.getElementById(chartId);
  if (!chart) {
    console.warn('Gantt chart not found:', chartId);
    return;
  }

  // If no time provided, use current time
  let targetTime;
  if (time) {
    // Convert to HHMM format if needed
    if (typeof time === 'string' && time.includes(':')) {
      const parts = time.split(':');
      targetTime = parseInt(parts[0]) * 100 + parseInt(parts[1]);
    } else {
      targetTime = parseInt(time);
    }
  } else {
    const now = new Date();
    targetTime = (now.getHours() * 100) + now.getMinutes();
  }

  // Get the sight line element (it's already in the chart HTML)
  const sightLine = document.getElementById('gantt-sight-line-' + chartId);
  if (!sightLine) {
    console.warn('Sight line element not found for chart:', chartId);
    return;
  }

  // Calculate position as percentage of chart width
  // Get the chart container which has the time range data
  const chartContainer = chart.querySelector('.gantt-chart-container') || chart;

  // Read time range from data attributes (set by buildGanttChart)
  const startHour = parseInt(chartContainer.dataset.startHour);
  const totalMinutes = parseInt(chartContainer.dataset.totalMinutes);

  if (isNaN(startHour) || isNaN(totalMinutes)) {
    console.warn('Chart time range data not found');
    return;
  }
  const targetHour = Math.floor(targetTime / 100);
  const targetMinute = targetTime % 100;
  const minutesFromStart = (targetHour - startHour) * 60 + targetMinute;

  if (minutesFromStart < 0 || minutesFromStart > totalMinutes) {
    // Time is outside chart range, hide sight line
    sightLine.style.display = 'none';
    return;
  }

  // Calculate left position as percentage
  const leftPercent = (minutesFromStart / totalMinutes) * 100;
  sightLine.style.left = leftPercent + '%';
  sightLine.style.display = 'block';
}

/**
 * Hide the sight line on a Gantt chart (unless locked)
 * @param {string} chartId - ID of the Gantt chart container
 * @param {boolean} force - Force hide even if locked
 */
function hideGanttSightLine(chartId, force = false) {
  const sightLine = document.getElementById('gantt-sight-line-' + chartId);
  if (sightLine) {
    // Check if sight line is locked (has data-locked attribute)
    const isLocked = sightLine.getAttribute('data-locked') === 'true';
    if (!isLocked || force) {
      sightLine.style.display = 'none';
    }
  }
}

/**
 * Lock the sight line at current position (when time selected)
 * @param {string} chartId - ID of the Gantt chart container
 */
function lockGanttSightLine(chartId) {
  const sightLine = document.getElementById('gantt-sight-line-' + chartId);
  if (sightLine) {
    sightLine.setAttribute('data-locked', 'true');
  }
}

/**
 * Unlock the sight line (when time deselected)
 * @param {string} chartId - ID of the Gantt chart container
 */
function unlockGanttSightLine(chartId) {
  const sightLine = document.getElementById('gantt-sight-line-' + chartId);
  if (sightLine) {
    sightLine.setAttribute('data-locked', 'false');
    sightLine.style.display = 'none';
  }
}

/**
 * Auto-scroll Gantt chart to center on a specific time
 * @param {string} chartId - ID of the Gantt chart container
 * @param {string} time - Time in HHMM format (e.g., "1900") or HH:MM format (e.g., "19:00")
 * @param {boolean} smooth - Use smooth scrolling animation
 */
function scrollGanttToTime(chartId, time, smooth = true) {
  const chart = document.getElementById(chartId);
  if (!chart) {
    console.warn('Gantt chart not found:', chartId);
    return;
  }

  // Convert to HHMM format if needed
  let targetTime;
  if (typeof time === 'string' && time.includes(':')) {
    const parts = time.split(':');
    targetTime = parseInt(parts[0]) * 100 + parseInt(parts[1]);
  } else {
    targetTime = parseInt(time);
  }

  // Check if chart is in a scrollable viewport
  const viewport = chart.closest('.gantt-viewport');
  if (!viewport) {
    // No viewport, chart is not scrollable
    return;
  }

  const chartContainer = chart.querySelector('.gantt-chart-container') || chart;

  // Read time range from data attributes (set by buildGanttChart)
  const startHour = parseInt(chartContainer.dataset.startHour);
  const totalMinutes = parseInt(chartContainer.dataset.totalMinutes);

  if (isNaN(startHour) || isNaN(totalMinutes)) {
    console.warn('Chart time range data not found for auto-scroll');
    return;
  }
  const targetHour = Math.floor(targetTime / 100);
  const targetMinute = targetTime % 100;
  const minutesFromStart = (targetHour - startHour) * 60 + targetMinute;

  if (minutesFromStart < 0 || minutesFromStart > totalMinutes) {
    // Time is outside chart range
    return;
  }

  // Calculate scroll position to center the time in viewport
  const scrollPercentage = minutesFromStart / totalMinutes;
  const chartWidth = chartContainer.scrollWidth;
  const viewportWidth = viewport.clientWidth;
  const scrollPosition = (chartWidth * scrollPercentage) - (viewportWidth / 2);

  viewport.scrollTo({
    left: Math.max(0, scrollPosition),
    behavior: smooth ? 'smooth' : 'auto'
  });
}

/**
 * Position bookings using grid-based layout algorithm (row compaction)
 * Ported from PHP class-bma-gantt-chart.php
 * @param {Array} bookings - Array of booking objects
 * @param {number} startHour - Starting hour of chart
 * @param {number} totalMinutes - Total minutes in chart
 * @param {number} bookingDuration - Default booking duration in minutes
 * @param {number} gridRowHeight - Height of each grid row in pixels
 * @returns {Array} Array of positioned booking objects with grid_row and row_span
 */
function positionBookingsOnGrid(bookings, startHour, totalMinutes, bookingDuration, gridRowHeight) {
  const allBookings = [];
  const maxPartySize = 20;
  const buffer = 5; // 5-minute buffer between bookings

  // Flatten and process bookings
  bookings.forEach(booking => {
    if (!booking.time) return;

    const timeParts = booking.time.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = timeParts[1] ? parseInt(timeParts[1]) : 0;
    const minutesFromStart = (hours - startHour) * 60 + minutes;

    if (minutesFromStart >= 0 && minutesFromStart < totalMinutes) {
      allBookings.push({
        time: booking.time,
        people: booking.people || 2,
        name: booking.name || 'Guest',
        room: booking.room || 'Unknown',
        hours: hours,
        minutes: minutes,
        minutesFromStart: minutesFromStart
      });
    }
  });

  // Sort by start time, then by party size (largest first) for better visual hierarchy
  allBookings.sort((a, b) => {
    if (a.minutesFromStart !== b.minutesFromStart) {
      return a.minutesFromStart - b.minutesFromStart;
    }
    // Secondary sort: larger parties first (descending)
    return b.people - a.people;
  });

  // Grid-based positioning algorithm
  const gridRows = [];

  allBookings.forEach(booking => {
    const bookingStart = booking.minutesFromStart;
    let bookingEnd = bookingStart + bookingDuration;
    if (bookingEnd > totalMinutes) {
      bookingEnd = totalMinutes;
    }

    // Calculate row span based on party size
    const partySize = Math.min(booking.people, maxPartySize);
    const rowSpan = Math.max(2, Math.floor(partySize / 2) + 1);

    // Find placement
    let startGridRow = 0;
    let placed = false;

    while (!placed) {
      // Ensure enough grid rows exist
      while (gridRows.length < startGridRow + rowSpan) {
        gridRows.push({ occupied: [] });
      }

      // Check if all required rows are free
      let canPlace = true;
      for (let r = startGridRow; r < startGridRow + rowSpan; r++) {
        for (const seg of gridRows[r].occupied) {
          // Check for overlap with buffer
          if (!(bookingEnd + buffer <= seg.start || bookingStart >= seg.end + buffer)) {
            canPlace = false;
            break;
          }
        }
        if (!canPlace) break;
      }

      if (canPlace) {
        // Place the booking
        for (let r = startGridRow; r < startGridRow + rowSpan; r++) {
          gridRows[r].occupied.push({
            start: bookingStart,
            end: bookingEnd
          });
        }

        booking.grid_row = startGridRow;
        booking.row_span = rowSpan;
        placed = true;
      } else {
        startGridRow++;
      }
    }
  });

  // Store total grid rows in each booking
  const totalGridRows = gridRows.length;
  allBookings.forEach(booking => {
    booking.total_grid_rows = totalGridRows;
  });

  return allBookings;
}

/**
 * Build Gantt chart HTML for restaurant bookings
 * @param {Array} openingHours - Array of opening hour period objects
 * @param {Array} specialEvents - Array of special events (closures/restrictions)
 * @param {Array} availableTimes - Array of available time slots (HH:MM format)
 * @param {Array} bookings - Array of existing restaurant bookings
 * @param {string} displayMode - Display mode: 'full' or 'compact' (default: 'compact')
 * @param {string} chartId - Unique ID for this chart (for sight line)
 * @returns {string} HTML string for Gantt chart content
 */
function buildGanttChart(openingHours, specialEvents = [], availableTimes = [], bookings = [], displayMode = 'compact', chartId = 'gantt') {
  if (!openingHours || !Array.isArray(openingHours) || openingHours.length === 0) {
    return '<p style="padding: 20px; text-align: center; color: #999;">No opening hours available</p>';
  }

  // Display mode configuration
  const modeConfig = {
    full: {
      barHeight: 40,
      gridRowHeight: 14,
      showNames: true,
      showRoomNumbers: true,
      fontSize: 13
    },
    compact: {
      barHeight: 14,
      gridRowHeight: 7,
      showNames: false,
      showRoomNumbers: false,
      fontSize: 10
    }
  };

  const config = modeConfig[displayMode] || modeConfig.compact;

  // Determine time range from opening hours
  let earliestOpen = 2400;
  let latestClose = 0;

  openingHours.forEach(period => {
    const open = period.open || 1800;
    const close = period.close || 2200;
    if (open < earliestOpen) earliestOpen = open;
    if (close > latestClose) latestClose = close;
  });

  // Convert HHMM to hours
  const startHour = Math.floor(earliestOpen / 100);
  const endHour = Math.floor(latestClose / 100) + (latestClose % 100 > 0 ? 1 : 0);
  const totalMinutes = (endHour - startHour) * 60;
  const bookingDuration = 120; // Default 2 hours

  // Position bookings using grid algorithm
  const positionedBookings = positionBookingsOnGrid(bookings, startHour, totalMinutes, bookingDuration, config.gridRowHeight);
  console.log('DEBUG buildGanttChart: Received', bookings.length, 'bookings, positioned', positionedBookings.length, 'bookings');

  // Calculate total height with proper spacing for time labels
  const topMargin = 20; // Space for time labels
  const bottomMargin = 10;
  const totalGridRows = positionedBookings.length > 0 ? positionedBookings[0].total_grid_rows : 0;
  const chartHeight = totalGridRows > 0 ? topMargin + (totalGridRows * config.gridRowHeight) + bottomMargin : 100;

  let html = '<div class="gantt-chart-container" data-start-hour="' + startHour + '" data-total-minutes="' + totalMinutes + '" style="position: relative; height: ' + chartHeight + 'px; width: 100%; min-width: ' + (totalMinutes * 2) + 'px; background: white; overflow: visible;">';

  // Time grid lines (15-minute intervals)
  for (let m = 0; m < totalMinutes; m += 15) {
    const leftPercent = (m / totalMinutes) * 100;
    const isHour = m % 60 === 0;
    html += '<div class="gantt-interval-line" style="position: absolute; left: ' + leftPercent + '%; top: 0; bottom: 0; width: 1px; background: ' + (isHour ? '#d1d5db' : '#e5e7eb') + '; z-index: 1;"></div>';
  }

  // Time labels (half-hourly) - positioned at top
  for (let hour = startHour; hour <= endHour; hour++) {
    const minutesFromStart1 = (hour - startHour) * 60;
    const leftPercent1 = (minutesFromStart1 / totalMinutes) * 100;
    html += '<div class="gantt-time-label" style="position: absolute; left: ' + leftPercent1 + '%; top: 0px; font-size: 10px; color: #6b7280; transform: translateX(-50%); z-index: 2;">' + hour + ':00</div>';

    if (hour < endHour) {
      const minutesFromStart2 = (hour - startHour) * 60 + 30;
      const leftPercent2 = (minutesFromStart2 / totalMinutes) * 100;
      html += '<div class="gantt-time-label" style="position: absolute; left: ' + leftPercent2 + '%; top: 0px; font-size: 10px; color: #6b7280; transform: translateX(-50%); z-index: 2;">' + hour + ':30</div>';
    }
  }

  // Grey overlays for closed periods (outside opening hours)
  const sortedHours = openingHours.slice().sort((a, b) => (a.open || 0) - (b.open || 0));

  // Before first period
  const firstOpen = sortedHours[0].open;
  const firstOpenMinutes = Math.floor(firstOpen / 100) * 60 + (firstOpen % 100);
  const gapStart = firstOpenMinutes - (startHour * 60);
  if (gapStart > 0) {
    const widthPercent = (gapStart / totalMinutes) * 100;
    html += '<div class="gantt-closed-block outside-hours" style="position: absolute; left: 0%; top: ' + topMargin + 'px; width: ' + widthPercent + '%; height: ' + (chartHeight - topMargin) + 'px; background: rgba(100, 100, 100, 0.1); z-index: 3; pointer-events: none;"></div>';
  }

  // Between periods
  for (let i = 0; i < sortedHours.length - 1; i++) {
    const currentClose = sortedHours[i].close;
    const nextOpen = sortedHours[i + 1].open;
    const closeMinutes = Math.floor(currentClose / 100) * 60 + (currentClose % 100);
    const openMinutes = Math.floor(nextOpen / 100) * 60 + (nextOpen % 100);
    const gapStart = closeMinutes - (startHour * 60);
    const gapDuration = openMinutes - closeMinutes;

    if (gapDuration > 0) {
      const leftPercent = (gapStart / totalMinutes) * 100;
      const widthPercent = (gapDuration / totalMinutes) * 100;
      html += '<div class="gantt-closed-block outside-hours" style="position: absolute; left: ' + leftPercent + '%; top: ' + topMargin + 'px; width: ' + widthPercent + '%; height: ' + (chartHeight - topMargin) + 'px; background: rgba(100, 100, 100, 0.1); z-index: 3; pointer-events: none;"></div>';
    }
  }

  // After last period
  const lastClose = sortedHours[sortedHours.length - 1].close;
  const lastCloseMinutes = Math.floor(lastClose / 100) * 60 + (lastClose % 100);
  const remainingMinutes = (endHour * 60) - lastCloseMinutes;
  if (remainingMinutes > 0) {
    const leftPercent = ((lastCloseMinutes - (startHour * 60)) / totalMinutes) * 100;
    const widthPercent = (remainingMinutes / totalMinutes) * 100;
    html += '<div class="gantt-closed-block outside-hours" style="position: absolute; left: ' + leftPercent + '%; top: ' + topMargin + 'px; width: ' + widthPercent + '%; height: ' + (chartHeight - topMargin) + 'px; background: rgba(100, 100, 100, 0.1); z-index: 3; pointer-events: none;"></div>';
  }

  // Grey overlays for special events (closures/restrictions)
  if (specialEvents && Array.isArray(specialEvents)) {
    specialEvents.forEach(event => {
      // Skip special opening events (isOpen = true)
      if (event.isOpen === true) return;

      // Full day closure
      if (!event.open && !event.close) {
        html += '<div class="gantt-closed-block special-event" style="position: absolute; left: 0%; top: ' + topMargin + 'px; width: 100%; height: ' + (chartHeight - topMargin) + 'px; background: rgba(100, 100, 100, 0.1); z-index: 3; pointer-events: none;"></div>';
        return;
      }

      // Partial closure
      if (event.open && event.close) {
        const eventOpenMinutes = Math.floor(event.open / 100) * 60 + (event.open % 100);
        const eventCloseMinutes = Math.floor(event.close / 100) * 60 + (event.close % 100);
        let blockStart = eventOpenMinutes - (startHour * 60);
        let blockEnd = eventCloseMinutes - (startHour * 60);

        if (blockStart < totalMinutes && blockEnd > 0) {
          blockStart = Math.max(0, blockStart);
          blockEnd = Math.min(totalMinutes, blockEnd);
          const blockDuration = blockEnd - blockStart;

          if (blockDuration > 0) {
            const leftPercent = (blockStart / totalMinutes) * 100;
            const widthPercent = (blockDuration / totalMinutes) * 100;
            html += '<div class="gantt-closed-block special-event" style="position: absolute; left: ' + leftPercent + '%; top: ' + topMargin + 'px; width: ' + widthPercent + '%; height: ' + (chartHeight - topMargin) + 'px; background: rgba(100, 100, 100, 0.1); z-index: 3; pointer-events: none;"></div>';
          }
        }
      }
    });
  }

  // Grey overlays for unavailable time slots (fully booked)
  if (availableTimes && Array.isArray(availableTimes) && availableTimes.length > 0) {
    const availableSet = new Set(availableTimes);

    openingHours.forEach(period => {
      const periodStart = period.open || 1800;
      const periodClose = period.close || 2200;
      const interval = period.interval || 15;
      const duration = period.duration || 120;

      // Calculate last seating time
      let closeHour = Math.floor(periodClose / 100);
      let closeMin = periodClose % 100;
      const durationHours = Math.floor(duration / 60);
      const durationMins = duration % 60;

      closeMin -= durationMins;
      closeHour -= durationHours;
      if (closeMin < 0) {
        closeMin += 60;
        closeHour--;
      }
      const lastSeating = closeHour * 100 + closeMin;

      // Generate all expected time slots
      let currentHour = Math.floor(periodStart / 100);
      let currentMin = periodStart % 100;

      while (true) {
        const currentTime = currentHour * 100 + currentMin;
        if (currentTime > lastSeating) break;

        const timeStr = currentHour + ':' + (currentMin < 10 ? '0' + currentMin : currentMin);

        // If NOT available, add grey block
        if (!availableSet.has(timeStr)) {
          const slotMinutes = (currentHour - startHour) * 60 + currentMin;

          if (slotMinutes >= 0 && slotMinutes < totalMinutes) {
            const leftPercent = (slotMinutes / totalMinutes) * 100;
            const widthPercent = (interval / totalMinutes) * 100;
            html += '<div class="gantt-closed-block fully-booked" style="position: absolute; left: ' + leftPercent + '%; top: ' + topMargin + 'px; width: ' + widthPercent + '%; height: ' + (chartHeight - topMargin) + 'px; background: rgba(200, 200, 200, 0.15); z-index: 3; pointer-events: none;"></div>';
          }
        }

        // Increment by interval
        currentMin += interval;
        if (currentMin >= 60) {
          currentMin -= 60;
          currentHour++;
        }
      }
    });
  }

  // Booking bars
  positionedBookings.forEach(booking => {
    const leftPercent = (booking.minutesFromStart / totalMinutes) * 100;
    const yPosition = topMargin + (booking.grid_row * config.gridRowHeight);
    const barHeight = (booking.row_span * config.gridRowHeight) - 4;

    // Calculate width
    let bookingEndMinutes = booking.minutesFromStart + bookingDuration;
    let isCapped = false;
    if (bookingEndMinutes > totalMinutes) {
      bookingEndMinutes = totalMinutes;
      isCapped = true;
    }
    const actualBookingWidth = bookingEndMinutes - booking.minutesFromStart;
    const widthPercent = (actualBookingWidth / totalMinutes) * 100;

    // Display text based on config
    let displayText = '';
    if (config.showNames) {
      displayText = booking.name;
      if (config.showRoomNumbers && booking.room !== 'Non-Resident') {
        displayText += ' - ' + booking.room;
      }
    }

    const barClass = 'gantt-booking-bar' + (isCapped ? ' gantt-bar-capped' : '');

    html += '<div class="' + barClass + '" data-name="' + booking.name + '" data-people="' + booking.people + '" data-time="' + booking.time + '" data-room="' + booking.room + '" style="position: absolute; left: ' + leftPercent + '%; top: ' + yPosition + 'px; width: ' + widthPercent + '%; height: ' + barHeight + 'px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 4px; border: 2px solid #5568d3; padding: 2px 6px; color: white; font-weight: 500; display: flex; align-items: center; gap: 4px; overflow: hidden; cursor: pointer; z-index: 5;">';

    // Guest name and room (only in full mode)
    if (displayText) {
      html += '<span class="gantt-bar-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: ' + config.fontSize + 'px;">' + displayText + '</span>';
    }

    html += '</div>';
  });

  // Sight line (hidden by default, shown on hover)
  html += '<div class="gantt-sight-line" id="gantt-sight-line-' + chartId + '" data-locked="false" style="position: absolute; width: 2px; height: ' + chartHeight + 'px; background: #ef4444; top: 0; left: 0; display: none; z-index: 100; pointer-events: none;"></div>';

  html += '</div>';
  return html;
}

// Expose to window for form initialization
window.buildGanttChart = buildGanttChart;

/**
 * Attach tooltip event listeners to Gantt booking bars
 * Shows booking details on hover: "people: name - room"
 */
function attachGanttTooltips() {
  // Create tooltip element if it doesn't exist
  let tooltip = document.getElementById('gantt-booking-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'gantt-booking-tooltip';
    tooltip.className = 'gantt-booking-tooltip';
    document.body.appendChild(tooltip);
  }

  // Attach event listeners to all booking bars
  const bookingBars = document.querySelectorAll('.gantt-booking-bar');
  bookingBars.forEach(bar => {
    bar.addEventListener('mouseenter', (e) => {
      const people = bar.getAttribute('data-people') || '?';
      const name = bar.getAttribute('data-name') || 'Guest';
      const room = bar.getAttribute('data-room') || 'Unknown';

      // Format: "people: name - room" (hide room if non-resident)
      let tooltipText = `${people}: ${name}`;
      if (room && room !== 'Non-Resident' && room !== 'Unknown') {
        tooltipText += ` - ${room}`;
      }

      tooltip.textContent = tooltipText;
      tooltip.style.display = 'block';
    });

    bar.addEventListener('mousemove', (e) => {
      tooltip.style.left = (e.clientX + 10) + 'px';
      tooltip.style.top = (e.clientY + 10) + 'px';
    });

    bar.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });
}

// =============================================================================
// Service Period Tab Functions
// =============================================================================

/**
 * Toggle collapsible service period section
 * @param {string} date - Date string for the form
 * @param {number} periodIndex - Index of the period to toggle
 */
async function togglePeriodSection(date, periodIndex) {
  const sectionsContainer = document.getElementById('service-period-sections-' + date);
  if (!sectionsContainer) {
    console.warn('Sections container not found for date:', date);
    return;
  }

  const allHeaders = sectionsContainer.querySelectorAll('.period-header');
  const allTimes = sectionsContainer.querySelectorAll('.period-times');
  const clickedHeader = sectionsContainer.querySelector(`.period-header[data-period-index="${periodIndex}"]`);
  const clickedTimes = sectionsContainer.querySelector(`.period-times[data-period-index="${periodIndex}"]`);

  if (!clickedHeader || !clickedTimes) {
    console.warn('Period section not found for index:', periodIndex);
    return;
  }

  const isCurrentlyExpanded = clickedHeader.classList.contains('expanded');

  // Toggle the clicked section
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

      console.log('Lazy loading times for period index:', periodIndex);

      // Call the loadAvailableTimesForPeriod function if it exists
      if (typeof loadAvailableTimesForPeriod !== 'undefined') {
        await loadAvailableTimesForPeriod(date, people, periodId, periodIndex);
      }
    }
  }

  console.log('Toggled period section:', periodIndex, 'expanded:', !isCurrentlyExpanded);
}

// Expose to window for onclick handlers
window.togglePeriodSection = togglePeriodSection;

// =============================================================================
// Form Functions
// =============================================================================

/**
 * Toggle collapsible form section
 * @param {string} sectionId - ID of the section content to toggle
 * @param {HTMLElement} toggleButton - The button element that was clicked
 */
function toggleFormSection(sectionId, toggleButton) {
  const section = document.getElementById(sectionId);
  if (!section) {
    console.warn('Form section not found:', sectionId);
    return;
  }

  const isExpanded = section.style.display !== 'none';

  // Toggle visibility
  section.style.display = isExpanded ? 'none' : 'block';

  // Rotate icon
  const icon = toggleButton.querySelector('.material-symbols-outlined');
  if (icon) {
    icon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
  }
}

/**
 * Validate booking form before submission
 * @param {string} formId - ID of the form to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function validateBookingForm(formId) {
  const form = document.getElementById(formId);
  if (!form) {
    console.warn('Form not found:', formId);
    return false;
  }

  const errors = [];

  // Validate guest name
  const guestNameInput = form.querySelector('.form-guest-name');
  if (!guestNameInput || !guestNameInput.value || guestNameInput.value.trim() === '') {
    errors.push('Guest name is required');
  }

  // Validate people count
  const peopleInput = form.querySelector('.form-people');
  if (!peopleInput || !peopleInput.value || parseInt(peopleInput.value) < 1) {
    errors.push('Party size is required');
  }

  // Note: opening_hour_id and time are validated in submitCreateBooking
  // since they're populated dynamically

  // Validate email format if provided
  const emailInput = form.querySelector('.form-email');
  if (emailInput && emailInput.value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailInput.value)) {
      errors.push('Invalid email format');
    }
  }

  // Validate phone format if provided
  const phoneInput = form.querySelector('.form-phone');
  if (phoneInput && phoneInput.value) {
    const phoneRegex = /^[\d\s\+\-\(\)]+$/;
    if (!phoneRegex.test(phoneInput.value)) {
      errors.push('Invalid phone format');
    }
  }

  // Show errors if any
  if (errors.length > 0) {
    const feedbackId = form.id.replace('create-form-', 'feedback-create-');
    const feedback = document.getElementById(feedbackId);
    if (feedback) {
      feedback.textContent = errors.join(', ');
      feedback.className = 'bma-form-feedback error';
      feedback.style.display = 'block';
    }
    return false;
  }

  return true;
}

// =============================================================================
// API Fetch Functions
// =============================================================================

/**
 * Fetch opening hours for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (optional)
 * @returns {Promise<Object>} - Opening hours data
 */
async function fetchOpeningHours(date = null) {
  try {
    const params = new URLSearchParams({ context: 'chrome-extension' });
    if (date) {
      params.set('date', date);
    }

    const response = await fetch(`${window.apiClient.baseUrl}/opening-hours?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': window.apiClient.authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching opening hours:', error);
    throw error;
  }
}

/**
 * Fetch available times for a specific date and party size
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} people - Party size
 * @param {string} openingHourId - Optional opening hour period ID to filter
 * @returns {Promise<Object>} - Available times data
 */
async function fetchAvailableTimes(date, people, openingHourId = null) {
  try {
    const body = {
      date: date,
      people: people,
      context: 'chrome-extension'
    };

    if (openingHourId) {
      body.opening_hour_id = openingHourId;
    }

    const response = await fetch(`${window.apiClient.baseUrl}/available-times`, {
      method: 'POST',
      headers: {
        'Authorization': window.apiClient.authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching available times:', error);
    throw error;
  }
}

/**
 * Fetch dietary choices
 * @returns {Promise<Object>} - Dietary choices data
 */
async function fetchDietaryChoices() {
  try {
    const response = await fetch(`${window.apiClient.baseUrl}/dietary-choices?context=chrome-extension`, {
      method: 'GET',
      headers: {
        'Authorization': window.apiClient.authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching dietary choices:', error);
    throw error;
  }
}

/**
 * Fetch special events for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} - Special events data
 */
async function fetchSpecialEvents(date) {
  try {
    const response = await fetch(`${window.apiClient.baseUrl}/special-events?date=${date}&context=chrome-extension`, {
      method: 'GET',
      headers: {
        'Authorization': window.apiClient.authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching special events:', error);
    throw error;
  }
}

/**
 * Fetch all restaurant bookings for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} - All bookings data
 */
async function fetchAllBookingsForDate(date) {
  try {
    const response = await fetch(`${window.apiClient.baseUrl}/all-bookings-for-date?date=${date}`, {
      method: 'GET',
      headers: {
        'Authorization': window.apiClient.authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching all bookings for date:', error);
    throw error;
  }
}

// Authentication State Management
const AuthManager = {
  // Check if NewBook session is active by checking cookies
  async checkNewBookAuth() {
    try {
      // Check cookies from both appeu.newbook.cloud and login.newbook.cloud
      const domains = [
        'https://appeu.newbook.cloud',
        'https://login.newbook.cloud'
      ];

      let allCookies = [];
      for (const url of domains) {
        const cookies = await chrome.cookies.getAll({ url });
        allCookies = allCookies.concat(cookies);
      }

      console.log('NewBook cookies found:', allCookies.length);

      // Check if there's a valid session cookie
      // NewBook typically uses PHPSESSID or similar
      const sessionCookie = allCookies.find(cookie =>
        cookie.name === 'PHPSESSID' ||
        cookie.name.toLowerCase().includes('session') ||
        cookie.name.toLowerCase().includes('newbook')
      );

      const isAuthenticated = !!sessionCookie && !this.isCookieExpired(sessionCookie);

      console.log('NewBook authentication status:', isAuthenticated ? 'Authenticated' : 'Not authenticated');

      return isAuthenticated;
    } catch (error) {
      console.error('Error checking NewBook auth:', error);
      return false;
    }
  },

  isCookieExpired(cookie) {
    if (!cookie.expirationDate) {
      // Session cookies without expiration are valid until browser closes
      return false;
    }
    return cookie.expirationDate * 1000 < Date.now();
  },

  // Show lock screen overlay
  showLockScreen() {
    const existingLock = document.getElementById('newbook-lock-screen');
    if (existingLock) return; // Already showing

    const lockScreen = document.createElement('div');
    lockScreen.id = 'newbook-lock-screen';
    lockScreen.innerHTML = `
      <div class="lock-screen-content">
        <span class="material-symbols-outlined lock-icon">lock</span>
        <h2>NewBook Not Logged In</h2>
        <p>Please log in to NewBook to use this assistant.</p>
        <button class="lock-screen-btn" id="open-newbook-btn">
          <span class="material-symbols-outlined">open_in_new</span>
          Open NewBook
        </button>
        <button class="lock-screen-btn secondary" id="check-auth-btn">
          <span class="material-symbols-outlined">refresh</span>
          Check Again
        </button>
      </div>
    `;

    document.body.appendChild(lockScreen);

    // Add event listeners
    document.getElementById('open-newbook-btn').addEventListener('click', async () => {
      // Open NewBook in a new tab
      await chrome.tabs.create({ url: 'https://appeu.newbook.cloud' });
    });

    document.getElementById('check-auth-btn').addEventListener('click', async () => {
      await this.updateAuthState();
    });
  },

  // Remove lock screen overlay
  hideLockScreen() {
    const lockScreen = document.getElementById('newbook-lock-screen');
    if (lockScreen) {
      lockScreen.remove();
    }
  },

  // Update authentication state and show/hide lock screen
  async updateAuthState() {
    if (STATE.newbookAuth.checking) return;

    STATE.newbookAuth.checking = true;
    const isAuthenticated = await this.checkNewBookAuth();
    STATE.newbookAuth.isAuthenticated = isAuthenticated;
    STATE.newbookAuth.checking = false;

    // Show lock screen if either not authenticated OR session is locked
    if (isAuthenticated && !STATE.sessionLocked) {
      this.hideLockScreen();
    } else {
      this.showLockScreen();
    }

    return isAuthenticated;
  },

  // Handle session lock status from content script
  handleSessionLock(isLocked) {
    console.log('Session lock status updated:', isLocked ? 'LOCKED' : 'UNLOCKED');
    STATE.sessionLocked = isLocked;

    // Update lock screen visibility
    if (isLocked) {
      this.showLockScreen();
    } else if (STATE.newbookAuth.isAuthenticated) {
      // Only hide if also authenticated
      this.hideLockScreen();
    }
  },

  // Start listening for cookie changes
  startCookieMonitoring() {
    chrome.cookies.onChanged.addListener((changeInfo) => {
      // Check if the changed cookie is from NewBook domain
      if (changeInfo.cookie.domain.includes('newbook.cloud')) {
        console.log('NewBook cookie changed:', changeInfo);

        // Debounce auth check to avoid too many checks
        clearTimeout(this._cookieCheckTimeout);
        this._cookieCheckTimeout = setTimeout(() => {
          this.updateAuthState();
        }, 1000);
      }
    });

    console.log('Cookie monitoring started');
  }
};

// API Client
class APIClient {
  constructor(settings) {
    this.settings = settings;
    this.baseUrl = settings.apiRootUrl;
    this.authHeader = 'Basic ' + btoa(`${settings.username}:${settings.applicationPassword}`);
  }

  async fetchSummary() {
    const limit = this.settings.recentBookingsCount || 10;
    console.log('fetchSummary - settings:', this.settings);
    console.log('fetchSummary - recentBookingsCount:', this.settings.recentBookingsCount);
    console.log('fetchSummary - limit:', limit);

    const url = `${this.baseUrl}/summary?context=chrome-summary&limit=${limit}`;
    console.log('fetchSummary - URL:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async fetchRestaurantMatch(bookingId) {
    const response = await fetch(`${this.baseUrl}/bookings/match`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        booking_id: parseInt(bookingId),
        context: 'chrome-sidepanel'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async fetchChecks(bookingId) {
    const response = await fetch(`${this.baseUrl}/checks/${bookingId}?context=chrome-checks`, {
      method: 'GET',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }
}

// UI Helper Functions
function showLoading(tabName) {
  const tabContent = document.querySelector(`[data-content="${tabName}"]`);
  tabContent.querySelector('.tab-loading').classList.remove('hidden');
  tabContent.querySelector('.tab-data').classList.add('hidden');
  tabContent.querySelector('.tab-error').classList.add('hidden');
  tabContent.querySelector('.tab-empty')?.classList.add('hidden');
}

function showData(tabName, html) {
  const tabContent = document.querySelector(`[data-content="${tabName}"]`);
  const dataElement = tabContent.querySelector('.tab-data');

  dataElement.innerHTML = html;
  dataElement.classList.remove('hidden');

  tabContent.querySelector('.tab-loading').classList.add('hidden');
  tabContent.querySelector('.tab-error').classList.add('hidden');
  tabContent.querySelector('.tab-empty')?.classList.add('hidden');

  // Attach event listeners for Summary tab accordion
  if (tabName === 'summary') {
    attachSummaryEventListeners(dataElement);
  }

  // Attach event listeners for Restaurant tab buttons
  if (tabName === 'restaurant') {
    attachRestaurantEventListeners(dataElement);
  }
}

// Attach event listeners to summary tab booking cards
function attachSummaryEventListeners(container) {
  // Add click handlers to booking headers for accordion expand/collapse
  const headers = container.querySelectorAll('.booking-header');
  headers.forEach(header => {
    header.addEventListener('click', function() {
      // Update interaction time when user expands/collapses booking
      STATE.lastSummaryInteraction = Date.now();

      const card = this.closest('.booking-card');
      const bookingId = card.dataset.bookingId;
      const details = document.getElementById('details-' + bookingId);
      const icon = card.querySelector('.expand-icon');

      if (details.style.display === 'none' || !details.style.display) {
        details.style.display = 'block';
        icon.textContent = '▲';
        card.classList.add('expanded');
      } else {
        details.style.display = 'none';
        icon.textContent = '▼';
        card.classList.remove('expanded');
      }
    });
  });

  // Add click handlers to "Open in NewBook" buttons
  const openButtons = container.querySelectorAll('.open-booking-btn');
  openButtons.forEach(button => {
    button.addEventListener('click', function(e) {
      e.stopPropagation(); // Prevent header click event
      const bookingId = this.dataset.bookingId;
      const url = `https://appeu.newbook.cloud/bookings_view/${bookingId}`;
      chrome.tabs.update({ url: url });
    });
  });

  // Add click handlers to issue rows/alerts to open Restaurant tab
  const clickableIssues = container.querySelectorAll('.clickable-issue');
  clickableIssues.forEach(issue => {
    issue.addEventListener('click', function(e) {
      e.stopPropagation(); // Prevent header click event
      const bookingId = this.dataset.bookingId;
      console.log('Issue clicked - switching to Restaurant tab for booking:', bookingId);

      // Set current booking ID and switch to Restaurant tab
      STATE.currentBookingId = bookingId;
      switchTab('restaurant');
    });
  });

  // Add click handlers to ResOS deep link rows to open ResOS
  const resosDeepLinks = container.querySelectorAll('.resos-deep-link');
  resosDeepLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.stopPropagation(); // Prevent header click event
      const resosId = this.dataset.resosId;
      const restaurantId = this.dataset.restaurantId;
      const date = this.dataset.date;

      if (resosId && restaurantId && date) {
        const resosUrl = `https://app.resos.com/${restaurantId}/bookings/timetable/${date}/${resosId}`;
        console.log('Opening ResOS booking:', resosUrl);
        chrome.tabs.update({ url: resosUrl });
      }
    });
  });

  // Track user interactions to manage idle-based auto-refresh
  const updateInteractionTime = () => {
    STATE.lastSummaryInteraction = Date.now();
  };

  // Track clicks, scrolls, and keyboard input on Summary tab
  container.addEventListener('click', updateInteractionTime);
  container.addEventListener('scroll', updateInteractionTime, { passive: true });
  container.addEventListener('keydown', updateInteractionTime);

  // Add click handler for "Create Booking" links from Summary tab
  const createBookingLinks = container.querySelectorAll('.create-booking-link');
  createBookingLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();

      const date = this.dataset.date;
      const bookingId = this.dataset.bookingId;

      console.log('Create booking link clicked - date:', date, 'bookingId:', bookingId);
      navigateToRestaurantDate(date, parseInt(bookingId));
    });
  });

  // Add click handler for restaurant header to navigate to Restaurant tab
  const restaurantHeaders = container.querySelectorAll('.restaurant-header-link');
  restaurantHeaders.forEach(header => {
    header.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();

      const bookingId = this.dataset.bookingId;

      console.log('Restaurant header clicked - bookingId:', bookingId);
      navigateToRestaurantDate(null, parseInt(bookingId));
    });
  });

  // Update time since placed and apply highlighting
  updateTimeSincePlaced(container);
}

// Attach event listeners to restaurant tab buttons
function attachRestaurantEventListeners(container) {
  // Check if listeners are already attached to prevent duplicates
  if (container.dataset.listenersAttached === 'true') {
    console.log('Restaurant event listeners already attached, skipping');
    return;
  }

  console.log('Attaching restaurant event listeners');
  container.dataset.listenersAttached = 'true';

  // Reset inactivity timer on ANY interaction (clicks, scrolling, typing, etc.)
  const resetTimer = () => {
    if (STATE.currentTab === 'restaurant' || STATE.currentTab === 'checks') {
      resetInactivityTimer();
      startInactivityTimer();
    }
  };

  // Listen for various interaction events
  container.addEventListener('scroll', resetTimer, { passive: true });
  container.addEventListener('input', resetTimer);
  container.addEventListener('change', resetTimer);

  // Use event delegation for all button clicks
  container.addEventListener('click', async function(event) {
    // Reset timer for any click in the container
    resetTimer();

    // Handle collapsible section toggles
    const sectionToggle = event.target.closest('.bma-section-toggle');
    if (sectionToggle) {
      event.preventDefault();
      const targetId = sectionToggle.dataset.target;
      toggleFormSection(targetId, sectionToggle);
      return;
    }

    const button = event.target.closest('button[data-action]');
    if (!button) return;

    // Prevent event bubbling and default action
    event.stopPropagation();
    event.preventDefault();

    const action = button.dataset.action;
    console.log('Restaurant button clicked:', action);

    try {
      switch(action) {
        case 'toggle-create':
          toggleCreateForm(button.dataset.date);
          break;

        case 'toggle-update':
          toggleUpdateForm(button.dataset.date, button.dataset.resosBookingId);
          break;

        case 'submit-create':
          await submitCreateBooking(button.dataset.date);
          break;

        case 'submit-update':
          await submitUpdateBooking(button.dataset.date, button.dataset.resosBookingId);
          break;

        case 'exclude-match':
          await confirmExcludeMatch(
            button.dataset.resosBookingId,
            button.dataset.hotelBookingId,
            button.dataset.guestName
          );
          break;

        case 'view-comparison':
          await loadComparisonView(
            button.dataset.date,
            button.dataset.bookingId,
            button.dataset.resosBookingId
          );
          break;

        case 'close-comparison':
          closeComparison(button.dataset.containerId);
          break;

        case 'submit-suggestions':
          await submitSuggestions(
            button.dataset.date,
            button.dataset.resosBookingId,
            button.dataset.hotelBookingId,
            button.dataset.isConfirmed === 'true'
          );
          break;
      }
    } catch (error) {
      console.error('Error handling restaurant action:', error);
      showToast(`Error: ${error.message}`, 'error');
    }
  });

  // Helper functions for restaurant tab interactions
  function toggleCreateForm(date) {
    const formId = 'create-form-' + date;
    const btnId = 'create-btn-' + date;
    const statusId = 'status-' + date;
    const form = document.getElementById(formId);
    const btn = document.getElementById(btnId);
    const status = document.getElementById(statusId);

    if (!form) return;

    if (form.style.display === 'none' || !form.style.display) {
      form.style.display = 'block';
      if (btn) btn.style.display = 'none'; // Hide button when form is open
      if (status) status.style.display = 'none'; // Hide status message
      STATE.createFormOpen = true; // Track form state

      // Scroll to the bma-night section for better context
      const dateSection = document.getElementById(`date-section-${date}`);
      console.log('Autoscroll (create form): dateSection found?', !!dateSection);
      if (dateSection) {
        const nightSection = dateSection.querySelector('.bma-night');
        console.log('Autoscroll (create form): nightSection found?', !!nightSection);
        if (nightSection) {
          // Get the scrolling container and apply offset
          const scrollContainer = nightSection.closest('.tab-content');
          console.log('Autoscroll (create form): scrollContainer found?', !!scrollContainer);
          if (scrollContainer) {
            const elementTop = nightSection.offsetTop;
            const offset = 10; // Additional pixels below the top
            const scrollTop = elementTop - offset;
            console.log('Autoscroll (create form): scrolling to', scrollTop, '(elementTop:', elementTop, 'offset:', offset, ')');
            scrollContainer.scrollTo({ top: scrollTop, behavior: 'smooth' });
          } else {
            console.log('Autoscroll (create form): using fallback scrollIntoView on nightSection');
            nightSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } else {
          console.log('Autoscroll (create form): nightSection not found, scrolling form into view');
          form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else {
        console.log('Autoscroll (create form): dateSection not found, scrolling form into view');
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      // Initialize form if not already initialized
      if (!form.dataset.initialized) {
        form.dataset.initialized = 'true';
        initializeCreateFormForDate(date, form);
      }
    } else {
      form.style.display = 'none';
      if (btn) btn.style.display = ''; // Show button when form is closed
      if (status) status.style.display = ''; // Show status message
      STATE.createFormOpen = false; // Track form state
    }
  }

  async function initializeCreateFormForDate(date, form) {
    console.log('Initializing create form for date:', date);

    // Fetch and populate opening hours
    try {
      const openingHoursData = await fetchOpeningHours(date);
      console.log('Opening hours response:', openingHoursData);

      const sectionsContainer = document.getElementById('service-period-sections-' + date);
      console.log('Sections container found:', !!sectionsContainer);

      if (!sectionsContainer) {
        console.error('Sections container not found for date:', date);
        return;
      }

      if (openingHoursData.success && openingHoursData.data && openingHoursData.data.length > 0) {
        const periods = openingHoursData.data;
        console.log('Generating collapsible sections for', periods.length, 'periods');

        // Generate collapsible sections (accordion style - vertical)
        let sectionsHtml = '';
        periods.forEach((period, index) => {
          const isLast = index === periods.length - 1;
          const isExpanded = isLast; // Latest period expanded by default
          const periodLabel = period.name || 'Service Period'; // Just the name, no times
          const collapseIcon = isExpanded ? '▼' : '▶';
          const expandedClass = isExpanded ? ' expanded' : '';
          const displayStyle = isExpanded ? 'flex' : 'none';

          sectionsHtml += `
            <div class="service-period-section" data-period-index="${index}">
              <button type="button" class="period-header${expandedClass}" data-period-index="${index}" data-period-id="${escapeHtml(period._id)}" data-date="${date}">
                <span class="collapse-icon">${collapseIcon}</span>
                <span class="period-label">${escapeHtml(periodLabel)}</span>
              </button>
              <div class="period-times" data-period-index="${index}" style="display: ${displayStyle};">
                <p style="padding: 10px; text-align: center; color: #666;">Loading available times...</p>
              </div>
            </div>
          `;
        });
        sectionsContainer.innerHTML = sectionsHtml;

        // Add click handlers to period header buttons
        const periodHeaders = sectionsContainer.querySelectorAll('.period-header');
        periodHeaders.forEach(header => {
          header.addEventListener('click', function() {
            const headerDate = this.dataset.date;
            const headerIndex = parseInt(this.dataset.periodIndex);
            togglePeriodSection(headerDate, headerIndex);
          });
        });

        // Generate Gantt chart
        if (typeof buildGanttChart === 'function') {
          const ganttViewport = document.getElementById('gantt-' + date);
          if (ganttViewport) {
            // Fetch ALL restaurant bookings for this date
            try {
              const allBookingsData = await fetchAllBookingsForDate(date);
              console.log('DEBUG: All bookings from API:', allBookingsData);

              // Get matched bookings for this date from STATE
              const matchedBookings = STATE.restaurantBookings[date] || [];
              console.log('DEBUG: Matched bookings from STATE:', matchedBookings);

              // Use all bookings from API for comprehensive view
              const bookingsForDate = allBookingsData.success ? allBookingsData.bookings : [];
              console.log('DEBUG: Total bookings for Gantt chart:', bookingsForDate.length);

              const ganttHtml = buildGanttChart(
                periods,            // opening hours
                [],                 // special events (TODO: fetch these)
                [],                 // available times (TODO: fetch these)
                bookingsForDate,    // ALL restaurant bookings (not just matched)
                'compact',          // display mode
                'gantt-' + date     // chart ID (must match viewport ID)
              );
              ganttViewport.innerHTML = ganttHtml;

              // Update viewport height to match chart content
              const chartContainer = ganttViewport.querySelector('.gantt-chart-container');
              if (chartContainer) {
                const chartHeight = parseInt(chartContainer.style.height) || 120;
                ganttViewport.style.height = chartHeight + 'px';
                console.log('Updated Gantt viewport height to:', chartHeight + 'px');
              }

              attachGanttTooltips();
              console.log('Gantt chart generated for date:', date, 'with', bookingsForDate.length, 'bookings');
            } catch (error) {
              console.error('Error fetching all bookings for Gantt chart:', error);
              // Fallback to matched bookings only if API fails
              const bookingsForDate = STATE.restaurantBookings[date] || [];
              const ganttHtml = buildGanttChart(
                periods,
                [],
                [],
                bookingsForDate,
                'compact',
                'gantt-' + date
              );
              ganttViewport.innerHTML = ganttHtml;

              // Update viewport height to match chart content
              const chartContainer = ganttViewport.querySelector('.gantt-chart-container');
              if (chartContainer) {
                const chartHeight = parseInt(chartContainer.style.height) || 120;
                ganttViewport.style.height = chartHeight + 'px';
                console.log('Updated Gantt viewport height to:', chartHeight + 'px (fallback)');
              }

              attachGanttTooltips();
            }
          }
        }

        // Load available times for the default (last) period
        const defaultPeriodIndex = periods.length - 1;
        const defaultPeriod = periods[defaultPeriodIndex];
        const people = parseInt(form.querySelector('.form-people').value) || 2;
        await loadAvailableTimesForPeriod(date, people, defaultPeriod._id, defaultPeriodIndex);

        console.log('Opening hours loaded, default period:', defaultPeriod.name);
      } else {
        console.warn('Opening hours response has no data:', openingHoursData);
        sectionsContainer.innerHTML = '<p style="color: #ef4444;">No service periods available</p>';
      }
    } catch (error) {
      console.error('Error loading opening hours:', error);
      const sectionsContainer = document.getElementById('service-period-sections-' + date);
      if (sectionsContainer) {
        sectionsContainer.innerHTML = '<p style="color: #ef4444;">Error loading service periods</p>';
      }
    }

    // Fetch and populate dietary choices
    try {
      const dietaryData = await fetchDietaryChoices();
      console.log('Dietary choices response:', dietaryData);

      const container = document.getElementById('dietary-checkboxes-' + date);
      console.log('Dietary checkboxes container found:', !!container);

      if (dietaryData.success && dietaryData.html) {
        console.log('Using HTML response for dietary choices');
        container.innerHTML = dietaryData.html;
      } else if (dietaryData.success && dietaryData.choices) {
        console.log('Using choices array for dietary:', dietaryData.choices.length, 'choices');
        container.innerHTML = '';
        dietaryData.choices.forEach(choice => {
          const div = document.createElement('div');
          div.className = 'dietary-checkbox-item';
          const label = document.createElement('label');
          label.innerHTML = `<input type="checkbox" class="diet-checkbox" data-choice-id="${escapeHtml(choice._id)}" data-choice-name="${escapeHtml(choice.name)}"> ${escapeHtml(choice.name)}`;
          div.appendChild(label);
          container.appendChild(div);
        });
      } else {
        console.warn('Dietary response has no html or choices:', dietaryData);
      }
    } catch (error) {
      console.error('Error loading dietary choices:', error);
      const container = document.getElementById('dietary-checkboxes-' + date);
      if (container) {
        container.innerHTML = '<p style="color: #ef4444;">Error loading dietary options</p>';
      }
    }
  }

  async function loadAvailableTimesForPeriod(date, people, periodId, periodIndex) {
    console.log('DEBUG loadAvailableTimesForPeriod called:', {date, people, periodId, periodIndex});
    try {
      const timesData = await fetchAvailableTimes(date, people, periodId);
      console.log('DEBUG fetchAvailableTimes result:', {success: timesData.success, hasHtml: !!timesData.html, htmlLength: timesData.html?.length});
      const sectionsContainer = document.getElementById('service-period-sections-' + date);
      const periodTimes = sectionsContainer ? sectionsContainer.querySelector(`.period-times[data-period-index="${periodIndex}"]`) : null;

      if (!periodTimes) {
        console.warn('Period times container not found for index:', periodIndex, 'sectionsContainer:', sectionsContainer);
        return;
      }

      if (timesData.success && timesData.html) {
        periodTimes.innerHTML = timesData.html;

        // Add click handlers to time slot buttons
        const timeButtons = periodTimes.querySelectorAll('.time-slot-btn');
        const ganttChartId = 'gantt-' + date;

        timeButtons.forEach(btn => {
          // Click handler
          btn.addEventListener('click', function() {
            // Remove selected class from ALL buttons in ALL sections
            const allButtons = sectionsContainer.querySelectorAll('.time-slot-btn');
            allButtons.forEach(b => b.classList.remove('selected'));
            // Add selected class to clicked button
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
              // Format time for display (e.g., "1800" -> "18:00")
              const displayTime = this.textContent.trim();
              bookingTimeDisplay.textContent = displayTime;
            }

            // Lock sight line at selected time and scroll to it
            const timeHHMM = timeValue.replace(':', '');
            if (typeof showGanttSightLine === 'function') {
              showGanttSightLine(ganttChartId, timeHHMM);
              if (typeof lockGanttSightLine === 'function') {
                lockGanttSightLine(ganttChartId);
              }
            }
            if (typeof scrollGanttToTime === 'function') {
              scrollGanttToTime(ganttChartId, timeHHMM, true);
            }
          });

          // Hover handlers for Gantt chart sight line and auto-scroll
          btn.addEventListener('mouseenter', function() {
            const timeValue = this.dataset.time || this.textContent.trim();
            // Convert HH:MM to HHMM format
            const timeHHMM = timeValue.replace(':', '');

            // Show sight line at this time
            if (typeof showGanttSightLine === 'function') {
              showGanttSightLine(ganttChartId, timeHHMM);
            }

            // Auto-scroll Gantt chart to center on this time
            if (typeof scrollGanttToTime === 'function') {
              scrollGanttToTime(ganttChartId, timeHHMM, true);
            }
          });

          btn.addEventListener('mouseleave', function() {
            // Hide sight line when not hovering
            if (typeof hideGanttSightLine === 'function') {
              hideGanttSightLine(ganttChartId);
            }
          });
        });

        console.log('Loaded available times for period index:', periodIndex);
      } else {
        periodTimes.innerHTML = '<p style="padding: 10px; text-align: center; color: #666;">No available times</p>';
      }
    } catch (error) {
      console.error('Error loading available times:', error);
      const sectionsContainer = document.getElementById('service-period-sections-' + date);
      const periodTimes = sectionsContainer ? sectionsContainer.querySelector(`.period-times[data-period-index="${periodIndex}"]`) : null;
      if (periodTimes) {
        periodTimes.innerHTML = '<p style="color: #ef4444;">Error loading times</p>';
      } else {
        console.warn('Could not find period-times container to show error message');
      }
    }
  }

  // Expose to window for switchTimeTab lazy loading and manual initialization
  window.loadAvailableTimesForPeriod = loadAvailableTimesForPeriod;
  window.initializeCreateFormForDate = initializeCreateFormForDate;

  function formatTimeHHMM(hhmm) {
    const hours = Math.floor(hhmm / 100);
    const minutes = hhmm % 100;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toggleUpdateForm(date, resosBookingId) {
    const formId = 'update-form-' + date + '-' + resosBookingId;
    const form = document.getElementById(formId);
    if (!form) return;

    if (form.style.display === 'none' || !form.style.display) {
      form.style.display = 'block';
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      form.style.display = 'none';
    }
  }

  // Processing flags to prevent multiple simultaneous operations
  let createProcessing = false;
  let updateProcessing = false;

  async function submitCreateBooking(date) {
    // Prevent multiple simultaneous operations
    if (createProcessing) {
      console.log('Create operation already in progress, ignoring');
      return;
    }

    // Set flag immediately to prevent duplicate submissions
    createProcessing = true;

    const formId = 'create-form-' + date;
    const form = document.getElementById(formId);
    if (!form) {
      createProcessing = false;
      return;
    }

    // Get submit button for UI feedback
    const submitBtn = form.querySelector('.bma-btn-submit');

    // Validate form before submission
    if (!validateBookingForm(formId)) {
      console.log('Form validation failed');
      createProcessing = false;
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
      createProcessing = false;
      return;
    }

    // Get opening hour ID from hidden field (populated when time slot button clicked)
    const openingHourIdField = form.querySelector('.form-opening-hour-id') || document.getElementById('opening-hour-id-' + date);
    const openingHourId = openingHourIdField ? openingHourIdField.value : '';

    if (!openingHourId) {
      showFeedback(feedback, 'Please select a time slot from a service period', 'error');
      createProcessing = false;
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

    console.log('Starting create booking operation with data:', formData);

    // Disable button and update UI
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
    }

    try {
      showFeedback(feedback, 'Creating booking...', 'info');

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
        showFeedback(feedback, 'Booking created successfully!', 'success');
        // On success, we navigate away, so no need to re-enable button
        setTimeout(() => {
          form.style.display = 'none';
          STATE.createFormOpen = false;

          // Return to previous context if applicable
          if (STATE.navigationContext && STATE.navigationContext.returnTab) {
            returnToPreviousContext();
          } else {
            window.reloadRestaurantTab();
          }
        }, 1500);
      } else {
        showFeedback(feedback, 'Error: ' + (result.message || 'Unknown error'), 'error');
        // Re-enable button on error
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Booking';
        }
      }
    } catch (error) {
      showFeedback(feedback, 'Error: ' + error.message, 'error');
      // Re-enable button on error
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Booking';
      }
    } finally {
      createProcessing = false;
      console.log('Create booking operation completed');
    }
  }

  async function submitUpdateBooking(date, resosBookingId) {
    // Prevent multiple simultaneous operations
    if (updateProcessing) {
      console.log('Update operation already in progress, ignoring');
      return;
    }

    // Set flag immediately to prevent duplicate submissions
    updateProcessing = true;

    const formId = 'update-form-' + date + '-' + resosBookingId;
    const form = document.getElementById(formId);
    if (!form) {
      updateProcessing = false;
      return;
    }

    const feedbackId = 'feedback-update-' + date + '-' + resosBookingId;
    const feedback = document.getElementById(feedbackId);

    // Get submit button for UI feedback
    const submitBtn = form.querySelector('.bma-btn-submit');

    // Collect checked updates
    const updates = {};
    const checkboxes = form.querySelectorAll('input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
      const fieldName = cb.name;
      const input = form.querySelector(`[name="${fieldName}_value"]`);
      if (input) {
        updates[fieldName] = input.value;
      }
    });

    if (Object.keys(updates).length === 0) {
      showFeedback(feedback, 'Please select at least one field to update', 'error');
      updateProcessing = false;
      return;
    }

    console.log('Starting update booking operation');

    // Disable button and update UI
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Updating...';
    }

    try {
      showFeedback(feedback, 'Updating booking...', 'info');

      const response = await fetch(`${window.apiClient.baseUrl}/bookings/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': window.apiClient.authHeader
        },
        body: JSON.stringify({
          booking_id: resosBookingId,
          updates: updates
        })
      });

      const result = await response.json();

      if (result.success) {
        showFeedback(feedback, 'Booking updated successfully!', 'success');
        // On success, we reload the tab, so no need to re-enable button
        setTimeout(() => {
          form.style.display = 'none';
          window.reloadRestaurantTab();
        }, 1500);
      } else {
        showFeedback(feedback, 'Error: ' + (result.message || 'Unknown error'), 'error');
        // Re-enable button on error
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Update Booking';
        }
      }
    } catch (error) {
      showFeedback(feedback, 'Error: ' + error.message, 'error');
      // Re-enable button on error
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Booking';
      }
    } finally {
      updateProcessing = false;
      console.log('Update booking operation completed');
    }
  }

  // Processing flag to prevent multiple simultaneous exclude operations
  let excludeProcessing = false;

  async function confirmExcludeMatch(resosBookingId, hotelBookingId, guestName) {
    // Prevent multiple simultaneous operations
    if (excludeProcessing) {
      console.log('Exclude operation already in progress, ignoring');
      return;
    }

    // Set flag immediately to prevent duplicate modal dialogs
    excludeProcessing = true;

    const confirmed = await showModal(
      'Exclude This Match?',
      `This will add a "NOT-#${hotelBookingId}" note to the ResOS booking for ${guestName}, marking it as excluded from this hotel booking.`,
      'Exclude Match',
      'Cancel'
    );

    if (!confirmed) {
      excludeProcessing = false;
      return;
    }

    console.log('Starting exclude operation for booking:', hotelBookingId);

    try {
      const response = await fetch(`${window.apiClient.baseUrl}/bookings/exclude`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': window.apiClient.authHeader
        },
        body: JSON.stringify({
          resos_booking_id: resosBookingId,
          hotel_booking_id: hotelBookingId
        })
      });

      const result = await response.json();

      if (result.success) {
        showToast(`Match excluded successfully! NOT-#${hotelBookingId} note added.`, 'success');
        window.reloadRestaurantTab();
      } else {
        showToast(`Error: ${result.message || 'Failed to exclude match'}`, 'error');
      }
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error');
    } finally {
      excludeProcessing = false;
      console.log('Exclude operation completed');
    }
  }

  async function loadComparisonView(date, bookingId, resosBookingId) {
    const containerId = 'comparison-' + date + '-' + resosBookingId;
    const comparisonContainer = document.getElementById(containerId);
    if (!comparisonContainer) return;

    // If already visible, hide it
    if (comparisonContainer.style.display === 'block') {
      comparisonContainer.style.display = 'none';
      return;
    }

    // Get button that triggered this to access data attributes
    const triggerButton = event.target.closest('button[data-action="view-comparison"]');
    const isConfirmed = triggerButton && triggerButton.dataset.isConfirmed === '1';
    const isMatchedElsewhere = triggerButton && triggerButton.dataset.isMatchedElsewhere === '1';
    const hotelBookingId = triggerButton ? triggerButton.dataset.hotelBookingId : '';
    const guestName = triggerButton ? triggerButton.dataset.guestName : '';

    // Show loading state
    comparisonContainer.innerHTML = '<div class="bma-comparison-loading">Loading comparison data...</div>';
    comparisonContainer.style.display = 'block';
    comparisonContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
      const response = await fetch(`${window.apiClient.baseUrl}/comparison`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': window.apiClient.authHeader
        },
        body: JSON.stringify({
          booking_id: bookingId,
          resos_booking_id: resosBookingId,
          date: date
        })
      });

      const result = await response.json();

      if (result.success && result.comparison) {
        const comparisonHTML = buildComparisonHTML(result.comparison, date, resosBookingId, isConfirmed, isMatchedElsewhere, hotelBookingId, guestName);
        comparisonContainer.innerHTML = comparisonHTML;
      } else {
        comparisonContainer.innerHTML = `
          <div class="bma-comparison-error">
            Error loading comparison: ${result.message || 'Unknown error'}
          </div>
          <button class="bma-close-comparison" data-action="close-comparison" data-container-id="${containerId}">Close</button>
        `;
      }
    } catch (error) {
      comparisonContainer.innerHTML = `
        <div class="bma-comparison-error">
          Error: ${error.message}
        </div>
        <button class="bma-close-comparison" data-action="close-comparison" data-container-id="${containerId}">Close</button>
      `;
    }
  }

  function buildComparisonHTML(data, date, resosBookingId, isConfirmed, isMatchedElsewhere, hotelBookingId, guestName) {
    const hotel = data.hotel || {};
    const resos = data.resos || {};
    const matches = data.matches || {};
    const suggestions = data.suggested_updates || {};

    let html = '<div class="comparison-row-content">';
    html += '<div class="comparison-table-wrapper">';
    html += '<div class="comparison-header">Match Comparison</div>';
    html += '<table class="comparison-table">';
    html += '<thead><tr>';
    html += '<th>Field</th>';
    html += '<th>Newbook</th>';
    html += '<th>ResOS</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    // Guest Name row
    html += buildComparisonRow('Name', 'name', hotel.name, resos.name, matches.name, suggestions.name, false);

    // Phone row
    html += buildComparisonRow('Phone', 'phone', hotel.phone, resos.phone, matches.phone, suggestions.phone, false);

    // Email row
    html += buildComparisonRow('Email', 'email', hotel.email, resos.email, matches.email, suggestions.email, false);

    // People row
    html += buildComparisonRow('People', 'people', hotel.people, resos.people, matches.people, suggestions.people, false);

    // Tariff/Package row
    html += buildComparisonRow('Package', 'dbb', hotel.rate_type, resos.dbb, matches.dbb, suggestions.dbb, false);

    // Booking # row
    html += buildComparisonRow('#', 'booking_ref', hotel.booking_id, resos.booking_ref, matches.booking_ref, suggestions.booking_ref, false);

    // Hotel Guest row
    const hotelGuestValue = hotel.is_hotel_guest ? 'Yes' : '-';
    html += buildComparisonRow('Resident', 'hotel_guest', hotelGuestValue, resos.hotel_guest, false, suggestions.hotel_guest, false);

    // Status row
    const statusIcon = getStatusIcon(resos.status || 'request');
    const resosStatusHTML = `<span class="material-symbols-outlined">${statusIcon}</span> ${escapeHTML((resos.status || 'request').charAt(0).toUpperCase() + (resos.status || 'request').slice(1))}`;
    html += buildComparisonRow('Status', 'status', hotel.status, resosStatusHTML, false, suggestions.status, true);

    html += '</tbody>';
    html += '</table>';
    html += '</div>'; // comparison-table-wrapper

    // Add action buttons section
    const hasSuggestions = suggestions && Object.keys(suggestions).length > 0;
    const containerId = 'comparison-' + date + '-' + resosBookingId;

    html += '<div class="comparison-actions-buttons">';

    // 1. Close button (always shown, first)
    html += `<button class="btn-close-comparison" data-action="close-comparison" data-container-id="${containerId}">`;
    html += '<span class="material-symbols-outlined">close</span> Close';
    html += '</button>';

    // 2. Exclude Match button (only for non-confirmed, non-matched-elsewhere matches)
    if (!isConfirmed && !isMatchedElsewhere && resosBookingId && hotelBookingId) {
      html += `<button class="btn-exclude-match" data-action="exclude-match" data-resos-booking-id="${resosBookingId}" data-hotel-booking-id="${hotelBookingId}" data-guest-name="${escapeHTML(guestName || 'Guest')}">`;
      html += '<span class="material-symbols-outlined">close</span> Exclude Match';
      html += '</button>';
    }

    // 3. Update button (only if there are suggested updates)
    if (hasSuggestions) {
      const buttonLabel = isConfirmed ? 'Update Selected' : 'Update Selected & Match';
      const buttonClass = isConfirmed ? 'btn-confirm-match btn-update-confirmed' : 'btn-confirm-match';
      html += `<button class="${buttonClass}" data-action="submit-suggestions" data-date="${date}" data-resos-booking-id="${resos.id}" data-hotel-booking-id="${hotelBookingId}" data-is-confirmed="${isConfirmed}">`;
      html += `<span class="material-symbols-outlined">check_circle</span> ${buttonLabel}`;
      html += '</button>';
    }

    html += '</div>'; // comparison-actions-buttons
    html += '</div>'; // comparison-row-content

    return html;
  }

  // Build a single comparison table row
  function buildComparisonRow(label, field, hotelValue, resosValue, isMatch, suggestionValue, isHTML = false) {
    const matchClass = isMatch ? ' class="match-row"' : '';
    const hasSuggestion = suggestionValue !== undefined && suggestionValue !== null;

    let hotelDisplay = hotelValue !== undefined && hotelValue !== null && hotelValue !== ''
      ? (isHTML ? hotelValue : escapeHTML(String(hotelValue)))
      : '<em style="color: #adb5bd;">-</em>';

    let resosDisplay = resosValue !== undefined && resosValue !== null && resosValue !== ''
      ? (isHTML ? resosValue : escapeHTML(String(resosValue)))
      : '<em style="color: #adb5bd;">-</em>';

    // Get plain text values for title attributes (tooltips)
    const hotelTitle = hotelValue !== undefined && hotelValue !== null && hotelValue !== ''
      ? String(hotelValue)
      : '';
    const resosTitle = resosValue !== undefined && resosValue !== null && resosValue !== ''
      ? String(resosValue)
      : '';

    // Main comparison row (3 columns: Field, Newbook, ResOS)
    let html = `<tr${matchClass}>`;
    html += `<td><strong>${escapeHTML(label)}</strong></td>`;
    html += hotelTitle ? `<td title="${escapeHTML(hotelTitle)}">${hotelDisplay}</td>` : `<td>${hotelDisplay}</td>`;
    html += resosTitle ? `<td title="${escapeHTML(resosTitle)}">${resosDisplay}</td>` : `<td>${resosDisplay}</td>`;
    html += '</tr>';

    // If there's a suggestion, add a suggestion row below
    if (hasSuggestion) {
      const isCheckedByDefault = field !== 'people'; // Uncheck "people" by default, check all others
      const checkedAttr = isCheckedByDefault ? ' checked' : '';

      let suggestionDisplay;
      if (suggestionValue === '') {
        suggestionDisplay = '<em style="color: #999;">(Remove)</em>';
      } else {
        suggestionDisplay = escapeHTML(String(suggestionValue));
      }

      html += `<tr class="suggestion-row">`;
      html += `<td colspan="3">`;
      html += `<div class="suggestion-content">`;
      html += `<label>`;
      html += `<input type="checkbox" class="suggestion-checkbox" name="suggestion_${field}" value="${escapeHTML(String(suggestionValue))}"${checkedAttr}> `;
      html += `Update to: ${suggestionDisplay}`;
      html += `</label>`;
      html += `</div>`;
      html += `</td>`;
      html += `</tr>`;
    }

    return html;
  }

  // Get status icon for Material Symbols
  function getStatusIcon(status) {
    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'approved':
      case 'confirmed':
        return 'check_circle';
      case 'request':
        return 'help';
      case 'declined':
        return 'cancel';
      case 'waitlist':
        return 'schedule';
      case 'arrived':
        return 'login';
      case 'seated':
        return 'event_seat';
      case 'left':
        return 'logout';
      case 'no_show':
      case 'no-show':
        return 'person_off';
      case 'canceled':
      case 'cancelled':
        return 'block';
      default:
        return 'help';
    }
  }

  // Escape HTML to prevent XSS
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Custom Modal System
  function showModal(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
      const modal = document.getElementById('bma-custom-modal');
      const titleEl = document.getElementById('bma-modal-title');
      const messageEl = document.getElementById('bma-modal-message');
      const confirmBtn = document.getElementById('bma-modal-confirm');
      const cancelBtn = document.getElementById('bma-modal-cancel');

      titleEl.textContent = title;
      messageEl.textContent = message;
      confirmBtn.textContent = confirmText;
      cancelBtn.textContent = cancelText;

      modal.classList.add('show');

      const handleConfirm = () => {
        cleanup();
        resolve(true);
      };

      const handleCancel = () => {
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        modal.classList.remove('show');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
    });
  }

  // Toast Notification System
  function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('bma-toast-container');

    const toast = document.createElement('div');
    toast.className = `bma-toast ${type}`;

    const iconMap = {
      success: 'check_circle',
      error: 'error',
      info: 'info'
    };

    toast.innerHTML = `
      <span class="material-symbols-outlined bma-toast-icon">${iconMap[type] || 'info'}</span>
      <div class="bma-toast-content">
        <p class="bma-toast-message">${message}</p>
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastSlideIn 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Submit selected suggestions from comparison checkboxes
  async function submitSuggestions(date, resosBookingId, hotelBookingId, isConfirmed) {
    const containerId = 'comparison-' + date + '-' + resosBookingId;
    const container = document.getElementById(containerId);
    if (!container) return;

    // Find all checked suggestion checkboxes in this comparison container
    const checkboxes = container.querySelectorAll('.suggestion-checkbox:checked');

    if (checkboxes.length === 0) {
      showToast('Please select at least one suggestion to update', 'error');
      return;
    }

    // Build updates object from checked checkboxes
    const updates = {};
    checkboxes.forEach(checkbox => {
      const name = checkbox.name.replace('suggestion_', '');
      let value = checkbox.value;

      // Handle special mappings
      if (name === 'name') {
        updates.guest_name = value;
      } else if (name === 'booking_ref') {
        updates.booking_ref = value;
      } else if (name === 'hotel_guest') {
        updates.hotel_guest = value;
      } else if (name === 'dbb') {
        updates.dbb = value; // Empty string means remove
      } else if (name === 'people') {
        updates.people = parseInt(value);
      } else if (name === 'status') {
        updates.status = value;
      } else {
        updates[name] = value;
      }
    });

    // Find the submit button to show loading state
    const submitBtn = container.querySelector('.btn-confirm-match');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Updating...';
    }

    try {
      const response = await fetch(`${window.apiClient.baseUrl}/bookings/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': window.apiClient.authHeader
        },
        body: JSON.stringify({
          booking_id: resosBookingId,
          updates: updates
        })
      });

      const result = await response.json();

      if (result.success) {
        showToast('✓ Booking updated successfully!', 'success');
        window.reloadRestaurantTab();
      } else {
        showToast(`Error: ${result.message || 'Failed to update booking'}`, 'error');
      }
    } catch (error) {
      showToast(`Error: ${error.message}`, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = isConfirmed ? 'Update Selected' : 'Update Selected & Match';
      }
    }
  }

  function closeComparison(containerId) {
    const comparisonContainer = document.getElementById(containerId);
    if (comparisonContainer) {
      comparisonContainer.style.display = 'none';
    }
  }

  function showFeedback(feedbackElement, message, type) {
    if (!feedbackElement) return;
    feedbackElement.textContent = message;
    feedbackElement.className = `bma-form-feedback ${type}`;
    feedbackElement.style.display = 'block';
  }

  // Event listener for "Open Booking in NewBook" buttons in Restaurant tab
  container.addEventListener('click', function(event) {
    const button = event.target.closest('.open-booking-btn');
    if (button && button.dataset.bookingId) {
      const bookingId = button.dataset.bookingId;
      const newbookUrl = `https://appeu.newbook.cloud/bookings_view/${bookingId}`;

      // Open in current tab
      chrome.tabs.update({ url: newbookUrl });
    }
  });
}

function updateTimeSincePlaced(container) {
  const bookingCards = container.querySelectorAll('.booking-card');
  const highlightThreshold = STATE.settings.highlightNewestMinutes || 60;

  bookingCards.forEach(card => {
    const placedTime = card.dataset.bookingPlaced;
    if (!placedTime) return;

    const timeSinceElement = card.querySelector('.time-since-placed');
    if (!timeSinceElement) return;

    // Calculate time difference
    const placed = new Date(placedTime);
    const now = new Date();
    const diffMs = now - placed;
    const diffMinutes = Math.floor(diffMs / 60000);

    // Format time since placed
    const timeString = formatTimeSince(diffMinutes);
    timeSinceElement.textContent = timeString;

    // Apply highlighting if within threshold
    if (diffMinutes <= highlightThreshold) {
      card.classList.add('new-booking');
    } else {
      card.classList.remove('new-booking');
    }
  });
}

function formatTimeSince(minutes) {
  if (minutes < 1) {
    return 'Just now';
  } else if (minutes < 60) {
    return `${minutes}m ago`;
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) {
      return `${hours}h ago`;
    }
    return `${hours}h ${mins}m ago`;
  } else {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    if (hours === 0) {
      return `${days}d ago`;
    }
    return `${days}d ${hours}h ago`;
  }
}

function showError(tabName, message) {
  const tabContent = document.querySelector(`[data-content="${tabName}"]`);
  const errorElement = tabContent.querySelector('.tab-error');

  errorElement.querySelector('.error-message').textContent = message;
  errorElement.classList.remove('hidden');

  tabContent.querySelector('.tab-loading').classList.add('hidden');
  tabContent.querySelector('.tab-data').classList.add('hidden');
  tabContent.querySelector('.tab-empty')?.classList.add('hidden');
}

function showEmpty(tabName) {
  const tabContent = document.querySelector(`[data-content="${tabName}"]`);
  const emptyElement = tabContent.querySelector('.tab-empty');

  if (emptyElement) {
    emptyElement.classList.remove('hidden');
    tabContent.querySelector('.tab-loading').classList.add('hidden');
    tabContent.querySelector('.tab-data').classList.add('hidden');
    tabContent.querySelector('.tab-error').classList.add('hidden');
  }
}

function updateBadge(tabName, criticalCount, warningCount) {
  console.log(`Updating badge for ${tabName}: critical=${criticalCount}, warning=${warningCount}`);
  STATE.badges[tabName] = { critical: criticalCount, warning: warningCount };
  const badgeElement = document.querySelector(`[data-badge="${tabName}"]`);

  if (!badgeElement) {
    console.error(`Badge element not found for ${tabName}`);
    return;
  }

  const totalCount = criticalCount + warningCount;

  // Show total count but style based on priority
  if (totalCount > 0) {
    badgeElement.textContent = totalCount;
    badgeElement.classList.remove('hidden');

    // Style based on priority: if ANY critical issues, show red; otherwise amber
    if (criticalCount > 0) {
      badgeElement.classList.remove('warning');
      badgeElement.classList.add('critical');
      console.log(`Badge for ${tabName} showing ${totalCount} total issues (${criticalCount} critical, ${warningCount} warning) - RED`);
    } else {
      badgeElement.classList.remove('critical');
      badgeElement.classList.add('warning');
      console.log(`Badge for ${tabName} showing ${totalCount} total issues (${warningCount} warning) - AMBER`);
    }
  }
  // No issues - hide badge
  else {
    badgeElement.classList.add('hidden');
    badgeElement.classList.remove('critical', 'warning');
    console.log(`Badge for ${tabName} hidden (no issues)`);
  }
}

// Tab Management
function switchTab(tabName) {
  // Save current scroll position before switching
  const currentContent = document.querySelector(`[data-content="${STATE.currentTab}"]`);
  if (currentContent) {
    STATE.scrollPositions[STATE.currentTab] = currentContent.scrollTop;
  }

  // Update state
  STATE.currentTab = tabName;

  // Update UI
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

  // Load tab content if not cached
  if (tabName === 'summary') {
    loadSummaryTab();
    resetInactivityTimer(); // Clear inactivity timer on Summary tab
  } else if (tabName === 'restaurant') {
    loadRestaurantTab();
    startInactivityTimer();
  } else if (tabName === 'checks') {
    loadChecksTab();
    startInactivityTimer();
  }

  // Restore scroll position after a short delay
  setTimeout(() => {
    const newContent = document.querySelector(`[data-content="${tabName}"]`);
    if (newContent && STATE.scrollPositions[tabName]) {
      newContent.scrollTop = STATE.scrollPositions[tabName];
    }
  }, 100);
}

// Summary Tab
async function loadSummaryTab(isAutoRefresh = false) {
  if (!STATE.settings) {
    showError('summary', 'Please configure settings first');
    return;
  }

  try {
    // Only show loading spinner on first load, not on auto-refresh
    if (!isAutoRefresh) {
      showLoading('summary');
    }

    const api = new APIClient(STATE.settings);
    const data = await api.fetchSummary();

    if (data.success && data.html) {
      // Check if data has changed (compare counts instead of HTML to avoid false positives)
      const dataSignature = `${data.bookings_count}-${data.critical_count}-${data.warning_count}`;
      const cachedSignature = STATE.cache.summary
        ? `${STATE.cache.summary.bookings_count}-${STATE.cache.summary.critical_count}-${STATE.cache.summary.warning_count}`
        : null;

      const hasChanged = !STATE.cache.summary || cachedSignature !== dataSignature;

      console.log(`Summary check: cached="${cachedSignature}", new="${dataSignature}", changed=${hasChanged}, isAutoRefresh=${isAutoRefresh}`);

      // Always show data if:
      // 1. Data has changed, OR
      // 2. This is NOT an auto-refresh (manual tab switch or first load)
      if (hasChanged || !isAutoRefresh) {
        showData('summary', data.html);
        updateBadge('summary', data.critical_count || 0, data.warning_count || 0);
        STATE.cache.summary = data;
        STATE.lastSummaryUpdate = Date.now(); // Track update time only when data changes
        console.log(hasChanged ? 'Summary updated with new data' : 'Summary displayed (no change but manual load)');
      } else {
        // Only skip display during auto-refresh when nothing changed
        console.log('Summary unchanged during auto-refresh - showing no changes message');
        updateBadge('summary', data.critical_count || 0, data.warning_count || 0);
        // Don't update lastSummaryUpdate - keep the original timestamp
        showNoChangesMessage();
      }

      // Show/restart countdown
      showSummaryCountdown();
    } else {
      showError('summary', 'Invalid response from API');
    }
  } catch (error) {
    console.error('Error loading summary:', error);
    showError('summary', error.message);
  }
}

function showSummaryCountdown() {
  const countdownElement = document.querySelector('[data-content="summary"] .summary-countdown');
  const countdownText = countdownElement.querySelector('.countdown-text');

  countdownElement.classList.remove('hidden');

  // Clear existing countdown
  if (STATE.timers.summaryCountdown) {
    clearInterval(STATE.timers.summaryCountdown);
  }

  let secondsLeft = STATE.settings.summaryRefreshRate;
  updateCountdownText(countdownText, secondsLeft);

  STATE.timers.summaryCountdown = setInterval(() => {
    secondsLeft--;
    updateCountdownText(countdownText, secondsLeft);

    if (secondsLeft <= 0) {
      // Check if any booking cards are expanded (user is reading)
      const expandedCards = document.querySelectorAll('.booking-card.expanded');
      if (expandedCards.length > 0) {
        // Check how long since last user interaction
        const idleMinutes = (Date.now() - STATE.lastSummaryInteraction) / 1000 / 60;
        const maxIdleMinutes = 5; // Resume refresh after 5 minutes of inactivity

        if (idleMinutes >= maxIdleMinutes) {
          // User has been idle too long - assume they've left, resume refresh
          console.log(`Auto-refresh resuming - user idle for ${idleMinutes.toFixed(1)} minutes`);
          loadSummaryTab(true); // Pass true to indicate auto-refresh
        } else {
          // Don't refresh while user is reading - reset countdown
          console.log('Auto-refresh paused - user has expanded booking cards');
          const idleSecondsRemaining = Math.ceil((maxIdleMinutes - idleMinutes) * 60);
          countdownText.innerHTML = `<strong style="color: #f59e0b;">⏸ Auto-refresh paused (booking expanded)</strong><br><span style="font-size: 11px; color: #6b7280;">Resumes after ${Math.ceil(idleSecondsRemaining / 60)}min idle</span>`;
          setTimeout(() => {
            secondsLeft = STATE.settings.summaryRefreshRate;
            updateCountdownText(countdownText, secondsLeft);
          }, 2000);
        }
      } else {
        loadSummaryTab(true); // Pass true to indicate auto-refresh
      }
    }
  }, 1000);
}

function updateCountdownText(element, seconds) {
  element.innerHTML = `Checking for updates in <strong>${seconds}</strong>s`;
  updateLastUpdatedText();
}

function updateLastUpdatedText() {
  const lastUpdatedElement = document.querySelector('[data-content="summary"] .last-updated-text');
  if (!lastUpdatedElement || !STATE.lastSummaryUpdate) return;

  const now = Date.now();
  const elapsed = now - STATE.lastSummaryUpdate;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);

  let timeText;
  if (minutes === 0 && seconds < 10) {
    timeText = 'just now';
  } else if (minutes === 0) {
    timeText = `${seconds}s ago`;
  } else if (minutes < 60) {
    timeText = `${minutes}m ago`;
  } else {
    const hours = Math.floor(minutes / 60);
    timeText = `${hours}h ago`;
  }

  lastUpdatedElement.textContent = `Last updated: ${timeText}`;
}

function showNoChangesMessage() {
  const countdownElement = document.querySelector('[data-content="summary"] .summary-countdown');
  const countdownText = countdownElement.querySelector('.countdown-text');

  // Update the last updated text first
  updateLastUpdatedText();

  // Show "No new bookings" message with last updated info
  const lastUpdatedElement = document.querySelector('[data-content="summary"] .last-updated-text');
  const lastUpdatedText = lastUpdatedElement ? lastUpdatedElement.textContent : '';

  countdownText.innerHTML = `<strong style="color: #10b981;">No new bookings</strong><br><span style="font-size: 11px; color: #6b7280;">${lastUpdatedText}</span>`;

  // Reset to countdown after 2 seconds
  setTimeout(() => {
    const secondsLeft = STATE.settings.summaryRefreshRate;
    updateCountdownText(countdownText, secondsLeft);
  }, 2000);
}

// Restaurant Tab
async function loadRestaurantTab() {
  if (!STATE.settings) {
    showError('restaurant', 'Please configure settings first');
    return;
  }

  if (!STATE.currentBookingId) {
    showEmpty('restaurant');
    updateBadge('restaurant', 0);
    return;
  }

  try {
    showLoading('restaurant');
    const api = new APIClient(STATE.settings);
    const data = await api.fetchRestaurantMatch(STATE.currentBookingId);

    if (data.success && data.html) {
      showData('restaurant', data.html);
      updateBadge('restaurant', data.critical_count || 0, data.warning_count || 0);
      STATE.cache.restaurant = data;

      // Store restaurant bookings by date for Gantt chart
      if (data.bookings_by_date) {
        STATE.restaurantBookings = data.bookings_by_date;
        console.log('DEBUG: Stored restaurant bookings:', STATE.restaurantBookings);
      }

      // Process navigation context after content is loaded
      setTimeout(() => {
        processNavigationContext();
      }, 100);
    } else if (data.success && !data.html) {
      showEmpty('restaurant');
      updateBadge('restaurant', 0, 0);
    } else {
      showError('restaurant', 'Invalid response from API');
    }
  } catch (error) {
    console.error('Error loading restaurant tab:', error);
    showError('restaurant', error.message);
  }
}

// Checks Tab
async function loadChecksTab() {
  if (!STATE.settings) {
    showError('checks', 'Please configure settings first');
    return;
  }

  if (!STATE.currentBookingId) {
    showEmpty('checks');
    updateBadge('checks', 0);
    return;
  }

  try {
    showLoading('checks');
    const api = new APIClient(STATE.settings);
    const data = await api.fetchChecks(STATE.currentBookingId);

    if (data.success && data.html) {
      showData('checks', data.html);
      updateBadge('checks', data.critical_count || 0, data.warning_count || 0);
      STATE.cache.checks = data;
    } else if (data.success && !data.html) {
      showEmpty('checks');
      updateBadge('checks', 0, 0);
    } else {
      showError('checks', 'Invalid response from API');
    }
  } catch (error) {
    console.error('Error loading checks tab:', error);
    showError('checks', error.message);
  }
}

// Inactivity Timer (return to Summary after configured timeout on Restaurant/Checks tabs)
function startInactivityTimer() {
  resetInactivityTimer();

  // Get timeout from settings (default to 60 seconds if not set)
  const timeoutSeconds = STATE.settings?.inactivityTimeout || 60;
  const timeoutMs = timeoutSeconds * 1000;

  STATE.timers.inactivityTimeout = setTimeout(() => {
    // Check if we should pause due to form being open
    const pauseWhenFormOpen = STATE.settings?.pauseInactivityWhenFormOpen !== false; // Default to true

    if (pauseWhenFormOpen && STATE.createFormOpen) {
      console.log('Inactivity timer paused - create form is open');
      // Restart the timer - it will check again after the timeout
      startInactivityTimer();
      return;
    }

    if (STATE.currentTab !== 'summary') {
      console.log(`Inactivity timeout (${timeoutSeconds}s) - returning to summary`);
      switchTab('summary');
    }
  }, timeoutMs);
}

function resetInactivityTimer() {
  if (STATE.timers.inactivityTimeout) {
    clearTimeout(STATE.timers.inactivityTimeout);
    STATE.timers.inactivityTimeout = null;
  }
}

// Booking Detection Handler
function handleBookingDetected(bookingId) {
  console.log('Booking detected, updating sidepanel for booking:', bookingId);
  STATE.currentBookingId = bookingId;

  // Load both Restaurant and Checks tabs in parallel
  Promise.all([
    loadRestaurantTabSilently(),
    loadChecksTabSilently()
  ]).then(([restaurantData, checksData]) => {
    // Determine which tab to switch to based on priority
    const restaurantCritical = restaurantData?.critical_count || 0;
    const restaurantWarning = restaurantData?.warning_count || 0;
    const checksCritical = checksData?.critical_count || 0;
    const checksWarning = checksData?.warning_count || 0;

    console.log('Badge counts - Restaurant: critical=' + restaurantCritical + ', warning=' + restaurantWarning +
                ', Checks: critical=' + checksCritical + ', warning=' + checksWarning);

    // Priority logic:
    // 1. Restaurant tab if it has critical issues (package alerts)
    // 2. Checks tab if it has critical issues
    // 3. Restaurant tab if it has warnings
    // 4. Checks tab if it has warnings
    // 5. Restaurant tab as fallback (always show restaurant when booking detected)
    if (restaurantCritical > 0) {
      console.log('Switching to restaurant tab (has critical issues)');
      switchTab('restaurant');
    } else if (checksCritical > 0) {
      console.log('Switching to checks tab (has critical issues)');
      switchTab('checks');
    } else if (restaurantWarning > 0) {
      console.log('Switching to restaurant tab (has warnings)');
      switchTab('restaurant');
    } else if (checksWarning > 0) {
      console.log('Switching to checks tab (has warnings)');
      switchTab('checks');
    } else {
      // Fallback to restaurant tab even without issues
      console.log('Switching to restaurant tab (fallback, no issues)');
      switchTab('restaurant');
    }
  }).catch(error => {
    console.error('Error loading booking data:', error);
  });
}

async function loadRestaurantTabSilently() {
  try {
    const api = new APIClient(STATE.settings);
    const data = await api.fetchRestaurantMatch(STATE.currentBookingId);
    console.log('Restaurant data loaded, critical:', data.critical_count, 'warning:', data.warning_count);
    console.log('Full restaurant API response:', JSON.stringify(data, null, 2));
    updateBadge('restaurant', data.critical_count || 0, data.warning_count || 0);
    STATE.cache.restaurant = data;

    // Store restaurant bookings by date for Gantt chart
    if (data.bookings_by_date) {
      STATE.restaurantBookings = data.bookings_by_date;
      console.log('DEBUG: Stored restaurant bookings:', STATE.restaurantBookings);
    }

    return data;
  } catch (error) {
    console.error('Error loading restaurant data:', error);
    return null;
  }
}

async function loadChecksTabSilently() {
  try {
    const api = new APIClient(STATE.settings);
    const data = await api.fetchChecks(STATE.currentBookingId);
    console.log('Checks data loaded, critical:', data.critical_count, 'warning:', data.warning_count);
    console.log('Full checks API response:', JSON.stringify(data, null, 2));
    updateBadge('checks', data.critical_count || 0, data.warning_count || 0);
    STATE.cache.checks = data;
    return data;
  } catch (error) {
    console.error('Error loading checks data:', error);
    return null;
  }
}

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Sidepanel received message:', message);

  if (message.action === 'bookingDetected') {
    console.log('Processing bookingDetected message, source:', message.source);
    handleBookingDetected(message.bookingId);
  } else if (message.action === 'plannerClick') {
    if (STATE.settings?.enablePlannerClickUpdate) {
      console.log('Processing plannerClick message (setting enabled)');
      handleBookingDetected(message.bookingId);
    } else {
      console.log('Ignoring plannerClick message (setting disabled)');
    }
  } else if (message.action === 'sessionLockChanged') {
    console.log('Processing sessionLockChanged message:', message.isLocked);
    AuthManager.handleSessionLock(message.isLocked);
  } else if (message.action === 'settingsUpdated') {
    console.log('Settings updated, reloading current tab');
    loadSettings().then(() => {
      // Reinitialize global API client with new settings
      window.apiClient = new APIClient(STATE.settings);
      console.log('Global apiClient reinitialized after settings update');

      // Reload current tab
      if (STATE.currentTab === 'summary') {
        loadSummaryTab();
      } else if (STATE.currentTab === 'restaurant') {
        loadRestaurantTab();
      } else if (STATE.currentTab === 'checks') {
        loadChecksTab();
      }
    });
  }
});

// Load Settings
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    console.log('loadSettings - result:', result);
    console.log('loadSettings - settings:', result.settings);
    if (result.settings && result.settings.apiRootUrl) {
      STATE.settings = result.settings;
      console.log('Settings loaded successfully:', STATE.settings);
      console.log('recentBookingsCount:', STATE.settings.recentBookingsCount);
      return true;
    } else {
      showError('summary', 'Please configure API settings first');
      return false;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    showError('summary', 'Error loading settings');
    return false;
  }
}

// Event Listeners
document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', () => {
    switchTab(button.dataset.tab);
  });
});

document.querySelectorAll('.retry-button').forEach(button => {
  button.addEventListener('click', () => {
    const tabContent = button.closest('.tab-content');
    const tabName = tabContent.dataset.content;

    if (tabName === 'summary') {
      loadSummaryTab();
    } else if (tabName === 'restaurant') {
      loadRestaurantTab();
    } else if (tabName === 'checks') {
      loadChecksTab();
    }
  });
});

// Initialize
async function init() {
  const settingsLoaded = await loadSettings();

  if (settingsLoaded) {
    // Initialize global API client for use by injected template content
    window.apiClient = new APIClient(STATE.settings);
    console.log('Global apiClient initialized');

    // Start cookie monitoring for NewBook auth
    AuthManager.startCookieMonitoring();

    // Check NewBook authentication status
    const isAuthenticated = await AuthManager.updateAuthState();

    // Only load tabs if authenticated
    if (isAuthenticated) {
      // Set up global inactivity timer reset on ANY user interaction
      setupGlobalInactivityReset();

      // Load summary tab on startup
      loadSummaryTab();

      // Check if there's a current booking from storage
      const result = await chrome.storage.local.get('currentBookingId');
      if (result.currentBookingId) {
        STATE.currentBookingId = result.currentBookingId;
      }
    }
  }
}

// Global inactivity timer reset - detects ANY user activity
function setupGlobalInactivityReset() {
  const resetTimerGlobal = () => {
    // Only reset if we're on Restaurant or Checks tab
    if (STATE.currentTab === 'restaurant' || STATE.currentTab === 'checks') {
      resetInactivityTimer();
      startInactivityTimer();
    }
  };

  // Debounced version for mousemove to prevent excessive calls
  let mouseMoveTimeout;
  const debouncedMouseMove = () => {
    clearTimeout(mouseMoveTimeout);
    mouseMoveTimeout = setTimeout(resetTimerGlobal, 500); // Only reset after 500ms of mouse movement
  };

  // Listen for ANY user interaction on the document
  document.addEventListener('click', resetTimerGlobal, true);
  document.addEventListener('scroll', resetTimerGlobal, { passive: true, capture: true });
  document.addEventListener('keydown', resetTimerGlobal, true);
  document.addEventListener('mousemove', debouncedMouseMove, { passive: true, capture: true });
  document.addEventListener('touchstart', resetTimerGlobal, { passive: true, capture: true });

  console.log('Global inactivity timer reset listeners attached');
}

// Global function to reload restaurant tab (called by injected template content after booking actions)
window.reloadRestaurantTab = function() {
  console.log('reloadRestaurantTab called');
  loadRestaurantTab();
};

// Start the app
document.addEventListener('DOMContentLoaded', init);
