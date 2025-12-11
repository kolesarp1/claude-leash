# Claude Leash - Development Context

## Project Overview

Chrome extension that hides old messages in Claude.ai and Claude Code Web to improve UI performance during long conversations. Messages are hidden via CSS `display: none` - they remain in DOM and AI context.

## Current Status: ✅ WORKING (v1.8.1)

The extension successfully:
- Detects conversation messages on Claude.ai using class-based selectors
- Hides older messages when "Collapse" is clicked
- Shows badge with visible/total count (e.g., "8/53")
- Supports Light/Dark/Auto themes
- Works on both Claude.ai and Claude Code Web

## File Structure

```
claude-leash/
├── manifest.json      # Extension config, v1.8.1
├── content.js         # Main logic - message detection & hide/show
├── popup.html         # UI with slider, buttons, theme toggle
├── popup.js           # Popup logic, settings persistence
├── background.js      # Badge updates, tab communication
├── icon16/48/128.png  # Extension icons
└── README.md          # Documentation
```

## Key Detection Logic (content.js)

**Claude.ai detection (lines ~108-192):**
```javascript
// Find user messages and Claude responses by class
const userMessages = document.querySelectorAll('[class*="font-user-message"]');
const claudeResponses = document.querySelectorAll('[class*="font-claude-response"]');

// Walk up DOM to find message containers
// Stop at parent with >900px width or >3 siblings
```

**Claude Code detection (lines ~55-107):**
```javascript
// Uses data-testid="conversation-turn-X" attributes
const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
```

## Recent Development History

1. **Initial problem**: Extension was finding wrong elements (web search result cards instead of conversation turns)
2. **Solution attempts**:
   - Tried structural detection (scroll containers, depth walking) - unreliable
   - Tried position-based validation - still found wrong elements
3. **Working solution**: Class-based selectors from DOM analysis
   - `font-user-message` for user messages
   - `font-claude-response` for Claude responses
   - Walk up DOM to find container, stop at wide parent or many-sibling parent

## Known Issues / Future Improvements

1. **Message count mismatch**: Shows ~60 containers for 27 user messages (counts both user + Claude as separate)
   - Could group into "turns" (user + response pairs)
   
2. **Initial flash**: Messages may briefly appear on page load before hiding

3. **Claude Code Web**: Detection works but may need refinement for the sidebar panel

4. **Persistence**: Hidden state persists via chrome.storage, but unhide-on-find can cause count drift

## Debug Commands

In popup:
- **🔍 Debug**: Highlights elements, logs positions/sizes to console
- **📋 Scan**: Deep DOM structure analysis

Console output format:
```
Claude.ai: Raw counts - user: 27 claude: 576
Claude.ai: Found 60 message containers
Claude Leash: COLLAPSING - total: 60, keep: 8, will hide: 52
Claude Leash: Applied - 52 hidden, 8 visible
```

## Testing Checklist

- [ ] Fresh page load shows correct total count
- [ ] Clicking Collapse hides older messages
- [ ] Clicking Show All reveals all messages
- [ ] Slider adjustment changes keep-visible count
- [ ] Badge updates correctly
- [ ] New messages from Claude are detected
- [ ] Works after page navigation
- [ ] Theme toggle works

## Key Classes/Selectors

```javascript
// Claude.ai
'[class*="font-user-message"]'     // User messages
'[class*="font-claude-response"]'  // Claude responses

// Claude Code Web  
'[data-testid^="conversation-turn-"]'  // Turn containers
'[class*="overflow-y-auto"]'           // Scroll containers
```

## Useful Console Commands

```javascript
// Check what extension finds
document.querySelectorAll('[class*="font-user-message"]').length
document.querySelectorAll('[class*="font-claude-response"]').length

// Manual hide test
document.querySelectorAll('[class*="font-user-message"]')[0].parentElement.style.display = 'none'
```

## Transcript Reference

Full development session transcript at:
`/mnt/transcripts/2025-12-11-12-39-19-claude-leash-element-detection-fix.txt`
