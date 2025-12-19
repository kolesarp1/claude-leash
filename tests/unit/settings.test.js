/**
 * Unit tests for settings management
 */

describe('Settings Management', () => {
  // Default settings
  const DEFAULT_SETTINGS = {
    maxHeight: 10000,
    scale: 1,
    isCollapsed: false,
    enableClaudeAi: false,
    enableClaudeCode: true,
    debugMode: false
  };

  // Settings validation and merging function
  function mergeWithDefaults(stored) {
    if (!stored || typeof stored !== 'object') {
      return { ...DEFAULT_SETTINGS };
    }

    return {
      maxHeight: typeof stored.maxHeight === 'number' ? stored.maxHeight : DEFAULT_SETTINGS.maxHeight,
      scale: typeof stored.scale === 'number' ? stored.scale : DEFAULT_SETTINGS.scale,
      isCollapsed: typeof stored.isCollapsed === 'boolean' ? stored.isCollapsed : DEFAULT_SETTINGS.isCollapsed,
      enableClaudeAi: typeof stored.enableClaudeAi === 'boolean' ? stored.enableClaudeAi : DEFAULT_SETTINGS.enableClaudeAi,
      enableClaudeCode: typeof stored.enableClaudeCode === 'boolean' ? stored.enableClaudeCode : DEFAULT_SETTINGS.enableClaudeCode,
      debugMode: typeof stored.debugMode === 'boolean' ? stored.debugMode : DEFAULT_SETTINGS.debugMode
    };
  }

  describe('mergeWithDefaults', () => {
    test('returns defaults for null', () => {
      const result = mergeWithDefaults(null);
      expect(result).toEqual(DEFAULT_SETTINGS);
    });

    test('returns defaults for undefined', () => {
      const result = mergeWithDefaults(undefined);
      expect(result).toEqual(DEFAULT_SETTINGS);
    });

    test('returns defaults for non-object', () => {
      expect(mergeWithDefaults('string')).toEqual(DEFAULT_SETTINGS);
      expect(mergeWithDefaults(123)).toEqual(DEFAULT_SETTINGS);
      expect(mergeWithDefaults(true)).toEqual(DEFAULT_SETTINGS);
    });

    test('merges partial settings with defaults', () => {
      const partial = { maxHeight: 15000 };
      const result = mergeWithDefaults(partial);

      expect(result.maxHeight).toBe(15000);
      expect(result.scale).toBe(DEFAULT_SETTINGS.scale);
      expect(result.isCollapsed).toBe(DEFAULT_SETTINGS.isCollapsed);
    });

    test('ignores invalid types', () => {
      const invalid = {
        maxHeight: 'not a number',
        scale: 2,
        isCollapsed: 'true' // string instead of boolean
      };
      const result = mergeWithDefaults(invalid);

      expect(result.maxHeight).toBe(DEFAULT_SETTINGS.maxHeight);
      expect(result.scale).toBe(2);
      expect(result.isCollapsed).toBe(DEFAULT_SETTINGS.isCollapsed);
    });

    test('preserves all valid settings', () => {
      const complete = {
        maxHeight: 20000,
        scale: 2,
        isCollapsed: true,
        enableClaudeAi: true,
        enableClaudeCode: false,
        debugMode: true
      };
      const result = mergeWithDefaults(complete);

      expect(result).toEqual(complete);
    });
  });

  describe('Scale factor application', () => {
    function applyScale(baseHeight, scale) {
      if (typeof scale !== 'number' || scale < 1 || scale > 3) {
        return baseHeight;
      }
      return Math.round(baseHeight * scale);
    }

    test('applies 1x scale (no change)', () => {
      expect(applyScale(10000, 1)).toBe(10000);
    });

    test('applies 2x scale', () => {
      expect(applyScale(10000, 2)).toBe(20000);
    });

    test('applies 3x scale', () => {
      expect(applyScale(10000, 3)).toBe(30000);
    });

    test('applies fractional scale', () => {
      expect(applyScale(10000, 1.5)).toBe(15000);
      expect(applyScale(10000, 2.5)).toBe(25000);
    });

    test('returns base for invalid scale', () => {
      expect(applyScale(10000, 0)).toBe(10000);
      expect(applyScale(10000, -1)).toBe(10000);
      expect(applyScale(10000, 5)).toBe(10000);
      expect(applyScale(10000, 'string')).toBe(10000);
    });
  });

  describe('Interface toggle check', () => {
    function isEnabledForCurrentInterface(settings, url) {
      if (!settings || !url) return false;

      const isClaudeAi = url.includes('claude.ai');
      const isClaudeCode = url.includes('code.anthropic.com');

      if (isClaudeAi) return settings.enableClaudeAi === true;
      if (isClaudeCode) return settings.enableClaudeCode === true;

      return false;
    }

    test('returns true for Claude.ai when enabled', () => {
      const settings = { enableClaudeAi: true, enableClaudeCode: false };
      expect(isEnabledForCurrentInterface(settings, 'https://claude.ai/chat/123')).toBe(true);
    });

    test('returns false for Claude.ai when disabled', () => {
      const settings = { enableClaudeAi: false, enableClaudeCode: true };
      expect(isEnabledForCurrentInterface(settings, 'https://claude.ai/chat/123')).toBe(false);
    });

    test('returns true for Claude Code when enabled', () => {
      const settings = { enableClaudeAi: false, enableClaudeCode: true };
      expect(isEnabledForCurrentInterface(settings, 'https://code.anthropic.com/project/xyz')).toBe(true);
    });

    test('returns false for Claude Code when disabled', () => {
      const settings = { enableClaudeAi: true, enableClaudeCode: false };
      expect(isEnabledForCurrentInterface(settings, 'https://code.anthropic.com/project/xyz')).toBe(false);
    });

    test('returns false for unknown URLs', () => {
      const settings = { enableClaudeAi: true, enableClaudeCode: true };
      expect(isEnabledForCurrentInterface(settings, 'https://example.com')).toBe(false);
      expect(isEnabledForCurrentInterface(settings, 'https://anthropic.com')).toBe(false);
    });

    test('returns false for null/undefined inputs', () => {
      expect(isEnabledForCurrentInterface(null, 'https://claude.ai')).toBe(false);
      expect(isEnabledForCurrentInterface({}, null)).toBe(false);
      expect(isEnabledForCurrentInterface(undefined, undefined)).toBe(false);
    });
  });

  describe('Threshold bounds', () => {
    const MIN_THRESHOLD = 4000;
    const MAX_THRESHOLD = 40000;

    function clampThreshold(value) {
      if (typeof value !== 'number' || isNaN(value)) {
        return 10000; // Default
      }
      return Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, value));
    }

    test('clamps below minimum', () => {
      expect(clampThreshold(1000)).toBe(MIN_THRESHOLD);
      expect(clampThreshold(0)).toBe(MIN_THRESHOLD);
      expect(clampThreshold(-1000)).toBe(MIN_THRESHOLD);
    });

    test('clamps above maximum', () => {
      expect(clampThreshold(50000)).toBe(MAX_THRESHOLD);
      expect(clampThreshold(100000)).toBe(MAX_THRESHOLD);
    });

    test('preserves values within range', () => {
      expect(clampThreshold(10000)).toBe(10000);
      expect(clampThreshold(MIN_THRESHOLD)).toBe(MIN_THRESHOLD);
      expect(clampThreshold(MAX_THRESHOLD)).toBe(MAX_THRESHOLD);
      expect(clampThreshold(25000)).toBe(25000);
    });

    test('returns default for invalid values', () => {
      expect(clampThreshold('string')).toBe(10000);
      expect(clampThreshold(NaN)).toBe(10000);
      expect(clampThreshold(null)).toBe(10000);
      expect(clampThreshold(undefined)).toBe(10000);
    });
  });
});
