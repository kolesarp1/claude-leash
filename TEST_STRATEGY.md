# Claude Leash - Comprehensive Test Strategy & Analysis

> **Version:** v3.4.10
> **Date:** 2025-12-16
> **Authors:** QA Engineer, Software Architect, Security Auditor

---

## Table of Contents

1. [QA Test Strategy](#1-qa-test-strategy)
2. [Architecture Review](#2-architecture-review)
3. [Security Audit](#3-security-audit)
4. [Performance Validation Methodology](#4-performance-validation-methodology)
5. [Summary & Recommendations](#5-summary--recommendations)

---

## 1. QA Test Strategy

### 1.1 Current State

- **Test Infrastructure:** ❌ None
- **Manual Checklist:** ✅ CONTEXT.md (lines 83-92)

### 1.2 Recommended Test Structure

```
tests/
├── unit/
│   ├── container-detection.test.js
│   ├── collapse-logic.test.js
│   ├── session-management.test.js
│   └── settings.test.js
├── integration/
│   ├── collapse-flow.test.js
│   ├── session-switch.test.js
│   └── scroll-restore.test.js
├── e2e/
│   ├── full-workflow.test.js
│   └── performance-regression.test.js
└── performance/
    └── benchmark.js
```

### 1.3 Unit Test Coverage Requirements

| Module | Functions | Priority |
|--------|-----------|----------|
| Container Detection | `getScrollContainer`, `getContentParent`, `getContentChildren` | P0 |
| Collapse Logic | `applyCollapse`, `applyCollapseQuick`, `restoreAll` | P0 |
| Session Management | `getSessionId`, `handleSessionChange`, `saveSessionState` | P1 |
| Settings | `loadSettings`, `isEnabledForCurrentInterface` | P2 |

### 1.4 Integration Test Scenarios

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Initial collapse | Load page → Enable collapse | Old messages hidden |
| Session switch | Collapse → Navigate → Return | State preserved |
| Scroll restore | Collapse → Scroll to top | Incremental restore |
| React safety | Load during hydration | No React errors |

### 1.5 Performance Test Metrics

```javascript
const PERFORMANCE_TARGETS = {
  inputLatency: { max: 16, unit: 'ms' },
  scrollFPS: { min: 55, unit: 'fps' },
  layoutTime: { max: 10, unit: 'ms' },
  domNodesReduction: { min: 70, unit: '%' }
};
```

---

## 2. Architecture Review

### 2.1 Strengths

| Aspect | Rating | Notes |
|--------|--------|-------|
| CSS-only hiding | ⭐⭐⭐⭐⭐ | Correct approach for performance |
| React safety | ⭐⭐⭐⭐ | requestIdleCallback before DOM ops |
| Race condition handling | ⭐⭐⭐⭐⭐ | AbortController pattern |
| Early intervention | ⭐⭐⭐⭐ | MutationObserver for proactive hiding |

### 2.2 Areas for Improvement

1. **Tight DOM coupling** - Selectors hardcoded, will break on Claude updates
2. **Global state sprawl** - 15+ module-level variables
3. **Magic numbers** - Constants undocumented
4. **No error boundaries** - Single try-catch at message handler

### 2.3 Future-Proofing Recommendations

```javascript
// Recommended: Selector configuration
const SELECTORS = {
  v1: {
    container: ['[class*="overflow-y-auto"]'],
    sidebar: ['[class*="bg-bg-"]', '[class*="flex-shrink-0"]']
  }
};

// Recommended: State consolidation
const state = {
  settings: {},
  dom: { container: null, contentParent: null },
  session: { id: null, cache: new Map() },
  ui: { placeholder: null, hiddenNodes: [] }
};
```

---

## 3. Security Audit

### 3.1 Permissions Analysis

| Permission | Required | Risk | Recommendation |
|------------|----------|------|----------------|
| `storage` | ✅ Yes | Low | Keep |
| `activeTab` | ✅ Yes | Low | Keep |
| `tabs` | ⚠️ Maybe | Medium | Consider removing |
| `scripting` | ✅ Yes | Medium | Keep |

### 3.2 Security Findings

| Finding | Severity | Status |
|---------|----------|--------|
| No XSS vectors | N/A | ✅ Safe |
| No eval/Function | N/A | ✅ Safe |
| No external network | N/A | ✅ Safe |
| Message validation missing | Medium | ⚠️ Fix recommended |
| History API monkey-patch | Low | ℹ️ Acceptable |

### 3.3 Privacy Assessment

**Rating: ⭐⭐⭐⭐⭐ Excellent**
- No PII collection
- No external communication
- All storage local only

---

## 4. Performance Validation Methodology

### 4.1 Quick Console Test

```javascript
// Paste in DevTools Console on claude.ai
(async function() {
  const results = {};

  // DOM nodes
  results.domNodes = document.querySelectorAll('*').length;
  results.hiddenNodes = document.querySelectorAll('.claude-leash-hidden').length;

  // Scroll FPS
  const container = document.querySelector('[class*="overflow-y-auto"]');
  if (container) {
    let frames = 0;
    const start = performance.now();
    await new Promise(resolve => {
      function count() {
        frames++;
        performance.now() - start < 1000 ? requestAnimationFrame(count) : resolve();
      }
      container.scrollTo({ top: 0, behavior: 'smooth' });
      requestAnimationFrame(count);
    });
    results.scrollFPS = frames;
  }

  // Layout cost
  const layoutStart = performance.now();
  for (let i = 0; i < 100; i++) document.body.offsetHeight;
  results.layoutCost = ((performance.now() - layoutStart) / 100).toFixed(2) + 'ms';

  console.table(results);
})();
```

### 4.2 Manual "Feel" Test

```
□ Open long conversation (50+ messages)
□ WITHOUT extension: Type "hello" - laggy?
□ WITH extension: Type "hello" - instant?
□ WITHOUT extension: Scroll - choppy?
□ WITH extension: Scroll - smooth?
```

### 4.3 DevTools Performance Panel

1. Open F12 → Performance
2. Enable CPU 4x slowdown
3. Record 10 seconds of: typing, scrolling, Claude response
4. Check: No red blocks, FPS >30, no long frames

### 4.4 Expected Improvements

| Metric | Without | With | Improvement |
|--------|---------|------|-------------|
| DOM nodes | 5000+ | 500-1000 | 80%+ |
| Scroll FPS | 20-40 | 55-60 | 50%+ |
| Input latency | 80-150ms | 10-20ms | 80%+ |
| Layout cost | 30-80ms | 5-15ms | 70%+ |

---

## 5. Summary & Recommendations

### Priority Actions

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| P0 | Add E2E tests (Puppeteer) | Medium | High |
| P0 | Add performance regression tests | Medium | High |
| P1 | Extract selector configuration | Low | High |
| P1 | Add message validation | Low | Medium |
| P2 | Consolidate global state | Medium | Medium |
| P2 | Document magic numbers | Low | Low |

### Verdict

**Claude Leash achieves its goal of making Claude Code Web feel snappier.** The CSS-only `display: none` approach is correct and effective. Main risks are:

1. DOM selector breakage on Claude updates
2. No automated tests for regression detection
3. Undocumented constants make tuning difficult

### Next Steps

1. ✅ Create this test strategy document
2. 🔲 Implement performance benchmark script
3. 🔲 Add Puppeteer E2E tests
4. 🔲 Abstract selectors into configuration
5. 🔲 Add input validation to message handlers
