// Claude Leash - Content Script v3.5.0
// Proactive content hiding for snappy performance
(function() {
  'use strict';

  // ============ Constants ============
  const STORAGE_KEY = 'claudeCollapseSettings';
  const SESSION_KEY = 'claudeLeashSessions';
  const METRICS_KEY = 'claudeLeashMetrics';
  const PLACEHOLDER_ID = 'claude-leash-placeholder';
  const STYLE_ID = 'claude-leash-styles';

  // Storage version for migrations
  const STORAGE_VERSION = 1;

  // Timing constants
  const POLLING_INTERVAL_MS = 300;
  const CONTENT_CHECK_INTERVAL_MS = 200;
  const MAX_CONTENT_ATTEMPTS = 40;
  const STABLE_THRESHOLD = 3;
  const SESSION_CHANGE_DELAY_MS = 50;

  // Size constants
  const MIN_SCROLL_HEIGHT = 500;
  const MIN_HEIGHT_FOR_COLLAPSE = 5000;
  const MIN_BLOCKS_FOR_COLLAPSE = 10;
  const MIN_CONTAINER_WIDTH = 300;
  const MIN_CONTAINER_HEIGHT = 200;
  const SIDEBAR_MAX_LEFT = 150;
  const SIDEBAR_MAX_WIDTH = 400;
  const MIN_CHILD_HEIGHT = 20;
  const MIN_CHILD_WIDTH = 100;
  const SCROLL_RESTORE_THRESHOLD = 300;

  // Detection constants
  const MAX_CONTENT_DEPTH = 15;
  const MAX_SESSIONS_STORED = 50;
  const CACHE_MATCH_THRESHOLD = 0.7; // 70% match for fast path

  // ============ DOM Selectors Configuration ============
  // Future-proof: Update these when Claude changes its DOM structure
  const DOM_SELECTORS = {
    // Scroll container detection
    container: {
      // Primary: Tailwind overflow classes
      primary: '[class*="overflow-y-auto"], [class*="overflow-auto"], [class*="overflow-y-scroll"]',
      // Fallback: Any scrollable div (checked via getComputedStyle)
      fallback: 'div'
    },
    // Sidebar exclusion patterns
    sidebar: {
      // Class patterns that indicate sidebar
      classPatterns: ['bg-bg-', 'border-r-[', 'border-r ', 'flex-shrink-0'],
      // Position-based: left edge + narrow width
      maxLeftPosition: 50,
      maxWidth: 800,
      viewportWidthRatio: 0.6
    },
    // Content children filtering
    content: {
      validTag: 'DIV',
      minHeight: 10,
      minWidth: 50
    }
  };

  // ============ Message Validation ============
  // Validate incoming messages from popup/background
  function validateMessage(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }
    if (!message.action || typeof message.action !== 'string') {
      return { valid: false, error: 'Missing or invalid action' };
    }
    // Validate numeric parameters
    if (message.maxHeight !== undefined) {
      if (typeof message.maxHeight !== 'number' || message.maxHeight < 1000 || message.maxHeight > 200000) {
        return { valid: false, error: 'maxHeight must be number between 1000-200000' };
      }
    }
    if (message.maxLines !== undefined) {
      if (typeof message.maxLines !== 'number' || message.maxLines < 1 || message.maxLines > 10000) {
        return { valid: false, error: 'maxLines must be number between 1-10000' };
      }
    }
    // Validate boolean parameters
    if (message.isCollapsed !== undefined && typeof message.isCollapsed !== 'boolean') {
      return { valid: false, error: 'isCollapsed must be boolean' };
    }
    if (message.enableClaudeAi !== undefined && typeof message.enableClaudeAi !== 'boolean') {
      return { valid: false, error: 'enableClaudeAi must be boolean' };
    }
    if (message.enableClaudeCode !== undefined && typeof message.enableClaudeCode !== 'boolean') {
      return { valid: false, error: 'enableClaudeCode must be boolean' };
    }
    if (message.enabled !== undefined && typeof message.enabled !== 'boolean') {
      return { valid: false, error: 'enabled must be boolean' };
    }
    return { valid: true };
  }

  // ============ Performance Monitor ============
  // Local-only metrics collection for measuring extension effectiveness
  const perfMonitor = {
    metrics: {
      fps: [],
      hideLatency: [],
      restoreLatency: [],
      containerDetectionTime: [],
      sessionSwitchTime: []
    },
    maxSamples: 100,

    // Measure FPS during scrolling
    measureFPS(duration = 3000) {
      let frameCount = 0;
      const startTime = performance.now();

      const countFrame = () => {
        frameCount++;
        const elapsed = performance.now() - startTime;

        if (elapsed < duration) {
          requestAnimationFrame(countFrame);
        } else {
          const fps = Math.round((frameCount / elapsed) * 1000);
          this.recordMetric('fps', fps);
        }
      };

      requestAnimationFrame(countFrame);
    },

    // Create a latency measurement timer
    startTimer(metricType) {
      const start = performance.now();
      return {
        complete: () => {
          const duration = performance.now() - start;
          perfMonitor.recordMetric(metricType, duration);
          return duration;
        }
      };
    },

    // Record a metric value
    recordMetric(type, value) {
      if (!this.metrics[type]) {
        this.metrics[type] = [];
      }

      this.metrics[type].push({
        value,
        timestamp: Date.now()
      });

      // Keep only last maxSamples
      if (this.metrics[type].length > this.maxSamples) {
        this.metrics[type].shift();
      }

      // Persist asynchronously (debounced via setTimeout)
      this.saveMetricsDebounced();
    },

    saveMetricsDebounced() {
      if (this._saveTimeout) return;
      this._saveTimeout = setTimeout(() => {
        this._saveTimeout = null;
        this.saveMetrics();
      }, 5000); // Save every 5 seconds max
    },

    async saveMetrics() {
      try {
        await chrome.storage.local.set({
          [METRICS_KEY]: {
            version: STORAGE_VERSION,
            metrics: this.metrics,
            lastUpdated: Date.now()
          }
        });
      } catch (e) {
        // Silent fail
      }
    },

    async loadMetrics() {
      try {
        const result = await chrome.storage.local.get(METRICS_KEY);
        if (result[METRICS_KEY]?.metrics) {
          this.metrics = result[METRICS_KEY].metrics;
        }
      } catch (e) {
        // Silent fail
      }
    },

    // Get statistical summary for a metric type
    getStats(metricType) {
      const values = (this.metrics[metricType] || []).map(m => m.value);

      if (values.length === 0) return null;

      const sorted = [...values].sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);

      return {
        count: values.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean: sum / values.length,
        median: sorted[Math.floor(sorted.length / 2)],
        p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
        p99: sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1]
      };
    },

    // Export all metrics as JSON
    exportMetrics() {
      const data = {
        version: STORAGE_VERSION,
        exportedAt: new Date().toISOString(),
        metrics: {}
      };

      for (const [type, values] of Object.entries(this.metrics)) {
        data.metrics[type] = {
          stats: this.getStats(type),
          samples: values.length
        };
      }

      return data;
    },

    // Display metrics in console (for debug mode)
    displayDashboard() {
      console.group('📊 Claude Leash Performance Metrics');

      for (const type of Object.keys(this.metrics)) {
        const stats = this.getStats(type);
        if (stats) {
          const unit = type === 'fps' ? ' fps' : 'ms';
          console.group(type);
          console.log(`  Count: ${stats.count}`);
          console.log(`  Mean: ${stats.mean.toFixed(2)}${unit}`);
          console.log(`  Median: ${stats.median.toFixed(2)}${unit}`);
          console.log(`  Min: ${stats.min.toFixed(2)}${unit}`);
          console.log(`  Max: ${stats.max.toFixed(2)}${unit}`);
          console.log(`  P95: ${stats.p95.toFixed(2)}${unit}`);
          console.groupEnd();
        }
      }

      console.groupEnd();
    }
  };

  // ============ Storage Migration ============
  async function migrateStorageIfNeeded() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const settings = result[STORAGE_KEY];

      if (!settings) return;

      // Check if migration needed
      if (!settings.version || settings.version < STORAGE_VERSION) {
        // Migrate from unversioned to v1
        const migrated = {
          ...settings,
          version: STORAGE_VERSION
        };

        // Convert maxLines to maxHeight if needed
        if (settings.maxLines && !settings.maxHeight) {
          migrated.maxHeight = settings.maxLines * 24;
          delete migrated.maxLines;
        }

        await chrome.storage.local.set({ [STORAGE_KEY]: migrated });
        debugLog('Migrated settings to version', STORAGE_VERSION);
      }
    } catch (e) {
      debugLog('Migration error:', e.message);
    }
  }

  // Debug mode (loaded from storage, default false)
  let DEBUG_MODE = false;

  function debugLog(...args) {
    if (DEBUG_MODE) {
      console.log('Claude Leash DEBUG:', ...args);
    }
  }

  // ============ State ============
  let currentSettings = {
    maxHeight: 10000,
    isCollapsed: false,
    enableClaudeAi: false,
    enableClaudeCode: true
  };

  let lastUrl = location.href;
  let isApplying = false;
  let cachedContainer = null;
  let cachedContentParent = null;
  let contentObserver = null;
  let reactHydrated = false;

  // Storage for hidden content (CSS-only, no DOM removal to avoid React conflicts)
  let hiddenNodes = [];
  let totalHiddenHeight = 0;
  let placeholder = null;
  let originalTotalHeight = 0;

  // Session tracking
  let currentSessionId = null;
  let sessionContentCache = new Map(); // In-memory cache: sessionId -> {blockCount, scrollHeight, timestamp}

  // Performance: debounce and guard flags
  let isRestoring = false;
  let collapseDebounceTimer = null;
  let earlyInterventionSetup = false;
  const COLLAPSE_DEBOUNCE_MS = 150;

  // AbortController for cancelling pending operations on session switch
  let currentAbortController = null;

  // Track if History API hooks are working (to disable polling)
  let historyApiTriggered = false;
  let pollingIntervalId = null;

  // ============ CSS Injection (runs FIRST for instant effect) ============

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Placeholder styling */
      #${PLACEHOLDER_ID} {
        padding: 16px 20px;
        margin: 8px 0;
        background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
        border-radius: 8px;
        text-align: center;
        color: #666;
        font-size: 13px;
        cursor: pointer;
        border: 1px dashed #ccc;
        transition: background 0.2s, transform 0.1s;
      }
      #${PLACEHOLDER_ID}:hover {
        background: linear-gradient(135deg, #e8e8e8 0%, #ddd 100%);
        transform: scale(1.005);
      }
      /* Hide content marked for removal (instant, before JS processes) */
      .claude-leash-hidden {
        display: none !important;
        contain: strict;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // Inject styles immediately
  injectStyles();

  // ============ Settings ============

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      if (result[STORAGE_KEY]) {
        if (result[STORAGE_KEY].maxHeight) {
          currentSettings.maxHeight = result[STORAGE_KEY].maxHeight;
        } else if (result[STORAGE_KEY].maxLines) {
          currentSettings.maxHeight = result[STORAGE_KEY].maxLines * 24;
        }
        currentSettings.isCollapsed = result[STORAGE_KEY].isCollapsed || false;
        // Claude Code ON by default, Claude.ai OFF by default
        currentSettings.enableClaudeCode = result[STORAGE_KEY].enableClaudeCode !== false;
        currentSettings.enableClaudeAi = result[STORAGE_KEY].enableClaudeAi === true;
        // Debug mode OFF by default
        DEBUG_MODE = result[STORAGE_KEY].debugMode === true;
      }
    } catch (e) {
      // Silent fail - settings will use defaults
    }
  }

  async function saveSessionState() {
    if (!currentSessionId) return;

    try {
      // Always read fresh from storage first (prevents multi-tab race condition)
      const result = await chrome.storage.local.get(SESSION_KEY);
      const freshStates = result[SESSION_KEY] || {};

      freshStates[currentSessionId] = {
        isCollapsed: currentSettings.isCollapsed,
        hiddenCount: hiddenNodes.length,
        timestamp: Date.now()
      };

      // Clean old sessions (keep last MAX_SESSIONS_STORED)
      const keys = Object.keys(freshStates);
      if (keys.length > MAX_SESSIONS_STORED) {
        keys.sort((a, b) => freshStates[a].timestamp - freshStates[b].timestamp);
        keys.slice(0, keys.length - MAX_SESSIONS_STORED).forEach(k => delete freshStates[k]);
      }

      await chrome.storage.local.set({ [SESSION_KEY]: freshStates });
    } catch (e) {
      debugLog('Failed to save session state:', e.message);
    }
  }

  async function loadSessionStates() {
    try {
      const result = await chrome.storage.local.get(SESSION_KEY);
      return result[SESSION_KEY] || {};
    } catch (e) {
      debugLog('Failed to load session states:', e.message);
      return {};
    }
  }

  function getSessionId() {
    // Extract session ID from URL
    const match = location.pathname.match(/\/(chat|code)\/([^/?]+)/);
    return match ? match[2] : location.pathname;
  }

  function isClaudeCode() {
    return location.pathname.startsWith('/code');
  }

  function isEnabledForCurrentInterface() {
    return isClaudeCode() ? currentSettings.enableClaudeCode : currentSettings.enableClaudeAi;
  }

  // ============ React Hydration Safety ============

  function waitForReactHydration() {
    return new Promise(resolve => {
      if (reactHydrated) {
        resolve();
        return;
      }

      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
          reactHydrated = true;
          resolve();
        }, { timeout: 3000 });
      } else {
        setTimeout(() => {
          reactHydrated = true;
          resolve();
        }, 2000);
      }
    });
  }

  // ============ Container Detection (behavior-based) ============

  function getScrollContainer(forceRefresh = false) {
    if (!forceRefresh && cachedContainer && document.contains(cachedContainer)) {
      if (cachedContainer.scrollHeight > MIN_SCROLL_HEIGHT) {
        return cachedContainer;
      }
    }

    const detectionTimer = forceRefresh ? perfMonitor.startTimer('containerDetectionTime') : null;
    const viewportHeight = window.innerHeight;
    let best = null;
    let bestScore = 0;

    // Score function: prefer large containers that fill most of the viewport
    function scoreContainer(container) {
      const rect = container.getBoundingClientRect();
      const scrollHeight = container.scrollHeight;
      // Ensure className is a string (SVG elements use SVGAnimatedString)
      const classes = String(container.className || '');

      // Must be visible and reasonably sized
      if (rect.width < MIN_CONTAINER_WIDTH || rect.height < MIN_CONTAINER_HEIGHT) return 0;
      if (rect.left < SIDEBAR_MAX_LEFT && rect.width < SIDEBAR_MAX_WIDTH) return 0;
      if (scrollHeight <= MIN_SCROLL_HEIGHT) return 0;

      // CRITICAL: Main content area width requirements
      // Cross-device compatible: works on laptops from 1024px to 4K displays
      // - Must be at least 40% of viewport (catches nested containers on large screens)
      // - Must be at least 500px absolute (safety floor for tiny viewports)
      const viewportWidth = window.innerWidth;
      const minWidthPercent = viewportWidth * 0.4;
      const minWidthAbsolute = 500;
      const minWidth = Math.max(minWidthPercent, minWidthAbsolute);
      if (rect.width < minWidth) {
        debugLog(`EXCLUDED by min width: ${rect.width}px < ${Math.round(minWidth)}px (40% of ${viewportWidth}px or 500px floor)`);
        return 0;
      }

      // Exclude sidebar panels - multiple detection strategies
      const hasBgBg = classes.indexOf('bg-bg-') !== -1;
      const hasBorderR = classes.indexOf('border-r-[') !== -1 || classes.indexOf('border-r ') !== -1;
      const hasFlexShrink = classes.indexOf('flex-shrink-0') !== -1;
      const isNarrowLeftPanel = rect.left < 50 && rect.width < 800 && rect.width < window.innerWidth * 0.6;
      // Additional: containers less than 40% of viewport width at left edge are likely sidebars
      const isSidebarWidth = rect.left < 100 && rect.width < window.innerWidth * 0.4;

      // Log what we're checking for sidebar detection
      if (hasBgBg || hasBorderR || hasFlexShrink || isNarrowLeftPanel || isSidebarWidth) {
        debugLog(`Sidebar check: w=${rect.width}, left=${rect.left}, bgBg=${hasBgBg}, borderR=${hasBorderR}, flexShrink=${hasFlexShrink}, narrowLeft=${isNarrowLeftPanel}, sidebarWidth=${isSidebarWidth}`);
      }

      // 1. Class-based: Claude Code Web sidebar has distinctive classes
      if (hasSidebarClass) {
        debugLog(`EXCLUDED by class pattern: ${rect.width}px wide`);
        return 0;
      }
      // 2. Position-based: left-edge panels narrower than main content
      if (isNarrowLeftPanel) {
        debugLog(`EXCLUDED by position: ${rect.left}px left, ${rect.width}px wide`);
        return 0;
      }
      // 3. Flex-shrink sidebar pattern (fixed-width sidebars under 800px)
      if (hasFlexShrink && rect.width < 800) {
        debugLog(`EXCLUDED by flex-shrink: ${rect.width}px wide`);
        return 0;
      }
      // 4. Narrow left-edge containers (< 40% of viewport at left edge)
      if (isSidebarWidth) {
        debugLog(`EXCLUDED by sidebar width: ${rect.left}px left, ${rect.width}px wide`);
        return 0;
      }

      // Score based on: scrollHeight + bonus for filling viewport + width preference
      let score = scrollHeight;

      // Bonus if container height is close to viewport height (main content area)
      const heightRatio = rect.height / viewportHeight;
      if (heightRatio > 0.5) score += 10000; // Big bonus for main content area
      if (heightRatio > 0.7) score += 20000;

      // Width bonus: strongly prefer wider containers (main content vs sidebar)
      // Main content is typically 50%+ of viewport width (viewportWidth declared above)
      const widthRatio = rect.width / viewportWidth;
      if (widthRatio > 0.4) score += 15000; // Significant bonus for wide containers
      if (widthRatio > 0.5) score += 25000; // Big bonus for main content width
      if (widthRatio > 0.6) score += 10000; // Extra bonus for really wide

      return score;
    }

    // Strategy 1: Try CSS class-based detection (Tailwind overflow classes)
    const overflowContainers = document.querySelectorAll(DOM_SELECTORS.container.primary);

    for (const container of overflowContainers) {
      const score = scoreContainer(container);
      if (score > bestScore) {
        best = container;
        bestScore = score;
      }
    }

    // Strategy 2: Scan divs with getComputedStyle (limited, for non-Tailwind containers)
    if (!best || bestScore < 10000) {
      const allDivs = document.querySelectorAll(DOM_SELECTORS.container.fallback);
      const maxDivsToCheck = Math.min(allDivs.length, 400);

      for (let i = 0; i < maxDivsToCheck; i++) {
        const container = allDivs[i];
        if (container.scrollHeight <= MIN_SCROLL_HEIGHT) continue;

        const rect = container.getBoundingClientRect();
        if (rect.width < MIN_CONTAINER_WIDTH || rect.height < MIN_CONTAINER_HEIGHT) continue;
        if (rect.left < SIDEBAR_MAX_LEFT && rect.width < SIDEBAR_MAX_WIDTH) continue;

        // Only check overflow if it could beat current best
        const potentialScore = container.scrollHeight + (rect.height / viewportHeight > 0.5 ? 30000 : 0);
        if (potentialScore > bestScore) {
          const style = getComputedStyle(container);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            const score = scoreContainer(container);
            if (score > bestScore) {
              best = container;
              bestScore = score;
            }
          }
        }
      }
    }

    if (best) {
      cachedContainer = best;
      const rect = best.getBoundingClientRect();
      debugLog(`Found container: ${best.scrollHeight}px scroll, ${Math.round(rect.width)}px wide, ${Math.round(rect.height)}px tall, score=${bestScore}, classes=${best.className.slice(0,50)}`);
    } else {
      if (detectionTimer) detectionTimer.complete();
      debugLog('No container found!');
    }
    return cachedContainer;
  }

  function getContentParent(container) {
    if (!container) return null;
    if (cachedContentParent && document.contains(cachedContentParent)) {
      return cachedContentParent;
    }

    let current = container;
    let bestParent = null;
    let bestChildCount = 0;

    for (let depth = 0; depth < MAX_CONTENT_DEPTH; depth++) {
      const children = [...current.children].filter(c => {
        if (c.tagName !== 'DIV') return false;
        if (c.id === PLACEHOLDER_ID) return false;
        if (c.classList.contains('claude-leash-hidden')) return false;
        const rect = c.getBoundingClientRect();
        return rect.height > MIN_CHILD_HEIGHT && rect.width > MIN_CHILD_WIDTH;
      });

      if (children.length > bestChildCount && children.length >= 2) {
        bestParent = current;
        bestChildCount = children.length;
      }

      const nextChild = [...current.children]
        .filter(c => c.tagName === 'DIV' && c.id !== PLACEHOLDER_ID)
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];

      if (nextChild && nextChild.scrollHeight > 100) {
        current = nextChild;
      } else {
        break;
      }
    }

    cachedContentParent = bestParent;
    if (bestParent) {
      debugLog(`Found content parent at depth with ${bestChildCount} children, classes=${bestParent.className.slice(0,50)}`);
    } else {
      debugLog('No content parent found!');
    }
    return bestParent;
  }

  function getContentChildren(contentParent) {
    if (!contentParent) return [];
    const contentConfig = DOM_SELECTORS.content;
    return [...contentParent.children].filter(c => {
      if (c.tagName !== contentConfig.validTag) return false;
      if (c.id === PLACEHOLDER_ID) return false;
      if (c.classList.contains('claude-leash-hidden')) return false;
      const rect = c.getBoundingClientRect();
      return rect.height > contentConfig.minHeight && rect.width > contentConfig.minWidth;
    });
  }

  // ============ Placeholder ============

  function createPlaceholder(hiddenHeight, hiddenCount) {
    const el = document.createElement('div');
    el.id = PLACEHOLDER_ID;
    const heightK = Math.round(hiddenHeight / 1000);
    el.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">
        ${heightK}k pixels hidden (${hiddenCount} blocks)
      </div>
      <div style="font-size: 11px; opacity: 0.8;">
        Click to restore
      </div>
    `;
    el.addEventListener('click', () => restoreAll());
    return el;
  }

  function updatePlaceholder() {
    if (placeholder && placeholder.parentElement) {
      const countEl = placeholder.querySelector('div');
      if (countEl) {
        const heightK = Math.round(totalHiddenHeight / 1000);
        countEl.innerHTML = `${heightK}k pixels hidden (${hiddenNodes.length} blocks)`;
      }
    }
  }

  // ============ Early Intervention - Hide as content loads ============

  function setupEarlyIntervention() {
    if (!reactHydrated) return;

    // Only setup once per session to prevent observer recreation loops
    if (earlyInterventionSetup && contentObserver) {
      return;
    }

    if (contentObserver) contentObserver.disconnect();

    const contentParent = cachedContentParent;
    if (!contentParent) {
      debugLog('Cannot setup early intervention: no content parent');
      return;
    }

    contentObserver = new MutationObserver((mutations) => {
      // Guard: skip if restoring, not collapsed, or disabled
      if (isRestoring || !currentSettings.isCollapsed || !isEnabledForCurrentInterface()) return;
      if (!reactHydrated) return;

      let hasNewContent = false;
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1 && node.tagName === 'DIV' &&
                node.id !== PLACEHOLDER_ID && !node.classList.contains('claude-leash-hidden')) {
              hasNewContent = true;
            }
          });
        }
      });

      if (hasNewContent) {
        // Debounce: clear any pending collapse and schedule new one
        if (collapseDebounceTimer) {
          clearTimeout(collapseDebounceTimer);
        }
        collapseDebounceTimer = setTimeout(() => {
          collapseDebounceTimer = null;
          requestAnimationFrame(() => {
            applyCollapseQuick();
          });
        }, COLLAPSE_DEBOUNCE_MS);
      }
    });

    // PERF FIX: Only observe contentParent, not entire document.body
    // This dramatically reduces mutation callback frequency
    contentObserver.observe(contentParent, { childList: true, subtree: true });
    earlyInterventionSetup = true;
    debugLog('Early intervention setup: observing content parent only');
  }

  // Quick collapse without full recalculation - CSS only, no DOM removal
  // PERF FIX: Batch all reads before writes to avoid layout thrashing
  function applyCollapseQuick() {
    if (isApplying || isRestoring || !reactHydrated) return;
    isApplying = true;

    // Disconnect observer during changes to prevent re-triggering
    const wasObserving = contentObserver !== null;
    if (contentObserver) {
      contentObserver.disconnect();
    }

    try {
      const contentParent = cachedContentParent || getContentParent(getScrollContainer());
      if (!contentParent) return;

      const children = getContentChildren(contentParent);
      if (children.length === 0) return;

      const maxHeight = currentSettings.maxHeight;

      // PHASE 1: Batch all reads (no writes here!)
      const heights = [];
      for (let i = 0; i < children.length; i++) {
        heights[i] = Math.round(children[i].offsetHeight || 0);
      }

      // Calculate cutoff index from reads
      let heightFromBottom = 0;
      let cutoffIndex = -1;
      for (let i = children.length - 1; i >= 0; i--) {
        heightFromBottom += heights[i];
        if (heightFromBottom > maxHeight) {
          cutoffIndex = i;
          break;
        }
      }

      // PHASE 2: Batch all writes (no reads here!)
      if (cutoffIndex >= 0) {
        const nodesToHide = [];
        for (let j = 0; j <= cutoffIndex; j++) {
          const node = children[j];
          if (!node.classList.contains('claude-leash-hidden')) {
            nodesToHide.push({ node, height: heights[j] });
          }
        }

        // Apply all class changes in one batch
        if (nodesToHide.length > 0) {
          for (const item of nodesToHide) {
            item.node.classList.add('claude-leash-hidden');
            hiddenNodes.push(item);
            totalHiddenHeight += item.height;
          }
        }
      }

      // Update placeholder (single DOM write)
      if (hiddenNodes.length > 0 && (!placeholder || !placeholder.parentElement)) {
        placeholder = createPlaceholder(totalHiddenHeight, hiddenNodes.length);
        contentParent.insertBefore(placeholder, contentParent.firstChild);
        // Setup IntersectionObserver for smooth progressive restore
        setupPlaceholderObserver();
      } else if (placeholder) {
        updatePlaceholder();
      }
    } finally {
      isApplying = false;
      // Reconnect observer after changes complete
      if (wasObserving && cachedContentParent) {
        contentObserver.observe(cachedContentParent, { childList: true, subtree: true });
      }
    }
  }

  // ============ Core Logic ============

  function applyCollapse(maxHeight, isCollapsed, enableClaudeAi, enableClaudeCode) {
    if (isApplying) return { success: true };
    isApplying = true;

    // Start performance timer
    const hideTimer = perfMonitor.startTimer('hideLatency');

    try {
      currentSettings.maxHeight = maxHeight;
      currentSettings.isCollapsed = isCollapsed;
      if (enableClaudeAi !== undefined) currentSettings.enableClaudeAi = enableClaudeAi;
      if (enableClaudeCode !== undefined) currentSettings.enableClaudeCode = enableClaudeCode;

      if (!isEnabledForCurrentInterface()) {
        restoreAll();
        return { success: true, disabled: true, total: 0, hidden: 0, visible: 0 };
      }

      if (!isCollapsed) {
        restoreAll();
        const container = getScrollContainer();
        const total = container ? Math.round(container.scrollHeight) : 0;
        updateBadge(total, total, false);
        saveSessionState();
        return { success: true, total, hidden: 0, visible: total };
      }

      const container = getScrollContainer();
      if (!container) {
        return { success: false, error: 'No scroll container found' };
      }

      const contentParent = getContentParent(container);
      if (!contentParent) {
        return { success: false, error: 'No content parent found' };
      }

      restoreAllSilent();

      const children = getContentChildren(contentParent);
      if (children.length === 0) {
        return { success: false, error: 'No content children found' };
      }

      const heights = children.map(el => Math.round(el.getBoundingClientRect().height));
      const totalHeight = heights.reduce((a, b) => a + b, 0);
      originalTotalHeight = Math.max(originalTotalHeight, totalHeight);

      let heightFromBottom = 0;
      let cutoffIndex = -1;

      for (let i = children.length - 1; i >= 0; i--) {
        heightFromBottom += heights[i];
        if (heightFromBottom > maxHeight) {
          cutoffIndex = i;
          break;
        }
      }

      let hiddenHeight = 0;

      if (cutoffIndex >= 0) {
        for (let i = 0; i <= cutoffIndex; i++) {
          const node = children[i];
          const height = heights[i];
          node.classList.add('claude-leash-hidden');
          hiddenNodes.push({ node, height });
          hiddenHeight += height;
        }

        totalHiddenHeight = hiddenHeight;

        if (!placeholder || !placeholder.parentElement) {
          placeholder = createPlaceholder(hiddenHeight, hiddenNodes.length);
          contentParent.insertBefore(placeholder, contentParent.firstChild);
          // Setup IntersectionObserver for smooth progressive restore
          setupPlaceholderObserver();
        } else {
          updatePlaceholder();
        }

        debugLog(`Hidden ${hiddenNodes.length} blocks (${Math.round(hiddenHeight/1000)}k px)`);
      }

      // Update content cache with TOTAL height (before hiding)
      sessionContentCache.set(currentSessionId, {
        blockCount: children.length,
        scrollHeight: totalHeight, // Use totalHeight, not container.scrollHeight (which is reduced after hiding)
        timestamp: Date.now()
      });

      setupEarlyIntervention();

      const visibleHeight = totalHeight - hiddenHeight;

      setTimeout(() => {
        updateBadge(Math.round(visibleHeight), Math.round(originalTotalHeight), true);
        saveSessionState();
      }, 50);

      // Complete performance measurement
      const latency = hideTimer.complete();
      debugLog(`Hide operation completed in ${latency.toFixed(2)}ms`);

      return {
        success: true,
        totalHeight: Math.round(originalTotalHeight),
        hiddenHeight: Math.round(hiddenHeight),
        visibleHeight: Math.round(visibleHeight),
        total: Math.round(originalTotalHeight),
        hidden: Math.round(hiddenHeight),
        visible: Math.round(visibleHeight),
        hiddenCount: hiddenNodes.length,
        latency: Math.round(latency)
      };
    } finally {
      isApplying = false;
    }
  }

  function restoreAll() {
    isRestoring = true;
    try {
      restoreAllSilent();
      const container = getScrollContainer();
      const total = container ? Math.round(container.scrollHeight) : 0;
      updateBadge(total, total, currentSettings.isCollapsed);
      saveSessionState();
    } finally {
      isRestoring = false;
    }
  }

  function restoreAllSilent() {
    if (hiddenNodes.length === 0) return;

    isRestoring = true;

    // Disconnect observer during restore to prevent re-triggering
    const wasObserving = contentObserver !== null;
    if (contentObserver) {
      contentObserver.disconnect();
    }

    try {
      if (placeholder && placeholder.parentElement) {
        placeholder.remove();
      }

      // Batch all class removals
      hiddenNodes.forEach(data => {
        data.node.classList.remove('claude-leash-hidden');
      });

      debugLog(`Restored ${hiddenNodes.length} blocks`);

      hiddenNodes = [];
      totalHiddenHeight = 0;
      placeholder = null;
    } finally {
      isRestoring = false;
      // Reconnect observer after restore
      if (wasObserving && cachedContentParent) {
        contentObserver.observe(cachedContentParent, { childList: true, subtree: true });
      }
    }
  }

  function restoreChunk(count = 5) {
    if (hiddenNodes.length === 0) return;

    isRestoring = true;
    try {
      const toRestore = hiddenNodes.splice(0, count);

      toRestore.forEach(data => {
        data.node.classList.remove('claude-leash-hidden');
        totalHiddenHeight -= data.height;
      });

      if (hiddenNodes.length === 0 && placeholder) {
        placeholder.remove();
        placeholder = null;
      } else {
        updatePlaceholder();
      }

      debugLog(`Restored ${toRestore.length} blocks, ${hiddenNodes.length} remaining`);
    } finally {
      isRestoring = false;
    }
  }

  // ============ Badge ============

  function updateBadge(visible, total, isCollapsed) {
    chrome.runtime.sendMessage({
      action: 'updateBadge',
      visible,
      total,
      isCollapsed
    }).catch(() => {});
  }

  // ============ Scroll Detection with IntersectionObserver ============

  let placeholderObserver = null;

  function setupScrollDetection() {
    let lastScrollTop = 0;
    let scrollThrottle = null;

    const checkScroll = () => {
      const container = getScrollContainer();
      if (!container || hiddenNodes.length === 0) return;

      const scrollTop = container.scrollTop;

      if (scrollTop < SCROLL_RESTORE_THRESHOLD && scrollTop < lastScrollTop) {
        restoreChunk(3);
      }

      lastScrollTop = scrollTop;
    };

    document.addEventListener('scroll', () => {
      if (scrollThrottle) return;
      scrollThrottle = setTimeout(() => {
        scrollThrottle = null;
        checkScroll();
      }, 100);
    }, true);
  }

  // Enhanced restore using IntersectionObserver - smoother than scroll-based
  function setupPlaceholderObserver() {
    // Clean up existing observer
    if (placeholderObserver) {
      placeholderObserver.disconnect();
      placeholderObserver = null;
    }

    if (!placeholder || !document.contains(placeholder)) return;

    // Create observer that triggers when placeholder becomes visible
    placeholderObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && hiddenNodes.length > 0) {
          // Placeholder is visible - user is scrolling up to see more content
          debugLog('Placeholder visible via IntersectionObserver, restoring chunk');
          restoreChunk(5); // Restore more messages when using IO

          // Re-setup observer if there are still hidden nodes
          if (hiddenNodes.length > 0 && placeholder && document.contains(placeholder)) {
            // Small delay to prevent rapid-fire restores
            setTimeout(() => setupPlaceholderObserver(), 100);
          }
        }
      });
    }, {
      root: getScrollContainer(), // Observe within the scroll container
      rootMargin: '100px 0px 0px 0px', // Trigger slightly before placeholder is fully visible
      threshold: 0.1 // Trigger when 10% visible
    });

    placeholderObserver.observe(placeholder);
    debugLog('IntersectionObserver attached to placeholder');
  }

  // ============ Session/URL Change Detection ============

  async function handleSessionChange() {
    const newSessionId = getSessionId();
    if (newSessionId === currentSessionId) return;

    const sessionTimer = perfMonitor.startTimer('sessionSwitchTime');
    debugLog(`Session change ${currentSessionId} -> ${newSessionId}`);

    // Cancel any pending detection from previous session
    if (currentAbortController) {
      currentAbortController.abort();
      debugLog('Aborted previous session detection');
    }
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    // Save current session state
    saveSessionState();

    // Reset state
    hiddenNodes = [];
    totalHiddenHeight = 0;
    placeholder = null;
    cachedContainer = null;
    cachedContentParent = null;
    originalTotalHeight = 0;
    earlyInterventionSetup = false;
    currentSessionId = newSessionId;

    // Load session states from storage
    const sessionStates = await loadSessionStates();
    const prevState = sessionStates[newSessionId];
    const shouldCollapse = currentSettings.isCollapsed || (prevState && prevState.isCollapsed);

    if (!shouldCollapse || !isEnabledForCurrentInterface() || !reactHydrated) {
      sessionTimer.complete();
      return;
    }

    // Check content cache for fast path
    const cachedContent = sessionContentCache.get(newSessionId);

    if (cachedContent) {
      // Fast path: we have cached content info for this session
      // Wait up to 1.5s for content to reach at least 50% of cached height
      debugLog(`Trying fast path for cached session (${Math.round(cachedContent.scrollHeight/1000)}k px cached)`);

      const fastPathStart = Date.now();
      const fastPathTimeout = 1500; // 1.5 seconds max
      const minMatchThreshold = 0.5; // Accept 50% match for fast path

      // Only force refresh container detection once, then reuse cache
      let container = getScrollContainer(true);

      while (Date.now() - fastPathStart < fastPathTimeout) {
        if (signal.aborted) return;

        await sleep(100);

        // Reuse cached container, only refresh if not found
        if (!container || !document.contains(container)) {
          container = getScrollContainer(true);
        }

        if (container) {
          const currentHeight = container.scrollHeight;
          const heightRatio = currentHeight / cachedContent.scrollHeight;

          if (heightRatio >= minMatchThreshold) {
            // Content has loaded enough - apply collapse immediately
            debugLog(`Fast path hit! (${Math.round(currentHeight/1000)}k / ${Math.round(cachedContent.scrollHeight/1000)}k = ${(heightRatio * 100).toFixed(0)}%)`);
            applyCollapse(currentSettings.maxHeight, true);
            sessionTimer.complete();
            return;
          }
        }
      }

      // Fast path timed out, fall through to slow path
      debugLog(`Fast path timeout, using slow path`);
    }

    // Slow path: wait for content to load and stabilize
    try {
      await waitForContent(signal);
      if (signal.aborted) {
        sessionTimer.complete();
        return;
      }

      if (currentSettings.isCollapsed) {
        applyCollapse(currentSettings.maxHeight, true);
      }
      sessionTimer.complete();
    } catch (e) {
      sessionTimer.complete();
      if (e.name === 'AbortError') {
        debugLog('Content detection aborted');
      } else {
        debugLog('Error during content detection:', e.message);
      }
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function watchUrlChanges() {
    // 1. History API hooks (preferred - more responsive)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      historyApiTriggered = true;
      setTimeout(handleSessionChange, SESSION_CHANGE_DELAY_MS);
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      historyApiTriggered = true;
      setTimeout(handleSessionChange, SESSION_CHANGE_DELAY_MS);
    };

    window.addEventListener('popstate', () => {
      historyApiTriggered = true;
      setTimeout(handleSessionChange, SESSION_CHANGE_DELAY_MS);
    });

    // 2. Polling fallback (only if History API doesn't trigger)
    pollingIntervalId = setInterval(() => {
      // If History API has been working, we can rely less on polling
      // But keep it as a safety net
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (!historyApiTriggered) {
          // Only handle if History API didn't already catch it
          handleSessionChange();
        }
        historyApiTriggered = false; // Reset for next change
      }
    }, POLLING_INTERVAL_MS);
  }

  // ============ Wait for Content ============

  function waitForContent(signal) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      let lastScrollHeight = 0;
      let stableCount = 0;

      // Clear caches once at start, then reuse container
      cachedContainer = null;
      cachedContentParent = null;
      let container = null;

      const checkContent = () => {
        // Check if aborted
        if (signal && signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }

        attempts++;

        // Get container (only force refresh if not found or every 10 attempts)
        if (!container || !document.contains(container) || attempts % 10 === 0) {
          container = getScrollContainer(true);
          cachedContentParent = null; // Reset content parent when container changes
        }

        if (container) {
          const currentHeight = container.scrollHeight;
          const contentParent = getContentParent(container);
          const children = contentParent ? getContentChildren(contentParent) : [];

          if (attempts % 5 === 0) {
            debugLog(`Checking content... (${children.length} blocks, ${Math.round(currentHeight/1000)}k px, attempt ${attempts})`);
          }

          if (currentHeight > MIN_SCROLL_HEIGHT && children.length >= 1) {
            if (currentHeight === lastScrollHeight) {
              stableCount++;

              const hasEnoughContent = currentHeight >= MIN_HEIGHT_FOR_COLLAPSE && children.length >= MIN_BLOCKS_FOR_COLLAPSE;
              const waitedLongEnough = attempts >= 20 && stableCount >= STABLE_THRESHOLD;

              if (stableCount >= STABLE_THRESHOLD && (hasEnoughContent || waitedLongEnough)) {
                debugLog(`Content ready (${children.length} blocks, ${Math.round(currentHeight/1000)}k px)`);

                // Update content cache
                sessionContentCache.set(currentSessionId, {
                  blockCount: children.length,
                  scrollHeight: currentHeight,
                  timestamp: Date.now()
                });

                resolve();
                return;
              }
            } else {
              stableCount = 0;
            }
            lastScrollHeight = currentHeight;
          }
        }

        if (attempts < MAX_CONTENT_ATTEMPTS) {
          setTimeout(checkContent, CONTENT_CHECK_INTERVAL_MS);
        } else {
          const container = getScrollContainer();
          const contentParent = container ? getContentParent(container) : null;
          const children = contentParent ? getContentChildren(contentParent) : [];
          debugLog(`Timeout, proceeding with current content (${children.length} blocks, ${Math.round((container?.scrollHeight || 0)/1000)}k px)`);
          resolve();
        }
      };

      setTimeout(checkContent, CONTENT_CHECK_INTERVAL_MS);
    });
  }

  // ============ Message Handler ============

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Validate incoming message
    const validation = validateMessage(message);
    if (!validation.valid) {
      console.warn('Claude Leash: Invalid message received:', validation.error);
      sendResponse({ success: false, error: validation.error });
      return true;
    }

    try {
      switch (message.action) {
        case 'collapse':
          const height = message.maxHeight || (message.maxLines * 24);
          const result = applyCollapse(
            height,
            message.isCollapsed,
            message.enableClaudeAi,
            message.enableClaudeCode
          );
          sendResponse(result);
          break;

        case 'getStatus':
        case 'reportStatus':
          const statusContainer = getScrollContainer();
          const statusTotalHeight = statusContainer ? Math.round(statusContainer.scrollHeight) : 0;
          const fullTotal = Math.round(statusTotalHeight + totalHiddenHeight);
          const visibleNow = Math.round(statusTotalHeight);

          updateBadge(visibleNow, fullTotal, currentSettings.isCollapsed);

          sendResponse({
            success: true,
            total: fullTotal,
            totalHeight: fullTotal,
            visible: visibleNow,
            visibleHeight: visibleNow,
            hidden: Math.round(totalHiddenHeight),
            hiddenHeight: Math.round(totalHiddenHeight),
            hiddenCount: hiddenNodes.length
          });
          break;

        case 'debug':
          cachedContainer = null;
          cachedContentParent = null;
          const cont = getScrollContainer(true);
          console.log('Claude Leash DEBUG:');
          console.log('  Interface:', isClaudeCode() ? 'Claude Code Web' : 'Claude.ai');
          console.log('  Session ID:', currentSessionId);
          console.log('  React hydrated:', reactHydrated);
          console.log('  Hidden nodes:', hiddenNodes.length);
          console.log('  Hidden height:', totalHiddenHeight);
          console.log('  Content cache size:', sessionContentCache.size);
          console.log('  History API triggered:', historyApiTriggered);

          if (cont) {
            cont.style.outline = '3px solid red';
            const contentParent = getContentParent(cont);
            if (contentParent) {
              contentParent.style.outline = '3px solid orange';
              const children = getContentChildren(contentParent);
              console.log('  Content children:', children.length);

              setTimeout(() => {
                cont.style.outline = '';
                contentParent.style.outline = '';
              }, 3000);
            }

            sendResponse({
              success: true,
              found: getContentChildren(contentParent).length,
              scrollHeight: Math.round(cont.scrollHeight),
              hiddenCount: hiddenNodes.length,
              sessionId: currentSessionId,
              reactHydrated,
              cacheSize: sessionContentCache.size
            });
          } else {
            sendResponse({ success: false, error: 'No container found' });
          }
          break;

        case 'restore':
          restoreAll();
          sendResponse({ success: true });
          break;

        case 'setDebugMode':
          DEBUG_MODE = message.enabled === true;
          debugLog(`Debug mode ${DEBUG_MODE ? 'enabled' : 'disabled'}`);
          sendResponse({ success: true, debugMode: DEBUG_MODE });
          break;

        case 'getMetrics':
          const metricsData = perfMonitor.exportMetrics();
          sendResponse({ success: true, metrics: metricsData });
          break;

        case 'showMetrics':
          perfMonitor.displayDashboard();
          sendResponse({ success: true });
          break;

        case 'measureFPS':
          perfMonitor.measureFPS(message.duration || 3000);
          sendResponse({ success: true, message: 'FPS measurement started' });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (e) {
      console.error('Claude Leash error:', e);
      sendResponse({ success: false, error: e.message });
    }
    return true;
  });

  // ============ Init ============

  async function init() {
    // Run storage migration if needed
    await migrateStorageIfNeeded();

    await loadSettings();
    await perfMonitor.loadMetrics();
    currentSessionId = getSessionId();

    setupScrollDetection();
    watchUrlChanges();

    // Wait for React to finish hydrating before manipulating DOM
    await waitForReactHydration();
    debugLog('React hydration complete, safe to manipulate DOM');

    // Initialize abort controller
    currentAbortController = new AbortController();

    // Wait for actual content to appear
    try {
      await waitForContent(currentAbortController.signal);
    } catch (e) {
      if (e.name !== 'AbortError') {
        debugLog('Init content wait error:', e.message);
      }
    }

    // Apply collapse if enabled
    if (currentSettings.isCollapsed && isEnabledForCurrentInterface()) {
      applyCollapse(currentSettings.maxHeight, true);
    }

    // Initial badge update
    const container = getScrollContainer();
    const totalHeight = container ? Math.round(container.scrollHeight) : 0;
    updateBadge(totalHeight, totalHeight, currentSettings.isCollapsed);
  }

  init();
})();
