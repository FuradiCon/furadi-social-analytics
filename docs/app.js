/* Furadi · Social Analytics
   Data binding + hand-rolled inline-SVG charts.
   Adapted from the local YT Metrics dashboard; reads docs/data.json at runtime. */

let CHANNELS = [];
let activeIdx = 'all';

/* Instagram rows ship without an accent block (YouTube ones carry theirs from
   the pipeline), so give the account its own mark colour here. */
const IG_ACCENT = { accent: '#FF2D95', accentStrong: '#FFA6D3', accentSoft: '#4A0E2C' };

/* ---------- formatting ---------- */
function fmtInt(n){ return Number(n || 0).toLocaleString('en-US'); }
function fmtDay(d){ const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US', { month:'short', day:'numeric' }); }
function fmtDur(s){ const m = Math.floor(s/60), sec = Math.round(s%60); return m + ':' + String(sec).padStart(2,'0'); }
// Escapes &, <, > via textContent, then quotes — output is also used in attribute position.
function escapeHtml(s){ const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function timeAgo(iso){
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime())/1000);
  if(diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec/60);
  if(diffMin < 60) return diffMin + 'm ago';
  const diffHr = Math.floor(diffMin/60);
  if(diffHr < 24) return diffHr + 'h ago';
  const diffDay = Math.floor(diffHr/24);
  if(diffDay < 30) return diffDay + 'd ago';
  return fmtDay(iso.slice(0,10));
}
function plural(n, word){ return fmtInt(n) + ' ' + word + (Math.abs(n) === 1 ? '' : 's'); }
function isIG(ch){ return ch.platform === 'instagram'; }
function isTraffic(ch){ return ch.kind === 'traffic'; }
function accentOf(ch){ return ch.accent || IG_ACCENT; }

/* Rounds an axis maximum up so that `ticks` evenly spaced gridlines all land on
   whole numbers — every metric here is a count, so "0 · 2 · 3 · 5" style axes
   (what plain max * padding produces) would misread as unevenly spaced. */
const NICE_STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceCeil(value, ticks){
  if(!(value > 0)) return ticks;
  const rough = value / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = mag * (NICE_STEPS.find(s => s * mag >= rough) || 10);
  return Math.max(1, Math.ceil(step)) * ticks;
}

/* ---------- KPIs ---------- */
function pctDeltaHtml(current, prior){
  if(prior === null || prior === undefined) return '';
  if(prior === 0){
    if(current === 0) return `<div class="kpi-delta flat">flat vs. prior period</div>`;
    return `<div class="kpi-delta up">new vs. prior period</div>`;
  }
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  const dir = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  return `<div class="kpi-delta ${dir}">${Math.abs(pct).toFixed(0)}% vs. prior period</div>`;
}
function absDeltaHtml(current, prior){
  if(prior === null || prior === undefined) return '';
  const diff = current - prior;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const label = dir === 'up' ? ('+' + diff) : dir === 'down' ? ('−' + Math.abs(diff)) : '0';
  return `<div class="kpi-delta ${dir}">${label} vs. prior period</div>`;
}

function kpiCardsHtml(items){
  return items.map((it, i) => `
    <div class="kpi${i === 0 ? ' kpi-hero' : ''}">
      <p class="kpi-label">${it.label}</p>
      <div class="kpi-value">${it.value}</div>
      <div class="kpi-sub">${it.sub}</div>
      ${it.delta || ''}
    </div>`).join('');
}

