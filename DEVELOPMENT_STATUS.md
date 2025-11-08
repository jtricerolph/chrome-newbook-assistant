# Development Status - NewBook Assistant Chrome Extension

**Last Updated:** 2025-01-08
**Status:** Chrome extension complete, API updates required

---

## Recent Session Summary

### Issues Resolved ✅

1. **Hover Detection Bug**
   - **Problem:** Hovering over planner blocks was triggering sidepanel updates
   - **Fix:** Restricted click listeners to `div[booking_id]` elements only (not all elements with booking_id attributes)
   - **Location:** `content-script.js` lines 116-163

2. **Popup Detection (Major Debugging Session)**
   - **Problem:** NewBook popup windows weren't being detected
   - **Initial Approach:** Tried detecting easyToolTip elements with booking IDs
   - **Issue Discovered:** NewBook creates `easyTooltip_booking_XXXXX` elements for BOTH hover tooltips AND preview popups
   - **Debug Process:**
     - Attempted to filter by `permanent` class - didn't work (class added after creation)
     - Attempted to filter by element ID pattern - still triggered on hover
     - Console logs showed same element structure for hover vs double-click
   - **Root Cause:** Assumed NewBook used jQuery UI dialogs, but it actually uses `<fieldset>` elements with `make_popup_tab_XXXXX` class pattern
   - **Final Solution:**
     - Disabled easyToolTip detection entirely (line 259: `// detectEasyToolTipPopup();`)
     - Rewrote to detect fieldsets instead of dialogs
     - Added deduplication (NewBook creates 4+ fieldsets per popup - one per tab)
   - **Location:** `content-script.js` lines 253-365
   - **Key Learning:** NewBook's popup architecture uses multiple fieldsets with booking ID in class name, not DOM element ID

3. **MutationObserver Spam**
   - **Problem:** Console flooded with "Found 16 planner booking blocks" on every DOM change
   - **Fix:** Added selective processing and debouncing (100ms) to MutationObserver
   - **Location:** `content-script.js` lines 135-157

4. **Duplicate Popup Notifications**
   - **Problem:** Opening a popup sent 4 identical messages to sidepanel
   - **Console Evidence:**
     ```
     Sidepanel received message: {action: 'bookingDetected', bookingId: '32794', ...}
     Sidepanel received message: {action: 'bookingDetected', bookingId: '32794', ...}
     Sidepanel received message: {action: 'bookingDetected', bookingId: '32794', ...}
     Sidepanel received message: {action: 'bookingDetected', bookingId: '32794', ...}
     ```
   - **Root Cause:** NewBook creates 4+ fieldsets when opening a popup (Stay Information, Charges, Notes, Guest Details tabs), each with `make_popup_tab_32794` class
   - **Why Element Marking Failed:** All fieldsets are added to DOM simultaneously before any can be marked as processed
   - **Solution:** Two-layer deduplication:
     1. Mark each fieldset element as processed: `popupElement.dataset.nbAssistantProcessed = 'true'`
     2. Track booking IDs in a Set with 2-second auto-removal: `processedPopupBookings.add(bookingId)`
   - **Location:** `content-script.js` lines 254-296, 303
   - **Result:** Only 1 message sent per popup, even with 4 fieldsets detected

---

## NewBook Popup Architecture - Important Discovery 📝

### easyToolTip Investigation (V1 Hurdle)

During initial development, we attempted to detect NewBook preview popups using easyToolTip elements. This led to a significant debugging session that's worth documenting:

**What We Tried:**
1. Detecting elements with ID pattern `easyTooltip_booking_XXXXX`
2. Filtering by `permanent` class to distinguish popups from tooltips
3. Using MutationObserver to watch for element creation

**The Problem:**
NewBook creates `easyTooltip_booking_XXXXX` elements in **two scenarios**:
- **Hover tooltips** (temporary, appear on mouseover)
- **Preview popups** (full dialog, appear on double-click)

Both use the same element structure and ID pattern, making them indistinguishable.

**Console Evidence:**
```javascript
// Both hover AND double-click create:
{
  id: "easyTooltip_booking_32793",
  classes: "easyTooltip",
  hasPermanent: false  // Class added AFTER creation
}
```

**Why Filtering Failed:**
- `permanent` class is added asynchronously after element creation
- No timing differences to reliably detect double-click vs hover
- Checking for `permanent` class at creation time always returned false

**The Solution - NewBook Actually Uses Fieldsets:**

After running console command:
```javascript
document.querySelectorAll('.ui-dialog')  // Returns empty NodeList
document.querySelectorAll('fieldset[class*="make_popup"]')  // Returns 4 fieldsets!
```

