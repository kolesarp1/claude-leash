/**
 * Unit tests for message validation
 */

describe('Message Validation', () => {
  // Extract validation function for testing
  const validateMessage = (message) => {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Invalid message format' };
    }
    if (!message.action || typeof message.action !== 'string') {
      return { valid: false, error: 'Missing or invalid action' };
    }
    if (message.maxHeight !== undefined) {
      if (typeof message.maxHeight !== 'number' || message.maxHeight < 1000 || message.maxHeight > 200000) {
        return { valid: false, error: 'maxHeight must be number between 1000-200000' };
      }
    }
    if (message.maxLines !== undefined) {
      if (typeof message.maxLines !== 'number' || message.maxLines < 1 || message.maxLines > 10000) {
        return { valid: false, error: 'maxLines must be number between 1-10000' };
      }
    }
    if (message.isCollapsed !== undefined && typeof message.isCollapsed !== 'boolean') {
      return { valid: false, error: 'isCollapsed must be boolean' };
    }
    if (message.enableClaudeAi !== undefined && typeof message.enableClaudeAi !== 'boolean') {
      return { valid: false, error: 'enableClaudeAi must be boolean' };
    }
    if (message.enableClaudeCode !== undefined && typeof message.enableClaudeCode !== 'boolean') {
      return { valid: false, error: 'enableClaudeCode must be boolean' };
    }
    if (message.enabled !== undefined && typeof message.enabled !== 'boolean') {
      return { valid: false, error: 'enabled must be boolean' };
    }
    return { valid: true };
  };

  describe('Valid messages', () => {
    test('accepts valid collapse message', () => {
      const msg = { action: 'collapse', maxHeight: 10000, isCollapsed: true };
      expect(validateMessage(msg)).toEqual({ valid: true });
    });

    test('accepts valid getStatus message', () => {
      const msg = { action: 'getStatus' };
      expect(validateMessage(msg)).toEqual({ valid: true });
    });

    test('accepts valid debug message', () => {
      const msg = { action: 'debug' };
      expect(validateMessage(msg)).toEqual({ valid: true });
    });

    test('accepts valid setDebugMode message', () => {
      const msg = { action: 'setDebugMode', enabled: true };
      expect(validateMessage(msg)).toEqual({ valid: true });
    });

    test('accepts message with all boolean options', () => {
      const msg = {
        action: 'collapse',
        maxHeight: 15000,
        isCollapsed: false,
        enableClaudeAi: true,
        enableClaudeCode: false
      };
      expect(validateMessage(msg)).toEqual({ valid: true });
    });

    test('accepts boundary maxHeight values', () => {
      expect(validateMessage({ action: 'collapse', maxHeight: 1000 })).toEqual({ valid: true });
      expect(validateMessage({ action: 'collapse', maxHeight: 200000 })).toEqual({ valid: true });
    });

    test('accepts boundary maxLines values', () => {
      expect(validateMessage({ action: 'collapse', maxLines: 1 })).toEqual({ valid: true });
      expect(validateMessage({ action: 'collapse', maxLines: 10000 })).toEqual({ valid: true });
    });
  });

  describe('Invalid messages', () => {
    test('rejects null message', () => {
      expect(validateMessage(null).valid).toBe(false);
    });

    test('rejects undefined message', () => {
      expect(validateMessage(undefined).valid).toBe(false);
    });

    test('rejects non-object message', () => {
      expect(validateMessage('string').valid).toBe(false);
      expect(validateMessage(123).valid).toBe(false);
      expect(validateMessage([]).valid).toBe(false);
    });

    test('rejects missing action', () => {
      const result = validateMessage({ maxHeight: 10000 });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing or invalid action');
    });

    test('rejects non-string action', () => {
      expect(validateMessage({ action: 123 }).valid).toBe(false);
      expect(validateMessage({ action: null }).valid).toBe(false);
    });

    test('rejects maxHeight below minimum', () => {
      const result = validateMessage({ action: 'collapse', maxHeight: 500 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maxHeight');
    });

    test('rejects maxHeight above maximum', () => {
      const result = validateMessage({ action: 'collapse', maxHeight: 300000 });
      expect(result.valid).toBe(false);
    });

    test('rejects non-numeric maxHeight', () => {
      expect(validateMessage({ action: 'collapse', maxHeight: '10000' }).valid).toBe(false);
    });

    test('rejects maxLines below minimum', () => {
      expect(validateMessage({ action: 'collapse', maxLines: 0 }).valid).toBe(false);
    });

    test('rejects maxLines above maximum', () => {
      expect(validateMessage({ action: 'collapse', maxLines: 20000 }).valid).toBe(false);
    });

    test('rejects non-boolean isCollapsed', () => {
      expect(validateMessage({ action: 'collapse', isCollapsed: 'true' }).valid).toBe(false);
      expect(validateMessage({ action: 'collapse', isCollapsed: 1 }).valid).toBe(false);
    });

    test('rejects non-boolean enableClaudeAi', () => {
      expect(validateMessage({ action: 'collapse', enableClaudeAi: 'yes' }).valid).toBe(false);
    });

    test('rejects non-boolean enableClaudeCode', () => {
      expect(validateMessage({ action: 'collapse', enableClaudeCode: null }).valid).toBe(false);
    });

    test('rejects non-boolean enabled', () => {
      expect(validateMessage({ action: 'setDebugMode', enabled: 1 }).valid).toBe(false);
    });
  });
});