function kpiItemsHtml(ch, forViewAll){
  if(isTraffic(ch)){
    const rows = ch.data || [];
    if(!rows.length) return null;
    const totalViews = rows.reduce((s,r) => s + r.views, 0);
    const totalUniques = rows.reduce((s,r) => s + (r.uniques || 0), 0);
    const avgViews = totalViews / rows.length;
    const best = rows.reduce((a,b) => b.views > a.views ? b : a, rows[0]);
    const prior = ch.prior;
    return kpiCardsHtml([
      { label:'Page views',      value: fmtInt(totalViews),           sub:'across ' + rows.length + ' days', delta: pctDeltaHtml(totalViews, prior && prior.views) },
      { label:'Unique visitors', value: fmtInt(totalUniques),         sub:'across ' + rows.length + ' days', delta: pctDeltaHtml(totalUniques, prior && prior.uniques) },
      { label:'Daily average',   value: fmtInt(Math.round(avgViews)), sub:'views per day' },
      { label:'Best day',        value: fmtInt(best.views),           sub: fmtDay(best.d) }
    ]);
  }

  if(isIG(ch)){
    const t = ch.totals || { posts:0, likes:0, comments:0 };
    const p = ch.priorTotals;
    return kpiCardsHtml([
      { label:'Followers',  value: fmtInt(ch.followers), sub: fmtInt(ch.mediaCount) + ' posts all-time' },
      { label:'Posts',      value: fmtInt(t.posts),      sub:'this period', delta: absDeltaHtml(t.posts, p && p.posts) },
      { label:'Likes',      value: fmtInt(t.likes),      sub:'across ' + plural(t.posts, 'post'), delta: pctDeltaHtml(t.likes, p && p.likes) },
      { label:'Comments',   value: fmtInt(t.comments),   sub:'across ' + plural(t.posts, 'post'), delta: pctDeltaHtml(t.comments, p && p.comments) }
    ]);
  }

  const rows = ch.data || [];
  if(!rows.length) return null;
  const totalViews = rows.reduce((s,r) => s + r.views, 0);
  const totalMin   = rows.reduce((s,r) => s + r.min, 0);
  const totalG     = rows.reduce((s,r) => s + r.subG, 0);
  const totalL     = rows.reduce((s,r) => s + r.subL, 0);
  const totalSec   = rows.reduce((s,r) => s + r.avgDur * r.views, 0);
  const avgDur = totalViews ? totalSec / totalViews : 0;
  const hrs = Math.floor(totalMin/60), mins = Math.round(totalMin % 60);
  const net = totalG - totalL;
  const prior = ch.prior;

  const items = [
    { label:'Subscribers',        value: ch.subscriberCountHidden ? 'Hidden' : fmtInt(ch.subscriberCount), sub:'all-time' },
    { label:'Views',              value: fmtInt(totalViews), sub:'across ' + rows.length + ' days', delta: pctDeltaHtml(totalViews, prior && prior.views) },
    { label:'Watch time',         value: hrs + 'h ' + mins + 'm', sub: fmtInt(totalMin) + ' minutes', delta: pctDeltaHtml(totalMin, prior && prior.min) },
    { label:'Net subscribers',    value: (net >= 0 ? '+' : '') + net, sub: totalG + ' gained · ' + totalL + ' lost', delta: absDeltaHtml(net, prior && prior.netSub) },
    { label:'Avg. view duration', value: fmtDur(avgDur), sub:'per view', delta: pctDeltaHtml(avgDur, prior && prior.avgDur) }
  ];
  return kpiCardsHtml(forViewAll ? items.filter(it => it.label !== 'Avg. view duration') : items);
}

function renderKPIs(ch){
  const grid = document.getElementById('kpiGrid');
  grid.innerHTML = kpiItemsHtml(ch) || '<p class="empty-note">No data for this account yet.</p>';
  animateKpiValues(grid);
}

/* Counts every number inside a .kpi-value up from zero while preserving the
   surrounding characters (commas, "h"/"m", signs) exactly as formatted. */
