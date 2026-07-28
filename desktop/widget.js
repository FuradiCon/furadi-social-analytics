/* Furadi account rail widget — renders the same rail as the main dashboard
   (via the shared docs/rail.js), minus the "All accounts" entry, and opens
   each account's real profile page externally instead of filtering a view. */

const DASHBOARD_URL = 'https://furadicon.github.io/furadi-social-analytics/';

function initDashboardLink() {
  document.getElementById('dashboardLink').addEventListener('click', () => {
    window.electronAPI.openExternal(DASHBOARD_URL);
  });
}

async function initPinToggle() {
  const btn = document.getElementById('pinToggle');
  const setPressed = (on) => btn.setAttribute('aria-pressed', String(on));

  setPressed(await window.electronAPI.getAlwaysOnTop());
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-pressed') !== 'true';
    setPressed(next);
    window.electronAPI.setAlwaysOnTop(next);
  });
}

async function initOpacitySlider() {
  const slider = document.getElementById('opacitySlider');
  const panel = document.querySelector('.rail-inner');
  const apply = (pct) => panel.style.setProperty('--panel-bg-alpha', pct / 100);

  const saved = await window.electronAPI.getPanelOpacity();
  const pct = Math.round(saved * 100);
  slider.value = pct;
  apply(pct);

  slider.addEventListener('input', () => {
    apply(slider.value);
    window.electronAPI.setPanelOpacity(Number(slider.value) / 100);
  });
}

// Same cadence as the dashboard's own reload (see app.js) — re-fetches and
// re-renders the rail in place so new comment flags, view counts, etc. show
// up without the widget needing to be relaunched.
const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

// generatedAt arrives pre-formatted as "YYYY-MM-DD HH:MM UTC" from the
// Python pipeline. Re-parse and render it in Mountain time for this footer
// only -- the dashboard itself keeps showing the raw UTC string.
function formatMountainTime(generatedAt) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) UTC$/.exec(generatedAt || '');
  if (!m) return generatedAt || '—';
  const date = new Date(`${m[1]}T${m[2]}:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

async function loadChannels() {
  const tabsEl = document.getElementById('channelTabs');
  let payload;
  try {
    const res = await fetch('/docs/data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    payload = await res.json();
  } catch (err) {
    tabsEl.innerHTML = `<p class="rail-metric">Could not load data.json (${err.message}). Run the pipeline, then reopen.</p>`;
    return;
  }

  const channels = payload.channels || [];
  document.getElementById('generatedAt').textContent = formatMountainTime(payload.generatedAt);

  tabsEl.innerHTML = channels.map(railItemHtml).join('');
  tabsEl.querySelectorAll('.channel-tab-btn').forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      const url = channels[idx] && channels[idx].url;
      if (url) window.electronAPI.openExternal(url);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboardLink();
  initPinToggle();
  initOpacitySlider();
  loadChannels();
  setInterval(loadChannels, REFRESH_INTERVAL_MS);
});
