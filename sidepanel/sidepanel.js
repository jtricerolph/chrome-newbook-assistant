// State management
const STATE = {
  currentTab: 'summary',
  currentBookingId: null,
  settings: null,
  badges: {
    summary: { critical: 0, warning: 0 },
    restaurant: { critical: 0, warning: 0 },
    checks: { critical: 0, warning: 0 },
    staying: { critical: 0, warning: 0 }
  },
  timers: {
    summaryRefresh: null,
    summaryCountdown: null,
    inactivityTimeout: null,
    staleRefresh: null
  },
  cache: {
    summary: null,
    restaurant: null,
    checks: null,
    staying: null
  },
  newbookAuth: {
    isAuthenticated: false,
    checking: false
  },
  lastSummaryInteraction: Date.now(), // Track last user interaction on Summary tab
  lastSummaryUpdate: null, // Track when summary was last updated
  lastRestaurantUpdate: null, // Track when restaurant tab was last updated
  lastChecksUpdate: null, // Track when checks tab was last updated
  lastStayingUpdate: null, // Track when staying tab was last updated
  sessionLocked: false, // Track NewBook session lock dialog status
  createFormOpen: false, // Track if any create booking form is open
  navigationContext: null, // Track navigation context for cross-tab navigation
  loadedBookingIds: {
    restaurant: null, // Track which booking ID is currently loaded in Restaurant tab
    checks: null,
    summary: false, // Track if Summary tab has been loaded
    staying: null // Track which date is currently loaded in Staying tab
  },
  scrollPositions: {
    summary: 0,
    restaurant: 0,
    checks: 0,
    staying: 0
  }, // Track scroll positions per tab/date
  restaurantBookings: {}, // Store restaurant bookings by date: { '2026-01-31': [{time, people, name, room}, ...] }
  stayingDate: new Date().toISOString().split('T')[0] // Current date for staying tab
  // activeGroupFilter moved to window.activeGroupFilter (managed by inline API template script)
};

