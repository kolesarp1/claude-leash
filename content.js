// Claude Leash - Content Script
// Crops conversation by pixel height to keep page responsive
(function() {
  'use strict';

  const STORAGE_KEY = 'claudeCollapseSettings';

  let currentSettings = { maxHeight: 12000, isCollapsed: false }; // Default ~500 lines at 24px
  let lastUrl = location.href;
  let isApplying = false;

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        // Support both old (maxLines) and new (maxHeight) settings
        if (result[STORAGE_KEY].maxHeight) {
          currentSettings.maxHeight = result[STORAGE_KEY].maxHeight;
        } else if (result[STORAGE_KEY].maxLines) {
          currentSettings.maxHeight = result[STORAGE_KEY].maxLines * 24; // Convert
        }
        currentSettings.isCollapsed = result[STORAGE_KEY].isCollapsed || false;
      }
    } catch (e) {}
  }

  // Find the main scroll container - look for the one with the most scrollable content
  function getScrollContainer() {
    const containers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
    let best = null;
    let bestScrollHeight = 0;

    for (const container of containers) {
      const rect = container.getBoundingClientRect();
      // Skip tiny containers
      if (rect.width < 200 || rect.height < 100) continue;

      // Skip left sidebar (typically narrow and on the left)
      if (rect.left < 100 && rect.width < 350) continue;

      // Prefer container with most scrollable content
      if (container.scrollHeight > bestScrollHeight) {
        best = container;
        bestScrollHeight = container.scrollHeight;
      }
    }

    console.log('Claude Leash: Found container with scrollHeight', bestScrollHeight);
    return best;
  }

  // Find hideable content elements within the container
  function findContentElements(container) {
    if (!container) return [];

    // Try multiple strategies to find message-like elements
    let elements = [];

    // Strategy 1: Look for elements with data-testid (Claude uses these)
    elements = [...container.querySelectorAll('[data-testid]')].filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.height > 50 && rect.width > 200;
    });

    if (elements.length > 5) {
      console.log('Claude Leash: Found', elements.length, 'elements via data-testid');
      return elements;
    }

    // Strategy 2: Walk down to find the level with most direct children
    let current = container;
    let bestLevel = [];

    for (let depth = 0; depth < 10; depth++) {
      const children = [...current.children].filter(c => {
        if (c.tagName !== 'DIV') return false;
        const rect = c.getBoundingClientRect();
        return rect.height > 30 && rect.width > 200;
      });

      if (children.length > bestLevel.length) {
        bestLevel = children;
      }

      // Go into the largest child
      const next = [...current.children]
        .filter(c => c.tagName === 'DIV')
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];

      if (next && next.scrollHeight > 200) {
        current = next;
      } else {
        break;
      }
    }

    console.log('Claude Leash: Found', bestLevel.length, 'elements via tree walk');
    return bestLevel;
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

  // Apply the collapse - hide content above the pixel limit
  function applyCollapse(maxHeight, isCollapsed) {
    if (isApplying) return { success: true };
    isApplying = true;

    currentSettings = { maxHeight, isCollapsed };

    const container = getScrollContainer();
    if (!container) {
      isApplying = false;
      return { success: false, error: 'No scroll container found' };
    }

    // Unhide any previously hidden elements
    if (window.claudeLeashHidden) {
      window.claudeLeashHidden.forEach(el => {
        el.style.removeProperty('display');
      });
      window.claudeLeashHidden = [];
    }

    const totalHeight = container.scrollHeight;
    let hiddenHeight = 0;

    if (isCollapsed && totalHeight > maxHeight) {
      const elements = findContentElements(container);

      if (elements.length > 0) {
        // Calculate cumulative heights from bottom
        let heightFromBottom = 0;
        const hiddenElements = [];

        // First pass: measure all heights
        const heights = elements.map(el => el.getBoundingClientRect().height);

        for (let i = elements.length - 1; i >= 0; i--) {
          heightFromBottom += heights[i];

          if (heightFromBottom > maxHeight) {
            // This element and all before it should be hidden
            for (let j = 0; j <= i; j++) {
              hiddenElements.push(elements[j]);
              hiddenHeight += heights[j];
            }
            break;
          }
        }

        // Hide elements
        hiddenElements.forEach(el => {
          el.style.setProperty('display', 'none', 'important');
        });
        window.claudeLeashHidden = hiddenElements;
      }
    }

    // Refresh scrollbar
    setTimeout(() => refreshScrollbar(container), 100);

    // Calculate visible height
    const visibleHeight = Math.max(0, totalHeight - hiddenHeight);

    // Update badge
    setTimeout(() => {
      updateBadge(visibleHeight, totalHeight, isCollapsed);
      isApplying = false;
    }, 150);

    console.log(`Claude Leash: ${isCollapsed ? 'Collapsed' : 'Expanded'} - ${Math.round(visibleHeight/1000)}k/${Math.round(totalHeight/1000)}k px visible`);
    return {
      success: true,
      totalHeight,
      hiddenHeight,
      visibleHeight,
      // For backwards compatibility with popup
      total: totalHeight,
      hidden: hiddenHeight,
      visible: visibleHeight
    };
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
              applyCollapse(currentSettings.maxHeight, true);
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
          applyCollapse(currentSettings.maxHeight, true);
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
          // Support both maxHeight (new) and maxLines (old)
          const height = message.maxHeight || (message.maxLines * 24);
          const result = applyCollapse(height, message.isCollapsed);
          sendResponse(result);
          break;

        case 'getStatus':
          const container = getScrollContainer();
          const totalHeight = container ? container.scrollHeight : 0;
          sendResponse({ success: true, total: totalHeight, totalHeight });
          break;

        case 'debug':
          // Highlight the scroll container and its content
          const cont = getScrollContainer();
          if (cont) {
            cont.style.outline = '3px solid red';
            const elements = findContentElements(cont);
            elements.forEach((el, i) => {
              el.style.outline = `2px solid ${i % 2 === 0 ? 'blue' : 'green'}`;
            });
            setTimeout(() => {
              cont.style.outline = '';
              elements.forEach(el => el.style.outline = '');
            }, 3000);
            sendResponse({
              success: true,
              found: elements.length,
              scrollHeight: cont.scrollHeight
            });
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
      const totalHeight = container ? container.scrollHeight : 0;
      updateBadge(totalHeight, totalHeight, currentSettings.isCollapsed);
    }, 1000);
  }

  init();
})();
