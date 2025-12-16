// Claude Leash - Content Script
// Proactive content hiding for snappy performance
(function() {
  'use strict';

  const STORAGE_KEY = 'claudeCollapseSettings';
  const SESSION_KEY = 'claudeLeashSessions';
  const PLACEHOLDER_ID = 'claude-leash-placeholder';
  const STYLE_ID = 'claude-leash-styles';

  let currentSettings = {
    maxHeight: 12000,
    isCollapsed: false,
    enableClaudeAi: true,
    enableClaudeCode: true
  };

  let lastUrl = location.href;
  let isApplying = false;
  let cachedContainer = null;
  let cachedContentParent = null;
  let contentObserver = null;
  let imageObserver = null;
  let reactHydrated = false; // Track if React has finished hydrating

  // Storage for hidden content (CSS-only, no DOM removal to avoid React conflicts)
  let hiddenNodes = [];
  let totalHiddenHeight = 0;
  let placeholder = null;
  let originalTotalHeight = 0;

  // Session tracking
  let currentSessionId = null;
  let sessionStates = {};

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
      /* Lazy image placeholder */
      img[data-claude-leash-lazy] {
        background: #f0f0f0;
        min-height: 50px;
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
      const result = await chrome.storage.local.get([STORAGE_KEY, SESSION_KEY]);
      if (result[STORAGE_KEY]) {
        if (result[STORAGE_KEY].maxHeight) {
          currentSettings.maxHeight = result[STORAGE_KEY].maxHeight;
        } else if (result[STORAGE_KEY].maxLines) {
          currentSettings.maxHeight = result[STORAGE_KEY].maxLines * 24;
        }
        currentSettings.isCollapsed = result[STORAGE_KEY].isCollapsed || false;
        currentSettings.enableClaudeAi = result[STORAGE_KEY].enableClaudeAi !== false;
        currentSettings.enableClaudeCode = result[STORAGE_KEY].enableClaudeCode !== false;
      }
      if (result[SESSION_KEY]) {
        sessionStates = result[SESSION_KEY];
      }
    } catch (e) {}
  }

  async function saveSessionState() {
    if (!currentSessionId) return;
    sessionStates[currentSessionId] = {
      isCollapsed: currentSettings.isCollapsed,
      hiddenCount: hiddenNodes.length,
      timestamp: Date.now()
    };
    // Clean old sessions (keep last 50)
    const keys = Object.keys(sessionStates);
    if (keys.length > 50) {
      keys.sort((a, b) => sessionStates[a].timestamp - sessionStates[b].timestamp);
      keys.slice(0, keys.length - 50).forEach(k => delete sessionStates[k]);
    }
    try {
      await chrome.storage.local.set({ [SESSION_KEY]: sessionStates });
    } catch (e) {}
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
      // Wait for React to finish hydrating - use multiple signals
      if (reactHydrated) {
        resolve();
        return;
      }

      // Method 1: requestIdleCallback (browser is idle)
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
          reactHydrated = true;
          resolve();
        }, { timeout: 3000 });
      } else {
        // Method 2: Fallback timeout
        setTimeout(() => {
          reactHydrated = true;
          resolve();
        }, 2000);
      }
    });
  }

  // ============ Safe Image Handling (no src modification to avoid React conflicts) ============

  // Instead of modifying img.src, we just track which nodes are hidden
  // The CSS .claude-leash-hidden will hide them including their images

  // ============ Container Detection ============

  function getScrollContainer(forceRefresh = false) {
    if (!forceRefresh && cachedContainer && document.contains(cachedContainer)) {
      if (cachedContainer.scrollHeight > 500) {
        return cachedContainer;
      }
    }

    const containers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
    let best = null;
    let bestScrollHeight = 0;

    for (const container of containers) {
      const rect = container.getBoundingClientRect();
      if (rect.width < 300 || rect.height < 200) continue;
      if (rect.left < 150 && rect.width < 400) continue;

      if (container.scrollHeight > bestScrollHeight && container.scrollHeight > 500) {
        best = container;
        bestScrollHeight = container.scrollHeight;
      }
    }

    if (best) cachedContainer = best;
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

    for (let depth = 0; depth < 15; depth++) {
      const children = [...current.children].filter(c => {
        if (c.tagName !== 'DIV') return false;
        if (c.id === PLACEHOLDER_ID) return false;
        if (c.classList.contains('claude-leash-hidden')) return false;
        const rect = c.getBoundingClientRect();
        return rect.height > 20 && rect.width > 100;
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
        📦 ${heightK}k pixels hidden (${hiddenCount} blocks)
      </div>
      <div style="font-size: 11px; opacity: 0.8;">
        Click to restore • Scroll up to load more
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
        countEl.innerHTML = `📦 ${heightK}k pixels hidden (${hiddenNodes.length} blocks)`;
      }
    }
  }

  // ============ Early Intervention - Hide as content loads ============

  function setupEarlyIntervention() {
    // Only run after React has hydrated to avoid conflicts
    if (!reactHydrated) return;

    if (contentObserver) contentObserver.disconnect();

    contentObserver = new MutationObserver((mutations) => {
      if (!currentSettings.isCollapsed || !isEnabledForCurrentInterface()) return;
      if (!reactHydrated) return; // Safety check

      const contentParent = cachedContentParent;
      if (!contentParent) return;

      // Check if new children were added
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
        // Quick reapply after a small delay
        requestAnimationFrame(() => {
          applyCollapseQuick();
        });
      }
    });

    // Observe at body level to catch all changes
    contentObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Quick collapse without full recalculation - CSS only, no DOM removal
  function applyCollapseQuick() {
    if (isApplying || !reactHydrated) return;

    const contentParent = cachedContentParent || getContentParent(getScrollContainer());
    if (!contentParent) return;

    const children = getContentChildren(contentParent);
    if (children.length === 0) return;

    // Quick height calculation
    let heightFromBottom = 0;
    const maxHeight = currentSettings.maxHeight;

    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      const height = Math.round(child.offsetHeight || child.getBoundingClientRect().height);
      heightFromBottom += height;

      if (heightFromBottom > maxHeight) {
        // Hide all remaining (older) content using CSS class only
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

    // Ensure placeholder exists
    if (hiddenNodes.length > 0 && (!placeholder || !placeholder.parentElement)) {
      placeholder = createPlaceholder(totalHiddenHeight, hiddenNodes.length);
      contentParent.insertBefore(placeholder, contentParent.firstChild);
    } else if (placeholder) {
      updatePlaceholder();
    }
  }

  // ============ Core Logic ============

  function applyCollapse(maxHeight, isCollapsed, enableClaudeAi, enableClaudeCode) {
    if (isApplying) return { success: true };
    isApplying = true;

    // Update settings
    currentSettings.maxHeight = maxHeight;
    currentSettings.isCollapsed = isCollapsed;
    if (enableClaudeAi !== undefined) currentSettings.enableClaudeAi = enableClaudeAi;
    if (enableClaudeCode !== undefined) currentSettings.enableClaudeCode = enableClaudeCode;

    // Check if enabled
    if (!isEnabledForCurrentInterface()) {
      restoreAll();
      isApplying = false;
      return { success: true, disabled: true, total: 0, hidden: 0, visible: 0 };
    }

    // If not collapsed, restore everything
    if (!isCollapsed) {
      restoreAll();
      const container = getScrollContainer();
      const total = container ? Math.round(container.scrollHeight) : 0;
      updateBadge(total, total, false);
      isApplying = false;
      saveSessionState();
      return { success: true, total, hidden: 0, visible: total };
    }

    // Get container and content
    const container = getScrollContainer();
    if (!container) {
      isApplying = false;
      return { success: false, error: 'No scroll container found' };
    }

    const contentParent = getContentParent(container);
    if (!contentParent) {
      isApplying = false;
      return { success: false, error: 'No content parent found' };
    }

    // First restore all to measure accurately
    restoreAllSilent();

    const children = getContentChildren(contentParent);
    if (children.length === 0) {
      isApplying = false;
      return { success: false, error: 'No content children found' };
    }

    // Measure heights (round to avoid float display issues)
    const heights = children.map(el => Math.round(el.getBoundingClientRect().height));
    const totalHeight = heights.reduce((a, b) => a + b, 0);
    originalTotalHeight = Math.max(originalTotalHeight, totalHeight);

    // Calculate what to hide
    let heightFromBottom = 0;
    let cutoffIndex = -1;

    for (let i = children.length - 1; i >= 0; i--) {
      heightFromBottom += heights[i];
      if (heightFromBottom > maxHeight) {
        cutoffIndex = i;
        break;
      }
    }

    // Hide elements above cutoff using CSS class only (no DOM removal to avoid React issues)
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

      // Add placeholder
      if (!placeholder || !placeholder.parentElement) {
        placeholder = createPlaceholder(hiddenHeight, hiddenNodes.length);
        contentParent.insertBefore(placeholder, contentParent.firstChild);
      } else {
        updatePlaceholder();
      }

      console.log(`Claude Leash: Hidden ${hiddenNodes.length} blocks (${Math.round(hiddenHeight/1000)}k px)`);
    }

    // Setup early intervention for new content
    setupEarlyIntervention();

    const visibleHeight = totalHeight - hiddenHeight;

    setTimeout(() => {
      updateBadge(Math.round(visibleHeight), Math.round(originalTotalHeight), true);
      isApplying = false;
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

    // Just remove the CSS class - nodes are still in DOM
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

    // Restore from the end (most recently hidden = oldest content)
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

    console.log(`Claude Leash: Restored ${toRestore.length} blocks, ${hiddenNodes.length} remaining`);
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

      // Restore some content when user scrolls near top
      if (scrollTop < 300 && scrollTop < lastScrollTop) {
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

  function handleSessionChange() {
    const newSessionId = getSessionId();
    if (newSessionId === currentSessionId) return;

    console.log(`Claude Leash: Session change ${currentSessionId} -> ${newSessionId}`);

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

    // Check if we should auto-collapse this session
    const prevState = sessionStates[newSessionId];
    const shouldCollapse = currentSettings.isCollapsed || (prevState && prevState.isCollapsed);

    if (shouldCollapse && isEnabledForCurrentInterface() && reactHydrated) {
      // Wait for content to load, then apply collapse
      waitForContent().then(() => {
        if (currentSettings.isCollapsed) {
          applyCollapse(currentSettings.maxHeight, true);
        }
      });
    }
  }

  function watchUrlChanges() {
    // Multiple detection methods for reliability

    // 1. Polling (fallback)
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleSessionChange();
      }
    }, 300);

    // 2. History API
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      setTimeout(handleSessionChange, 50);
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      setTimeout(handleSessionChange, 50);
    };

    window.addEventListener('popstate', () => {
      setTimeout(handleSessionChange, 50);
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
          // reportStatus is sent by background.js when tab is activated
          const statusContainer = getScrollContainer();
          const statusTotalHeight = statusContainer ? Math.round(statusContainer.scrollHeight) : 0;
          const fullTotal = Math.round(statusTotalHeight + totalHiddenHeight);
          const visibleNow = Math.round(statusTotalHeight);

          // Update badge
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
          console.log('  Session states:', Object.keys(sessionStates).length);

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
              reactHydrated
            });
          } else {
            sendResponse({ success: false, error: 'No container found' });
          }
          break;

        case 'restore':
          restoreAll();
          sendResponse({ success: true });
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

    // Wait for actual content to appear (not just React hydration)
    await waitForContent();

    // Apply collapse if enabled (after content is ready)
    if (currentSettings.isCollapsed && isEnabledForCurrentInterface()) {
      applyCollapse(currentSettings.maxHeight, true);
    }

    // Initial badge update
    const container = getScrollContainer();
    const totalHeight = container ? Math.round(container.scrollHeight) : 0;
    updateBadge(totalHeight, totalHeight, currentSettings.isCollapsed);
  }

  // Wait for actual content to be rendered AND stabilized in the DOM
  function waitForContent() {
    return new Promise(resolve => {
      let attempts = 0;
      const maxAttempts = 40; // 40 * 200ms = 8 seconds max
      let lastScrollHeight = 0;
      let stableCount = 0;
      const stableThreshold = 3; // Need 3 consecutive stable readings
      const minHeightForCollapse = 5000; // Minimum 5k px to consider "real" content

      const checkContent = () => {
        attempts++;
        const container = getScrollContainer(true); // Force refresh

        if (container) {
          const currentHeight = container.scrollHeight;
          const contentParent = getContentParent(container);
          const children = contentParent ? getContentChildren(contentParent) : [];

          // Log progress for debugging
          if (attempts % 5 === 0) {
            console.log(`Claude Leash: Checking content... (${children.length} blocks, ${Math.round(currentHeight/1000)}k px, attempt ${attempts})`);
          }

          // Check if content has stabilized (height stopped changing)
          // AND we have meaningful content (>5k px) OR we've waited long enough
          if (currentHeight > 500 && children.length >= 1) {
            if (currentHeight === lastScrollHeight) {
              stableCount++;

              // Accept if stable AND either:
              // 1. We have meaningful content (> 5k px), OR
              // 2. We've waited at least 3 seconds (15 attempts) and content is truly stable
              const hasEnoughContent = currentHeight >= minHeightForCollapse;
              const waitedLongEnough = attempts >= 15 && stableCount >= stableThreshold;

              if (stableCount >= stableThreshold && (hasEnoughContent || waitedLongEnough)) {
                console.log(`Claude Leash: Content ready (${children.length} blocks, ${Math.round(currentHeight/1000)}k px)`);
                resolve();
                return;
              }
            } else {
              stableCount = 0; // Reset if height changed
            }
            lastScrollHeight = currentHeight;
          }
        }

        if (attempts < maxAttempts) {
          setTimeout(checkContent, 200);
        } else {
          const container = getScrollContainer();
          const contentParent = container ? getContentParent(container) : null;
          const children = contentParent ? getContentChildren(contentParent) : [];
          console.log(`Claude Leash: Timeout, proceeding with current content (${children.length} blocks, ${Math.round((container?.scrollHeight || 0)/1000)}k px)`);
          resolve();
        }
      };

      // Start checking after a small delay
      setTimeout(checkContent, 200);
    });
  }

  init();
  console.log('Claude Leash: Loaded (waiting for React hydration)');
})();