// Debug logging utility - respects enableDebugLogging setting
const BMA_LOG = {
  log: (...args) => {
    if (STATE.settings?.enableDebugLogging) {
      console.log(...args);
    }
  },
  warn: (...args) => {
    if (STATE.settings?.enableDebugLogging) {
      console.warn(...args);
    }
  },
  error: (...args) => {
    // Always log errors
    console.error(...args);
  },
  info: (...args) => {
    if (STATE.settings?.enableDebugLogging) {
      console.info(...args);
    }
  }
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
function navigateToRestaurantDate(date, bookingId = null, resosBookingId = null) {
  BMA_LOG.log('Navigating to Restaurant tab for date:', date, 'bookingId:', bookingId, 'resosBookingId:', resosBookingId);

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
    expandCreateForm: resosBookingId ? false : true, // Expand create form only if not viewing a comparison
    expandComparisonRow: resosBookingId ? { resosBookingId, date } : null, // Expand comparison row if resosBookingId provided
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
 * Navigate to checks tab with specific booking
 * @param {number} bookingId - Booking ID to show checks for
 */
function navigateToChecksTab(bookingId) {
  BMA_LOG.log('Navigating to Checks tab for bookingId:', bookingId);

  // Save current scroll position
  const currentContent = document.querySelector(`[data-content="${STATE.currentTab}"]`);
  if (currentContent) {
    STATE.scrollPositions[STATE.currentTab] = currentContent.scrollTop;
  }

  // Update current booking ID
  STATE.currentBookingId = bookingId;
  chrome.storage.local.set({ currentBookingId: bookingId });

  // Switch to checks tab
  switchTab('checks');
}

/**
 * Return to the previous context after completing a task
 */
function returnToPreviousContext() {
  if (!STATE.navigationContext || !STATE.navigationContext.returnTab) {
    BMA_LOG.log('No previous context to return to');
    return;
  }

  BMA_LOG.log('Returning to previous context:', STATE.navigationContext.returnTab);

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
 * @param {number} retryCount - Number of retries attempted so far
 */
async function processNavigationContext(retryCount = 0) {
  if (!STATE.navigationContext) {
    return;
  }

  const { targetDate, expandCreateForm, expandComparisonRow, scrollAfterLoad } = STATE.navigationContext;

  BMA_LOG.log('Processing navigation context:', STATE.navigationContext, 'retry:', retryCount);

  // Find the date section
  const dateSection = document.getElementById(`date-section-${targetDate}`);

  if (!dateSection) {
    // Retry up to 3 times with increasing delays if DOM isn't ready yet
    if (retryCount < 3) {
      BMA_LOG.warn(`Target date section not found: ${targetDate}, retrying in ${100 * (retryCount + 1)}ms...`);
      setTimeout(() => {
        processNavigationContext(retryCount + 1);
      }, 100 * (retryCount + 1));
      return;
    } else {
      BMA_LOG.error('Target date section not found after 3 retries:', targetDate);
      // Clear navigation context to prevent infinite retries
      STATE.navigationContext = null;
      return;
    }
  }

  // Expand comparison row if requested (for suggested matches)
  if (expandComparisonRow && typeof window.loadComparisonView === 'function') {
    const { resosBookingId, date } = expandComparisonRow;
    BMA_LOG.log('Expanding comparison row for resosBookingId:', resosBookingId, 'date:', date);

    // Call the loadComparisonView function to expand the comparison row
    // Note: We need to create a fake event object since loadComparisonView expects it
    const fakeEvent = {
      target: {
        closest: () => null // Return null since we're not clicking a button
      }
    };

    try {
      await window.loadComparisonView(date, STATE.currentBookingId, resosBookingId, null);
    } catch (error) {
      BMA_LOG.error('Error loading comparison view:', error);
    }
  }

  // Expand create form if requested
  if (expandCreateForm) {
    const createBtn = document.getElementById(`create-btn-${targetDate}`);
    const createForm = document.getElementById(`create-form-${targetDate}`);
    const status = document.getElementById(`status-${targetDate}`);

    if (createForm && createBtn) {
      // Show the form
      createForm.style.display = 'block';
      createBtn.style.display = 'none';
      if (status) status.style.display = 'none'; // Hide status message (same as manual toggle)
      STATE.createFormOpen = true;

      // Initialize form if not already initialized
      if (!createForm.dataset.initialized && typeof window.initializeCreateFormForDate === 'function') {
        BMA_LOG.log('Manually initializing form for date:', targetDate);
        createForm.dataset.initialized = 'true';
        await window.initializeCreateFormForDate(targetDate, createForm);
        BMA_LOG.log('Form initialization complete');
      } else {
        BMA_LOG.log('Form already initialized or function not available');
      }
    }
  }

  // Scroll to the bma-night section within the date section (or comparison row if expanded)
  if (scrollAfterLoad) {
    BMA_LOG.log('Autoscroll: scrollAfterLoad=true, attempting to scroll');
    // Use requestAnimationFrame to ensure DOM is fully rendered
    requestAnimationFrame(() => {
      setTimeout(() => {
        let targetElement;

        // If we expanded a comparison row, scroll to it; otherwise scroll to the date section
        if (expandComparisonRow) {
          const { resosBookingId, date } = expandComparisonRow;
          const containerId = 'comparison-' + date + '-' + resosBookingId;
          const comparisonContainer = document.getElementById(containerId);
          targetElement = comparisonContainer || dateSection.querySelector('.bma-night') || dateSection;
        } else {
          // Try to find the bma-night element within the date section for more precise scrolling
          const nightSection = dateSection.querySelector('.bma-night');
          targetElement = nightSection || dateSection;
        }

        BMA_LOG.log('Autoscroll: targetElement found?', !!targetElement);

        if (targetElement) {
          // Get the scrolling container (tab-content)
          const scrollContainer = targetElement.closest('.tab-content');
          BMA_LOG.log('Autoscroll: scrollContainer found?', !!scrollContainer);
          BMA_LOG.log('Autoscroll: scrollContainer height:', scrollContainer?.clientHeight, 'scrollHeight:', scrollContainer?.scrollHeight);

          if (scrollContainer) {
            // Force layout recalculation
            scrollContainer.offsetHeight;

            // Calculate position using getBoundingClientRect for accuracy
            const containerRect = scrollContainer.getBoundingClientRect();
            const elementRect = targetElement.getBoundingClientRect();
            const offset = 5; // Additional pixels below the tab title bar for visual spacing
            const scrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - offset;
            BMA_LOG.log('Autoscroll: scrolling to', scrollTop, '(current scrollTop:', scrollContainer.scrollTop, 'element relative top:', elementRect.top - containerRect.top, 'offset:', offset, ')');

            // Try both methods - direct assignment and scrollTo
            scrollContainer.scrollTop = scrollTop;
            scrollContainer.scrollTo(0, scrollTop);

            // Verify scroll happened
            setTimeout(() => {
              BMA_LOG.log('Autoscroll: After scroll - current scrollTop:', scrollContainer.scrollTop);
              if (scrollContainer.scrollTop === 0 && scrollTop > 0) {
                BMA_LOG.warn('Autoscroll FAILED: scrollTop is still 0, trying scrollIntoView fallback');
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 100);
          } else {
            // Fallback to standard scrollIntoView
            BMA_LOG.log('Autoscroll: using fallback scrollIntoView');
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        } else {
          BMA_LOG.log('Autoscroll: targetElement not found, skipping scroll');
        }
      }, 150);
    });
  } else {
    BMA_LOG.log('Autoscroll: scrollAfterLoad=false, skipping scroll');
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
    BMA_LOG.warn('Gantt chart not found:', chartId);
    return;
  }

  const viewport = chart.querySelector('.gantt-viewport-container');
  if (!viewport) {
    BMA_LOG.warn('Gantt viewport not found in chart:', chartId);
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
    BMA_LOG.warn('Gantt chart not found:', chartId);
    return;
  }

  const viewport = chart.querySelector('.gantt-viewport-container');
  if (!viewport) {
    BMA_LOG.warn('Gantt viewport not found in chart:', chartId);
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
    BMA_LOG.warn('Gantt chart not found:', chartId);
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
    BMA_LOG.warn('Sight line element not found for chart:', chartId);
    return;
  }

  // Calculate position as percentage of chart width
  // Get the chart container which has the time range data
  const chartContainer = chart.querySelector('.gantt-chart-container') || chart;

  // Read time range from data attributes (set by buildGanttChart)
  const startHour = parseInt(chartContainer.dataset.startHour);
  const totalMinutes = parseInt(chartContainer.dataset.totalMinutes);

  if (isNaN(startHour) || isNaN(totalMinutes)) {
    BMA_LOG.warn('Chart time range data not found');
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
    BMA_LOG.warn('Gantt chart not found:', chartId);
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
    BMA_LOG.warn('Chart time range data not found for auto-scroll');
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
        is_resident: booking.is_resident || false,
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
function buildGanttChart(openingHours, specialEvents = [], availableTimes = [], bookings = [], displayMode = 'compact', chartId = 'gantt', onlineBookingAvailable = true) {
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
  BMA_LOG.log('DEBUG buildGanttChart: Received', bookings.length, 'bookings, positioned', positionedBookings.length, 'bookings');

  // Calculate total height with proper spacing for time labels
  const topMargin = 20; // Space for time labels
  const bottomMargin = 40; // Extra space below last booking bar for visibility
  const totalGridRows = positionedBookings.length > 0 ? positionedBookings[0].total_grid_rows : 0;
  const minChartHeight = 150; // Minimum height to fill viewport even with few bookings
  const calculatedHeight = totalGridRows > 0 ? topMargin + (totalGridRows * config.gridRowHeight) + bottomMargin : 100;
  const chartHeight = Math.max(calculatedHeight, minChartHeight);

  // Add extra padding at the end so last booking doesn't get cut off by scrollbar
  const rightPadding = 100;
  const minWidth = (totalMinutes * 2) + rightPadding;

  let html = '<div class="gantt-chart-container" data-start-hour="' + startHour + '" data-total-minutes="' + totalMinutes + '" style="position: relative; height: ' + chartHeight + 'px; width: 100%; min-width: ' + minWidth + 'px; background: white; overflow: visible;">';

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

  // Grey overlay for online booking closed (full day)
  if (typeof onlineBookingAvailable !== 'undefined' && onlineBookingAvailable === false) {
    html += '<div class="gantt-closed-block online-booking-closed" style="position: absolute; left: 0%; top: ' + topMargin + 'px; width: 100%; height: ' + (chartHeight - topMargin) + 'px; background: rgba(230, 81, 0, 0.08); z-index: 3; pointer-events: none;"></div>';
  }

  // Grey overlays for special events (closures/restrictions)
  if (specialEvents && Array.isArray(specialEvents)) {
    specialEvents.forEach(event => {
      // Skip special opening events (isOpen = true)
      if (event.isOpen === true) return;

      // Full day closure
      if (!event.open && !event.close) {
        html += '<div class="gantt-closed-block special-event" style="position: absolute; left: 0%; top: ' + topMargin + 'px; width: 100%; height: ' + (chartHeight - topMargin) + 'px; background: rgba(100, 100, 100, 0.15); z-index: 3; pointer-events: none;"></div>';
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
            html += '<div class="gantt-closed-block special-event" style="position: absolute; left: ' + leftPercent + '%; top: ' + topMargin + 'px; width: ' + widthPercent + '%; height: ' + (chartHeight - topMargin) + 'px; background: rgba(100, 100, 100, 0.15); z-index: 3; pointer-events: none;"></div>';
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
    const isResident = booking.is_resident ? 'true' : 'false';

    html += '<div class="' + barClass + '" data-name="' + booking.name + '" data-people="' + booking.people + '" data-time="' + booking.time + '" data-is-resident="' + isResident + '" style="position: absolute; left: ' + leftPercent + '%; top: ' + yPosition + 'px; width: ' + widthPercent + '%; height: ' + barHeight + 'px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 4px; border: 2px solid #5568d3; padding: 2px 6px; color: white; font-weight: 500; display: flex; align-items: center; gap: 4px; overflow: hidden; cursor: pointer; z-index: 5;">';

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
 * Build special events alert banners HTML
 * @param {Array} specialEvents - Array of special event objects
 * @param {boolean} onlineBookingAvailable - Whether online booking is available
 * @returns {string} HTML string for alert banners
 */
function buildSpecialEventsAlert(specialEvents, onlineBookingAvailable) {
  let alertsHtml = '';

  // Add online booking closed warning if needed
  if (typeof onlineBookingAvailable !== 'undefined' && onlineBookingAvailable === false) {
    alertsHtml += '<div class="special-event-alert online-booking-closed">' +
      '<div class="special-event-header">' +
      '<span class="material-symbols-outlined">block</span>' +
      '<span class="special-event-title">Online Bookings Closed</span>' +
      '</div>' +
      '<div class="special-event-description">Online bookings closed from planner screen</div>' +
      '</div>';
  }

  // Add special event warnings
  if (specialEvents && Array.isArray(specialEvents) && specialEvents.length > 0) {
    specialEvents.forEach(function(event) {
      // Skip special events that are OPEN (isOpen = true)
      if (event.isOpen === true) {
        return;
      }

      const eventName = event.name || 'Service unavailable';
      let timeInfo = '';

      if (event.open && event.close) {
        const openHour = Math.floor(event.open / 100);
        const openMin = event.open % 100;
        const closeHour = Math.floor(event.close / 100);
        const closeMin = event.close % 100;

        timeInfo = openHour + ':' + (openMin < 10 ? '0' + openMin : openMin) + ' - ' +
          closeHour + ':' + (closeMin < 10 ? '0' + closeMin : closeMin);
      }

      const title = timeInfo ? timeInfo : 'All Day';

      alertsHtml += '<div class="special-event-alert">' +
        '<div class="special-event-header">' +
        '<span class="material-symbols-outlined">warning</span>' +
        '<span class="special-event-title">' + title + '</span>' +
        '</div>' +
        '<div class="special-event-description">' + (eventName || 'Restricted Service') + '</div>' +
        '</div>';
    });
  }

  return alertsHtml;
}

// Expose to window
window.buildSpecialEventsAlert = buildSpecialEventsAlert;

/**
 * Attach tooltip event listeners to Gantt booking bars
 * Shows booking details on hover: "{people} pax {name} [hotel icon]"
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
      const isResident = bar.getAttribute('data-is-resident') === 'true';

      BMA_LOG.log('Gantt tooltip - name:', name, 'isResident:', isResident, 'data-is-resident attr:', bar.getAttribute('data-is-resident'));

      // Format: "{people} pax {name} [hotel icon]" (Material Symbols hotel icon if resident)
      let tooltipHTML = `${people} pax ${name}`;
      if (isResident) {
        tooltipHTML += ' <span class="material-symbols-outlined" style="font-size: 14px; vertical-align: middle;">hotel</span>';
        BMA_LOG.log('Adding hotel icon to tooltip');
      }

      tooltip.innerHTML = tooltipHTML;
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
    BMA_LOG.warn('Sections container not found for date:', date);
    return;
  }

  const allHeaders = sectionsContainer.querySelectorAll('.period-header');
  const allTimes = sectionsContainer.querySelectorAll('.period-times');
  const clickedHeader = sectionsContainer.querySelector(`.period-header[data-period-index="${periodIndex}"]`);
  const clickedTimes = sectionsContainer.querySelector(`.period-times[data-period-index="${periodIndex}"]`);

  if (!clickedHeader || !clickedTimes) {
    BMA_LOG.warn('Period section not found for index:', periodIndex);
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

      BMA_LOG.log('Lazy loading times for period index:', periodIndex);

      // Call the loadAvailableTimesForPeriod function if it exists
      if (typeof loadAvailableTimesForPeriod !== 'undefined') {
        await loadAvailableTimesForPeriod(date, people, periodId, periodIndex);
      }
    }
  }

  BMA_LOG.log('Toggled period section:', periodIndex, 'expanded:', !isCurrentlyExpanded);
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
    BMA_LOG.warn('Form section not found:', sectionId);
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
    BMA_LOG.warn('Form not found:', formId);
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
    BMA_LOG.error('Error fetching opening hours:', error);
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
    BMA_LOG.error('Error fetching available times:', error);
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
    BMA_LOG.error('Error fetching dietary choices:', error);
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
    BMA_LOG.error('Error fetching special events:', error);
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
    const url = `${window.apiClient.baseUrl}/all-bookings-for-date?date=${date}`;
    BMA_LOG.log('fetchAllBookingsForDate - URL:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': window.apiClient.authHeader,
        'Content-Type': 'application/json'
      }
    });

    BMA_LOG.log('fetchAllBookingsForDate - Response status:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    BMA_LOG.log('fetchAllBookingsForDate - Response data:', data);
    BMA_LOG.log('fetchAllBookingsForDate - Bookings count:', data.bookings ? data.bookings.length : 0);

    // Debug: Log each booking's is_resident value
    if (data.bookings && data.bookings.length > 0) {
      data.bookings.forEach((booking, i) => {
        BMA_LOG.log(`Booking ${i}: name="${booking.name}", is_resident=${booking.is_resident}`);
      });
    }

    return data;
  } catch (error) {
    BMA_LOG.error('Error fetching all bookings for date:', error);
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

      BMA_LOG.log('NewBook cookies found:', allCookies.length);

      // Check if there's a valid session cookie
      // NewBook typically uses PHPSESSID or similar
      const sessionCookie = allCookies.find(cookie =>
        cookie.name === 'PHPSESSID' ||
        cookie.name.toLowerCase().includes('session') ||
        cookie.name.toLowerCase().includes('newbook')
      );

      const isAuthenticated = !!sessionCookie && !this.isCookieExpired(sessionCookie);

      BMA_LOG.log('NewBook authentication status:', isAuthenticated ? 'Authenticated' : 'Not authenticated');

      return isAuthenticated;
    } catch (error) {
      BMA_LOG.error('Error checking NewBook auth:', error);
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
    BMA_LOG.log('Session lock status updated:', isLocked ? 'LOCKED' : 'UNLOCKED');
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
        BMA_LOG.log('NewBook cookie changed:', changeInfo);

        // Debounce auth check to avoid too many checks
        clearTimeout(this._cookieCheckTimeout);
        this._cookieCheckTimeout = setTimeout(() => {
          this.updateAuthState();
        }, 1000);
      }
    });

    BMA_LOG.log('Cookie monitoring started');
  }
};

// API Client
class APIClient {
  constructor(settings) {
    this.settings = settings;
    this.baseUrl = settings.apiRootUrl;
    this.authHeader = 'Basic ' + btoa(`${settings.username}:${settings.applicationPassword}`);
  }

  async fetchSummary(force_refresh = false) {
    const limit = this.settings.recentBookingsCount || 10;
    BMA_LOG.log('fetchSummary - settings:', this.settings);
    BMA_LOG.log('fetchSummary - recentBookingsCount:', this.settings.recentBookingsCount);
    BMA_LOG.log('fetchSummary - limit:', limit);
    BMA_LOG.log('fetchSummary - force_refresh:', force_refresh);

    const url = `${this.baseUrl}/summary?context=chrome-summary&limit=${limit}&force_refresh=${force_refresh}`;
    BMA_LOG.log('fetchSummary - URL:', url);

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

  async fetchRestaurantMatch(bookingId, force_refresh = false) {
    const response = await fetch(`${this.baseUrl}/bookings/match`, {
      method: 'POST',
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        booking_id: parseInt(bookingId),
        context: 'chrome-sidepanel',
        force_refresh: force_refresh
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async fetchChecks(bookingId, force_refresh = false) {
    const response = await fetch(`${this.baseUrl}/checks/${bookingId}?context=chrome-checks&force_refresh=${force_refresh}`, {
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
    // Initialize GROUP modal event listeners after template loads
    initializeGroupModal();
  }

  // Check for stale cache indicators and schedule auto-refresh if enabled
  checkForStaleDataAndScheduleRefresh(tabName, dataElement);
}

// Check for stale cache indicators and schedule auto-refresh
function checkForStaleDataAndScheduleRefresh(tabName, dataElement) {
  // Check if stale indicators exist
  const staleIndicators = dataElement.querySelectorAll('.stale-indicator, .bma-stale-badge');

  if (staleIndicators.length === 0) {
    BMA_LOG.log(`[Stale Refresh] No stale indicators found in ${tabName} tab`);
    return;
  }

  BMA_LOG.log(`[Stale Refresh] Found ${staleIndicators.length} stale indicator(s) in ${tabName} tab`);

  // Get the autoRefreshOnStaleCache setting (default: true)
  const autoRefreshEnabled = STATE.settings?.autoRefreshOnStaleCache !== false;

  if (!autoRefreshEnabled) {
    BMA_LOG.log(`[Stale Refresh] Auto-refresh is disabled in settings`);
    return;
  }

  // Clear any existing stale refresh timer
  if (STATE.timers.staleRefresh) {
    clearTimeout(STATE.timers.staleRefresh);
    STATE.timers.staleRefresh = null;
  }

  // Schedule refresh after 10 seconds
  BMA_LOG.log(`[Stale Refresh] Scheduling auto-refresh for ${tabName} tab in 10 seconds...`);
  STATE.timers.staleRefresh = setTimeout(() => {
    BMA_LOG.log(`[Stale Refresh] Auto-refreshing ${tabName} tab due to stale cache`);

    // Trigger refresh based on tab type
    if (tabName === 'summary') {
      loadSummaryData(true); // Force refresh
    } else if (tabName === 'staying') {
      loadStayingData(STATE.stayingDate, true); // Force refresh
    } else if (tabName === 'restaurant') {
      reloadRestaurantTab(); // Refresh restaurant tab
    } else if (tabName === 'checks') {
      loadChecksData(STATE.currentBookingId, true); // Force refresh
    }

    STATE.timers.staleRefresh = null;
  }, 10000); // 10 seconds
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
      const date = this.dataset.date;
      const resosId = this.dataset.resosId;
      BMA_LOG.log('Suggested match clicked - navigating to Restaurant tab:', { bookingId, date, resosId });

      // Navigate to Restaurant tab with date and expand comparison row
      if (date && resosId) {
        navigateToRestaurantDate(date, parseInt(bookingId), resosId);
      } else {
        // Fallback if data attributes not available (shouldn't happen with updated templates)
        STATE.currentBookingId = bookingId;
        switchTab('restaurant');
      }
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
        BMA_LOG.log('Opening ResOS booking in new tab:', resosUrl);
        chrome.tabs.create({ url: resosUrl });
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

      BMA_LOG.log('Create booking link clicked - date:', date, 'bookingId:', bookingId);
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

      BMA_LOG.log('Restaurant header clicked - bookingId:', bookingId);
      navigateToRestaurantDate(null, parseInt(bookingId));
    });
  });

  // Add click handler for checks header to navigate to Checks tab
  const checksHeaders = container.querySelectorAll('.checks-header-link');
  checksHeaders.forEach(header => {
    header.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();

      const bookingId = this.dataset.bookingId;

      BMA_LOG.log('Checks header clicked - bookingId:', bookingId);
      navigateToChecksTab(parseInt(bookingId));
    });
  });

  // Update time since placed and apply highlighting
  updateTimeSincePlaced(container);
}

// Attach event listeners to restaurant tab buttons
function attachRestaurantEventListeners(container) {
  // Check if listeners are already attached to prevent duplicates
  if (container.dataset.listenersAttached === 'true') {
    BMA_LOG.log('Restaurant event listeners already attached, skipping');
    return;
  }

  BMA_LOG.log('Attaching restaurant event listeners');
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
    BMA_LOG.log('Restaurant button clicked:', action);

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
            button.dataset.resosBookingId,
            button
          );
          break;

        case 'close-comparison':
          closeComparison(button.dataset.containerId);
          break;

        case 'submit-suggestions':
          console.log('BMA: submit-suggestions action caught, calling submitSuggestions');
          await submitSuggestions(
            button.dataset.date,
            button.dataset.resosBookingId,
            button.dataset.hotelBookingId,
            button.dataset.isConfirmed === 'true'
          );
          break;

        case 'manage-group':
          if (typeof window.openGroupManagementModal === 'function') {
            console.log('BMA: Manage Group button clicked, data attributes:', {
              resosBookingId: button.dataset.resosBookingId,
              hotelBookingId: button.dataset.hotelBookingId,
              date: button.dataset.date,
              resosTime: button.dataset.resosTime,
              resosGuest: button.dataset.resosGuest,
              resosPeople: button.dataset.resosPeople,
              resosBookingRef: button.dataset.resosBookingRef,
              groupExclude: button.dataset.groupExclude
            });
            await window.openGroupManagementModal(
              button.dataset.resosBookingId,
              button.dataset.hotelBookingId,
              button.dataset.date,
              button.dataset.resosTime || '',
              button.dataset.resosGuest || '',
              button.dataset.resosPeople || '0',
              button.dataset.resosBookingRef || '',
              button.dataset.groupExclude || ''
            );
          } else {
            BMA_LOG.error('openGroupManagementModal function not found');
            showToast('Group management feature not available', 'error');
          }
          break;
      }
    } catch (error) {
      BMA_LOG.error('Error handling restaurant action:', error);
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
      BMA_LOG.log('Autoscroll (create form): dateSection found?', !!dateSection);
      if (dateSection) {
        // Use requestAnimationFrame to ensure DOM is fully rendered
        requestAnimationFrame(() => {
          setTimeout(() => {
            const nightSection = dateSection.querySelector('.bma-night');
            BMA_LOG.log('Autoscroll (create form): nightSection found?', !!nightSection);
            if (nightSection) {
              // Get the scrolling container and apply offset
              const scrollContainer = nightSection.closest('.tab-content');
              BMA_LOG.log('Autoscroll (create form): scrollContainer found?', !!scrollContainer);
              BMA_LOG.log('Autoscroll (create form): scrollContainer height:', scrollContainer?.clientHeight, 'scrollHeight:', scrollContainer?.scrollHeight);
              if (scrollContainer) {
                // Force layout recalculation
                scrollContainer.offsetHeight;

                // Calculate position using getBoundingClientRect for accuracy
                const containerRect = scrollContainer.getBoundingClientRect();
                const elementRect = nightSection.getBoundingClientRect();
                const offset = 5; // Additional pixels below the tab title bar for visual spacing
                const scrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - offset;
                BMA_LOG.log('Autoscroll (create form): scrolling to', scrollTop, '(current scrollTop:', scrollContainer.scrollTop, 'element relative top:', elementRect.top - containerRect.top, 'offset:', offset, ')');

                // Try both methods - direct assignment and scrollTo
                scrollContainer.scrollTop = scrollTop;
                scrollContainer.scrollTo(0, scrollTop);

                // Verify scroll happened
                setTimeout(() => {
                  BMA_LOG.log('Autoscroll (create form): After scroll - current scrollTop:', scrollContainer.scrollTop);
                  if (scrollContainer.scrollTop === 0 && scrollTop > 0) {
                    BMA_LOG.warn('Autoscroll (create form) FAILED: scrollTop is still 0, trying scrollIntoView fallback');
                    nightSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }, 100);
              } else {
                BMA_LOG.log('Autoscroll (create form): using fallback scrollIntoView on nightSection');
                nightSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            } else {
              BMA_LOG.log('Autoscroll (create form): nightSection not found, scrolling form into view');
              form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }, 150);
        });
      } else {
        BMA_LOG.log('Autoscroll (create form): dateSection not found, scrolling form into view');
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
    BMA_LOG.log('Initializing create form for date:', date);

    // Fetch and populate opening hours
    try {
      const openingHoursData = await fetchOpeningHours(date);
      BMA_LOG.log('Opening hours response:', openingHoursData);

      const sectionsContainer = document.getElementById('service-period-sections-' + date);
      BMA_LOG.log('Sections container found:', !!sectionsContainer);

      if (!sectionsContainer) {
        BMA_LOG.error('Sections container not found for date:', date);
        return;
      }

      if (openingHoursData.success && openingHoursData.data && openingHoursData.data.length > 0) {
        const periods = openingHoursData.data;
        BMA_LOG.log('Generating collapsible sections for', periods.length, 'periods');

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
              BMA_LOG.log('DEBUG: All bookings from API:', allBookingsData);

              // Get matched bookings for this date from STATE
              const matchedBookings = STATE.restaurantBookings[date] || [];
              BMA_LOG.log('DEBUG: Matched bookings from STATE:', matchedBookings);

              // Use all bookings from API for comprehensive view
              const bookingsForDate = allBookingsData.success ? allBookingsData.bookings : [];
              BMA_LOG.log('DEBUG: Total bookings for Gantt chart:', bookingsForDate.length);

              // Extract special events and online booking status from API response
              const specialEvents = allBookingsData.specialEvents || [];
              const onlineBookingAvailable = allBookingsData.onlineBookingAvailable;
              BMA_LOG.log('DEBUG: Special events:', specialEvents, 'Online booking available:', onlineBookingAvailable);

              // Build alert banner HTML
              const alertsHtml = buildSpecialEventsAlert(specialEvents, onlineBookingAvailable);

              // Insert alerts BEFORE the gantt container (not inside viewport)
              const ganttContainer = document.getElementById('gantt-container-' + date);
              if (ganttContainer && alertsHtml) {
                // Remove any existing alert banner
                const existingBanner = ganttContainer.previousElementSibling;
                if (existingBanner && existingBanner.classList.contains('special-events-banner')) {
                  existingBanner.remove();
                }

                // Insert new alert banner before gantt container
                const bannerDiv = document.createElement('div');
                bannerDiv.className = 'special-events-banner special-events-horizontal';
                bannerDiv.innerHTML = alertsHtml;
                ganttContainer.parentNode.insertBefore(bannerDiv, ganttContainer);
              }

              // Build Gantt chart with special events for grey overlays
              const ganttHtml = buildGanttChart(
                periods,                // opening hours
                specialEvents,          // special events (for grey overlays)
                [],                     // available times (TODO: fetch these)
                bookingsForDate,        // ALL restaurant bookings (not just matched)
                'compact',              // display mode
                'gantt-' + date,        // chart ID (must match viewport ID)
                onlineBookingAvailable  // online booking status (for grey overlay)
              );

              // Insert Gantt chart into viewport (without alerts)
              ganttViewport.innerHTML = ganttHtml;

              // Update viewport height to match chart content
              const chartContainer = ganttViewport.querySelector('.gantt-chart-container');
              if (chartContainer) {
                const chartHeight = parseInt(chartContainer.style.height) || 120;
                ganttViewport.style.height = chartHeight + 'px';
                BMA_LOG.log('Updated Gantt viewport height to:', chartHeight + 'px');
              }

              attachGanttTooltips();
              BMA_LOG.log('Gantt chart generated for date:', date, 'with', bookingsForDate.length, 'bookings');
            } catch (error) {
              BMA_LOG.error('Error fetching all bookings for Gantt chart:', error);
              // Fallback to matched bookings only if API fails
              const bookingsForDate = STATE.restaurantBookings[date] || [];
              const ganttHtml = buildGanttChart(
                periods,
                [],                 // no special events available in fallback
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
                BMA_LOG.log('Updated Gantt viewport height to:', chartHeight + 'px (fallback)');
              }

              attachGanttTooltips();
            }
          }
        }

        // Load available times for the default (last) period
        const defaultPeriodIndex = periods.length - 1;
        const defaultPeriod = periods[defaultPeriodIndex];
        const people = parseInt(form.querySelector('.form-people').value) || 2;
        await loadAvailableTimesForPeriod(date, people, defaultPeriod._id, defaultPeriodIndex, true, defaultPeriod);  // Auto-scroll Gantt to first booking

        BMA_LOG.log('Opening hours loaded, default period:', defaultPeriod.name);
      } else {
        BMA_LOG.warn('Opening hours response has no data:', openingHoursData);
        sectionsContainer.innerHTML = '<p style="color: #ef4444;">No service periods available</p>';
      }
    } catch (error) {
      BMA_LOG.error('Error loading opening hours:', error);
      const sectionsContainer = document.getElementById('service-period-sections-' + date);
      if (sectionsContainer) {
        sectionsContainer.innerHTML = '<p style="color: #ef4444;">Error loading service periods</p>';
      }
    }

    // Fetch and populate dietary choices
    try {
      const dietaryData = await fetchDietaryChoices();
      BMA_LOG.log('Dietary choices response:', dietaryData);

      const container = document.getElementById('dietary-checkboxes-' + date);
      BMA_LOG.log('Dietary checkboxes container found:', !!container);

      if (dietaryData.success && dietaryData.html) {
        BMA_LOG.log('Using HTML response for dietary choices');
        container.innerHTML = dietaryData.html;
      } else if (dietaryData.success && dietaryData.choices) {
        BMA_LOG.log('Using choices array for dietary:', dietaryData.choices.length, 'choices');
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
        BMA_LOG.warn('Dietary response has no html or choices:', dietaryData);
      }
    } catch (error) {
      BMA_LOG.error('Error loading dietary choices:', error);
      const container = document.getElementById('dietary-checkboxes-' + date);
      if (container) {
        container.innerHTML = '<p style="color: #ef4444;">Error loading dietary options</p>';
      }
    }

    // Set up section content indicators
    setupSectionIndicators(date, form);
  }

  /**
   * Set up indicators that show when sections have content
   */
  function setupSectionIndicators(date, form) {
    // Helper to check if section has content
    function checkSectionContent(sectionType) {
      const indicator = document.querySelector(`[data-indicator="${sectionType}-${date}"]`);
      if (!indicator) return;

      let hasContent = false;

      if (sectionType === 'details') {
        // Check Booking Details section fields (excluding pre-filled guest name/people)
        const phone = form.querySelector('.form-phone')?.value;
        const email = form.querySelector('.form-email')?.value;
        const hotelGuest = form.querySelector('.form-hotel-guest')?.checked;
        const dbb = form.querySelector('.form-dbb')?.checked;
        const sms = form.querySelector('.form-notification-sms')?.checked;
        const emailNotif = form.querySelector('.form-notification-email')?.checked;

        // Show indicator if any non-default fields have values
        hasContent = phone || email || !hotelGuest || dbb || sms || emailNotif;
      } else if (sectionType === 'allergies') {
        // Check Allergies & Dietary section
        const checkedBoxes = form.querySelectorAll('#dietary-checkboxes-' + date + ' input[type="checkbox"]:checked');
        const otherDiet = form.querySelector('.form-diet-other')?.value;
        hasContent = checkedBoxes.length > 0 || (otherDiet && otherDiet.trim() !== '');
      } else if (sectionType === 'note') {
        // Check Add Note section
        const note = form.querySelector('.form-booking-note')?.value;
        hasContent = note && note.trim() !== '';
      }

      if (hasContent) {
        indicator.classList.add('has-content');
      } else {
        indicator.classList.remove('has-content');
      }
    }

    // Monitor Details section fields
    const detailsFields = form.querySelectorAll('.form-phone, .form-email, .form-hotel-guest, .form-dbb, .form-notification-sms, .form-notification-email');
    detailsFields.forEach(field => {
      field.addEventListener('change', () => checkSectionContent('details'));
      field.addEventListener('input', () => checkSectionContent('details'));
    });

    // Monitor Allergies section
    const allergiesContainer = document.getElementById('dietary-checkboxes-' + date);
    if (allergiesContainer) {
      // Use event delegation for dynamically added checkboxes
      allergiesContainer.addEventListener('change', () => checkSectionContent('allergies'));
    }
    const otherDiet = form.querySelector('.form-diet-other');
    if (otherDiet) {
      otherDiet.addEventListener('input', () => checkSectionContent('allergies'));
    }

    // Monitor Note section
    const noteField = form.querySelector('.form-booking-note');
    if (noteField) {
      noteField.addEventListener('input', () => checkSectionContent('note'));
    }

    // Initial check
    checkSectionContent('details');
    checkSectionContent('allergies');
    checkSectionContent('note');
  }

  async function loadAvailableTimesForPeriod(date, people, periodId, periodIndex, autoScrollGantt = false, periodData = null) {
    BMA_LOG.log('DEBUG loadAvailableTimesForPeriod called:', {date, people, periodId, periodIndex, autoScrollGantt, periodData});
    try {
      const timesData = await fetchAvailableTimes(date, people, periodId);
      BMA_LOG.log('DEBUG fetchAvailableTimes result:', {success: timesData.success, hasHtml: !!timesData.html, htmlLength: timesData.html?.length});
      const sectionsContainer = document.getElementById('service-period-sections-' + date);
      const periodTimes = sectionsContainer ? sectionsContainer.querySelector(`.period-times[data-period-index="${periodIndex}"]`) : null;

      if (!periodTimes) {
        BMA_LOG.warn('Period times container not found for index:', periodIndex, 'sectionsContainer:', sectionsContainer);
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

            // Check if sight line is locked before showing it
            const sightLine = document.getElementById('gantt-sight-line-' + ganttChartId);
            const isLocked = sightLine && sightLine.getAttribute('data-locked') === 'true';

            // Only show sight line on hover if not locked
            if (!isLocked && typeof showGanttSightLine === 'function') {
              showGanttSightLine(ganttChartId, timeHHMM);
            }

            // Only auto-scroll if not locked (let user stay at selected time)
            if (!isLocked && typeof scrollGanttToTime === 'function') {
              scrollGanttToTime(ganttChartId, timeHHMM, true);
            }
          });

          btn.addEventListener('mouseleave', function() {
            // Hide sight line when not hovering (hideGanttSightLine already respects lock)
            if (typeof hideGanttSightLine === 'function') {
              hideGanttSightLine(ganttChartId);
            }
          });
        });

        // Auto-scroll Gantt to first booking within period if requested (default period load)
        if (autoScrollGantt && periodData && typeof scrollGanttToTime === 'function') {
          const ganttChart = document.getElementById(ganttChartId);
          if (ganttChart) {
            // Get all booking bars in the Gantt chart
            const bookingBars = ganttChart.querySelectorAll('.gantt-booking-bar');

            // Get period time range
            const periodOpen = periodData.open || 1800;
            const periodClose = periodData.close || 2200;

            // Find first booking that falls within this period
            let firstBookingTime = null;
            for (const bar of bookingBars) {
              const bookingTime = bar.getAttribute('data-time');
              if (bookingTime) {
                // Convert HH:MM to HHMM format
                const timeHHMM = bookingTime.replace(':', '');
                const timeInt = parseInt(timeHHMM);

                // Check if booking falls within period hours
                if (timeInt >= periodOpen && timeInt <= periodClose) {
                  firstBookingTime = timeHHMM;
                  break;
                }
              }
            }

            if (firstBookingTime) {
              BMA_LOG.log('Auto-scrolling Gantt to first booking time:', firstBookingTime, 'within period:', periodOpen, '-', periodClose);

              // Scroll to the booking time
              scrollGanttToTime(ganttChartId, firstBookingTime, true);

              // Show sight line at this time (but don't lock it)
              if (typeof showGanttSightLine === 'function') {
                showGanttSightLine(ganttChartId, firstBookingTime);
              }
            } else {
              // No bookings found - fall back to first available time slot in period
              BMA_LOG.log('No bookings found within period, falling back to first available time');

              // Find first available (non-unavailable) time button in this period
              const timeButtons = periodTimes.querySelectorAll('.time-slot-btn:not(.time-slot-unavailable)');
              if (timeButtons.length > 0) {
                const firstAvailableBtn = timeButtons[0];
                const firstAvailableTime = firstAvailableBtn.dataset.time || firstAvailableBtn.textContent.trim();
                const timeHHMM = firstAvailableTime.replace(':', '');

                BMA_LOG.log('Auto-scrolling Gantt to first available time:', timeHHMM);
                scrollGanttToTime(ganttChartId, timeHHMM, true);

                if (typeof showGanttSightLine === 'function') {
                  showGanttSightLine(ganttChartId, timeHHMM);
                }
              } else {
                BMA_LOG.log('No available time slots found in period for auto-scroll');
              }
            }
          }
        }

        BMA_LOG.log('Loaded available times for period index:', periodIndex);
      } else {
        periodTimes.innerHTML = '<p style="padding: 10px; text-align: center; color: #666;">No available times</p>';
      }
    } catch (error) {
      BMA_LOG.error('Error loading available times:', error);
      const sectionsContainer = document.getElementById('service-period-sections-' + date);
      const periodTimes = sectionsContainer ? sectionsContainer.querySelector(`.period-times[data-period-index="${periodIndex}"]`) : null;
      if (periodTimes) {
        periodTimes.innerHTML = '<p style="color: #ef4444;">Error loading times</p>';
      } else {
        BMA_LOG.warn('Could not find period-times container to show error message');
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
      BMA_LOG.log('Create operation already in progress, ignoring');
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
      BMA_LOG.log('Form validation failed');
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

    BMA_LOG.log('Starting create booking operation with data:', formData);

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
      BMA_LOG.log('Create booking operation completed');
    }
  }

  async function submitUpdateBooking(date, resosBookingId) {
    // Prevent multiple simultaneous operations
    if (updateProcessing) {
      BMA_LOG.log('Update operation already in progress, ignoring');
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

    BMA_LOG.log('Starting update booking operation');

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
      BMA_LOG.log('Update booking operation completed');
    }
  }

  // Processing flag to prevent multiple simultaneous exclude operations
  let excludeProcessing = false;

  async function confirmExcludeMatch(resosBookingId, hotelBookingId, guestName) {
    // Prevent multiple simultaneous operations
    if (excludeProcessing) {
      BMA_LOG.log('Exclude operation already in progress, ignoring');
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

    BMA_LOG.log('Starting exclude operation for booking:', hotelBookingId);

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
      BMA_LOG.log('Exclude operation completed');
    }
  }

  async function loadComparisonView(date, bookingId, resosBookingId, buttonElement) {
    const containerId = 'comparison-' + date + '-' + resosBookingId;
    const comparisonContainer = document.getElementById(containerId);
    if (!comparisonContainer) return;

    // If already visible, hide it
    if (comparisonContainer.style.display === 'block') {
      comparisonContainer.style.display = 'none';
      return;
    }

    // Get button data attributes
    const isConfirmed = buttonElement && buttonElement.dataset.isConfirmed === '1';
    const isMatchedElsewhere = buttonElement && buttonElement.dataset.isMatchedElsewhere === '1';
    const hotelBookingId = buttonElement ? buttonElement.dataset.hotelBookingId : '';
    const guestName = buttonElement ? buttonElement.dataset.guestName : '';

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
          date: date,
          context: 'chrome-sidepanel'
        })
      });

      const result = await response.json();

      if (result.success && result.html) {
        // Use server-generated HTML (includes Manage Group button!)
        comparisonContainer.innerHTML = result.html;

        // Add event listeners for visual feedback on checkbox changes
        setupComparisonCheckboxListeners(comparisonContainer);
      } else if (result.success && result.comparison) {
        // Fallback to client-side HTML generation for backward compatibility
        const comparisonHTML = buildComparisonHTML(result.comparison, date, resosBookingId, isConfirmed, isMatchedElsewhere, hotelBookingId, guestName);
        comparisonContainer.innerHTML = comparisonHTML;

        // Add event listeners for visual feedback on checkbox changes
        setupComparisonCheckboxListeners(comparisonContainer);
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

  // Setup event listeners for comparison checkbox visual feedback
  function setupComparisonCheckboxListeners(container) {
    const checkboxes = container.querySelectorAll('.suggestion-checkbox');
    checkboxes.forEach(checkbox => {
      // Set initial state
      toggleComparisonVisualFeedback(checkbox);

      // Add change event listener
      checkbox.addEventListener('change', function() {
        toggleComparisonVisualFeedback(this);
      });
    });
  }

  // Toggle visual feedback based on checkbox state
  function toggleComparisonVisualFeedback(checkbox) {
    const field = checkbox.dataset.field;
    const isChecked = checkbox.checked;
    const container = checkbox.closest('.comparison-row-content');

    if (container) {
      // Toggle strikethrough on Resos value
      const resosValue = container.querySelector(`.resos-value[data-field="${field}"]`);
      if (resosValue) {
        if (isChecked) {
          resosValue.style.textDecoration = 'line-through';
          resosValue.style.opacity = '0.6';
        } else {
          resosValue.style.textDecoration = 'none';
          resosValue.style.opacity = '1';
        }
      }

      // Toggle opacity on suggestion text
      const suggestionText = container.querySelector(`.suggestion-text[data-field="${field}"]`);
      if (suggestionText) {
        if (isChecked) {
          suggestionText.style.opacity = '1';
        } else {
          suggestionText.style.opacity = '0.5';
        }
      }
    }
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

    // Add strikethrough to Resos value if there's a suggestion
    if (hasSuggestion && resosDisplay !== '<em style="color: #adb5bd;">-</em>') {
      resosDisplay = `<span class="resos-value" data-field="${escapeHTML(field)}" style="text-decoration: line-through; opacity: 0.6;">${resosDisplay}</span>`;
    }

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
      html += `<input type="checkbox" class="suggestion-checkbox" data-field="${escapeHTML(field)}" name="suggestion_${field}" value="${escapeHTML(String(suggestionValue))}"${checkedAttr}> `;
      html += `<span class="suggestion-text" data-field="${escapeHTML(field)}">Update to: ${suggestionDisplay}</span>`;
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
    console.log('BMA: submitSuggestions called with:', { date, resosBookingId, hotelBookingId, isConfirmed });

    const containerId = 'comparison-' + date + '-' + resosBookingId;
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('BMA: Container not found:', containerId);
      return;
    }

    // Find all checked suggestion checkboxes in this comparison container
    const checkboxes = container.querySelectorAll('.suggestion-checkbox:checked');
    console.log('BMA: Found', checkboxes.length, 'checked suggestion checkboxes');

    if (checkboxes.length === 0) {
      showToast('Please select at least one suggestion to update', 'error');
      return;
    }

    // Build updates object from checked checkboxes
    const updates = {};
    checkboxes.forEach(checkbox => {
      const field = checkbox.dataset.field;
      let value = checkbox.value;

      // Map fields correctly - use data-field attribute instead of name
      if (field === 'name') {
        updates.name = value;
      } else if (field === 'email') {
        updates.email = value;
      } else if (field === 'phone') {
        updates.phone = value;
      } else if (field === 'booking_ref') {
        updates.booking_ref = value;
      } else if (field === 'hotel_guest') {
        updates.hotel_guest = value;
      } else if (field === 'dbb') {
        updates.dbb = value; // Empty string means remove
      } else if (field === 'people') {
        updates.people = parseInt(value);
      } else if (field === 'status') {
        updates.status = value;
      } else {
        updates[field] = value;
      }
    });

    console.log('BMA: Submitting updates:', { booking_id: resosBookingId, updates: updates });

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

  // Expose functions to window for access from processNavigationContext
  window.loadComparisonView = loadComparisonView;
  window.buildComparisonHTML = buildComparisonHTML;
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
  BMA_LOG.log(`Updating badge for ${tabName}: critical=${criticalCount}, warning=${warningCount}`);
  STATE.badges[tabName] = { critical: criticalCount, warning: warningCount };
  const badgeElement = document.querySelector(`[data-badge="${tabName}"]`);

  if (!badgeElement) {
    BMA_LOG.error(`Badge element not found for ${tabName}`);
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
      BMA_LOG.log(`Badge for ${tabName} showing ${totalCount} total issues (${criticalCount} critical, ${warningCount} warning) - RED`);
    } else {
      badgeElement.classList.remove('critical');
      badgeElement.classList.add('warning');
      BMA_LOG.log(`Badge for ${tabName} showing ${totalCount} total issues (${warningCount} warning) - AMBER`);
    }
  }
  // No issues - hide badge
  else {
    badgeElement.classList.add('hidden');
    badgeElement.classList.remove('critical', 'warning');
    BMA_LOG.log(`Badge for ${tabName} hidden (no issues)`);
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
  } else if (tabName === 'staying') {
    loadStayingTab();
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
async function loadSummaryTab(force_refresh = false) {
  if (!STATE.settings) {
    showError('summary', 'Please configure settings first');
    return;
  }

  // Determine if this is auto-refresh (called automatically, not by user)
  const isAutoRefresh = force_refresh === false && typeof force_refresh === 'boolean';

  // Smart refresh: Check if we're already showing Summary tab content
  // Skip smart refresh if force_refresh is true
  const isSummaryTabActive = STATE.currentTab === 'summary';
  const hasExistingData = STATE.loadedBookingIds.summary && STATE.cache.summary && STATE.cache.summary.html;

  if (!force_refresh && !isAutoRefresh && isSummaryTabActive && hasExistingData) {
    BMA_LOG.log('Smart refresh: Summary already loaded, checking for changes...');

    try {
      // Fetch data silently in background
      const api = new APIClient(STATE.settings);
      const newData = await api.fetchSummary(force_refresh);

      if (newData.success && newData.html) {
        // Compare HTML content
        const currentHtml = STATE.cache.summary.html;
        const newHtml = newData.html;

        if (currentHtml === newHtml) {
          // No changes detected
          BMA_LOG.log('Smart refresh: No changes detected in Summary, keeping current view');
          updateBadge('summary', newData.critical_count || 0, newData.warning_count || 0);
          return; // Don't reload
        } else {
          // Changes detected, proceed with refresh
          BMA_LOG.log('Smart refresh: Changes detected in Summary, refreshing content');
        }
      }
    } catch (error) {
      BMA_LOG.error('Smart refresh check failed for Summary, proceeding with normal load:', error);
      // Fall through to normal load on error
    }
  }

  try {
    // Only show loading spinner on first load, not on auto-refresh
    if (!isAutoRefresh) {
      showLoading('summary');
    }

    const api = new APIClient(STATE.settings);
    const data = await api.fetchSummary(force_refresh);

    if (data.success && data.html) {
      // Check if data has changed (compare counts instead of HTML to avoid false positives)
      const dataSignature = `${data.bookings_count}-${data.critical_count}-${data.warning_count}`;
      const cachedSignature = STATE.cache.summary
        ? `${STATE.cache.summary.bookings_count}-${STATE.cache.summary.critical_count}-${STATE.cache.summary.warning_count}`
        : null;

      const hasChanged = !STATE.cache.summary || cachedSignature !== dataSignature;

      BMA_LOG.log(`Summary check: cached="${cachedSignature}", new="${dataSignature}", changed=${hasChanged}, isAutoRefresh=${isAutoRefresh}`);

      // Always show data if:
      // 1. Data has changed, OR
      // 2. This is NOT an auto-refresh (manual tab switch or first load)
      if (hasChanged || !isAutoRefresh) {
        showData('summary', data.html);
        updateBadge('summary', data.critical_count || 0, data.warning_count || 0);
        STATE.cache.summary = data;
        STATE.loadedBookingIds.summary = true;
        STATE.lastSummaryUpdate = Date.now(); // Track update time only when data changes
        BMA_LOG.log(hasChanged ? 'Summary updated with new data' : 'Summary displayed (no change but manual load)');

        // Initialize group hover functionality
        initializeGroupHover();
      } else {
        // Only skip display during auto-refresh when nothing changed
        BMA_LOG.log('Summary unchanged during auto-refresh - showing no changes message');
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
    BMA_LOG.error('Error loading summary:', error);
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
          BMA_LOG.log(`Auto-refresh resuming - user idle for ${idleMinutes.toFixed(1)} minutes`);
          loadSummaryTab(false); // Use cached matching data, fresh bookings list
        } else {
          // Don't refresh while user is reading - reset countdown
          BMA_LOG.log('Auto-refresh paused - user has expanded booking cards');
          const idleSecondsRemaining = Math.ceil((maxIdleMinutes - idleMinutes) * 60);
          countdownText.innerHTML = `<strong style="color: #f59e0b;">⏸ Auto-refresh paused (booking expanded)</strong><br><span style="font-size: 11px; color: #6b7280;">Resumes after ${Math.ceil(idleSecondsRemaining / 60)}min idle</span>`;
          setTimeout(() => {
            secondsLeft = STATE.settings.summaryRefreshRate;
            updateCountdownText(countdownText, secondsLeft);
          }, 2000);
        }
      } else {
        loadSummaryTab(false); // Use cached matching data, fresh bookings list
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

/**
 * Update "last updated" display for Restaurant, Checks, or Staying tabs
 * @param {string} tabName - The tab name ('restaurant', 'checks', or 'staying')
 * @param {number|null} timestamp - The timestamp of last update (Date.now()), or null to hide
 */
function updateTabLastUpdated(tabName, timestamp = null) {
  const lastUpdatedContainer = document.querySelector(`[data-content="${tabName}"] .tab-last-updated`);
  const lastUpdatedTextEl = lastUpdatedContainer?.querySelector('.last-updated-text');

  if (!lastUpdatedContainer || !lastUpdatedTextEl) return;

  // Hide if no timestamp provided
  if (!timestamp) {
    lastUpdatedContainer.classList.add('hidden');
    return;
  }

  // Calculate elapsed time
  const now = Date.now();
  const elapsed = now - timestamp;
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

  lastUpdatedTextEl.textContent = `Last updated ${timeText}`;
  lastUpdatedContainer.classList.remove('hidden');
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
async function loadRestaurantTab(force_refresh = false) {
  if (!STATE.settings) {
    showError('restaurant', 'Please configure settings first');
    return;
  }

  if (!STATE.currentBookingId) {
    showEmpty('restaurant');
    updateBadge('restaurant', 0);
    STATE.loadedBookingIds.restaurant = null;
    return;
  }

  // Smart refresh: Check if we're already showing the same booking
  // Skip smart refresh if force_refresh is true
  const isRestaurantTabActive = STATE.currentTab === 'restaurant';
  const isSameBooking = STATE.loadedBookingIds.restaurant === STATE.currentBookingId;
  const hasExistingData = STATE.cache.restaurant && STATE.cache.restaurant.html;

  // TEMP: Disable cache for testing GROUP button
  if (false && !force_refresh && isRestaurantTabActive && isSameBooking && hasExistingData) {
    BMA_LOG.log('Smart refresh: Same booking already loaded, checking for changes...');

    try {
      // Fetch data silently in background
      const api = new APIClient(STATE.settings);
      const newData = await api.fetchRestaurantMatch(STATE.currentBookingId, force_refresh);

      if (newData.success && newData.html) {
        // Compare HTML content
        const currentHtml = STATE.cache.restaurant.html;
        const newHtml = newData.html;

        if (currentHtml === newHtml) {
          // No changes detected
          BMA_LOG.log('Smart refresh: No changes detected, keeping current view');
          // Update badge in case counts changed (though HTML is same)
          updateBadge('restaurant', newData.critical_count || 0, newData.warning_count || 0);
          return; // Don't reload
        } else {
          // Changes detected, proceed with refresh
          BMA_LOG.log('Smart refresh: Changes detected, refreshing content');
        }
      }
    } catch (error) {
      BMA_LOG.error('Smart refresh check failed, proceeding with normal load:', error);
      // Fall through to normal load on error
    }
  }

  try {
    showLoading('restaurant');
    const api = new APIClient(STATE.settings);
    const data = await api.fetchRestaurantMatch(STATE.currentBookingId, force_refresh);

    if (data.success && data.html) {
      showData('restaurant', data.html);
      updateBadge('restaurant', data.critical_count || 0, data.warning_count || 0);
      STATE.cache.restaurant = data;
      STATE.loadedBookingIds.restaurant = STATE.currentBookingId;

      // Update last updated timestamp and display
      STATE.lastRestaurantUpdate = Date.now();
      updateTabLastUpdated('restaurant', STATE.lastRestaurantUpdate);

      // Store restaurant bookings by date for Gantt chart
      if (data.bookings_by_date) {
        STATE.restaurantBookings = data.bookings_by_date;
        BMA_LOG.log('DEBUG: Stored restaurant bookings:', STATE.restaurantBookings);
      }

      // Process navigation context after content is loaded
      // Use requestAnimationFrame + setTimeout to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        setTimeout(() => {
          processNavigationContext();
        }, 200);
      });
    } else if (data.success && !data.html) {
      showEmpty('restaurant');
      updateBadge('restaurant', 0, 0);
      STATE.loadedBookingIds.restaurant = null;
    } else {
      showError('restaurant', 'Invalid response from API');
      STATE.loadedBookingIds.restaurant = null;
    }
  } catch (error) {
    BMA_LOG.error('Error loading restaurant tab:', error);
    showError('restaurant', error.message);
    STATE.loadedBookingIds.restaurant = null;
  }
}

// Checks Tab
async function loadChecksTab(force_refresh = false) {
  if (!STATE.settings) {
    showError('checks', 'Please configure settings first');
    return;
  }

  if (!STATE.currentBookingId) {
    showEmpty('checks');
    updateBadge('checks', 0);
    STATE.loadedBookingIds.checks = null;
    return;
  }

  // Smart refresh: Check if we're already showing the same booking
  // Skip smart refresh if force_refresh is true
  const isChecksTabActive = STATE.currentTab === 'checks';
  const isSameBooking = STATE.loadedBookingIds.checks === STATE.currentBookingId;
  const hasExistingData = STATE.cache.checks && STATE.cache.checks.html;

  if (!force_refresh && isChecksTabActive && isSameBooking && hasExistingData) {
    BMA_LOG.log('Smart refresh: Same booking already loaded in Checks, checking for changes...');

    try {
      // Fetch data silently in background
      const api = new APIClient(STATE.settings);
      const newData = await api.fetchChecks(STATE.currentBookingId, force_refresh);

      if (newData.success && newData.html) {
        // Compare HTML content
        const currentHtml = STATE.cache.checks.html;
        const newHtml = newData.html;

        if (currentHtml === newHtml) {
          // No changes detected
          BMA_LOG.log('Smart refresh: No changes detected in Checks, keeping current view');
          updateBadge('checks', newData.critical_count || 0, newData.warning_count || 0);
          return; // Don't reload
        } else {
          // Changes detected, proceed with refresh
          BMA_LOG.log('Smart refresh: Changes detected in Checks, refreshing content');
        }
      }
    } catch (error) {
      BMA_LOG.error('Smart refresh check failed for Checks, proceeding with normal load:', error);
      // Fall through to normal load on error
    }
  }

  try {
    showLoading('checks');
    const api = new APIClient(STATE.settings);
    const data = await api.fetchChecks(STATE.currentBookingId, force_refresh);

    if (data.success && data.html) {
      showData('checks', data.html);
      updateBadge('checks', data.critical_count || 0, data.warning_count || 0);
      STATE.cache.checks = data;
      STATE.loadedBookingIds.checks = STATE.currentBookingId;

      // Update last updated timestamp and display
      STATE.lastChecksUpdate = Date.now();
      updateTabLastUpdated('checks', STATE.lastChecksUpdate);

      // Attach event listeners for the checks tab
      const checksTab = document.querySelector('[data-content="checks"] .tab-data');
      if (checksTab) {
        // Open booking in NewBook button
        const openBookingBtn = checksTab.querySelector('.open-booking-btn');
        if (openBookingBtn) {
          openBookingBtn.addEventListener('click', function() {
            const bookingId = this.dataset.bookingId;
            const url = `https://appeu.newbook.cloud/bookings_view/${bookingId}`;
            chrome.tabs.update({ url: url });
          });
        }
      }
    } else if (data.success && !data.html) {
      showEmpty('checks');
      updateBadge('checks', 0, 0);
      STATE.loadedBookingIds.checks = null;
    } else {
      showError('checks', 'Invalid response from API');
      STATE.loadedBookingIds.checks = null;
    }
  } catch (error) {
    BMA_LOG.error('Error loading checks tab:', error);
    showError('checks', error.message);
    STATE.loadedBookingIds.checks = null;
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
      BMA_LOG.log('Inactivity timer paused - create form is open');
      // Restart the timer - it will check again after the timeout
      startInactivityTimer();
      return;
    }

    if (STATE.currentTab !== 'summary') {
      BMA_LOG.log(`Inactivity timeout (${timeoutSeconds}s) - returning to summary`);
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
  BMA_LOG.log('Booking detected, updating sidepanel for booking:', bookingId);

  // Clear loadedBookingIds only if switching to a different booking
  if (STATE.currentBookingId !== bookingId) {
    BMA_LOG.log('Booking changed from', STATE.currentBookingId, 'to', bookingId, '- clearing loaded tracking');
    STATE.loadedBookingIds.restaurant = null;
    STATE.loadedBookingIds.checks = null;
  }

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

    BMA_LOG.log('Badge counts - Restaurant: critical=' + restaurantCritical + ', warning=' + restaurantWarning +
                ', Checks: critical=' + checksCritical + ', warning=' + checksWarning);

    // Priority logic:
    // 1. Restaurant tab if it has critical issues (package alerts)
    // 2. Checks tab if it has critical issues
    // 3. Restaurant tab if it has warnings
    // 4. Checks tab if it has warnings
    // 5. Restaurant tab as fallback (always show restaurant when booking detected)
    if (restaurantCritical > 0) {
      BMA_LOG.log('Switching to restaurant tab (has critical issues)');
      switchTab('restaurant');
    } else if (checksCritical > 0) {
      BMA_LOG.log('Switching to checks tab (has critical issues)');
      switchTab('checks');
    } else if (restaurantWarning > 0) {
      BMA_LOG.log('Switching to restaurant tab (has warnings)');
      switchTab('restaurant');
    } else if (checksWarning > 0) {
      BMA_LOG.log('Switching to checks tab (has warnings)');
      switchTab('checks');
    } else {
      // Fallback to restaurant tab even without issues
      BMA_LOG.log('Switching to restaurant tab (fallback, no issues)');
      switchTab('restaurant');
    }
  }).catch(error => {
    BMA_LOG.error('Error loading booking data:', error);
  });
}

async function loadRestaurantTabSilently() {
  try {
    const api = new APIClient(STATE.settings);
    const data = await api.fetchRestaurantMatch(STATE.currentBookingId);
    BMA_LOG.log('Restaurant data loaded, critical:', data.critical_count, 'warning:', data.warning_count);
    BMA_LOG.log('Full restaurant API response:', JSON.stringify(data, null, 2));
    updateBadge('restaurant', data.critical_count || 0, data.warning_count || 0);
    STATE.cache.restaurant = data;

    // Store restaurant bookings by date for Gantt chart
    if (data.bookings_by_date) {
      STATE.restaurantBookings = data.bookings_by_date;
      BMA_LOG.log('DEBUG: Stored restaurant bookings:', STATE.restaurantBookings);
    }

    return data;
  } catch (error) {
    BMA_LOG.error('Error loading restaurant data:', error);
    return null;
  }
}

async function loadChecksTabSilently() {
  try {
    const api = new APIClient(STATE.settings);
    const data = await api.fetchChecks(STATE.currentBookingId);
    BMA_LOG.log('Checks data loaded, critical:', data.critical_count, 'warning:', data.warning_count);
    BMA_LOG.log('Full checks API response:', JSON.stringify(data, null, 2));
    updateBadge('checks', data.critical_count || 0, data.warning_count || 0);
    STATE.cache.checks = data;
    return data;
  } catch (error) {
    BMA_LOG.error('Error loading checks data:', error);
    return null;
  }
}

async function loadStayingTabSilently(date = null) {
  try {
    const targetDate = date || STATE.stayingDate;
    const api = new APIClient(STATE.settings);
    const response = await fetch(`${api.baseUrl}/staying?date=${targetDate}`, {
      headers: {
        'Authorization': api.authHeader
      }
    });

    const data = await response.json();
    BMA_LOG.log('Staying data loaded silently for date:', targetDate, 'critical:', data.critical_count, 'warning:', data.warning_count);
    updateBadge('staying', data.critical_count || 0, data.warning_count || 0);
    STATE.cache.staying = data;
    STATE.loadedBookingIds.staying = targetDate;
    return data;
  } catch (error) {
    BMA_LOG.error('Error loading staying data silently:', error);
    return null;
  }
}

// =============================================================================
// Staying Tab Functions
// =============================================================================

/**
 * Load staying tab for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to STATE.stayingDate)
 */
async function loadStayingTab(date = null, force_refresh = false) {
  BMA_LOG.log('Loading staying tab for date:', date, 'force_refresh:', force_refresh);

  const targetDate = date || STATE.stayingDate;
  STATE.stayingDate = targetDate;

  // Update date input
  const dateInput = document.getElementById('staying-date-input');
  if (dateInput) {
    dateInput.value = targetDate;
  }

  // Smart refresh: Check if we're already showing the same date in Staying tab
  // Skip smart refresh if force_refresh is true
  const isStayingTabActive = STATE.currentTab === 'staying';
  const isSameDate = STATE.loadedBookingIds.staying === targetDate;
  const hasExistingData = STATE.cache.staying && STATE.cache.staying.html;

  if (!force_refresh && isStayingTabActive && isSameDate && hasExistingData) {
    BMA_LOG.log('Smart refresh: Same date already loaded in Staying, checking for changes...');

    try {
      // Fetch data silently in background
      const api = new APIClient(STATE.settings);
      const response = await fetch(`${api.baseUrl}/staying?date=${targetDate}&force_refresh=${force_refresh}`, {
        headers: {
          'Authorization': api.authHeader
        }
      });

      const newData = await response.json();

      if (newData.success && newData.html) {
        // Compare HTML content
        const currentHtml = STATE.cache.staying.html;
        const newHtml = newData.html;

        if (currentHtml === newHtml) {
          // No changes detected
          BMA_LOG.log('Smart refresh: No changes detected in Staying, keeping current view');
          updateBadge('staying', newData.critical_count || 0, newData.warning_count || 0);
          return; // Don't reload
        } else {
          // Changes detected, proceed with refresh
          BMA_LOG.log('Smart refresh: Changes detected in Staying, refreshing content');
        }
      }
    } catch (error) {
      BMA_LOG.error('Smart refresh check failed for Staying, proceeding with normal load:', error);
      // Fall through to normal load on error
    }
  }

  showLoading('staying');

  try {
    const api = new APIClient(STATE.settings);
    const response = await fetch(`${api.baseUrl}/staying?date=${targetDate}&force_refresh=${force_refresh}`, {
      headers: {
        'Authorization': api.authHeader
      }
    });

    const data = await response.json();

    if (data.success && data.html) {
      showData('staying', data.html);
      updateBadge('staying', data.critical_count || 0, data.warning_count || 0);
      STATE.cache.staying = data;
      STATE.loadedBookingIds.staying = targetDate;

      // Update last updated timestamp and display
      STATE.lastStayingUpdate = Date.now();
      updateTabLastUpdated('staying', STATE.lastStayingUpdate);

      // Initialize group hover functionality
      initializeGroupHover();

      // Reset group filter when loading new date
      window.activeGroupFilter = null;

      // Initialize card expand/collapse
      initializeStayingCards();
    } else if (data.success && (!data.html || data.html.trim() === '')) {
      showEmpty('staying');
      STATE.loadedBookingIds.staying = null;
    } else {
      showError('staying', data.message || 'Failed to load staying bookings');
      STATE.loadedBookingIds.staying = null;
    }
  } catch (error) {
    BMA_LOG.error('Error loading staying tab:', error);
    showError('staying', error.message);
    STATE.loadedBookingIds.staying = null;
  }
}

/**
 * Filter staying cards by group ID
 * @param {number|null} groupId - Group ID to filter by, or null to show all
 */
function filterStayingByGroup(groupId) {
  const cards = document.querySelectorAll('.staying-card');
  const vacantRows = document.querySelectorAll('.vacant-room-line');

  if (groupId === null) {
    cards.forEach(card => card.style.display = '');
    vacantRows.forEach(row => row.style.display = '');
    window.activeGroupFilter = null;
  } else {
    cards.forEach(card => {
      const cardGroupId = card.dataset.groupId;
      card.style.display = (cardGroupId === groupId.toString()) ? '' : 'none';
    });
    vacantRows.forEach(row => row.style.display = 'none');
    window.activeGroupFilter = groupId;
  }

  updateGroupBadgeUI(groupId);
}

/**
 * Update visual state of group badges based on active filter
 * @param {number|null} activeGroupId - Currently active group filter
 */
function updateGroupBadgeUI(activeGroupId) {
  const badges = document.querySelectorAll('.group-id-badge');

  badges.forEach(badge => {
    const badgeGroupId = parseInt(badge.textContent.replace('G#', ''));

    if (activeGroupId === null) {
      badge.style.backgroundColor = '';
      badge.style.color = '';
      badge.style.opacity = '';
    } else if (badgeGroupId === activeGroupId) {
      badge.style.backgroundColor = '#6366f1';
      badge.style.color = 'white';
      badge.style.opacity = '';
    } else {
      badge.style.opacity = '0.5';
    }
  });
}

/**
 * Initialize expand/collapse functionality for staying cards
 */
function initializeStayingCards() {
  const stayingTab = document.querySelector('[data-content="staying"] .tab-data');
  if (!stayingTab) return;

  // Expand/collapse headers (with accordion behavior)
  stayingTab.querySelectorAll('.staying-header').forEach(header => {
    header.addEventListener('click', function(e) {
      const card = this.closest('.staying-card');
      const isExpanded = card.classList.contains('expanded');

      // Accordion behavior: close all other cards first
      stayingTab.querySelectorAll('.staying-card.expanded').forEach(expandedCard => {
        if (expandedCard !== card) {
          expandedCard.classList.remove('expanded');
        }
      });

      // Toggle current card
      card.classList.toggle('expanded');
    });
  });

  // Open booking in NewBook buttons
  stayingTab.querySelectorAll('.open-booking-btn').forEach(button => {
    button.addEventListener('click', function(e) {
      e.stopPropagation();
      const bookingId = this.dataset.bookingId;
      const url = `https://appeu.newbook.cloud/bookings_view/${bookingId}`;
      chrome.tabs.update({ url: url });
    });
  });

  // Restaurant header links - navigate to Restaurant tab
  stayingTab.querySelectorAll('.restaurant-header-link').forEach(header => {
    header.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const bookingId = this.dataset.bookingId;
      BMA_LOG.log('Restaurant header clicked - bookingId:', bookingId);
      navigateToRestaurantDate(null, parseInt(bookingId));
    });
  });

  // Create booking links - navigate to Restaurant tab with date
  stayingTab.querySelectorAll('.create-booking-link').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const date = this.dataset.date;
      const bookingId = this.dataset.bookingId;
      BMA_LOG.log('Create booking link clicked - date:', date, 'bookingId:', bookingId);
      navigateToRestaurantDate(date, parseInt(bookingId));
    });
  });

  // Clickable status links (Check Match/Check Update in header) - navigate to Restaurant tab
  stayingTab.querySelectorAll('.clickable-status').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const bookingId = this.dataset.bookingId;
      const date = this.dataset.date;
      const resosId = this.dataset.resosId;
      BMA_LOG.log('Check Match/Update clicked - navigating to Restaurant tab:', { bookingId, date, resosId });

      // Navigate to Restaurant tab with date and expand comparison row
      if (date && resosId) {
        navigateToRestaurantDate(date, parseInt(bookingId), resosId);
      } else {
        navigateToRestaurantDate(date, parseInt(bookingId));
      }
    });
  });

  // Clickable issues - navigate to Restaurant tab with comparison row expansion OR navigate to lead booking
  stayingTab.querySelectorAll('.clickable-issue').forEach(issue => {
    issue.addEventListener('click', function(e) {
      e.stopPropagation();
      const leadRoom = this.dataset.leadRoom;

      // Check if this is a group member (has data-lead-room)
      if (leadRoom) {
        BMA_LOG.log('Group member clicked - navigating to lead booking:', leadRoom);

        // Find the lead booking card by room number
        const leadCard = Array.from(stayingTab.querySelectorAll('.staying-card')).find(card => {
          const roomNumberElement = card.querySelector('.room-number');
          return roomNumberElement && roomNumberElement.textContent.trim() === leadRoom;
        });

        if (leadCard) {
          // Close current card if expanded
          const currentCard = this.closest('.staying-card');
          if (currentCard && currentCard.classList.contains('expanded')) {
            currentCard.classList.remove('expanded');
          }

          // Expand the lead card
          leadCard.classList.add('expanded');

          // Scroll to lead card
          const scrollContainer = stayingTab;
          requestAnimationFrame(() => {
            setTimeout(() => {
              // Verify leadCard still exists in DOM
              if (!leadCard || !leadCard.isConnected) {
                BMA_LOG.warn('Lead card no longer in DOM, cannot scroll');
                return;
              }

              // Get the sticky date picker height dynamically
              const datePicker = document.querySelector('.staying-date-picker');
              const datePickerHeight = datePicker ? datePicker.offsetHeight : 45;

              const containerRect = scrollContainer.getBoundingClientRect();
              const elementRect = leadCard.getBoundingClientRect();

              if (!elementRect || !containerRect) {
                BMA_LOG.warn('Could not get bounding rects for scroll');
                return;
              }

              // Account for sticky date picker + small visual spacing (10px)
              const offset = datePickerHeight + 10;
              const scrollTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - offset;

              BMA_LOG.log('Scrolling to lead booking - offset:', offset, 'datePickerHeight:', datePickerHeight, 'scrollTop:', scrollTop);

              // Perform scroll
              scrollContainer.scrollTop = scrollTop;
              scrollContainer.scrollTo({ top: scrollTop, behavior: 'smooth' });

              // Verify scroll happened
              setTimeout(() => {
                const actualScrollTop = scrollContainer.scrollTop;
                BMA_LOG.log('Scroll verification - expected:', scrollTop, 'actual:', actualScrollTop);

                // If scroll didn't happen at all (still at/near 0), try alternative method
                if (actualScrollTop < 10 && scrollTop > 20) {
                  BMA_LOG.warn('Scroll failed, trying scrollIntoView with offset');
                  // Scroll element into view, then adjust for sticky header
                  leadCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  setTimeout(() => {
                    scrollContainer.scrollTop -= offset;
                  }, 300);
                }
              }, 200);
            }, 50);
          });
        } else {
          BMA_LOG.warn('Lead booking card not found for room:', leadRoom);
        }
      } else {
        // Regular clickable-issue behavior (navigate to Restaurant tab)
        const bookingId = this.dataset.bookingId;
        const date = this.dataset.date;
        const resosId = this.dataset.resosId;
        BMA_LOG.log('Suggested match clicked - navigating to Restaurant tab:', { bookingId, date, resosId });

        // Navigate to Restaurant tab with date and expand comparison row
        if (date && resosId) {
          navigateToRestaurantDate(date, parseInt(bookingId), resosId);
        } else {
          // Fallback if data attributes not available (shouldn't happen with updated templates)
          STATE.currentBookingId = bookingId;
          switchTab('restaurant');
        }
      }
    });
  });

  // Checks header links - navigate to Checks tab
  stayingTab.querySelectorAll('.checks-header-link').forEach(header => {
    header.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const bookingId = this.dataset.bookingId;
      BMA_LOG.log('Checks header clicked - bookingId:', bookingId);
      navigateToChecksTab(parseInt(bookingId));
    });
  });

  // ResOS deep links - open ResOS in new tab
  stayingTab.querySelectorAll('.resos-deep-link').forEach(link => {
    link.addEventListener('click', function(e) {
      e.stopPropagation();
      const resosId = this.dataset.resosId;
      const restaurantId = this.dataset.restaurantId;
      const date = this.dataset.date;

      if (resosId && restaurantId && date) {
        const resosUrl = `https://app.resos.com/${restaurantId}/bookings/timetable/${date}/${resosId}`;
        BMA_LOG.log('Opening ResOS booking in new tab:', resosUrl);
        chrome.tabs.create({ url: resosUrl });
      }
    });
  });

  // Group badge click handlers - toggle group filter
  stayingTab.querySelectorAll('.group-id-badge').forEach(badge => {
    badge.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();

      const groupId = parseInt(this.textContent.replace('G#', ''));

      if (window.activeGroupFilter === groupId) {
        BMA_LOG.log('Clearing group filter');
        filterStayingByGroup(null);
      } else {
        BMA_LOG.log('Filtering to group:', groupId);
        filterStayingByGroup(groupId);
      }
    });
  });

  // Stat filter click handlers - toggle stat filters
  stayingTab.querySelectorAll('.stat-filter').forEach(filter => {
    filter.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();

      const filterType = this.dataset.filter;

      // Restaurant filter has 3 modes: off -> has-match (green/tick) -> no-match (red/plus) -> off
      if (filterType === 'restaurant') {
        if (!window.activeStatFilter) {
          // Off -> Show with matches (green)
          BMA_LOG.log('Filtering restaurant: has match');
          filterStayingByStat('restaurant-has-match');
        } else if (window.activeStatFilter === 'restaurant-has-match') {
          // Has match -> Show without matches (red)
          BMA_LOG.log('Filtering restaurant: no match');
          filterStayingByStat('restaurant-no-match');
        } else {
          // No match -> Off
          BMA_LOG.log('Clearing restaurant filter');
          filterStayingByStat(null);
        }
      } else {
        // Normal toggle behavior for other filters
        if (window.activeStatFilter === filterType) {
          BMA_LOG.log('Clearing stat filter');
          filterStayingByStat(null);
        } else {
          BMA_LOG.log('Filtering by stat:', filterType);
          filterStayingByStat(filterType);
        }
      }
    });
  });
}

