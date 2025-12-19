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
| v3.4.15 | Hide/restore loop causing RecalcStyle spam | Observer recreated on every applyCollapse, not disconnected during changes | Add earlyInterventionSetup flag, disconnect observer during hide/restore, CSS containment, 150ms debounce |
| v3.4.14 | Extension hurts performance (1s+ blocking frames) | Layout thrashing, MutationObserver on document.body, no debounce | Batch reads/writes, observe contentParent only, add debounce + isRestoring guard |
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

## Performance Reality Check

### What This Extension Actually Helps With

Based on Chrome DevTools performance trace analysis of a slow Claude session:

| Performance Issue | Time Impact | Does Extension Help? |
|------------------|-------------|---------------------|
| **Garbage Collection** | 4.3 seconds | ❌ NO - hidden elements still in memory |
| **Long JS Tasks** | 2+ seconds each | ❌ NO - can't affect Claude's code |
| **React Re-renders** | 185 events | ❌ NO - `display:none` doesn't stop reconciliation |
| **Layout/Reflow** | 1.4 seconds | ⚠️ PARTIAL - hidden elements skip layout |
| **Paint/Composite** | 230ms | ✅ YES - hidden elements don't paint |

**Honest assessment: The extension helps with ~10-15% of the actual slowdown.**

### Why CSS Hiding Has Limits

```javascript
// What we do:
node.classList.add('claude-leash-hidden');
// CSS: display: none !important;

// What this means:
// ✅ Element removed from render tree (no paint/layout)
// ❌ Element still in DOM (memory allocated)
// ❌ React still tracks component (reconciliation runs)
// ❌ Event handlers still attached (GC pressure)
// ❌ All child nodes still exist (syntax highlight spans, etc.)
```

A 500-message session with code blocks might have:
- 500+ React component instances (~2-5KB each)
- 2000+ event handlers
- 10,000+ syntax highlighting spans
- **All still in memory, all still causing GC pressure**

### The Core Constraint

From CLAUDE.md architecture guidelines:
> "Never remove DOM nodes - only use CSS hiding"

This is necessary because **removing nodes breaks React hydration**. But it also means we can't solve the real problem (memory/GC).

## Aggressive Performance Options (Not Future-Proof)

These approaches could genuinely help but may break with Claude.ai updates:

### Option 1: Selective DOM Removal (High Risk, High Reward)

**What:** Actually remove very old messages (500+ back) from DOM, store in IndexedDB.

```javascript
// EXPERIMENTAL - breaks React but frees memory
function aggressiveCleanup(messages, keepLast = 100) {
  const toRemove = messages.slice(0, -keepLast);

  // Store content before removal
  toRemove.forEach(msg => {
    const content = msg.innerHTML;
    indexedDB.put('messages', { id: msg.dataset.id, content });
    msg.remove(); // ⚠️ BREAKS REACT STATE
  });
}
```

**Pros:** Actually frees memory, reduces GC pressure
**Cons:** Breaks React, can't restore without page refresh, may cause errors

### Option 2: Detach Event Listeners (Medium Risk)

**What:** Remove event handlers from hidden elements to reduce GC roots.

```javascript
function detachListeners(node) {
  // Clone node without event listeners
  const clone = node.cloneNode(true);
  node.parentNode.replaceChild(clone, node);
  return clone;
}
```

**Pros:** Reduces memory pressure from handler closures
**Cons:** Breaks interactivity if restored, React may re-attach anyway

### Option 3: Flatten Syntax Highlighting (Medium Risk)

**What:** Replace deeply nested syntax highlight spans with plain text + class.

```javascript
function flattenCodeBlocks(container) {
  container.querySelectorAll('pre code').forEach(code => {
    // Hundreds of nested <span> elements → one text node
    const text = code.textContent;
    code.innerHTML = '';
    code.textContent = text;
    code.classList.add('flattened');
  });
}
```

**Pros:** Massive DOM node reduction (100s → 1 per code block)
**Cons:** Loses syntax highlighting colors, may break copy functionality

### Option 4: RequestIdleCallback Cleanup (Low Risk)

**What:** Use idle time to null out references in hidden nodes.

```javascript
function scheduleMemoryCleanup() {
  requestIdleCallback((deadline) => {
    while (deadline.timeRemaining() > 0 && hiddenNodes.length > 100) {
      const old = hiddenNodes[0];
      // Clear internal references (weak mitigation)
      old.node.__reactFiber$ = undefined;
      old.node.__reactProps$ = undefined;
    }
  });
}
```

**Pros:** Non-blocking, won't cause visible issues
**Cons:** React may recreate references, limited impact

### Option 5: Virtual Scrolling Polyfill (High Effort)

**What:** Implement virtual scrolling by intercepting Claude's scroll container.

