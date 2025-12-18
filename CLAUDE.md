# CLAUDE.md - Claude Leash Development Guide

## Project Overview

Chrome extension that hides old messages on Claude.ai and Claude Code Web using CSS `display: none` to improve UI performance during long conversations. Messages remain in DOM and AI context - only rendering is skipped.

**Tech Stack:** Chrome Extension (Manifest V3), Vanilla JavaScript, CSS, Chrome Storage API
**No build system** - raw JS files loaded directly
**No test framework** - manual testing via Debug mode in popup

### Project Goals
1. **Cross-device compatibility** - Must work on laptops from 1024px to 4K displays
2. **Zero configuration** - Works out of the box on Claude Code Web
3. **Non-destructive** - CSS hiding only, no DOM mutations that break React

## Architecture

```
┌─────────────────┐     chrome.runtime      ┌──────────────────┐
│   content.js    │◄──────────────────────►│  background.js    │
│  (DOM control)  │      .sendMessage()     │  (badge updates)  │
└────────┬────────┘                         └──────────────────┘
         │
         │ DOM manipulation
         ▼
┌─────────────────┐     chrome.storage      ┌──────────────────┐
│   Claude.ai     │                         │    popup.js       │
│   page DOM      │◄───────────────────────►│  (settings UI)    │
└─────────────────┘         .local          └──────────────────┘
```

### File Responsibilities

| File | Purpose | Lines |
|------|---------|-------|
| `content.js` | Container detection, message hiding, session management | ~1000 |
| `popup.js` | Settings UI, slider controls, theme switching | ~280 |
| `popup.html` | Popup markup + all CSS (inline) | ~395 |
| `background.js` | Badge text/color updates, tab change handling | ~66 |
| `manifest.json` | Extension config, permissions, version | ~30 |

## Critical Concept: Container Detection

**This is where bugs live.** The extension must find the correct scrollable container to hide messages in.

### The Problem
Claude.ai has multiple scrollable containers:
- Sidebar (sessions list) - ~600px wide, left edge
- Main content area - ~1320px wide, after sidebar
- Nested containers inside main content

### The Solution: Scoring System

```javascript
// content.js getScrollContainer() scoring:
score = scrollHeight
      + (heightRatio > 0.5 ? 10000 : 0)   // Fills viewport height
      + (heightRatio > 0.7 ? 20000 : 0)   // Fills most of viewport
      + (widthRatio > 0.4 ? 15000 : 0)    // Reasonably wide
      + (widthRatio > 0.5 ? 25000 : 0)    // Main content width
      + (widthRatio > 0.6 ? 10000 : 0)    // Extra wide bonus
```

### Exclusion Rules (checked before scoring)
1. **Width < max(40% viewport, 500px)** → excluded (cross-device compatible threshold)
2. **Class contains `bg-bg-` or `border-r`** → excluded (sidebar classes)
3. **Left edge < 50px AND width < 800px** → excluded (left panel)
4. **Has `flex-shrink-0` AND width < 800px** → excluded (fixed sidebar)

**Width threshold examples:**
| Screen | 40% Threshold | 500px Floor | Effective Min |
|--------|---------------|-------------|---------------|
| 1920px | 768px | 500px | 768px |
| 1440px | 576px | 500px | 576px |
| 1280px | 512px | 500px | 512px |
| 1024px | 410px | 500px | 500px |

### Debugging Container Issues

1. Enable Debug checkbox in popup
2. Click 🔍 Debug button
3. Check console for:
```
Claude Leash DEBUG: Found container: 158208px scroll, 1320px wide, 862px tall, score=233712
```

**Red flags:**
- Container width < 800px (probably sidebar)
- Score < 80000 (probably wrong container)
- "No container found!" (detection failed)

## Code Standards

### Naming Conventions
```javascript
// Constants: UPPER_SNAKE_CASE
const STORAGE_KEY = 'claudeCollapseSettings';
const MIN_SCROLL_HEIGHT = 500;

// Functions: camelCase, verb prefix
function getScrollContainer() { }
function applyCollapse() { }
function handleSessionChange() { }

// Boolean variables: is/has/should prefix
let isApplying = false;
let reactHydrated = false;
```

### File Structure Pattern
```javascript
// content.js organization:
// 1. Constants
// 2. State variables
// 3. CSS injection
// 4. Settings functions
// 5. Detection functions (getScrollContainer, getContentParent)
// 6. Core logic (applyCollapse, restoreAll)
// 7. Event handlers
// 8. Message listener
// 9. init()
```

### Version Synchronization
**CRITICAL:** Version must match in TWO places:

```javascript
// content.js line 1:
// Claude Leash - Content Script v3.4.12

// manifest.json:
"version": "3.4.12",
```

## Development Workflow

### Branch Naming
```
claude/<description>-<session-id>
```
Example: `claude/fix-broken-functionality-rpy45`

### Commit Message Format
```
<Short description> (v<version>)

<Optional longer explanation>
```

**DO:**
```
Fix container detection to prefer wider main content area (v3.4.11)
Require minimum 50% viewport width for container (v3.4.12)
```

**DON'T:**
```
fixed stuff
WIP
update content.js
```

### Version Bump Checklist
1. Edit `content.js` line 1 comment
2. Edit `manifest.json` version field
3. Commit with version in message
4. Test in Chrome by reloading extension

## Testing Protocol

### Manual Test Checklist
Since there's no automated testing, verify these manually:

- [ ] Fresh page load - correct container detected
- [ ] Click Collapse - old messages hidden
- [ ] Click Show All - all messages restored
- [ ] Slider adjustment - changes take effect
- [ ] Session switch - new session detected, state preserved
- [ ] Debug mode - console shows detection logs
- [ ] Badge updates - shows "Xk" format, purple when collapsed