/**
 * Filter staying cards by stat type
 * @param {string|null} filterType - Type of filter to apply ('arrivals', 'departs', 'stopovers', 'twins'), or null to clear
 */
function filterStayingByStat(filterType) {
  const cards = document.querySelectorAll('.staying-card');
  const vacantRows = document.querySelectorAll('.vacant-room-line');

  if (filterType === null) {
    // Show all
    cards.forEach(card => card.style.display = '');
    vacantRows.forEach(row => row.style.display = '');
    window.activeStatFilter = null;
  } else {
    // Filter based on type
    cards.forEach(card => {
      let shouldShow = false;

      switch(filterType) {
        case 'arrivals':
          shouldShow = card.dataset.isArriving === 'true';
          break;
        case 'departs':
          shouldShow = card.dataset.isDeparting === 'true';
          break;
        case 'stopovers':
          shouldShow = card.dataset.isStopover === 'true';
          break;
        case 'in-house':
          shouldShow = true; // Show all booked rooms (vacant excluded below)
          break;
        case 'occupancy':
          shouldShow = true; // Show all booked rooms (vacant excluded below)
          break;
        case 'twins':
          shouldShow = card.dataset.hasTwin === 'true';
          break;
        case 'restaurant-has-match':
          shouldShow = card.dataset.hasRestaurantMatch === 'true';
          break;
        case 'restaurant-no-match':
          shouldShow = card.dataset.hasRestaurantMatch === 'false';
          break;
      }

      card.style.display = shouldShow ? '' : 'none';
    });

    // All filters exclude vacant rooms
    vacantRows.forEach(row => row.style.display = 'none');

    window.activeStatFilter = filterType;
  }

  updateStatFilterUI(filterType);
}

