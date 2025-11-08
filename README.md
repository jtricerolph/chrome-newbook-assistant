# NewBook Assistant

A Chrome extension for NewBook PMS that provides a sidepanel assistant for booking management and restaurant reservation matching.

## Features

- **3-Tab Sidepanel Interface**
  - **Summary Tab**: Shows recent bookings needing attention with auto-refresh
  - **Restaurant Tab**: Cross-references hotel bookings with restaurant reservations
  - **Checks Tab**: Runs validation checks on bookings

- **Automatic Booking Detection**: Detects when you view a booking in NewBook
- **Planner Integration**: Single-click on planner bookings to update sidepanel
- **Auto-Refresh**: Summary tab refreshes automatically at configurable intervals
- **Smart Alerts**: Badge counts show issues that need attention

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `chrome-newbook-assistant` folder
5. The extension icon should appear in your toolbar

## Configuration

1. Click the extension icon or go to Settings
2. Configure the required fields:
   - **API Root URL**: Your Booking Match API endpoint
   - **Username**: WordPress username for authentication
   - **Application Password**: WordPress Application Password
3. Configure behavior settings:
   - Enable sidebar on NewBook domain
   - Number of recent bookings to display
   - Summary refresh rate (seconds)
   - Enable planner click updates
4. Click "Test Connection" to verify API access
5. Click "Save Settings"

## Usage

### Viewing the Sidepanel

1. Navigate to any NewBook page (`appeu.newbook.cloud`)
2. Click the extension icon in your toolbar
3. The sidepanel will open on the right side

### Viewing Booking Details

1. Open a booking in NewBook
2. The extension will automatically detect it
3. Switch to the "Restaurant" or "Checks" tab to see details
4. If issues are found, the extension will auto-switch to the relevant tab

### Summary Tab

- Shows recent bookings that need attention
- Auto-refreshes every 60 seconds (configurable)
- Countdown timer shows "Checking for updates in Xs"

### Restaurant Tab

- Shows matched restaurant reservations for the current booking
- Indicates package bookings without reservations
- Displays action links to ResOS admin

### Checks Tab

- Runs validation checks on the current booking
- Shows pass/fail status for each check
- Badge count indicates number of failed checks

## API Integration

The extension communicates with a WordPress REST API endpoint:

### Endpoints

- `GET /summary?context=chrome-summary` - Recent bookings summary
- `POST /bookings/match` - Match hotel booking with restaurant reservations
- `GET /checks/{bookingId}?context=chrome-checks` - Run validation checks

### Authentication

Uses HTTP Basic Authentication with WordPress Application Password:
- Username: Configured in settings
- Password: WordPress Application Password (spaces removed automatically)

### Response Format

```json
{
  "success": true,
  "html": "<div>...</div>",
  "badge_count": 0,
  "should_auto_open": false
}
```

## Development

### File Structure

```
chrome-newbook-assistant/
├── manifest.json           # Extension manifest (Manifest V3)
├── background.js          # Background service worker
├── content-script.js      # Content script for NewBook pages
├── sidepanel/
│   ├── sidepanel.html     # Sidepanel UI
│   ├── sidepanel.js       # Sidepanel logic
│   └── sidepanel.css      # Sidepanel styles
├── settings/
│   ├── settings.html      # Settings page
│   ├── settings.js        # Settings logic
│   └── settings.css       # Settings styles
├── icons/                 # Extension icons
└── README.md             # This file
```

### Technologies

- Vanilla JavaScript (no build tools required)
- Chrome Extension Manifest V3
- Chrome Sidepanel API
- Material Symbols Icons

### Message Passing

**Content Script → Background:**
- `bookingDetected`: Booking page detected
- `plannerClick`: Single-click on planner booking

**Background → Sidepanel:**
- `bookingDetected`: Forward booking detection
- `plannerClick`: Forward planner click
- `settingsUpdated`: Settings changed

## Troubleshooting

### Sidepanel Not Showing

- Make sure you're on a NewBook page (`appeu.newbook.cloud`)
- Check that "Enable sidebar on NewBook domain" is enabled in settings
- Click the extension icon to manually open the sidepanel

### API Connection Failed

- Verify the API Root URL is correct and uses HTTPS
- Check that your username and Application Password are correct
- Use "Test Connection" button in settings to diagnose
- Check that your WordPress site has CORS headers configured

### Booking Not Detected

- Make sure you're on a booking page with URL pattern `/bookings_view/{id}`
- Check the browser console for any errors
- Refresh the page and try again

### Auto-Refresh Not Working

- Check that the Summary refresh rate is set (default 60 seconds)
- The countdown only appears when viewing the Summary tab
- Refresh will pause if you switch to another tab

## Support

For issues or feature requests, please contact your system administrator.

## Version

2.0.0 - Clean rebuild with sidepanel interface
