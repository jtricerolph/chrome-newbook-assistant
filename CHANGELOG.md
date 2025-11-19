# Changelog

All notable changes to the NewBook Assistant Chrome Extension will be documented in this file.

## [3.0.0] - 2025-01-19

### Added
- **Staying Tab Default Filter**: New setting to automatically filter Staying tab to show only occupied/in-house rooms when loading ([settings.html](settings/settings.html), [sidepanel.js:5343-5347](sidepanel/sidepanel.js))
- **Planner Date Navigation**: Click planner date headers to open Staying tab for that specific date ([content-script.js:236-322](content-script.js))
- **Toolbar Toggle**: Extension toolbar icon now properly toggles sidepanel open/closed ([background.js:175-204](background.js))
- **ResOS Deep Links**: Show ResOS booking link for all matches (including suggested matches), not just primary matches ([chrome-sidepanel-response.php:272-277](../booking-match-api/templates/chrome-sidepanel-response.php))

### Fixed
- **Session Lock Synchronization**: Multiple race condition fixes ensuring sidepanel correctly shows lock screen when session is locked
  - Added retry logic with delays for session lock status queries ([sidepanel.js:6517-6559](sidepanel/sidepanel.js))
  - Fixed sidepanel unlocking before URL changes during login ([sidepanel.js:1609-1616](sidepanel/sidepanel.js))
  - Fixed sidepanel not staying locked when reopened while lock dialog visible ([sidepanel.js](sidepanel/sidepanel.js))
  - Fixed sidepanel unlocking after session timeout redirect to login ([sidepanel.js:1589-1590](sidepanel/sidepanel.js))
  - Added tab context tracking to improve sidepanel-browser tab coordination ([sidepanel.js:6584-6594](sidepanel/sidepanel.js))
- **Lock Screen Behavior**: "Open NewBook" button now checks current tab URL and focuses existing NewBook tab instead of opening duplicates ([sidepanel.js:1536-1556](sidepanel/sidepanel.js))
- **Popup Button Reliability**: Fixed "Open Assistant" popup button not reliably showing when sidepanel closed by including tab ID in messages ([sidepanel.js:6693-6699](sidepanel/sidepanel.js), [background.js:255-272](background.js))
- **Orphaned Booking Severity**: Distinguish between primary match (CRITICAL - needs cancellation) and suggested match (WARNING - needs review) for orphaned ResOS bookings ([class-bma-rest-controller.php:823-840](../booking-match-api/includes/class-bma-rest-controller.php), [chrome-summary-response.php:184-199](../booking-match-api/templates/chrome-summary-response.php))
- **Settings**: Fixed missing `autoRefreshPauseIdleMinutes` in load/save functions ([settings.js:59,146](settings/settings.js))

### Changed
- Lock screen "Open NewBook" button icon changed from 'visibility' to 'open_in_new' for clarity ([sidepanel.js:1536](sidepanel/sidepanel.js))
- ResOS link icon changed to 'open_in_new' for consistency ([chrome-sidepanel-response.php:274](../booking-match-api/templates/chrome-sidepanel-response.php))

### Technical Improvements
- Improved message passing between content script, background worker, and sidepanel
- Enhanced state management for session lock detection
- Added comprehensive error handling and retry logic for race conditions
- Better tab context tracking for multi-tab scenarios

## [2.0.0] - Previous Release

Initial major release with core booking management and restaurant matching features.