#### Why Virtual Scrolling Is The Real Fix

Discord, Slack, VS Code, and every performant chat app uses virtual scrolling. Here's why:

```
Traditional Rendering (Claude.ai now):
┌─────────────────────────────────────┐
│ Message 1    ← In DOM, in memory   │
│ Message 2    ← In DOM, in memory   │
│ Message 3    ← In DOM, in memory   │
│ ...          ← 500 messages...     │
│ Message 500  ← In DOM, in memory   │
└─────────────────────────────────────┘
Memory: 500 React components, 500 DOM trees
GC: Must scan all 500 component closures

Virtual Scrolling:
┌─────────────────────────────────────┐
│ [Spacer: 45000px]  ← Just height   │
│ Message 47   ← In DOM (visible)    │
│ Message 48   ← In DOM (visible)    │ ← Viewport
│ Message 49   ← In DOM (visible)    │
│ Message 50   ← In DOM (visible)    │
│ [Spacer: 5000px]   ← Just height   │
└─────────────────────────────────────┘
Memory: 4-10 React components only
GC: Only scans visible component closures
```

#### Implementation Architecture

```javascript
class VirtualMessageList {
  constructor(container, options = {}) {
    this.container = container;
    this.scrollContainer = container.parentElement;

    // Configuration
    this.bufferSize = options.buffer || 3;        // Messages above/below viewport
    this.estimatedHeight = options.itemHeight || 200;  // Default guess

    // State
    this.messages = [];           // Original message data/elements
    this.heights = new Map();     // Measured heights: index -> px
    this.renderedRange = { start: 0, end: 0 };

    // DOM structure
    this.topSpacer = document.createElement('div');
    this.bottomSpacer = document.createElement('div');
    this.contentWrapper = document.createElement('div');

    this.init();
  }

  init() {
    // Capture existing messages before virtualizing
    this.messages = [...this.container.children].map(el => ({
      element: el,
      height: el.offsetHeight,
      html: el.outerHTML  // Serialize for re-creation
    }));

    // Measure all heights upfront (one-time cost)
    this.messages.forEach((msg, i) => {
      this.heights.set(i, msg.height);
    });

    // Replace content with virtual structure
    this.container.innerHTML = '';
    this.container.appendChild(this.topSpacer);
    this.container.appendChild(this.contentWrapper);
    this.container.appendChild(this.bottomSpacer);

    // Initial render
    this.updateVisibleRange();

    // Listen for scroll
    this.scrollContainer.addEventListener('scroll',
      this.handleScroll.bind(this), { passive: true });

    // Listen for resize
    new ResizeObserver(() => this.updateVisibleRange())
      .observe(this.scrollContainer);
  }

  getVisibleRange() {
    const scrollTop = this.scrollContainer.scrollTop;
    const viewportHeight = this.scrollContainer.clientHeight;

    let accumulatedHeight = 0;
    let startIndex = 0;
    let endIndex = this.messages.length - 1;

    // Find first visible message
    for (let i = 0; i < this.messages.length; i++) {
      const height = this.heights.get(i) || this.estimatedHeight;
      if (accumulatedHeight + height > scrollTop) {
        startIndex = Math.max(0, i - this.bufferSize);
        break;
      }
      accumulatedHeight += height;
    }

    // Find last visible message
    const viewportBottom = scrollTop + viewportHeight;
    for (let i = startIndex; i < this.messages.length; i++) {
      const height = this.heights.get(i) || this.estimatedHeight;
      accumulatedHeight += height;
      if (accumulatedHeight > viewportBottom) {
        endIndex = Math.min(this.messages.length - 1, i + this.bufferSize);
        break;
      }
    }

    return { start: startIndex, end: endIndex };
  }

  updateVisibleRange() {
    const newRange = this.getVisibleRange();

    // Skip if range unchanged
    if (newRange.start === this.renderedRange.start &&
        newRange.end === this.renderedRange.end) {
      return;
    }

    // Calculate spacer heights
    let topHeight = 0;
    for (let i = 0; i < newRange.start; i++) {
      topHeight += this.heights.get(i) || this.estimatedHeight;
    }

    let bottomHeight = 0;
    for (let i = newRange.end + 1; i < this.messages.length; i++) {
      bottomHeight += this.heights.get(i) || this.estimatedHeight;
    }

    // Update spacers
    this.topSpacer.style.height = `${topHeight}px`;
    this.bottomSpacer.style.height = `${bottomHeight}px`;

    // Render visible messages
    this.contentWrapper.innerHTML = '';
    for (let i = newRange.start; i <= newRange.end; i++) {
      const msg = this.messages[i];
      // Re-create element from stored HTML
      const el = document.createElement('div');
      el.innerHTML = msg.html;
      const messageEl = el.firstElementChild;
      this.contentWrapper.appendChild(messageEl);

      // Update measured height after render
      requestAnimationFrame(() => {
        this.heights.set(i, messageEl.offsetHeight);
      });
    }

    this.renderedRange = newRange;
  }

  handleScroll() {
    // Throttle scroll handling
    if (this._scrollRAF) return;
    this._scrollRAF = requestAnimationFrame(() => {
      this._scrollRAF = null;
      this.updateVisibleRange();
    });
  }

  // Called when new message arrives
  appendMessage(element) {
    const index = this.messages.length;
    this.messages.push({
      element,
      height: this.estimatedHeight,
      html: element.outerHTML
    });

    // If at bottom, render immediately
    if (this.renderedRange.end === index - 1) {
      this.updateVisibleRange();
    } else {
      // Just update bottom spacer
      this.bottomSpacer.style.height =
        `${parseInt(this.bottomSpacer.style.height) + this.estimatedHeight}px`;
    }
  }

  destroy() {
    // Restore original content
    this.container.innerHTML = '';
    this.messages.forEach(msg => {
      const el = document.createElement('div');
      el.innerHTML = msg.html;
      this.container.appendChild(el.firstElementChild);
    });
  }
}
```

