---
description: Guide through manual testing procedures for the extension
---

# Extension Testing Guide

Please help me test the Claude Leash extension by following the testing procedures in testing.md.

## Priority Test Suites

### 1. Critical Path (Required for all changes)
Run these tests first:
- [ ] Fresh install verification
- [ ] Basic message hiding
- [ ] Session switching
- [ ] Platform detection (claude.ai & Claude Code)
- [ ] Performance check (FPS >50, CPU <20%)

### 2. Feature-Specific Tests
Based on the recent changes, identify which test suites are relevant:
- **Container Detection**: Test Suite 4
- **Message Hiding**: Test Suite 2
- **Session Management**: Test Suite 3
- **UI Changes**: Test Suite 1
- **Performance**: Test Suite 5

### 3. Regression Tests
Verify previously fixed bugs haven't returned:
- Sidebar not excluded from container detection
- Badge not updating on tab switch
- React hydration conflicts
- Stale cache after 30s

## Testing Process

1. **Setup**:
   - Load extension in Chrome (chrome://extensions/)
   - Open DevTools console
   - Enable Debug Mode if needed

2. **Execute Tests**:
   - Follow step-by-step procedures from testing.md
   - Document expected vs actual results
   - Note any console errors or warnings
   - Take screenshots of issues

3. **Report Results**:
   - ✅ Passed tests
   - ❌ Failed tests (with details)
   - ⚠️ Issues found
   - 📊 Performance metrics

Please guide me through the testing process step-by-step, asking me to perform actions and report results.