**Discovery:** NewBook's popup dialogs are built with `<fieldset>` elements:
- Class pattern: `make_popup_tab_32794` (booking ID in class name)
- Multiple fieldsets per popup (one for each tab: Stay Info, Charges, Notes, etc.)
- Reliable detection via class name regex: `/make_popup_tab[_-]?(\d+)/i`

**Final Implementation:**
```javascript
// Disabled easyToolTip detection (lines 165-251, disabled at line 259)
// detectEasyToolTipPopup();  // DISABLED - triggers on hover

// New fieldset-based detection (lines 253-365)
const popups = document.querySelectorAll('fieldset[class*="make_popup_tab"]');
```

**Key Takeaway for Future Developers:**
- Don't assume NewBook uses standard UI patterns (jQuery UI, etc.)
- Use browser DevTools to inspect actual DOM structure
- NewBook's custom popup system uses fieldsets with booking ID in class name
- EasyToolTip elements are NOT reliable for popup detection

### Duplicate Detection Implementation

The duplicate notification issue required a two-layer approach:

**Layer 1: Element-Level Tracking**
```javascript
// Mark individual fieldset as processed
if (popupElement.dataset.nbAssistantProcessed) {
  console.log('Already processed this popup element');
  return;
}
popupElement.dataset.nbAssistantProcessed = 'true';
```

**Problem with Layer 1 Only:** All 4 fieldsets are processed simultaneously in the same event loop tick, so none have the marker yet when checked.

**Layer 2: Booking ID Tracking (The Fix)**
```javascript
// Track recently processed booking IDs to prevent duplicate notifications
const processedPopupBookings = new Set();

function handleBookingPopup(popupElement) {
  // ... extract bookingId ...

  // Check if we've recently processed this booking ID
  if (processedPopupBookings.has(bookingId)) {
    console.log('Booking', bookingId, 'already processed recently, skipping duplicate notification');
    return;
  }

  // Add to processed set and auto-remove after 2 seconds
  processedPopupBookings.add(bookingId);
  setTimeout(() => processedPopupBookings.delete(bookingId), 2000);

  // Send notification (only happens once now)
  chrome.runtime.sendMessage({ ... });
}
```

**Why 2 Seconds?**
- Long enough to cover all 4 fieldsets being processed
- Short enough to allow re-opening the same booking quickly
- Prevents memory leaks from Set growing indefinitely

**Before Fix:**
```
Sidepanel received message: bookingId: '32794'
Sidepanel received message: bookingId: '32794'
Sidepanel received message: bookingId: '32794'
Sidepanel received message: bookingId: '32794'
Booking detected, updating sidepanel... (×4)
```

**After Fix:**
```
handleBookingPopup called, element: { tagName: 'FIELDSET', ... }
Booking 32794 already processed recently, skipping duplicate notification
Booking 32794 already processed recently, skipping duplicate notification
Booking 32794 already processed recently, skipping duplicate notification
NewBook popup detected for booking: 32794
Sidepanel received message: bookingId: '32794' (×1 only)
```

---

## Current Issue: Missing Badge Counts 🔴

### Problem
Restaurant and Checks tab badges don't show issue counts.

### Root Cause Identified
The **WordPress API endpoint** `/bookings/match` is **not returning a `badge_count` field**.

### Evidence
Console output from `sidepanel.js`:

**Checks API** (✅ Working):
```json
{
  "success": true,
  "html": "...",
  "badge_count": 0
}
```

**Restaurant API** (❌ Missing field):
```json
{
  "success": true,
  "context": "chrome-sidepanel",
  "html": "..."
}
```

Note: `badge_count` field is completely absent from restaurant API response.