function animateKpiValues(root){
  // requestAnimationFrame never fires on a hidden document (backgrounded tab,
  // headless/screenshot tooling that never grants visibility) — without this
  // guard the count-up gets stuck at its first frame (all zeros) forever.
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return;
  const duration = 750;
  root.querySelectorAll('.kpi-value').forEach(el => {
    const finalText = el.textContent;
    const matches = [...finalText.matchAll(/-?\d[\d,]*/g)];
    if(!matches.length) return;                      // e.g. "Hidden"
    const parts = [];
    let lastIndex = 0;
    matches.forEach(m => {
      if(m.index > lastIndex) parts.push({ literal: finalText.slice(lastIndex, m.index) });
      const raw = m[0];
      parts.push({ target: parseInt(raw.replace(/,/g,''), 10), hasComma: raw.includes(',') });
      lastIndex = m.index + raw.length;
    });
    if(lastIndex < finalText.length) parts.push({ literal: finalText.slice(lastIndex) });

    const start = performance.now();
    (function frame(now){
      const t = Math.min(1, (now - start)/duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = parts.map(p => p.literal !== undefined
        ? p.literal
        : (p.hasComma ? Math.round(p.target * eased).toLocaleString('en-US') : String(Math.round(p.target * eased)))
      ).join('');
      if(t < 1) requestAnimationFrame(frame);
      else el.textContent = finalText;
    })(start);
  });
}

/* ---------- Top videos / latest posts ---------- */
function videosBlock(ch){
  if(!ch.topVideos || !ch.topVideos.length) return null;
  const ig = isIG(ch);
  const label = ig
    ? 'Latest posts <span class="hint">most recent 10</span>'
    : 'Top videos <span class="hint">this period</span>';
  const html = ch.topVideos.map((v, i) => `
    <a class="video-card" href="${escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer">
      <div class="video-thumb">
        <span class="video-rank">${String(i + 1).padStart(2,'0')}</span>
        <img src="${escapeHtml(v.thumb)}" alt="" loading="lazy" />
      </div>
      <div class="video-body">
        <p class="video-title">${escapeHtml(v.title) || '<span class="untitled">Untitled</span>'}</p>
        <div class="video-views">${ig
          ? (fmtDay(v.date) + ' · ' + plural(v.likes, 'like') + ' · ' + plural(v.comments, 'comment'))
          : plural(v.views, 'view')}</div>
      </div>
    </a>`).join('');
  return { label, html };
}

function renderTopVideos(ch){
  const section = document.getElementById('topVideosSection');
  const grid = document.getElementById('videoGrid');
  const block = videosBlock(ch);
  if(!block){ section.hidden = true; grid.innerHTML = ''; return; }
  section.querySelector('.section-label').innerHTML = block.label;
  grid.innerHTML = block.html;
  section.hidden = false;
}

/* ---------- Recent comments ---------- */
function commentsHtml(ch){
  if(!ch.comments || !ch.comments.length) return null;
  return ch.comments.map(c => `
    <article class="comment-item${c.awaitingReply ? ' awaiting' : ''}">
      ${c.avatar
        ? `<img class="comment-avatar" src="${escapeHtml(c.avatar)}" alt="" loading="lazy" />`
        : `<div class="comment-avatar comment-avatar-fallback">${escapeHtml((c.author || '?').charAt(0).toUpperCase())}</div>`}
      <div class="comment-body">
        <div class="comment-meta">
          <span class="comment-author">${escapeHtml(c.author)}</span>
          <span class="comment-time">${timeAgo(c.publishedAt)}</span>
          ${c.awaitingReply ? '<span class="comment-flag">Needs a reply</span>' : ''}
        </div>
        <p class="comment-text">${escapeHtml(c.text)}</p>
        <div class="comment-footer">
          <span>${fmtInt(c.likes)} likes</span>
          ${c.videoUrl ? `<a href="${escapeHtml(c.videoUrl)}" target="_blank" rel="noopener noreferrer">Open video</a>` : ''}
        </div>
      </div>
    </article>`).join('');
}

function renderComments(ch){
  const section = document.getElementById('commentsSection');
  const list = document.getElementById('commentList');
  const html = commentsHtml(ch);
  if(!html){ section.hidden = true; list.innerHTML = ''; return; }
  list.innerHTML = html;
  section.hidden = false;
}

/* ---------- Line / area chart ---------- */
function renderAreaChart(containerId, rows, key, opts = {}){
  const el = document.getElementById(containerId);
  if(!el) return;
  if(!rows.length){ el.innerHTML = '<p class="empty-note">No data for this period.</p>'; return; }
  const W = 760, H = opts.height || 200, padL = 46, padR = 10, padT = 22, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const vals = rows.map(r => r[key]);
  const ticks = 3;
  const maxV = niceCeil(Math.max(...vals) * 1.05, ticks);
  const x = i => padL + (rows.length > 1 ? (i/(rows.length - 1)) * innerW : innerW/2);
  const y = v => padT + innerH - (v/maxV) * innerH;
  const color = opts.color || 'var(--accent)';
  const gid = 'grad-' + containerId;

  const line = rows.map((r,i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(r[key]).toFixed(1)).join(' ');
  const area = line + ` L${x(rows.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  let grid = '';
  for(let t = 0; t <= ticks; t++){
    const v = maxV * t / ticks;
    const gy = y(v);
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="var(--${t === 0 ? 'border-strong' : 'border'})" stroke-width="1" />`;
    grid += `<text x="${padL - 10}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end" class="axis-text">${fmtInt(Math.round(v))}</text>`;
  }

  let xlabels = '';
  rows.forEach((r,i) => {
    if(i % 4 === 0 || i === rows.length - 1){
      xlabels += `<text x="${x(i).toFixed(1)}" y="${H - 7}" text-anchor="middle" class="axis-text">${fmtDay(r.d)}</text>`;
    }
  });

  const peakIdx = vals.indexOf(Math.max(...vals));
  const peakEl = opts.markPeak ? `
    <line x1="${x(peakIdx).toFixed(1)}" x2="${x(peakIdx).toFixed(1)}" y1="${y(vals[peakIdx]).toFixed(1)}" y2="${(padT + innerH).toFixed(1)}" stroke="${color}" stroke-width="1" stroke-dasharray="2,3" opacity="0.5"/>
    <circle cx="${x(peakIdx).toFixed(1)}" cy="${y(vals[peakIdx]).toFixed(1)}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2"/>
    <text x="${x(peakIdx).toFixed(1)}" y="${(y(vals[peakIdx]) - 11).toFixed(1)}" text-anchor="middle" class="peak-text">${fmtDay(rows[peakIdx].d)} · ${fmtInt(vals[peakIdx])}</text>
  ` : '';

  el.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(opts.unit || key)} over time">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.30"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0.015"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#${gid})" stroke="none"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${peakEl}
    ${xlabels}
    <line class="guide" x1="0" x2="0" y1="${padT}" y2="${padT + innerH}" stroke="var(--text-secondary)" stroke-width="1" stroke-dasharray="2,3" opacity="0"/>
    <circle class="dot" r="4.5" fill="${color}" stroke="var(--surface)" stroke-width="2" opacity="0"/>
    <rect class="hover-target" x="${padL}" y="${padT}" width="${innerW}" height="${innerH}" fill="transparent"/>
  </svg>
  <div class="tooltip" role="status"></div>`;

  const svgEl = el.querySelector('svg');
  const guide = el.querySelector('.guide');
  const dot = el.querySelector('.dot');
  const tip = el.querySelector('.tooltip');

  el.querySelector('.hover-target').addEventListener('mousemove', e => {
    const rect = svgEl.getBoundingClientRect();
    const px = (e.clientX - rect.left)/rect.width * W;
    let idx = rows.length > 1 ? Math.round((px - padL)/innerW * (rows.length - 1)) : 0;
    idx = Math.max(0, Math.min(rows.length - 1, idx));
    const cx = x(idx), cy = y(vals[idx]);
    guide.setAttribute('x1', cx); guide.setAttribute('x2', cx); guide.setAttribute('opacity','1');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('opacity','1');
    tip.classList.add('show');
    tip.style.left = (cx/W*100) + '%';
    tip.style.top  = (cy/H*100) + '%';
    tip.innerHTML = `${fmtDay(rows[idx].d)}<br><b>${fmtInt(vals[idx])}</b> ${escapeHtml(opts.unit || '')}`;
  });
  el.querySelector('.hover-target').addEventListener('mouseleave', () => {
    guide.setAttribute('opacity','0'); dot.setAttribute('opacity','0'); tip.classList.remove('show');
  });
}

/* ---------- Stacked bars (engagement) ---------- */
function renderStackedBars(containerId, rows){
  const el = document.getElementById(containerId);
  if(!el) return;
  if(!rows.length){ el.innerHTML = '<p class="empty-note">No data for this period.</p>'; return; }
  const W = 760, H = 210, padL = 42, padR = 10, padT = 16, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  /* YouTube reports likes net of removals, so a day can legitimately be
     negative. A stacked bar has no way to draw that, so the geometry uses a
     floored value while the tooltip and the table keep the true figure. */
  const KEYS = ['likes','comments','shares'];
  const floor0 = v => Math.max(0, v || 0);
  const totals = rows.map(r => KEYS.reduce((s,k) => s + floor0(r[k]), 0));
  const maxV = niceCeil(Math.max(...totals) * 1.05, 3);
  const bw = innerW/rows.length * 0.54;
  const colors = { likes:'var(--accent)', comments:'var(--grey-bar-strong)', shares:'var(--grey-bar)' };
  const y = v => padT + innerH - (v/maxV) * innerH;

  let grid = '';
  for(let t = 0; t <= 3; t++){
    const v = maxV * t / 3, gy = y(v);
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="var(--${t === 0 ? 'border-strong' : 'border'})" stroke-width="1"/>`;
    grid += `<text x="${padL - 10}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end" class="axis-text">${fmtInt(Math.round(v))}</text>`;
  }

  let bars = '', xlabels = '';
  rows.forEach((r,i) => {
    const cx = padL + (i + 0.5)/rows.length * innerW;
    let base = padT + innerH;
    KEYS.forEach(k => {
      const h = (floor0(r[k])/maxV) * innerH;
      if(h > 0){
        bars += `<rect class="bar" data-i="${i}" x="${(cx - bw/2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${colors[k]}"/>`;
        base -= h;
      }
    });
    if(i % 4 === 0 || i === rows.length - 1){
      xlabels += `<text x="${cx.toFixed(1)}" y="${H - 7}" text-anchor="middle" class="axis-text">${fmtDay(r.d)}</text>`;
    }
  });

  el.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Engagement per day">${grid}${bars}${xlabels}</svg>
  <div class="tooltip" role="status"></div>`;

  const tip = el.querySelector('.tooltip');
  el.querySelectorAll('.bar').forEach(bar => {
    bar.addEventListener('mousemove', () => {
      const r = rows[+bar.dataset.i];
      tip.classList.add('show');
      tip.style.left = ((parseFloat(bar.getAttribute('x')) + bw/2)/W*100) + '%';
      tip.style.top  = (parseFloat(bar.getAttribute('y'))/H*100) + '%';
      tip.innerHTML = `${fmtDay(r.d)}<br>likes <b>${r.likes}</b> · comments <b>${r.comments}</b> · shares <b>${r.shares}</b>`;
    });
    bar.addEventListener('mouseleave', () => tip.classList.remove('show'));
  });
}

/* ---------- Diverging bars (subscribers) ---------- */
function renderDivergingBars(containerId, rows){
  const el = document.getElementById(containerId);
  if(!el) return;
  if(!rows.length){ el.innerHTML = '<p class="empty-note">No data for this period.</p>'; return; }
  const W = 760, H = 210, padL = 42, padR = 10, padT = 16, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const floor0 = v => Math.max(0, v || 0);
  const maxV = niceCeil(Math.max(...rows.map(r => Math.max(floor0(r.subG), floor0(r.subL)))) * 1.15, 1);
  const mid = padT + innerH/2;
  const half = innerH/2;
  const bw = innerW/rows.length * 0.54;

  let bars = '', xlabels = '';
  rows.forEach((r,i) => {
    const cx = padL + (i + 0.5)/rows.length * innerW;
    const hG = (floor0(r.subG)/maxV) * half;
    const hL = (floor0(r.subL)/maxV) * half;
    bars += `<rect class="bar" data-i="${i}" x="${(cx - bw/2).toFixed(1)}" y="${(mid - hG).toFixed(1)}" width="${bw.toFixed(1)}" height="${hG.toFixed(1)}" fill="var(--accent)" rx="1.5"/>`;
    bars += `<rect class="bar" data-i="${i}" x="${(cx - bw/2).toFixed(1)}" y="${mid.toFixed(1)}" width="${bw.toFixed(1)}" height="${hL.toFixed(1)}" fill="var(--grey-bar-strong)" rx="1.5"/>`;
    if(i % 4 === 0 || i === rows.length - 1){
      xlabels += `<text x="${cx.toFixed(1)}" y="${H - 7}" text-anchor="middle" class="axis-text">${fmtDay(r.d)}</text>`;
    }
  });

  el.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Subscribers gained and lost per day">
    <line x1="${padL}" x2="${W - padR}" y1="${(mid - half).toFixed(1)}" y2="${(mid - half).toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
    <line x1="${padL}" x2="${W - padR}" y1="${(mid + half).toFixed(1)}" y2="${(mid + half).toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
    <line x1="${padL}" x2="${W - padR}" y1="${mid}" y2="${mid}" stroke="var(--border-strong)" stroke-width="1"/>
    <text x="${padL - 10}" y="${(mid - half + 3.5).toFixed(1)}" text-anchor="end" class="axis-text">+${fmtInt(Math.round(maxV))}</text>
    <text x="${padL - 10}" y="${(mid + 3.5).toFixed(1)}" text-anchor="end" class="axis-text">0</text>
    <text x="${padL - 10}" y="${(mid + half + 3.5).toFixed(1)}" text-anchor="end" class="axis-text">−${fmtInt(Math.round(maxV))}</text>
    ${bars}${xlabels}
  </svg>
  <div class="tooltip" role="status"></div>`;

  const tip = el.querySelector('.tooltip');
  el.querySelectorAll('.bar').forEach(bar => {
    bar.addEventListener('mousemove', () => {
      const r = rows[+bar.dataset.i];
      tip.classList.add('show');
      tip.style.left = ((parseFloat(bar.getAttribute('x')) + bw/2)/W*100) + '%';
      tip.style.top = '6%';
      tip.innerHTML = `${fmtDay(r.d)}<br>+${r.subG} gained · −${r.subL} lost`;
    });
    bar.addEventListener('mouseleave', () => tip.classList.remove('show'));
  });
}

