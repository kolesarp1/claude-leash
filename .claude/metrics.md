# Claude Leash - Metrics Collection & Analysis

> **Goal**: Measure what matters. Prove performance improvements. Make data-driven decisions.

---

## Metrics Philosophy

### Core Principles

1. **Privacy First**: No PII, no tracking, no external servers
2. **Actionable Data**: Measure what we can improve
3. **User Transparency**: Users know what's measured (if anything)
4. **Lightweight**: Metrics don't impact performance
5. **Showcase-Worthy**: Data we're proud to publish

### Current State

**Status**: ✅ Local metrics collection implemented (Option B)

**Implementation Details**:
- **PerformanceMonitor class** in content.js collects metrics locally
- **No external servers** - all data stays in Chrome Storage
- **User-exportable** via Debug Mode popup → Export button
- **Privacy-preserving** - no PII, no tracking

**Metrics Collected**:
- FPS during scrolling
- Hide operation latency
- Restore operation latency
- Container detection time
- Session switch time

---

## Performance Metrics (Local Collection)

### 1. Real-Time Performance Monitor

**Implementation**: Browser Performance API (no external calls)

```javascript
/**
 * Local performance metrics collector
 * Stores data in chrome.storage.local
 * User can export via Debug Tools
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      fps: [],
      hideLatency: [],
      restoreLatency: [],
      containerDetectionTime: [],
      sessionSwitchTime: []
    };
  }

  /**
   * Measure frame rate during scrolling
   */
  measureFPS(duration = 5000) {
    let frameCount = 0;
    const startTime = performance.now();

    const countFrame = () => {
      frameCount++;
      const elapsed = performance.now() - startTime;

      if (elapsed < duration) {
        requestAnimationFrame(countFrame);
      } else {
        const fps = Math.round((frameCount / elapsed) * 1000);
        this.recordMetric('fps', fps);
        console.log(`[Metrics] FPS: ${fps}`);
      }
    };

    requestAnimationFrame(countFrame);
  }

  /**
   * Measure message hiding latency
   */
  measureHideLatency() {
    const start = performance.now();

    return {
      complete: () => {
        const duration = performance.now() - start;
        this.recordMetric('hideLatency', duration);
        console.log(`[Metrics] Hide latency: ${duration.toFixed(2)}ms`);
      }
    };
  }

  /**
   * Record metric to local storage
   */
  async recordMetric(type, value) {
    this.metrics[type].push({
      value,
      timestamp: Date.now()
    });

    // Keep last 100 measurements
    if (this.metrics[type].length > 100) {
      this.metrics[type].shift();
    }

    // Persist to storage (debounced)
    await this.saveMetrics();
  }

  /**
   * Get statistical summary
   */
  getStats(metricType) {
    const values = this.metrics[metricType].map(m => m.value);

    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);

    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: values.reduce((a, b) => a + b) / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  /**
   * Export metrics as JSON (user-triggered)
   */
  async exportMetrics() {
    const data = {
      version: chrome.runtime.getManifest().version,
      collectedAt: new Date().toISOString(),
      metrics: {}
    };

    for (const [type, values] of Object.entries(this.metrics)) {
      data.metrics[type] = {
        stats: this.getStats(type),
        raw: values
      };
    }

    return data;
  }

  /**
   * Display metrics dashboard in console
   */
  displayDashboard() {
    console.group('📊 Claude Leash Performance Metrics');

    for (const type of Object.keys(this.metrics)) {
      const stats = this.getStats(type);
      if (stats) {
        console.group(`${type}`);
        console.table({
          'Count': stats.count,
          'Mean': `${stats.mean.toFixed(2)}${this.getUnit(type)}`,
          'Median': `${stats.median.toFixed(2)}${this.getUnit(type)}`,
          'Min': `${stats.min.toFixed(2)}${this.getUnit(type)}`,
          'Max': `${stats.max.toFixed(2)}${this.getUnit(type)}`,
          'P95': `${stats.p95.toFixed(2)}${this.getUnit(type)}`,
          'P99': `${stats.p99.toFixed(2)}${this.getUnit(type)}`
        });
        console.groupEnd();
      }
    }

    console.groupEnd();
  }

  getUnit(metricType) {
    if (metricType === 'fps') return ' fps';
    return 'ms';
  }
}

// Usage in content.js
const perfMonitor = new PerformanceMonitor();

async function updateMessageVisibility(threshold) {
  const measurement = perfMonitor.measureHideLatency();

  // ... hiding logic ...

  measurement.complete();
}
```

