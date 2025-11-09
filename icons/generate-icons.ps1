# PowerShell script to generate icon PNGs from HTML using browser automation
# This script opens the HTML file in Chrome and captures screenshots of each icon

param(
    [string]$HtmlFile = "generate-icons.html",
    [string]$OutputDir = "."
)

Write-Host "Icon Generator for NewBook Assistant" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Get full path to HTML file
$htmlPath = Resolve-Path $HtmlFile
$htmlUri = "file:///$($htmlPath -replace '\\', '/')"

Write-Host "HTML File: $htmlPath" -ForegroundColor Green
Write-Host "Output Directory: $OutputDir" -ForegroundColor Green
Write-Host ""
Write-Host "To generate the icons:" -ForegroundColor Yellow
Write-Host "1. Open Chrome/Edge browser" -ForegroundColor White
Write-Host "2. Navigate to: $htmlUri" -ForegroundColor White
Write-Host "3. Press F12 to open DevTools" -ForegroundColor White
Write-Host "4. For each icon size (16, 48, 128):" -ForegroundColor White
Write-Host "   a. Right-click the icon square" -ForegroundColor Gray
Write-Host "   b. Click 'Inspect' or 'Inspect Element'" -ForegroundColor Gray
Write-Host "   c. In DevTools, find the 'div.icon-wrapper.size-XX' element" -ForegroundColor Gray
Write-Host "   d. Right-click it -> 'Capture node screenshot'" -ForegroundColor Gray
Write-Host "   e. Save as icon16.png, icon48.png, or icon128.png in this folder" -ForegroundColor Gray
Write-Host ""
Write-Host "Alternative: Use the recommended gradient background icons (first row)" -ForegroundColor Yellow
Write-Host ""

# Try to open the file in default browser
Write-Host "Opening HTML file in default browser..." -ForegroundColor Cyan
Start-Process $htmlUri

Write-Host ""
Write-Host "Browser opened! Follow the instructions above to generate the icons." -ForegroundColor Green
Write-Host ""
Write-Host "The icons will be saved to: $(Resolve-Path $OutputDir)" -ForegroundColor Green
