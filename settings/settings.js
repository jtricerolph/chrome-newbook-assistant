// Default settings
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
  autoRefreshOnStaleCache: true
};

// DOM elements
const elements = {
  apiRootUrl: document.getElementById('apiRootUrl'),
  username: document.getElementById('username'),
  applicationPassword: document.getElementById('applicationPassword'),
  enableSidebarOnNewBook: document.getElementById('enableSidebarOnNewBook'),
  recentBookingsCount: document.getElementById('recentBookingsCount'),
  summaryRefreshRate: document.getElementById('summaryRefreshRate'),
  enablePlannerClickUpdate: document.getElementById('enablePlannerClickUpdate'),
  highlightNewestMinutes: document.getElementById('highlightNewestMinutes'),
  autoRefreshOnStaleCache: document.getElementById('autoRefreshOnStaleCache'),
  inactivityTimeout: document.getElementById('inactivityTimeout'),
  pauseInactivityWhenFormOpen: document.getElementById('pauseInactivityWhenFormOpen'),
  testConnection: document.getElementById('testConnection'),
  saveSettings: document.getElementById('saveSettings'),
  status: document.getElementById('status')
};

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    const settings = result.settings || DEFAULT_SETTINGS;

    elements.apiRootUrl.value = settings.apiRootUrl || '';
    elements.username.value = settings.username || '';
    elements.applicationPassword.value = settings.applicationPassword || '';
    elements.enableSidebarOnNewBook.checked = settings.enableSidebarOnNewBook !== false;
    elements.recentBookingsCount.value = settings.recentBookingsCount || 10;
    elements.summaryRefreshRate.value = settings.summaryRefreshRate || 60;
    elements.enablePlannerClickUpdate.checked = settings.enablePlannerClickUpdate !== false;
    elements.highlightNewestMinutes.value = settings.highlightNewestMinutes || 60;
    elements.autoRefreshOnStaleCache.checked = settings.autoRefreshOnStaleCache !== false;
    elements.inactivityTimeout.value = settings.inactivityTimeout || 60;
    elements.pauseInactivityWhenFormOpen.checked = settings.pauseInactivityWhenFormOpen !== false;
  } catch (error) {
    showStatus('Error loading settings: ' + error.message, 'error');
  }
}

// Save settings to storage
async function saveSettings() {
  try {
    // Validate required fields
    if (!elements.apiRootUrl.value.trim()) {
      showStatus('API Root URL is required', 'error');
      elements.apiRootUrl.focus();
      return;
    }

    if (!elements.username.value.trim()) {
      showStatus('Username is required', 'error');
      elements.username.focus();
      return;
    }

    if (!elements.applicationPassword.value.trim()) {
      showStatus('Application Password is required', 'error');
      elements.applicationPassword.focus();
      return;
    }

    // Validate API URL format
    try {
      const url = new URL(elements.apiRootUrl.value.trim());
      if (url.protocol !== 'https:') {
        showStatus('API URL must use HTTPS', 'error');
        elements.apiRootUrl.focus();
        return;
      }
    } catch (error) {
      showStatus('Invalid API URL format', 'error');
      elements.apiRootUrl.focus();
      return;
    }

    // Validate numeric ranges
    const bookingsCount = parseInt(elements.recentBookingsCount.value);
    if (bookingsCount < 1 || bookingsCount > 50) {
      showStatus('Recent bookings count must be between 1 and 50', 'error');
      elements.recentBookingsCount.focus();
      return;
    }

    const refreshRate = parseInt(elements.summaryRefreshRate.value);
    if (refreshRate < 10 || refreshRate > 300) {
      showStatus('Refresh rate must be between 10 and 300 seconds', 'error');
      elements.summaryRefreshRate.focus();
      return;
    }

    const highlightMinutes = parseInt(elements.highlightNewestMinutes.value);
    if (highlightMinutes < 0 || highlightMinutes > 1440) {
      showStatus('Highlight threshold must be between 0 and 1440 minutes (24 hours)', 'error');
      elements.highlightNewestMinutes.focus();
      return;
    }

    const inactivityTimeout = parseInt(elements.inactivityTimeout.value);
    if (inactivityTimeout < 10 || inactivityTimeout > 600) {
      showStatus('Inactivity timeout must be between 10 and 600 seconds (10 minutes)', 'error');
      elements.inactivityTimeout.focus();
      return;
    }

    const settings = {
      apiRootUrl: elements.apiRootUrl.value.trim().replace(/\/$/, ''), // Remove trailing slash
      username: elements.username.value.trim(),
      applicationPassword: elements.applicationPassword.value.trim().replace(/\s/g, ''), // Remove spaces
      enableSidebarOnNewBook: elements.enableSidebarOnNewBook.checked,
      recentBookingsCount: bookingsCount,
      summaryRefreshRate: refreshRate,
      enablePlannerClickUpdate: elements.enablePlannerClickUpdate.checked,
      highlightNewestMinutes: highlightMinutes,
      autoRefreshOnStaleCache: elements.autoRefreshOnStaleCache.checked,
      inactivityTimeout: inactivityTimeout,
      pauseInactivityWhenFormOpen: elements.pauseInactivityWhenFormOpen.checked
    };

    await chrome.storage.sync.set({ settings });

    // Notify background script that settings changed
    chrome.runtime.sendMessage({ action: 'settingsUpdated', settings });

    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    showStatus('Error saving settings: ' + error.message, 'error');
  }
}

// Test API connection
async function testConnection() {
  try {
    const apiUrl = elements.apiRootUrl.value.trim().replace(/\/$/, '');
    const username = elements.username.value.trim();
    const password = elements.applicationPassword.value.trim().replace(/\s/g, '');

    if (!apiUrl || !username || !password) {
      showStatus('Please fill in all API configuration fields', 'error');
      return;
    }

    showStatus('Testing connection...', 'info');
    elements.testConnection.disabled = true;

    // Test with a simple endpoint (summary)
    const response = await fetch(`${apiUrl}/summary?context=chrome-summary`, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + btoa(`${username}:${password}`),
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success !== undefined) {
        showStatus('Connection successful! API is responding correctly.', 'success');
      } else {
        showStatus('Connected, but unexpected response format', 'info');
      }
    } else if (response.status === 401) {
      showStatus('Authentication failed. Check your username and password.', 'error');
    } else if (response.status === 404) {
      showStatus('API endpoint not found. Check your API URL.', 'error');
    } else {
      showStatus(`Connection failed with status ${response.status}`, 'error');
    }
  } catch (error) {
    if (error.message.includes('Failed to fetch')) {
      showStatus('Cannot reach API server. Check the URL and network connection.', 'error');
    } else {
      showStatus('Error testing connection: ' + error.message, 'error');
    }
  } finally {
    elements.testConnection.disabled = false;
  }
}

// Show status message
function showStatus(message, type = 'info') {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;
  elements.status.classList.remove('hidden');

  // Auto-hide success messages after 5 seconds
  if (type === 'success') {
    setTimeout(() => {
      elements.status.classList.add('hidden');
    }, 5000);
  }
}

// Event listeners
elements.saveSettings.addEventListener('click', saveSettings);
elements.testConnection.addEventListener('click', testConnection);

// Allow Enter key to save settings on text inputs
[elements.apiRootUrl, elements.username, elements.applicationPassword].forEach(input => {
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveSettings();
    }
  });
});

// Load settings on page load
document.addEventListener('DOMContentLoaded', loadSettings);