---

### 2. Key Performance Indicators (KPIs)

#### **A. Frame Rate (FPS)**

**What**: Frames per second during scrolling
**Why**: Direct measure of UI responsiveness
**Target**: 60 fps (smooth), >50 fps acceptable, <30 fps poor

**Measurement**:
```javascript
// Measure FPS during user scroll
container.addEventListener('scroll', () => {
  if (!isMeasuringFPS) {
    perfMonitor.measureFPS(3000); // 3-second sample
    isMeasuringFPS = true;
    setTimeout(() => { isMeasuringFPS = false; }, 5000);
  }
});
```

**Success Criteria**:
- Mean FPS ≥ 55
- P95 FPS ≥ 50
- Zero samples <30 fps

---

#### **B. Interaction Latency**

**What**: Time from user action to visual feedback
**Why**: Perceived performance = user satisfaction
**Target**: <50ms (excellent), <100ms (good), >200ms (poor)

**Measurement**:
```javascript
// Slider adjustment latency
slider.addEventListener('input', (e) => {
  const start = performance.now();

  updateMessageVisibility(e.target.value).then(() => {
    const latency = performance.now() - start;
    perfMonitor.recordMetric('interactionLatency', latency);
  });
});
```

**Success Criteria**:
- Mean latency <50ms
- P95 latency <100ms
- P99 latency <200ms

---

#### **C. Container Detection Time**

**What**: Time to find main chat container
**Why**: Impacts time-to-interactive
**Target**: <50ms (excellent), <200ms (acceptable)

**Measurement**:
```javascript
async function detectChatContainer() {
  const start = performance.now();

  // ... detection logic ...

  const duration = performance.now() - start;
  perfMonitor.recordMetric('containerDetectionTime', duration);

  return container;
}
```

**Success Criteria**:
- Mean <50ms
- P95 <100ms
- Cache hit rate >80% (skip detection)

---

#### **D. Memory Footprint**

**What**: RAM consumed by extension
**Why**: Resource-constrained devices (8GB RAM laptops)
**Target**: <10MB (excellent), <20MB (acceptable), >50MB (poor)

**Measurement**:
```javascript
// Use Chrome Performance Monitor
if (performance.memory) {
  const memoryUsage = {
    usedJSHeapSize: performance.memory.usedJSHeapSize / (1024 * 1024),
    totalJSHeapSize: performance.memory.totalJSHeapSize / (1024 * 1024),
    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit / (1024 * 1024)
  };

  console.log('[Metrics] Memory:', memoryUsage);
}
```

**Success Criteria**:
- Extension overhead <10MB
- No memory leaks over time
- Memory growth <1MB per hour

---

#### **E. CPU Usage**

**What**: CPU % during scrolling and hiding operations
**Why**: Battery life on laptops, fan noise
**Target**: <15% (excellent), <30% (acceptable), >50% (poor)

**Measurement**:
```javascript
// Use Chrome Task Manager or Performance API
// Note: Direct CPU measurement not available in extension context
// Proxy: measure long tasks (>50ms)

const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 50) {
      console.warn(`[Metrics] Long task: ${entry.duration.toFixed(2)}ms`);
      perfMonitor.recordMetric('longTasks', entry.duration);
    }
  }
});

observer.observe({ entryTypes: ['longtask'] });
```

**Success Criteria**:
- Zero long tasks >100ms
- Long tasks (>50ms) <1% of runtime

---

### 3. Automated Performance Testing

**Tool**: Chrome DevTools Performance API + Puppeteer