/**
 * Update visual state of stat filters based on active filter
 * @param {string|null} activeFilter - Currently active filter type
 */
function updateStatFilterUI(activeFilter) {
  const filters = document.querySelectorAll('.stat-filter');

  filters.forEach(filter => {
    const filterType = filter.dataset.filter;

    // Remove all state classes
    filter.classList.remove('active', 'restaurant-has-match', 'restaurant-no-match');

    // Remove any existing corner icons
    const existingIcon = filter.querySelector('.filter-corner-icon');
    if (existingIcon) {
      existingIcon.remove();
    }

    if (activeFilter === null) {
      // No filter active
      return;
    }

    // Handle restaurant filter special states
    if (filterType === 'restaurant' && (activeFilter === 'restaurant-has-match' || activeFilter === 'restaurant-no-match')) {
      filter.classList.add(activeFilter);

      // Add corner icon
      const cornerIcon = document.createElement('span');
      cornerIcon.className = 'material-symbols-outlined filter-corner-icon';
      cornerIcon.textContent = activeFilter === 'restaurant-has-match' ? 'check' : 'add';
      filter.appendChild(cornerIcon);
    } else if (filterType === activeFilter) {
      // Normal active state for other filters
      filter.classList.add('active');
    }
  });
}

/**
 * Initialize group hover highlighting
 */
