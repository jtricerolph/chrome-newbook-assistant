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
  }
};

// Global API client (exposed for use by injected template content)
window.apiClient = null;

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

    // Load summary tab on startup
    loadSummaryTab();

    // Check if there's a current booking from storage
    const result = await chrome.storage.local.get('currentBookingId');
    if (result.currentBookingId) {
      STATE.currentBookingId = result.currentBookingId;
    }
  }
}

// Global function to reload restaurant tab (called by injected template content after booking actions)
window.reloadRestaurantTab = function() {
  console.log('reloadRestaurantTab called');
  loadRestaurantTab();
};

// Start the app
document.addEventListener('DOMContentLoaded', init);
