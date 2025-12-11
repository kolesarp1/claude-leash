// Claude Leash - Content Script (Simplified)
// Crops conversation by visual height to keep page responsive
(function() {
  'use strict';

  const STORAGE_KEY = 'claudeCollapseSettings';
  const LINE_HEIGHT = 24; // Approximate line height in pixels

  let currentSettings = { maxLines: 500, isCollapsed: false };
  let lastUrl = location.href;
  let isApplying = false;

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        currentSettings.maxLines = result[STORAGE_KEY].maxLines || 500;
        currentSettings.isCollapsed = result[STORAGE_KEY].isCollapsed || false;
      }
    } catch (e) {}
  }

  // Find the conversation container and its children
  function findConversationElements() {
    // Look for scroll containers
    const scrollContainers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
    let bestElements = [];

    for (const container of scrollContainers) {
      const rect = container.getBoundingClientRect();
      // Skip small containers and sidebars
      if (rect.width < 400 || rect.height < 200) continue;
      if (rect.left < 300 && rect.width < 500) continue;

      // Find the level with the most substantial children (the message list)
      let current = container;
      for (let depth = 0; depth < 12; depth++) {
        const children = [...current.children].filter(c => {
          if (c.tagName !== 'DIV') return false;
          const r = c.getBoundingClientRect();
          return r.height > 40 && r.width > 200;
        });

        if (children.length > bestElements.length) {
          bestElements = children;
        }

        // Go deeper into the first substantial child
        const next = children.find(c => c.getBoundingClientRect().height > 100);
        if (next) {
          current = next;
        } else {
          break;
        }
      }
    }

    return bestElements;
  }

  // Get scroll container for refreshing
  function getScrollContainer() {
    const containers = document.querySelectorAll('[class*="overflow-y-auto"]');
    for (const container of containers) {
      const rect = container.getBoundingClientRect();
      if (rect.height > 200 && rect.width > 400) {
        return container;
      }
    }
    return null;
  }

  // Refresh scrollbar after DOM changes
  function refreshScrollbar() {
    const container = getScrollContainer();
    if (container) {
      const scrollTop = container.scrollTop;
      container.style.overflow = 'hidden';
      container.offsetHeight;
      container.style.overflow = '';
      container.scrollTop = scrollTop;
    }
  }

  // Apply the collapse - hide content above the line limit
  function applyCollapse(maxLines, isCollapsed) {
    if (isApplying) return { success: true };
    isApplying = true;

    currentSettings = { maxLines, isCollapsed };
    const maxHeight = maxLines * LINE_HEIGHT;

    // First, unhide everything
    if (window.claudeLeashElements) {
      window.claudeLeashElements.forEach(el => el.style.removeProperty('display'));
    }

    // Find conversation elements
    const elements = findConversationElements();
    window.claudeLeashElements = elements;

    const total = elements.length;
    let hidden = 0;

    if (isCollapsed && elements.length > 0) {
      // Count height from the bottom up
      let heightFromBottom = 0;
      let cutoffIndex = -1;

      for (let i = elements.length - 1; i >= 0; i--) {
        const rect = elements[i].getBoundingClientRect();
        heightFromBottom += rect.height;

        if (heightFromBottom > maxHeight) {
          cutoffIndex = i;
          break;
        }
      }

      // Hide everything up to and including the cutoff
      if (cutoffIndex >= 0) {
        for (let i = 0; i <= cutoffIndex; i++) {
          elements[i].style.setProperty('display', 'none', 'important');
          hidden++;
        }
      }
    }

    // Refresh scrollbar
    setTimeout(refreshScrollbar, 100);

    // Update badge
    setTimeout(() => {
      updateBadge(total - hidden, total, isCollapsed);
      isApplying = false;
    }, 150);

    return { success: true, total, hidden, visible: total - hidden };
  }

  // Update extension badge
  function updateBadge(visible, total, isCollapsed) {
    chrome.runtime.sendMessage({
      action: 'updateBadge',
      visible,
      total,
      isCollapsed
    }).catch(() => {});
  }

  // Watch for URL changes (session switches)
  function watchUrlChanges() {
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        window.claudeLeashElements = null;

        // Reapply after content loads
        [500, 1500, 3000].forEach(delay => {
          setTimeout(() => {
            if (currentSettings.isCollapsed) {
              applyCollapse(currentSettings.maxLines, true);
            }
          }, delay);
        });
      }
    }, 500);
  }

  // Watch for new content (debounced)
  function watchNewContent() {
    let debounceTimer = null;

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (currentSettings.isCollapsed) {
          applyCollapse(currentSettings.maxLines, true);
        }
      }, 800);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Message handler for popup communication
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      switch (message.action) {
        case 'collapse':
          const result = applyCollapse(message.maxLines, message.isCollapsed);
          sendResponse(result);
          break;

        case 'getStatus':
          const elements = findConversationElements();
          sendResponse({ success: true, total: elements.length });
          break;

        case 'debug':
          const els = findConversationElements();
          els.forEach((el, i) => {
            const rect = el.getBoundingClientRect();
            el.style.outline = `2px solid ${i % 2 === 0 ? 'red' : 'blue'}`;
            el.style.outlineOffset = '2px';
            setTimeout(() => {
              el.style.outline = '';
              el.style.outlineOffset = '';
            }, 3000);
          });
          sendResponse({ success: true, found: els.length });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  });

  // Initialize
  async function init() {
    await loadSettings();
    watchUrlChanges();
    watchNewContent();

    // Initial badge update
    setTimeout(() => {
      const elements = findConversationElements();
      updateBadge(elements.length, elements.length, currentSettings.isCollapsed);
    }, 1000);
  }

  init();
})();
