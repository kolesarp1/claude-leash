// Claude Leash - Content Script v3.4.0
// Proactive content hiding for snappy performance
(function() {
  'use strict';

  // ============ Constants ============
  const STORAGE_KEY = 'claudeCollapseSettings';
  const SESSION_KEY = 'claudeLeashSessions';
  const PLACEHOLDER_ID = 'claude-leash-placeholder';
  const STYLE_ID = 'claude-leash-styles';

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
      // Can't use debugLog here as it might not be loaded yet
      console.log('Claude Leash: Failed to load settings:', e.message);
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

    const viewportHeight = window.innerHeight;
    let best = null;
    let bestScore = 0;

    // Score function: prefer large containers that fill most of the viewport
    function scoreContainer(container) {
      const rect = container.getBoundingClientRect();
      const scrollHeight = container.scrollHeight;

      // Must be visible and reasonably sized
      if (rect.width < MIN_CONTAINER_WIDTH || rect.height < MIN_CONTAINER_HEIGHT) return 0;
      if (rect.left < SIDEBAR_MAX_LEFT && rect.width < SIDEBAR_MAX_WIDTH) return 0;
      if (scrollHeight <= MIN_SCROLL_HEIGHT) return 0;

      // Score based on: scrollHeight + bonus for filling viewport
      let score = scrollHeight;

      // Bonus if container height is close to viewport height (main content area)
      const heightRatio = rect.height / viewportHeight;
      if (heightRatio > 0.5) score += 10000; // Big bonus for main content area
      if (heightRatio > 0.7) score += 20000;

      return score;
    }

    // Strategy 1: Try CSS class-based detection (Tailwind overflow classes)
    const overflowContainers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"], [class*="overflow-y-scroll"]');

    for (const container of overflowContainers) {
      const score = scoreContainer(container);
      if (score > bestScore) {
        best = container;
        bestScore = score;
      }
    }

    // Strategy 2: Scan divs with getComputedStyle (limited, for non-Tailwind containers)
    if (!best || bestScore < 10000) {
      const allDivs = document.querySelectorAll('div');
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
      debugLog(`Found container: ${best.scrollHeight}px scroll, ${Math.round(rect.height)}px visible, score=${bestScore}, classes=${best.className.slice(0,50)}`);
    } else {
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
    return [...contentParent.children].filter(c => {
      if (c.tagName !== 'DIV') return false;
      if (c.id === PLACEHOLDER_ID) return false;
      if (c.classList.contains('claude-leash-hidden')) return false;
      const rect = c.getBoundingClientRect();
      return rect.height > 10 && rect.width > 50;
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

    if (contentObserver) contentObserver.disconnect();

    contentObserver = new MutationObserver((mutations) => {
      if (!currentSettings.isCollapsed || !isEnabledForCurrentInterface()) return;
      if (!reactHydrated) return;

      const contentParent = cachedContentParent;
      if (!contentParent) return;

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
        requestAnimationFrame(() => {
          applyCollapseQuick();
        });
      }
    });

    contentObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Quick collapse without full recalculation - CSS only, no DOM removal
  function applyCollapseQuick() {
    if (isApplying || !reactHydrated) return;
    isApplying = true; // Fix: set flag at start to prevent concurrent calls

    try {
      const contentParent = cachedContentParent || getContentParent(getScrollContainer());
      if (!contentParent) return;

      const children = getContentChildren(contentParent);
      if (children.length === 0) return;

      let heightFromBottom = 0;
      const maxHeight = currentSettings.maxHeight;

      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        const height = Math.round(child.offsetHeight || child.getBoundingClientRect().height);
        heightFromBottom += height;

        if (heightFromBottom > maxHeight) {
          for (let j = 0; j <= i; j++) {
            const node = children[j];
            if (!node.classList.contains('claude-leash-hidden')) {
              const nodeHeight = Math.round(node.offsetHeight);
              node.classList.add('claude-leash-hidden');
              hiddenNodes.push({ node, height: nodeHeight });
              totalHiddenHeight += nodeHeight;
            }
          }
          break;
        }
      }

      if (hiddenNodes.length > 0 && (!placeholder || !placeholder.parentElement)) {
        placeholder = createPlaceholder(totalHiddenHeight, hiddenNodes.length);
        contentParent.insertBefore(placeholder, contentParent.firstChild);
      } else if (placeholder) {
        updatePlaceholder();
      }
    } finally {
      isApplying = false; // Always reset flag
    }
  }

  // ============ Core Logic ============

  function applyCollapse(maxHeight, isCollapsed, enableClaudeAi, enableClaudeCode) {
    if (isApplying) return { success: true };
    isApplying = true;

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
        } else {
          updatePlaceholder();
        }

        console.log(`Claude Leash: Hidden ${hiddenNodes.length} blocks (${Math.round(hiddenHeight/1000)}k px)`);
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

      return {
        success: true,
        totalHeight: Math.round(originalTotalHeight),
        hiddenHeight: Math.round(hiddenHeight),
        visibleHeight: Math.round(visibleHeight),
        total: Math.round(originalTotalHeight),
        hidden: Math.round(hiddenHeight),
        visible: Math.round(visibleHeight),
        hiddenCount: hiddenNodes.length
      };
    } finally {
      isApplying = false;
    }
  }

  function restoreAll() {
    restoreAllSilent();
    const container = getScrollContainer();
    const total = container ? Math.round(container.scrollHeight) : 0;
    updateBadge(total, total, currentSettings.isCollapsed);
    saveSessionState();
  }

  function restoreAllSilent() {
    if (hiddenNodes.length === 0) return;

    if (placeholder && placeholder.parentElement) {
      placeholder.remove();
    }

    hiddenNodes.forEach(data => {
      data.node.classList.remove('claude-leash-hidden');
    });

    console.log(`Claude Leash: Restored ${hiddenNodes.length} blocks`);

    hiddenNodes = [];
    totalHiddenHeight = 0;
    placeholder = null;
  }

  function restoreChunk(count = 5) {
    if (hiddenNodes.length === 0) return;

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

  // ============ Scroll Detection ============

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

  // ============ Session/URL Change Detection ============

  async function handleSessionChange() {
    const newSessionId = getSessionId();
    if (newSessionId === currentSessionId) return;

    console.log(`Claude Leash: Session change ${currentSessionId} -> ${newSessionId}`);

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
    currentSessionId = newSessionId;

    // Load session states from storage
    const sessionStates = await loadSessionStates();
    const prevState = sessionStates[newSessionId];
    const shouldCollapse = currentSettings.isCollapsed || (prevState && prevState.isCollapsed);

    if (!shouldCollapse || !isEnabledForCurrentInterface() || !reactHydrated) {
      return;
    }

    // Check content cache for fast path
    const cachedContent = sessionContentCache.get(newSessionId);

    if (cachedContent) {
      // Fast path: we have cached content info for this session
      // Wait up to 1.5s for content to reach at least 50% of cached height
      console.log(`Claude Leash: Trying fast path for cached session (${Math.round(cachedContent.scrollHeight/1000)}k px cached)`);

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
            console.log(`Claude Leash: Fast path hit! (${Math.round(currentHeight/1000)}k / ${Math.round(cachedContent.scrollHeight/1000)}k = ${(heightRatio * 100).toFixed(0)}%)`);
            applyCollapse(currentSettings.maxHeight, true);
            return;
          }
        }
      }

      // Fast path timed out, fall through to slow path
      console.log(`Claude Leash: Fast path timeout, using slow path`);
    }

    // Slow path: wait for content to load and stabilize
    try {
      await waitForContent(signal);
      if (signal.aborted) return;

      if (currentSettings.isCollapsed) {
        applyCollapse(currentSettings.maxHeight, true);
      }
    } catch (e) {
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
                console.log(`Claude Leash: Content ready (${children.length} blocks, ${Math.round(currentHeight/1000)}k px)`);

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
          console.log(`Claude Leash: Timeout, proceeding with current content (${children.length} blocks, ${Math.round((container?.scrollHeight || 0)/1000)}k px)`);
          resolve();
        }
      };

      setTimeout(checkContent, CONTENT_CHECK_INTERVAL_MS);
    });
  }

  // ============ Message Handler ============

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
          console.log(`Claude Leash: Debug mode ${DEBUG_MODE ? 'enabled' : 'disabled'}`);
          sendResponse({ success: true, debugMode: DEBUG_MODE });
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
    await loadSettings();
    currentSessionId = getSessionId();

    setupScrollDetection();
    watchUrlChanges();

    // Wait for React to finish hydrating before manipulating DOM
    await waitForReactHydration();
    console.log('Claude Leash: React hydration complete, safe to manipulate DOM');

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
  console.log('Claude Leash: Loaded (waiting for React hydration)');
})();