function initializeGroupHover() {
  // Handle staying tab cards
  document.querySelectorAll('.staying-card[data-group-id]').forEach(card => {
    const groupId = card.dataset.groupId;
    const header = card.querySelector('.staying-header');

    if (!header) return;

    card.addEventListener('mouseenter', function() {
      // Highlight headers of all cards in the same group
      document.querySelectorAll(`.staying-card[data-group-id="${groupId}"]`).forEach(groupCard => {
        const groupHeader = groupCard.querySelector('.staying-header');
        if (groupHeader) {
          groupHeader.classList.add('highlighted');
        }
      });
    });

    card.addEventListener('mouseleave', function() {
      // Remove highlight from headers of all cards in the group
      document.querySelectorAll(`.staying-card[data-group-id="${groupId}"]`).forEach(groupCard => {
        const groupHeader = groupCard.querySelector('.staying-header');
        if (groupHeader) {
          groupHeader.classList.remove('highlighted');
        }
      });
    });
  });

  // Handle summary tab cards
  document.querySelectorAll('.booking-card[data-group-id]').forEach(card => {
    const groupId = card.dataset.groupId;
    const header = card.querySelector('.booking-header');

    if (!header) return;

    card.addEventListener('mouseenter', function() {
      // Highlight headers of all cards in the same group
      document.querySelectorAll(`.booking-card[data-group-id="${groupId}"]`).forEach(groupCard => {
        const groupHeader = groupCard.querySelector('.booking-header');
        if (groupHeader) {
          groupHeader.classList.add('highlighted');
        }
      });
    });

    card.addEventListener('mouseleave', function() {
      // Remove highlight from headers of all cards in the group
      document.querySelectorAll(`.booking-card[data-group-id="${groupId}"]`).forEach(groupCard => {
        const groupHeader = groupCard.querySelector('.booking-header');
        if (groupHeader) {
          groupHeader.classList.remove('highlighted');
        }
      });
    });
  });

  // Handle restaurant-status group member hover (ResOS group highlighting)
  document.querySelectorAll('.restaurant-status[data-resos-id]').forEach(statusElement => {
    const resosId = statusElement.dataset.resosId;

    if (!resosId) return;

    statusElement.addEventListener('mouseenter', function() {
      // Highlight all restaurant-status blocks with the same resos-id
      document.querySelectorAll(`.restaurant-status[data-resos-id="${resosId}"]`).forEach(relatedStatus => {
        relatedStatus.classList.add('group-highlight');
      });
    });

    statusElement.addEventListener('mouseleave', function() {
      // Remove highlight from all restaurant-status blocks
      document.querySelectorAll('.restaurant-status.group-highlight').forEach(highlightedStatus => {
        highlightedStatus.classList.remove('group-highlight');
      });
    });
  });
}

