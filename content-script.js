// Content Script for NewBook pages

console.log('NewBook Assistant content script loaded');

// State
let currentBookingId = null;
let settings = null;

// Load settings
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    settings = result.settings || null;
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Multi-method booking ID detection with cascading fallbacks
function findBookingIdFromContext() {
  // Method 1: Check URL pattern (highest priority)
  const urlMatch = window.location.href.match(/\/bookings_(?:view|checkin)\/(\d+)/i);
  if (urlMatch) {
    return urlMatch[1];
  }

  // Method 2: Look for elements with booking_id attribute
  const bookingElements = document.querySelectorAll('[booking_id]');
  if (bookingElements.length > 0) {
    return bookingElements[0].getAttribute('booking_id');
  }

  // Method 3: Check for data-booking-id attributes
  const dataBookingElements = document.querySelectorAll('[data-booking-id]');
  if (dataBookingElements.length > 0) {
    return dataBookingElements[0].getAttribute('data-booking-id');
  }

  // Method 4: Look for visible jQuery UI dialog with booking title
  const visibleDialogs = document.querySelectorAll('.ui-dialog');
  for (const dialog of visibleDialogs) {
    if (dialog.style.display === 'none' || dialog.offsetParent === null) {
      continue;
    }

    const titleElement = dialog.querySelector('.ui-dialog-title');
    if (titleElement) {
      const bookingMatch = titleElement.textContent.match(/Booking #(\d+)/i);
      if (bookingMatch) {
        return bookingMatch[1];
      }
    }
  }

  // Method 5: Check for booking links
  const bookingLinks = document.querySelectorAll('a[href*="bookings_view/"]');
  if (bookingLinks.length > 0) {
    const linkMatch = bookingLinks[0].href.match(/bookings_view\/(\d+)/i);
    if (linkMatch) {
      return linkMatch[1];
    }
  }

  return null;
}

// Detect booking page
function detectBookingPage() {
  const url = window.location.href;

  // Pattern: /bookings_view/12345 or /bookings_checkin/12345
  const bookingIdMatch = url.match(/\/bookings_(?:view|checkin)\/(\d+)/i);

  if (bookingIdMatch) {
    const bookingId = bookingIdMatch[1];

    if (bookingId !== currentBookingId) {
      currentBookingId = bookingId;
      console.log('Booking detected:', bookingId);

      // Notify background script
      chrome.runtime.sendMessage({
        action: 'bookingDetected',
        bookingId: bookingId,
        url: url
      }).catch(error => {
        console.log('Could not send message to background:', error);
      });
    }
  } else {
    // Not on a booking page
    if (currentBookingId !== null) {
      currentBookingId = null;
      console.log('Left booking page');
    }
  }
}

// Planner single-click detection
let clickTimer = null;
let clickCount = 0;

function handlePlannerBlockClick(event) {
  const bookingBlock = event.currentTarget;
  let bookingId = null;

  // Try multiple methods to extract booking ID
  bookingId = bookingBlock.getAttribute('booking_id') ||
              bookingBlock.getAttribute('data-booking-id') ||
              bookingBlock.dataset.bookingId;

  // Fallback: try to find in class name
  if (!bookingId && bookingBlock.className) {
    const classMatch = bookingBlock.className.match(/booking[_-](\d+)/i);
    if (classMatch) {
      bookingId = classMatch[1];
    }
  }

  // Fallback: try to find in element ID
  if (!bookingId && bookingBlock.id) {
    const idMatch = bookingBlock.id.match(/booking[_-](\d+)/i);
    if (idMatch) {
      bookingId = idMatch[1];
    }
  }

  if (!bookingId) return;

  clickCount++;

  if (clickCount === 1) {
    // Wait to see if this is a double-click
    clickTimer = setTimeout(() => {
      if (clickCount === 1 && settings?.enablePlannerClickUpdate) {
        // Single click confirmed - trigger sidepanel refresh
        console.log('Planner single-click on booking:', bookingId);

        chrome.runtime.sendMessage({
          action: 'plannerClick',
          bookingId: bookingId,
          source: 'planner-single-click'
        }).catch(error => {
          console.log('Could not send planner click message:', error);
        });
      }
      clickCount = 0;
    }, 250); // 250ms delay to detect double-click
  } else {
    // Double-click detected - cancel single-click action
    console.log('Planner double-click on booking:', bookingId, '(letting NewBook handle it)');
    clearTimeout(clickTimer);
    clickCount = 0;
  }
}

function setupPlannerClickListeners() {
  console.log('Setting up planner click listeners...');

  // Attach click listeners to booking blocks
  const attachListenersToBlocks = () => {
    // Only target DIV elements with booking_id (planner blocks are typically divs)
    // This avoids attaching to links, spans, or other elements
    const bookingBlocks = document.querySelectorAll('div[booking_id], div[data-booking-id]');

    console.log(`Found ${bookingBlocks.length} planner booking blocks`);

    bookingBlocks.forEach(block => {
      // Skip if already has listener
      if (block.dataset.nbAssistantClickListener) return;

      block.addEventListener('click', handlePlannerBlockClick);
      block.dataset.nbAssistantClickListener = 'true';
    });
  };

  // Setup listeners for existing blocks
  attachListenersToBlocks();

  // Watch for new blocks being added (planner navigation, date changes, etc.)
  // Use debouncing to avoid processing too many mutations
  let debounceTimer = null;
  const clickListenerObserver = new MutationObserver((mutations) => {
    // Only process if actual booking blocks were added
    let hasNewBookingBlocks = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if the added node is a booking block or contains booking blocks
          if (node.matches && (node.matches('div[booking_id], div[data-booking-id]') ||
              node.querySelector('div[booking_id], div[data-booking-id]'))) {
            hasNewBookingBlocks = true;
            break;
          }
        }
      }
      if (hasNewBookingBlocks) break;
    }

    if (hasNewBookingBlocks) {
      // Debounce to avoid running multiple times in quick succession
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(attachListenersToBlocks, 100);
    }
  });

  clickListenerObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// EasyToolTip Popup Detection (Preview Popup)
