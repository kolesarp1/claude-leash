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
      // Strategy: Find elements containing font-user-message or font-claude-response
      // These are the actual message blocks we want to hide/show
      
      const userMessages = document.querySelectorAll('[class*="font-user-message"]');
      const claudeResponses = document.querySelectorAll('[class*="font-claude-response"]');
      
      console.log('Claude.ai: Raw counts - user:', userMessages.length, 'claude:', claudeResponses.length);
      
      // Find top-level message containers
      // For user messages: walk up to find a reasonable container
      const foundContainers = new Set();

      // Process user messages
      for (const userMsg of userMessages) {
        let container = userMsg;
        // Walk up to find a container that's a reasonable size
        for (let i = 0; i < 8; i++) {
          const parent = container.parentElement;
          if (!parent) break;

          const rect = parent.getBoundingClientRect();
          // Stop if we hit a very wide container (likely the main scroll area)
          if (rect.width > 900) break;
          // Stop if we hit something with many children (likely the turn list)
          const siblings = [...parent.children].filter(c => c.tagName === 'DIV');
          if (siblings.length > 3) {
            // This parent is the turn list, so current container is the turn
            break;
          }
          container = parent;
        }

        // Check if this container has siblings with images (attachments)
        // If so, go up one more level to include attachments
        const containerParent = container.parentElement;
        if (containerParent) {
          const siblingImages = containerParent.querySelectorAll(':scope > div img, :scope > div [class*="image"], :scope > div [class*="attachment"]');
          const parentRect = containerParent.getBoundingClientRect();
          if (siblingImages.length > 0 && parentRect.width <= 900) {
            // Check parent's parent to see if it's the turn list
            const grandparent = containerParent.parentElement;
            if (grandparent) {
              const grandSiblings = [...grandparent.children].filter(c => c.tagName === 'DIV');
              if (grandSiblings.length > 2) {
                // Parent is the turn container that includes both text and attachments
                container = containerParent;
              }
            }
          }
        }

        foundContainers.add(container);
      }
      
      // Process Claude responses similarly
      for (const resp of claudeResponses) {
        // Skip if nested inside another claude-response
        let isNested = false;
        let parent = resp.parentElement;
        while (parent) {
          if (parent.className?.includes?.('font-claude-response')) {
            isNested = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (isNested) continue;
        
        let container = resp;
        for (let i = 0; i < 8; i++) {
          const parent = container.parentElement;
          if (!parent) break;
          
          const rect = parent.getBoundingClientRect();
          if (rect.width > 900) break;
          const siblings = [...parent.children].filter(c => c.tagName === 'DIV');
          if (siblings.length > 3) break;
          container = parent;
        }
        foundContainers.add(container);
      }
      
      // Also find standalone image containers in the conversation
      // These may be file attachments that aren't inside text message containers
      // Only look for LARGE images (actual screenshots, not avatars/icons)
      const allImages = document.querySelectorAll('img');
      for (const img of allImages) {
        const imgRect = img.getBoundingClientRect();
        // Skip small images (icons, avatars) - real screenshots are usually >150px
        if (imgRect.width < 150 || imgRect.height < 100) continue;
        if (imgRect.left < 100) continue; // Skip sidebar images

        // Walk up to find a reasonable container
        let container = img;
        for (let i = 0; i < 10; i++) {
          const parent = container.parentElement;
          if (!parent) break;

          const rect = parent.getBoundingClientRect();
          if (rect.width > 900) break;
          const siblings = [...parent.children].filter(c => c.tagName === 'DIV');
          if (siblings.length > 3) break;
          container = parent;
        }

        // Only add if in conversation area and not already in a found container
        const rect = container.getBoundingClientRect();
        const alreadyFound = [...foundContainers].some(fc => fc.contains(container) || container.contains(fc));
        if (!alreadyFound && rect.left > 100 && rect.width > 100 && rect.height > 50) {
          foundContainers.add(container);
          console.log('Claude.ai: Found standalone image at y=' + Math.round(rect.top), 'size=' + Math.round(imgRect.width) + 'x' + Math.round(imgRect.height));
        }
      }

      // Convert to array and filter out tiny/invisible elements and UI components
      messages = [...foundContainers].filter(el => {
        const rect = el.getBoundingClientRect();
        // Must have reasonable size
        if (rect.height < 30 || rect.width < 100) return false;
        // Skip elements that are just model selectors or other UI
        const text = el.innerText?.trim() || '';
        const hasImage = el.querySelector('img') !== null;
        // Allow elements with images even if text is short
        if (text.length < 20 && !hasImage) return false;
        // Skip if it's in the input area (bottom of page, near Reply input)
        if (rect.top > window.innerHeight - 200 && rect.height < 150) return false;
        return true;
      });
      
      console.log('Claude.ai: Found', messages.length, 'message containers');
      
      // If we have too many (found individual blocks not turns), try to pair them
      // Count unique user messages as our turn count
      const turnCount = userMessages.length;
      console.log('Claude.ai: User turn count:', turnCount);
      
      console.log('Claude.ai: Total found:', messages.length);
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
    // If we have cached messages, use them for accurate count
    const messages = cachedMessages.length > 0 ? cachedMessages : findMessages();
    const hidden = messages.filter(m => m.style.display === 'none').length;
    const total = originalTotal > 0 ? originalTotal : messages.length;
    const visible = total - hidden;

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
    
    // First, unhide everything to get accurate message list
    cachedMessages.forEach(msg => msg.style.removeProperty('display'));
    
    // Find all messages (now that nothing is hidden)
    const messages = findMessages();
    cachedMessages = messages; // Cache for later
    originalTotal = messages.length; // Track original total
    
    const total = messages.length;
    const hideCount = Math.max(0, total - keepVisible);
    let actuallyHidden = 0;

    console.log(`Claude Leash: ${isCollapsed ? 'COLLAPSING' : 'EXPANDING'} - total: ${total}, keep: ${keepVisible}, will hide: ${isCollapsed ? hideCount : 0}`);

    messages.forEach((msg, i) => {
      if (i < hideCount && isCollapsed) {
        msg.style.setProperty('display', 'none', 'important');
        actuallyHidden++;
      } else {
        msg.style.removeProperty('display');
      }
    });
    
    console.log(`Claude Leash: Applied - ${actuallyHidden} hidden, ${total - actuallyHidden} visible`);

    // Refresh scrollbar after DOM changes
    setTimeout(refreshScrollbar, 100);

    // Update badge
    setTimeout(reportStatus, 150);

    return {
      success: true,
      total,
      hidden: actuallyHidden,
      visible: total - actuallyHidden
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
