# Claude Leash - Testing & Quality Assurance Guide

## Table of Contents
1. [Testing Philosophy](#testing-philosophy)
2. [Manual Testing Procedures](#manual-testing-procedures)
3. [Automated Testing Strategy](#automated-testing-strategy)
4. [Performance Testing](#performance-testing)
5. [Edge Cases & Boundary Conditions](#edge-cases--boundary-conditions)
6. [Browser Compatibility](#browser-compatibility)
7. [Regression Testing](#regression-testing)
8. [Bug Reporting](#bug-reporting)

---

## Testing Philosophy

### Core Principles

1. **User-Centric**: Test from the user's perspective
2. **Real-World Scenarios**: Test with actual Claude conversations
3. **Performance First**: Verify 60fps responsiveness
4. **Cross-Platform**: Test on both claude.ai and Claude Code Web
5. **Edge Cases Matter**: Test boundary conditions and unusual inputs

### Testing Pyramid for Chrome Extensions

```
           ┌─────────────┐
           │   Manual    │  ← User flows, visual verification
           │  Exploratory│
           └─────────────┘
          ┌───────────────┐
          │  Integration  │  ← Extension APIs, message passing
          │    Tests      │
          └───────────────┘
         ┌─────────────────┐
         │  Unit Tests     │  ← Pure functions, algorithms
         │ (Future)        │
         └─────────────────┘
```

**Current State**: Unit tests implemented with Jest, E2E tests with Puppeteer
**Coverage Goal**: 80% of core algorithms

---

## Manual Testing Procedures

### Pre-Testing Setup

**Required:**
1. Chrome browser (latest version)
2. Extension loaded in developer mode
3. Active Claude.ai or Claude Code Web account
4. Console open (F12) to monitor for errors

**Test Environments:**
- Fresh install (no existing settings)
- Existing install (with saved settings)
- Multiple tabs with Claude open
- Incognito mode (to test without other extensions)

---

### Test Suite 1: Basic Functionality

#### 1.1 Extension Installation

**Steps:**
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `claude-leash` folder
5. Verify extension icon appears in toolbar

**Expected:**
- ✅ Extension loads without errors
- ✅ Icon visible in toolbar (pin if needed)
- ✅ No console errors in extension background page

**Failure Indicators:**
- ❌ "Manifest file is missing or unreadable"
- ❌ "Required permissions not granted"
- ❌ Extension icon not visible

---

#### 1.2 Popup Interface

**Steps:**
1. Click extension icon
2. Verify all UI elements render correctly
3. Check default values match expectations

**Expected:**
- ✅ Popup opens without delay (<200ms)
- ✅ Slider at 10k (default)
- ✅ Both platform toggles enabled
- ✅ Theme selector on "Auto"
- ✅ HiDPI scale at 1.0x
- ✅ Debug mode unchecked

**Visual Verification:**
```
┌──────────────────────────┐
│  Claude Leash    v3.4.10 │
├──────────────────────────┤
│ ☑ Claude Code            │
│ ☑ Claude.ai              │
├──────────────────────────┤
│ Visible: [====○====] 10k │
├──────────────────────────┤
│ [  Collapse / Show All ] │
├──────────────────────────┤
│ Scale: [==○========] 1.0x│
│ Theme: [Auto ▼]          │
│ ☐ Debug Mode             │
└──────────────────────────┘
```

---

#### 1.3 Threshold Slider

**Steps:**
1. Open popup
2. Move slider left (toward 4k)
3. Observe value display update
4. Move slider right (toward 40k)
5. Observe badge update in real-time

**Expected:**
- ✅ Slider moves smoothly (60fps)
- ✅ Value display updates: "4k", "10k", "20k", etc.
- ✅ Badge updates on active tab
- ✅ Setting persists after popup close

**Test Values:**
| Slider Position | Expected Display | Badge Text |
|----------------|------------------|------------|
| Minimum | 4k | 4k |
| Default | 10k | 10k |
| Middle | 22k | 22k |
| Maximum | 40k | 40k |

---

#### 1.4 Collapse Toggle

**Steps:**
1. Open Claude conversation with 20+ messages
2. Click "Collapse" button
3. Verify messages hidden
4. Click "Show All" button
5. Verify messages restored

**Expected:**
- ✅ Button text toggles: "Collapse" ↔ "Show All"
- ✅ Older messages hidden immediately (<100ms)
- ✅ Placeholder appears: "N older messages hidden"
- ✅ All messages restored on "Show All"
- ✅ Scroll position maintained

---

#### 1.5 Platform Toggles

**Steps:**
1. Open popup on claude.ai tab
2. Uncheck "Claude.ai" toggle
3. Verify extension disabled on this platform
4. Switch to Claude Code Web tab
5. Verify extension still active there

**Expected:**
- ✅ Extension respects per-platform settings
- ✅ Badge disappears when platform disabled
- ✅ Settings persist across sessions
- ✅ Toggle state syncs immediately

**Platform Detection:**
| URL | Expected Platform | Badge Color |
|-----|------------------|-------------|
| https://claude.ai/chat/abc123 | Claude.ai | Blue (#3b82f6) |
| https://code.anthropic.com/project/xyz789 | Claude Code | Green (#10b981) |

---

### Test Suite 2: Message Hiding Logic

#### 2.1 Height Calculation

**Setup:**
1. Create conversation with messages of varying heights
2. Enable Debug Mode
3. Set threshold to 10k
4. Check console logs

**Test Messages:**
- Short message (~100px): "Hello"
- Medium message (~500px): Code snippet with 20 lines
- Long message (~2000px): Detailed explanation with lists

**Expected Console Output:**
```
[Claude Leash DEBUG] Container detected: <div class="...">
[Claude Leash DEBUG] Message heights: [120, 85, 500, 200, 1850, ...]
[Claude Leash DEBUG] Cumulative height: 12455px
[Claude Leash DEBUG] Hide index: 3 (hide messages 0-2)
```

**Verification:**
- ✅ Heights accurately measured
- ✅ Cumulative calculation from bottom-up
- ✅ Hide index correct (keeps threshold visible)

---

#### 2.2 Placeholder Behavior

**Steps:**
1. Trigger message hiding (threshold exceeded)
2. Verify placeholder appears at top
3. Click placeholder
4. Verify hidden messages restore
5. Scroll up to placeholder again
6. Verify progressive unhiding

**Expected:**
- ✅ Placeholder shows correct count: "5 older messages hidden. Click to show."
- ✅ Click restores all hidden messages
- ✅ Placeholder styling matches Claude theme
- ✅ Scrolling near placeholder reveals 5 messages at a time

**Placeholder Appearance:**
```
┌────────────────────────────────────────┐
│  [i] 12 older messages hidden.         │
│      Click to show.                    │
└────────────────────────────────────────┘
```

---

#### 2.3 Progressive Unhiding (Scroll-Based)

**Steps:**
1. Hide 20 messages (set low threshold)
2. Scroll to top of conversation
3. Wait 150ms (debounce delay)
4. Verify 5 messages appear
5. Scroll up again
6. Verify another 5 messages appear

**Expected:**
- ✅ Scroll to top triggers unhiding
- ✅ 5 messages revealed at a time
- ✅ Placeholder count updates: "15 older..." → "10 older..." → "5 older..."
- ✅ Smooth appearance (no jank)

---

### Test Suite 3: Session Management

#### 3.1 Session Detection

**Steps:**
1. Open Claude conversation A
2. Note session ID in URL
3. Verify badge shows visible amount
4. Click to conversation B
5. Verify session change detected
6. Return to conversation A
7. Verify state restored from cache

**Expected:**
- ✅ Session ID extracted correctly from URL
- ✅ Session change detected within 500ms
- ✅ Badge updates for new session
- ✅ Cached state restored on return (fast path)

**Debug Logs:**
```
[Claude Leash] Session changed: abc123 → xyz789
[Claude Leash] Cache miss for xyz789, detecting container
[Claude Leash] Session changed: xyz789 → abc123
[Claude Leash] Cache hit for abc123, using cached container
```

---

#### 3.2 Cache Validation

**Steps:**
1. Open conversation, let cache populate
2. Enable Debug Mode
3. Switch away and back
4. Check console for "Cache hit" message
5. Wait 30+ seconds
6. Switch away and back
7. Check for "Cache expired" message

**Expected:**
- ✅ Cache hit on return within 30s
- ✅ Cache miss after 30s timeout
- ✅ Fresh detection on cache miss
- ✅ No errors if cached element no longer in DOM

---

#### 3.3 Navigation Detection

**Steps:**
1. Open Claude.ai or Claude Code
2. Start new conversation (+ button)
3. Verify session change detected
4. Use browser back button
5. Verify session change detected
6. Click conversation in sidebar
7. Verify session change detected

**Expected:**
- ✅ History API hooks detect pushState
- ✅ popstate event detected on back/forward
- ✅ Polling fallback works if hooks fail (300ms max delay)

---

### Test Suite 4: Container Detection

#### 4.1 Multi-Strategy Detection

**Steps:**
1. Enable Debug Mode
2. Open Claude conversation
3. Click "Scan DOM" in popup
4. Review console output

**Expected Console Output:**
```
[Claude Leash DEBUG] Container candidates: 3
Candidate 0: score=-1000 (sidebar, excluded)
Candidate 1: score=25 (chat container, selected)
Candidate 2: score=5 (scrollable div, not main container)
[Claude Leash DEBUG] Selected container: <div class="overflow-y-auto...">
```

**Verification:**
- ✅ Sidebar excluded (score < 0)
- ✅ Main chat container highest score
- ✅ Container has overflow-y-auto or similar class
- ✅ Scrollable (scrollHeight > clientHeight)

---

#### 4.2 Sidebar Exclusion

**Steps:**
1. Enable Debug Mode
2. Click "Highlight Container" in popup
3. Verify sidebar NOT highlighted
4. Verify main chat area highlighted (green outline)

**Expected:**
- ✅ Sidebar excluded by flex-shrink detection
- ✅ Sidebar excluded by width < 400px detection
- ✅ Sidebar excluded by left position detection
- ✅ Only main container highlighted

**Sidebar Characteristics:**
```javascript
// Sidebar indicators
flexShrink: '0' or flex-shrink: 0
width: 200-350px
position: left edge of viewport
```

---

### Test Suite 5: Performance Testing

#### 5.1 Frame Rate Monitoring

**Setup:**
1. Open Chrome DevTools
2. Go to Performance tab
3. Start recording
4. Scroll up/down in long conversation (100+ messages)
5. Stop recording after 10 seconds

**Expected:**
- ✅ FPS stays above 50fps (average 60fps)
- ✅ No long tasks (>50ms)
- ✅ Paint operations <50ms each
- ✅ No layout thrashing (interleaved read/write)

**Performance Metrics:**
| Metric | With Extension | Without Extension |
|--------|----------------|-------------------|
| Average FPS | 58-60 fps | 20-30 fps |
| Paint Duration | 10-30ms | 100-300ms |
| CPU Usage | 5-15% | 40-60% |

---

#### 5.2 CPU Usage

**Steps:**
1. Open Task Manager (Chrome → More Tools → Task Manager)
2. Find "Tab: Claude.ai" or "Tab: Claude Code"
3. Observe CPU % while scrolling
4. Note peak and average values

**Expected:**
- ✅ CPU usage <20% during scrolling
- ✅ CPU returns to <5% when idle
- ✅ No runaway processes
- ✅ Lower CPU than without extension (in long conversations)

---

#### 5.3 Memory Footprint

**Steps:**
1. Open conversation with 200+ messages
2. Enable extension
3. Check Task Manager memory usage
4. Hide older messages (set threshold to 10k)
5. Check memory usage again

**Expected:**
- ❗ Memory usage does NOT decrease (expected behavior)
- ✅ DOM nodes remain in memory (display:none only)
- ✅ Memory growth rate slows (fewer paint operations)
- ✅ No memory leaks over time

**Note:** Extension optimizes rendering, not memory. Hidden elements still consume RAM.

---

### Test Suite 6: Theme Support

#### 6.1 Theme Switching

**Steps:**
1. Open popup
2. Set theme to "Light"
3. Verify popup uses light colors
4. Set theme to "Dark"
5. Verify popup uses dark colors
6. Set theme to "Auto"
7. Verify popup follows system preference

**Expected:**
- ✅ Theme changes apply immediately
- ✅ All UI elements adapt to theme
- ✅ No visual glitches during transition
- ✅ Placeholder styling matches Claude's theme

**Color Verification:**
| Theme | Background | Text | Accent |
|-------|------------|------|--------|
| Light | #ffffff | #1f2937 | #3b82f6 |
| Dark | #1f2937 | #f9fafb | #60a5fa |
| Auto | (system) | (system) | (system) |

---

#### 6.2 HiDPI Scaling

**Steps:**
1. Open popup on HiDPI display (Retina, 4K)
2. Set scale factor to 1.0x, 2.0x, 3.0x
3. Verify threshold calculations adjust
4. Check badge readability

**Expected:**
- ✅ Threshold multiplied by scale factor
- ✅ Badge text remains readable
- ✅ No layout breaking at high scale
- ✅ Setting persists across sessions

**Scale Factor Impact:**
| Scale | Threshold Setting | Actual Threshold | Badge |
|-------|------------------|------------------|-------|
| 1.0x | 10k | 10,000px | 10k |
| 2.0x | 10k | 20,000px | 10k |
| 3.0x | 10k | 30,000px | 10k |

---

### Test Suite 7: Edge Cases & Boundary Conditions

#### 7.1 Empty Conversation

**Steps:**
1. Start brand new conversation (0 messages)
2. Open popup, verify no errors
3. Adjust threshold, verify no crashes
4. Send first message, verify extension activates

**Expected:**
- ✅ No errors in console
- ✅ Badge shows "0k" or no badge
- ✅ No placeholder created
- ✅ Extension activates after first message

---

#### 7.2 Very Long Single Message

**Steps:**
1. Ask Claude for extremely long response (10k+ words)
2. Verify single message height measured correctly
3. Set threshold below message height
4. Verify message NOT hidden (threshold logic)

**Expected:**
- ✅ Height calculated correctly (>20,000px)
- ✅ Message remains visible (bottommost message never hidden)
- ✅ Badge shows actual visible height
- ✅ No performance degradation

---

#### 7.3 Rapid Session Switching

**Steps:**
1. Open 5+ conversations in separate tabs
2. Rapidly switch between tabs (every 500ms)
3. Monitor console for errors
4. Verify badge updates correctly
5. Return to first tab, verify state restored

**Expected:**
- ✅ No errors during rapid switching
- ✅ AbortController cancels pending operations
- ✅ Badge updates for each tab
- ✅ Cache persists across switches

---

#### 7.4 Threshold Extremes

**Test Minimum Threshold (4k):**
1. Set slider to 4k
2. Open conversation with 10 messages
3. Verify aggressive hiding (only 1-2 messages visible)

**Test Maximum Threshold (40k):**
1. Set slider to 40k
2. Open same conversation
3. Verify all messages visible (unless conversation huge)

**Expected:**
- ✅ 4k hides aggressively (expected)
- ✅ 40k shows most/all messages (expected)
- ✅ No crashes at extremes
- ✅ Badge accurately reflects visible amount

---

#### 7.5 Concurrent Tabs

**Steps:**
1. Open 3 tabs with different Claude conversations
2. Set different thresholds in each tab (via popup)
3. Verify each tab maintains independent state
4. Close middle tab
5. Verify other tabs unaffected

**Expected:**
- ✅ Each tab has independent threshold
- ✅ Badge shows correct value per tab
- ✅ Closing tab doesn't affect others
- ✅ Storage updates don't cause conflicts

---

### Test Suite 8: Compatibility & Integration

#### 8.1 Browser Compatibility

**Chrome:**
- ✅ Latest stable (primary target)
- ✅ Latest beta
- ✅ Two previous stable versions

**Edge (Chromium):**
- ✅ Latest stable (should work, same engine)

**Opera:**
- ✅ Latest stable (Chromium-based, should work)

**Not Supported:**
- ❌ Firefox (different extension API)
- ❌ Safari (different extension API)
- ❌ Chrome <90 (Manifest V3 requirement)

---

#### 8.2 Other Extensions

**Test with Common Extensions:**
1. AdBlock / uBlock Origin
2. Grammarly
3. LastPass / 1Password
4. Dark Reader

**Steps:**
1. Install other extension
2. Open Claude conversation
3. Verify both extensions work
4. Check for console conflicts

**Expected:**
- ✅ No conflicts with ad blockers
- ✅ No conflicts with password managers
- ✅ No conflicts with theme extensions
- ✅ No console errors from extension collision

---

#### 8.3 Claude UI Updates

**Risk:** Claude's HTML/CSS may change, breaking detection.

**Mitigation Testing:**
1. Monitor Claude changelog
2. Test on Claude beta/preview if available
3. Verify multi-strategy detection still works
4. Update selectors if needed

**Fallback:**
- If detection fails, extension gracefully disables
- No errors thrown
- Badge shows "N/A" or disappears

---

## Regression Testing

### Before Each Release

Run the following critical path tests:

#### ✅ Critical Path Test Suite (15 minutes)

1. **Fresh Install** (2 min)
   - Load extension
   - Verify defaults
   - Test slider

2. **Basic Hiding** (3 min)
   - Open 20+ message conversation
   - Adjust threshold
   - Verify hiding works
   - Verify placeholder works

3. **Session Switching** (3 min)
   - Switch between 3 conversations
   - Verify badge updates
   - Verify state persists

4. **Platform Detection** (2 min)
   - Test on claude.ai
   - Test on code.anthropic.com
   - Verify badge colors

5. **Performance** (5 min)
   - Scroll in 100+ message conversation
   - Check FPS (should be 50+)
   - Check CPU (<20%)

---

### Regression Bugs Checklist

Track previously fixed bugs to ensure they don't return:

| Bug ID | Description | Fixed In | Verification |
|--------|-------------|----------|--------------|
| #001 | Sidebar detected as container | v3.4.8 | Run "Scan DOM", verify sidebar excluded |
| #002 | Badge not updating on tab switch | v3.4.5 | Switch tabs, verify badge updates |
| #003 | React hydration conflict | v3.4.3 | Check for console errors on page load |
| #004 | Cache stale after 30s | v3.4.1 | Wait 30s, verify cache refreshes |

---

## Automated Testing Strategy (Future)

### Unit Tests (Planned)

**Tools:** Jest or Mocha

```javascript
// Example: container scoring algorithm
describe('scoreCandidate', () => {
  test('sidebar scores negative', () => {
    const sidebar = createMockElement({ flexShrink: '0', width: 250 });
    expect(scoreCandidate(sidebar)).toBeLessThan(0);
  });

  test('main container scores highest', () => {
    const main = createMockElement({ scrollHeight: 5000, clientHeight: 800 });
    expect(scoreCandidate(main)).toBeGreaterThan(10);
  });
});
```

**Coverage Goal:** 80% of core algorithms

---

### Integration Tests (Planned)

**Tools:** Puppeteer or Playwright

```javascript
// Example: end-to-end test
describe('Message Hiding', () => {
  test('hides messages when threshold exceeded', async () => {
    await page.goto('https://claude.ai/chat/test-session');
    await page.click('[data-testid="extension-icon"]');
    await page.fill('#thresholdSlider', '5000');

    const hiddenCount = await page.evaluate(() => {
      return document.querySelectorAll('.claude-leash-hidden').length;
    });

    expect(hiddenCount).toBeGreaterThan(0);
  });
});
```

---

## Bug Reporting

### Issue Template

```markdown
**Bug Description:**
A clear description of the bug.

**Steps to Reproduce:**
1. Go to '...'
2. Click on '...'
3. Observe '...'

**Expected Behavior:**
What should happen.

**Actual Behavior:**
What actually happens.

**Environment:**
- Chrome Version: 120.0.6099.109
- Extension Version: 3.4.10
- Platform: claude.ai / code.anthropic.com
- OS: Windows 11 / macOS 14

**Console Errors:**
```
[Error messages from console]
```

**Screenshots:**
[Attach relevant screenshots]

**Additional Context:**
Any other relevant information.
```

---

### Severity Levels

| Level | Description | Example | Action |
|-------|-------------|---------|--------|
| **Critical** | Extension broken, no workaround | Extension crashes Claude page | Fix immediately |
| **High** | Core feature broken, has workaround | Message hiding not working | Fix in next patch |
| **Medium** | Minor feature broken | Badge color incorrect | Fix in next minor release |
| **Low** | Visual/cosmetic issue | UI alignment off by 2px | Fix when convenient |

---

## Quality Gates

### Before Committing
- [ ] No console errors in normal operation
- [ ] Debug logs only when debugMode enabled
- [ ] Code follows conventions (see conventions.md)
- [ ] Manually tested basic functionality

### Before Releasing
- [ ] Version bumped in manifest.json
- [ ] README/CONTEXT updated
- [ ] Critical path tests passed
- [ ] Performance benchmarks met (FPS >50, CPU <20%)
- [ ] No known critical or high-severity bugs

---

**Document Version:** 1.0
**Last Updated:** 2025-12-16
**Maintained by:** Claude Code AI Assistant
