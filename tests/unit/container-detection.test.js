/**
 * Unit tests for container detection logic
 */

describe('Container Detection', () => {
  // Constants from content.js
  const MIN_SCROLL_HEIGHT = 500;
  const MIN_CONTAINER_WIDTH = 300;
  const MIN_CONTAINER_HEIGHT = 200;
  const SIDEBAR_MAX_LEFT = 150;
  const SIDEBAR_MAX_WIDTH = 400;

  const DOM_SELECTORS = {
    sidebar: {
      classPatterns: ['bg-bg-', 'border-r-[', 'border-r ', 'flex-shrink-0'],
      maxLeftPosition: 50,
      maxWidth: 800,
      viewportWidthRatio: 0.6
    }
  };

  // Simplified scoring function for testing
  function scoreContainer(container, viewportHeight = 800) {
    const rect = container.getBoundingClientRect();
    const scrollHeight = container.scrollHeight;
    const classes = String(container.className || '');

    // Must be visible and reasonably sized
    if (rect.width < MIN_CONTAINER_WIDTH || rect.height < MIN_CONTAINER_HEIGHT) return 0;
    if (rect.left < SIDEBAR_MAX_LEFT && rect.width < SIDEBAR_MAX_WIDTH) return 0;
    if (scrollHeight <= MIN_SCROLL_HEIGHT) return 0;

    // Exclude sidebar panels
    const sidebarConfig = DOM_SELECTORS.sidebar;
    const hasSidebarClass = sidebarConfig.classPatterns.some(pattern =>
      classes.indexOf(pattern) !== -1
    );
    const isNarrowLeftPanel = rect.left < sidebarConfig.maxLeftPosition &&
                              rect.width < sidebarConfig.maxWidth &&
                              rect.width < window.innerWidth * sidebarConfig.viewportWidthRatio;

    if (hasSidebarClass) return 0;
    if (isNarrowLeftPanel) return 0;

    let score = scrollHeight;
    const heightRatio = rect.height / viewportHeight;
    if (heightRatio > 0.5) score += 10000;
    if (heightRatio > 0.7) score += 20000;

    return score;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
  });

  describe('Basic container scoring', () => {
    test('returns 0 for container too narrow', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'scrollHeight', { value: 1000 });
      container.style.cssText = 'width: 200px; height: 500px;';
      document.body.appendChild(container);

      // Mock getBoundingClientRect
      container.getBoundingClientRect = () => ({
        width: 200,
        height: 500,
        left: 200,
        top: 0
      });

      expect(scoreContainer(container)).toBe(0);
    });

    test('returns 0 for container too short', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'scrollHeight', { value: 1000 });
      document.body.appendChild(container);

      container.getBoundingClientRect = () => ({
        width: 800,
        height: 100, // Too short
        left: 200,
        top: 0
      });

      expect(scoreContainer(container)).toBe(0);
    });

    test('returns 0 for container with insufficient scroll height', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'scrollHeight', { value: 300 }); // Below MIN_SCROLL_HEIGHT
      document.body.appendChild(container);

      container.getBoundingClientRect = () => ({
        width: 800,
        height: 500,
        left: 200,
        top: 0
      });

      expect(scoreContainer(container)).toBe(0);
    });

    test('scores valid container based on scroll height', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'scrollHeight', { value: 2000 });
      document.body.appendChild(container);

      container.getBoundingClientRect = () => ({
        width: 800,
        height: 500,
        left: 200,
        top: 0
      });

      const score = scoreContainer(container);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeGreaterThanOrEqual(2000);
    });

    test('adds bonus for container filling viewport', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'scrollHeight', { value: 2000 });
      document.body.appendChild(container);

      container.getBoundingClientRect = () => ({
        width: 800,
        height: 600, // > 0.7 * 800 = 560
        left: 200,
        top: 0
      });

      const score = scoreContainer(container, 800);
      expect(score).toBeGreaterThanOrEqual(2000 + 30000); // scrollHeight + both bonuses
    });
  });

  describe('Sidebar exclusion', () => {
    test('excludes container with bg-bg- class', () => {
      const container = document.createElement('div');
      container.className = 'bg-bg-100 flex-col';
      Object.defineProperty(container, 'scrollHeight', { value: 2000 });
      document.body.appendChild(container);

      container.getBoundingClientRect = () => ({
        width: 800,
        height: 500,
        left: 200,
        top: 0
      });

      expect(scoreContainer(container)).toBe(0);
    });

    test('excludes container with border-r class', () => {
      const container = document.createElement('div');
      container.className = 'h-full border-r border-gray-200';
      Object.defineProperty(container, 'scrollHeight', { value: 2000 });
      document.body.appendChild(container);

      container.getBoundingClientRect = () => ({
        width: 800,
        height: 500,
        left: 200,
        top: 0
      });

      expect(scoreContainer(container)).toBe(0);
    });

    test('excludes container with flex-shrink-0', () => {
      const container = document.createElement('div');
      container.className = 'w-64 flex-shrink-0';
      Object.defineProperty(container, 'scrollHeight', { value: 2000 });
      document.body.appendChild(container);

      container.getBoundingClientRect = () => ({
        width: 800,
        height: 500,
        left: 200,
        top: 0
      });

      expect(scoreContainer(container)).toBe(0);
    });

    test('excludes narrow left-edge panels', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'scrollHeight', { value: 2000 });
      document.body.appendChild(container);

      container.getBoundingClientRect = () => ({
        width: 300, // Narrow
        height: 500,
        left: 0,    // Left edge
        top: 0
      });

      expect(scoreContainer(container)).toBe(0);
    });

    test('does not exclude wide main content area', () => {
      const container = document.createElement('div');
      container.className = 'flex-1 overflow-y-auto';
      Object.defineProperty(container, 'scrollHeight', { value: 2000 });
      document.body.appendChild(container);

      container.getBoundingClientRect = () => ({
        width: 1200,
        height: 500,
        left: 300,
        top: 0
      });

      expect(scoreContainer(container)).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    test('handles container with no className', () => {
      const container = document.createElement('div');
      Object.defineProperty(container, 'scrollHeight', { value: 2000 });
      document.body.appendChild(container);

      container.getBoundingClientRect = () => ({
        width: 800,
        height: 500,
        left: 200,
        top: 0
      });

      // Should not throw
      expect(() => scoreContainer(container)).not.toThrow();
      expect(scoreContainer(container)).toBeGreaterThan(0);
    });

    test('handles container with SVGAnimatedString className', () => {
      // SVG elements have className as SVGAnimatedString, not string
      const container = document.createElement('div');
      container.className = { baseVal: 'test', animVal: 'test' }; // SVG-like
      Object.defineProperty(container, 'scrollHeight', { value: 2000 });
      document.body.appendChild(container);

      container.getBoundingClientRect = () => ({
        width: 800,
        height: 500,
        left: 200,
        top: 0
      });

      // Should not throw due to String() coercion
      expect(() => scoreContainer(container)).not.toThrow();
    });
  });
});