function renderCharts(ch){
  const rows = ch.data || [];
  renderAreaChart('chart-views',   rows, 'views', { color:'var(--accent)', markPeak:true, unit:'views' });
  renderAreaChart('chart-minutes', rows, 'min',   { color:'var(--grey-bar-strong)', height:168, unit:'minutes watched' });
  renderStackedBars('chart-engagement', rows);
  renderDivergingBars('chart-subs', rows);
}

/* ---------- Tables ---------- */
function fillTable(id, rowsHtml){
  const body = document.querySelector('#' + id + ' tbody');
  if(body) body.innerHTML = rowsHtml;
}

function renderTables(ch){
  const rows = ch.data || [];
  const tableRows = ch.tableRows || [];
  document.getElementById('logRowCount').textContent = rows.length + ' rows';
  if(!rows.length){
    const empty = `<tr><td colspan="9" class="table-empty">No data for this period.</td></tr>`;
    ['table-views','table-engagement','table-subs','table-log'].forEach(id => fillTable(id, empty));
    document.getElementById('subNet').textContent = '';
    return;
  }
  const peakDay = rows.reduce((best,r) => r.views > best.views ? r : best, rows[0]).d;

  fillTable('table-views', tableRows.map(r => `
    <tr${r.d === peakDay ? ' class="peak"' : ''}><td>${fmtDay(r.d)}</td><td class="num">${fmtInt(r.views)}</td><td class="num">${fmtInt(r.min)}</td><td class="num">${fmtDur(r.avgDur)}</td></tr>`).join(''));

  fillTable('table-engagement', tableRows.map(r => `
    <tr><td>${fmtDay(r.d)}</td><td class="num">${r.likes}</td><td class="num">${r.comments}</td><td class="num">${r.shares}</td><td class="num">${r.likes + r.comments + r.shares}</td></tr>`).join(''));

  fillTable('table-subs', tableRows.map(r => `
    <tr><td>${fmtDay(r.d)}</td><td class="num">${r.subG ? ('+' + r.subG) : '0'}</td><td class="num">${r.subL ? ('−' + r.subL) : '0'}</td><td class="num">${(r.subG - r.subL) >= 0 ? '+' : ''}${r.subG - r.subL}</td></tr>`).join(''));

  fillTable('table-log', tableRows.map(r => `
    <tr${r.d === peakDay ? ' class="peak"' : ''}><td>${fmtDay(r.d)}</td><td class="num">${fmtInt(r.views)}</td><td class="num">${fmtInt(r.min)}</td><td class="num">${fmtDur(r.avgDur)}</td><td class="num">${r.subG}</td><td class="num">${r.subL}</td><td class="num">${r.likes}</td><td class="num">${r.comments}</td><td class="num">${r.shares}</td></tr>`).join(''));

  const totalG = rows.reduce((s,r) => s + r.subG, 0), totalL = rows.reduce((s,r) => s + r.subL, 0);
  document.getElementById('subNet').textContent = `net ${totalG - totalL >= 0 ? '+' : ''}${totalG - totalL}`;
}

