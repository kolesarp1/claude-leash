/**
 * Unit tests for badge functionality
 */

describe('Badge Management', () => {
  describe('Badge text formatting', () => {
    function formatBadgeText(pixels) {
      if (typeof pixels !== 'number' || pixels < 0) return '';
      if (pixels === 0) return '0';

      const k = Math.round(pixels / 1000);
      return k > 0 ? `${k}k` : '<1k';
    }

    test('formats kilobytes correctly', () => {
      expect(formatBadgeText(10000)).toBe('10k');
      expect(formatBadgeText(15000)).toBe('15k');
      expect(formatBadgeText(5500)).toBe('6k'); // Rounds up
    });

    test('handles small values', () => {
      expect(formatBadgeText(500)).toBe('<1k');
      expect(formatBadgeText(999)).toBe('<1k');
    });

    test('handles zero', () => {
      expect(formatBadgeText(0)).toBe('0');
    });

    test('handles edge values', () => {
      expect(formatBadgeText(1000)).toBe('1k');
      expect(formatBadgeText(1499)).toBe('1k');
      expect(formatBadgeText(1500)).toBe('2k');
    });

    test('handles invalid inputs', () => {
      expect(formatBadgeText(-100)).toBe('');
      expect(formatBadgeText('string')).toBe('');
      expect(formatBadgeText(null)).toBe('');
      expect(formatBadgeText(undefined)).toBe('');
    });

    test('handles large values', () => {
      expect(formatBadgeText(100000)).toBe('100k');
      expect(formatBadgeText(999000)).toBe('999k');
    });
  });

  describe('Badge color selection', () => {
    const BADGE_COLORS = {
      claudeAi: '#3b82f6',    // Blue
      claudeCode: '#10b981',  // Green
      disabled: '#6b7280',    // Gray
      collapsed: '#8b5cf6'    // Purple
    };

    function getBadgeColor(platform, isCollapsed, isEnabled) {
      if (!isEnabled) return BADGE_COLORS.disabled;
      if (isCollapsed) return BADGE_COLORS.collapsed;

      switch (platform) {
        case 'claudeAi':
          return BADGE_COLORS.claudeAi;
        case 'claudeCode':
          return BADGE_COLORS.claudeCode;
        default:
          return BADGE_COLORS.disabled;
      }
    }

    test('returns blue for Claude.ai when active', () => {
      expect(getBadgeColor('claudeAi', false, true)).toBe(BADGE_COLORS.claudeAi);
    });

    test('returns green for Claude Code when active', () => {
      expect(getBadgeColor('claudeCode', false, true)).toBe(BADGE_COLORS.claudeCode);
    });

    test('returns purple when collapsed', () => {
      expect(getBadgeColor('claudeAi', true, true)).toBe(BADGE_COLORS.collapsed);
      expect(getBadgeColor('claudeCode', true, true)).toBe(BADGE_COLORS.collapsed);
    });

    test('returns gray when disabled', () => {
      expect(getBadgeColor('claudeAi', false, false)).toBe(BADGE_COLORS.disabled);
      expect(getBadgeColor('claudeCode', false, false)).toBe(BADGE_COLORS.disabled);
      expect(getBadgeColor('claudeAi', true, false)).toBe(BADGE_COLORS.disabled);
    });

    test('returns gray for unknown platform', () => {
      expect(getBadgeColor('unknown', false, true)).toBe(BADGE_COLORS.disabled);
      expect(getBadgeColor(null, false, true)).toBe(BADGE_COLORS.disabled);
    });
  });

  describe('Platform detection', () => {
    function detectPlatform(url) {
      if (!url || typeof url !== 'string') return null;

      if (url.includes('claude.ai')) return 'claudeAi';
      if (url.includes('code.anthropic.com')) return 'claudeCode';

      return null;
    }

    test('detects Claude.ai', () => {
      expect(detectPlatform('https://claude.ai')).toBe('claudeAi');
      expect(detectPlatform('https://claude.ai/chat/123')).toBe('claudeAi');
      expect(detectPlatform('https://www.claude.ai/new')).toBe('claudeAi');
    });

    test('detects Claude Code', () => {
      expect(detectPlatform('https://code.anthropic.com')).toBe('claudeCode');
      expect(detectPlatform('https://code.anthropic.com/project/xyz')).toBe('claudeCode');
    });

    test('returns null for unknown URLs', () => {
      expect(detectPlatform('https://google.com')).toBe(null);
      expect(detectPlatform('https://anthropic.com')).toBe(null);
    });

    test('returns null for invalid inputs', () => {
      expect(detectPlatform(null)).toBe(null);
      expect(detectPlatform(undefined)).toBe(null);
      expect(detectPlatform('')).toBe(null);
      expect(detectPlatform(123)).toBe(null);
    });
  });

  describe('Badge update message', () => {
    function createBadgeUpdateMessage(visiblePixels, platform, isCollapsed, isEnabled) {
      return {
        type: 'updateBadge',
        data: {
          text: formatBadgeText(visiblePixels),
          color: getBadgeColor(platform, isCollapsed, isEnabled),
          platform,
          visiblePixels
        }
      };

      function formatBadgeText(pixels) {
        if (typeof pixels !== 'number' || pixels < 0) return '';
        if (pixels === 0) return '0';
        const k = Math.round(pixels / 1000);
        return k > 0 ? `${k}k` : '<1k';
      }

      function getBadgeColor(platform, isCollapsed, isEnabled) {
        if (!isEnabled) return '#6b7280';
        if (isCollapsed) return '#8b5cf6';
        return platform === 'claudeAi' ? '#3b82f6' : '#10b981';
      }
    }

    test('creates valid message structure', () => {
      const msg = createBadgeUpdateMessage(10000, 'claudeAi', false, true);

      expect(msg).toHaveProperty('type', 'updateBadge');
      expect(msg).toHaveProperty('data');
      expect(msg.data).toHaveProperty('text');
      expect(msg.data).toHaveProperty('color');
      expect(msg.data).toHaveProperty('platform');
      expect(msg.data).toHaveProperty('visiblePixels');
    });
  });
});
