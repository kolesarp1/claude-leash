# Claude Leash - Implementation Roadmap

> **Goal**: Transform product goals into actionable development tasks. Move from documentation to implementation.

---

## Current State Assessment

### What We Have ✅
- ✅ Core functionality (message hiding, session management)
- ✅ Multi-platform support (Claude.ai, Claude Code)
- ✅ Basic UI (popup with slider, toggle)
- ✅ Container detection (multi-strategy)
- ✅ Session caching
- ✅ Comprehensive documentation

### What We Need 🎯
- ⏳ Performance metrics collection
- ⏳ Baseline performance measurements
- ⏳ UX improvements (instant feedback, progressive disclosure)
- ⏳ Future-proofing enhancements (versioned storage, better error handling)
- ⏳ Automated testing infrastructure
- ⏳ Public metrics dashboard

---

## Phase 1: Establish Baseline & Measure (Weeks 1-2)

**Goal**: Know where we are before we optimize. Collect real performance data.

### Task 1.1: Implement Performance Monitor

**Priority**: P0 (Critical)
**Effort**: 2-3 days
**Owner**: Engineering

**Implementation**:
```javascript
// content.js - Add PerformanceMonitor class
class PerformanceMonitor {
  constructor() {
    this.metrics = { fps: [], hideLatency: [], restoreLatency: [] };
  }

  measureFPS(duration = 5000) { /* ... */ }
  measureHideLatency() { /* ... */ }
  recordMetric(type, value) { /* ... */ }
  getStats(metricType) { /* ... */ }
  exportMetrics() { /* ... */ }
}

// Initialize on load
const perfMonitor = new PerformanceMonitor();
```

**Files to Modify**:
- `content.js`: Add PerformanceMonitor class, instrument hideMessages function
- `popup.js`: Add "Export Metrics" button in debug mode
- `popup.html`: Add metrics export UI

**Acceptance Criteria**:
- [ ] FPS measured during scrolling (5-second samples)
- [ ] Hide/restore latency tracked
- [ ] Metrics exportable as JSON
- [ ] Stats displayed in console (mean, median, p95, p99)

