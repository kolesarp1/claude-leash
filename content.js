// Claude Leash - Content Script v4.0.0
// Virtual scrolling for real performance improvement
(function() {
  'use strict';

  // ============ Constants ============
  const STORAGE_KEY = 'claudeCollapseSettings';
  const SESSION_KEY = 'claudeLeashSessions';
  const METRICS_KEY = 'claudeLeashMetrics';
  const STYLE_ID = 'claude-leash-styles';

  // Storage version for migrations
  const STORAGE_VERSION = 2;

  // Timing constants
  const POLLING_INTERVAL_MS = 300;
  const CONTENT_CHECK_INTERVAL_MS = 200;
  const MAX_CONTENT_ATTEMPTS = 40;
  const STABLE_THRESHOLD = 3;
  const SESSION_CHANGE_DELAY_MS = 50;
  const SCROLL_THROTTLE_MS = 16; // ~60fps
  const RESIZE_DEBOUNCE_MS = 100;

  // Size constants
  const MIN_SCROLL_HEIGHT = 500;
  const MIN_CONTAINER_WIDTH = 300;
  const MIN_CONTAINER_HEIGHT = 200;
  const SIDEBAR_MAX_LEFT = 150;
  const SIDEBAR_MAX_WIDTH = 400;
  const MIN_CHILD_HEIGHT = 20;
  const MIN_CHILD_WIDTH = 100;

  // Detection constants
  const MAX_CONTENT_DEPTH = 15;
  const MAX_SESSIONS_STORED = 50;
  const MAX_DIVS_TO_CHECK = 400;

  // Virtual scrolling constants
  const DEFAULT_BUFFER_SIZE = 3; // Messages above/below viewport
  const DEFAULT_ESTIMATED_HEIGHT = 300; // Default message height estimate
  const VIRTUALIZATION_THRESHOLD = 20; // Minimum messages to virtualize

  // UI timing constants
  const BADGE_UPDATE_DELAY_MS = 50;
  const DEBUG_HIGHLIGHT_DURATION_MS = 3000;
  const METRICS_SAVE_DEBOUNCE_MS = 5000;
  const REACT_HYDRATION_TIMEOUT_MS = 3000;
  const REACT_HYDRATION_FALLBACK_MS = 2000;
  const FPS_MEASUREMENT_DURATION_MS = 3000;

  // ============ DOM Selectors Configuration ============
  const DOM_SELECTORS = {
    container: {
      primary: '[class*="overflow-y-auto"], [class*="overflow-auto"], [class*="overflow-y-scroll"]',
      fallback: 'div'
    },
    sidebar: {
      classPatterns: ['bg-bg-', 'border-r-[', 'border-r ', 'flex-shrink-0'],
      maxLeftPosition: 50,
      maxWidth: 800,
      viewportWidthRatio: 0.6
    },
    content: {
      validTag: 'DIV',
      minHeight: 10,
      minWidth: 50
    }
  };

  // ============ Utilities ============

  function debounce(fn, ms) {
    let timer = null;
    return function(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn.apply(this, args);
      }, ms);
    };
  }

  function throttle(fn, ms) {
    let lastCall = 0;
    let scheduled = null;
    return function(...args) {
      const now = Date.now();
      const remaining = ms - (now - lastCall);

      if (remaining <= 0) {
        if (scheduled) {
          cancelAnimationFrame(scheduled);
          scheduled = null;
        }
        lastCall = now;
        fn.apply(this, args);
      } else if (!scheduled) {
        scheduled = requestAnimationFrame(() => {
          scheduled = null;
          lastCall = Date.now();
          fn.apply(this, args);
        });
      }
    };
  }

  // Debug mode (loaded from storage, default false)
  let DEBUG_MODE = false;

  function debugLog(...args) {
    if (DEBUG_MODE) {
      console.log('Claude Leash DEBUG:', ...args);
    }
  }

  // ============ Message Validation ============
  function validateMessage(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }
    if (!message.action || typeof message.action !== 'string') {
      return { valid: false, error: 'Missing or invalid action' };
    }
    if (message.bufferSize !== undefined) {
      if (typeof message.bufferSize !== 'number' || message.bufferSize < 1 || message.bufferSize > 20) {
        return { valid: false, error: 'bufferSize must be number between 1-20' };
      }
    }
    if (message.isEnabled !== undefined && typeof message.isEnabled !== 'boolean') {
      return { valid: false, error: 'isEnabled must be boolean' };
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
  const perfMonitor = {
    metrics: {
      fps: [],
      virtualizeLatency: [],
      renderLatency: [],
      containerDetectionTime: [],
      sessionSwitchTime: []
    },
    maxSamples: 100,

    measureFPS(duration = FPS_MEASUREMENT_DURATION_MS) {
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
          debugLog(`FPS measurement: ${fps} fps over ${Math.round(elapsed)}ms`);
        }
      };

      requestAnimationFrame(countFrame);
    },

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

    recordMetric(type, value) {
      if (!this.metrics[type]) {
        this.metrics[type] = [];
      }

      this.metrics[type].push({
        value,
        timestamp: Date.now()
      });

      if (this.metrics[type].length > this.maxSamples) {
        this.metrics[type].shift();
      }

      this.saveMetricsDebounced();
    },

    saveMetricsDebounced() {
      if (this._saveTimeout) return;
      this._saveTimeout = setTimeout(() => {
        this._saveTimeout = null;
        this.saveMetrics();
      }, METRICS_SAVE_DEBOUNCE_MS);
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
        debugLog('Failed to save metrics:', e.message);
      }
    },

    async loadMetrics() {
      try {
        const result = await chrome.storage.local.get(METRICS_KEY);
        if (result[METRICS_KEY]?.metrics) {
          this.metrics = result[METRICS_KEY].metrics;
        }
      } catch (e) {
        debugLog('Failed to load metrics:', e.message);
      }
    },

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

  // ============ Virtual Message List ============
  // This is the core of the extension - actual virtual scrolling
  // that removes messages from DOM to free memory and reduce GC

  class VirtualMessageList {
    constructor(contentParent, scrollContainer, options = {}) {
      this.contentParent = contentParent;
      this.scrollContainer = scrollContainer;

      // Configuration
      this.bufferSize = options.buffer || DEFAULT_BUFFER_SIZE;
      this.estimatedHeight = options.itemHeight || DEFAULT_ESTIMATED_HEIGHT;

      // State
      this.messages = [];           // Serialized message data
      this.heights = new Map();     // Measured heights: index -> px
      this.renderedRange = { start: 0, end: 0 };
      this.isUpdating = false;
      this.originalScrollTop = 0;

      // DOM structure
      this.topSpacer = null;
      this.bottomSpacer = null;
      this.contentWrapper = null;

      // Observers
      this.resizeObserver = null;
      this.mutationObserver = null;

      // Bound methods for event listeners
      this._handleScroll = throttle(this.handleScroll.bind(this), SCROLL_THROTTLE_MS);
      this._handleResize = debounce(this.handleResize.bind(this), RESIZE_DEBOUNCE_MS);

      debugLog('VirtualMessageList created with buffer:', this.bufferSize);
    }

    init() {
      const timer = perfMonitor.startTimer('virtualizeLatency');

      try {
        // Capture existing messages before virtualizing
        const children = [...this.contentParent.children].filter(el => {
          if (el.tagName !== 'DIV') return false;
          const rect = el.getBoundingClientRect();
          return rect.height > MIN_CHILD_HEIGHT && rect.width > MIN_CHILD_WIDTH;
        });

        if (children.length < VIRTUALIZATION_THRESHOLD) {
          debugLog(`Only ${children.length} messages, skipping virtualization (threshold: ${VIRTUALIZATION_THRESHOLD})`);
          return false;
        }

        debugLog(`Virtualizing ${children.length} messages`);

        // Measure all heights upfront (one-time cost)
        this.messages = children.map((el, index) => {
          const height = el.offsetHeight;
          this.heights.set(index, height);

          return {
            index,
            height,
            html: el.outerHTML,
            // Store key attributes for identification
            className: el.className,
            dataAttrs: this.extractDataAttrs(el)
          };
        });

        // Calculate total height for spacers
        const totalHeight = this.getTotalHeight();

        // Save scroll position
        this.originalScrollTop = this.scrollContainer.scrollTop;

        // Create virtual structure
        this.topSpacer = document.createElement('div');
        this.topSpacer.id = 'claude-leash-top-spacer';
        this.topSpacer.style.cssText = 'height: 0px; width: 100%; flex-shrink: 0;';

        this.bottomSpacer = document.createElement('div');
        this.bottomSpacer.id = 'claude-leash-bottom-spacer';
        this.bottomSpacer.style.cssText = 'height: 0px; width: 100%; flex-shrink: 0;';

        this.contentWrapper = document.createElement('div');
        this.contentWrapper.id = 'claude-leash-content';
        this.contentWrapper.style.cssText = 'width: 100%;';

        // Replace content with virtual structure
        this.contentParent.innerHTML = '';
        this.contentParent.appendChild(this.topSpacer);
        this.contentParent.appendChild(this.contentWrapper);
        this.contentParent.appendChild(this.bottomSpacer);

        // Initial render
        this.updateVisibleRange(true);

        // Restore scroll position
        this.scrollContainer.scrollTop = this.originalScrollTop;

        // Listen for scroll
        this.scrollContainer.addEventListener('scroll', this._handleScroll, { passive: true });

        // Listen for resize
        this.resizeObserver = new ResizeObserver(this._handleResize);
        this.resizeObserver.observe(this.scrollContainer);

        // Watch for new messages being added
        this.setupMutationObserver();

        const latency = timer.complete();
        debugLog(`Virtualization complete in ${latency.toFixed(2)}ms, ${this.messages.length} messages stored`);

        return true;
      } catch (e) {
        timer.complete();
        console.error('Claude Leash: Virtualization failed:', e);
        return false;
      }
    }

    extractDataAttrs(el) {
      const attrs = {};
      for (const attr of el.attributes) {
        if (attr.name.startsWith('data-')) {
          attrs[attr.name] = attr.value;
        }
      }
      return attrs;
    }

    getTotalHeight() {
      let total = 0;
      for (let i = 0; i < this.messages.length; i++) {
        total += this.heights.get(i) || this.estimatedHeight;
      }
      return total;
    }

    getHeightUpTo(index) {
      let height = 0;
      for (let i = 0; i < index; i++) {
        height += this.heights.get(i) || this.estimatedHeight;
      }
      return height;
    }

    getHeightFrom(index) {
      let height = 0;
      for (let i = index; i < this.messages.length; i++) {
        height += this.heights.get(i) || this.estimatedHeight;
      }
      return height;
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
      accumulatedHeight = this.getHeightUpTo(startIndex);

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

    updateVisibleRange(force = false) {
      if (this.isUpdating && !force) return;
      this.isUpdating = true;

      const renderTimer = perfMonitor.startTimer('renderLatency');

      try {
        const newRange = this.getVisibleRange();

        // Skip if range unchanged
        if (!force &&
            newRange.start === this.renderedRange.start &&
            newRange.end === this.renderedRange.end) {
          this.isUpdating = false;
          renderTimer.complete();
          return;
        }

        // Calculate spacer heights
        const topHeight = this.getHeightUpTo(newRange.start);
        const bottomHeight = this.getHeightFrom(newRange.end + 1);

        // Update spacers
        this.topSpacer.style.height = `${topHeight}px`;
        this.bottomSpacer.style.height = `${bottomHeight}px`;

        // Render visible messages
        this.contentWrapper.innerHTML = '';

        for (let i = newRange.start; i <= newRange.end; i++) {
          const msg = this.messages[i];
          if (!msg) continue;

          // Re-create element from stored HTML
          const wrapper = document.createElement('div');
          wrapper.innerHTML = msg.html;
          const messageEl = wrapper.firstElementChild;

          if (messageEl) {
            // Mark as virtualized for identification
            messageEl.dataset.virtualIndex = i.toString();
            this.contentWrapper.appendChild(messageEl);

            // Update measured height after render
            requestAnimationFrame(() => {
              if (messageEl.offsetHeight > 0) {
                this.heights.set(i, messageEl.offsetHeight);
              }
            });
          }
        }

        this.renderedRange = newRange;

        const latency = renderTimer.complete();
        debugLog(`Rendered messages ${newRange.start}-${newRange.end} in ${latency.toFixed(2)}ms`);

      } finally {
        this.isUpdating = false;
      }
    }

    handleScroll() {
      this.updateVisibleRange();
    }

    handleResize() {
      this.updateVisibleRange(true);
    }

    setupMutationObserver() {
      // Watch the scroll container for new messages being added
      // This handles Claude's streaming responses
      this.mutationObserver = new MutationObserver((mutations) => {
        // For now, we don't handle dynamic additions during virtualization
        // New messages would require re-capturing the content
        // This is a limitation - user needs to toggle off/on for new messages
      });

      // Don't observe while virtualized - it would conflict
      // this.mutationObserver.observe(this.contentParent, { childList: true });
    }

    // Called when user wants to restore original content
    destroy() {
      debugLog('Destroying virtual scroller, restoring original content');

      // Remove event listeners
      this.scrollContainer.removeEventListener('scroll', this._handleScroll);

      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }

      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }

      // Save scroll position relative to content
      const scrollRatio = this.scrollContainer.scrollTop / this.getTotalHeight();

      // Restore original content
      this.contentParent.innerHTML = '';

      for (const msg of this.messages) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = msg.html;
        const el = wrapper.firstElementChild;
        if (el) {
          this.contentParent.appendChild(el);
        }
      }

      // Restore approximate scroll position
      requestAnimationFrame(() => {
        const newTotal = this.contentParent.scrollHeight;
        this.scrollContainer.scrollTop = scrollRatio * newTotal;
      });

      // Clear state
      this.messages = [];
      this.heights.clear();
      this.renderedRange = { start: 0, end: 0 };
      this.topSpacer = null;
      this.bottomSpacer = null;
      this.contentWrapper = null;

      debugLog('Virtual scroller destroyed');
    }

    // Get current status for badge/UI
    getStatus() {
      const totalMessages = this.messages.length;
      const renderedMessages = this.renderedRange.end - this.renderedRange.start + 1;
      const hiddenMessages = totalMessages - renderedMessages;
      const totalHeight = this.getTotalHeight();
      const renderedHeight = this.getHeightFrom(this.renderedRange.start) -
                             this.getHeightFrom(this.renderedRange.end + 1);

      return {
        totalMessages,
        renderedMessages,
        hiddenMessages,
        totalHeight: Math.round(totalHeight),
        renderedHeight: Math.round(renderedHeight),
        memoryReduction: totalMessages > 0 ?
          Math.round((1 - renderedMessages / totalMessages) * 100) : 0
      };
    }
  }

  // ============ State ============

  // Settings
  let currentSettings = {
    isEnabled: true, // Virtual scrolling enabled
    bufferSize: DEFAULT_BUFFER_SIZE,
    enableClaudeAi: false,
    enableClaudeCode: true
  };

  // Cache
  let cachedContainer = null;
  let cachedContentParent = null;

  // Virtual scroller instance
  let virtualScroller = null;

  // Process flags
  let reactHydrated = false;
  let historyApiTriggered = false;

  // Navigation/Session
  let lastUrl = location.href;
  let currentSessionId = null;

  // Cleanup tracking
  let pollingIntervalId = null;
  let currentAbortController = null;

  // ============ CSS Injection ============

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Virtual scroller spacers */
      #claude-leash-top-spacer,
      #claude-leash-bottom-spacer {
        pointer-events: none;
        background: transparent;
      }

      /* Status indicator when virtualized */
      #claude-leash-status {
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 8px 16px;
        background: rgba(139, 92, 246, 0.9);
        color: white;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        z-index: 9999;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.3s;
      }

      #claude-leash-status.visible {
        opacity: 1;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  injectStyles();

  // ============ Settings ============

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY]);
      if (result[STORAGE_KEY]) {
        // Support migration from old format
        if (result[STORAGE_KEY].isCollapsed !== undefined) {
          currentSettings.isEnabled = result[STORAGE_KEY].isCollapsed;
        }
        if (result[STORAGE_KEY].isEnabled !== undefined) {
          currentSettings.isEnabled = result[STORAGE_KEY].isEnabled;
        }
        if (result[STORAGE_KEY].bufferSize) {
          currentSettings.bufferSize = result[STORAGE_KEY].bufferSize;
        }
        currentSettings.enableClaudeCode = result[STORAGE_KEY].enableClaudeCode !== false;
        currentSettings.enableClaudeAi = result[STORAGE_KEY].enableClaudeAi === true;
        DEBUG_MODE = result[STORAGE_KEY].debugMode === true;
      }
    } catch (e) {
      debugLog('Failed to load settings, using defaults:', e.message);
    }
  }

  async function saveSettings() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: {
          version: STORAGE_VERSION,
          isEnabled: currentSettings.isEnabled,
          bufferSize: currentSettings.bufferSize,
          enableClaudeAi: currentSettings.enableClaudeAi,
          enableClaudeCode: currentSettings.enableClaudeCode,
          debugMode: DEBUG_MODE
        }
      });
    } catch (e) {
      debugLog('Failed to save settings:', e.message);
    }
  }

  function getSessionId() {
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
        }, { timeout: REACT_HYDRATION_TIMEOUT_MS });
      } else {
        setTimeout(() => {
          reactHydrated = true;
          resolve();
        }, REACT_HYDRATION_FALLBACK_MS);
      }
    });
  }

  // ============ Container Detection ============

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

    function scoreContainer(container) {
      const rect = container.getBoundingClientRect();
      const scrollHeight = container.scrollHeight;
      const classes = String(container.className || '');

      if (rect.width < MIN_CONTAINER_WIDTH || rect.height < MIN_CONTAINER_HEIGHT) return 0;
      if (rect.left < SIDEBAR_MAX_LEFT && rect.width < SIDEBAR_MAX_WIDTH) return 0;
      if (scrollHeight <= MIN_SCROLL_HEIGHT) return 0;

      const viewportWidth = window.innerWidth;
      const minWidthPercent = viewportWidth * 0.4;
      const minWidthAbsolute = 500;
      const minWidth = Math.max(minWidthPercent, minWidthAbsolute);
      if (rect.width < minWidth) {
        return 0;
      }

      const sidebarConfig = DOM_SELECTORS.sidebar;
      const hasSidebarClass = sidebarConfig.classPatterns.some(pattern => classes.indexOf(pattern) !== -1);
      const hasFlexShrink = classes.indexOf('flex-shrink-0') !== -1;
      const isNarrowLeftPanel = rect.left < sidebarConfig.maxLeftPosition &&
                                rect.width < sidebarConfig.maxWidth &&
                                rect.width < window.innerWidth * sidebarConfig.viewportWidthRatio;
      const isSidebarWidth = rect.left < 100 && rect.width < window.innerWidth * 0.4;

      if (hasSidebarClass || isNarrowLeftPanel || (hasFlexShrink && rect.width < 800) || isSidebarWidth) {
        return 0;
      }

      let score = scrollHeight;
      const heightRatio = rect.height / viewportHeight;
      if (heightRatio > 0.5) score += 10000;
      if (heightRatio > 0.7) score += 20000;

      const widthRatio = rect.width / viewportWidth;
      if (widthRatio > 0.4) score += 15000;
      if (widthRatio > 0.5) score += 25000;
      if (widthRatio > 0.6) score += 10000;

      return score;
    }

    const overflowContainers = document.querySelectorAll(DOM_SELECTORS.container.primary);

    for (const container of overflowContainers) {
      const score = scoreContainer(container);
      if (score > bestScore) {
        best = container;
        bestScore = score;
      }
    }

    if (!best || bestScore < 10000) {
      const allDivs = document.querySelectorAll(DOM_SELECTORS.container.fallback);
      const maxDivsToCheck = Math.min(allDivs.length, MAX_DIVS_TO_CHECK);

      for (let i = 0; i < maxDivsToCheck; i++) {
        const container = allDivs[i];
        if (container.scrollHeight <= MIN_SCROLL_HEIGHT) continue;

        const rect = container.getBoundingClientRect();
        if (rect.width < MIN_CONTAINER_WIDTH || rect.height < MIN_CONTAINER_HEIGHT) continue;
        if (rect.left < SIDEBAR_MAX_LEFT && rect.width < SIDEBAR_MAX_WIDTH) continue;

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
      if (detectionTimer) {
        detectionTimer.complete();
      }
      debugLog(`Found container: ${best.scrollHeight}px scroll, score=${bestScore}`);
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
        if (c.id && c.id.startsWith('claude-leash-')) return false;
        const rect = c.getBoundingClientRect();
        return rect.height > MIN_CHILD_HEIGHT && rect.width > MIN_CHILD_WIDTH;
      });

      if (children.length > bestChildCount && children.length >= 2) {
        bestParent = current;
        bestChildCount = children.length;
      }

      const nextChild = [...current.children]
        .filter(c => c.tagName === 'DIV' && !(c.id && c.id.startsWith('claude-leash-')))
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];

      if (nextChild && nextChild.scrollHeight > 100) {
        current = nextChild;
      } else {
        break;
      }
    }

    cachedContentParent = bestParent;
    if (bestParent) {
      debugLog(`Found content parent with ${bestChildCount} children`);
    }
    return bestParent;
  }

  // ============ Core Virtual Scrolling Logic ============

  function enableVirtualScrolling() {
    if (virtualScroller) {
      debugLog('Virtual scroller already active');
      return { success: true, alreadyActive: true };
    }

    const container = getScrollContainer(true);
    if (!container) {
      return { success: false, error: 'No scroll container found' };
    }

    const contentParent = getContentParent(container);
    if (!contentParent) {
      return { success: false, error: 'No content parent found' };
    }

    // Check if already virtualized
    if (contentParent.querySelector('#claude-leash-content')) {
      debugLog('Content already virtualized');
      return { success: true, alreadyActive: true };
    }

    virtualScroller = new VirtualMessageList(contentParent, container, {
      buffer: currentSettings.bufferSize,
      itemHeight: DEFAULT_ESTIMATED_HEIGHT
    });

    const success = virtualScroller.init();

    if (!success) {
      virtualScroller = null;
      return { success: false, error: 'Virtualization failed - not enough messages' };
    }

    // Update badge
    const status = virtualScroller.getStatus();
    updateBadge(status.renderedMessages, status.totalMessages, true);

    debugLog('Virtual scrolling enabled');
    return {
      success: true,
      ...status
    };
  }

  function disableVirtualScrolling() {
    if (!virtualScroller) {
      debugLog('No virtual scroller to disable');
      return { success: true };
    }

    virtualScroller.destroy();
    virtualScroller = null;

    // Update badge
    const container = getScrollContainer();
    const totalHeight = container ? container.scrollHeight : 0;
    updateBadge(totalHeight, totalHeight, false);

    // Reset cache
    cachedContentParent = null;

    debugLog('Virtual scrolling disabled');
    return { success: true };
  }

  function toggleVirtualScrolling(enable) {
    if (enable) {
      return enableVirtualScrolling();
    } else {
      return disableVirtualScrolling();
    }
  }

  // ============ Badge ============

  function updateBadge(visible, total, isVirtualized) {
    chrome.runtime.sendMessage({
      action: 'updateBadge',
      visible,
      total,
      isCollapsed: isVirtualized // Reuse existing badge logic
    }).catch(() => {});
  }

  // ============ Session/URL Change Detection ============

  async function handleSessionChange() {
    const newSessionId = getSessionId();
    if (newSessionId === currentSessionId) return;

    const sessionTimer = perfMonitor.startTimer('sessionSwitchTime');
    debugLog(`Session change ${currentSessionId} -> ${newSessionId}`);

    // Cancel any pending operations
    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    // Disable current virtual scroller
    if (virtualScroller) {
      disableVirtualScrolling();
    }

    // Reset state
    cachedContainer = null;
    cachedContentParent = null;
    currentSessionId = newSessionId;

    // Wait for React and content
    if (!reactHydrated) {
      await waitForReactHydration();
    }

    if (!isEnabledForCurrentInterface()) {
      sessionTimer.complete();
      return;
    }

    // Wait for content to load
    try {
      await waitForContent(currentAbortController.signal);

      if (currentSettings.isEnabled && isEnabledForCurrentInterface()) {
        enableVirtualScrolling();
      }

      sessionTimer.complete();
    } catch (e) {
      sessionTimer.complete();
      if (e.name !== 'AbortError') {
        debugLog('Session change error:', e.message);
      }
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function watchUrlChanges() {
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

    pollingIntervalId = setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (!historyApiTriggered) {
          handleSessionChange();
        }
        historyApiTriggered = false;
      }
    }, POLLING_INTERVAL_MS);
  }

  // ============ Wait for Content ============

  function waitForContent(signal) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      let lastScrollHeight = 0;
      let stableCount = 0;

      cachedContainer = null;
      cachedContentParent = null;

      const checkContent = () => {
        if (signal && signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }

        attempts++;
        const container = getScrollContainer(attempts === 1 || attempts % 10 === 0);

        if (container) {
          const currentHeight = container.scrollHeight;
          const contentParent = getContentParent(container);
          const children = contentParent ? [...contentParent.children].filter(c =>
            c.tagName === 'DIV' && c.getBoundingClientRect().height > MIN_CHILD_HEIGHT
          ) : [];

          if (currentHeight > MIN_SCROLL_HEIGHT && children.length >= 1) {
            if (currentHeight === lastScrollHeight) {
              stableCount++;
              if (stableCount >= STABLE_THRESHOLD) {
                debugLog(`Content ready (${children.length} messages, ${Math.round(currentHeight/1000)}k px)`);
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
          debugLog(`Timeout, proceeding with current content`);
          resolve();
        }
      };

      setTimeout(checkContent, CONTENT_CHECK_INTERVAL_MS);
    });
  }

  // ============ Message Handler ============

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const validation = validateMessage(message);
    if (!validation.valid) {
      console.warn('Claude Leash: Invalid message received:', validation.error);
      sendResponse({ success: false, error: validation.error });
      return true;
    }

    try {
      switch (message.action) {
        case 'collapse':
        case 'toggle':
          // Handle toggle - 'isCollapsed' from popup means 'enable virtualization'
          const shouldEnable = message.isCollapsed !== undefined ? message.isCollapsed : message.isEnabled;

          if (message.enableClaudeAi !== undefined) {
            currentSettings.enableClaudeAi = message.enableClaudeAi;
          }
          if (message.enableClaudeCode !== undefined) {
            currentSettings.enableClaudeCode = message.enableClaudeCode;
          }
          if (message.bufferSize !== undefined) {
            currentSettings.bufferSize = message.bufferSize;
          }

          currentSettings.isEnabled = shouldEnable;

          if (!isEnabledForCurrentInterface()) {
            disableVirtualScrolling();
            sendResponse({ success: true, disabled: true });
            break;
          }

          const result = toggleVirtualScrolling(shouldEnable);

          if (result.success && virtualScroller) {
            const status = virtualScroller.getStatus();
            sendResponse({
              success: true,
              totalHeight: status.totalHeight,
              visibleHeight: status.renderedHeight,
              hiddenHeight: status.totalHeight - status.renderedHeight,
              total: status.totalMessages,
              visible: status.renderedMessages,
              hidden: status.hiddenMessages,
              memoryReduction: status.memoryReduction
            });
          } else {
            sendResponse(result);
          }
          break;

        case 'getStatus':
        case 'reportStatus':
          if (virtualScroller) {
            const status = virtualScroller.getStatus();
            updateBadge(status.renderedMessages, status.totalMessages, true);
            sendResponse({
              success: true,
              isVirtualized: true,
              total: status.totalMessages,
              totalHeight: status.totalHeight,
              visible: status.renderedMessages,
              visibleHeight: status.renderedHeight,
              hidden: status.hiddenMessages,
              hiddenHeight: status.totalHeight - status.renderedHeight,
              memoryReduction: status.memoryReduction
            });
          } else {
            const container = getScrollContainer();
            const totalHeight = container ? Math.round(container.scrollHeight) : 0;
            updateBadge(totalHeight, totalHeight, false);
            sendResponse({
              success: true,
              isVirtualized: false,
              total: totalHeight,
              totalHeight,
              visible: totalHeight,
              visibleHeight: totalHeight,
              hidden: 0,
              hiddenHeight: 0
            });
          }
          break;

        case 'debug':
          cachedContainer = null;
          cachedContentParent = null;
          const cont = getScrollContainer(true);
          console.log('Claude Leash DEBUG:');
          console.log('  Interface:', isClaudeCode() ? 'Claude Code Web' : 'Claude.ai');
          console.log('  Session ID:', currentSessionId);
          console.log('  React hydrated:', reactHydrated);
          console.log('  Virtual scroller active:', !!virtualScroller);

          if (virtualScroller) {
            const status = virtualScroller.getStatus();
            console.log('  Total messages:', status.totalMessages);
            console.log('  Rendered messages:', status.renderedMessages);
            console.log('  Memory reduction:', status.memoryReduction + '%');
          }

          if (cont) {
            cont.style.outline = '3px solid red';
            const contentParent = getContentParent(cont);
            if (contentParent) {
              contentParent.style.outline = '3px solid orange';
              setTimeout(() => {
                cont.style.outline = '';
                contentParent.style.outline = '';
              }, DEBUG_HIGHLIGHT_DURATION_MS);
            }

            sendResponse({
              success: true,
              scrollHeight: Math.round(cont.scrollHeight),
              isVirtualized: !!virtualScroller,
              sessionId: currentSessionId,
              reactHydrated
            });
          } else {
            sendResponse({ success: false, error: 'No container found' });
          }
          break;

        case 'restore':
          disableVirtualScrolling();
          sendResponse({ success: true });
          break;

        case 'setDebugMode':
          DEBUG_MODE = message.enabled === true;
          debugLog(`Debug mode ${DEBUG_MODE ? 'enabled' : 'disabled'}`);
          sendResponse({ success: true, debugMode: DEBUG_MODE });
          break;

        case 'getMetrics':
          sendResponse({ success: true, metrics: perfMonitor.exportMetrics() });
          break;

        case 'showMetrics':
          perfMonitor.displayDashboard();
          sendResponse({ success: true });
          break;

        case 'measureFPS':
          perfMonitor.measureFPS(message.duration || FPS_MEASUREMENT_DURATION_MS);
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

  // ============ Cleanup ============

  function cleanup() {
    if (virtualScroller) {
      virtualScroller.destroy();
      virtualScroller = null;
    }

    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
      pollingIntervalId = null;
    }

    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }

    debugLog('Cleanup complete');
  }

  window.addEventListener('beforeunload', cleanup);

  // ============ Init ============

  async function init() {
    await loadSettings();
    await perfMonitor.loadMetrics();
    currentSessionId = getSessionId();

    watchUrlChanges();

    await waitForReactHydration();
    debugLog('React hydration complete');

    currentAbortController = new AbortController();

    try {
      await waitForContent(currentAbortController.signal);
    } catch (e) {
      if (e.name !== 'AbortError') {
        debugLog('Init content wait error:', e.message);
      }
    }

    // Auto-enable virtual scrolling if enabled in settings
    if (currentSettings.isEnabled && isEnabledForCurrentInterface()) {
      enableVirtualScrolling();
    }

    // Initial badge update
    if (virtualScroller) {
      const status = virtualScroller.getStatus();
      updateBadge(status.renderedMessages, status.totalMessages, true);
    } else {
      const container = getScrollContainer();
      const totalHeight = container ? Math.round(container.scrollHeight) : 0;
      updateBadge(totalHeight, totalHeight, false);
    }

    debugLog('Claude Leash v4.0.0 initialized - Virtual Scrolling Mode');
  }

  init();
})();
