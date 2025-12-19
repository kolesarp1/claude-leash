# Claude Leash 🐕

**Keep your Claude context on a leash** - A Chrome extension that improves scrolling and rendering performance on Claude.ai and Claude Code Web by hiding old messages during long conversations.

![Version](https://img.shields.io/badge/version-3.5.1-blue)
![Platform](https://img.shields.io/badge/platform-Chrome-green)
![Manifest](https://img.shields.io/badge/manifest-v3-orange)

## The Problem

Long conversations with Claude (100+ messages) become sluggish. Performance trace analysis shows:

| Issue | Impact |
|-------|--------|
| Garbage Collection | 4+ seconds |
| Long JavaScript Tasks | 2+ seconds blocking |
| Layout Recalculation | 1.4 seconds |
| React Re-renders | 185 events |

## What This Extension Does

Claude Leash hides older messages using CSS `display: none`. This helps with **rendering performance** (paint/layout) but does NOT fix memory or JavaScript issues.

### Realistic Expectations

| Metric | Improvement |
|--------|-------------|
| Scroll smoothness | ✅ Noticeable improvement |
| Paint/composite | ✅ Hidden elements don't paint |
| Layout calculations | ✅ Hidden elements skip layout |
| Memory usage | ❌ No improvement (nodes still in DOM) |
| GC pauses | ❌ No improvement |
| React re-renders | ❌ No improvement |

**Bottom line:** This extension helps with ~10-15% of the slowdown. It makes scrolling smoother but won't fix the 2+ second freezes caused by garbage collection.

## Features

- **📏 Pixel-based threshold** - Slider to control visible content (4k-40k pixels)
- **⚡ One-click toggle** - Collapse/Show All with a single click
- **🎯 Smart detection** - Multi-strategy container detection that survives UI updates
- **🔄 Session caching** - Fast-path switching between conversations (<1.5s)
- **🌓 Theme support** - Light, Dark, and Auto modes
- **📊 Badge counter** - Shows visible content amount (e.g., "10k")
- **🔍 Debug tools** - Built-in DOM scanner for troubleshooting
- **🛡️ Message validation** - Secure input validation on all messages
- **⚙️ Configurable selectors** - Future-proof DOM detection

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the `claude-leash` folder
5. Pin the extension for easy access

## Usage

1. Open any conversation on [claude.ai](https://claude.ai) or Claude Code Web
2. Click the Claude Leash icon in your toolbar
3. Adjust the slider to set how much content to keep visible (4k-40k pixels)
4. Click **Collapse** to hide older messages
5. Click **Show All** to reveal everything again

### Scroll to Restore

When collapsed, scroll to the top of the conversation to progressively reveal hidden messages.

## How It Works

The extension uses CSS `display: none` to hide message elements from rendering. Messages remain in the DOM and Claude's context - they're just not being painted by the browser.

### What CSS `display: none` Actually Does

**What IS helped:**
| Benefit | Impact |
|---------|--------|
| Layout calculations | ✅ Hidden elements skip layout |
| Paint operations | ✅ Hidden elements don't paint |
| GPU compositing | ✅ Fewer layers to composite |

**What is NOT helped:**
| Resource | Status |
|----------|--------|
| DOM nodes | ❌ Still in memory |
| React components | ❌ Still tracked, still reconcile |
| Event handlers | ❌ Still attached, cause GC pressure |
| Syntax highlight spans | ❌ 100s per code block, still exist |

**You'll notice improvement in:**
- Scrolling smoothness (less jank while scrolling)
- Less CPU during scroll (no paint/layout for hidden)

**You WON'T notice improvement in:**
- The 2-4 second freezes (that's GC/JS, not rendering)
- Memory usage (all nodes still in DOM)
- Initial page slowdown on long sessions

### Detection Strategy (v3.5.0)

Multi-strategy container detection with configurable selectors:
1. **CSS class detection** - `overflow-y-auto`, `overflow-auto` classes
2. **Scroll height analysis** - Scoring based on scrollable content
3. **Viewport coverage** - Bonus for elements filling viewport
4. **Sidebar exclusion** - Filters out navigation panels

## Development

```bash
npm install        # Install test dependencies
npm test           # Run all tests
npm run test:unit  # Unit tests only
```

### Key Files

| File | Purpose |
|------|---------|
| `content.js` | Main logic (~1035 lines) |
| `popup.js` | Extension UI |
| `background.js` | Badge management |
| `DOM_SELECTORS` config | Update when Claude changes DOM (`content.js:36-61`) |

### When Claude.ai Changes

If the extension stops working:
1. Open DevTools on claude.ai
2. Inspect the conversation container structure
3. Update `DOM_SELECTORS.container.primary` in content.js
4. Run `npm test` to verify

## Compatibility

| Platform | Status |
|----------|--------|
| Claude.ai | ✅ Working |
| Claude Code Web | ✅ Working |
| Claude Desktop | ❌ N/A (Electron) |

## Debug Tools

Enable Debug Mode in the popup to access:
- **Console logging** - Detailed detection and hiding logs
- **DOM Scanner** - Highlights container candidates

## Documentation

See `.claude/` folder for comprehensive documentation:
- `claude.md` - Main project documentation
- `architecture.md` - Technical deep dive
- `testing.md` - QA procedures
- `conventions.md` - Code standards

## Contributing

Issues and PRs welcome! Key areas:
- Update `DOM_SELECTORS` when Claude changes its DOM
- Add tests in `tests/` folder
- Run `npm test` before committing

## The Real Fix

The core performance issues (GC, memory, React re-renders) can only be fixed by Anthropic implementing **virtualized message lists** - where only visible messages exist in the DOM.

Apps like Discord and Slack handle thousands of messages smoothly because they only render what's on screen.

**Feature request:** https://github.com/anthropics/claude-code/issues

## Future: Aggressive Mode (Experimental)

We're exploring riskier approaches that could genuinely help:

1. **DOM Removal** - Actually remove old messages (breaks React but frees memory)
2. **Flatten Code Blocks** - Replace 100s of syntax spans with plain text
3. **Detach Event Listeners** - Clone nodes without handlers

These are documented in `CLAUDE.md` under "Aggressive Performance Options". They WILL break with Claude.ai updates but could provide real memory relief.

## License

MIT

---

*Built with Claude, for Claude users* 🤖

**Honest about our limits** - This extension helps with scrolling, not the fundamental performance issues.
