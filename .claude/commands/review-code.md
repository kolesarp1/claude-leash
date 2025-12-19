---
description: Review code changes for quality, performance, and adherence to conventions
---

# Code Review

Please review the recent code changes in this repository for:

## 1. Code Quality
- **Conventions**: Verify code follows conventions.md guidelines
  - Naming conventions (camelCase, descriptive names)
  - Formatting (2-space indentation, semicolons)
  - Comments (explain WHY, not WHAT)
  - JSDoc for public functions

- **Best Practices**: Check for anti-patterns
  - No magic numbers
  - No nested callbacks (use async/await)
  - Proper error handling
  - Input validation

## 2. Performance
- **DOM Operations**:
  - Cached selectors (not repeated queries)
  - Batched reads/writes (avoid layout thrashing)
  - Debounced/throttled high-frequency events
  - CSS-only animations (no JavaScript)

- **Memory Management**:
  - Event listeners cleaned up
  - Caches cleared when not needed
  - No memory leaks

## 3. Chrome Extension Patterns
- **Message Passing**: Properly structured messages with type field
- **Storage API**: Error handling, defaults for missing values
- **Permissions**: No unnecessary permissions added
- **Manifest V3**: Using chrome.action, not chrome.browserAction

## 4. Security
- **No Inline Scripts**: All JavaScript in external files
- **XSS Prevention**: Using textContent, not innerHTML with user data
- **CSP Compliance**: No eval() or new Function()

## 5. Testing
- **Manual Testing**: Can be manually tested
- **Console Errors**: No errors in production mode
- **Debug Logs**: Only appear when debugMode enabled

## 6. Documentation
- **Code Comments**: Complex logic explained
- **README/CONTEXT**: Updated if needed
- **Architecture Changes**: Documented in architecture.md

Please provide:
1. ✅ What's good about the changes
2. ⚠️ Issues found (critical, high, medium, low severity)
3. 💡 Suggestions for improvement
4. 📝 Documentation gaps

Focus on specific line numbers and files when providing feedback.
