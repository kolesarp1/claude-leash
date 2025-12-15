// Claude Leash - Content Script
// Removes old conversation content and replaces with placeholder for performance
(function() {
  'use strict';

  const STORAGE_KEY = 'claudeCollapseSettings';
  const PLACEHOLDER_ID = 'claude-leash-placeholder';

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

  // Storage for removed content
  let removedNodes = [];        // Array of { node, height, images: [{el, src}] }
  let totalRemovedHeight = 0;
  let placeholder = null;
  let originalTotalHeight = 0;

  // ============ Settings ============

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
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
    } catch (e) {}
  }

  function isClaudeCode() {
    return location.pathname.startsWith('/code');
  }

  function isEnabledForCurrentInterface() {
    return isClaudeCode() ? currentSettings.enableClaudeCode : currentSettings.enableClaudeAi;
  }

  // ============ Container Detection ============

  function getScrollContainer(forceRefresh = false) {
    if (!forceRefresh && cachedContainer && document.contains(cachedContainer)) {
      if (cachedContainer.scrollHeight > 1000) {
        return cachedContainer;
      }
    }

    const containers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
    let best = null;
    let bestScrollHeight = 0;

    for (const container of containers) {
      const rect = container.getBoundingClientRect();
      if (rect.width < 300 || rect.height < 200) continue;
      if (rect.left < 150 && rect.width < 400) continue; // Skip sidebar

      if (container.scrollHeight > bestScrollHeight && container.scrollHeight > 1000) {
        best = container;
        bestScrollHeight = container.scrollHeight;
      }
    }

    if (best) cachedContainer = best;
    return cachedContainer;
  }

  // Find the content parent (element whose children are the messages)
  function getContentParent(container) {
    if (!container) return null;

    // Walk down to find the level with multiple substantial children
    let current = container;
    let bestParent = null;
    let bestChildCount = 0;

    for (let depth = 0; depth < 15; depth++) {
      const children = [...current.children].filter(c => {
        if (c.tagName !== 'DIV') return false;
        if (c.id === PLACEHOLDER_ID) return false;
        const rect = c.getBoundingClientRect();
        return rect.height > 30 && rect.width > 200;
      });

      if (children.length > bestChildCount && children.length >= 2) {
        bestParent = current;
        bestChildCount = children.length;
      }

      // Continue down the largest child
      const nextChild = [...current.children]
        .filter(c => c.tagName === 'DIV' && c.id !== PLACEHOLDER_ID)
        .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];

      if (nextChild && nextChild.scrollHeight > 200) {
        current = nextChild;
      } else {
        break;
      }
    }

    cachedContentParent = bestParent;
    return bestParent;
  }

  // Get content children (the actual message elements)
  function getContentChildren(contentParent) {
    if (!contentParent) return [];
    return [...contentParent.children].filter(c => {
      if (c.tagName !== 'DIV') return false;
      if (c.id === PLACEHOLDER_ID) return false;
      const rect = c.getBoundingClientRect();
      return rect.height > 20 && rect.width > 100;
    });
  }

  // ============ Placeholder ============

  function createPlaceholder(hiddenHeight, hiddenCount) {
    const el = document.createElement('div');
    el.id = PLACEHOLDER_ID;
    el.style.cssText = `
      padding: 16px 20px;
      margin: 8px 0;
      background: linear-gradient(135deg, #f0f0f0 0%, #e8e8e8 100%);
      border-radius: 8px;
      text-align: center;
      color: #666;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
      border: 1px dashed #ccc;
    `;
    el.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">
        📦 ${Math.round(hiddenHeight / 1000)}k pixels hidden (${hiddenCount} blocks)
      </div>
      <div style="font-size: 11px; opacity: 0.8;">
        Click to restore • Scroll up to load more
      </div>
    `;
    el.addEventListener('click', () => restoreAll());
    el.addEventListener('mouseenter', () => {
      el.style.background = 'linear-gradient(135deg, #e8e8e8 0%, #ddd 100%)';
    });
    el.addEventListener('mouseleave', () => {
      el.style.background = 'linear-gradient(135deg, #f0f0f0 0%, #e8e8e8 100%)';
    });
    return el;
  }

  function updatePlaceholder() {
    if (placeholder && placeholder.parentElement) {
      const countEl = placeholder.querySelector('div');
      if (countEl) {
        countEl.innerHTML = `📦 ${Math.round(totalRemovedHeight / 1000)}k pixels hidden (${removedNodes.length} blocks)`;
      }
    }
  }

  // ============ Image Handling ============

  function unloadImages(node) {
    const images = [];
    node.querySelectorAll('img').forEach(img => {
      if (img.src && !img.src.startsWith('data:')) {
        images.push({ el: img, src: img.src });
        img.dataset.claudeLeashSrc = img.src;
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      }
    });
    return images;
  }

  function reloadImages(nodeData) {
    nodeData.images.forEach(({ el, src }) => {
      if (el.dataset.claudeLeashSrc) {
        el.src = el.dataset.claudeLeashSrc;
        delete el.dataset.claudeLeashSrc;
      }
    });
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
      const total = container ? container.scrollHeight : 0;
      updateBadge(total, total, false);
      isApplying = false;
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

    // Measure heights
    const heights = children.map(el => el.getBoundingClientRect().height);
    const totalHeight = heights.reduce((a, b) => a + b, 0);
    originalTotalHeight = Math.max(originalTotalHeight, totalHeight);

    // Calculate what to hide (from top, keeping bottom)
    let heightFromBottom = 0;
    let cutoffIndex = -1;

    for (let i = children.length - 1; i >= 0; i--) {
      heightFromBottom += heights[i];
      if (heightFromBottom > maxHeight) {
        cutoffIndex = i;
        break;
      }
    }

    // Remove elements above cutoff
    let hiddenHeight = 0;
    const toRemove = [];

    if (cutoffIndex >= 0) {
      for (let i = 0; i <= cutoffIndex; i++) {
        const node = children[i];
        const height = heights[i];
        const images = unloadImages(node);
        toRemove.push({ node, height, images });
        hiddenHeight += height;
      }

      // Remove from DOM and store
      toRemove.forEach(data => {
        data.node.remove();
        removedNodes.push(data);
      });
      totalRemovedHeight = hiddenHeight;

      // Add/update placeholder
      if (!placeholder || !placeholder.parentElement) {
        placeholder = createPlaceholder(hiddenHeight, toRemove.length);
        contentParent.insertBefore(placeholder, contentParent.firstChild);
      } else {
        updatePlaceholder();
      }

      console.log(`Claude Leash: Removed ${toRemove.length} blocks (${Math.round(hiddenHeight/1000)}k px)`);
    }

    // Calculate final values
    const visibleHeight = totalHeight - hiddenHeight;

    // Update badge
    setTimeout(() => {
      updateBadge(visibleHeight, originalTotalHeight, true);
      isApplying = false;
    }, 100);

    return {
      success: true,
      totalHeight: originalTotalHeight,
      hiddenHeight,
      visibleHeight,
      total: originalTotalHeight,
      hidden: hiddenHeight,
      visible: visibleHeight,
      removedCount: toRemove.length
    };
  }

  function restoreAll() {
    restoreAllSilent();
    const container = getScrollContainer();
    const total = container ? container.scrollHeight : 0;
    updateBadge(total, total, currentSettings.isCollapsed);
  }

  function restoreAllSilent() {
    if (removedNodes.length === 0) return;

    const contentParent = cachedContentParent || getContentParent(getScrollContainer());
    if (!contentParent) return;

    // Remove placeholder
    if (placeholder && placeholder.parentElement) {
      placeholder.remove();
    }

    // Restore all nodes in order (they were stored oldest first)
    const insertPoint = contentParent.firstChild;
    removedNodes.forEach(data => {
      reloadImages(data);
      contentParent.insertBefore(data.node, insertPoint);
    });

    console.log(`Claude Leash: Restored ${removedNodes.length} blocks`);

    // Clear storage
    removedNodes = [];
    totalRemovedHeight = 0;
    placeholder = null;
  }

  // Restore some content (for scroll-up)
  function restoreChunk(count = 5) {
    if (removedNodes.length === 0) return;

    const contentParent = cachedContentParent || getContentParent(getScrollContainer());
    if (!contentParent) return;

    const insertPoint = placeholder || contentParent.firstChild;
    const toRestore = removedNodes.splice(-count); // Take from end (newest hidden)

    toRestore.reverse().forEach(data => {
      reloadImages(data);
      contentParent.insertBefore(data.node, insertPoint);
      totalRemovedHeight -= data.height;
    });

    if (removedNodes.length === 0 && placeholder) {
      placeholder.remove();
      placeholder = null;
    } else {
      updatePlaceholder();
    }

    console.log(`Claude Leash: Restored ${toRestore.length} blocks, ${removedNodes.length} remaining`);
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

    const checkScroll = () => {
      const container = getScrollContainer();
      if (!container || removedNodes.length === 0) return;

      const scrollTop = container.scrollTop;

      // If user scrolled up to near the top (within 200px), restore some content
      if (scrollTop < 200 && scrollTop < lastScrollTop) {
        restoreChunk(3);
      }

      lastScrollTop = scrollTop;
    };

    // Debounced scroll handler
    let scrollTimer = null;
    document.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(checkScroll, 150);
    }, true);
  }

  // ============ Watchers ============

  function watchUrlChanges() {
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        // Full reset on URL change
        removedNodes = [];
        totalRemovedHeight = 0;
        placeholder = null;
        cachedContainer = null;
        cachedContentParent = null;
        originalTotalHeight = 0;

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

  function watchNewContent() {
    let debounceTimer = null;
    let lastChildCount = 0;

    const observer = new MutationObserver(() => {
      // Only react if we're collapsed and content might have grown
      if (!currentSettings.isCollapsed) return;

      const contentParent = cachedContentParent || getContentParent(getScrollContainer());
      if (!contentParent) return;

      const currentCount = getContentChildren(contentParent).length;
      if (currentCount === lastChildCount) return;
      lastChildCount = currentCount;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applyCollapse(currentSettings.maxHeight, true);
      }, 1000);
    });

    observer.observe(document.body, { childList: true, subtree: true });
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
          const container = getScrollContainer();
          const totalHeight = container ? container.scrollHeight : 0;
          sendResponse({
            success: true,
            total: totalHeight + totalRemovedHeight,
            totalHeight: totalHeight + totalRemovedHeight,
            removedCount: removedNodes.length,
            removedHeight: totalRemovedHeight
          });
          break;

        case 'debug':
          cachedContainer = null;
          cachedContentParent = null;
          const cont = getScrollContainer(true);
          console.log('Claude Leash DEBUG:');
          console.log('  Interface:', isClaudeCode() ? 'Claude Code Web' : 'Claude.ai');
          console.log('  Removed nodes:', removedNodes.length);
          console.log('  Removed height:', totalRemovedHeight);

          if (cont) {
            const contRect = cont.getBoundingClientRect();
            console.log('  Container:', {
              scrollHeight: cont.scrollHeight,
              clientHeight: cont.clientHeight,
              left: Math.round(contRect.left),
              width: Math.round(contRect.width)
            });

            cont.style.outline = '3px solid red';
            const contentParent = getContentParent(cont);
            if (contentParent) {
              contentParent.style.outline = '3px solid orange';
              const children = getContentChildren(contentParent);
              console.log('  Content parent children:', children.length);

              children.slice(0, 5).forEach((el, i) => {
                const rect = el.getBoundingClientRect();
                console.log(`    [${i}] h=${Math.round(rect.height)}px`);
                el.style.outline = `2px solid ${i % 2 === 0 ? 'blue' : 'green'}`;
              });

              setTimeout(() => {
                cont.style.outline = '';
                contentParent.style.outline = '';
                children.forEach(el => el.style.outline = '');
              }, 5000);
            }

            sendResponse({
              success: true,
              found: getContentChildren(contentParent).length,
              scrollHeight: cont.scrollHeight,
              removedCount: removedNodes.length
            });
          } else {
            console.log('  No container found!');
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
    watchUrlChanges();
    watchNewContent();
    setupScrollDetection();

    // Initial badge update
    setTimeout(() => {
      const container = getScrollContainer();
      const totalHeight = container ? container.scrollHeight : 0;
      updateBadge(totalHeight, totalHeight, currentSettings.isCollapsed);
    }, 1000);
  }

  init();
  console.log('Claude Leash: Loaded (placeholder mode)');
})();
