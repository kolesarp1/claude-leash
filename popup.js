// Popup script - communicates with content script
(function() {
  'use strict';

  const STORAGE_KEY = 'claudeCollapseSettings';
  const THEME_KEY = 'claudeLeashTheme';
  
  let currentTab = null;
  let isCollapsed = false;
  let keepVisible = 8;
  let currentTheme = 'light';

  // Elements
  const statusEl = document.getElementById('status');
  const sliderEl = document.getElementById('slider');
  const sliderValueEl = document.getElementById('sliderValue');
  const toggleBtn = document.getElementById('toggleBtn');
  const toggleIcon = document.getElementById('toggleIcon');
  const toggleText = document.getElementById('toggleText');
  const refreshBtn = document.getElementById('refreshBtn');
  const themeLightBtn = document.getElementById('themeLightBtn');
  const themeDarkBtn = document.getElementById('themeDarkBtn');
  const themeAutoBtn = document.getElementById('themeAutoBtn');

  // ============ Theme handling ============
  function applyTheme(theme) {
    const body = document.body;
    body.classList.remove('light', 'dark');
    
    // Update button states
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
      const theme = result[THEME_KEY] || 'light'; // Default to light
      applyTheme(theme);
    } catch (e) {
      applyTheme('light');
    }
  }

  async function saveTheme(theme) {
    try {
      await chrome.storage.local.set({ [THEME_KEY]: theme });
      applyTheme(theme);
    } catch (e) {
      console.error('Failed to save theme:', e);
    }
  }

  // Listen for system theme changes when in auto mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme === 'auto') {
      applyTheme('auto');
    }
  });

  // ============ Settings handling ============
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        keepVisible = result[STORAGE_KEY].keepVisible || 8;
        isCollapsed = result[STORAGE_KEY].isCollapsed || false;
      }
      sliderEl.value = keepVisible;
      sliderValueEl.textContent = keepVisible;
      updateToggleButton();
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  async function saveSettings() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: { keepVisible, isCollapsed }
      });
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  // ============ Content script communication ============
  async function sendMessage(action, data = {}) {
    if (!currentTab?.id) return null;
    
    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, {
        action,
        ...data
      });
      return response;
    } catch (e) {
      console.error('Failed to send message:', e);
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
        statusEl.textContent = `${hidden} of ${total} messages hidden`;
      } else if (isCollapsed) {
        statusEl.textContent = `${total} messages (all visible)`;
      } else {
        statusEl.textContent = `${total} messages`;
      }
      statusEl.classList.remove('not-claude');
    } else {
      statusEl.textContent = response?.error || 'No messages found';
    }
  }

  async function applyCollapse() {
    const response = await sendMessage('collapse', {
      keepVisible,
      isCollapsed
    });
    updateStatus(response);
  }

  // ============ Initialize ============
  async function init() {
    // Load theme first (before anything else)
    await loadTheme();
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    // Check if we're on Claude.ai
    if (!tab.url?.includes('claude.ai')) {
      statusEl.textContent = 'Open claude.ai to use this extension';
      statusEl.classList.add('not-claude');
      sliderEl.disabled = true;
      toggleBtn.disabled = true;
      refreshBtn.disabled = true;
      return;
    }

    // Load settings and apply
    await loadSettings();
    await applyCollapse();
  }

  // ============ Event listeners ============
  
  // Theme buttons
  themeLightBtn.addEventListener('click', () => saveTheme('light'));
  themeDarkBtn.addEventListener('click', () => saveTheme('dark'));
  themeAutoBtn.addEventListener('click', () => saveTheme('auto'));
  
  // Slider
  sliderEl.addEventListener('input', (e) => {
    keepVisible = parseInt(e.target.value);
    sliderValueEl.textContent = keepVisible;
  });

  sliderEl.addEventListener('change', async () => {
    await saveSettings();
    await applyCollapse();
  });

  // Buttons
  toggleBtn.addEventListener('click', async () => {
    isCollapsed = !isCollapsed;
    updateToggleButton();
    await saveSettings();
    await applyCollapse();
  });

  refreshBtn.addEventListener('click', async () => {
    await applyCollapse();
  });

  // Debug button - highlights found messages
  const debugBtn = document.getElementById('debugBtn');
  debugBtn.addEventListener('click', async () => {
    const response = await sendMessage('debug');
    if (response?.success) {
      statusEl.textContent = `Debug: found ${response.found} elements`;
    }
  });

  // Scan button - scans DOM structure
  const scanBtn = document.getElementById('scanBtn');
  scanBtn.addEventListener('click', async () => {
    const response = await sendMessage('scan');
    if (response?.success) {
      statusEl.textContent = 'Scan complete - check console';
    }
  });

  // Start
  init();

})();