/* ---------- Accent swapping ---------- */
function accentVarsStyle(a){
  return `--accent:${a.accent};--accent-strong:${a.accentStrong};--accent-soft:${a.accentSoft};`;
}
function applyAccent(a){
  const root = document.documentElement.style;
  root.setProperty('--accent', a.accent);
  root.setProperty('--accent-strong', a.accentStrong);
  root.setProperty('--accent-soft', a.accentSoft);
}

/* ---------- View switching ---------- */
function showSingle(){
  document.getElementById('singleChannelWrap').hidden = false;
  document.getElementById('viewAllWrap').hidden = true;
}
function showAll(){
  document.getElementById('singleChannelWrap').hidden = true;
  document.getElementById('viewAllWrap').hidden = false;
}
function syncRail(){
  document.querySelectorAll('.channel-tab-btn').forEach(b => {
    b.setAttribute('aria-selected', b.dataset.idx === String(activeIdx) ? 'true' : 'false');
  });
}

function renderChannel(idx){
  activeIdx = idx;
  showSingle();
  const ch = CHANNELS[idx];
  const ig = isIG(ch);
  const traffic = isTraffic(ch);
  const simple = ig || traffic;
  applyAccent(accentOf(ch));

  document.querySelector('.eyebrow').textContent = ch.name;
  document.querySelector('.date-range').textContent = ch.dateRangeIso || 'No data yet';
  // Instagram ships period totals and traffic ships page views, neither is a
  // per-video daily series — don't promise a "Daily performance" view for them.
  document.querySelector('.page-head h1').firstChild.nodeValue = ig ? 'Account performance' : traffic ? 'Page performance' : 'Daily performance';

  const alertEl = document.getElementById('commentAlert');
  const hasNew = !simple && !!ch.hasNewComments;
  alertEl.classList.toggle('shown', !simple);
  alertEl.classList.toggle('flag', hasNew);
  const alertLabel = hasNew ? 'A comment is awaiting a reply' : 'Comments';
  alertEl.title = alertLabel;
  alertEl.setAttribute('aria-label', alertLabel);

  document.querySelector('.source').textContent = ch.dateRangeIso
    ? (ig ? 'instagram_analytics · ' : traffic ? 'github_traffic · ' : 'youtube_analytics · ') + ch.dateRangeIso
    : '';

  renderKPIs(ch);
  renderTopVideos(ch);
  renderComments(ch);

  document.querySelector('.tabs').hidden = simple;
  document.querySelectorAll('.panel').forEach(p => { p.hidden = simple; });

  if(!simple){ renderCharts(ch); renderTables(ch); }
  syncRail();
  document.getElementById('stage').scrollTo?.({ top: 0 });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* ---------- All accounts at once ---------- */
function renderViewAll(){
  activeIdx = 'all';
  showAll();
  document.querySelector('.source').textContent = 'github_traffic + youtube_analytics + instagram_analytics · all accounts';

  const wrap = document.getElementById('viewAllWrap');
  wrap.innerHTML = CHANNELS.map((ch,i) => {
    const ig = isIG(ch);
    const a = accentOf(ch);
    const kpi = kpiItemsHtml(ch, true);
    const comments = commentsHtml(ch);
    const videos = videosBlock(ch);
    const showChart = !ig && (ch.data || []).length > 0;
    return `
      <section class="viewall-channel" style="${accentVarsStyle(a)}">
        <div class="viewall-head">
          <div class="viewall-title">
            <span class="channel-dot" aria-hidden="true"></span>
            <h2>${escapeHtml(ch.name)}</h2>
          </div>
          <span class="date-range">${escapeHtml(ch.dateRangeIso || 'No data yet')}</span>
        </div>
        <div class="kpi-grid">${kpi || '<p class="empty-note">No data for this account yet.</p>'}</div>
        ${showChart ? `<div class="card"><div class="card-title"><h2>Views</h2><span class="hint">peak marked</span></div><div class="chart-wrap" id="viewall-chart-${i}"></div></div>` : ''}
        ${comments ? `<p class="section-label">Recent comments <span class="hint">latest 4</span></p><div class="comment-list">${comments}</div>` : ''}
        ${videos ? `<p class="section-label">${videos.label}</p><div class="video-grid">${videos.html}</div>` : ''}
      </section>`;
  }).join('');

  animateKpiValues(wrap);
  CHANNELS.forEach((ch,i) => {
    if(!isIG(ch) && (ch.data || []).length){
      renderAreaChart(`viewall-chart-${i}`, ch.data, 'views', { color: accentOf(ch).accent, markPeak:true, unit:'views' });
    }
  });
  syncRail();
}

/* ---------- The channel rail (signature element) ----------
   Each account is a stacked 28-day terrain trace in its own accent, so the
   whole portfolio compares at a glance and the nav does real work. */
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
    if(p) spark = `
      <svg class="rail-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
        <path d="${p.area}" fill="${a.accent}" opacity="0.16"/>
        <path d="${p.line}" fill="none" stroke="${a.accent}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
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
      <span class="rail-metric">${metric}</span>
      ${spark}
    </button>`;
}

