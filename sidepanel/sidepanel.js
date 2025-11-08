// State management
const STATE = {
  currentTab: 'summary',
  currentBookingId: null,
  settings: null,
  badges: {
    summary: 0,
    restaurant: 0,
    checks: 0
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

// API Client
class APIClient {
  constructor(settings) {
    this.settings = settings;
    this.baseUrl = settings.apiRootUrl;
    this.authHeader = 'Basic ' + btoa(`${settings.username}:${settings.applicationPassword}`);
  }

  async fetchSummary() {
    const response = await fetch(`${this.baseUrl}/summary?context=chrome-summary`, {
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

function updateBadge(tabName, count, isWarning = false) {
  console.log(`Updating badge for ${tabName}: count=${count}, isWarning=${isWarning}`);
  STATE.badges[tabName] = count;
  const badgeElement = document.querySelector(`[data-badge="${tabName}"]`);

  if (!badgeElement) {
    console.error(`Badge element not found for ${tabName}`);
    return;
  }

  if (count > 0) {
    badgeElement.textContent = count;
    badgeElement.classList.remove('hidden');
    if (isWarning) {
      badgeElement.classList.add('warning');
    } else {
      badgeElement.classList.remove('warning');
    }
    console.log(`Badge for ${tabName} now visible with count ${count}`);
  } else {
    badgeElement.classList.add('hidden');
    console.log(`Badge for ${tabName} now hidden (count is 0)`);
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
async function loadSummaryTab() {
  if (!STATE.settings) {
    showError('summary', 'Please configure settings first');
    return;
  }

  try {
    showLoading('summary');
    const api = new APIClient(STATE.settings);
    const data = await api.fetchSummary();

    if (data.success && data.html) {
      showData('summary', data.html);
      updateBadge('summary', data.badge_count || 0);
      STATE.cache.summary = data;

      // Show countdown
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
  const countdownText = countdownElement.querySelector('.countdown-text strong');

  countdownElement.classList.remove('hidden');

  // Clear existing countdown
  if (STATE.timers.summaryCountdown) {
    clearInterval(STATE.timers.summaryCountdown);
  }

  let secondsLeft = STATE.settings.summaryRefreshRate;
  countdownText.textContent = secondsLeft;

  STATE.timers.summaryCountdown = setInterval(() => {
    secondsLeft--;
    countdownText.textContent = secondsLeft;

    if (secondsLeft <= 0) {
      loadSummaryTab(); // This will restart the countdown
    }
  }, 1000);
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
      updateBadge('restaurant', data.badge_count || 0);
      STATE.cache.restaurant = data;
    } else if (data.success && !data.html) {
      showEmpty('restaurant');
      updateBadge('restaurant', 0);
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
      updateBadge('checks', data.badge_count || 0);
      STATE.cache.checks = data;
    } else if (data.success && !data.html) {
      showEmpty('checks');
      updateBadge('checks', 0);
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
    const restaurantBadge = restaurantData?.badge_count || 0;
    const checksBadge = checksData?.badge_count || 0;

    console.log('Badge counts - Restaurant:', restaurantBadge, 'Checks:', checksBadge);

    // Priority logic:
    // 1. Restaurant tab if it has issues
    // 2. Checks tab if it has issues
    // 3. Restaurant tab as fallback (always show restaurant when booking detected)
    if (restaurantBadge > 0) {
      console.log('Switching to restaurant tab (has issues)');
      switchTab('restaurant');
    } else if (checksBadge > 0) {
      console.log('Switching to checks tab (has issues)');
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
    console.log('Restaurant data loaded, badge_count:', data.badge_count);
    console.log('Full restaurant API response:', JSON.stringify(data, null, 2));
    updateBadge('restaurant', data.badge_count || 0);
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
    console.log('Checks data loaded, badge_count:', data.badge_count);
    console.log('Full checks API response:', JSON.stringify(data, null, 2));
    updateBadge('checks', data.badge_count || 0);
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
    if (result.settings && result.settings.apiRootUrl) {
      STATE.settings = result.settings;
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

document.getElementById('settingsButton').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Initialize
async function init() {
  const settingsLoaded = await loadSettings();

  if (settingsLoaded) {
    // Load summary tab on startup
    loadSummaryTab();

    // Check if there's a current booking from storage
    const result = await chrome.storage.local.get('currentBookingId');
    if (result.currentBookingId) {
      STATE.currentBookingId = result.currentBookingId;
    }
  }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
