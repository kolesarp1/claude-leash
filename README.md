# Claude Leash 🐕

**Keep your Claude context on a leash** - A Chrome extension that hides old messages in Claude.ai and Claude Code Web to boost performance during long conversations.

![Version](https://img.shields.io/badge/version-1.8.1-blue)
![Platform](https://img.shields.io/badge/platform-Chrome-green)

## The Problem

Long conversations with Claude can become sluggish due to the browser rendering hundreds of message elements. The UI lag isn't from the AI context window - it's from rendering all those code blocks, diffs, and formatted responses.

## The Solution

Claude Leash hides older messages from the DOM while keeping them in Claude's context. You get a snappy UI while maintaining full conversation history for the AI.

## Features

- **🔢 Adjustable visibility** - Slider to keep 1-20 recent messages visible
- **⚡ One-click toggle** - Collapse/Show All with a single click
- **🎯 Smart detection** - Works on both Claude.ai and Claude Code Web
- **🌓 Theme support** - Light, Dark, and Auto modes
- **📊 Badge counter** - Shows visible/total messages at a glance
- **🔍 Debug tools** - Built-in DOM scanner for troubleshooting

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the `claude-leash` folder
5. Pin the extension for easy access

## Usage

1. Open any conversation on [claude.ai](https://claude.ai)
2. Click the Claude Leash icon in your toolbar
3. Adjust the slider to set how many messages to keep visible
4. Click **▼ Collapse** to hide older messages
5. Click **👁 Show All** to reveal everything again

## How It Works

The extension uses CSS `display: none` to hide message elements from rendering. The messages remain in the DOM and Claude's context - they're just not being painted by the browser.

**Detection strategy:**
- Finds elements with `font-user-message` class (user messages)
- Finds elements with `font-claude-response` class (Claude responses)
- Walks up DOM to find message containers
- Applies hide/show based on message position

## Compatibility

| Platform | Status |
|----------|--------|
| Claude.ai | ✅ Working |
| Claude Code Web | ✅ Working |
| Claude Desktop | ❌ N/A (Electron) |

## Debug Tools

The extension includes debug buttons for development:
- **🔍 Debug** - Highlights found elements and logs details to console
- **📋 Scan** - Deep DOM scan with structure analysis

## Known Limitations

- Hidden messages may briefly flash on page load
- Detection may need updates if Claude.ai changes its DOM structure
- Does not reduce actual AI context (that's handled server-side)

## Contributing

Issues and PRs welcome! If Claude.ai changes its structure and breaks detection, the key selectors to update are in `content.js`:
- `[class*="font-user-message"]` - User message elements
- `[class*="font-claude-response"]` - Claude response elements

## License

MIT

---

*Built with Claude, for Claude users* 🤖
