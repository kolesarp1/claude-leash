// Claude Leash - Popup Script v4.0.0
// Virtual Scrolling Controls
(function() {
  'use strict';

  const STORAGE_KEY = 'claudeCollapseSettings';
  const THEME_KEY = 'claudeLeashTheme';

  let currentTab = null;
  let isEnabled = false;
  let bufferSize = 3;
  let enableClaudeAi = false;
  let enableClaudeCode = true;
  let debugMode = false;
  let currentTheme = 'light';

  // Elements
  const statusEl = document.getElementById('status');
  const memoryStatEl = document.getElementById('memoryStat');
  const memoryTextEl = document.getElementById('memoryText');
  const bufferSliderEl = document.getElementById('bufferSlider');
  const bufferValueEl = document.getElementById('bufferValue');
  const toggleBtn = document.getElementById('toggleBtn');
  const toggleIcon = document.getElementById('toggleIcon');
  const toggleText = document.getElementById('toggleText');
  const refreshBtn = document.getElementById('refreshBtn');
  const debugBtn = document.getElementById('debugBtn');
  const enableClaudeAiEl = document.getElementById('enableClaudeAi');
  const enableClaudeCodeEl = document.getElementById('enableClaudeCode');
  const debugModeEl = document.getElementById('debugMode');
  const themeLightBtn = document.getElementById('themeLightBtn');
  const themeDarkBtn = document.getElementById('themeDarkBtn');
  const themeAutoBtn = document.getElementById('themeAutoBtn');
  const infoBoxEl = document.getElementById('infoBox');
  const debugToolsEl = document.getElementById('debugTools');
  const exportMetricsBtn = document.getElementById('exportMetricsBtn');
  const measureFpsBtn = document.getElementById('measureFpsBtn');

  // ============ Theme handling ============
  function applyTheme(theme) {
    const body = document.body;
    body.classList.remove('light', 'dark');

    themeLightBtn.classList.remove('active');
    themeDarkBtn.classList.remove('active');
    themeAutoBtn.classList.remove('active');

    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      body.classList.add(prefersDark ? 'dark' : 'light');
      themeAutoBtn.classList.add('active');
    } else {
      body.classList.add(theme);
      if (theme === 'light') themeLightBtn.classList.add('active');
      if (theme === 'dark') themeDarkBtn.classList.add('active');
    }

    currentTheme = theme;
  }

  async function loadTheme() {
    try {
      const result = await chrome.storage.local.get(THEME_KEY);
      applyTheme(result[THEME_KEY] || 'light');
    } catch (e) {
      applyTheme('light');
    }
  }

  async function saveTheme(theme) {
    try {
      await chrome.storage.local.set({ [THEME_KEY]: theme });
      applyTheme(theme);
    } catch (e) {
      console.debug('Failed to save theme:', e.message);
    }
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'auto') applyTheme('auto');
  });

  // ============ Debug tools handling ============
  function updateDebugTools() {
    debugToolsEl.style.display = debugMode ? 'block' : 'none';
  }

  async function exportMetrics() {
    const response = await sendMessage('getMetrics');
    if (response?.success && response.metrics) {
      const blob = new Blob([JSON.stringify(response.metrics, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `claude-leash-metrics-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      statusEl.textContent = 'Metrics exported!';
    } else {
      statusEl.textContent = 'Failed to export metrics';
    }
  }

  async function measureFPS() {
    const response = await sendMessage('measureFPS', { duration: 3000 });
    if (response?.success) {
      statusEl.textContent = 'Measuring FPS (3s)... Check console';
    }
  }

  // ============ Settings handling ============
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        // Support migration from old isCollapsed to new isEnabled
        if (result[STORAGE_KEY].isEnabled !== undefined) {
          isEnabled = result[STORAGE_KEY].isEnabled;
        } else if (result[STORAGE_KEY].isCollapsed !== undefined) {
          isEnabled = result[STORAGE_KEY].isCollapsed;
        }
        bufferSize = result[STORAGE_KEY].bufferSize || 3;
        enableClaudeCode = result[STORAGE_KEY].enableClaudeCode !== false;
        enableClaudeAi = result[STORAGE_KEY].enableClaudeAi === true;
        debugMode = result[STORAGE_KEY].debugMode === true;
      }
      bufferSliderEl.value = bufferSize;
      bufferValueEl.textContent = bufferSize;
      enableClaudeAiEl.checked = enableClaudeAi;
      enableClaudeCodeEl.checked = enableClaudeCode;
      debugModeEl.checked = debugMode;
      updateToggleButton();
      updateDebugTools();
    } catch (e) {
      console.debug('Failed to load settings:', e.message);
    }
  }

  async function saveSettings() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: {
          version: 2,
          isEnabled,
          bufferSize,
          enableClaudeAi,
          enableClaudeCode,
          debugMode
        }
      });
    } catch (e) {
      console.debug('Failed to save settings:', e.message);
    }
  }

  // ============ Content script communication ============
  async function sendMessage(action, data = {}) {
    if (!currentTab?.id) return null;

    try {
      return await chrome.tabs.sendMessage(currentTab.id, { action, ...data });
    } catch (e) {
      statusEl.textContent = 'Error communicating with page';
      statusEl.classList.add('not-claude');
      return null;
    }
  }

  function updateToggleButton() {
    if (isEnabled) {
      toggleBtn.classList.add('active');
      toggleIcon.textContent = '✓';
      toggleText.textContent = 'Enabled';
    } else {
      toggleBtn.classList.remove('active');
      toggleIcon.textContent = '⚡';
      toggleText.textContent = 'Enable';
    }
  }

  function updateStatus(response) {
    if (response && response.success) {
      // Check if disabled for current interface
      if (response.disabled) {
        statusEl.textContent = 'Disabled for this interface';
        statusEl.classList.remove('not-claude', 'virtualized');
        memoryStatEl.style.display = 'none';
        return;
      }

      const isVirtualized = response.isVirtualized;
      const total = response.total || 0;
      const visible = response.visible || total;
      const hidden = response.hidden || 0;
      const memoryReduction = response.memoryReduction || 0;

      if (isVirtualized && total > 0) {
        statusEl.textContent = `${visible} / ${total} messages in DOM`;
        statusEl.classList.remove('not-claude');
        statusEl.classList.add('virtualized');

        // Show memory reduction
        if (memoryReduction > 0) {
          memoryStatEl.style.display = 'block';
          memoryTextEl.textContent = `~${memoryReduction}% memory reduction`;
        } else {
          memoryStatEl.style.display = 'none';
        }
      } else if (isEnabled) {
        statusEl.textContent = `${total} messages (ready to virtualize)`;
        statusEl.classList.remove('not-claude', 'virtualized');
        memoryStatEl.style.display = 'none';
      } else {
        statusEl.textContent = `${total} messages (not virtualized)`;
        statusEl.classList.remove('not-claude', 'virtualized');
        memoryStatEl.style.display = 'none';
      }
    } else {
      statusEl.textContent = response?.error || 'No content found';
      statusEl.classList.add('not-claude');
      statusEl.classList.remove('virtualized');
      memoryStatEl.style.display = 'none';
    }
  }

  async function applySettings() {
    const response = await sendMessage('collapse', {
      isCollapsed: isEnabled, // Content script uses isCollapsed for toggle
      bufferSize,
      enableClaudeAi,
      enableClaudeCode
    });
    updateStatus(response);
  }

  // ============ Initialize ============
  async function init() {
    await loadTheme();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    if (!tab.url?.includes('claude.ai')) {
      statusEl.textContent = 'Open claude.ai to use';
      statusEl.classList.add('not-claude');
      bufferSliderEl.disabled = true;
      toggleBtn.disabled = true;
      refreshBtn.disabled = true;
      return;
    }

    await loadSettings();

    // Get initial status
    const response = await sendMessage('getStatus');
    if (response?.success) {
      // Sync local state with content script
      if (response.isVirtualized !== undefined) {
        isEnabled = response.isVirtualized;
        updateToggleButton();
      }
      updateStatus(response);
    }
  }

  // ============ Event listeners ============

  // Theme
  themeLightBtn.addEventListener('click', () => saveTheme('light'));
  themeDarkBtn.addEventListener('click', () => saveTheme('dark'));
  themeAutoBtn.addEventListener('click', () => saveTheme('auto'));

  // Buffer size slider
  bufferSliderEl.addEventListener('input', (e) => {
    bufferSize = parseInt(e.target.value);
    bufferValueEl.textContent = bufferSize;
  });

  bufferSliderEl.addEventListener('change', async () => {
    await saveSettings();
    if (isEnabled) {
      // Disable and re-enable to apply new buffer size
      await sendMessage('restore');
      await applySettings();
    }
  });

  // Toggle button
  toggleBtn.addEventListener('click', async () => {
    isEnabled = !isEnabled;
    updateToggleButton();
    await saveSettings();
    await applySettings();
  });

  // Refresh button
  refreshBtn.addEventListener('click', async () => {
    const response = await sendMessage('getStatus');
    updateStatus(response);
  });

  // Debug button
  debugBtn.addEventListener('click', async () => {
    const response = await sendMessage('debug');
    if (response?.success) {
      statusEl.textContent = `${response.isVirtualized ? 'Virtualized' : 'Normal'}: ${response.scrollHeight}px`;
    }
  });

  // Interface toggle checkboxes
  enableClaudeAiEl.addEventListener('change', async () => {
    enableClaudeAi = enableClaudeAiEl.checked;
    await saveSettings();
    await applySettings();
  });

  enableClaudeCodeEl.addEventListener('change', async () => {
    enableClaudeCode = enableClaudeCodeEl.checked;
    await saveSettings();
    await applySettings();
  });

  // Debug mode checkbox
  debugModeEl.addEventListener('change', async () => {
    debugMode = debugModeEl.checked;
    updateDebugTools();
    await saveSettings();
    await sendMessage('setDebugMode', { enabled: debugMode });
  });

  // Debug tools
  exportMetricsBtn.addEventListener('click', exportMetrics);
  measureFpsBtn.addEventListener('click', measureFPS);

  init();
})();
