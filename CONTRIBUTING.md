# Contributing to lean-ctx Dashboard

Thanks for your interest in contributing!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Valkster70/lean-ctx-dashboard.git
   cd lean-ctx-dashboard
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the watch build:
   ```bash
   npm run watch
   ```

4. Open the project in VS Code / Antigravity IDE and press `F5` to launch the Extension Development Host.

## Project Structure

```
src/
  extension.ts          # Extension entry point, status bar, command registration
  dashboardProvider.ts  # WebviewViewProvider, data fetching from lean-ctx CLI & files
  webview/
    dashboard.html      # Webview HTML template
    dashboard.css       # Styles (glassmorphism, dark theme)
    dashboard.js        # Client-side logic, message handling, chart rendering
media/
  icon.svg              # Activity bar icon
```

## How It Works

The extension is a VS Code sidebar webview that:

1. **Reads local files** (`stats.json`, `mcp-live.json`) from the lean-ctx data directory for fast, synchronous data
2. **Executes CLI commands** (`lean-ctx gain --json`, `lean-ctx token-report --json`, etc.) for authoritative data
3. **Posts messages** to the webview with the combined data payload
4. **Renders** the data in the webview using vanilla JS (no framework)

## Building

```bash
npm run build          # Production build
npm run package        # Create .vsix file
```

## Testing

After making changes:

1. Run `npm run build`
2. Install the extension: `code --install-extension lean-ctx-dashboard-*.vsix`
3. Reload the editor and check the lean-ctx sidebar

## Pull Requests

- Keep changes focused and well-documented
- Test on both Windows and macOS/Linux if possible
- Update the README if adding new features
