// Claude Leash - Content Script
// Works on both Claude Code Web and regular Claude.ai
(function() {
  'use strict';

  const STORAGE_KEY = 'claudeCollapseSettings';
  let currentSettings = { keepVisible: 8, isCollapsed: false };
  let lastUrl = location.href;
  let cachedMessages = []; // Cache found messages to track total even when hidden
  let originalTotal = 0; // Track original count before hiding

  // Load settings from storage
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        currentSettings = result[STORAGE_KEY];
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
      // Strategy: Find the main conversation container and get its direct children
      // which should be the conversation turns
      
      // Look for the main scroll container in the conversation area
      const scrollContainers = document.querySelectorAll('[class*="overflow-y-auto"]');
      
      for (const container of scrollContainers) {
        const rect = container.getBoundingClientRect();
        // Main conversation area should be large and on the right side
        if (rect.width < 300 || rect.height < 200 || rect.left < 200) continue;
        
        // Walk down to find the level with conversation turns
        let current = container;
        for (let depth = 0; depth < 15; depth++) {
          const children = [...current.children].filter(c => c.tagName === 'DIV');
          
          // Check if these children look like conversation turns
          // (each should have substantial content and there should be multiple)
          const substantialChildren = children.filter(c => {
            const text = c.innerText || '';
            return text.length > 30;
          });
          
          if (substantialChildren.length >= 2) {
            // Found it! These are our conversation turns
            messages = substantialChildren;
            console.log('Claude Code: Found', messages.length, 'turns at depth', depth);
            break;
          }
          
          // Go one level deeper
          const firstChild = current.querySelector(':scope > div');
          if (!firstChild) break;
          current = firstChild;
        }
        
        if (messages.length > 0) break;
      }
      
      // Fallback: use individual bubbles if we couldn't find turns
      if (messages.length === 0) {
        const bubbles = document.querySelectorAll('.bg-bg-200.rounded-lg.px-3.py-2');
        messages = [...bubbles].filter(el => {
          const text = el.innerText || '';
          if (text.length < 20) return false;
          const rect = el.getBoundingClientRect();
          if (rect.left < 200) return false;
          return true;
        });
        console.log('Claude Code: Fallback - using', messages.length, 'bubbles');
      }
    } else {
      // === Regular Claude.ai ===
      // Simple approach: count user messages, hide everything above a cutoff point

      const userMessages = [...document.querySelectorAll('[class*="font-user-message"]')];
      console.log('Claude.ai: Found', userMessages.length, 'user messages');

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

          console.log('Claude.ai: Found', allChildren.length, 'hideable elements at message list level');
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
  function applyCollapse(keepVisible, isCollapsed) {
    currentSettings = { keepVisible, isCollapsed };

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
    const hideCount = Math.max(0, total - keepVisible);
    let actuallyHidden = 0;

    console.log(`Claude Leash: ${isCollapsed ? 'COLLAPSING' : 'EXPANDING'} - total: ${total}, keep: ${keepVisible}, will hide: ${isCollapsed ? hideCount : 0}`);

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

        console.log(`Claude Leash: Cutoff at element index ${cutoffIndex}, hiding ${actuallyHidden} of ${allElements.length}`);
      }
    }

    console.log(`Claude Leash: Applied - ${actuallyHidden} elements hidden, keeping ${keepVisible} messages`);

    // Refresh scrollbar after DOM changes
    setTimeout(refreshScrollbar, 100);

    // Update badge
    setTimeout(reportStatus, 150);

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
        setTimeout(() => {
          if (currentSettings.isCollapsed) {
            applyCollapse(currentSettings.keepVisible, currentSettings.isCollapsed);
          } else {
            reportStatus();
          }
        }, 500);
      }
    }, 300);
  }

  // Watch for new messages
  function watchNewMessages() {
    const observer = new MutationObserver((mutations) => {
      clearTimeout(window.cccMutationDebounce);
      window.cccMutationDebounce = setTimeout(() => {
        if (currentSettings.isCollapsed) {
          applyCollapse(currentSettings.keepVisible, currentSettings.isCollapsed);
        } else {
          reportStatus();
        }
      }, 500);
    });

    const scrollContainer = document.querySelector('[class*="overflow-y-auto"]');
    const target = scrollContainer || document.body;
    observer.observe(target, { childList: true, subtree: true });
  }

  // Listen for messages from popup and background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      switch (message.action) {
        case 'collapse':
          const result = applyCollapse(message.keepVisible, message.isCollapsed);
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
    setTimeout(reportStatus, 1000);
  }

  init();
  console.log('Claude Leash: Loaded for', isClaudeCode() ? 'Claude Code' : 'Claude.ai');

})();