/**
 * Change staying date by offset
 * @param {number} offset - Days to add/subtract (-1 for previous, +1 for next)
 */
function changeStayingDate(offset) {
  const currentDate = new Date(STATE.stayingDate);
  currentDate.setDate(currentDate.getDate() + offset);
  const newDate = currentDate.toISOString().split('T')[0];
  loadStayingTab(newDate);
}

/**
 * Initialize staying tab date picker controls
 */
function initializeStayingDatePicker() {
  const dateInput = document.getElementById('staying-date-input');
  const prevBtn = document.getElementById('staying-prev-date');
  const nextBtn = document.getElementById('staying-next-date');

  if (dateInput) {
    dateInput.value = STATE.stayingDate;
    dateInput.addEventListener('change', function() {
      loadStayingTab(this.value);
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => changeStayingDate(-1));
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => changeStayingDate(1));
  }
}

/**
 * Initialize refresh buttons for Restaurant, Checks, and Staying tabs
 */
function initializeRefreshButtons() {
  const refreshButtons = document.querySelectorAll('.tab-refresh-btn');

  refreshButtons.forEach(btn => {
    btn.addEventListener('click', async function(e) {
      e.preventDefault();
      e.stopPropagation();

      const tabName = this.dataset.tab;
      BMA_LOG.log('Refresh button clicked for tab:', tabName);

      // Add refreshing class for animation
      this.classList.add('refreshing');

      try {
        // Clear cache for this tab to force full reload
        STATE.cache[tabName] = null;
        STATE.loadedBookingIds[tabName] = null;

        // Trigger reload based on tab type with force_refresh=true
        if (tabName === 'summary') {
          await loadSummaryTab(true);
        } else if (tabName === 'restaurant') {
          await loadRestaurantTab(true);
        } else if (tabName === 'checks') {
          await loadChecksTab(true);
        } else if (tabName === 'staying') {
          await loadStayingTab(STATE.stayingDate, true);
        }
      } catch (error) {
        BMA_LOG.error(`Error refreshing ${tabName} tab:`, error);
      } finally {
        // Remove refreshing class
        this.classList.remove('refreshing');
      }
    });
  });
}

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  BMA_LOG.log('Sidepanel received message:', message);

  if (message.action === 'bookingDetected') {
    BMA_LOG.log('Processing bookingDetected message, source:', message.source);
    handleBookingDetected(message.bookingId);
  } else if (message.action === 'plannerClick') {
    if (STATE.settings?.enablePlannerClickUpdate) {
      BMA_LOG.log('Processing plannerClick message (setting enabled)');
      handleBookingDetected(message.bookingId);
    } else {
      BMA_LOG.log('Ignoring plannerClick message (setting disabled)');
    }
  } else if (message.action === 'sessionLockChanged') {
    BMA_LOG.log('Processing sessionLockChanged message:', message.isLocked);
    AuthManager.handleSessionLock(message.isLocked);
  } else if (message.action === 'settingsUpdated') {
    BMA_LOG.log('Settings updated, reloading current tab');
    loadSettings().then(() => {
      // Reinitialize global API client with new settings
      window.apiClient = new APIClient(STATE.settings);
      BMA_LOG.log('Global apiClient reinitialized after settings update');

      // Reload current tab
      if (STATE.currentTab === 'summary') {
        loadSummaryTab();
      } else if (STATE.currentTab === 'restaurant') {
        loadRestaurantTab();
      } else if (STATE.currentTab === 'checks') {
        loadChecksTab();
      } else if (STATE.currentTab === 'staying') {
        loadStayingTab();
      }
    });
  }
});

