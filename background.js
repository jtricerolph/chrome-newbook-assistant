// Background Service Worker for NewBook Assistant

// State
let settings = null;

// Load settings on startup
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    settings = result.settings || null;
    return settings;
  } catch (error) {
    console.error('Error loading settings:', error);
    return null;
  }
}

// Initialize on install/update
chrome.runtime.onInstalled.addListener(async () => {
  console.log('NewBook Assistant installed/updated');
  await loadSettings();

  // Set up panel behavior for specific origin
  try {
    await chrome.sidePanel.setOptions({
      path: 'sidepanel/sidepanel.html',
      enabled: false
    });
    console.log('Sidepanel disabled globally');
  } catch (error) {
    console.error('Error setting global sidepanel options:', error);
  }
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
          console.log('Sidepanel not open, booking ID stored for later');
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
        console.log('Could not close sidepanel:', error);
      }

      // Clear badge
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.setTitle({
        tabId,
        title: 'NewBook Assistant'
      });
    }
  } catch (error) {
    console.error('Error handling tab update:', error);
  }
}

// Toolbar icon click handler
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Toolbar icon clicked for tab:', tab.id);

  try {
    // Open sidepanel for the current tab
    await chrome.sidePanel.open({ tabId: tab.id });
    console.log('Sidepanel opened via toolbar icon');
  } catch (error) {
    console.error('Failed to open sidepanel:', error);
  }
});

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    // Settings were updated, reload them
    settings = message.settings;
    console.log('Settings updated:', settings);

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
    console.log('Forwarding bookingDetected from content script:', message.bookingId, 'source:', message.source);
    chrome.runtime.sendMessage(message).catch(() => {
      // Sidepanel might not be open
    });
  } else if (message.action === 'plannerClick') {
    // Forward planner click to sidepanel
    console.log('Forwarding plannerClick from content script:', message.bookingId);
    chrome.runtime.sendMessage(message).catch(() => {
      // Sidepanel might not be open
    });
  } else if (message.action === 'sessionLockChanged') {
    // Forward session lock status to sidepanel
    console.log('Session lock status changed:', message.isLocked ? 'LOCKED' : 'UNLOCKED');
    chrome.runtime.sendMessage(message).catch(() => {
      // Sidepanel might not be open
    });
  } else if (message.action === 'openSidePanel' && sender.tab?.id) {
    // Open sidepanel for specific tab (has user gesture from content script)
    chrome.sidePanel.open({ tabId: sender.tab.id })
      .then(() => {
        console.log('Sidepanel opened for tab:', sender.tab.id);
        // Notify content script that sidepanel was opened
        chrome.tabs.sendMessage(sender.tab.id, { action: 'sidepanelOpened' }).catch(() => {});
      })
      .catch((error) => {
        console.error('Failed to open sidepanel:', error);
      });
  } else if (message.action === 'sidepanelClosed') {
    // Sidepanel was closed, notify content script to show button
    console.log('Sidepanel closed, notifying content script');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'showOpenButton' }).catch(() => {});
      }
    });
  }

  return true;
});

// Initialize
loadSettings();

console.log('NewBook Assistant background service worker running');
