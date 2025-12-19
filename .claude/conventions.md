# Claude Leash - Code Conventions & Best Practices

## Table of Contents
1. [Code Style Guidelines](#code-style-guidelines)
2. [JavaScript Conventions](#javascript-conventions)
3. [DOM Manipulation Best Practices](#dom-manipulation-best-practices)
4. [Chrome Extension Patterns](#chrome-extension-patterns)
5. [Error Handling](#error-handling)
6. [Performance Guidelines](#performance-guidelines)
7. [Documentation Standards](#documentation-standards)
8. [Git Commit Conventions](#git-commit-conventions)

---

## Code Style Guidelines

### General Principles

1. **Simplicity Over Cleverness**: Write clear, readable code that's easy to understand
2. **Consistency**: Follow existing patterns in the codebase
3. **No Dependencies**: Pure vanilla JavaScript - no npm packages, no build tools
4. **Browser Compatibility**: Target modern Chrome (last 2 versions)
5. **Performance First**: Optimize for 60fps UI responsiveness

### Formatting

```javascript
// ✅ Good - Clear, consistent formatting
function calculateMessageHeights(messages) {
  const heights = [];

  for (const message of messages) {
    const height = message.offsetHeight;
    heights.push(height);
  }

  return heights;
}

// ❌ Bad - Inconsistent spacing, unclear
function calculateMessageHeights(messages){
const heights=[];
for(const message of messages){heights.push(message.offsetHeight);}
return heights;}
```

**Rules:**
- **Indentation**: 2 spaces (no tabs)
- **Line length**: Max 100 characters (soft limit)
- **Semicolons**: Always required
- **Quotes**: Single quotes for strings, double quotes for HTML attributes
- **Braces**: Required for all blocks (even single-line if statements)
- **Trailing commas**: Allowed in multi-line arrays/objects

---

## JavaScript Conventions

### Naming

```javascript
// Variables and functions: camelCase
const messageContainer = document.getElementById('container');
function updateMessageVisibility() { }

// Classes: PascalCase (rare in this project)
class SessionManager { }

// Constants: SCREAMING_SNAKE_CASE
const MAX_THRESHOLD = 40000;
const DEFAULT_SCALE_FACTOR = 1.0;

// Private/internal: Prefix with underscore (convention only, not enforced)
function _internalHelper() { }
let _cachedValue = null;

// Boolean variables: Prefix with is/has/should
let isCollapsed = true;
let hasContainer = false;
let shouldUpdate = true;

// Arrays: Plural nouns
const messages = [];
const containers = [];

// DOM elements: Suffix with Element (optional, for clarity)
const containerElement = document.querySelector('.container');
const buttonElement = document.getElementById('btn');
```

### Variable Declarations

```javascript
// ✅ Good - const by default
const threshold = 10000;
const messages = getMessages();

// ✅ Good - let when reassignment needed
let currentSessionId = null;
currentSessionId = extractSessionId();

// ❌ Bad - var (legacy, avoid)
var globalVar = 'avoid';

// ✅ Good - Multiple declarations
const threshold = 10000;
const scaleFactor = 1.0;
const isEnabled = true;

// ❌ Bad - Single let/const for multiple variables
const threshold = 10000, scaleFactor = 1.0, isEnabled = true;
```

### Functions

```javascript
// ✅ Good - Async/await for asynchronous operations
async function loadSettings() {
  const settings = await chrome.storage.local.get('threshold');
  return settings.threshold;
}

// ✅ Good - Arrow functions for callbacks
messages.forEach(msg => {
  console.log(msg);
});

// ✅ Good - Named function for clarity
function handleSessionChange(sessionId) {
  console.log('Session changed:', sessionId);
}

// ❌ Bad - Anonymous function in critical paths
container.addEventListener('scroll', function() {
  // Hard to debug, no name in stack traces
});

// ✅ Better - Named function
container.addEventListener('scroll', function handleScroll() {
  // Clear in stack traces
});
```

### Comments

```javascript
// ✅ Good - Explain WHY, not WHAT
// Wait for React hydration to avoid conflicts with Claude's UI
await new Promise(resolve => requestIdleCallback(resolve));

// ✅ Good - Document complex logic
/**
 * Detects the main chat container using multi-strategy scoring.
 *
 * Strategy 1: CSS class detection (overflow-y-auto)
 * Strategy 2: Scroll height analysis (scrollHeight > clientHeight)
 * Strategy 3: Viewport coverage (element covering >80% viewport)
 *
 * @returns {HTMLElement|null} The best container candidate or null
 */
function detectChatContainer() {
  // Implementation...
}

// ❌ Bad - Obvious comment
// Loop through messages
for (const msg of messages) {
  // ...
}

// ❌ Bad - Commented-out code (remove instead)
// const oldThreshold = 5000;
// function oldImplementation() { }
```

### JSDoc for Public Functions

```javascript
/**
 * Updates the visibility of messages based on the threshold.
 *
 * Hides older messages when cumulative height exceeds the threshold,
 * starting from the bottom (most recent messages visible).
 *
 * @param {number} threshold - Maximum visible content height in pixels
 * @param {boolean} [forceUpdate=false] - Force recalculation even if cached
 * @returns {Promise<void>}
 * @throws {Error} If container cannot be detected
 */
async function updateMessageVisibility(threshold, forceUpdate = false) {
  // Implementation...
}
```

---

## DOM Manipulation Best Practices

### Element Selection

```javascript
// ✅ Good - Specific selectors
const container = document.querySelector('[class*="overflow-y-auto"]');
const button = document.getElementById('collapseToggle');

// ❌ Bad - Overly broad selectors
const divs = document.querySelectorAll('div'); // Too many results, slow

// ✅ Good - Cache selectors
let cachedContainer = null;

function getContainer() {
  if (!cachedContainer || !document.contains(cachedContainer)) {
    cachedContainer = detectChatContainer();
  }
  return cachedContainer;
}

// ❌ Bad - Repeated queries
function updateUI() {
  document.getElementById('btn').textContent = 'Update';
  document.getElementById('btn').disabled = true;
  document.getElementById('btn').classList.add('active');
}

// ✅ Good - Query once, use multiple times
function updateUI() {
  const btn = document.getElementById('btn');
  btn.textContent = 'Update';
  btn.disabled = true;
  btn.classList.add('active');
}
```

### DOM Modifications

```javascript
// ✅ Good - Batch reads, then batch writes (avoid layout thrashing)
const heights = messages.map(msg => msg.offsetHeight); // Read phase

messages.forEach((msg, idx) => {
  if (heights[idx] > threshold) {
    msg.style.display = 'none'; // Write phase
  }
});

// ❌ Bad - Interleaved reads and writes (triggers multiple reflows)
messages.forEach(msg => {
  const height = msg.offsetHeight;  // Read (triggers reflow)
  msg.style.display = 'none';       // Write (triggers reflow)
  const newHeight = msg.offsetHeight; // Read (triggers reflow)
});

// ✅ Good - Use CSS classes for styling
msg.classList.add('claude-leash-hidden');

// ❌ Bad - Inline styles for complex changes
msg.style.display = 'none';
msg.style.opacity = '0';
msg.style.visibility = 'hidden';

// ✅ Good - DocumentFragment for multiple insertions
const fragment = document.createDocumentFragment();
for (let i = 0; i < 10; i++) {
  const div = document.createElement('div');
  div.textContent = `Item ${i}`;
  fragment.appendChild(div);
}
container.appendChild(fragment); // Single reflow

// ❌ Bad - Multiple individual insertions
for (let i = 0; i < 10; i++) {
  const div = document.createElement('div');
  div.textContent = `Item ${i}`;
  container.appendChild(div); // 10 reflows!
}
```

### Event Listeners

```javascript
// ✅ Good - Named handlers for removal
function handleScroll(event) {
  // Logic here
}

container.addEventListener('scroll', handleScroll);
// Later: container.removeEventListener('scroll', handleScroll);

// ✅ Good - Debounce high-frequency events
let scrollTimeout = null;

container.addEventListener('scroll', () => {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    handleScroll();
  }, 150);
});

// ✅ Good - AbortSignal for cleanup
const controller = new AbortController();

container.addEventListener('scroll', handleScroll, {
  signal: controller.signal
});

// Later: controller.abort(); // Removes listener automatically

// ✅ Good - Event delegation for dynamic elements
container.addEventListener('click', (event) => {
  if (event.target.classList.contains('message')) {
    handleMessageClick(event.target);
  }
});

// ❌ Bad - Individual listeners on many elements
messages.forEach(msg => {
  msg.addEventListener('click', handleMessageClick);
});
```

### CSS Class Management

```javascript
// ✅ Good - Prefix custom classes
element.classList.add('claude-leash-hidden');
element.classList.add('claude-leash-placeholder');

// ❌ Bad - Generic class names (conflicts with Claude's UI)
element.classList.add('hidden');
element.classList.add('placeholder');

// ✅ Good - Toggle classes
element.classList.toggle('claude-leash-active', isActive);

// ❌ Bad - Conditional add/remove
if (isActive) {
  element.classList.add('claude-leash-active');
} else {
  element.classList.remove('claude-leash-active');
}
```

---

## Chrome Extension Patterns

### Message Passing

```javascript
// ✅ Good - Typed messages with clear intent
// Content script → Background
chrome.runtime.sendMessage({
  type: 'updateBadge',
  data: {
    text: '10k',
    color: '#3b82f6',
    tabId: chrome.runtime.id
  }
});

// Popup → Content script
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
chrome.tabs.sendMessage(tab.id, {
  type: 'settingsUpdated',
  key: 'collapseThreshold',
  value: 15000
});

// ✅ Good - Handle message responses
chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
  if (chrome.runtime.lastError) {
    console.error('Message failed:', chrome.runtime.lastError);
    return;
  }
  console.log('State:', response);
});

// ✅ Good - Message listener with validation
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate message structure
  if (!message || !message.type) {
    console.error('Invalid message:', message);
    return;
  }

  switch (message.type) {
    case 'updateBadge':
      handleBadgeUpdate(message.data);
      sendResponse({ success: true });
      break;
    case 'getState':
      const state = getCurrentState();
      sendResponse(state);
      break;
    default:
      console.warn('Unknown message type:', message.type);
  }

  return true; // Keep channel open for async responses
});
```

### Storage API

```javascript
// ✅ Good - Async/await with error handling
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      'collapseThreshold',
      'isCollapsed',
      'theme'
    ]);

    // Provide defaults for missing values
    const settings = {
      collapseThreshold: result.collapseThreshold ?? 10000,
      isCollapsed: result.isCollapsed ?? true,
      theme: result.theme ?? 'auto'
    };

    return settings;
  } catch (error) {
    console.error('[Claude Leash] Storage error:', error);
    return getDefaultSettings();
  }
}

// ✅ Good - Atomic updates
await chrome.storage.local.set({ collapseThreshold: 15000 });

// ❌ Bad - Read-modify-write race condition
const data = await chrome.storage.local.get('settings');
data.settings.threshold = 15000;
await chrome.storage.local.set({ settings: data.settings }); // Can overwrite concurrent changes

// ✅ Good - Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local') return;

  if (changes.collapseThreshold) {
    const newValue = changes.collapseThreshold.newValue;
    console.log('Threshold updated:', newValue);
    updateMessageVisibility(newValue);
  }
});
```

### Manifest V3 Patterns

```javascript
// ✅ Good - Use chrome.action (not chrome.browserAction)
chrome.action.setBadgeText({ text: '10k' });

// ❌ Bad - Manifest V2 API (deprecated)
chrome.browserAction.setBadgeText({ text: '10k' });

// ✅ Good - Background service worker (event-driven)
chrome.runtime.onMessage.addListener((message) => {
  // Handle message
  // Worker shuts down when idle
});

// ❌ Bad - Persistent background page (Manifest V2)
// No longer supported in Manifest V3

// ✅ Good - Use chrome.storage.session for temporary data
await chrome.storage.session.set({ tempData: value });

// ❌ Bad - Global variables in service worker (lost on shutdown)
let tempData = value; // Will be lost!
```

---

## Error Handling

### Try-Catch Blocks

```javascript
// ✅ Good - Wrap Chrome API calls
async function loadSettings() {
  try {
    const settings = await chrome.storage.local.get('threshold');
    return settings.threshold;
  } catch (error) {
    console.error('[Claude Leash] Failed to load settings:', error);
    return DEFAULT_THRESHOLD; // Provide fallback
  }
}

// ✅ Good - Catch specific errors
try {
  await updateMessageVisibility(threshold);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Operation cancelled (expected)');
  } else {
    console.error('[Claude Leash] Unexpected error:', error);
  }
}

// ❌ Bad - Swallow errors silently
try {
  await updateMessageVisibility(threshold);
} catch (error) {
  // Silent failure - hard to debug
}
```

### Input Validation

```javascript
// ✅ Good - Validate inputs
function setThreshold(value) {
  if (typeof value !== 'number') {
    console.error('Threshold must be a number, got:', typeof value);
    return;
  }

  if (value < MIN_THRESHOLD || value > MAX_THRESHOLD) {
    console.error(`Threshold out of range: ${value}`);
    return;
  }

  threshold = value;
}

// ✅ Good - Sanitize user input
function createPlaceholder(text) {
  const div = document.createElement('div');
  div.textContent = text; // Escapes HTML automatically
  return div;
}

// ❌ Bad - No validation
function setThreshold(value) {
  threshold = value; // What if value is NaN, null, or string?
}
```

### Graceful Degradation

```javascript
// ✅ Good - Fallback when feature unavailable
function detectSessionChange() {
  if (typeof history.pushState === 'function') {
    // Modern browser - use History API
    hookHistoryAPI();
  } else {
    // Fallback - use polling
    startPolling();
  }
}

// ✅ Good - Feature detection
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => initialize());
} else {
  setTimeout(() => initialize(), 100);
}
```

---

## Performance Guidelines

### DOM Queries

```javascript
// ✅ Good - Query once, cache result
const container = detectChatContainer();
if (container) {
  const messages = Array.from(container.children);
  // Use messages...
}

// ❌ Bad - Repeated queries
for (let i = 0; i < detectChatContainer().children.length; i++) {
  const msg = detectChatContainer().children[i];
  // detectChatContainer() called multiple times!
}
```

### Debouncing and Throttling

```javascript
// ✅ Good - Debounce (wait for pause in events)
let debounceTimer = null;

function debounce(func, delay) {
  return function(...args) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(this, args), delay);
  };
}

const debouncedUpdate = debounce(updateMessageVisibility, 300);
window.addEventListener('resize', debouncedUpdate);

// ✅ Good - Throttle (limit frequency)
let lastRun = 0;

function throttle(func, limit) {
  return function(...args) {
    const now = Date.now();
    if (now - lastRun >= limit) {
      lastRun = now;
      func.apply(this, args);
    }
  };
}

const throttledScroll = throttle(handleScroll, 100);
container.addEventListener('scroll', throttledScroll);
```

### Memory Management

```javascript
// ✅ Good - Clean up listeners
const controller = new AbortController();

container.addEventListener('scroll', handleScroll, {
  signal: controller.signal
});

// On cleanup
controller.abort(); // Removes all listeners

// ✅ Good - Clear caches when no longer needed
function cleanup() {
  sessionCache.clear();
  cachedContainer = null;
}

// ✅ Good - Weak references (when appropriate)
const elementCache = new WeakMap();

function cacheData(element, data) {
  elementCache.set(element, data); // Auto garbage-collected when element removed
}
```

---

## Documentation Standards

### File Headers

```javascript
/**
 * content.js - Claude Leash Content Script
 *
 * Injected into claude.ai and code.anthropic.com pages.
 * Responsible for:
 * - Detecting chat container and message elements
 * - Hiding older messages based on threshold
 * - Managing session state and caching
 * - Communicating with background script for badge updates
 *
 * @version 3.5.0
 * @author Claude Code AI Assistant
 */
```

### Section Comments

```javascript
// ============================================================================
// Container Detection
// ============================================================================

/**
 * Multi-strategy container detection with scoring system.
 * See architecture.md for detailed algorithm explanation.
 */
function detectChatContainer() {
  // Implementation...
}

// ============================================================================
// Message Visibility Management
// ============================================================================

// ...
```

### Inline Documentation

```javascript
// ✅ Good - Document non-obvious logic
// React may replace DOM elements during hydration, so we cache by session ID
// rather than by DOM reference
const cacheKey = `${sessionId}_${container.className}`;

// ✅ Good - Document edge cases
// Note: getBoundingClientRect() returns 0 for display:none elements,
// so we must check visibility before measuring
if (element.style.display !== 'none') {
  const height = element.getBoundingClientRect().height;
}

// ✅ Good - Document workarounds
// Workaround: Chrome sometimes fires scroll events before React updates,
// so we debounce to avoid stale data
clearTimeout(scrollTimeout);
scrollTimeout = setTimeout(handleScroll, 150);
```

---

## Git Commit Conventions

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **perf**: Performance improvement
- **refactor**: Code restructuring (no behavior change)
- **style**: Formatting changes (whitespace, semicolons)
- **docs**: Documentation updates
- **test**: Adding or updating tests
- **chore**: Maintenance tasks (version bumps, config)

### Examples

```
✅ Good commit messages:

feat(container): Add multi-strategy scoring for detection
- Implement CSS class scoring
- Add scroll height analysis
- Add viewport coverage calculation
- Exclude sidebar with flex-shrink detection

fix(badge): Badge not updating on session change
- Add listener for tab activation events
- Request badge update from content script on activate
- Update background.js to handle requestBadgeUpdate message

perf(cache): Optimize session cache with timestamps
- Add timestamp to cache entries
- Implement 30-second TTL for cache invalidation
- Clear stale entries on session change

docs(readme): Update installation instructions
- Add Chrome Web Store link (when published)
- Clarify loading unpacked steps
- Add troubleshooting section

❌ Bad commit messages:

fix: fixed bug
feat: new stuff
update code
WIP
asdf
```

### Version Bumping

```
// manifest.json version follows semver
"version": "3.4.10"
          │ │ │
          │ │ └─ Patch: Bug fixes
          │ └─── Minor: New features (backward compatible)
          └───── Major: Breaking changes

// Update manifest.json before release commit
git add manifest.json
git commit -m "chore: Bump version to v3.4.11"
git tag v3.4.11
```

---

## Code Review Checklist

Before submitting changes:

### Functionality
- [ ] Code works as intended (tested manually)
- [ ] No console errors in production mode
- [ ] Debug logs only appear when debugMode enabled
- [ ] Backward compatible with existing settings

### Code Quality
- [ ] Follows naming conventions (camelCase, descriptive names)
- [ ] No magic numbers (use named constants)
- [ ] Functions are focused (do one thing well)
- [ ] Complex logic is commented

### Performance
- [ ] No unnecessary DOM queries
- [ ] Batch reads/writes to avoid layout thrashing
- [ ] Debounced/throttled high-frequency events
- [ ] Caching used where appropriate

### Security
- [ ] No inline scripts or eval()
- [ ] User input sanitized (textContent, not innerHTML)
- [ ] Permissions not expanded
- [ ] No external network requests

### Documentation
- [ ] JSDoc added for public functions
- [ ] Comments explain WHY, not WHAT
- [ ] README/CONTEXT updated if needed
- [ ] Architecture.md updated for major changes

---

## Anti-Patterns to Avoid

### 1. Magic Numbers

```javascript
// ❌ Bad
if (height > 10000) { }

// ✅ Good
const DEFAULT_THRESHOLD = 10000;
if (height > DEFAULT_THRESHOLD) { }
```

### 2. Nested Callbacks (Pyramid of Doom)

```javascript
// ❌ Bad
chrome.storage.local.get('threshold', (result) => {
  chrome.tabs.query({ active: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { threshold: result.threshold }, (response) => {
      console.log(response);
    });
  });
});

// ✅ Good
const { threshold } = await chrome.storage.local.get('threshold');
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const response = await chrome.tabs.sendMessage(tab.id, { threshold });
console.log(response);
```

### 3. Mixing Concerns

```javascript
// ❌ Bad - Function does too many things
function updateUIAndSaveSettings(threshold) {
  // Update DOM
  document.getElementById('value').textContent = threshold;

  // Save to storage
  chrome.storage.local.set({ threshold });

  // Update badge
  chrome.runtime.sendMessage({ type: 'updateBadge', text: threshold });

  // Log debug info
  console.log('Updated threshold:', threshold);
}

// ✅ Good - Separate concerns
function updateThresholdUI(threshold) {
  document.getElementById('value').textContent = threshold;
}

async function saveThreshold(threshold) {
  await chrome.storage.local.set({ threshold });
}

function updateBadge(threshold) {
  chrome.runtime.sendMessage({ type: 'updateBadge', text: threshold });
}

// Compose when needed
async function setThreshold(threshold) {
  updateThresholdUI(threshold);
  await saveThreshold(threshold);
  updateBadge(threshold);
}
```

### 4. Premature Optimization

```javascript
// ❌ Bad - Over-engineered for unclear benefit
const memoizedHeights = new Map();
function getHeight(element) {
  const cached = memoizedHeights.get(element);
  if (cached && Date.now() - cached.timestamp < 1000) {
    return cached.value;
  }
  const height = element.offsetHeight;
  memoizedHeights.set(element, { value: height, timestamp: Date.now() });
  return height;
}

// ✅ Good - Simple, clear, fast enough
function getHeight(element) {
  return element.offsetHeight;
}
```

---

## Resources

- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html)
- [Chrome Extension Best Practices](https://developer.chrome.com/docs/extensions/mv3/devguide/)
- [Web Performance Best Practices](https://web.dev/fast/)

---

**Document Version:** 1.0
**Last Updated:** 2025-12-16
**Maintained by:** Claude Code AI Assistant
