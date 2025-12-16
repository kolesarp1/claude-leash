---
description: Debug extension issues with systematic troubleshooting
---

# Extension Debugging

Help me debug an issue with Claude Leash by following a systematic troubleshooting process.

## Initial Information Gathering

Please describe the issue:
1. **Symptom**: What's not working as expected?
2. **Environment**:
   - Chrome version
   - Extension version
   - Platform (claude.ai or code.anthropic.com)
   - OS

3. **Steps to Reproduce**:
   - What actions lead to the issue?
   - Is it consistent or intermittent?

## Debugging Checklist

### 1. Console Inspection
- [ ] Open Chrome DevTools (F12)
- [ ] Check Console tab for errors
- [ ] Look for `[Claude Leash]` prefixed messages
- [ ] Note any red errors or yellow warnings

### 2. Extension Status
- [ ] Extension loaded: chrome://extensions/
- [ ] Extension enabled for current site
- [ ] Popup opens without errors
- [ ] Settings values are correct

### 3. Platform Detection
- [ ] Current URL matches expected pattern
- [ ] Badge appears on extension icon
- [ ] Badge color correct (blue=Claude.ai, green=Claude Code)
- [ ] Platform toggle enabled in popup

### 4. Container Detection
- [ ] Enable Debug Mode in popup
- [ ] Click "Scan DOM" button
- [ ] Check console for container candidates
- [ ] Verify sidebar excluded (score < 0)
- [ ] Verify main container selected (highest score)

### 5. Storage Inspection
```javascript
// Run in console
chrome.storage.local.get(null, console.log);
```
- [ ] Settings present in storage
- [ ] Values match expected types
- [ ] No corrupted data

### 6. Message Passing
- [ ] Open background service worker console:
  chrome://extensions/ → Click "service worker"
- [ ] Check for message passing errors
- [ ] Verify badge update messages sent

### 7. Performance
- [ ] DevTools → Performance tab
- [ ] Record 10-second scrolling
- [ ] Check FPS, paint duration, CPU usage
- [ ] Look for long tasks (>50ms)

## Common Issues & Solutions

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Extension not working | Wrong URL pattern | Check manifest.json host_permissions |
| No messages hidden | Container not detected | Run "Scan DOM", check detection logic |
| Badge not updating | Message passing failure | Check background worker console |
| Messages reappear | React hydration conflict | Verify requestIdleCallback timing |
| High CPU usage | Observer firing too often | Check debouncing logic |

## Debug Mode Features

When Debug Mode is enabled:
- Verbose console logging
- DOM scanner tool
- Container highlighter
- Height calculation logs

## Advanced Debugging

For persistent issues:
1. **Test in Incognito**: Rule out other extensions
2. **Fresh Profile**: Create new Chrome profile
3. **Reload Extension**: chrome://extensions/ → Reload
4. **Check File Permissions**: Ensure files readable
5. **Review Recent Changes**: Git log for breaking changes

Please provide the symptom and I'll guide you through the relevant debugging steps.
