// Background Service Worker for NewBook Assistant

// State
let settings = null;
let sidepanelOpenTabs = new Set(); // Track which tabs have sidepanel open

// Debug logging utility - respects enableDebugLogging setting
const BMA_LOG = {
  log: (...args) => {
    if (settings?.enableDebugLogging) {
      console.log(...args);
    }
  },
  warn: (...args) => {
    if (settings?.enableDebugLogging) {
      console.warn(...args);
    }
  },
  error: (...args) => {
    // Always log errors
    console.error(...args);
  },
  info: (...args) => {
    if (settings?.enableDebugLogging) {
      console.info(...args);
    }
  }
};

// Load settings on startup
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    settings = result.settings || null;
    return settings;
  } catch (error) {
    BMA_LOG.error('Error loading settings:', error);
    return null;
  }
}

// Restore sidepanel state from storage
async function restoreSidepanelState() {
  try {
    const result = await chrome.storage.local.get('sidepanelOpenTabs');
    if (result.sidepanelOpenTabs && Array.isArray(result.sidepanelOpenTabs)) {
      sidepanelOpenTabs = new Set(result.sidepanelOpenTabs);
      BMA_LOG.log('Restored sidepanel state for tabs:', Array.from(sidepanelOpenTabs));
    }
  } catch (error) {
    BMA_LOG.error('Error restoring sidepanel state:', error);
  }
}

// Initialize on install/update
chrome.runtime.onInstalled.addListener(async () => {
  BMA_LOG.log('Extension installed/updated');
  await loadSettings();
  await restoreSidepanelState();

  // Set up panel behavior for specific origin
  try {
    await chrome.sidePanel.setOptions({
      path: 'sidepanel/sidepanel.html',
      enabled: false
    });
  } catch (error) {
    BMA_LOG.error('Error setting global sidepanel options:', error);
  }
});

// Initialize on browser startup
chrome.runtime.onStartup.addListener(async () => {
  BMA_LOG.log('Browser started, restoring extension state');
  await loadSettings();
  await restoreSidepanelState();
});

// Tab Update Listener - Enable/Disable Sidepanel
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    await handleTabUpdate(tabId, tab.url);
  }
});

// Tab Activated Listener - Handle switching between tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    await handleTabUpdate(activeInfo.tabId, tab.url);
  }
});

// History State Updated (SPA navigation detection)
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  await handleTabUpdate(details.tabId, details.url);
});

// Handle Tab Updates
async function handleTabUpdate(tabId, url) {
  // Ensure settings are loaded
  if (!settings) {
    await loadSettings();
  }

  const isNewBookDomain = url.includes('appeu.newbook.cloud') || url.includes('login.newbook.cloud');

  try {
    if (isNewBookDomain && settings?.enableSidebarOnNewBook !== false) {
      // Enable sidepanel for this tab
      await chrome.sidePanel.setOptions({
        tabId: tabId,
        path: 'sidepanel/sidepanel.html',
        enabled: true
      });

      // Show badge to indicate sidepanel is available
      await chrome.action.setBadgeText({ tabId, text: '●' });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#3b82f6' });
      await chrome.action.setTitle({
        tabId,
        title: 'Click to open NewBook Assistant'
      });

      // Detect if it's a booking page
      const bookingIdMatch = url.match(/\/bookings_(?:view|checkin)\/(\d+)/i);
      if (bookingIdMatch) {
        const bookingId = bookingIdMatch[1];

        // Store current booking ID
        await chrome.storage.local.set({ currentBookingId: bookingId });

        // Notify sidepanel
        try {
          await chrome.runtime.sendMessage({
            action: 'bookingDetected',
            bookingId: bookingId,
            url: url
          });
        } catch (error) {
          // Sidepanel might not be open, that's okay
          BMA_LOG.log('Sidepanel not open, booking ID stored for later');
        }
      }
    } else {
      // Disable sidepanel for non-NewBook tabs
      await chrome.sidePanel.setOptions({
        tabId: tabId,
        enabled: false
      });

      // Try to close the sidepanel window if we're switching away from NewBook
      try {
        const windows = await chrome.windows.getAll();
        for (const window of windows) {
          await chrome.sidePanel.close({ windowId: window.id });
        }
      } catch (error) {
        // Sidepanel may not be open, that's fine
        BMA_LOG.log('Could not close sidepanel:', error);
      }

      // Clear badge
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.setTitle({
        tabId,
        title: 'NewBook Assistant'
      });
    }
  } catch (error) {
    BMA_LOG.error('Error handling tab update:', error);
  }
}