// Load Settings
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    BMA_LOG.log('loadSettings - result:', result);
    BMA_LOG.log('loadSettings - settings:', result.settings);
    if (result.settings && result.settings.apiRootUrl) {
      STATE.settings = result.settings;
      BMA_LOG.log('Settings loaded successfully:', STATE.settings);
      BMA_LOG.log('recentBookingsCount:', STATE.settings.recentBookingsCount);
      return true;
    } else {
      showError('summary', 'Please configure API settings first');
      return false;
    }
  } catch (error) {
    BMA_LOG.error('Error loading settings:', error);
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

// ============================================
// GROUP MANAGEMENT MODAL
// ============================================

// Global state for group modal
const GROUP_MODAL_STATE = {
  resosBookingId: null,
  hotelBookingId: null,
  date: null,
  bookings: [],
  groups: {},
  currentGroupId: null
};

// Get API configuration for GROUP modal functions
function getAPIConfig() {
  if (window.apiClient) {
    return {
      baseUrl: window.apiClient.baseUrl,
      authHeader: window.apiClient.authHeader
    };
  }
  throw new Error('API client not initialized');
}

// Open group management modal
async function openGroupManagementModal(resosBookingId, hotelBookingId, date, resosTime = '', resosGuest = '', resosPeople = '0', resosBookingRef = '', groupExcludeField = '') {
  const modal = document.getElementById('group-management-modal');
  const resosInfo = document.getElementById('group-modal-resos-info');
  const groupSection = document.getElementById('group-section-container');
  const otherSection = document.getElementById('other-section-container');
  const loading = modal.querySelector('.group-modal-loading');
  const error = modal.querySelector('.group-modal-error');
  const container = modal.querySelector('.group-bookings-container');

  // Store state
  GROUP_MODAL_STATE.resosBookingId = resosBookingId;
  GROUP_MODAL_STATE.hotelBookingId = hotelBookingId;
  GROUP_MODAL_STATE.date = date;
  GROUP_MODAL_STATE.resosBooking = { time: resosTime, guest_name: resosGuest, people: resosPeople };
  GROUP_MODAL_STATE.leadBookingId = resosBookingRef; // The booking ID from ResOS "Booking #" field

  console.log('BMA: openGroupManagementModal - resosBookingRef (lead):', resosBookingRef);
  console.log('BMA: openGroupManagementModal - groupExcludeField raw:', groupExcludeField);
  GROUP_MODAL_STATE.groupExcludeData = parseGroupExcludeField(groupExcludeField);
  console.log('BMA: openGroupManagementModal - parsed groupExcludeData:', GROUP_MODAL_STATE.groupExcludeData);

  // Show modal
  modal.classList.remove('hidden');

  // Show ResOS booking info
  console.log('BMA: ResOS data - time:', resosTime, 'guest:', resosGuest, 'people:', resosPeople);
  const time = (resosTime && resosTime.trim()) || 'N/A';
  const guestName = (resosGuest && resosGuest.trim()) || 'Unknown';
  const people = resosPeople || '0';
  resosInfo.innerHTML = `${time} - ${guestName} (${people} pax)`;

  // Show loading
  loading.classList.remove('hidden');
  container.classList.add('hidden');
  error.classList.add('hidden');

  try {
    // Fetch bookings for date
    const bookingsData = await fetchBookingsForDate(date);

    GROUP_MODAL_STATE.bookings = bookingsData.bookings;
    GROUP_MODAL_STATE.groups = bookingsData.groups;

    // Find current booking's group
    const currentBooking = bookingsData.bookings.find(b => b.booking_id == hotelBookingId);
    GROUP_MODAL_STATE.currentGroupId = currentBooking?.bookings_group_id || null;

    // Render bookings
    renderGroupModal();

    // Hide loading, show content
    loading.classList.add('hidden');
    container.classList.remove('hidden');

  } catch (err) {
    BMA_LOG.error('Error loading bookings:', err);
    loading.classList.add('hidden');
    error.classList.remove('hidden');
    error.querySelector('.error-message').textContent = err.message || 'Failed to load bookings';
  }
}

// Parse GROUP/EXCLUDE field
function parseGroupExcludeField(fieldValue) {
  const result = {
    groups: [],
    excludes: []
  };

  if (!fieldValue) return result;

  const parts = fieldValue.split(',').map(p => p.trim());
  parts.forEach(part => {
    if (part.startsWith('G-')) {
      // New format: G-{booking_id}
      result.groups.push(part.substring(2));
    } else if (part.startsWith('N-')) {
      // New format: N-{booking_id}
      result.excludes.push(part.substring(2));
    } else if (part.startsWith('#')) {
      // Legacy format: #{booking_id} (treat as group)
      result.groups.push(part.substring(1));
    }
  });

  console.log('BMA: parseGroupExcludeField - input:', fieldValue, 'output:', result);
  return result;
}

// Fetch bookings for a specific date
async function fetchBookingsForDate(date, excludeBookingId) {
  const config = getAPIConfig();
  let url = `${config.baseUrl}/bookings/for-date?date=${date}`;
  if (excludeBookingId) {
    url += `&exclude_booking_id=${excludeBookingId}`;
  }

  const response = await fetch(url, {
    headers: {
      'Authorization': config.authHeader,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = await response.json();
  return result;
}

// Render the group modal with bookings
function renderGroupModal() {
  const container = document.querySelector('.group-bookings-container');

  if (!GROUP_MODAL_STATE.bookings || GROUP_MODAL_STATE.bookings.length === 0) {
    container.innerHTML = '<p style="text-align: center; padding: 20px; color: #6b7280;">No bookings found for this date</p>';
    return;
  }

  // Render all bookings in a single table
  container.innerHTML = renderBookingsTable(GROUP_MODAL_STATE.bookings);

  // Attach event listeners
  attachGroupModalEventListeners();
}

// Render bookings table
function renderBookingsTable(bookings) {
  const groupExcludeData = GROUP_MODAL_STATE.groupExcludeData || { groups: [], excludes: [] };

  let html = '<table class="group-bookings-table"><thead><tr>';
  html += '<th>Lead</th>';
  html += '<th>Group</th>';
  html += '<th>Booking</th>';
  html += '</tr></thead><tbody>';

  bookings.forEach(booking => {
    html += '<tr>';

    // Lead radio - pre-select based on ResOS "Booking #" field
    html += '<td>';
    const isLeadBooking = String(booking.booking_id) === String(GROUP_MODAL_STATE.leadBookingId);
    const checkedAttr = isLeadBooking ? ' checked' : '';
    if (isLeadBooking) {
      console.log('BMA: Booking', booking.booking_id, 'matches ResOS Booking # field, pre-selected as lead');
    }
    html += `<input type="radio" name="lead-booking" value="${booking.booking_id}" class="lead-radio"${checkedAttr}>`;
    html += '</td>';

    // Group checkbox - pre-select if in GROUP/EXCLUDE field or is lead booking
    html += '<td>';
    const isInGroupField = groupExcludeData.groups.includes(String(booking.booking_id));
    if (isInGroupField) {
      console.log('BMA: Booking', booking.booking_id, 'is in GROUP/EXCLUDE field, should be pre-selected');
    }
    const autoChecked = isLeadBooking || isInGroupField;
    const groupCheckedAttr = autoChecked ? ' checked' : '';
    html += `<input type="checkbox" value="${booking.booking_id}" class="group-checkbox"${groupCheckedAttr}>`;
    html += '</td>';

    // Booking info - single line format
    html += '<td>';
    html += '<div class="booking-info-compact">';
    html += `${booking.site_name || 'N/A'} - ${booking.guest_name || 'Guest'}`;
    html += '</div>';
    html += '</td>';

    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

// Attach event listeners for group modal
function attachGroupModalEventListeners() {
  // Lead radio auto-checks group checkbox
  document.querySelectorAll('.lead-radio').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (!e.target.checked) return;

      const selectedLeadId = e.target.value;

      // Update group checkboxes: lead must be checked
      document.querySelectorAll('.group-checkbox').forEach(checkbox => {
        if (checkbox.value === selectedLeadId) {
          checkbox.checked = true;
        }
      });
    });
  });

  // Prevent unchecking the lead's group checkbox
  document.querySelectorAll('.group-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      const leadRadio = e.target.closest('tr').querySelector('.lead-radio');
      if (leadRadio && leadRadio.checked && !e.target.checked) {
        e.preventDefault();
        e.target.checked = true; // Force it to stay checked
        showToast('Lead booking must be part of the group', 'info');
      }
    });
  });
}

