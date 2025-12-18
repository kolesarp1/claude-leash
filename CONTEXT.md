# Claude Leash - Development Context

> **Note:** For comprehensive development guidelines, see `CLAUDE.md`

## Project Overview

Chrome extension (v3.4.14) that hides old messages in Claude.ai and Claude Code Web to improve UI performance. Uses CSS `display: none` - messages remain in DOM and AI context.

**Goal:** Cross-device compatible - works on laptops from 1024px to 4K displays.

## Current Status: Working (v3.4.14)

The extension successfully:
- Detects main conversation container via scoring system
- Excludes sidebars using width/class/position rules
- Hides older messages with CSS (no DOM removal)
- Shows badge with visible content amount (e.g., "9k")
- Supports Light/Dark/Auto themes
- Works on both Claude.ai and Claude Code Web

## File Structure

```
claude-leash/
├── manifest.json      # Extension config, version
├── content.js         # Main logic - container detection, hiding (~1000 lines)
├── popup.html         # UI with sliders, buttons, inline CSS (~395 lines)
├── popup.js           # Popup logic, settings persistence (~280 lines)
├── background.js      # Badge updates, tab communication (~66 lines)
├── icon16/48/128.png  # Extension icons
├── CLAUDE.md          # Development guide (READ THIS)
├── CONTEXT.md         # This file (quick reference)
├── README.md          # User documentation
└── .claude/
    ├── settings.local.json  # Claude Code permissions
    └── checklists/
        └── pr-checklist.md  # PR verification checklist
```

## Key Detection Logic (content.js)

**Container Detection (lines ~212-320):**
```javascript
// Score-based detection - prefers wide, tall, scrollable containers
function getScrollContainer() {
  // 1. Find elements with overflow-y-auto/scroll classes
  // 2. Score by: scrollHeight + height ratio bonus + width ratio bonus
  // 3. Exclude: sidebars, narrow containers, left-edge panels
  // 4. Return highest-scoring container
}
```

**Exclusion Rules:**
- Width < max(40% viewport, 500px) → excluded (cross-device compatible)
- Has `bg-bg-*` or `border-r` classes → excluded (sidebar)
- Left edge + narrow → excluded
- `flex-shrink-0` + width < 800px → excluded

## Recent Development History

| Version | Change |
|---------|--------|
| v3.4.14 | Performance fixes: batch reads/writes, narrow MutationObserver, debounce |
| v3.4.13 | Cross-device compatible: max(40%, 500px) width threshold |
| v3.4.12 | Require 50% viewport width minimum |
| v3.4.11 | Add width bonuses to scoring |
| v3.4.10 | Verbose sidebar detection logging |
| v3.4.9 | Multi-strategy sidebar exclusion |

## Debug Commands

In popup:
- **🔍 Debug**: Highlights container, logs to console
- **Debug checkbox**: Enables verbose logging

Console output when Debug enabled:
```
Claude Leash DEBUG: Found container: 153697px scroll, 1320px wide...
Claude Leash DEBUG: Found content parent at depth with 131 children...
Claude Leash DEBUG: Hidden 127 blocks (146k px)
```

## Testing Checklist

- [ ] Container detected correctly (width > 800px)
- [ ] Collapse hides older messages
- [ ] Show All reveals everything
- [ ] Badge updates correctly
- [ ] Works after session switch
- [ ] No console errors

## Key Selectors

```javascript
// Container detection
'[class*="overflow-y-auto"]'           // Tailwind scroll containers
'[class*="overflow-y-scroll"]'         // Alternative scroll class

// Sidebar exclusion
'bg-bg-'                               // Claude Code sidebar background
'border-r-['                           // Sidebar right border
'flex-shrink-0'                        // Fixed-width sidebar

// Hidden content
'.claude-leash-hidden'                 // Applied to hidden messages
'#claude-leash-placeholder'            // "X blocks hidden" banner
```