function buildRail(){
  const el = document.getElementById('channelTabs');
  el.innerHTML =
    CHANNELS.map(railItemHtml).join('') +
    `<button class="channel-tab-btn rail-all" type="button" role="tab" data-idx="all" aria-selected="false">
       <span class="rail-row">
         <span class="channel-dot dot-all" aria-hidden="true" style="background:conic-gradient(${CHANNELS.map(c => accentOf(c).accent).join(',')},${accentOf(CHANNELS[0]).accent})"></span>
         <span class="rail-name">All accounts</span>
       </span>
       <span class="rail-metric">${CHANNELS.length} connected</span>
     </button>`;

  el.querySelectorAll('.channel-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.dataset.idx === 'all' ? renderViewAll() : renderChannel(+btn.dataset.idx);
    });
  });
}

/* ---------- Section tabs ---------- */
function wireTabs(){
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.setAttribute('aria-selected','false'));
      btn.setAttribute('aria-selected','true');
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });
}

/* ---------- Favicon comment-alert glow ----------
   Same mark, two renders: the plain tab icon, and a version with a warm
   radial wash + blurred underlay behind the checkmark so it reads as "lit up"
   even at favicon size. Swapped in once at boot based on whether ANY channel
   has an unanswered recent comment — this is deliberately account-agnostic,
   so it doesn't use --accent (that's per-channel and changes with the tab). */
