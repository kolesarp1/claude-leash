# PR Checklist for Claude Leash

## Before Committing

### Version Sync
- [ ] `content.js` line 1 version updated (e.g., `v3.4.13`)
- [ ] `manifest.json` version matches exactly

### Code Quality
- [ ] No `console.log` outside `debugLog()` function
- [ ] No DOM removal (only CSS class toggling)
- [ ] New exclusion rules log via `debugLog()`

### Container Detection Changes
- [ ] Tested on Claude Code Web (`/code/*`)
- [ ] Tested on Claude.ai Chat (`/chat/*`) if enabled
- [ ] Verified sidebar is excluded (width should be > 800px)
- [ ] Score is reasonable (> 80000 for main content)

## Testing Checklist

### Basic Functionality
- [ ] Fresh page load detects container
- [ ] Collapse hides old messages
- [ ] Show All reveals all messages
- [ ] Badge shows correct "Xk" value
- [ ] Badge turns purple when collapsed

### Session Handling
- [ ] Switching sessions preserves state
- [ ] New session starts fresh
- [ ] Debug mode shows session ID changes

### Edge Cases
- [ ] Works with 100+ messages
- [ ] Works with code blocks and diffs
- [ ] No console errors during operation
- [ ] No "Hide/Restore" loop in debug output

## Commit Message Format

```
<Short description> (v<version>)

<Why this change was needed>
<What the change does>
```

Example:
```
Fix container detection for narrow viewports (v3.4.13)

On screens < 1200px wide, the 50% width threshold was too aggressive.
Lowered to 40% for better compatibility with smaller displays.
```
