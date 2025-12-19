// Background service worker - manages badge
const STORAGE_KEY = 'claudeCollapseSettings';

// Timing constants
const TAB_STATUS_CHECK_DELAY_MS = 500;

// Update badge with just visible amount in "Xk" format
function updateBadge(tabId, visible, total, isCollapsed) {
  if (total === 0) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  // Show visible amount rounded to nearest k
  const visibleK = Math.round(visible / 1000);
  const text = visibleK + 'k';
  chrome.action.setBadgeText({ tabId, text });

  // Purple when collapsed and hiding content, gray otherwise
  const color = isCollapsed && visible < total ? '#8b5cf6' : '#666666';
  chrome.action.setBadgeBackgroundColor({ tabId, color });
}

// Clear badge for non-Claude tabs
function clearBadge(tabId) {
  chrome.action.setBadgeText({ tabId, text: '' });
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateBadge' && sender.tab?.id) {
    updateBadge(
      sender.tab.id,
      message.visible,
      message.total,
      message.isCollapsed
    );
  }
  return true;
});

// Handle tab updates (URL changes, including SPA navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url?.includes('claude.ai')) {
    // Ask content script to report status after navigation
    if (changeInfo.status === 'complete' || changeInfo.url) {
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: 'reportStatus' }).catch(() => {});
      }, TAB_STATUS_CHECK_DELAY_MS);
    }
  } else {
    clearBadge(tabId);
  }
});

// Handle tab activation (switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url?.includes('claude.ai')) {
      chrome.tabs.sendMessage(activeInfo.tabId, { action: 'reportStatus' }).catch(() => {});
    } else {
      clearBadge(activeInfo.tabId);
    }
  } catch (e) {
    // Tab may have been closed or is not accessible
    console.debug('Claude Leash: Tab activation check failed:', e.message);
  }
});

console.log('Claude Chat Collapse: Background script loaded');