```javascript
/**
 * Automated performance benchmark
 * Run before each release
 */
async function runPerformanceBenchmark() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Load Claude Code with extension
  await page.goto('https://code.anthropic.com/project/test');

  // Start performance recording
  await page.evaluate(() => {
    performance.mark('benchmark-start');
  });

  // Simulate user actions
  await page.evaluate(() => {
    // Scroll conversation
    const container = document.querySelector('[class*="overflow"]');
    container.scrollTop = container.scrollHeight;

    // Wait for render
    return new Promise(resolve => setTimeout(resolve, 1000));
  });

  // Collect metrics
  const metrics = await page.metrics();
  const performanceEntries = await page.evaluate(() => {
    performance.mark('benchmark-end');
    performance.measure('total', 'benchmark-start', 'benchmark-end');

    return {
      fps: calculateFPS(),
      layoutDuration: getLayoutDuration(),
      paintDuration: getPaintDuration()
    };
  });

  console.log('Performance Metrics:', performanceEntries);

  // Assert against targets
  assert(performanceEntries.fps >= 50, 'FPS below target');
  assert(performanceEntries.layoutDuration < 50, 'Layout too slow');

  await browser.close();
}
```

---

## Usage Metrics (Privacy-Preserving)

### What We Could Track (Locally Only)

```javascript
const usageMetrics = {
  // Settings preferences (local only)
  preferences: {
    averageThreshold: 12500,           // Mean threshold users choose
    mostCommonThreshold: 10000,        // Mode
    platformToggles: {
      claudeAI: true,
      claudeCode: true
    },
    theme: 'auto'                      // Most popular theme
  },

  // Feature usage (local only)
  features: {
    collapseToggles: 2.3,              // Per session average
    thresholdAdjustments: 0.4,         // Per session (most leave default)
    debugModeUsage: 0.02,              // % of sessions
    platformToggleChanges: 0.1         // Rarely changed
  },

  // Conversation context (local only)
  context: {
    avgMessagesPerSession: 47,
    avgMessageHeight: 180,             // pixels
    longestConversation: 324,          // messages
    avgSessionDuration: 18             // minutes
  }
};
```

**Privacy Guarantee**: All data stays local. No external servers. User can export/delete.

---

## Showcase Metrics (Publishable)

### Public Performance Dashboard

**Goal**: Publish metrics showing extension effectiveness

**Format**: Static dashboard (updated quarterly)

```markdown
# Claude Leash Performance Report - Q1 2025

## Methodology
- Tested on Chrome 120, Windows 11, 16GB RAM
- Conversation: 100 messages, average 200px each
- Metrics: Average of 100 runs, 95% confidence interval

## Results

### Scrolling Performance
| Metric | Without Extension | With Extension | Improvement |
|--------|-------------------|----------------|-------------|
| Average FPS | 26.4 ± 3.2 | 59.1 ± 1.1 | **+124%** |
| Paint Duration | 180ms ± 40ms | 27ms ± 5ms | **-85%** |
| CPU Usage | 58% ± 8% | 12% ± 2% | **-79%** |

### Interaction Latency
| Action | Latency (p95) | Target | Status |
|--------|---------------|--------|--------|
| Collapse Messages | 42ms | <50ms | ✅ Pass |
| Show All Messages | 156ms | <200ms | ✅ Pass |
| Threshold Adjustment | 38ms | <50ms | ✅ Pass |
| Session Switch | 89ms | <100ms | ✅ Pass |

### Resource Footprint
| Resource | Usage | Target | Status |
|----------|-------|--------|--------|
| Memory | 8.2 MB | <10MB | ✅ Pass |
| CPU (Idle) | 0.2% | <1% | ✅ Pass |
| Long Tasks | 0 | 0 | ✅ Pass |

### User Impact (Simulated)
- **500+ message conversation**: 60fps vs 15fps (no extension)
- **Battery life**: ~15% longer (reduced CPU usage)
- **Time to scroll**: 2.1s vs 8.5s (smooth vs janky)
```

---

## A/B Testing Framework (Future)

### Experiments to Run

1. **Default Threshold Optimization**
   - Hypothesis: 15k threshold better than 10k for most users
   - Measure: User adjustments, performance impact, satisfaction
   - Duration: 2 weeks, 50/50 split