// Note: easyToolTip is NewBook's preview popup that opens on double-click
// This is NOT a hover tooltip - it's a full popup dialog
function detectEasyToolTipPopup() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Only check elements with IDs that contain booking numbers
          // This filters out generic hover tooltips (id="easyTooltip")
          // and only processes preview popups (id="easyTooltip_booking_12345")
          if (node.id && /easyTooltip_booking[_-]\d+/i.test(node.id)) {
            handleEasyToolTipPopup(node);
          }
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function handleEasyToolTipPopup(popupElement) {
  console.log('EasyToolTip element detected:', {
    id: popupElement.id,
    classes: popupElement.className,
    hasPermanent: popupElement.classList.contains('permanent')
  });

  // Check if already processed
  if (popupElement.dataset.nbAssistantProcessed) {
    console.log('Already processed this tooltip');
    return;
  }

  // Extract booking ID from element ID (format: easyTooltip_booking_31977)
  let bookingId = null;

  if (popupElement.id) {
    const idMatch = popupElement.id.match(/easyTooltip_booking[_-](\d+)/i);
    if (idMatch) {
      bookingId = idMatch[1];
    }
  }

  // IMPORTANT: Only process tooltips that have a specific booking ID in their ID attribute
  // Generic hover tooltips have id="easyTooltip" (no booking number)
  // Preview popups have id="easyTooltip_booking_12345"
  if (!bookingId) {
    console.log('Ignoring easyToolTip without booking ID (generic hover tooltip)', popupElement.id);
    return;
  }

  // Fallback: try to find booking ID from links inside the popup
  if (!bookingId) {
    const bookingLink = popupElement.querySelector('a[href*="bookings_view/"]');
    if (bookingLink) {
      const linkMatch = bookingLink.href.match(/bookings_view\/(\d+)/i);
      if (linkMatch) {
        bookingId = linkMatch[1];
      }
    }
  }

  if (!bookingId) {
    return;
  }

  // Mark as processed
  popupElement.dataset.nbAssistantProcessed = 'true';

  console.log('EasyToolTip preview popup detected for booking:', bookingId);

  // Store and notify
  chrome.storage.local.set({ currentBookingId: bookingId }).catch(() => {});
  chrome.runtime.sendMessage({
    action: 'bookingDetected',
    bookingId: bookingId,
    url: window.location.href,
    source: 'easytoolip-popup'
  }).catch(error => {
    console.log('Could not send popup message:', error);
  });
}

