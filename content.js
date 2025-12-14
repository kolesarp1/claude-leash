// Claude Leash - Content Script
// Crops conversation by pixel height to keep page responsive
(function() {
  'use strict';

  const STORAGE_KEY = 'claudeCollapseSettings';

  let currentSettings = { maxHeight: 12000, isCollapsed: false }; // Default ~500 lines at 24px
  let lastUrl = location.href;
  let isApplying = false;
  let cachedContainer = null;
  let originalTotalHeight = 0;
  let lastLoggedVisible = 0; // Track last logged value to reduce spam

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
  function getScrollContainer(forceRefresh = false) {
    // Return cached container if still valid and in document
    if (!forceRefresh && cachedContainer && document.contains(cachedContainer)) {
      // Only use cache if it still has reasonable content
      if (cachedContainer.scrollHeight > 2000) {
        return cachedContainer;
      }
    }

    const containers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
    let best = null;
    let bestScrollHeight = 0;

    for (const container of containers) {
      const rect = container.getBoundingClientRect();
      // Skip tiny containers
      if (rect.width < 300 || rect.height < 200) continue;

      // Skip left sidebar (typically narrow and on the left)
      if (rect.left < 150 && rect.width < 400) continue;

      // Must have significant scrollable content (not sidebar/small panels)
      // 2000px minimum = roughly 80+ lines of content
      if (container.scrollHeight > bestScrollHeight && container.scrollHeight > 2000) {
        best = container;
        bestScrollHeight = container.scrollHeight;
      }
    }

    // Only update cache if we found something good
    if (best) {
      cachedContainer = best;
    }

    return cachedContainer;
  }

  // Detect if we're on Claude Code Web
  function isClaudeCode() {
    return location.pathname.startsWith('/code');
  }

  // Find hideable content elements within the container
  function findContentElements(container) {
    if (!container) return [];

    let elements = [];

    if (isClaudeCode()) {
      // Claude Code Web: drill down to find conversation turns
      // The turns are nested several levels deep in the scroll container
      let current = container;
      let bestLevel = [];
      let bestDepth = -1;

      for (let depth = 0; depth < 15; depth++) {
        const children = [...current.children].filter(c => {
          if (c.tagName !== 'DIV') return false;
          const rect = c.getBoundingClientRect();
          const text = c.innerText || '';
          // Must have substantial text content and size
          return text.length > 30 && rect.height > 50 && rect.width > 200;
        });

        // Keep track of the level with most substantial children
        if (children.length > bestLevel.length && children.length >= 2) {
          bestLevel = children;
          bestDepth = depth;
        }

        // Go deeper - find first substantial child to continue drilling
        const nextChild = [...current.children]
          .filter(c => c.tagName === 'DIV')
          .find(c => {
            const rect = c.getBoundingClientRect();
            return rect.height > 100;
          });

        if (nextChild) {
          current = nextChild;
        } else {
          break;
        }
      }

      if (bestLevel.length > 0) {
        console.log(`Claude Leash: Found ${bestLevel.length} turns at depth ${bestDepth}`);
        return bestLevel;
      }
    }

    // Regular Claude.ai or fallback: Try data-testid first
    elements = [...container.querySelectorAll('[data-testid]')].filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.height > 50 && rect.width > 200;
    });

    if (elements.length > 5) {
      return elements;
    }

    // Fallback: Walk down to find the level with most direct children
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

    // Unhide any previously hidden elements first (to get accurate measurements)
    if (window.claudeLeashHidden) {
      window.claudeLeashHidden.forEach(el => {
        el.style.removeProperty('display');
      });
      window.claudeLeashHidden = [];
    }

    // Small delay to let DOM update after unhiding
    const container = getScrollContainer();
    if (!container) {
      isApplying = false;
      return { success: false, error: 'No scroll container found' };
    }

    // Get total height AFTER unhiding everything
    const totalHeight = container.scrollHeight;

    // Track original total for display purposes
    if (totalHeight > originalTotalHeight) {
      originalTotalHeight = totalHeight;
    }

    let hiddenHeight = 0;

    if (isCollapsed && totalHeight > maxHeight) {
      const elements = findContentElements(container);
      console.log(`Claude Leash: Found ${elements.length} elements to potentially hide`);

      if (elements.length > 0) {
        // Calculate cumulative heights from bottom
        let heightFromBottom = 0;
        const hiddenElements = [];

        // First pass: measure all heights
        const heights = elements.map(el => el.getBoundingClientRect().height);
        const totalElementHeight = heights.reduce((a, b) => a + b, 0);
        console.log(`Claude Leash: Total element height: ${Math.round(totalElementHeight/1000)}k, maxHeight: ${Math.round(maxHeight/1000)}k`);

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

        console.log(`Claude Leash: Hiding ${hiddenElements.length} elements (${Math.round(hiddenHeight/1000)}k px)`);

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

    // Use original total for consistent display
    const displayTotal = Math.max(originalTotalHeight, totalHeight);

    // Update badge
    setTimeout(() => {
      updateBadge(visibleHeight, displayTotal, isCollapsed);
      isApplying = false;
    }, 150);

    // Only log if significant change (>2k difference)
    if (Math.abs(visibleHeight - lastLoggedVisible) > 2000) {
      console.log(`Claude Leash: ${Math.round(visibleHeight/1000)}k/${Math.round(displayTotal/1000)}k px visible`);
      lastLoggedVisible = visibleHeight;
    }
    return {
      success: true,
      totalHeight: displayTotal,
      hiddenHeight,
      visibleHeight,
      // For backwards compatibility with popup
      total: displayTotal,
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
        cachedContainer = null; // Clear cached container on URL change
        originalTotalHeight = 0; // Reset total height tracking

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
          // Force refresh to find the best container
          cachedContainer = null;
          const cont = getScrollContainer(true);
          console.log('Claude Leash DEBUG:');
          console.log('  Interface:', isClaudeCode() ? 'Claude Code Web' : 'Claude.ai');

          if (cont) {
            const contRect = cont.getBoundingClientRect();
            console.log('  Container:', {
              scrollHeight: cont.scrollHeight,
              clientHeight: cont.clientHeight,
              left: Math.round(contRect.left),
              width: Math.round(contRect.width)
            });

            cont.style.outline = '3px solid red';
            const elements = findContentElements(cont);
            console.log('  Elements found:', elements.length);

            elements.forEach((el, i) => {
              const rect = el.getBoundingClientRect();
              const text = (el.innerText || '').slice(0, 50);
              console.log(`    [${i}] h=${Math.round(rect.height)}px "${text}..."`);
              el.style.outline = `2px solid ${i % 2 === 0 ? 'blue' : 'green'}`;
            });

            setTimeout(() => {
              cont.style.outline = '';
              elements.forEach(el => el.style.outline = '');
            }, 5000);

            sendResponse({
              success: true,
              found: elements.length,
              scrollHeight: cont.scrollHeight,
              isClaudeCode: isClaudeCode()
            });
          } else {
            console.log('  No container found!');
            // Show all overflow containers for debugging
            const allContainers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
            console.log('  All overflow containers:', allContainers.length);
            allContainers.forEach((c, i) => {
              const rect = c.getBoundingClientRect();
              console.log(`    [${i}] ${Math.round(rect.width)}x${Math.round(rect.height)} at left=${Math.round(rect.left)}, scrollH=${c.scrollHeight}`);
            });
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
