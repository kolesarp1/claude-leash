# Claude Leash - Project Instructions

## Quick Start

This is a Chrome extension (Manifest v3) that improves Claude.ai/Claude Code Web performance by hiding old messages via CSS.

**Key files:**
- `content.js` - Main logic (~1035 lines)
- `popup.js` - Extension UI
- `DOM_SELECTORS` config at `content.js:36-61` - Update when Claude changes DOM

## Development Commands

```bash
npm install        # Install test dependencies
npm test           # Run all tests
npm run test:unit  # Unit tests only
```

## Architecture Notes

1. **CSS-only hiding** - Uses `display: none`, NOT DOM removal (preserves React state)
2. **Configurable selectors** - `DOM_SELECTORS` object at top of content.js
3. **Message validation** - All chrome.runtime messages validated before processing
4. **Session caching** - Fast-path switching between conversations (<1.5s)

## When Claude.ai Changes

If the extension stops working after Claude updates:

1. Open DevTools on claude.ai
2. Inspect the conversation container structure
3. Update `DOM_SELECTORS.container.primary` selectors
4. Update `DOM_SELECTORS.sidebar.classPatterns` if sidebar detection breaks
5. Run tests: `npm test`

## Testing Changes

Before committing:
1. Run `npm test` for unit tests
2. Load extension in Chrome (chrome://extensions → Developer mode → Load unpacked)
3. Test on claude.ai with a long conversation
4. Use `benchmark.js` in DevTools to verify performance

## Code Style

- Vanilla JavaScript (no frameworks)
- IIFE pattern for isolation
- `debugLog()` for conditional logging (respects Debug Mode setting)
- Constants at top of file with clear names