function faviconSvg(glow){
  const bg = glow
    ? `<defs><radialGradient id='g' cx='50%' cy='45%' r='75%'>
         <stop offset='0%' stop-color='#FF5A00' stop-opacity='.9'/>
         <stop offset='55%' stop-color='#7A2E00' stop-opacity='.55'/>
         <stop offset='100%' stop-color='#12161C'/>
       </radialGradient></defs>
       <rect width='16' height='16' rx='3' fill='url(#g)'/>`
    : `<rect width='16' height='16' rx='3' fill='#12161C'/>`;
  const glowStroke = glow
    ? `<path d='M2 11 L5 8 L8 9.5 L11 4.5 L14 6.5' fill='none' stroke='#FF5A00' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' opacity='.55' filter='blur(.8px)'/>`
    : '';
  const strokeColor = glow ? '#FFD9B3' : '#FF5A00';
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>${bg}${glowStroke}`
    + `<path d='M2 11 L5 8 L8 9.5 L11 4.5 L14 6.5' fill='none' stroke='${strokeColor}' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>`;
}
function updateFavicon(anyNewComments){
  const link = document.querySelector('link[rel="icon"]');
  if(!link) return;
  link.href = 'data:image/svg+xml,' + encodeURIComponent(faviconSvg(anyNewComments));
}

/* ---------- Animated particle-network background ----------
   Drifting dots, connected by lines when close enough — colour-matched to
   whichever channel is active by reading --accent live off the root element
   each frame, so switching tabs recolors the field for free (applyAccent()
   already sets it; nothing here needs to know which channel is showing).
   Falls back to a single static frame under prefers-reduced-motion. */
function initBackground(){
  const canvas = document.getElementById('bgCanvas');
  if(!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX_LINK_DIST = 140;
  let w = 0, h = 0, particles = [];

  function accentRgb(){
    const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8B93A0';
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function resize(){
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    const count = Math.min(90, Math.max(36, Math.round((w * h) / 16000)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: 2.4 + Math.random() * 2.6
    }));
  }

  function draw(){
    const [cr, cg, cb] = accentRgb();
    ctx.clearRect(0, 0, w, h);

    for(const p of particles){
      p.x += p.vx; p.y += p.vy;
      if(p.x <= 0 || p.x >= w) p.vx *= -1;
      if(p.y <= 0 || p.y >= h) p.vy *= -1;
      p.x = Math.min(Math.max(p.x, 0), w);
      p.y = Math.min(Math.max(p.y, 0), h);
    }

    for(let i = 0; i < particles.length; i++){
      for(let j = i + 1; j < particles.length; j++){
        const a = particles[i], b = particles[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if(dist < MAX_LINK_DIST){
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${((1 - dist / MAX_LINK_DIST) * 0.32).toFixed(3)})`;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.55)`;
    for(const p of particles){
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(){
    draw();
    if(!reduced) requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => {
    resize();
    if(reduced) draw();   // no running rAF loop to pick up the new size on its own
  });
  resize();
  loop();
}

/* ---------- Boot ---------- */
async function init(){
  let payload;
  try {
    const res = await fetch('data.json', { cache: 'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    payload = await res.json();
  } catch (err) {
    document.getElementById('stage').innerHTML =
      `<div class="load-error"><h1>No data to show</h1>
       <p>data.json could not be read (${escapeHtml(err.message)}). Run the pipeline to rebuild it, then reload.</p></div>`;
    return;
  }

  CHANNELS = payload.channels || [];
  // Charts read oldest → newest, left to right; tables list newest first.
  CHANNELS.forEach(ch => { ch.tableRows = ch.data ? [...ch.data].reverse() : []; });

  document.getElementById('generatedAt').textContent = payload.generatedAt || '—';
  updateFavicon(CHANNELS.some(ch => !!ch.hasNewComments));
  buildRail();
  wireTabs();
  renderChannel(0);   // default: first channel (Furad Ride), not the all-accounts view
}

document.addEventListener('DOMContentLoaded', () => { initBackground(); init(); });

// Pick up the next scheduled pipeline run without a manual reload.
setTimeout(() => location.reload(), 20 * 60 * 1000);