// Save group configuration
async function saveGroupConfiguration() {
  const leadRadios = document.querySelectorAll('.lead-radio');
  const groupCheckboxes = document.querySelectorAll('.group-checkbox');

  // Get lead booking ID
  let leadBookingId = null;
  leadRadios.forEach(radio => {
    if (radio.checked) {
      leadBookingId = radio.value;
    }
  });

  if (!leadBookingId) {
    showToast('Please select a lead booking', 'error');
    return;
  }

  // Get individual booking IDs that are checked
  const individualIds = [];
  groupCheckboxes.forEach(checkbox => {
    if (checkbox.checked) {
      individualIds.push(checkbox.value);
    }
  });

  // Make API call
  try {
    const config = getAPIConfig();
    const response = await fetch(`${config.baseUrl}/bookings/group`, {
      method: 'POST',
      headers: {
        'Authorization': config.authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resos_booking_id: GROUP_MODAL_STATE.resosBookingId,
        lead_booking_id: leadBookingId,
        individual_ids: individualIds
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    // Show success message
    if (window.showToast) {
      window.showToast('Group updated successfully!', 'success');
    }

    // Close modal
    closeGroupModal();

    // Reload restaurant tab
    if (window.parent && window.parent.reloadRestaurantTab) {
      window.parent.reloadRestaurantTab();
    } else if (window.reloadRestaurantTab) {
      window.reloadRestaurantTab();
    }

  } catch (err) {
    BMA_LOG.error('Error saving group:', err);
    if (window.showToast) {
      window.showToast(`Error: ${err.message}`, 'error');
    }
  }
}

// Close group modal
function closeGroupModal() {
  const modal = document.getElementById('group-management-modal');
  modal.classList.add('hidden');

  // Reset state
  GROUP_MODAL_STATE.resosBookingId = null;
  GROUP_MODAL_STATE.hotelBookingId = null;
  GROUP_MODAL_STATE.date = null;
  GROUP_MODAL_STATE.bookings = [];
  GROUP_MODAL_STATE.groups = {};
  GROUP_MODAL_STATE.currentGroupId = null;
}

// Make functions globally available for template content
window.openGroupManagementModal = openGroupManagementModal;

// Initialize group modal event listeners
function initializeGroupModal() {
  const modal = document.getElementById('group-management-modal');
  if (!modal) {
    BMA_LOG.log('GROUP modal not found, skipping initialization');
    return;
  }

  const closeBtn = modal.querySelector('.group-modal-close');
  const cancelBtn = modal.querySelector('.group-modal-cancel');
  const saveBtn = modal.querySelector('.group-modal-save');
  const overlay = modal.querySelector('.group-modal-overlay');

  if (closeBtn) closeBtn.addEventListener('click', closeGroupModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeGroupModal);
  if (overlay) overlay.addEventListener('click', closeGroupModal);
  if (saveBtn) saveBtn.addEventListener('click', saveGroupConfiguration);

  BMA_LOG.log('GROUP modal event listeners initialized');
}

// ============================================
// INITIALIZATION
// ============================================

// Initialize
async function init() {
  const settingsLoaded = await loadSettings();

  if (settingsLoaded) {
    // Initialize global API client for use by injected template content
    window.apiClient = new APIClient(STATE.settings);
    BMA_LOG.log('Global apiClient initialized');

    // Start cookie monitoring for NewBook auth
    AuthManager.startCookieMonitoring();

    // Check NewBook authentication status
    const isAuthenticated = await AuthManager.updateAuthState();

    // Only load tabs if authenticated
    if (isAuthenticated) {
      // Set up global inactivity timer reset on ANY user interaction
      setupGlobalInactivityReset();

      // Initialize staying tab date picker
      initializeStayingDatePicker();

      // Initialize refresh buttons
      initializeRefreshButtons();

      // Initialize group management modal
      initializeGroupModal();

      // Load summary tab on startup
      loadSummaryTab();

      // Silently preload staying tab with today's date to populate badge
      loadStayingTabSilently();

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
    // Only reset if we're on Restaurant, Checks, or Staying tab
    if (STATE.currentTab === 'restaurant' || STATE.currentTab === 'checks' || STATE.currentTab === 'staying') {
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

  BMA_LOG.log('Global inactivity timer reset listeners attached');
}

// Global function to reload restaurant tab (called by injected template content after booking actions)
window.reloadRestaurantTab = function() {
  BMA_LOG.log('reloadRestaurantTab called');
  loadRestaurantTab();
};

// Notify background when sidepanel is closing
window.addEventListener('pagehide', () => {
  BMA_LOG.log('Sidepanel closing, notifying background');
  chrome.runtime.sendMessage({ action: 'sidepanelClosed' }).catch(() => {
    // Background might not be available during unload
  });
});

// Start the app
document.addEventListener('DOMContentLoaded', init);
