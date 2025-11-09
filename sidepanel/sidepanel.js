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
  }
};

// Global API client (exposed for use by injected template content)
window.apiClient = null;

// Authentication State Management
const AuthManager = {
  // Check if NewBook session is active by checking cookies
  async checkNewBookAuth() {
    try {
      // NewBook uses session cookies - check for common session cookie names
      // Adjust cookie name based on your NewBook instance (may be 'PHPSESSID', 'newbook_session', etc.)
      const cookies = await chrome.cookies.getAll({
        url: 'https://appeu.newbook.cloud'
      });

      console.log('NewBook cookies found:', cookies.length);

      // Check if there's a valid session cookie
      // NewBook typically uses PHPSESSID or similar
      const sessionCookie = cookies.find(cookie =>
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

    if (isAuthenticated) {
      this.hideLockScreen();
    } else {
      this.showLockScreen();
    }

    return isAuthenticated;
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
      alert('Error: ' + error.message);
    }
  });

  // Helper functions for restaurant tab interactions
  function toggleCreateForm(date) {
    const formId = 'create-form-' + date;
    const form = document.getElementById(formId);
    if (!form) return;

    if (form.style.display === 'none' || !form.style.display) {
      form.style.display = 'block';
      form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      form.style.display = 'none';
    }
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

    const formId = 'create-form-' + date;
    const form = document.getElementById(formId);
    if (!form) return;

    const feedbackId = 'feedback-create-' + date;
    const feedback = document.getElementById(feedbackId);

    // Collect form data
    const formData = {
      date: date,
      time: form.querySelector('[name="time"]').value,
      people: form.querySelector('[name="people"]').value,
      guest_name: form.querySelector('[name="guest_name"]').value,
      guest_phone: form.querySelector('[name="guest_phone"]').value,
      guest_email: form.querySelector('[name="guest_email"]').value,
      booking_ref: form.querySelector('[name="booking_ref"]').value,
      hotel_guest: form.querySelector('[name="hotel_guest"]').value,
      dbb: form.querySelector('[name="dbb"]').value,
      booking_note: form.querySelector('[name="booking_note"]').value
    };

    createProcessing = true;
    console.log('Starting create booking operation');

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
        setTimeout(() => {
          form.style.display = 'none';
          window.reloadRestaurantTab();
        }, 1500);
      } else {
        showFeedback(feedback, 'Error: ' + (result.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      showFeedback(feedback, 'Error: ' + error.message, 'error');
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

    const formId = 'update-form-' + date + '-' + resosBookingId;
    const form = document.getElementById(formId);
    if (!form) return;

    const feedbackId = 'feedback-update-' + date + '-' + resosBookingId;
    const feedback = document.getElementById(feedbackId);

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
      return;
    }

    updateProcessing = true;
    console.log('Starting update booking operation');

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
        setTimeout(() => {
          form.style.display = 'none';
          window.reloadRestaurantTab();
        }, 1500);
      } else {
        showFeedback(feedback, 'Error: ' + (result.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      showFeedback(feedback, 'Error: ' + error.message, 'error');
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

    if (!confirm(`Exclude this match for ${guestName}?\n\nThis will add "NOT-${hotelBookingId}" to the Resos booking notes.`)) {
      return;
    }

    excludeProcessing = true;
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
        alert('Match excluded successfully!');
        window.reloadRestaurantTab();
      } else {
        alert('Error: ' + (result.message || 'Unknown error'));
      }
    } catch (error) {
      alert('Error: ' + error.message);
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

    // 3. View in Resos button (always shown if we have IDs)
    if (resos.id && resos.restaurant_id) {
      const resosUrl = `https://app.resos.com/${resos.restaurant_id}/bookings/timetable/${date}/${resos.id}`;
      html += `<button class="btn-view-resos" onclick="window.open('${resosUrl}', '_blank')">`;
      html += '<span class="material-symbols-outlined">visibility</span> View in Resos';
      html += '</button>';
    }

    // 4. Update button (only if there are suggested updates)
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

  // Submit selected suggestions from comparison checkboxes
  async function submitSuggestions(date, resosBookingId, hotelBookingId, isConfirmed) {
    const containerId = 'comparison-' + date + '-' + resosBookingId;
    const container = document.getElementById(containerId);
    if (!container) return;

    // Find all checked suggestion checkboxes in this comparison container
    const checkboxes = container.querySelectorAll('.suggestion-checkbox:checked');

    if (checkboxes.length === 0) {
      alert('Please select at least one suggestion to update.');
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
        alert('Booking updated successfully!');
        window.reloadRestaurantTab();
      } else {
        alert('Error: ' + (result.message || 'Unknown error'));
      }
    } catch (error) {
      alert('Error: ' + error.message);
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
        console.log(hasChanged ? 'Summary updated with new data' : 'Summary displayed (no change but manual load)');
      } else {
        // Only skip display during auto-refresh when nothing changed
        console.log('Summary unchanged during auto-refresh - showing no changes message');
        updateBadge('summary', data.critical_count || 0, data.warning_count || 0);
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
        // Don't refresh while user is reading - reset countdown
        console.log('Auto-refresh paused - user has expanded booking cards');
        countdownText.innerHTML = '<strong style="color: #f59e0b;">⏸ Auto-refresh paused (booking expanded)</strong>';
        setTimeout(() => {
          secondsLeft = STATE.settings.summaryRefreshRate;
          updateCountdownText(countdownText, secondsLeft);
        }, 2000);
      } else {
        loadSummaryTab(true); // Pass true to indicate auto-refresh
      }
    }
  }, 1000);
}

function updateCountdownText(element, seconds) {
  element.innerHTML = `Checking for updates in <strong>${seconds}</strong>s`;
}

function showNoChangesMessage() {
  const countdownElement = document.querySelector('[data-content="summary"] .summary-countdown');
  const countdownText = countdownElement.querySelector('.countdown-text');

  // Show "No changes" message temporarily
  countdownText.innerHTML = '<strong style="color: #10b981;">✓ No changes found</strong>';

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

// Inactivity Timer (return to Summary after 60s on Restaurant/Checks tabs)
function startInactivityTimer() {
  resetInactivityTimer();

  STATE.timers.inactivityTimeout = setTimeout(() => {
    if (STATE.currentTab !== 'summary') {
      switchTab('summary');
    }
  }, 60000); // 60 seconds
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
