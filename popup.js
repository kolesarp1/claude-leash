// Claude Leash - Popup Script (Simplified)
(function() {
  'use strict';

  const STORAGE_KEY = 'claudeCollapseSettings';
  const THEME_KEY = 'claudeLeashTheme';

  let currentTab = null;
  let isCollapsed = false;
  let maxLines = 500;
  let currentTheme = 'light';

  // Elements
  const statusEl = document.getElementById('status');
  const sliderEl = document.getElementById('slider');
  const sliderValueEl = document.getElementById('sliderValue');
  const toggleBtn = document.getElementById('toggleBtn');
  const toggleIcon = document.getElementById('toggleIcon');
  const toggleText = document.getElementById('toggleText');
  const refreshBtn = document.getElementById('refreshBtn');
  const debugBtn = document.getElementById('debugBtn');
  const themeLightBtn = document.getElementById('themeLightBtn');
  const themeDarkBtn = document.getElementById('themeDarkBtn');
  const themeAutoBtn = document.getElementById('themeAutoBtn');

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

  // ============ Settings handling ============
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        maxLines = result[STORAGE_KEY].maxLines || 500;
        isCollapsed = result[STORAGE_KEY].isCollapsed || false;
      }
      sliderEl.value = maxLines;
      sliderValueEl.textContent = maxLines;
      updateToggleButton();
    } catch (e) {}
  }

  async function saveSettings() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: { maxLines, isCollapsed }
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
      const { total, hidden } = response;
      if (hidden > 0) {
        statusEl.textContent = `${hidden} of ${total} blocks hidden`;
      } else if (isCollapsed) {
        statusEl.textContent = `${total} blocks (all visible)`;
      } else {
        statusEl.textContent = `${total} blocks`;
      }
      statusEl.classList.remove('not-claude');
    } else {
      statusEl.textContent = response?.error || 'No content found';
    }
  }

  async function applyCollapse() {
    const response = await sendMessage('collapse', { maxLines, isCollapsed });
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
      sliderEl.disabled = true;
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

  // Slider
  sliderEl.addEventListener('input', (e) => {
    maxLines = parseInt(e.target.value);
    sliderValueEl.textContent = maxLines;
  });

  sliderEl.addEventListener('change', async () => {
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
      statusEl.textContent = `Found ${response.found} blocks`;
    }
  });

  init();
})();
