---
description: Analyze and suggest performance optimizations
---

# Performance Optimization Analysis

I'll analyze Claude Leash for performance optimization opportunities.

## Performance Audit Areas

### 1. DOM Operations
Analyze:
- [ ] Selector efficiency (specific vs broad)
- [ ] Query frequency (cached vs repeated)
- [ ] Read/write batching (layout thrashing check)
- [ ] Element creation (DocumentFragment usage)

**Questions:**
- Are we querying the same elements multiple times?
- Are we interleaving reads and writes?
- Can we cache more aggressively?

### 2. Event Listeners
Analyze:
- [ ] High-frequency events (scroll, resize, mousemove)
- [ ] Debouncing/throttling usage
- [ ] Listener cleanup (memory leaks)
- [ ] Event delegation opportunities

**Questions:**
- Are scroll listeners debounced?
- Do we remove listeners on cleanup?
- Can we use event delegation for dynamic elements?

### 3. Algorithms & Complexity
Analyze:
- [ ] Container detection (O(n) acceptable?)
- [ ] Height calculation (can we optimize?)
- [ ] Cache lookup (O(1) Map.get)
- [ ] Session switching overhead

**Questions:**
- Can we reduce algorithmic complexity?
- Are we doing unnecessary work?
- Can we use binary search instead of linear?

### 4. Memory Usage
Analyze:
- [ ] Cache size (bounded or unbounded?)
- [ ] Cache eviction strategy (LRU, TTL?)
- [ ] Weak references for DOM elements
- [ ] Session data cleanup

**Questions:**
- Do caches grow indefinitely?
- Are we holding references to removed elements?
- Can we use WeakMap for element associations?

### 5. Rendering Performance
Analyze using Chrome DevTools:
- [ ] Frame rate (target: 60fps)
- [ ] Paint duration (target: <50ms)
- [ ] Layout operations (minimize)
- [ ] Composite layers (GPU usage)

**Metrics to Capture:**
```javascript
// Performance API
performance.measure('hideMessages', 'start', 'end');
const entries = performance.getEntriesByName('hideMessages');
console.log('Duration:', entries[0].duration);
```

## Optimization Strategies

### Quick Wins (Low Effort, High Impact)
1. **Cache DOM Queries**
   ```javascript
   // Before: Repeated query
   document.getElementById('btn').textContent = 'Text';
   document.getElementById('btn').disabled = true;

   // After: Single query
   const btn = document.getElementById('btn');
   btn.textContent = 'Text';
   btn.disabled = true;
   ```

2. **Debounce High-Frequency Events**
   ```javascript
   // Before: Fires every scroll
   container.addEventListener('scroll', handleScroll);

   // After: Debounced (150ms)
   const debouncedScroll = debounce(handleScroll, 150);
   container.addEventListener('scroll', debouncedScroll);
   ```

3. **Batch DOM Modifications**
   ```javascript
   // Before: Interleaved
   msgs.forEach(msg => {
     const h = msg.offsetHeight; // Read
     msg.style.display = 'none'; // Write
   });

   // After: Batched
   const heights = msgs.map(m => m.offsetHeight); // All reads
   msgs.forEach(m => m.style.display = 'none'); // All writes
   ```

### Advanced Optimizations (Higher Effort)
1. **Web Worker for Calculations**
   - Offload height calculations to background thread
   - Requires serializable data

2. **Intersection Observer**
   - More efficient than scroll events
   - Progressive loading based on visibility

3. **Virtual Scrolling**
   - Only render visible messages
   - Requires UI architecture changes

4. **IndexedDB for Large Caches**
   - Store session data persistently
   - Faster than chrome.storage for large datasets

## Performance Testing

Before optimization:
1. Measure baseline (FPS, CPU, paint duration)
2. Identify bottlenecks (DevTools profiler)

After optimization:
1. Measure improvement (quantify gains)
2. Verify no regressions (functionality still works)

**Expected Gains:**
| Optimization | FPS Improvement | CPU Reduction |
|--------------|-----------------|---------------|
| Debounce scroll | +5-10 fps | -10-20% |
| Cache queries | +2-5 fps | -5-10% |
| Batch reads/writes | +10-15 fps | -15-25% |

Please specify:
1. What area to focus on (DOM, events, algorithms, memory, rendering)
2. Any specific performance issues you're experiencing
3. Target metrics (e.g., "get FPS above 60 in 500+ message conversations")

I'll provide detailed analysis and optimization recommendations.