// Booking Popup Detection (NewBook uses fieldsets with make_popup_tab_XXXXX class)
// Track recently processed booking IDs to prevent duplicate notifications
const processedPopupBookings = new Set();

function handleBookingPopup(popupElement) {
  console.log('handleBookingPopup called, element:', {
    tagName: popupElement.tagName,
    classList: popupElement.className,
    display: popupElement.style.display
  });

  // Check if we've already processed this popup element
  if (popupElement.dataset.nbAssistantProcessed) {
    console.log('Already processed this popup element');
    return;
  }

  // Extract booking ID from class name (format: make_popup_tab_32794)
  let bookingId = null;

  if (popupElement.className) {
    const classMatch = popupElement.className.match(/make_popup_tab[_-]?(\d+)/i);
    if (classMatch) {
      bookingId = classMatch[1];
    }
  }

  if (!bookingId) {
    console.log('No booking ID found in popup class name');
    return;
  }

  // Mark this element as processed
  popupElement.dataset.nbAssistantProcessed = 'true';

  // Check if we've recently processed this booking ID (prevents duplicate notifications)
  if (processedPopupBookings.has(bookingId)) {
    console.log('Booking', bookingId, 'already processed recently, skipping duplicate notification');
    return;
  }

  // Add to processed set and auto-remove after 2 seconds
  processedPopupBookings.add(bookingId);
  setTimeout(() => processedPopupBookings.delete(bookingId), 2000);

  console.log('NewBook popup detected for booking:', bookingId);

  // Store and notify
  chrome.storage.local.set({ currentBookingId: bookingId }).catch(() => {});
  chrome.runtime.sendMessage({
    action: 'bookingDetected',
    bookingId: bookingId,
    url: window.location.href,
    source: 'popup'
  }).catch(error => {
    console.log('Could not send popup message:', error);
  });
}

function checkExistingPopups() {
  // Look for fieldsets with make_popup_tab class (NewBook booking popups)
  const popups = document.querySelectorAll('fieldset[class*="make_popup_tab"]');
  popups.forEach(popup => {
    if (popup.style.display !== 'none' && popup.offsetParent !== null) {
      handleBookingPopup(popup);
    }
  });
}

function setupPopupDetection() {
  // MutationObserver for new popups
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if it's a fieldset with make_popup_tab class
          if (node.tagName === 'FIELDSET' && node.className && /make_popup_tab/i.test(node.className)) {
            handleBookingPopup(node);
          }

          // Check children for popups
          if (node.querySelectorAll) {
            const popups = node.querySelectorAll('fieldset[class*="make_popup_tab"]');
            popups.forEach(popup => handleBookingPopup(popup));
          }
        }
      });

      // Watch for style attribute changes (show/hide)
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const target = mutation.target;
        if (target.tagName === 'FIELDSET' && target.className && /make_popup_tab/i.test(target.className)) {
          if (target.style.display !== 'none' && target.offsetParent !== null) {
            handleBookingPopup(target);
          }
        }
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style']
  });

  // Periodic polling as backup (every 2 seconds)
  setInterval(checkExistingPopups, 2000);

  // Check for existing popups on load
  checkExistingPopups();
}

// SPA Navigation Detection
let lastUrl = window.location.href;

function checkUrlChange() {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    detectBookingPage();
  }
}

// Listen for popstate events (SPA navigation)
window.addEventListener('popstate', () => {
  detectBookingPage();
});

