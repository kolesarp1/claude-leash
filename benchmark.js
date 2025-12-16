/**
 * Claude Leash - Performance Benchmark Script
 *
 * Usage:
 * 1. Open claude.ai with a long conversation
 * 2. Open DevTools Console (F12)
 * 3. Paste this entire script and press Enter
 * 4. Run: await runBenchmark()
 *
 * The script will measure performance metrics and output results.
 */

const ClaudeLeashBenchmark = (function() {
  'use strict';

  // Configuration
  const CONFIG = {
    scrollTestDuration: 2000,    // ms to test scroll
    inputTestIterations: 100,    // keystrokes to simulate
    layoutTestIterations: 100,   // layout force iterations
    warmupIterations: 10,        // warmup before measuring
  };

  // Results storage
  let results = {
    timestamp: null,
    url: null,
    extensionState: null,
    metrics: {}
  };

  /**
   * Detect if Claude Leash is active and in collapsed state
   */
  function detectExtensionState() {
    const hiddenElements = document.querySelectorAll('.claude-leash-hidden');
    const placeholder = document.getElementById('claude-leash-placeholder');

    if (hiddenElements.length > 0 || placeholder) {
      return {
        active: true,
        collapsed: true,
        hiddenCount: hiddenElements.length,
        hasPlaceholder: !!placeholder
      };
    }

    return {
      active: false,
      collapsed: false,
      hiddenCount: 0,
      hasPlaceholder: false
    };
  }

  /**
   * Count DOM nodes
   */
  function countDOMNodes() {
    return {
      total: document.querySelectorAll('*').length,
      hidden: document.querySelectorAll('.claude-leash-hidden').length,
      visible: document.querySelectorAll('*').length - document.querySelectorAll('.claude-leash-hidden *').length
    };
  }

  /**
   * Find the main scroll container
   */
  function findScrollContainer() {
    const candidates = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]');
    let best = null;
    let bestScore = 0;

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const score = el.scrollHeight * (rect.height / window.innerHeight);
      if (score > bestScore && rect.width > 300) {
        best = el;
        bestScore = score;
      }
    }

    return best;
  }

  /**
   * Measure scroll performance (FPS)
   */
  async function measureScrollFPS() {
    const container = findScrollContainer();
    if (!container) {
      return { fps: -1, error: 'No scroll container found' };
    }

    const originalScrollTop = container.scrollTop;
    let frameCount = 0;
    let longFrames = 0;
    let lastFrameTime = performance.now();

    return new Promise(resolve => {
      const startTime = performance.now();

      function countFrame(timestamp) {
        const frameDelta = timestamp - lastFrameTime;
        if (frameDelta > 50) longFrames++; // Long frame > 50ms
        lastFrameTime = timestamp;
        frameCount++;

        if (timestamp - startTime < CONFIG.scrollTestDuration) {
          // Oscillate scroll
          const progress = (timestamp - startTime) / CONFIG.scrollTestDuration;
          const scrollTarget = Math.sin(progress * Math.PI * 4) * 500 + originalScrollTop;
          container.scrollTop = Math.max(0, scrollTarget);
          requestAnimationFrame(countFrame);
        } else {
          container.scrollTop = originalScrollTop;
          const duration = (timestamp - startTime) / 1000;
          resolve({
            fps: Math.round(frameCount / duration),
            longFrames,
            duration: Math.round(duration * 1000),
            frameCount
          });
        }
      }

      requestAnimationFrame(countFrame);
    });
  }

  /**
   * Measure layout recalculation cost
   */
  function measureLayoutCost() {
    // Warmup
    for (let i = 0; i < CONFIG.warmupIterations; i++) {
      document.body.offsetHeight;
    }

    const times = [];
    for (let i = 0; i < CONFIG.layoutTestIterations; i++) {
      const start = performance.now();
      document.body.offsetHeight;
      document.body.getBoundingClientRect();
      times.push(performance.now() - start);
    }

    times.sort((a, b) => a - b);
    return {
      min: times[0].toFixed(3),
      max: times[times.length - 1].toFixed(3),
      median: times[Math.floor(times.length / 2)].toFixed(3),
      avg: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3),
      p95: times[Math.floor(times.length * 0.95)].toFixed(3)
    };
  }

  /**
   * Measure memory usage (if available)
   */
  function measureMemory() {
    if (!performance.memory) {
      return { available: false };
    }

    return {
      available: true,
      usedHeapMB: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
      totalHeapMB: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
      limitMB: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
    };
  }

  /**
   * Measure style recalculation
   */
  function measureStyleRecalc() {
    const testEl = document.createElement('div');
    testEl.style.cssText = 'position:absolute;visibility:hidden;';
    document.body.appendChild(testEl);

    const times = [];
    for (let i = 0; i < CONFIG.layoutTestIterations; i++) {
      const start = performance.now();
      testEl.style.width = (i % 2 ? '100px' : '200px');
      getComputedStyle(testEl).width; // Force recalc
      times.push(performance.now() - start);
    }

    document.body.removeChild(testEl);

    times.sort((a, b) => a - b);
    return {
      median: times[Math.floor(times.length / 2)].toFixed(4),
      avg: (times.reduce((a, b) => a + b, 0) / times.length).toFixed(4)
    };
  }

  /**
   * Run full benchmark suite
   */
  async function runBenchmark() {
    console.log('🚀 Claude Leash Benchmark Starting...\n');

    results = {
      timestamp: new Date().toISOString(),
      url: location.href,
      extensionState: detectExtensionState(),
      metrics: {}
    };

    // 1. DOM Complexity
    console.log('📊 Measuring DOM complexity...');
    results.metrics.dom = countDOMNodes();

    // 2. Scroll Performance
    console.log('📜 Measuring scroll performance (2s)...');
    results.metrics.scroll = await measureScrollFPS();

    // 3. Layout Cost
    console.log('📐 Measuring layout cost...');
    results.metrics.layout = measureLayoutCost();

    // 4. Style Recalc
    console.log('🎨 Measuring style recalculation...');
    results.metrics.styleRecalc = measureStyleRecalc();

    // 5. Memory
    console.log('💾 Measuring memory usage...');
    results.metrics.memory = measureMemory();

    // Output results
    console.log('\n' + '='.repeat(60));
    console.log('📈 BENCHMARK RESULTS');
    console.log('='.repeat(60));

    console.log('\n🔌 Extension State:');
    console.log(`   Active: ${results.extensionState.active}`);
    console.log(`   Collapsed: ${results.extensionState.collapsed}`);
    console.log(`   Hidden elements: ${results.extensionState.hiddenCount}`);

    console.log('\n📊 DOM Complexity:');
    console.log(`   Total nodes: ${results.metrics.dom.total}`);
    console.log(`   Hidden nodes: ${results.metrics.dom.hidden}`);
    if (results.metrics.dom.hidden > 0) {
      const reduction = ((results.metrics.dom.hidden / results.metrics.dom.total) * 100).toFixed(1);
      console.log(`   Reduction: ${reduction}%`);
    }

    console.log('\n📜 Scroll Performance:');
    if (results.metrics.scroll.fps > 0) {
      console.log(`   FPS: ${results.metrics.scroll.fps}`);
      console.log(`   Long frames (>50ms): ${results.metrics.scroll.longFrames}`);
      const rating = results.metrics.scroll.fps >= 55 ? '✅ Smooth' :
                     results.metrics.scroll.fps >= 30 ? '⚠️ Acceptable' : '❌ Janky';
      console.log(`   Rating: ${rating}`);
    } else {
      console.log(`   Error: ${results.metrics.scroll.error}`);
    }

    console.log('\n📐 Layout Cost:');
    console.log(`   Median: ${results.metrics.layout.median}ms`);
    console.log(`   P95: ${results.metrics.layout.p95}ms`);
    const layoutRating = parseFloat(results.metrics.layout.median) < 1 ? '✅ Fast' :
                         parseFloat(results.metrics.layout.median) < 5 ? '⚠️ OK' : '❌ Slow';
    console.log(`   Rating: ${layoutRating}`);

    console.log('\n🎨 Style Recalculation:');
    console.log(`   Median: ${results.metrics.styleRecalc.median}ms`);

    if (results.metrics.memory.available) {
      console.log('\n💾 Memory:');
      console.log(`   Used: ${results.metrics.memory.usedHeapMB}MB`);
      console.log(`   Total: ${results.metrics.memory.totalHeapMB}MB`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('💡 To compare: Run benchmark WITH and WITHOUT extension');
    console.log('   - Disable extension → Refresh → Run benchmark');
    console.log('   - Enable extension → Collapse → Run benchmark');
    console.log('='.repeat(60));

    return results;
  }

  /**
   * Quick performance check
   */
  function quickCheck() {
    const state = detectExtensionState();
    const dom = countDOMNodes();

    console.log('⚡ Quick Performance Check');
    console.log(`   Extension: ${state.collapsed ? 'Active (collapsed)' : 'Inactive'}`);
    console.log(`   DOM nodes: ${dom.total} (${dom.hidden} hidden)`);

    if (dom.hidden > 0) {
      console.log(`   Reduction: ${((dom.hidden / dom.total) * 100).toFixed(1)}%`);
    }

    return { state, dom };
  }

  // Public API
  return {
    run: runBenchmark,
    quick: quickCheck,
    results: () => results,
    config: CONFIG
  };
})();

// Convenience functions
const runBenchmark = ClaudeLeashBenchmark.run;
const quickCheck = ClaudeLeashBenchmark.quick;

console.log('✅ Claude Leash Benchmark loaded!');
console.log('   Run: await runBenchmark()  - Full benchmark');
console.log('   Run: quickCheck()          - Quick DOM check');
