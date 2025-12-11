// Claude Leash - Content Script (Simplified)
// Crops conversation by visual height (lines) to keep page responsive
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

  // Find the main scroll container
  function getScrollContainer() {
    const containers = document.querySelectorAll('[class*="overflow-y-auto"]');
    for (const container of containers) {
      const rect = container.getBoundingClientRect();
      // Main content area: wide enough and tall enough, not on the left edge (sidebar)
      if (rect.height > 200 && rect.width > 400 && rect.left > 200) {
        return container;
      }
    }
    // Fallback: largest scroll container
    let best = null;
    let bestArea = 0;
    for (const container of containers) {
      const rect = container.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea && rect.width > 300) {
        best = container;
        bestArea = area;
      }
    }
    return best;
  }

  // Get the total scrollable height of content
  function getTotalContentHeight(container) {
    return container ? container.scrollHeight : 0;
  }

  // Refresh scrollbar after DOM changes
  function refreshScrollbar(container) {
    if (container) {
      const scrollTop = container.scrollTop;
      container.style.overflow = 'hidden';
      container.offsetHeight;
      container.style.overflow = '';
      container.scrollTop = scrollTop;
    }
  }

  // Apply the collapse - hide content above the line limit using CSS clip
  function applyCollapse(maxLines, isCollapsed) {
    if (isApplying) return { success: true };
    isApplying = true;

    currentSettings = { maxLines, isCollapsed };
    const maxHeight = maxLines * LINE_HEIGHT;

    const container = getScrollContainer();
    if (!container) {
      isApplying = false;
      return { success: false, error: 'No scroll container found' };
    }

    // Remove any previous leash styling
    const existingStyle = document.getElementById('claude-leash-style');
    if (existingStyle) existingStyle.remove();

    // Unhide any previously hidden elements
    if (window.claudeLeashHidden) {
      window.claudeLeashHidden.forEach(el => {
        el.style.removeProperty('display');
      });
      window.claudeLeashHidden = [];
    }

    const totalHeight = getTotalContentHeight(container);
    const totalLines = Math.round(totalHeight / LINE_HEIGHT);
    let hiddenLines = 0;

    if (isCollapsed && totalHeight > maxHeight) {
      // Find all direct children of the scroll container's content wrapper
      // We need to go one level deep to find the actual message containers
      const contentWrapper = container.firstElementChild;
      if (contentWrapper) {
        // Get all substantial child elements
        const children = [...contentWrapper.querySelectorAll(':scope > div')].filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.height > 10;
        });

        if (children.length > 0) {
          // Calculate cumulative heights from bottom
          let heightFromBottom = 0;
          const hiddenElements = [];

          for (let i = children.length - 1; i >= 0; i--) {
            const el = children[i];
            const rect = el.getBoundingClientRect();
            heightFromBottom += rect.height;

            if (heightFromBottom > maxHeight) {
              // This element and all before it should be hidden
              for (let j = 0; j <= i; j++) {
                hiddenElements.push(children[j]);
              }
              break;
            }
          }

          // Hide elements
          hiddenElements.forEach(el => {
            el.style.setProperty('display', 'none', 'important');
          });
          window.claudeLeashHidden = hiddenElements;
          hiddenLines = Math.round(hiddenElements.reduce((sum, el) => {
            // Get original height before hiding (it's already hidden, so we estimate)
            return sum + 200; // Rough estimate per hidden block
          }, 0) / LINE_HEIGHT);
        }
      }
    }

    // Refresh scrollbar
    setTimeout(() => refreshScrollbar(container), 100);

    // Update badge
    const visibleLines = Math.max(0, totalLines - hiddenLines);
    setTimeout(() => {
      updateBadge(visibleLines, totalLines, isCollapsed);
      isApplying = false;
    }, 150);

    console.log(`Claude Leash: ${isCollapsed ? 'Collapsed' : 'Expanded'} - ${visibleLines}/${totalLines} lines visible`);
    return { success: true, total: totalLines, hidden: hiddenLines, visible: visibleLines };
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
        window.claudeLeashHidden = null;

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
          const container = getScrollContainer();
          const totalHeight = getTotalContentHeight(container);
          const totalLines = Math.round(totalHeight / LINE_HEIGHT);
          sendResponse({ success: true, total: totalLines });
          break;

        case 'debug':
          // Highlight the scroll container and its content
          const cont = getScrollContainer();
          if (cont) {
            cont.style.outline = '3px solid red';
            const wrapper = cont.firstElementChild;
            if (wrapper) {
              const children = [...wrapper.querySelectorAll(':scope > div')];
              children.forEach((el, i) => {
                el.style.outline = `2px solid ${i % 2 === 0 ? 'blue' : 'green'}`;
              });
              setTimeout(() => {
                cont.style.outline = '';
                children.forEach(el => el.style.outline = '');
              }, 3000);
              sendResponse({ success: true, found: children.length });
            } else {
              sendResponse({ success: true, found: 0 });
            }
          } else {
            sendResponse({ success: false, error: 'No container found' });
          }
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
      const container = getScrollContainer();
      const totalHeight = getTotalContentHeight(container);
      const totalLines = Math.round(totalHeight / LINE_HEIGHT);
      updateBadge(totalLines, totalLines, currentSettings.isCollapsed);
    }, 1000);
  }

  init();
})();