**See**: [metrics.md](metrics.md#performance-metrics-local-collection) for full implementation details.

---

### Task 1.2: Run Baseline Benchmarks

**Priority**: P0 (Critical)
**Effort**: 1 day
**Owner**: QA / Engineering

**Process**:
1. Create test conversation (100 messages, varying lengths)
2. Measure WITHOUT extension:
   - FPS during scrolling (use Chrome DevTools Performance)
   - Paint duration (Performance monitor)
   - CPU usage (Task Manager)
   - Input latency (manual timing)
3. Measure WITH extension (same conversation)
4. Document results in `BENCHMARKS.md`

**Tools**:
- Chrome DevTools Performance tab
- Chrome Task Manager
- Performance API
- Manual stopwatch for latency

**Acceptance Criteria**:
- [ ] Baseline "without extension" metrics documented
- [ ] Current "with extension" metrics documented
- [ ] Improvement percentages calculated
- [ ] Results added to repository

**Deliverable**: `BENCHMARKS.md` file with table of results

---

### Task 1.3: Automated Performance Testing

**Priority**: P1 (High)
**Effort**: 3-4 days
**Owner**: Engineering

**Implementation**:
```javascript
// test/performance-benchmark.js
const puppeteer = require('puppeteer');

async function runPerformanceBenchmark() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  const page = await browser.newPage();
  await page.goto('https://code.anthropic.com/project/test');

  // Measure FPS during scroll
  const fps = await page.evaluate(() => {
    return new Promise(resolve => {
      let frameCount = 0;
      const duration = 5000;
      const start = performance.now();

      const countFrame = () => {
        frameCount++;
        const elapsed = performance.now() - start;
        if (elapsed < duration) {
          requestAnimationFrame(countFrame);
        } else {
          resolve((frameCount / elapsed) * 1000);
        }
      };

      requestAnimationFrame(countFrame);
    });
  });

  console.log(`FPS: ${fps.toFixed(2)}`);

  await browser.close();
}
```

**Files to Create**:
- `test/performance-benchmark.js`: Automated benchmark script
- `package.json`: Add puppeteer dependency
- `.github/workflows/performance.yml`: CI/CD performance checks

**Acceptance Criteria**:
- [ ] Automated benchmark script runs successfully
- [ ] Measures FPS, latency, paint duration
- [ ] Outputs results to console and JSON file
- [ ] Can be run locally and in CI/CD

**Note**: This introduces Node.js/npm for testing only. Extension remains vanilla JS.

---

## Phase 2: UX Improvements (Weeks 3-4)

**Goal**: Implement UX principles from [ux-principles.md](ux-principles.md).

### Task 2.1: Instant Feedback for Slider

**Priority**: P1 (High)
**Effort**: 1 day
**Owner**: Engineering

**Current Behavior**: Slider updates on `change` event (only when released)
**Target Behavior**: Slider updates on `input` event (real-time during drag)

**Implementation**:
```javascript
// popup.js - Change event listener
thresholdSlider.addEventListener('input', (e) => {
  const value = parseInt(e.target.value);

  // 1. Immediate visual update (0ms)
  thresholdValueDisplay.textContent = formatThreshold(value);

  // 2. Update badge (immediate, local)
  updateBadgePreview(value);

  // 3. Debounced save and apply (150ms)
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    saveThreshold(value);
    applyThreshold(value);
  }, 150);
});
```

**Files to Modify**:
- `popup.js`: Change `change` → `input` event, add debouncing

**Acceptance Criteria**:
- [ ] Slider value updates in real-time during drag
- [ ] Badge preview updates instantly
- [ ] Actual application debounced (no performance hit)
- [ ] Feels responsive (<50ms perceived latency)

---

### Task 2.2: Progressive Disclosure in Popup

**Priority**: P1 (High)
**Effort**: 2 days
**Owner**: Engineering

**Current UI**: All controls visible (cluttered)
**Target UI**: Basic controls visible, advanced collapsed

**Implementation**:
```html
<!-- popup.html - Restructure -->
<div class="popup-basic">
  <label>Visible: <span id="thresholdValue">10k</span></label>
  <input type="range" id="thresholdSlider" ...>
  <button id="collapseToggle">Collapse / Show All</button>

  <button id="advancedToggle" class="link-button">
    <span id="advancedIcon">▼</span> Advanced
  </button>
</div>

<div id="advancedSection" class="hidden">
  <!-- Platform toggles, scale, theme, debug mode -->
</div>
```

```javascript
// popup.js - Toggle advanced section
advancedToggle.addEventListener('click', () => {
  advancedSection.classList.toggle('hidden');
  advancedIcon.textContent = advancedSection.classList.contains('hidden') ? '▼' : '▲';

  // Track usage
  if (!advancedSection.classList.contains('hidden')) {
    trackFeatureUsage('advanced_opened');
  }
});
```

**Files to Modify**:
- `popup.html`: Restructure UI with basic/advanced sections
- `popup.js`: Add toggle handler
- `popup.css`: Add styles for collapsed/expanded states

**Acceptance Criteria**:
- [ ] Default state: Advanced section collapsed
- [ ] Click to expand/collapse works smoothly
- [ ] Smooth animation (200ms transition)
- [ ] State persists across popup opens (optional)

---

### Task 2.3: Loading States & Success Feedback

**Priority**: P2 (Medium)
**Effort**: 1 day
**Owner**: Engineering

**Implementation**:
```javascript
// popup.js - Add loading states
async function saveThreshold(value) {
  const saveButton = document.getElementById('collapseToggle');

  // Show loading
  saveButton.classList.add('loading');
  saveButton.disabled = true;

  try {
    await chrome.storage.local.set({ collapseThreshold: value });
    await applyToContent(value);

    // Show success
    saveButton.classList.remove('loading');
    saveButton.classList.add('success');

    setTimeout(() => {
      saveButton.classList.remove('success');
      saveButton.disabled = false;
    }, 1500);

  } catch (error) {
    saveButton.classList.remove('loading');
    saveButton.classList.add('error');
    console.error('Save failed:', error);
  }
}
```

```css
/* popup.css - Button states */
.btn.loading {
  opacity: 0.6;
  cursor: wait;
}

.btn.loading::after {
  content: '';
  /* Spinner animation */
}

.btn.success {
  background-color: #10b981;
  color: white;
}

.btn.error {
  background-color: #ef4444;
  color: white;
}
```

**Acceptance Criteria**:
- [ ] Loading state shown during async operations
- [ ] Success state shown briefly (1-2s) after completion
- [ ] Error state shown if operation fails
- [ ] User always knows operation status

---

## Phase 3: Future-Proofing (Weeks 5-6)

**Goal**: Implement resilience and graceful degradation.

### Task 3.1: Versioned Storage Schema

**Priority**: P1 (High)
**Effort**: 2 days
**Owner**: Engineering

**Implementation**:
```javascript
// storage.js - New file for storage management
const STORAGE_VERSION = 2;

const DEFAULT_SETTINGS = {
  version: STORAGE_VERSION,
  collapseThreshold: 10000,
  isCollapsed: true,
  hiDPIScaleFactor: 1.0,
  interfaceToggles: {
    claudeCode: true,
    claudeAI: true
  },
  theme: 'auto',
  debugMode: false
};

async function loadSettings() {
  const stored = await chrome.storage.local.get(null);

  // No settings? Use defaults
  if (!stored.version) {
    await chrome.storage.local.set(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }

  // Old version? Migrate
  if (stored.version < STORAGE_VERSION) {
    const migrated = await migrateSettings(stored);
    await chrome.storage.local.set(migrated);
    return migrated;
  }

  return stored;
}

async function migrateSettings(oldSettings) {
  console.log(`[Migrate] v${oldSettings.version} → v${STORAGE_VERSION}`);

  let settings = { ...oldSettings };

  // v1 → v2: Add interfaceToggles
  if (settings.version === 1) {
    settings.interfaceToggles = {
      claudeCode: true,
      claudeAI: true
    };
  }

  settings.version = STORAGE_VERSION;
  return settings;
}
```

**Files to Create**:
- `storage.js`: Centralized storage management

**Files to Modify**:
- `content.js`: Use `loadSettings()` from storage.js
- `popup.js`: Use `loadSettings()` from storage.js
- `manifest.json`: Add storage.js to scripts

**Acceptance Criteria**:
- [ ] Settings have version number
- [ ] Defaults applied if no settings exist
- [ ] Migration works from v1 → v2
- [ ] Old installations upgrade seamlessly

---

### Task 3.2: Enhanced Error Recovery

**Priority**: P1 (High)
**Effort**: 2 days
**Owner**: Engineering

**Implementation**:
```javascript
// error-handler.js - Centralized error handling
class ErrorHandler {
  constructor() {
    this.errors = [];
    this.maxErrors = 10;
  }

  handle(error, context, options = {}) {
    console.error(`[Claude Leash] Error in ${context}:`, error);

    this.errors.push({
      error,
      context,
      timestamp: Date.now(),
      stack: error.stack
    });

    // Trim error log
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Auto-recovery strategies
    if (options.autoRecover) {
      this.attemptRecovery(context);
    }

    // Notify user (optional, non-intrusive)
    if (options.notifyUser) {
      this.showErrorNotification(context);
    }

    // Log for debugging
    if (debugMode) {
      this.logDetailedError(error, context);
    }
  }

  attemptRecovery(context) {
    switch (context) {
      case 'containerDetection':
        // Clear cache, retry
        cachedContainer = null;
        setTimeout(() => detectChatContainer(), 1000);
        break;

      case 'messageHiding':
        // Reset to known good state
        resetToKnownGoodState();
        break;

      case 'sessionChange':
        // Abort pending operations
        abortController.abort();
        abortController = new AbortController();
        break;
    }
  }

  showErrorNotification(context) {
    const message = `Extension recovered from error (${context})`;
    // Show subtle notification, auto-dismiss
    console.log(`[Recovery] ${message}`);
  }

  exportErrors() {
    return {
      errors: this.errors,
      timestamp: Date.now(),
      version: chrome.runtime.getManifest().version
    };
  }
}

const errorHandler = new ErrorHandler();

// Usage
try {
  updateMessageVisibility(threshold);
} catch (error) {
  errorHandler.handle(error, 'messageHiding', {
    autoRecover: true,
    notifyUser: false
  });
}
```

**Acceptance Criteria**:
- [ ] All try-catch blocks use errorHandler
- [ ] Auto-recovery attempted for common errors
- [ ] Errors logged for debugging
- [ ] Extension never "breaks" visibly
- [ ] Error export available for bug reports

---

### Task 3.3: Platform Abstraction Layer

**Priority**: P2 (Medium)
**Effort**: 3 days
**Owner**: Engineering

**Implementation**:
```javascript
// platforms.js - Platform abstraction
const PLATFORMS = {
  CLAUDE_AI: {
    id: 'claudeAI',
    name: 'Claude.ai',
    urlPattern: /^https:\/\/claude\.ai\//,
    badgeColor: '#3b82f6',
    selectors: {
      container: [
        '[class*="overflow-y-auto"]',
        '[class*="overflow-auto"]',
        '.chat-container'
      ],
      messages: [
        'div[data-testid*="message"]',
        '.message-wrapper'
      ]
    },
    sessionIdExtractor: (url) => {
      const match = url.pathname.match(/\/chat\/([^\/]+)/);
      return match ? match[1] : null;
    }
  },

  CLAUDE_CODE: {
    id: 'claudeCode',
    name: 'Claude Code Web',
    urlPattern: /^https:\/\/code\.anthropic\.com\//,
    badgeColor: '#10b981',
    selectors: {
      container: [
        '[class*="overflow-y-auto"]',
        '[class*="chat-panel"]'
      ],
      messages: [
        'div[class*="message"]'
      ]
    },
    sessionIdExtractor: (url) => {
      const match = url.pathname.match(/\/project\/([^\/]+)/);
      return match ? match[1] : null;
    }
  }
};

function detectPlatform() {
  const url = window.location.href;

  for (const [key, platform] of Object.entries(PLATFORMS)) {
    if (platform.urlPattern.test(url)) {
      return platform;
    }
  }

  return null;
}

function detectContainer(platform) {
  for (const selector of platform.selectors.container) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      // Score and rank candidates
      const scored = Array.from(elements).map(el => ({
        element: el,
        score: scoreCandidate(el)
      }));

      const best = scored.sort((a, b) => b.score - a.score)[0];
      if (best && best.score > 0) {
        return best.element;
      }
    }
  }

  return null;
}

// Usage
const currentPlatform = detectPlatform();
if (currentPlatform) {
  const container = detectContainer(currentPlatform);
  const sessionId = currentPlatform.sessionIdExtractor(window.location);

  chrome.runtime.sendMessage({
    type: 'updateBadge',
    data: {
      color: currentPlatform.badgeColor,
      text: formatThreshold(threshold)
    }
  });
}
```

**Benefits**:
- Easy to add new platforms (just add to PLATFORMS object)
- Centralized configuration
- Platform-specific logic isolated
- Future-proof for new Claude interfaces

**Acceptance Criteria**:
- [ ] Both platforms work with abstraction layer
- [ ] Adding test platform takes <30 minutes
- [ ] Platform-specific logic clearly separated
- [ ] Badge colors correct per platform

---

## Phase 4: Polish & Optimization (Weeks 7-8)

**Goal**: Fine-tune performance, improve edge cases, add polish.

### Task 4.1: Optimize Container Detection

**Priority**: P1 (High)
**Effort**: 2-3 days
**Owner**: Engineering

**Optimizations**:
1. **Cache Detection Results**: Don't re-scan DOM if container found
2. **Early Exit**: Stop searching once high-confidence match found
3. **Lazy Evaluation**: Only run expensive checks when needed
4. **IntersectionObserver**: More efficient than scroll events

**Implementation**:
```javascript
// Optimization: Cache container with DOM validation
let cachedContainer = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30000; // 30 seconds

function getContainer() {
  const now = Date.now();

  // Cache hit: container exists and is recent
  if (cachedContainer &&
      document.contains(cachedContainer) &&
      (now - cacheTimestamp) < CACHE_TTL) {
    return cachedContainer;
  }

  // Cache miss: detect container
  cachedContainer = detectChatContainer();
  cacheTimestamp = now;

  return cachedContainer;
}

// Optimization: Early exit on high-confidence match
function detectChatContainer() {
  const candidates = document.querySelectorAll('[class*="overflow"]');

  for (const candidate of candidates) {
    const score = scoreCandidate(candidate);

    // Early exit: high-confidence match
    if (score > 50) {
      console.log('[Claude Leash] High-confidence container found');
      return candidate;
    }
  }

  // Fallback: find best candidate
  // ...
}
```

**Acceptance Criteria**:
- [ ] Container detection <20ms (p95)
- [ ] Cache hit rate >80%
- [ ] No unnecessary DOM queries
- [ ] Debug logs show cache hits/misses

---

### Task 4.2: Progressive Message Unhiding (IntersectionObserver)

**Priority**: P2 (Medium)
**Effort**: 2 days
**Owner**: Engineering

**Current**: Scroll-based unhiding (debounced scroll event)
**Target**: IntersectionObserver (more efficient)

**Implementation**:
```javascript
// Use IntersectionObserver for progressive unhiding
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      // Placeholder visible, unhide more messages
      unhideNextBatch(5); // Show 5 more
    }
  });
}, {
  root: container,
  rootMargin: '100px',  // Trigger 100px before visible
  threshold: 0.1
});

// Observe placeholder
observer.observe(placeholderElement);
```

**Benefits**:
- More efficient than scroll events
- No debouncing needed
- Better battery life
- Smoother experience

**Acceptance Criteria**:
- [ ] Placeholder observed correctly
- [ ] Messages unhide when scrolling up
- [ ] No jank or stuttering
- [ ] Better CPU usage than scroll events

---

### Task 4.3: Keyboard Shortcuts

**Priority**: P2 (Medium)
**Effort**: 1-2 days
**Owner**: Engineering

**Implementation**:
```javascript
// content.js - Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + Shift + H: Toggle collapse
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
    e.preventDefault();
    toggleCollapse();
    showNotification('Messages ' + (isCollapsed ? 'collapsed' : 'expanded'));
  }

  // Ctrl/Cmd + Shift + R: Reveal all
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    showAllMessages();
    showNotification('All messages revealed');
  }
});

// Show shortcuts in popup
<div class="shortcuts-help">
  <h4>Keyboard Shortcuts</h4>
  <ul>
    <li><kbd>Ctrl+Shift+H</kbd> Toggle collapse</li>
    <li><kbd>Ctrl+Shift+R</kbd> Reveal all</li>
  </ul>
</div>
```

**Acceptance Criteria**:
- [ ] Shortcuts work on both platforms
- [ ] Don't conflict with Claude's shortcuts
- [ ] Documented in popup and README
- [ ] Accessible (announced to screen readers)

---

## Phase 5: Publish & Showcase (Week 9-10)

**Goal**: Publish metrics, launch extension, showcase results.

### Task 5.1: Create Performance Dashboard

**Priority**: P1 (High)
**Effort**: 2 days
**Owner**: Product

**Deliverable**: `PERFORMANCE.md` with public metrics dashboard

**Content**:
```markdown
# Claude Leash Performance Report - Q1 2025

## Methodology
- Tested on Chrome 120, Windows 11, 16GB RAM
- Conversation: 100 messages, average 200px each
- Metrics: Average of 100 runs, 95% confidence interval

## Results

[Benchmark table showing before/after metrics]
[Charts showing FPS improvement, CPU reduction, etc.]
[Comparison to mobile baseline]

## Conclusion
Claude Leash delivers +127% FPS improvement, -85% paint time, -79% CPU usage.
Extension makes Claude Code Web feel as snappy as mobile.
```

**Acceptance Criteria**:
- [ ] Metrics documented and published
- [ ] Charts/visualizations included
- [ ] Methodology clearly explained
- [ ] Showcase-worthy presentation

---

### Task 5.2: Chrome Web Store Listing

**Priority**: P1 (High if publishing)
**Effort**: 1 day
**Owner**: Product

**Steps**:
1. Create developer account ($5 one-time fee)
2. Prepare assets:
   - Screenshots (1280x800 or 640x400)
   - Promotional images
   - Extension icon (128x128)
3. Write store description (compelling copy)
4. Submit for review
5. Monitor reviews and ratings

**Listing Copy**:
```
Title: Claude Leash - Make Claude Snappy

Short Description:
Make Claude Code Web and claude.ai feel as fast as mobile.
60fps scrolling in long conversations. Zero configuration needed.

Long Description:
[Compelling copy highlighting benefits, metrics, ease of use]
```

---

### Task 5.3: README Update & Marketing

**Priority**: P1 (High)
**Effort**: 1 day
**Owner**: Product

**Updates to README.md**:
- Add performance metrics prominently
- Include before/after GIFs/videos
- Add Chrome Web Store badge (if published)
- Include user testimonials (if available)
- Link to performance dashboard

**Marketing Channels**:
- Reddit (r/chrome_extensions, r/ClaudeAI)
- Hacker News (Show HN)
- Twitter/X (with metrics)
- Product Hunt (launch)

---

## Success Criteria Summary

### Technical Excellence
- ✅ All KPI targets met
- ✅ Zero console errors
- ✅ 60fps sustained in 500+ message conversations
- ✅ <50ms interaction latency (p95)
- ✅ Future-proof architecture (survives UI changes)

### User Satisfaction
- ✅ >4.5 Chrome Store rating
- ✅ >50 NPS score
- ✅ 95%+ users don't need configuration
- ✅ Unsolicited positive feedback

### Business Impact
- ✅ >1000 monthly active users (by end of year)
- ✅ <2% churn rate
- ✅ Published performance dashboard
- ✅ Industry recognition (featured on blogs, HN)

---

## Next Steps

1. **Immediate** (This Week):
   - Implement Task 1.1 (Performance Monitor)
   - Run Task 1.2 (Baseline Benchmarks)
   - Document current state

2. **Short-Term** (Next 2 Weeks):
   - Complete Phase 1 (Metrics)
   - Start Phase 2 (UX Improvements)

3. **Medium-Term** (Next Month):
   - Complete Phase 2-3 (UX + Future-Proofing)
   - Start Phase 4 (Polish)

4. **Long-Term** (Quarter):
   - Complete Phase 5 (Publish)
   - Iterate based on user feedback

---

**Document Version:** 1.0
**Last Updated:** 2025-12-16
**Owner:** Engineering & Product Teams
**Review:** Weekly sprint planning