### Debug Mode Testing
1. Open claude.ai/code session with 50+ messages
2. Enable Debug in popup
3. Click Collapse
4. Console should show:
```
Claude Leash DEBUG: Found container: XXXpx scroll, XXXpx wide...
Claude Leash DEBUG: Found content parent at depth with XX children...
Claude Leash DEBUG: Hidden XX blocks (XXk px)
```

### Known Failure Patterns
| Symptom | Likely Cause |
|---------|--------------|
| "No container found!" | Detection rules too strict, or page not loaded |
| Wrong container width (< 800px) | Sidebar being selected |
| Hide/restore loop in console | Container detection flip-flopping |
| Badge shows 0k | Container scrollHeight not detected |

## Architecture Guidelines

### React Compatibility
Claude.ai uses React. **Never remove DOM nodes** - only use CSS hiding:

```javascript
// DO: CSS class toggle
node.classList.add('claude-leash-hidden');

// DON'T: DOM removal (breaks React)
node.remove();
node.parentElement.removeChild(node);
```

### Message Passing Pattern
```javascript
// Content script → Background
chrome.runtime.sendMessage({
  action: 'updateBadge',
  visible: 9000,
  total: 16000,
  isCollapsed: true
});

// Popup → Content script
chrome.tabs.sendMessage(tabId, {
  action: 'collapse',
  maxHeight: 10000,
  isCollapsed: true
});
```

### State Storage
```javascript
// Settings (persistent across sessions)
chrome.storage.local.set({
  claudeCollapseSettings: { maxHeight, isCollapsed, enableClaudeCode }
});

// Session state (per-session hidden count)
chrome.storage.local.set({
  claudeLeashSessions: { [sessionId]: { isCollapsed, hiddenCount } }
});
```

## Off-Limits / Warnings

### Never Modify
- **DOM structure assumptions** - Claude.ai can change anytime
- **History API hooks** - already patched, modifying causes stacking

### Known Technical Debt
These are known issues, don't "fix" without understanding implications:

1. **Memory leaks** - Scroll listener never removed (intentional for lifecycle)
2. **Polling interval** - Never cleared (fallback for History API)
3. **Session cache** - In-memory Map, lost on page refresh (acceptable)

### Fragile Code Areas
```javascript
// Container scoring magic numbers - tested extensively, don't change lightly
if (widthRatio > 0.5) score += 25000;

// Sidebar detection classes - based on observed Claude.ai DOM
const hasBgBg = classes.indexOf('bg-bg-') !== -1;
```

## Common Tasks

### Adding a New Exclusion Rule

```javascript
// In scoreContainer() function, add check:
const isMyNewPattern = /* detection logic */;

if (isMyNewPattern) {
  debugLog(`EXCLUDED by <reason>: ${rect.width}px wide`);
  return 0;
}
```

### Adding a New Setting

1. Add to `currentSettings` object in content.js
2. Add UI element in popup.html
3. Add handler in popup.js
4. Add to storage save/load in both files

### Debugging a Detection Issue

1. Enable Debug mode
2. Open console, filter by "Claude Leash"
3. Look for:
   - Which containers are being checked
   - What scores they receive
   - Why containers are excluded
4. Add temporary `debugLog()` calls if needed

## Quick Reference

### Storage Keys
- `claudeCollapseSettings` - User preferences
- `claudeLeashSessions` - Per-session state
- `claudeLeashTheme` - Theme preference

### CSS Classes
- `.claude-leash-hidden` - Applied to hidden messages
- `#claude-leash-placeholder` - The "X blocks hidden" banner
- `#claude-leash-styles` - Injected style element

### Message Actions
| Action | Direction | Purpose |
|--------|-----------|---------|
| `collapse` | popup→content | Apply/update collapse |
| `getStatus` | popup→content | Get current state |
| `debug` | popup→content | Trigger debug output |
| `restore` | popup→content | Show all messages |
| `updateBadge` | content→background | Update badge display |
| `reportStatus` | background→content | Request status after nav |

## Recent Bug History (Learn from These)

| Version | Bug | Root Cause | Fix |
|---------|-----|------------|-----|
| v3.4.13 | 50% threshold too aggressive for small screens | Fixed percentage didn't scale for laptops | Changed to max(40%, 500px) for cross-device support |
| v3.4.12 | 718px nested container selected | Large scrollHeight dominated scoring | Added 50% viewport minimum width requirement |
| v3.4.11 | Sidebar selected instead of main content | No width preference in scoring | Added width bonuses (+50k for wide containers) |
| v3.4.3 | Page freeze on complex sessions | Checking all divs with getComputedStyle | Limited to 400 divs, early exit on good match |
| v3.4.1 | Cache stored wrong height | Used container.scrollHeight after hiding | Use totalHeight before hiding |

## Interface-Specific Notes

### Claude Code Web (`/code/*`)
- Default: **enabled**
- Sidebar: ~600px, has `bg-bg-*` classes
- Main content: remaining viewport width
- Session ID format: `session_XXXXXXXXX`

### Claude.ai Chat (`/chat/*`)
- Default: **disabled** (user must enable)
- Different DOM structure than Code
- May need different detection in future

## Local Development

### Reload Extension After Changes
```
1. Make changes to .js files
2. Go to chrome://extensions/
3. Find "Claude Leash"
4. Click the refresh ↻ icon
5. Refresh the Claude.ai tab
```

### View Extension Console Errors
```
1. chrome://extensions/
2. Click "Details" on Claude Leash
3. Click "Inspect views: service worker"
4. Check Console tab for background.js errors
```
