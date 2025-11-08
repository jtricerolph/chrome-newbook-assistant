# Quick Start Guide

## 1. Load the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Navigate to and select: `C:\Users\JTR\Documents\GitHub\chrome-newbook-assistant`
5. The extension should now appear in your extensions list

## 2. Configure Settings

1. Click the **NewBook Assistant** extension icon in your Chrome toolbar
2. OR click **Details** on the extension, then scroll down and click **Extension options**
3. Fill in the required API configuration:
   - **API Root URL**: `https://n4admindev.pterois.co.uk/wp-json/bma/v1` (or your production URL)
   - **Username**: Your WordPress username (e.g., `reception`)
   - **Application Password**: Your WordPress Application Password
4. Configure behavior settings (optional):
   - ✅ Enable sidebar on NewBook domain (recommended: ON)
   - Recent bookings count: `10` (adjust as needed)
   - Summary refresh rate: `60` seconds (adjust as needed)
   - ✅ Update booking on planner click (recommended: ON)
5. Click **Test Connection** to verify your API credentials
6. Click **Save Settings**

## 3. Start Using

1. Navigate to NewBook: `https://appeu.newbook.cloud`
2. Click the extension icon to open the sidepanel
3. You should see the **Summary** tab load automatically

### Viewing Restaurant Matches

1. Open any booking in NewBook (URL should be `/bookings_view/12345`)
2. The extension will auto-detect the booking
3. Switch to the **Restaurant** tab to see reservation matches
4. If issues are found, the tab will show a red badge and may auto-switch

### Running Checks

1. With a booking open in NewBook
2. Switch to the **Checks** tab
3. Validation checks will run automatically
4. Failed checks will show a red badge

## 4. Troubleshooting

### "Please configure settings first" error
- Go to extension settings and fill in all API configuration fields
- Make sure to click "Save Settings"

### Sidepanel won't open
- Make sure you're on `appeu.newbook.cloud`
- Check that "Enable sidebar on NewBook domain" is ON in settings
- Try clicking the extension icon manually

### API connection failed
- Verify your API URL is correct and uses HTTPS
- Check your username and Application Password
- Make sure your WordPress site is accessible
- Check that CORS headers are configured on the API server

### Booking not detected
- Make sure you're on a booking detail page (URL contains `/bookings_view/`)
- Refresh the page and try again
- Check the browser console (F12) for any errors

## 5. Differences from Old Extension

### What Changed

✅ **Sidepanel instead of popup** - Stays open while you work
✅ **Cleaner codebase** - Easier to maintain
✅ **Better settings** - Only essential options, no hardcoded URLs
✅ **Same API** - Works with existing backend

### What Stayed the Same

- 3-tab interface (Summary, Restaurant, Checks)
- Auto-refresh on Summary tab
- Booking detection
- API integration
- Badge system for alerts

## 6. Next Steps

Once you've confirmed everything works:

1. **Port additional features** from old extension (if needed):
   - Table row injection into NewBook dialogs
   - Advanced planner integration
   - Additional UI polish

2. **Customize as needed**:
   - Adjust refresh rates
   - Modify styling in CSS files
   - Add new features

3. **Deploy to production**:
   - Update API URL to production endpoint
   - Test with production data
   - Share with other users

## File Locations

- **Settings**: [settings/settings.html](settings/settings.html)
- **Sidepanel**: [sidepanel/sidepanel.html](sidepanel/sidepanel.html)
- **Background Worker**: [background.js](background.js)
- **Content Script**: [content-script.js](content-script.js)
- **Manifest**: [manifest.json](manifest.json)

## Support

For detailed documentation, see [README.md](README.md)
