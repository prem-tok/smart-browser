# Manus Electron

[English](./README.md) | [简体中文](./README.zh-CN.md)

An AI-powered intelligent browser built with Next.js and Electron. Features multi-modal AI task execution, scheduled tasks, social media integration, and advanced file management capabilities with support for multiple AI providers.

Built with [Next.js](https://nextjs.org) and [Electron](https://electronjs.org).

## Tech Stack

- **Frontend**: Next.js 15 + React 19
- **Desktop**: Electron 33
- **UI**: Ant Design + Tailwind CSS
- **State Management**: Zustand
- **Storage**: IndexedDB (via electron-store)
- **AI Agent**: @jarvis-agent (based on [Eko](https://github.com/FellouAI/eko) - production-ready agent framework)
- **Build Tools**: Vite + TypeScript

## Development Environment Configuration
Node version: 20.19.3

## Humanized Input (Playwright)

The application includes a human-like cursor/input system for Playwright automation that provides smooth Bezier curve movements, natural jitter, and variable typing delays to make interactions appear more human-like.

### Enabling/Disabling Humanized Input

Humanized input is **enabled by default**. To disable it, set the environment variable:

```bash
# Disable humanized input
export HUMANIZED_INPUT=false
# or
HUMANIZED_INPUT=0
```

### Configuration

Humanized input can be configured per-action via options:

```typescript
// Humanized click with custom options
await window.api.playwright.click('main', 'button.submit', {
  humanized: true,
  humanOptions: {
    steps: 18,              // Number of path steps (1-50, default: 18)
    jitter: 3,              // Pixel jitter amount (0-20, default: 3)
    minDelay: 8,            // Minimum delay between steps in ms (default: 8)
    maxDelay: 30,           // Maximum delay between steps in ms (default: 30)
    moveStrategy: 'bezier', // 'bezier' (curved) or 'linear' (straight)
    safety: {
      maxSteps: 50,         // Maximum steps allowed (default: 50)
      maxDurationMs: 5000   // Maximum duration in ms (default: 5000)
    }
  }
});

// Humanized typing with custom options
await window.api.playwright.type('main', 'input[name="search"]', 'Hello World', {
  humanized: true,
  typeOptions: {
    minDelay: 40,           // Minimum delay per character (default: 40ms)
    maxDelay: 180,          // Maximum delay per character (default: 180ms)
    clearFirst: true,       // Clear field before typing (default: true)
    perCharJitter: true     // Add variation per character (default: true)
  }
});
```

### Recommended Defaults

For most use cases, the default settings work well:
- **Steps**: 12-24 (fewer = faster, more = smoother)
- **Jitter**: 2-5px (adds natural variation)
- **Delays**: 8-30ms for movement, 40-180ms for typing
- **Strategy**: `bezier` for curved paths (more natural) or `linear` for straight paths (faster)

### Testing

Run the unit tests:
```bash
pnpm test tests/humanCursor.test.ts
```

Run integration tests (requires Playwright browser):
```bash
pnpm test tests/humanCursor.integration.test.ts
```

### Demo Component

A full demo component is available at `src/renderer/humanDemo.tsx` that demonstrates:
- Configurable humanized options
- Side-by-side comparison of humanized vs raw clicks
- Real-time element listing and interaction
- Typing with variable delays

### Important Notes

⚠️ **Performance**: Humanized input is slower than raw automation (by design). Expect 200-500ms overhead per action.

⚠️ **Headless Mode**: In headless browsers, the cursor is not visually visible, but movements still occur. This is acceptable for automation but won't show visual feedback.

⚠️ **Ethics & Security**: 
- This feature is designed for legitimate automation and testing
- Do NOT use to bypass CAPTCHAs or evade bot detection
- Respect website Terms of Service
- Default rate limiting (10 actions/second) is enforced

⚠️ **Packaging**: When building for distribution, ensure Playwright browsers are installed:
```bash
npx playwright install chromium
```

### Path Generation

The system uses a self-contained Bezier curve generator (no external dependencies) that:
- Creates smooth curved paths between start and end points
- Adds Gaussian jitter for natural variation
- Respects safety limits (max steps, max duration)
- Supports both Bezier (curved) and linear (straight) strategies

See `electron/humanCursor.ts` for implementation details.

## Getting Started

### 1. Configure API Keys

Before running the application, you need to configure API keys:

```bash
# Copy configuration template
cp .env.template .env.local

# Edit .env.local and fill in your API keys
# Supported: DEEPSEEK_API_KEY, QWEN_API_KEY, GOOGLE_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY
```

For detailed configuration instructions, see [CONFIGURATION.md](./docs/CONFIGURATION.md).

### 2. Development Setup

First, run the development server:

```bash
# Install dependencies
pnpm install

# Build desktop application client for mac
pnpm run build:deps

# Build desktop application client for windows
pnpm run build:deps:win

# Start web development server
pnpm run next

# Start desktop application
pnpm run electron
```

### 3. Building Desktop Application

To build the desktop application for distribution:

```bash
# Configure production API keys
# Edit .env.production file with your actual API keys

# Build the application for mac
pnpm run build

# Build the application for windows
pnpm run build:win
```

The built application will include your API configuration, so end users don't need to configure anything.

## Features

- **Multiple AI Providers**: Support for DeepSeek, Qwen, Google Gemini, Anthropic Claude, and OpenRouter
- **UI Configuration**: Configure AI models and API keys directly in the app, no file editing required
- **Agent Configuration**: Customize AI agent behavior with custom prompts and manage MCP tools
- **Toolbox**: Centralized hub for system features including agent configuration, scheduled tasks, and more
- **AI-Powered Browser**: Intelligent browser with automated task execution
- **Multi-Modal AI**: Vision and text processing capabilities
- **Scheduled Tasks**: Create and manage automated recurring tasks
- **Speech & TTS**: Voice recognition and text-to-speech integration
- **File Management**: Advanced file operations and management

## Screenshots

### Start

![Start](./docs/shotscreen/start-loading.png)

### Home
Input tasks and let AI execute automatically.

![Home](./docs/shotscreen/home.png)

### Main
Left: AI thinking and execution steps. Right: Real-time browser operation preview.

![Main](./docs/shotscreen/main.png)

### Scheduled Tasks
Create scheduled tasks with custom intervals and execution steps.

![Scheduled Tasks](./docs/shotscreen/schedule.png)

### History
View past tasks with search and playback capabilities.

![History](./docs/shotscreen/history.png)

### Toolbox
Centralized hub for accessing all system features and configurations.

![Toolbox](./docs/shotscreen/toolbox.png)

### Agent Configuration
Customize AI agent behavior with custom prompts and manage MCP tools for enhanced capabilities.

![Agent Configuration](./docs/shotscreen/agent-configuration.png)

## Supported AI Providers

- **DeepSeek**: deepseek-chat, deepseek-reasoner
- **Qwen (Alibaba Cloud)**: qwen-max, qwen-plus, qwen-vl-max
- **Google Gemini**: gemini-2.5-flash (latest), gemini-2.5-pro, gemini-2.5-flash-lite, gemini-2.0-flash-exp, gemini-1.5-flash, and more
- **Anthropic Claude**: claude-3-7-sonnet-20250219 (latest), claude-3-5-sonnet, claude-3-5-haiku, and more
- **OpenRouter**: Multiple providers (Claude, GPT, Gemini, Mistral, Cohere, etc.)

## Documentation

- [Configuration Guide](./docs/CONFIGURATION.md) - Detailed API key setup instructions
- [Playwright Configuration](./docs/PLAYWRIGHT_CONFIGURATION.md) - Browser automation settings and troubleshooting
- [Browser Window Fix](./docs/BROWSER_WINDOW_FIX.md) - How we fixed the separate Chrome window issue

## Acknowledgements

Special thanks to [Eko](https://github.com/FellouAI/eko) - A production-ready agent framework that powers the AI capabilities of this project.

## Contributing

Please ensure all API keys are properly configured in development environment files only. Never commit actual API keys to the repository.