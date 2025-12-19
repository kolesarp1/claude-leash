/**
 * Unit tests for session management
 */

describe('Session Management', () => {
  // Session ID extraction function
  const getSessionId = (pathname) => {
    const match = pathname.match(/\/(chat|code|project)\/([^/?]+)/);
    return match ? match[2] : pathname;
  };

  describe('getSessionId', () => {
    test('extracts session ID from /chat/ URL', () => {
      expect(getSessionId('/chat/abc123')).toBe('abc123');
      expect(getSessionId('/chat/session-uuid-here')).toBe('session-uuid-here');
    });

    test('extracts session ID from /code/ URL', () => {
      expect(getSessionId('/code/xyz789')).toBe('xyz789');
    });

    test('extracts session ID from /project/ URL', () => {
      expect(getSessionId('/project/proj-123')).toBe('proj-123');
    });

    test('handles URLs with query parameters', () => {
      expect(getSessionId('/chat/abc123?foo=bar')).toBe('abc123');
    });

    test('returns full pathname for non-session URLs', () => {
      expect(getSessionId('/settings')).toBe('/settings');
      expect(getSessionId('/')).toBe('/');
      expect(getSessionId('/about')).toBe('/about');
    });

    test('handles complex session IDs', () => {
      expect(getSessionId('/chat/550e8400-e29b-41d4-a716-446655440000')).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(getSessionId('/chat/my_session-123_test')).toBe('my_session-123_test');
    });
  });

  describe('Session cache behavior', () => {
    const MAX_SESSIONS_STORED = 50;

    // Simulated cache pruning function
    const pruneSessionCache = (cache) => {
      if (cache.size <= MAX_SESSIONS_STORED) return cache;

      const entries = Array.from(cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toRemove = entries.slice(0, entries.length - MAX_SESSIONS_STORED);
      toRemove.forEach(([key]) => cache.delete(key));

      return cache;
    };

    test('keeps cache under max size', () => {
      const cache = new Map();

      // Add 60 entries
      for (let i = 0; i < 60; i++) {
        cache.set(`session-${i}`, { timestamp: Date.now() + i * 1000, data: {} });
      }

      expect(cache.size).toBe(60);

      pruneSessionCache(cache);

      expect(cache.size).toBe(MAX_SESSIONS_STORED);
    });

    test('removes oldest entries first', () => {
      const cache = new Map();
      const now = Date.now();

      // Add entries with known timestamps
      cache.set('oldest', { timestamp: now - 10000, data: {} });
      cache.set('middle', { timestamp: now - 5000, data: {} });
      cache.set('newest', { timestamp: now, data: {} });

      // Force pruning by setting max to 2
      const maxSessions = 2;
      if (cache.size > maxSessions) {
        const entries = Array.from(cache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.slice(0, entries.length - maxSessions);
        toRemove.forEach(([key]) => cache.delete(key));
      }

      expect(cache.has('oldest')).toBe(false);
      expect(cache.has('middle')).toBe(true);
      expect(cache.has('newest')).toBe(true);
    });
  });
});