### Expected Behavior
For the test booking (#32794) shown in console output, the booking has:
- 1 night with a **package alert** (missing dinner reservation for package booking)
- 1 night with **no restaurant booking**

Therefore, the API should return: `"badge_count": 2`

---

## Required API Changes

### File to Modify
WordPress plugin endpoint that handles `/bookings/match` requests

### Required Change
Add `badge_count` field to the JSON response that counts the number of issues/alerts:

```php
// Pseudo-code example
$badge_count = 0;

// Count nights with package alerts
$badge_count += count($nights_with_package_alerts);

// Count nights with unmatched bookings (no restaurant reservation)
$badge_count += count($unmatched_nights);

// Add to response
$response['badge_count'] = $badge_count;
```

### Badge Count Logic
The badge should count:
1. **Package alerts** (nights where guest has dinner package but no reservation)
2. **Unmatched nights** (nights where no restaurant booking exists)
3. **Mismatched details** (if applicable - e.g., wrong guest name, wrong date)

---

## Testing Instructions

### After API Changes

1. **Reload Chrome Extension**
   - Go to `chrome://extensions/`
   - Click "Reload" on NewBook Assistant extension

2. **Test on NewBook**
   - Navigate to https://appeu.newbook.cloud/bookings_chart
   - Double-click a booking block with restaurant issues
   - Check sidepanel console (F12) for output

3. **Expected Console Output**
   ```
   Restaurant data loaded, badge_count: 2
   Full restaurant API response: {
     "success": true,
     "context": "chrome-sidepanel",
     "html": "...",
     "badge_count": 2
   }
   Updating badge for restaurant: count=2, isWarning=false
   Badge for restaurant now visible with count 2
   ```

4. **Visual Verification**
   - Restaurant tab header should show orange badge with count
   - Badge should be visible on the tab button
   - Badge should disappear when count is 0

---

## Code Architecture

### Badge System Flow

```
1. User opens booking popup
   ↓
2. content-script.js detects popup
   → Sends 'bookingDetected' message
   ↓
3. sidepanel.js receives message
   → Calls handleBookingDetected()
   ↓
4. Loads Restaurant & Checks data in parallel
   → fetchRestaurantMatch() + fetchChecks()
   ↓
5. API returns data with badge_count
   ↓
6. updateBadge() called for each tab
   → Shows/hides badge based on count
   ↓
7. Tab switching logic uses badge counts
   → Priority: Restaurant (if issues) > Checks (if issues) > Restaurant (fallback)
```

### Key Files

- **content-script.js** (lines 301-365)
  - Popup detection with deduplication
  - Sends messages to sidepanel

- **sidepanel.js** (lines 319-383)
  - Badge update logic
  - API client calls
  - Tab switching priority

- **sidepanel.html** (lines 14-28)
  - Badge HTML elements with `data-badge` attributes

---

## Debug Logging

### Current Debug Output
The extension has extensive console logging for debugging:

**Content Script (NewBook page console):**
- Popup detection events
- Booking ID extraction
- Duplicate detection

**Sidepanel (Sidepanel console):**
- Full API responses (JSON formatted)
- Badge count values
- Badge visibility changes

### To View Logs

1. **Content Script Logs:**
   - Open NewBook page
   - Press F12
   - Go to Console tab

2. **Sidepanel Logs:**
   - Open sidepanel
   - Right-click inside sidepanel → "Inspect"
   - Go to Console tab

---

## Known Working Features ✅

1. ✅ URL-based booking detection (`/bookings_view/12345`)
2. ✅ Popup detection (fieldsets with `make_popup_tab_XXXXX`)
3. ✅ Planner single-click updates (if enabled in settings)
4. ✅ Tab switching based on badge priority
5. ✅ Badge UI display/hide logic
6. ✅ Summary tab auto-refresh
7. ✅ Checks API badge counts
8. ✅ Duplicate notification prevention

---

## Pending Items 🔴

1. **API Side:**
   - [ ] Add `badge_count` field to `/bookings/match` endpoint response
   - [ ] Test with various booking scenarios (package, unmatched, matched, etc.)

2. **Optional Enhancements:**
   - [ ] Remove debug logging for production (or add debug mode setting)
   - [ ] Add error handling for malformed API responses
   - [ ] Add "warning" badge style for urgent issues (package alerts)

---

## Git Commit Message Template

```
fix: Add badge_count field to restaurant match API endpoint

- Add badge_count calculation to /bookings/match response
- Count package alerts + unmatched nights
- Fixes missing badge counts in Chrome extension Restaurant tab

Chrome extension already implements badge display logic, just needs
API to return the badge_count field in JSON response.

Related files:
- [WordPress plugin file path]

Testing:
- Tested with booking #32794 (2 unmatched nights)
- Badge now shows count=2 correctly
- Badge hides when count=0
```

---

## Quick Start for Dev Machine

1. **Pull latest changes**
   ```bash
   git pull origin main
   ```

2. **Review this document**
   - Read "Required API Changes" section
   - Locate WordPress plugin file handling `/bookings/match`

3. **Implement badge_count**
   - Add field to JSON response
   - Count issues/alerts based on logic above

4. **Test**
   - Follow "Testing Instructions" section
   - Check console output matches expected format

5. **Remove debug logging (optional)**
   - In `sidepanel.js` lines 360, 368, 375, 383
   - Remove `console.log('Full ... API response:', ...)` lines

---

## Questions?

If you need to understand how any part works:
1. Check the inline comments in the code
2. Use browser DevTools to inspect elements
3. Review console logs for actual vs expected behavior

The badge system is fully implemented on the extension side - it's just waiting for the API to provide the data.
