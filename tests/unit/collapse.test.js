/**
 * Unit tests for collapse/hide logic
 */

describe('Collapse Logic', () => {
  // Height calculation constants
  const MIN_HEIGHT_FOR_COLLAPSE = 5000;
  const MIN_BLOCKS_FOR_COLLAPSE = 10;

  // Simulated collapse calculation function
  function calculateCollapseInfo(heights, maxHeight) {
    const totalHeight = heights.reduce((sum, h) => sum + h, 0);

    if (totalHeight <= MIN_HEIGHT_FOR_COLLAPSE) {
      return { shouldCollapse: false, reason: 'total height below minimum' };
    }

    if (heights.length < MIN_BLOCKS_FOR_COLLAPSE) {
      return { shouldCollapse: false, reason: 'not enough blocks' };
    }

    // Calculate from bottom up
    let cumulativeHeight = 0;
    let hideIndex = -1;

    for (let i = heights.length - 1; i >= 0; i--) {
      cumulativeHeight += heights[i];
      if (cumulativeHeight > maxHeight) {
        hideIndex = i;
        break;
      }
    }

    if (hideIndex <= 0) {
      return { shouldCollapse: false, reason: 'nothing to hide' };
    }

    const hiddenHeight = heights.slice(0, hideIndex).reduce((sum, h) => sum + h, 0);
    const visibleHeight = cumulativeHeight;

    return {
      shouldCollapse: true,
      hideIndex,
      hiddenCount: hideIndex,
      visibleCount: heights.length - hideIndex,
      hiddenHeight,
      visibleHeight,
      totalHeight
    };
  }

  describe('calculateCollapseInfo', () => {
    test('does not collapse when total height below minimum', () => {
      const heights = [100, 100, 100]; // 300px total
      const result = calculateCollapseInfo(heights, 10000);

      expect(result.shouldCollapse).toBe(false);
      expect(result.reason).toBe('total height below minimum');
    });

    test('does not collapse when not enough blocks', () => {
      const heights = Array(5).fill(1500); // 5 blocks, 7500px
      const result = calculateCollapseInfo(heights, 5000);

      expect(result.shouldCollapse).toBe(false);
      expect(result.reason).toBe('not enough blocks');
    });

    test('calculates correct hide index', () => {
      // 15 blocks, each 1000px = 15000px total
      const heights = Array(15).fill(1000);
      const maxHeight = 5000; // Keep 5000px visible

      const result = calculateCollapseInfo(heights, maxHeight);

      expect(result.shouldCollapse).toBe(true);
      // From bottom: 15000px total, keep 5000px = hide first 10
      expect(result.hideIndex).toBe(10);
      expect(result.hiddenCount).toBe(10);
      expect(result.visibleCount).toBe(5);
    });

    test('handles varying heights correctly', () => {
      const heights = [200, 300, 500, 1000, 800, 400, 600, 700, 900, 1100, 500];
      const totalHeight = heights.reduce((sum, h) => sum + h, 0); // 7000px
      const maxHeight = 3000;

      const result = calculateCollapseInfo(heights, maxHeight);

      expect(result.shouldCollapse).toBe(true);
      expect(result.totalHeight).toBe(totalHeight);
      // Verify hidden + visible adds up
      expect(result.hiddenHeight + result.visibleHeight).toBeGreaterThanOrEqual(totalHeight);
    });

    test('does not collapse when everything fits', () => {
      const heights = Array(15).fill(500); // 7500px total
      const maxHeight = 10000; // Everything fits

      const result = calculateCollapseInfo(heights, maxHeight);

      expect(result.shouldCollapse).toBe(false);
      expect(result.reason).toBe('nothing to hide');
    });

    test('handles edge case of maxHeight = 0', () => {
      const heights = Array(15).fill(1000);
      const result = calculateCollapseInfo(heights, 0);

      expect(result.shouldCollapse).toBe(true);
      // Should hide all but the last item
      expect(result.hideIndex).toBe(14);
    });

    test('handles single large message', () => {
      // 10 small messages + 1 huge message at the end
      const heights = [...Array(10).fill(100), 5000];
      const maxHeight = 3000;

      const result = calculateCollapseInfo(heights, maxHeight);

      // The large message alone exceeds threshold, so some hiding should happen
      expect(result.shouldCollapse).toBe(true);
    });
  });

  describe('Placeholder text generation', () => {
    const formatPlaceholder = (hiddenHeight, hiddenCount) => {
      const heightK = Math.round(hiddenHeight / 1000);
      return `${heightK}k pixels hidden (${hiddenCount} blocks)`;
    };

    test('formats small heights correctly', () => {
      expect(formatPlaceholder(1500, 5)).toBe('2k pixels hidden (5 blocks)');
    });

    test('formats large heights correctly', () => {
      expect(formatPlaceholder(25000, 50)).toBe('25k pixels hidden (50 blocks)');
    });

    test('rounds to nearest k', () => {
      expect(formatPlaceholder(1499, 3)).toBe('1k pixels hidden (3 blocks)');
      expect(formatPlaceholder(1500, 3)).toBe('2k pixels hidden (3 blocks)');
    });

    test('handles zero', () => {
      expect(formatPlaceholder(0, 0)).toBe('0k pixels hidden (0 blocks)');
    });
  });

  describe('Incremental restore logic', () => {
    const RESTORE_BATCH_SIZE = 3;

    function calculateRestoreBatch(hiddenElements, batchSize = RESTORE_BATCH_SIZE) {
      if (!hiddenElements || hiddenElements.length === 0) {
        return { toRestore: [], remaining: 0 };
      }

      const toRestore = hiddenElements.slice(-batchSize);
      const remaining = hiddenElements.length - toRestore.length;

      return { toRestore, remaining };
    }

    test('restores batch from end of hidden list', () => {
      const hidden = ['msg1', 'msg2', 'msg3', 'msg4', 'msg5'];
      const result = calculateRestoreBatch(hidden, 3);

      expect(result.toRestore).toEqual(['msg3', 'msg4', 'msg5']);
      expect(result.remaining).toBe(2);
    });

    test('restores all when fewer than batch size', () => {
      const hidden = ['msg1', 'msg2'];
      const result = calculateRestoreBatch(hidden, 3);

      expect(result.toRestore).toEqual(['msg1', 'msg2']);
      expect(result.remaining).toBe(0);
    });

    test('handles empty array', () => {
      const result = calculateRestoreBatch([], 3);

      expect(result.toRestore).toEqual([]);
      expect(result.remaining).toBe(0);
    });

    test('handles null/undefined', () => {
      expect(calculateRestoreBatch(null).toRestore).toEqual([]);
      expect(calculateRestoreBatch(undefined).toRestore).toEqual([]);
    });
  });
});
