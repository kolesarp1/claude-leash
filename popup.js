// Claude Leash - Popup Script
(function() {
  'use strict';

  const STORAGE_KEY = 'claudeCollapseSettings';
  const THEME_KEY = 'claudeLeashTheme';
  const TIP_DISMISSED_KEY = 'claudeLeashTipDismissed';

  let currentTab = null;
  let isCollapsed = false;
  let maxHeight = 10000; // pixels
  let scale = 1;
  let enableClaudeAi = false;
  let enableClaudeCode = true;
  let debugMode = false;
  let currentTheme = 'light';

  // Elements
  const statusEl = document.getElementById('status');
  const sliderEl = document.getElementById('slider');
  const sliderValueEl = document.getElementById('sliderValue');
  const scaleSliderEl = document.getElementById('scaleSlider');
  const scaleValueEl = document.getElementById('scaleValue');
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
  const tipBannerEl = document.getElementById('tipBanner');
  const tipDismissEl = document.getElementById('tipDismiss');
  const debugToolsEl = document.getElementById('debugTools');
  const exportMetricsBtn = document.getElementById('exportMetricsBtn');
  const measureFpsBtn = document.getElementById('measureFpsBtn');

  // Format pixel value for display
  function formatPixels(px) {
    if (px >= 1000) {
      return Math.round(px / 1000) + 'k';
    }
    return px.toString();
  }

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
    } catch (e) {}
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'auto') applyTheme('auto');
  });

  // ============ Tip banner handling ============
  async function checkAndShowTip() {
    try {
      const result = await chrome.storage.local.get(TIP_DISMISSED_KEY);
      if (!result[TIP_DISMISSED_KEY]) {
        tipBannerEl.style.display = 'flex';
      }
    } catch (e) {
      // Show tip by default
      tipBannerEl.style.display = 'flex';
    }
  }

  async function dismissTip() {
    tipBannerEl.style.display = 'none';
    try {
      await chrome.storage.local.set({ [TIP_DISMISSED_KEY]: true });
    } catch (e) {}
  }

  // ============ Debug tools handling ============
  function updateDebugTools() {
    debugToolsEl.style.display = debugMode ? 'block' : 'none';
  }

  async function exportMetrics() {
    const response = await sendMessage('getMetrics');
    if (response?.success && response.metrics) {
      // Download as JSON file
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
        // Support both old (maxLines) and new (maxHeight) settings
        if (result[STORAGE_KEY].maxHeight) {
          maxHeight = result[STORAGE_KEY].maxHeight;
        } else if (result[STORAGE_KEY].maxLines) {
          maxHeight = result[STORAGE_KEY].maxLines * 24; // Convert old format
        }
        scale = result[STORAGE_KEY].scale || 1;
        isCollapsed = result[STORAGE_KEY].isCollapsed || false;
        // Interface toggles - Claude Code ON by default, Claude.ai OFF by default
        enableClaudeCode = result[STORAGE_KEY].enableClaudeCode !== false;
        enableClaudeAi = result[STORAGE_KEY].enableClaudeAi === true;
        debugMode = result[STORAGE_KEY].debugMode === true;
      }
      sliderEl.value = maxHeight;
      sliderValueEl.textContent = formatPixels(maxHeight);
      scaleSliderEl.value = scale;
      scaleValueEl.textContent = scale + 'x';
      enableClaudeAiEl.checked = enableClaudeAi;
      enableClaudeCodeEl.checked = enableClaudeCode;
      debugModeEl.checked = debugMode;
      updateToggleButton();
      updateDebugTools();
    } catch (e) {}
  }

  async function saveSettings() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: { maxHeight, scale, isCollapsed, enableClaudeAi, enableClaudeCode, debugMode }
      });
    } catch (e) {}
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
    if (isCollapsed) {
      toggleBtn.classList.add('active');
      toggleIcon.textContent = '👁';
      toggleText.textContent = 'Show All';
    } else {
      toggleBtn.classList.remove('active');
      toggleIcon.textContent = '▼';
      toggleText.textContent = 'Collapse';
    }
  }

  function updateStatus(response) {
    if (response && response.success) {
      // Check if disabled for current interface
      if (response.disabled) {
        statusEl.textContent = 'Disabled for this interface';
        statusEl.classList.remove('not-claude');
        return;
      }

      const { totalHeight, hiddenHeight, visibleHeight } = response;
      // Also support old format
      const total = totalHeight || response.total || 0;
      const visible = visibleHeight || response.visible || total;
      const hidden = hiddenHeight || response.hidden || 0;

      if (hidden > 0) {
        statusEl.textContent = `${formatPixels(visible)}px / ${formatPixels(total)}px visible`;
      } else if (isCollapsed) {
        statusEl.textContent = `${formatPixels(total)}px (all visible)`;
      } else {
        statusEl.textContent = `${formatPixels(total)}px total`;
      }
      statusEl.classList.remove('not-claude');
    } else {
      statusEl.textContent = response?.error || 'No content found';
    }
  }

  async function applyCollapse() {
    // Apply scale factor to maxHeight
    const effectiveHeight = Math.round(maxHeight * scale);
    const response = await sendMessage('collapse', {
      maxHeight: effectiveHeight,
      isCollapsed,
      enableClaudeAi,
      enableClaudeCode
    });
    updateStatus(response);
  }

  // ============ Initialize ============
  async function init() {
    await loadTheme();
    await checkAndShowTip();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    if (!tab.url?.includes('claude.ai')) {
      statusEl.textContent = 'Open claude.ai to use';
      statusEl.classList.add('not-claude');
      sliderEl.disabled = true;
      scaleSliderEl.disabled = true;
      toggleBtn.disabled = true;
      refreshBtn.disabled = true;
      return;
    }

    await loadSettings();
    await applyCollapse();
  }

  // ============ Event listeners ============

  // Theme
  themeLightBtn.addEventListener('click', () => saveTheme('light'));
  themeDarkBtn.addEventListener('click', () => saveTheme('dark'));
  themeAutoBtn.addEventListener('click', () => saveTheme('auto'));

  // Height slider
  sliderEl.addEventListener('input', (e) => {
    maxHeight = parseInt(e.target.value);
    sliderValueEl.textContent = formatPixels(maxHeight);
  });

  sliderEl.addEventListener('change', async () => {
    await saveSettings();
    await applyCollapse();
  });

  // Scale slider
  scaleSliderEl.addEventListener('input', (e) => {
    scale = parseFloat(e.target.value);
    scaleValueEl.textContent = scale + 'x';
  });

  scaleSliderEl.addEventListener('change', async () => {
    await saveSettings();
    await applyCollapse();
  });

  // Toggle button
  toggleBtn.addEventListener('click', async () => {
    isCollapsed = !isCollapsed;
    updateToggleButton();
    await saveSettings();
    await applyCollapse();
  });

  // Refresh button
  refreshBtn.addEventListener('click', async () => {
    await applyCollapse();
  });

  // Debug button
  debugBtn.addEventListener('click', async () => {
    const response = await sendMessage('debug');
    if (response?.success) {
      statusEl.textContent = `Found ${response.found} blocks, ${formatPixels(response.scrollHeight)}px`;
    }
  });

  // Interface toggle checkboxes
  enableClaudeAiEl.addEventListener('change', async () => {
    enableClaudeAi = enableClaudeAiEl.checked;
    await saveSettings();
    await applyCollapse();
  });

  enableClaudeCodeEl.addEventListener('change', async () => {
    enableClaudeCode = enableClaudeCodeEl.checked;
    await saveSettings();
    await applyCollapse();
  });

  // Debug mode checkbox
  debugModeEl.addEventListener('change', async () => {
    debugMode = debugModeEl.checked;
    updateDebugTools();
    await saveSettings();
    await sendMessage('setDebugMode', { enabled: debugMode });
  });

  // Tip dismiss
  tipDismissEl.addEventListener('click', dismissTip);

  // Debug tools
  exportMetricsBtn.addEventListener('click', exportMetrics);
  measureFpsBtn.addEventListener('click', measureFPS);

  init();
})();
