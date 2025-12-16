# Claude Leash - Development Context

## Project Overview

Chrome extension that improves UI performance on Claude.ai and Claude Code Web during long conversations by hiding older messages via CSS `display: none`. Messages remain in DOM and AI context - only rendering is skipped.

## Current Status: ✅ WORKING (v3.5.0)

The extension successfully:
- Detects conversation content using configurable DOM selectors
- Hides older content based on pixel height threshold
- Shows badge with visible/total pixel count (e.g., "10k/45k")
- Supports Light/Dark/Auto themes
- Works on both Claude.ai and Claude Code Web
- Includes session caching for fast switching
- Validates all incoming messages for security

## File Structure

```
claude-leash/
├── manifest.json           # Extension config (Manifest v3), v3.5.0
├── content.js              # Main logic - detection, hiding, sessions (~1035 lines)
├── popup.html              # UI with sliders, toggles, theme selector
├── popup.js                # Popup logic, settings persistence
├── background.js           # Badge updates, tab communication
├── benchmark.js            # Performance testing script (paste in DevTools)
├── package.json            # npm config with Jest + Puppeteer
├── icon16/48/128.png       # Extension icons
├── README.md               # User documentation
├── CONTEXT.md              # This file - development context
├── TEST_STRATEGY.md        # Comprehensive test strategy document
├── tests/
│   ├── unit/
│   │   ├── validation.test.js       # Message validation tests
│   │   ├── selectors.test.js        # DOM selector config tests
│   │   └── container-detection.test.js  # Container scoring tests
│   └── e2e/
│       └── extension.test.js        # Puppeteer E2E tests
└── .claude/
    └── settings.local.json  # Git permissions for Claude
```

## Architecture

### Key Components

1. **DOM_SELECTORS Configuration** (`content.js:36-61`)
   ```javascript
   const DOM_SELECTORS = {
     container: {
       primary: '[class*="overflow-y-auto"], [class*="overflow-auto"]...',
       fallback: 'div'
     },
     sidebar: {
       classPatterns: ['bg-bg-', 'border-r-[', 'border-r ', 'flex-shrink-0'],
       maxLeftPosition: 50,
       maxWidth: 800,
       viewportWidthRatio: 0.6
     },
     content: { validTag: 'DIV', minHeight: 10, minWidth: 50 }
   };
   ```
   **Purpose**: Future-proof against Claude DOM changes. Update these selectors instead of hunting through code.

2. **Message Validation** (`content.js:63-97`)
   - Validates all incoming chrome.runtime messages
   - Enforces bounds: maxHeight (1000-200000), maxLines (1-10000)
   - Type-checks all boolean parameters

3. **Container Detection** (`content.js:212-320`)
   - Scores containers by: scroll height + viewport fill bonus
   - Excludes sidebars via class patterns + position heuristics
   - Uses configurable selectors from DOM_SELECTORS

4. **Session Management** (`content.js:685-818`)
   - Caches content info per session ID
   - Fast-path: <1.5s restore for cached sessions
   - Slow-path: Wait for content to stabilize (up to 8s)
   - AbortController prevents race conditions

5. **Early Intervention** (`content.js:407-439`)
   - MutationObserver watches for new content
   - Immediately hides new content if collapsed
   - Uses requestAnimationFrame for smooth updates

### Key Constants

```javascript
MIN_HEIGHT_FOR_COLLAPSE: 5000    // Min pixels to enable hiding
MIN_BLOCKS_FOR_COLLAPSE: 10     // Min blocks to hide
SCROLL_RESTORE_THRESHOLD: 300   // Pixels from top to restore
CACHE_MATCH_THRESHOLD: 0.7      // 70% match for fast-path
MAX_CONTENT_ATTEMPTS: 40        // ~8s max wait for content
```

## Detection Logic

### Container Finding
1. Query elements matching `DOM_SELECTORS.container.primary`
2. Score each by `scrollHeight + viewport_fill_bonus`
3. Exclude sidebars matching `DOM_SELECTORS.sidebar.classPatterns`
4. Fallback: scan all divs with getComputedStyle

### Content Hiding
1. Get all children from content parent
2. Calculate height from bottom up
3. Hide elements until `maxHeight` threshold reached
4. Add CSS class `claude-leash-hidden` (CSS `display: none`)
5. Insert placeholder with click-to-restore

## Testing

### Run Tests
```bash
npm install           # Install Jest + Puppeteer
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:e2e      # E2E tests (requires Puppeteer)
npm run test:coverage # With coverage report
```

### Performance Benchmark
```javascript
// Paste benchmark.js contents into DevTools Console, then:
await runBenchmark()  // Full benchmark (scroll FPS, layout cost, etc.)
quickCheck()          // Quick DOM node count
```

### Manual Testing Checklist
- [ ] Fresh page load shows correct total count
- [ ] Clicking Collapse hides older messages
- [ ] Clicking Show All reveals all messages
- [ ] Slider adjustment changes visible content
- [ ] Badge updates correctly
- [ ] New messages from Claude are detected and hidden
- [ ] Works after page navigation (session switch)
- [ ] Theme toggle works
- [ ] Scroll to top incrementally restores content

## Debug Commands

### In Extension Popup
- **Debug button**: Highlights container (red) and content parent (orange), logs to console
- **Debug Mode checkbox**: Enables verbose console logging

### Console Output (with Debug Mode ON)
```
Claude Leash DEBUG: Found container: 15000px scroll, 800px visible, score=45000
Claude Leash DEBUG: Found content parent with 25 children
Claude Leash DEBUG: Hidden 20 blocks (12k px)
Claude Leash DEBUG: Session change abc123 -> def456
Claude Leash DEBUG: Fast path hit! (14k / 15k = 93%)
```

## Key Selectors Reference

```javascript
// Container detection (configurable in DOM_SELECTORS)
'[class*="overflow-y-auto"]'      // Primary scroll containers
'[class*="overflow-auto"]'        // Alternative overflow
'[class*="overflow-y-scroll"]'    // Explicit scroll

// Sidebar exclusion patterns
'bg-bg-'         // Claude Code sidebar background
'border-r-['     // Right border (Tailwind)
'border-r '      // Right border (standard)
'flex-shrink-0'  // Fixed-width panels
```

## Version History

| Version | Changes |
|---------|---------|
| v3.5.0 | DOM selectors config, message validation, test infrastructure |
| v3.4.10 | Verbose sidebar detection logging |
| v3.4.x | Sidebar exclusion improvements |
| v3.3.0 | Early intervention, performance optimizations |
| v3.2.0 | Switch to pixel-based cropping |
| v3.0.0 | Session caching, fast-path switching |

## Contributing

1. Update `DOM_SELECTORS` in content.js when Claude changes its DOM structure
2. Add tests for new functionality in `tests/`
3. Run `npm test` before committing
4. Use `benchmark.js` to validate performance impact