2. **Progressive Unhiding**
   - A: Scroll-based (current)
   - B: Proximity-based (IntersectionObserver)
   - Measure: FPS, perceived smoothness, CPU usage

3. **Auto-Adjust Threshold**
   - A: Static threshold
   - B: Dynamic (adjusts based on conversation length)
   - Measure: User manual adjustments, performance consistency

---

## Metrics Export Feature

### User-Facing Metrics Dashboard

**Location**: Popup → Debug Mode → "View Metrics"

```javascript
// Export button in popup
exportMetricsButton.addEventListener('click', async () => {
  const perfMonitor = await getPerformanceMonitor();
  const data = await perfMonitor.exportMetrics();

  // Download as JSON
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `claude-leash-metrics-${Date.now()}.json`;
  a.click();
});
```

**User Benefit**: Share performance data for bug reports or feedback

---

## Quality Gates Based on Metrics

### Pre-Release Performance Checks

```javascript
/**
 * Automated quality gate
 * Fails build if performance regresses
 */
async function performanceQualityGate() {
  const currentMetrics = await runBenchmark();
  const baselineMetrics = loadBaseline();

  const checks = [
    {
      name: 'FPS Regression',
      current: currentMetrics.fps,
      baseline: baselineMetrics.fps,
      threshold: -5, // Max 5fps regression
      operator: 'delta'
    },
    {
      name: 'Latency SLA',
      current: currentMetrics.hideLatency.p95,
      baseline: 50, // ms
      threshold: 50,
      operator: 'absolute'
    },
    {
      name: 'Memory Limit',
      current: currentMetrics.memoryUsage,
      baseline: 10, // MB
      threshold: 10,
      operator: 'absolute'
    }
  ];

  const failures = checks.filter(check => {
    if (check.operator === 'delta') {
      return check.current < check.baseline + check.threshold;
    } else {
      return check.current > check.threshold;
    }
  });

  if (failures.length > 0) {
    console.error('❌ Performance Quality Gate FAILED:');
    failures.forEach(f => {
      console.error(`  - ${f.name}: ${f.current} (baseline: ${f.baseline})`);
    });
    process.exit(1);
  }

  console.log('✅ Performance Quality Gate PASSED');
}
```

---

## Continuous Monitoring

### Performance Regression Detection

**Strategy**: Track metrics over time, alert on regressions

```javascript
// Store historical metrics
const history = {
  'v3.4.10': { fps: 59.1, hideLatency: 42 },
  'v3.4.11': { fps: 58.7, hideLatency: 45 },  // ⚠️ Slight regression
  'v3.5.0': { fps: 60.0, hideLatency: 38 }    // ✅ Improvement
};

// Alert if regression detected
if (currentFPS < previousFPS - 5) {
  console.warn('⚠️ Performance regression detected!');
  console.warn(`FPS dropped from ${previousFPS} to ${currentFPS}`);
  console.warn('Review recent changes for performance impact');
}
```

---

## Success Metrics Summary

### Release Criteria (Must Meet Before Launch)

| Metric | Target | Status |
|--------|--------|--------|
| Scrolling FPS | ≥55 fps (avg) | ✅ Measurable via PerformanceMonitor |
| Interaction Latency | <50ms (p95) | ✅ Tracked via hideLatency metric |
| Container Detection | <50ms (avg) | ✅ Tracked via containerDetectionTime |
| Memory Usage | <10MB | ⏳ Manual verification |
| Long Tasks | 0 (>100ms) | ⏳ Manual verification |
| Console Errors | 0 | ⏳ Manual verification |

**How to Verify**: Enable Debug Mode in popup, use extension, click "Export" to download metrics JSON.

### Ongoing Goals (Continuous Improvement)

- **Month 1**: Establish baseline metrics
- **Month 2**: Optimize to meet all targets
- **Month 3**: Publish performance dashboard
- **Month 6**: 95% of metrics exceed targets
- **Year 1**: Industry-leading performance (provable)

---

**Document Version:** 1.0
**Last Updated:** 2025-12-16
**Owner:** Engineering Team
**Review Cycle:** Monthly