// Poll for URL changes (backup for SPA detection)
setInterval(checkUrlChange, 500);

// Create floating button to open sidepanel
function createOpenButton() {
  // Check if already exists
  if (document.getElementById('newbook-helper-btn')) return;

  // Check if dismissed this session
  if (sessionStorage.getItem('sidepanel-dismissed')) return;

  const button = document.createElement('button');
  button.id = 'newbook-helper-btn';
  button.innerHTML = `
    <span style="font-size: 18px; margin-right: 6px;">📋</span>
    <span>Open Assistant</span>
    <span id="close-btn" style="margin-left: 10px; font-size: 20px; opacity: 0.7;">×</span>
  `;

  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 24px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    z-index: 999999;
    transition: all 0.2s;
    display: flex;
    align-items: center;
  `;

  // Hover effect
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.05)';
    button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
  });

  // Main click - open sidepanel
  button.addEventListener('click', (e) => {
    if (e.target.id === 'close-btn') return; // Let close handle it

    chrome.runtime.sendMessage({ action: 'openSidePanel' });
    button.remove();
    sessionStorage.setItem('sidepanel-dismissed', 'true');
  });

  // Close button click
  const closeBtn = button.querySelector('#close-btn');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    button.style.opacity = '0';
    button.style.transition = 'opacity 0.3s';
    setTimeout(() => button.remove(), 300);
    sessionStorage.setItem('sidepanel-dismissed', 'true');
  });

  document.body.appendChild(button);

  // Auto-hide after 15 seconds
  setTimeout(() => {
    if (button.parentElement) {
      button.style.opacity = '0';
      button.style.transition = 'opacity 0.3s';
      setTimeout(() => button.remove(), 300);
    }
  }, 15000);
}

// Session Lock Dialog Detection
// Detects NewBook's idle session dialog (#locked_session_dialog)
function setupSessionLockDetection() {
  console.log('Setting up session lock detection...');

  // Check for existing dialog on page load
  const checkSessionLock = () => {
    const lockDialog = document.getElementById('locked_session_dialog');
    const isLocked = lockDialog && lockDialog.style.display !== 'none';

    console.log('Session lock check:', isLocked ? 'LOCKED' : 'UNLOCKED');

    // Notify background script
    chrome.runtime.sendMessage({
      action: 'sessionLockChanged',
      isLocked: isLocked
    }).catch(error => {
      console.log('Could not send session lock message:', error);
    });

    return isLocked;
  };

  // Initial check
  checkSessionLock();

  // Monitor for dialog appearance/disappearance
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;

    for (const mutation of mutations) {
      // Check for added nodes
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.id === 'locked_session_dialog' ||
              (node.querySelector && node.querySelector('#locked_session_dialog'))) {
            shouldCheck = true;
            break;
          }
        }
      }

      // Check for removed nodes
      for (const node of mutation.removedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.id === 'locked_session_dialog') {
            shouldCheck = true;
            break;
          }
        }
      }

      // Check for attribute changes on the dialog itself
      if (mutation.type === 'attributes' &&
          mutation.target.id === 'locked_session_dialog') {
        shouldCheck = true;
      }

      if (shouldCheck) break;
    }

    if (shouldCheck) {
      checkSessionLock();
    }
  });

  // Observe the entire document for dialog changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });

  console.log('Session lock observer active');
}

// Initialize
async function init() {
  await loadSettings();

  // Initial detection
  detectBookingPage();

  // Set up planner click detection with dynamic listeners
  setupPlannerClickListeners();

  // NOTE: easyToolTip detection disabled - it triggers on hover tooltips too
  // detectEasyToolTipPopup();

  // Set up NewBook popup detection (fieldsets with make_popup_tab class)
  setupPopupDetection();

  // Set up session lock detection
  setupSessionLockDetection();

  // Show floating button to prompt user to open sidepanel
  setTimeout(createOpenButton, 1000); // Small delay to let page load

  console.log('NewBook Assistant ready');
}

// Start
init();

// Listen for settings updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    settings = message.settings;
  }
});
