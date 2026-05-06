/**
 * Dashboard Sync Content Script
 * Runs on the Render dashboard to sync the login token with the extension.
 */
(function() {
  const syncToken = () => {
    const token = localStorage.getItem('mt_token');
    if (token) {
      chrome.runtime.sendMessage({ type: 'SET_TOKEN', token });
    }
  };

  // Sync on load
  syncToken();

  // Watch for changes (e.g. if user logs in without reload)
  window.addEventListener('storage', (e) => {
    if (e.key === 'mt_token') syncToken();
  });
})();
