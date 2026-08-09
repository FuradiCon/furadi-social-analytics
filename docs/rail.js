/* Furadi · Social Analytics — shared account-rail rendering
   Used by both the main dashboard (docs/app.js, click = filter view) and the
   desktop widget (desktop/widget.js, click = open the account's real page).
   Kept as its own file so the two never visually drift apart. Loaded as a
   plain classic script (not a module) — everything here lives on `window`,
   same as the rest of this project's scripts. */

/* Instagram rows ship without an accent block (YouTube ones carry theirs from
   the pipeline), so give the account its own mark colour here. */
const IG_ACCENT = { accent: '#FF2D95', accentStrong: '#FFA6D3', accentSoft: '#4A0E2C' };

function fmtInt(n){ return Number(n || 0).toLocaleString('en-US'); }
// Escapes &, <, > via textContent, then quotes — output is also used in attribute position.
function escapeHtml(s){ const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function isIG(ch){ return ch.platform === 'instagram'; }
function isTraffic(ch){ return ch.kind === 'traffic'; }
function accentOf(ch){ return ch.accent || IG_ACCENT; }

function platformLabel(ch){
  const parts = [ch && ch.platform, ch && ch.accountType]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  return escapeHtml(parts.length ? parts.join(' · ').toUpperCase() : 'ACCOUNT');
}

function accentVarsStyle(a){
  return `--accent:${a.accent};--accent-strong:${a.accentStrong};--accent-soft:${a.accentSoft};`;
}

function sparklinePath(rows, key, w, h){
  if(!rows || rows.length < 2) return null;
  const vals = rows.map(r => r[key]);
  const max = Math.max(...vals) || 1;
  const pts = vals.map((v,i) => [ (i/(vals.length - 1)) * w, h - (v/max) * (h - 2) - 1 ]);
  const line = pts.map((p,i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  return { line, area: `${line} L${w},${h} L0,${h} Z` };
}

const MAIL_ICON_PATH = '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>';

function railItemHtml(ch, idx){
  const a = accentOf(ch);
  const rows = ch.data || [];
  let metric, spark = '';
  if(isIG(ch)){
    metric = fmtInt(ch.followers) + ' followers';
  }else{
    const views = rows.reduce((s,r) => s + r.views, 0);
    metric = fmtInt(views) + ' views · 28d';
    const p = sparklinePath(rows, 'views', 100, 24);
    // A dim base line always shows the real trend shape; a bright highlight
    // band travels along that exact same path (masked to it) so the "wave"
    // reads as light moving along the line, not a dashed/hashed stroke.
    if(p) spark = `
      <svg class="rail-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="spark-glow-${idx}" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${a.accent}" stop-opacity="0"/>
            <stop offset="35%" stop-color="${a.accentStrong}" stop-opacity="1"/>
            <stop offset="65%" stop-color="${a.accentStrong}" stop-opacity="1"/>
            <stop offset="100%" stop-color="${a.accent}" stop-opacity="0"/>
          </linearGradient>
          <mask id="spark-mask-${idx}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="24">
            <path d="${p.line}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
          </mask>
        </defs>
        <path d="${p.area}" fill="${a.accent}" opacity="0.16"/>
        <path d="${p.line}" fill="none" stroke="${a.accent}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" opacity="0.4"/>
        <g mask="url(#spark-mask-${idx})">
          <rect class="rail-spark-glow" x="-60" y="0" width="60" height="24" fill="url(#spark-glow-${idx})"/>
        </g>
      </svg>`;
  }
  // Instagram and traffic-only channels don't carry a hasNewComments flag --
  // only show the reply-status indicator for the YouTube channels.
  const hasNew = !!ch.hasNewComments;
  const alertHtml = (isIG(ch) || isTraffic(ch)) ? '' : `
    <span class="rail-alert${hasNew ? ' flag' : ''}" aria-hidden="true" title="${hasNew ? 'A comment is awaiting a reply' : 'Comments'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${MAIL_ICON_PATH}</svg>
    </span>`;
  return `
    <button class="channel-tab-btn" type="button" role="tab" data-idx="${idx}" aria-selected="false" style="${accentVarsStyle(a)}">
      <span class="rail-row">
        <span class="channel-dot" aria-hidden="true"></span>
        <span class="rail-name">${escapeHtml(ch.name)}</span>
        ${alertHtml}
      </span>
      <span class="account-platform-label">${platformLabel(ch)}</span>
      <span class="rail-metric">${metric}</span>
      ${spark}
    </button>`;
}
