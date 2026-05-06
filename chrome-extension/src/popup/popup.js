const API    = 'https://mailtrack-lmba.onrender.com';
let token    = null;
const events = [];

chrome.storage.local.get(['authToken'], (d) => {
  token = d.authToken || null;
  if (token) { showLoggedIn(); loadSettings(); loadStats(); }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TRACKING_EVENT') { events.unshift(msg.event); renderFeed(); }
});

function showLoggedIn() {
  document.getElementById('logged-out').style.display = 'none';
  document.getElementById('logged-in').style.display  = 'block';
  document.getElementById('dot').classList.remove('off');
}

async function loadSettings() {
  const s = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (s) {
    document.getElementById('t-global').checked = s.tracking_enabled ?? false;
    document.getElementById('t-anon').checked   = s.ip_anonymization ?? true;
  }
}

async function loadStats() {
  try {
    const r = await fetch(`${API}/email/list?limit=20`,
      { headers: { Authorization: `Bearer ${token}` } });
    const { emails } = await r.json();
    document.getElementById('v-opens').textContent  = emails.reduce((s,e)=>s+e.open_count, 0);
    document.getElementById('v-clicks').textContent = emails.reduce((s,e)=>s+e.click_count,0);
  } catch {}
}

function renderFeed() {
  const feed = document.getElementById('feed');
  if (!events.length) { feed.innerHTML = '<div class="empty">No events yet</div>'; return; }
  feed.innerHTML = events.slice(0, 15).map((e) => {
    const isOpen = e.type === 'email.opened';
    return `<div class="item">
      <span style="font-size:14px">${isOpen ? '👁' : '🔗'}</span>
      <div>
        <div>${isOpen ? 'Email opened' : 'Link clicked'}${e.country ? ' · ' + e.country : ''}</div>
        <div class="time">${ago(new Date(e.occurred_at))}</div>
      </div>
    </div>`;
  }).join('');
}

function ago(d) {
  const s = Math.floor((Date.now()-d)/1000);
  if (s < 5)   return 'just now';
  if (s < 60)  return `${s}s ago`;
  if (s < 3600)return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
}

document.getElementById('t-global')?.addEventListener('change', (e) =>
  fetch(`${API}/user/settings`, { method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({tracking_enabled:e.target.checked})}));

document.getElementById('t-anon')?.addEventListener('change', (e) =>
  fetch(`${API}/user/settings`, { method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({ip_anonymization:e.target.checked})}));

document.getElementById('btn-logout')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type:'LOGOUT' });
  location.reload();
});