#### Key Challenges for Claude.ai

| Challenge | Why It's Hard | Possible Solution |
|-----------|--------------|-------------------|
| **Variable heights** | Messages have code blocks, images, varying text | Measure once, cache heights |
| **React reconciliation** | React expects its DOM to exist | Store outerHTML, recreate elements |
| **Event handlers** | Click, copy, etc. need to work | Re-attach via event delegation |
| **Dynamic content** | Streaming responses change height | ResizeObserver on visible items |
| **Scroll position** | Must maintain position during updates | Calculate offset before/after |
| **Code highlighting** | Syntax spans are expensive | Flatten on serialize, re-highlight on demand |

#### Memory Impact Comparison

For a 500-message session with code blocks:

| Metric | Traditional | Virtual (10 visible) | Reduction |
|--------|-------------|---------------------|-----------|
| DOM nodes | ~50,000 | ~1,000 | **98%** |
| React components | 500 | 10 | **98%** |
| Event handlers | 2,000+ | 40 | **98%** |
| Memory (estimated) | 150MB+ | 5-10MB | **93%+** |
| GC scan time | 4+ seconds | <100ms | **97%** |

#### Integration Points

```javascript
// In content.js, replace applyCollapse with virtualization:

function enableVirtualScrolling() {
  const container = getScrollContainer();
  const contentParent = getContentParent(container);

  if (!contentParent || contentParent._virtualized) return;

  // Create virtual scroller
  contentParent._virtualScroller = new VirtualMessageList(contentParent, {
    buffer: 5,
    itemHeight: 300  // Claude messages tend to be tall
  });

  contentParent._virtualized = true;

  debugLog('Virtual scrolling enabled');
}

// Hook into Claude's message stream
function observeNewMessages() {
  const container = getScrollContainer();
  const contentParent = getContentParent(container);

  if (!contentParent._virtualScroller) return;

  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          contentParent._virtualScroller.appendMessage(node);
        }
      });
    });
  });

  observer.observe(contentParent, { childList: true });
}
```

#### Why This Is "Not Future-Proof"

1. **Claude DOM changes**: Any change to message structure breaks serialization
2. **React internal changes**: New React versions may handle DOM differently
3. **Feature additions**: New interactive features may not work after re-creation
4. **Copy/paste**: Cloned elements may lose clipboard handlers
5. **Streaming**: Live typing indicators need special handling

#### Recommendation

Virtual scrolling is the **correct architectural solution** but requires:
- Significant development effort (est. 40-80 hours)
- Ongoing maintenance as Claude.ai updates
- Comprehensive testing across features
- Fallback mechanism when things break

**For v4.0+**: Implement behind `enableExperimentalVirtualScrolling` flag with clear warnings.

**Better long-term**: File feature request for Anthropic to implement this natively - they have access to React internals and can do this properly.

## Recommended Path Forward

### Short-term (Current Extension)
1. Market as "smoother scrolling" not "performance fix"
2. Help with what we can (paint/layout)
3. Add metrics so users can see actual impact

### Medium-term (v4.0)
1. Implement Option 3 (flatten code blocks) behind a flag
2. Implement Option 4 (idle cleanup) as default
3. Add "Aggressive Mode" toggle for Options 1-2

### Long-term (Feature Request)
The real fix must come from Anthropic:
- Claude.ai needs virtualized message lists (like Discord/Slack)
- Only visible messages should be in DOM
- Old messages loaded on-demand when scrolling up

**File a feature request:** https://github.com/anthropics/claude-code/issues