// Toolbar icon click handler - WITH TOGGLE SUPPORT
chrome.action.onClicked.addListener(async (tab) => {
  BMA_LOG.log('Toolbar icon clicked for tab:', tab.id);

  const isCurrentlyOpen = sidepanelOpenTabs.has(tab.id);

  try {
    if (isCurrentlyOpen) {
      // Close the sidepanel
      await chrome.sidePanel.close({ tabId: tab.id });
      sidepanelOpenTabs.delete(tab.id);
      chrome.storage.local.set({ sidepanelOpenTabs: Array.from(sidepanelOpenTabs) });
      BMA_LOG.log('Sidepanel closed via toolbar icon for tab:', tab.id);

      // Notify content script to show button
      chrome.tabs.sendMessage(tab.id, { action: 'showOpenButton' }).catch(() => {});
    } else {
      // Open sidepanel
      await chrome.sidePanel.open({ tabId: tab.id });
      sidepanelOpenTabs.add(tab.id);
      chrome.storage.local.set({ sidepanelOpenTabs: Array.from(sidepanelOpenTabs) });
      BMA_LOG.log('Sidepanel opened via toolbar icon for tab:', tab.id);

      // Notify content script that sidepanel was opened
      chrome.tabs.sendMessage(tab.id, { action: 'sidepanelOpened' }).catch(() => {});
    }
  } catch (error) {
    BMA_LOG.error('Failed to toggle sidepanel:', error);
  }
});

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    // Settings were updated, reload them
    settings = message.settings;
    BMA_LOG.log('Settings updated:', settings);

    // Update all NewBook tabs
    chrome.tabs.query({ url: 'https://appeu.newbook.cloud/*' }, (tabs) => {
      tabs.forEach(tab => {
        handleTabUpdate(tab.id, tab.url);
      });
    });

    // Forward to sidepanel if open
    chrome.runtime.sendMessage(message).catch(() => {
      // Sidepanel might not be open
    });
  } else if (message.action === 'bookingDetected') {
    // Forward booking detection to sidepanel (from popup/content script)
    BMA_LOG.log('Booking detected:', message.bookingId, 'source:', message.source);
    chrome.runtime.sendMessage(message).catch(() => {
      // Sidepanel might not be open
    });
  } else if (message.action === 'plannerClick') {
    // Forward planner click to sidepanel
    BMA_LOG.log('Planner click:', message.bookingId);
    chrome.runtime.sendMessage(message).catch(() => {
      // Sidepanel might not be open
    });
  } else if (message.action === 'sessionLockChanged') {
    // Forward session lock status to sidepanel
    BMA_LOG.log('Session lock:', message.isLocked ? 'LOCKED' : 'UNLOCKED');
    chrome.runtime.sendMessage(message).catch(() => {
      // Sidepanel might not be open
    });
  } else if (message.action === 'openSidePanel' && sender.tab?.id) {
    // Open sidepanel for specific tab (has user gesture from content script)
    chrome.sidePanel.open({ tabId: sender.tab.id })
      .then(() => {
        // Track that sidepanel is open for this tab
        sidepanelOpenTabs.add(sender.tab.id);
        chrome.storage.local.set({ sidepanelOpenTabs: Array.from(sidepanelOpenTabs) });
        // Notify content script that sidepanel was opened
        chrome.tabs.sendMessage(sender.tab.id, { action: 'sidepanelOpened' }).catch(() => {});
      })
      .catch((error) => {
        BMA_LOG.error('Failed to open sidepanel:', error);
      });
  } else if (message.action === 'sidepanelClosed') {
    // Sidepanel was closed, notify content script to show button
    // Use the tab ID from the message instead of querying active tab
    const tabId = message.tabId;

    if (tabId) {
      // Track that sidepanel is closed for this tab
      sidepanelOpenTabs.delete(tabId);
      chrome.storage.local.set({ sidepanelOpenTabs: Array.from(sidepanelOpenTabs) });
      BMA_LOG.log('Sidepanel closed for tab:', tabId);

      // Send to the specific tab that owned the sidepanel
      chrome.tabs.sendMessage(tabId, { action: 'showOpenButton' }).catch((error) => {
        BMA_LOG.log('Could not notify tab', tabId, 'to show button:', error.message);
      });
    } else {
      BMA_LOG.log('sidepanelClosed message missing tabId, cannot notify content script');
    }
  } else if (message.action === 'isSidepanelOpen' && sender.tab?.id) {
    // Query if sidepanel is open for this tab
    const isOpen = sidepanelOpenTabs.has(sender.tab.id);
    BMA_LOG.log('Sidepanel state query for tab', sender.tab.id, ':', isOpen);
    sendResponse({ isOpen: isOpen });
    return true; // Keep message channel open for async response
  }

  return true;
});

// Initialize
loadSettings();
