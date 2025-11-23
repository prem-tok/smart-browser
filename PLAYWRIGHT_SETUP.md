# Playwright Setup Guide

## Installation

After installing dependencies, Playwright browsers need to be installed:

```bash
npm install
# or
pnpm install
```

The `postinstall` script will automatically run `npx playwright install chromium` to install the Chromium browser required by Playwright.

If you need to manually install browsers:

```bash
npx playwright install chromium
```

## Configuration

### Headless Mode

By default, Playwright runs in **headed mode** (visible browser) for development. To run in headless mode, set the environment variable:

```bash
# Windows (PowerShell)
$env:PLAYWRIGHT_HEADLESS="1"

# Windows (CMD)
set PLAYWRIGHT_HEADLESS=1

# macOS/Linux
export PLAYWRIGHT_HEADLESS=1
```

Or add it to your `.env` file:

```
PLAYWRIGHT_HEADLESS=1
```

### Development vs Production

- **Development**: Browser runs in headed mode by default (visible)
- **Production**: Set `PLAYWRIGHT_HEADLESS=1` for headless operation

## Packaging Implications

When building your Electron app for distribution:

1. **Native Browsers**: Playwright requires native browser binaries (Chromium) to be installed
2. **Bundle Size**: The Chromium browser adds ~150-200MB to your app bundle
3. **CI/CD**: Ensure `npx playwright install chromium` runs during your build process
4. **Platform-Specific**: Each platform (Windows, macOS, Linux) requires its own browser binary

### Build Script Example

For CI/CD pipelines, ensure browsers are installed:

```yaml
# Example GitHub Actions
- name: Install Playwright browsers
  run: npx playwright install chromium
```

## Usage

The Playwright controller is automatically started when the Electron app is ready. You can use it from the renderer process via `window.api.playwright`:

```typescript
// Create a new page
const result = await window.api.playwright.newPage('main');

// Navigate
await window.api.playwright.goto('main', 'https://example.com');

// List elements
const elements = await window.api.playwright.listElements('main', 'a');

// Click an element
await window.api.playwright.click('main', 'a.someLink');

// Type text
await window.api.playwright.type('main', 'input[name="search"]', 'Hello World');

// Take screenshot
const screenshot = await window.api.playwright.screenshot('main');

// Get DOM snapshot
const html = await window.api.playwright.getDomSnapshot('main');
```

## Security

- All selectors are validated to prevent XSS and code injection
- Rate limiting is enforced (10 actions per second per window)
- Input validation ensures safe operation
- Sensitive data (passwords) is redacted from logs

## Logs

Playwright actions are logged to:
- Electron logs directory: `{app.getPath('logs')}/playwright/playwright-actions.log`
- Console output (via electron-log)

## Troubleshooting

### Browser not starting

- Ensure Chromium is installed: `npx playwright install chromium`
- Check that `PLAYWRIGHT_HEADLESS` is set correctly
- Review Electron logs for error messages

### Rate limiting errors

- Default limit: 10 actions per second per window
- If you hit rate limits, add delays between actions
- Consider batching operations

### Selector validation errors

- Only CSS selectors are allowed
- Reject patterns: `javascript:`, `eval()`, `Function()`, event handlers (`onclick=`, etc.)
- Maximum selector length: 1000 characters


