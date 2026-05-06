/**
 * MailTrack — Background Service Worker (MV3)
 * Handles: SSE real-time connection, browser notifications, API relay
 */
const API_BASE = 'https://mailtrack-lmba.onrender.com';

let authToken = null;
let reconnectTimer = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['authToken'], (d) => {
    authToken = d.authToken || null;
    if (authToken) connectSSE();
  });
});

// EventSource doesn't support custom headers in MV3, so we use fetch + ReadableStream
function connectSSE() {
  if (!authToken) return;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  fetch(`${API_BASE}/notifications/stream`, {
    headers: { Authorization: `Bearer ${authToken}` },
  }).then(async (res) => {
    if (!res.ok) { scheduleReconnect(); return; }
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) { scheduleReconnect(); break; }
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try { onEvent(JSON.parse(line.slice(6))); } catch {}
        }
      }
    }
  }).catch(() => scheduleReconnect());
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connectSSE(); }, 5000);
}

function onEvent(event) {
  const isOpen = event.type === 'email.opened';
  // Browser notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: '../../icons/icon48.png',
    title:   isOpen ? '📧 Email Opened' : '🔗 Link Clicked',
    message: isOpen
      ? `Opened${event.country ? ' in ' + event.country : ''} · ${event.device_type || 'unknown'}`
      : `Link clicked${event.country ? ' from ' + event.country : ''}`,
    priority: 1,
  });
  // Forward to Gmail tabs
  chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) =>
    tabs.forEach((t) =>
      chrome.tabs.sendMessage(t.id, { type: 'TRACKING_EVENT', event }).catch(() => {})));
}

// Message relay from popup / content script
chrome.runtime.onMessage.addListener((msg, _, reply) => {
  if (msg.type === 'SET_AUTH_TOKEN' || msg.type === 'SET_TOKEN') {
    authToken = msg.token;
    chrome.storage.local.set({ authToken: msg.token });
    connectSSE();
    reply({ success: true });
  } else if (msg.type === 'GET_AUTH_TOKEN') {
    reply({ token: authToken });
  } else if (msg.type === 'LOGOUT') {
    authToken = null;
    chrome.storage.local.remove('authToken');
    reply({ success: true });
  } else if (msg.type === 'GET_SETTINGS') {
    if (!authToken) { reply({ tracking_enabled: false }); return; }
    fetch(`${API_BASE}/user/settings`,
      { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json()).then(reply).catch(() => reply({ tracking_enabled: false }));
    return true; // async
  } else if (msg.type === 'CREATE_TRACKED_EMAIL') {
    if (!authToken) { reply(null); return; }
    fetch(`${API_BASE}/email/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(msg.data)
    })
    .then(r => r.json())
    .then(reply)
    .catch(() => reply(null));
    return true; // async
  }
});
