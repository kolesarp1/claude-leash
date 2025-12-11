// Claude Leash - Content Script
// Works on both Claude Code Web and regular Claude.ai
(function() {
  'use strict';

  const STORAGE_KEY = 'claudeCollapseSettings';
  let currentSettings = { keepVisible: 8, isCollapsed: false, cropMode: 'messages', maxLines: 500 };
  let lastUrl = location.href;
  let cachedMessages = []; // Cache found messages to track total even when hidden
  let originalTotal = 0; // Track original count before hiding
  let isApplying = false; // Prevent re-entry during apply

  // Count approximate lines in an element based on text content
  function countLines(element) {
    const text = element.innerText || '';
    // Count actual newlines
    const newlines = (text.match(/\n/g) || []).length;
    // Estimate additional wrapping lines based on text length and avg chars per line (~80 chars)
    const avgCharsPerLine = 80;
    const estimatedWrapLines = Math.floor(text.length / avgCharsPerLine);
    // Use the higher estimate - either newlines or wrapped text
    return Math.max(newlines + 1, estimatedWrapLines);
  }

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        currentSettings = {
          keepVisible: result[STORAGE_KEY].keepVisible || 8,
          isCollapsed: result[STORAGE_KEY].isCollapsed || false,
          cropMode: result[STORAGE_KEY].cropMode || 'messages',
          maxLines: result[STORAGE_KEY].maxLines || 500
        };
      }
    } catch (e) {}
  }

  // Detect which Claude interface we're on
  function isClaudeCode() {
    return location.pathname.startsWith('/code');
  }

  // Find the scroll container
  function getScrollContainer() {
    const containers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
    for (const container of containers) {
      const rect = container.getBoundingClientRect();
      if (rect.height > 200 && rect.width > 200) {
        return container;
      }
    }
    return null;
  }

  // Force scroll container to recalculate
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

  // Find message elements
  function findMessages() {
    let messages = [];
    
    if (isClaudeCode()) {
      // === Claude Code Web ===
      // Find conversation container and get all message elements

      // Find the main conversation container
      const scrollContainers = document.querySelectorAll('[class*="overflow-y-auto"]');
      let bestContainer = null;
      let bestMessages = [];

      for (const container of scrollContainers) {
        const rect = container.getBoundingClientRect();
        // Main conversation should be large, tall, and NOT in the left sidebar
        // Sidebar is typically < 400px from left edge
        if (rect.width < 300 || rect.height < 200) continue;
        if (rect.left < 400 && rect.width < 600) continue; // Skip sidebar

        // Find the message list level by drilling down
        let messageList = container;
        for (let depth = 0; depth < 10; depth++) {
          const children = [...messageList.children].filter(c => c.tagName === 'DIV');

          // Check if this level has multiple substantial children (messages)
          const substantial = children.filter(c => {
            const text = c.innerText || '';
            const childRect = c.getBoundingClientRect();
            return text.length > 30 && childRect.height > 50;
          });

          if (substantial.length > bestMessages.length) {
            bestMessages = substantial;
            bestContainer = messageList;
          }

          // Go deeper
          const firstChild = children.find(c => {
            const childRect = c.getBoundingClientRect();
            return childRect.height > 100;
          });
          if (firstChild) {
            messageList = firstChild;
          } else {
            break;
          }
        }
      }

      if (bestMessages.length > 0) {
        messages = bestMessages;
        window.claudeLeashAllElements = bestMessages;
        // For Claude Code, messages ARE the user messages for now (no separate tracking)
        window.claudeLeashUserMessages = bestMessages;
      }
    } else {
      // === Regular Claude.ai ===
      // Simple approach: count user messages, hide everything above a cutoff point

      const userMessages = [...document.querySelectorAll('[class*="font-user-message"]')];

      if (userMessages.length > 0) {
        // Sort user messages by vertical position
        userMessages.sort((a, b) => {
          return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        });

        // Find the conversation container (walk up from first user message)
        let conversationContainer = null;
        let current = userMessages[0];
        for (let i = 0; i < 20; i++) {
          const parent = current.parentElement;
          if (!parent) break;
          const rect = parent.getBoundingClientRect();
          if (rect.width > 900) {
            conversationContainer = parent;
            break;
          }
          current = parent;
        }

        if (conversationContainer) {
          // Find the actual message list - look for container with many children
          let messageList = conversationContainer;
          for (let depth = 0; depth < 5; depth++) {
            const children = [...messageList.children].filter(c => c.tagName === 'DIV');
            if (children.length > 5) {
              // Found the level with many children
              break;
            }
            // Go deeper - find first substantial child
            const firstChild = children.find(c => {
              const rect = c.getBoundingClientRect();
              return rect.height > 100;
            });
            if (firstChild) {
              messageList = firstChild;
            } else {
              break;
            }
          }

          // Get all children at this level
          const allChildren = [...messageList.children].filter(el => {
            if (el.tagName !== 'DIV') return false;
            const rect = el.getBoundingClientRect();
            return rect.height > 30 && rect.width > 100;
          });

          // Store user messages and all hideable elements
          messages = userMessages; // For counting
          window.claudeLeashAllElements = allChildren; // For hiding
          window.claudeLeashUserMessages = userMessages; // For cutoff point
        } else {
          messages = userMessages;
        }
      }
    }
    
    // Sort by vertical position
    messages.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      return rectA.top - rectB.top;
    });
    
    return messages;
  }

  // Report status to background script for badge update
  function reportStatus() {
    const total = originalTotal > 0 ? originalTotal : (cachedMessages.length || findMessages().length);

    // Calculate visible based on settings
    let visible = total;
    if (currentSettings.isCollapsed) {
      visible = Math.min(currentSettings.keepVisible, total);
    }
    const hidden = total - visible;

    chrome.runtime.sendMessage({
      action: 'updateBadge',
      visible,
      total,
      isCollapsed: currentSettings.isCollapsed
    }).catch(() => {});

    return { visible, total, hidden };
  }

  // Apply collapse/expand
  function applyCollapse(keepVisible, isCollapsed, cropMode = 'messages', maxLines = 500) {
    if (isApplying) return { success: true, total: originalTotal, hidden: 0, visible: originalTotal };
    isApplying = true;
    currentSettings = { keepVisible, isCollapsed, cropMode, maxLines };

    // First, unhide everything
    if (window.claudeLeashAllElements) {
      window.claudeLeashAllElements.forEach(el => el.style.removeProperty('display'));
    }
    cachedMessages.forEach(msg => msg.style.removeProperty('display'));

    // Find all messages (user messages for counting)
    const messages = findMessages();
    cachedMessages = messages;
    originalTotal = messages.length;

    const total = messages.length; // Number of user messages
    let actuallyHidden = 0;
    let hideCount = 0;

    if (cropMode === 'lines') {
      // Line-based cropping

      if (isCollapsed && window.claudeLeashAllElements && window.claudeLeashAllElements.length > 0) {
        const allElements = window.claudeLeashAllElements;

        // Count lines from the bottom up
        let totalLinesFromBottom = 0;
        let cutoffIndex = allElements.length; // Start assuming nothing is hidden

        // Go backwards through elements, counting lines
        for (let i = allElements.length - 1; i >= 0; i--) {
          const elementLines = countLines(allElements[i]);
          totalLinesFromBottom += elementLines;

          if (totalLinesFromBottom > maxLines) {
            // We've exceeded max lines, this element and everything before it should be hidden
            cutoffIndex = i;
            break;
          }
        }

        // Hide all elements up to and including the cutoff index
        if (cutoffIndex < allElements.length) {
          for (let i = 0; i <= cutoffIndex; i++) {
            allElements[i].style.setProperty('display', 'none', 'important');
            actuallyHidden++;
          }
        }

        // Count hidden user messages for reporting
        if (window.claudeLeashUserMessages) {
          hideCount = window.claudeLeashUserMessages.filter(msg =>
            msg.closest && allElements.slice(0, cutoffIndex + 1).some(el => el.contains(msg))
          ).length;
        }
      }
    } else {
      // Message-based cropping (original behavior)
      hideCount = Math.max(0, total - keepVisible);

      if (isCollapsed && hideCount > 0 && window.claudeLeashUserMessages && window.claudeLeashAllElements) {
        // Find the cutoff user message (the last one we want to hide)
        const cutoffUserMsg = window.claudeLeashUserMessages[hideCount - 1];
        if (cutoffUserMsg) {
          // Find which element in allElements contains or comes after the cutoff
          // Use DOM order, not visual positions (which change with scroll)
          const allElements = window.claudeLeashAllElements;

          // Find the index of the element containing the cutoff user message
          let cutoffIndex = -1;
          for (let i = 0; i < allElements.length; i++) {
            if (allElements[i].contains(cutoffUserMsg)) {
              cutoffIndex = i;
              break;
            }
          }

          // If not found directly, find elements that come before the first visible user message
          if (cutoffIndex === -1) {
            const firstVisibleUserMsg = window.claudeLeashUserMessages[hideCount];
            if (firstVisibleUserMsg) {
              for (let i = 0; i < allElements.length; i++) {
                if (allElements[i].contains(firstVisibleUserMsg)) {
                  cutoffIndex = i - 1; // Hide everything before this
                  break;
                }
              }
            }
          }

          // Hide all elements up to and including the cutoff index
          if (cutoffIndex >= 0) {
            for (let i = 0; i <= cutoffIndex; i++) {
              allElements[i].style.setProperty('display', 'none', 'important');
              actuallyHidden++;
            }
          }
        }
      }
    }

    // Refresh scrollbar after DOM changes
    setTimeout(refreshScrollbar, 100);

    // Update badge and clear re-entry lock
    setTimeout(() => {
      reportStatus();
      isApplying = false;
    }, 200);

    return {
      success: true,
      total,
      hidden: hideCount,
      visible: total - hideCount
    };
  }

  // Get current status
  function getStatus() {
    const messages = findMessages();
    const hidden = messages.filter(m => m.style.display === 'none').length;
    
    return {
      success: true,
      total: messages.length,
      hidden,
      visible: messages.length - hidden
    };
  }

  // Watch for URL changes
  function watchUrlChanges() {
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        // Reset cached data on URL change
        cachedMessages = [];
        originalTotal = 0;
        window.claudeLeashAllElements = null;
        window.claudeLeashUserMessages = null;

        // For Claude Code Web, wait longer and retry multiple times
        // because session content loads asynchronously
        const retryDelays = isClaudeCode() ? [500, 1000, 2000, 3000] : [500];
        retryDelays.forEach(delay => {
          setTimeout(() => {
            if (currentSettings.isCollapsed) {
              applyCollapse(currentSettings.keepVisible, currentSettings.isCollapsed, currentSettings.cropMode, currentSettings.maxLines);
            } else {
              reportStatus();
            }
          }, delay);
        });
      }
    }, 300);
  }

  // Watch for new messages
  function watchNewMessages() {
    const observer = new MutationObserver((mutations) => {
      clearTimeout(window.cccMutationDebounce);
      window.cccMutationDebounce = setTimeout(() => {
        if (currentSettings.isCollapsed) {
          applyCollapse(currentSettings.keepVisible, currentSettings.isCollapsed, currentSettings.cropMode, currentSettings.maxLines);
        } else {
          reportStatus();
        }
      }, 500);
    });

    // Observe document body to catch all changes including session switches
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Periodic check for Claude Code Web - reapply if messages are found but not hidden
  function watchForLateContent() {
    if (!isClaudeCode()) return;

    setInterval(() => {
      if (!currentSettings.isCollapsed) return;

      // Temporarily unhide everything to get accurate count
      const hiddenElements = [];
      if (window.claudeLeashAllElements) {
        window.claudeLeashAllElements.forEach(el => {
          if (el.style.display === 'none') {
            hiddenElements.push(el);
            el.style.removeProperty('display');
          }
        });
      }

      // Check if we should reapply (new content added)
      const messages = findMessages();
      const newTotal = messages.length;

      // Re-hide what was hidden before
      hiddenElements.forEach(el => el.style.setProperty('display', 'none', 'important'));

      // Only reapply if total INCREASED (new messages added)
      if (newTotal > originalTotal && originalTotal > 0) {
        applyCollapse(currentSettings.keepVisible, currentSettings.isCollapsed, currentSettings.cropMode, currentSettings.maxLines);
      }
    }, 2000);
  }

  // Listen for messages from popup and background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      switch (message.action) {
        case 'collapse':
          const result = applyCollapse(message.keepVisible, message.isCollapsed, message.cropMode, message.maxLines);
          sendResponse(result);
          break;
          
        case 'getStatus':
          sendResponse(getStatus());
          break;

        case 'reportStatus':
          reportStatus();
          sendResponse({ success: true });
          break;
        
        case 'debug':
          const msgs = findMessages();
          console.log('Claude Leash DEBUG: Found', msgs.length, 'elements');
          
          // Also show what the class-based selectors find directly
          const userMsgsByClass = document.querySelectorAll('[class*="font-user-message"]');
          const claudeRespByClass = document.querySelectorAll('[class*="font-claude-response"]');
          console.log('Direct class search: user-message:', userMsgsByClass.length, 'claude-response:', claudeRespByClass.length);
          
          msgs.forEach((el, i) => {
            const rect = el.getBoundingClientRect();
            const hasUserMsg = el.querySelector('[class*="font-user-message"]') !== null;
            const hasClaudeResp = el.querySelector('[class*="font-claude-response"]') !== null;
            const display = el.style.display || 'default';
            console.log(`  ${i}: pos=(${Math.round(rect.left)},${Math.round(rect.top)}) size=${Math.round(rect.width)}x${Math.round(rect.height)} display="${display}" user:${hasUserMsg} claude:${hasClaudeResp} text="${el.innerText?.slice(0, 40)}"`);
            
            // Highlight with different colors based on visibility
            if (rect.width > 0 && rect.height > 0) {
              const color = display === 'none' ? 'gray' : (i % 2 === 0 ? 'red' : 'blue');
              el.style.outline = `3px solid ${color}`;
              el.style.outlineOffset = '2px';
              setTimeout(() => { 
                el.style.outline = ''; 
                el.style.outlineOffset = ''; 
              }, 5000);
            }
          });
          
          // Also try to show what's NOT being found
          if (msgs.length === 0) {
            console.log('No messages found! Trying to identify conversation area...');
            
            // Show what font-user-message elements look like
            if (userMsgsByClass.length > 0) {
              console.log('User message elements found but not extracted as turns:');
              userMsgsByClass.forEach((el, i) => {
                const rect = el.getBoundingClientRect();
                console.log(`  User ${i}: pos=(${Math.round(rect.left)},${Math.round(rect.top)}) text="${el.innerText?.slice(0, 40)}"`);
              });
            }
          }
          
          sendResponse({ success: true, found: msgs.length });
          break;
        
        case 'scan':
          console.log('=== Claude Leash DOM Scanner ===');
          console.log('Interface:', isClaudeCode() ? 'Claude Code' : 'Claude.ai');
          
          if (isClaudeCode()) {
            // Scan for Claude Code turn structure
            console.log('Scanning for conversation turns...');
            
            const scrollContainers = document.querySelectorAll('[class*="overflow-y-auto"]');
            
            for (const container of scrollContainers) {
              const rect = container.getBoundingClientRect();
              if (rect.width < 300 || rect.left < 200) continue;
              
              console.log(`Container: ${Math.round(rect.width)}x${Math.round(rect.height)} at left=${Math.round(rect.left)}`);
              
              let current = container;
              for (let depth = 0; depth < 10; depth++) {
                const children = [...current.children].filter(c => c.tagName === 'DIV');
                const substantial = children.filter(c => (c.innerText?.length || 0) > 30);
                
                console.log(`  Depth ${depth}: ${children.length} children, ${substantial.length} substantial`);
                
                if (substantial.length >= 2) {
                  console.log('  ^ Found conversation turns!');
                  substantial.slice(0, 3).forEach((turn, j) => {
                    turn.style.outline = '3px solid ' + ['red', 'blue', 'green'][j];
                    turn.style.outlineOffset = '2px';
                    console.log(`    Turn ${j}: "${turn.innerText?.slice(0, 50)}..."`);
                    setTimeout(() => { turn.style.outline = ''; turn.style.outlineOffset = ''; }, 5000);
                  });
                  break;
                }
                
                const firstChild = current.querySelector(':scope > div');
                if (!firstChild) break;
                current = firstChild;
              }
              break; // Only scan first large container
            }
          } else {
            // Scan for Claude.ai elements using class-based detection
            console.log('Scanning Claude.ai...');
            
            // Show what the class selectors find
            const userMsgs = document.querySelectorAll('[class*="font-user-message"]');
            const claudeResps = document.querySelectorAll('[class*="font-claude-response"]');
            
            console.log('Class-based detection:');
            console.log('  font-user-message elements:', userMsgs.length);
            console.log('  font-claude-response elements:', claudeResps.length);
            
            // Highlight user messages
            userMsgs.forEach((el, i) => {
              const rect = el.getBoundingClientRect();
              console.log(`  User ${i}: pos=(${Math.round(rect.left)},${Math.round(rect.top)}) size=${Math.round(rect.width)}x${Math.round(rect.height)} text="${el.innerText?.slice(0, 30)}"`);
              el.style.outline = '3px solid green';
              el.style.outlineOffset = '2px';
              setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 5000);
            });
            
            // Now show what findMessages extracts
            const found = findMessages();
            console.log('findMessages() returned:', found.length, 'turn containers');
            
            if (found.length > 0) {
              console.log('Highlighting first 3 turn containers:');
              found.slice(0, 3).forEach((el, i) => {
                const rect = el.getBoundingClientRect();
                console.log(`  Turn ${i}: pos=(${Math.round(rect.left)},${Math.round(rect.top)}) size=${Math.round(rect.width)}x${Math.round(rect.height)}`);
                el.style.outline = '3px solid ' + ['red', 'blue', 'orange'][i];
                el.style.outlineOffset = '4px';
                setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 5000);
              });
            } else {
              console.log('No turn containers extracted! Check the turn container detection logic.');
            }
          }
          
          sendResponse({ success: true, message: 'Check console' });
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

  // Initialize
  async function init() {
    await loadSettings();
    watchUrlChanges();
    watchNewMessages();
    watchForLateContent();
    setTimeout(reportStatus, 1000);
  }

  init();
  console.log('Claude Leash: Loaded for', isClaudeCode() ? 'Claude Code' : 'Claude.ai');

})();
