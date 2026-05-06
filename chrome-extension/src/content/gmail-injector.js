/**
 * Gmail Content Script
 * Injects "Track" toggle button into Gmail compose window.
 * Uses MutationObserver — no fragile polling.
 */
(function () {
  'use strict';
  const MT = 'mt-btn';
  const state = new WeakMap();

  const observer = new MutationObserver(() => {
    // Detect Gmail compose send buttons
    document.querySelectorAll('div.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3').forEach(inject);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  function inject(sendBtn) {
    const compose = sendBtn.closest('.AD');
    if (!compose || compose.querySelector(`.${MT}`)) return;
    state.set(compose, { on: false });

    const btn = document.createElement('div');
    btn.className = MT;
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('title', 'Toggle email tracking (MailTrack)');
    btn.dataset.tracking = 'off';
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
      <span class="mt-lbl">Track</span>`;

    btn.addEventListener('click', () => {
      const s = state.get(compose);
      s.on = !s.on;
      btn.dataset.tracking = s.on ? 'on' : 'off';
      btn.setAttribute('aria-pressed', String(s.on));
      btn.querySelector('.mt-lbl').textContent = s.on ? 'Tracking ON' : 'Track';
    });

    sendBtn.parentElement?.insertBefore(btn, sendBtn);
  }

  // Live notification banner from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TRACKING_EVENT') showBanner(msg.event);
  });

  function showBanner(event) {
    document.getElementById('mt-banner')?.remove();
    const b = document.createElement('div');
    b.id = 'mt-banner';
    b.setAttribute('role', 'status');
    b.setAttribute('aria-live', 'polite');
    const isOpen = event.type === 'email.opened';
    b.innerHTML = `
      <span>${isOpen ? '👁' : '🔗'}</span>
      <span>${isOpen ? 'Email opened' : 'Link clicked'}${event.country ? ' · ' + event.country : ''}</span>`;
    document.body.appendChild(b);
    setTimeout(() => b.classList.add('mt-out'), 4500);
    setTimeout(() => b.remove(), 5100);
  }
})();
