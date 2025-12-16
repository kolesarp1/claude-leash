/**
 * Unit tests for DOM selectors configuration
 */

describe('DOM Selectors Configuration', () => {
  // Extract selectors config for testing
  const DOM_SELECTORS = {
    container: {
      primary: '[class*="overflow-y-auto"], [class*="overflow-auto"], [class*="overflow-y-scroll"]',
      fallback: 'div'
    },
    sidebar: {
      classPatterns: ['bg-bg-', 'border-r-[', 'border-r ', 'flex-shrink-0'],
      maxLeftPosition: 50,
      maxWidth: 800,
      viewportWidthRatio: 0.6
    },
    content: {
      validTag: 'DIV',
      minHeight: 10,
      minWidth: 50
    }
  };

  describe('Container selectors', () => {
    test('primary selector contains overflow-y-auto', () => {
      expect(DOM_SELECTORS.container.primary).toContain('overflow-y-auto');
    });

    test('primary selector contains overflow-auto', () => {
      expect(DOM_SELECTORS.container.primary).toContain('overflow-auto');
    });

    test('primary selector contains overflow-y-scroll', () => {
      expect(DOM_SELECTORS.container.primary).toContain('overflow-y-scroll');
    });

    test('fallback selector targets divs', () => {
      expect(DOM_SELECTORS.container.fallback).toBe('div');
    });

    test('primary selector is valid CSS', () => {
      // This should not throw
      expect(() => {
        document.querySelectorAll(DOM_SELECTORS.container.primary);
      }).not.toThrow();
    });
  });

  describe('Sidebar detection patterns', () => {
    test('includes bg-bg- pattern for Claude Code sidebar', () => {
      expect(DOM_SELECTORS.sidebar.classPatterns).toContain('bg-bg-');
    });

    test('includes border-r patterns for sidebar', () => {
      expect(DOM_SELECTORS.sidebar.classPatterns).toContain('border-r-[');
      expect(DOM_SELECTORS.sidebar.classPatterns).toContain('border-r ');
    });

    test('includes flex-shrink-0 for fixed sidebars', () => {
      expect(DOM_SELECTORS.sidebar.classPatterns).toContain('flex-shrink-0');
    });

    test('maxLeftPosition is reasonable', () => {
      expect(DOM_SELECTORS.sidebar.maxLeftPosition).toBeGreaterThan(0);
      expect(DOM_SELECTORS.sidebar.maxLeftPosition).toBeLessThan(200);
    });

    test('maxWidth excludes most main content areas', () => {
      expect(DOM_SELECTORS.sidebar.maxWidth).toBeLessThan(1000);
      expect(DOM_SELECTORS.sidebar.maxWidth).toBeGreaterThan(200);
    });

    test('viewportWidthRatio is between 0 and 1', () => {
      expect(DOM_SELECTORS.sidebar.viewportWidthRatio).toBeGreaterThan(0);
      expect(DOM_SELECTORS.sidebar.viewportWidthRatio).toBeLessThan(1);
    });
  });

  describe('Content filtering', () => {
    test('validTag is DIV', () => {
      expect(DOM_SELECTORS.content.validTag).toBe('DIV');
    });

    test('minHeight filters tiny elements', () => {
      expect(DOM_SELECTORS.content.minHeight).toBeGreaterThan(0);
      expect(DOM_SELECTORS.content.minHeight).toBeLessThan(50);
    });

    test('minWidth filters narrow elements', () => {
      expect(DOM_SELECTORS.content.minWidth).toBeGreaterThan(0);
      expect(DOM_SELECTORS.content.minWidth).toBeLessThan(100);
    });
  });

  describe('Sidebar class pattern matching', () => {
    const hasSidebarClass = (className) => {
      return DOM_SELECTORS.sidebar.classPatterns.some(pattern =>
        className.indexOf(pattern) !== -1
      );
    };

    test('matches Claude Code sidebar class', () => {
      expect(hasSidebarClass('flex flex-col bg-bg-100 border-r-0.5')).toBe(true);
    });

    test('matches flex-shrink-0 sidebar', () => {
      expect(hasSidebarClass('w-64 flex-shrink-0 overflow-hidden')).toBe(true);
    });

    test('matches border-r class', () => {
      expect(hasSidebarClass('h-full border-r border-gray-200')).toBe(true);
    });

    test('does not match main content area', () => {
      expect(hasSidebarClass('flex-1 overflow-y-auto')).toBe(false);
    });

    test('does not match generic containers', () => {
      expect(hasSidebarClass('flex flex-col h-full')).toBe(false);
    });
  });
});
