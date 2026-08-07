/* Furadi · Social Analytics
   Data binding + hand-rolled inline-SVG charts.
   Adapted from the local YT Metrics dashboard; reads docs/data.json at runtime. */

let CHANNELS = [];
let activeIdx = 'all';
let dashboardPayload = null;

function isAccountDrawerMode(){ return window.matchMedia('(max-width: 760px)').matches; }

function openAccountDrawer(){
  if(!isAccountDrawerMode()) return;
  document.querySelector('.rail').classList.add('is-open');
  document.getElementById('accountDrawerBackdrop').hidden = false;
  document.getElementById('accountDrawerToggle').setAttribute('aria-expanded', 'true');
}

function closeAccountDrawer({ restoreFocus = true } = {}){
  const rail = document.querySelector('.rail');
  const toggle = document.getElementById('accountDrawerToggle');
  const wasOpen = rail.classList.contains('is-open');
  rail.classList.remove('is-open');
  document.getElementById('accountDrawerBackdrop').hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  if(wasOpen && restoreFocus) toggle.focus();
}

function wireAccountDrawer(){
  const toggle = document.getElementById('accountDrawerToggle');
  const backdrop = document.getElementById('accountDrawerBackdrop');
  toggle.addEventListener('click', () => {
    document.querySelector('.rail').classList.contains('is-open') ? closeAccountDrawer() : openAccountDrawer();
  });
  backdrop.addEventListener('click', () => closeAccountDrawer());
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && document.querySelector('.rail').classList.contains('is-open')) closeAccountDrawer();
  });
  window.matchMedia('(max-width: 760px)').addEventListener('change', event => {
    if(!event.matches) closeAccountDrawer({ restoreFocus:false });
  });
}

function setSelectedAccountLabel(label){
  document.getElementById('selectedAccountLabel').textContent = label;
}

/* IG_ACCENT, fmtInt, escapeHtml, isIG, isTraffic, accentOf, accentVarsStyle,
   sparklinePath, MAIL_ICON_PATH, and railItemHtml now live in rail.js (loaded
   before this file in index.html) so the dashboard and the desktop widget
   share one copy of the rail's rendering logic. */

/* ---------- formatting ---------- */
function fmtDay(d){ const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US', { month:'short', day:'numeric' }); }
function fmtDur(s){ const m = Math.floor(s/60), sec = Math.round(s%60); return m + ':' + String(sec).padStart(2,'0'); }
function fmtUsd(n){ return '$' + Number(n || 0).toFixed(2); }
/* Averages below 10 keep one decimal: rounding a real 0.2/day down to a bare "0"
   next to a non-zero total reads as broken rather than small. */
function fmtAvg(n){ const v = Number(n || 0); return v > 0 && v < 10 ? v.toFixed(1) : fmtInt(Math.round(v)); }
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

function parseBuildTimestamp(value){
  if(typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replace(/^([0-9]{4}-[0-9]{2}-[0-9]{2})\s+/, '$1T').replace(/\s+UTC$/, 'Z');
  const timestamp = new Date(normalized);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function formatRelativeUpdate(lastBuiltAt, now = new Date()){
  const timestamp = parseBuildTimestamp(lastBuiltAt);
  const current = now instanceof Date ? now : parseBuildTimestamp(now);
  if(!timestamp || !current) return { label:'Update time unavailable', stale:false, exact:'' };
  const elapsedSeconds = Math.max(0, Math.floor((current.getTime() - timestamp.getTime()) / 1000));
  const stale = elapsedSeconds >= 2 * 60 * 60;
  let relative;
  if(elapsedSeconds < 60) relative = 'just now';
  else if(elapsedSeconds < 60 * 60) relative = Math.floor(elapsedSeconds / 60) + ' minute' + (Math.floor(elapsedSeconds / 60) === 1 ? '' : 's') + ' ago';
  else if(elapsedSeconds < 24 * 60 * 60) relative = Math.floor(elapsedSeconds / (60 * 60)) + ' hour' + (Math.floor(elapsedSeconds / (60 * 60)) === 1 ? '' : 's') + ' ago';
  else relative = Math.floor(elapsedSeconds / (24 * 60 * 60)) + ' day' + (Math.floor(elapsedSeconds / (24 * 60 * 60)) === 1 ? '' : 's') + ' ago';
  return { label:'Updated ' + relative, stale, exact:timestamp.toISOString() };
}

function reportingWindowContext(ch){
  const rows = Array.isArray(ch && ch.data) ? ch.data : [];
  const datedRows = rows.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row && row.d));
  const latestDay = datedRows.length
    ? datedRows.reduce((latest, row) => row.d > latest ? row.d : latest, datedRows[0].d)
    : null;
  const metadataDay = /^\d{4}-\d{2}-\d{2}$/.test(ch && ch.dataThrough) ? ch.dataThrough : null;
  const dataThrough = metadataDay && (!latestDay || metadataDay <= latestDay) ? metadataDay : latestDay;
  const metadataDays = Number.isInteger(ch && ch.windowDays) && ch.windowDays >= 0 ? ch.windowDays : null;
  const windowDays = metadataDays === null ? datedRows.length : metadataDays;
  return [
    dataThrough ? 'Data through ' + fmtDay(dataThrough) : 'Data through unavailable',
    windowDays + ' complete day' + (windowDays === 1 ? '' : 's')
  ];
}

function renderFreshnessStatus(data, now = new Date()){
  const el = document.getElementById('freshnessStatus');
  if(!el) return;
  const timestamp = data && (parseBuildTimestamp(data.lastBuiltAt) ? data.lastBuiltAt : data.generatedAt);
  const freshness = formatRelativeUpdate(timestamp, now);
  const ch = typeof activeIdx === 'number' ? data && data.channels && data.channels[activeIdx] : null;
  const parts = [freshness.stale ? 'Stale' : '', freshness.label, ...reportingWindowContext(ch)].filter(Boolean);
  el.textContent = parts.join(' · ');
  el.title = freshness.exact ? 'Last built ' + freshness.exact : '';
  document.getElementById('freshnessExact').textContent = freshness.exact ? 'Exact build timestamp: ' + freshness.exact : '';
  el.classList.toggle('is-warning', freshness.label === 'Update time unavailable');
  el.classList.toggle('is-stale', freshness.stale);
}

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
    const avgViews = totalViews / rows.length;
    const best = rows.reduce((a,b) => b.views > a.views ? b : a, rows[0]);
    const totalCost = rows.reduce((s,r) => s + (r.costUsd || 0), 0);
    const activeDays = rows.filter(r => r.views > 0).length;
    const prior = ch.prior;
    // No "Unique visitors" tile: the traffic source (GoatCounter, since 2026-07-29)
    // reports one already-deduplicated number per day, so a uniques tile could only
    // ever read 0.
    return kpiCardsHtml([
      { label:'Page views',    value: fmtInt(totalViews),      sub:'across ' + rows.length + ' days', delta: pctDeltaHtml(totalViews, prior && prior.views) },
      { label:'Daily average', value: fmtAvg(avgViews),        sub:'views per day' },
      { label:'Best day',      value: fmtInt(best.views),      sub: fmtDay(best.d) },
      { label:'Active days',   value: fmtInt(activeDays),      sub:'of ' + rows.length + ' with any views' },
      { label:'API cost',      value: fmtUsd(totalCost),       sub:'estimated, ' + rows.length + ' days' }
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
let commentRenderSequence = 0;
let commentDisclosureRaf = null;

function commentTextId(ch, renderContext, index){
  return `comment-${renderContext}-${String(ch.slug || 'channel').replace(/[^a-z0-9_-]/gi, '-')}-${index}-text`;
}

function commentsHtml(ch){
  if(!ch.comments || !ch.comments.length) return null;
  const renderContext = ++commentRenderSequence;
  const comments = [...ch.comments].sort((a, b) => {
    const awaitingOrder = Number(Boolean(b.awaitingReply)) - Number(Boolean(a.awaitingReply));
    if(awaitingOrder) return awaitingOrder;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
  return comments.map((c, index) => {
    const textId = commentTextId(ch, renderContext, index);
    const author = escapeHtml(c.author);
    const reviewDestination = c.commentUrl || c.videoUrl;
    return `
    <article class="comment-item${c.awaitingReply ? ' awaiting' : ''}" tabindex="-1">
      ${c.avatar
        ? `<img class="comment-avatar" src="${escapeHtml(c.avatar)}" alt="" loading="lazy" />`
        : `<div class="comment-avatar comment-avatar-fallback">${escapeHtml((c.author || '?').charAt(0).toUpperCase())}</div>`}
      <div class="comment-body">
        <div class="comment-meta">
          <span class="comment-author">${author}</span>
          <span class="comment-time">${timeAgo(c.publishedAt)}</span>
          ${c.awaitingReply ? '<span class="comment-flag">Needs reply</span>' : ''}
        </div>
        <p class="comment-text" id="${textId}">${escapeHtml(c.text)}</p>
        <div class="comment-footer">
          <span>${fmtInt(c.likes)} likes</span>
          ${c.videoUrl ? `<a href="${escapeHtml(c.videoUrl)}" target="_blank" rel="noopener noreferrer">Open video</a>` : ''}
          <button class="comment-action comment-expand" type="button" hidden aria-expanded="false" aria-controls="${textId}" aria-label="Show full comment from ${author}">Show more</button>
          ${c.awaitingReply ? (reviewDestination
            ? `<a class="comment-action comment-review" href="${escapeHtml(reviewDestination)}" target="_blank" rel="noopener noreferrer" aria-label="Review comment from ${author}">Review comment</a>`
            : `<button class="comment-action comment-review-local" type="button" aria-label="Review comment from ${author}">Review comment</button><span class="comment-review-status" aria-live="polite"></span>`) : ''}
        </div>
      </div>
    </article>`;
  }).join('');
}

function updateCommentDisclosures(scope){
  scope.querySelectorAll('.comment-text').forEach(text => {
    const button = text.parentElement.querySelector('.comment-expand');
    if(!button) return;

    const expanded = button.getAttribute('aria-expanded') === 'true';
    text.classList.remove('is-clamped');
    button.hidden = true;
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
    const hasOverflow = Number.isFinite(lineHeight) && text.scrollHeight > lineHeight * 3 + 1;
    if(!hasOverflow){
      button.setAttribute('aria-expanded', 'false');
      button.textContent = 'Show more';
      button.setAttribute('aria-label', `Show full comment from ${text.closest('.comment-item').querySelector('.comment-author').textContent}`);
      return;
    }

    button.hidden = false;
    if(!expanded) text.classList.add('is-clamped');
  });
}

function scheduleCommentDisclosures(scope){
  if(commentDisclosureRaf) cancelAnimationFrame(commentDisclosureRaf);
  commentDisclosureRaf = requestAnimationFrame(() => {
    commentDisclosureRaf = null;
    if(scope.offsetParent !== null) updateCommentDisclosures(scope);
  });
}

function wireCommentDisclosureMeasurements(){
  window.addEventListener('resize', () => {
    if(commentDisclosureRaf) cancelAnimationFrame(commentDisclosureRaf);
    commentDisclosureRaf = requestAnimationFrame(() => {
      commentDisclosureRaf = null;
      document.querySelectorAll('.comment-list').forEach(scope => {
        if(scope.offsetParent !== null) updateCommentDisclosures(scope);
      });
    });
  });
}

function wireCommentActions(){
  document.addEventListener('click', event => {
    const expandButton = event.target.closest('.comment-expand');
    if(expandButton){
      const card = expandButton.closest('.comment-item');
      const text = card.querySelector('.comment-text');
      const expanded = expandButton.getAttribute('aria-expanded') === 'true';
      text.classList.toggle('is-clamped', expanded);
      expandButton.setAttribute('aria-expanded', String(!expanded));
      expandButton.textContent = expanded ? 'Show more' : 'Show less';
      expandButton.setAttribute('aria-label', `${expanded ? 'Show full' : 'Collapse'} comment from ${card.querySelector('.comment-author').textContent}`);
      return;
    }

    const reviewButton = event.target.closest('.comment-review-local');
    if(reviewButton){
      const card = reviewButton.closest('.comment-item');
      card.classList.add('is-under-review');
      reviewButton.disabled = true;
      reviewButton.textContent = 'In review';
      card.querySelector('.comment-review-status').textContent = 'Marked for review.';
      card.focus({ preventScroll:false });
    }
  });
}

function renderComments(ch){
  const section = document.getElementById('commentsSection');
  const list = document.getElementById('commentList');
  const html = commentsHtml(ch);
  if(!html){ section.hidden = true; list.innerHTML = ''; return; }
  list.innerHTML = html;
  section.hidden = false;
  scheduleCommentDisclosures(list);
}

/* ---------- Simple-channel primary chart (traffic channels' daily page views) ---------- */
function renderTrafficChart(ch){
  const section = document.getElementById('trafficChartSection');
  const rows = (ch.data || []).filter(r => typeof r.views === 'number');
  if(!isTraffic(ch) || !rows.length){ section.hidden = true; return; }

  renderAreaChart('chart-traffic', rows, 'views', {
    color: accentOf(ch).accent,
    unit: 'views',
    formatValue: fmtInt,
  });
  section.hidden = false;
}

/* ---------- Simple-channel secondary chart (e.g. Steadfast Counter's daily API cost) ---------- */
function renderSimpleChart(ch){
  const section = document.getElementById('simpleChartSection');
  const rows = (ch.data || []).filter(r => typeof r.costUsd === 'number');
  if(!isTraffic(ch) || !rows.length){ section.hidden = true; return; }

  document.getElementById('simpleChartTitle').textContent = 'Anthropic API cost';
  document.getElementById('simpleChartHint').textContent = 'estimated, per day';
  renderAreaChart('chart-simple', rows, 'costUsd', {
    color: accentOf(ch).accent,
    unit: 'estimated cost',
    formatValue: fmtUsd,
  });
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
  const fmtValue = opts.formatValue || fmtInt;
  const gid = 'grad-' + containerId;

  const line = rows.map((r,i) => (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(r[key]).toFixed(1)).join(' ');
  const area = line + ` L${x(rows.length - 1).toFixed(1)},${(padT + innerH).toFixed(1)} L${x(0).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  let grid = '';
  for(let t = 0; t <= ticks; t++){
    const v = maxV * t / ticks;
    const gy = y(v);
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="var(--${t === 0 ? 'border-strong' : 'border'})" stroke-width="1" />`;
    grid += `<text x="${padL - 10}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end" class="axis-text">${fmtValue(v)}</text>`;
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
    <text x="${x(peakIdx).toFixed(1)}" y="${(y(vals[peakIdx]) - 11).toFixed(1)}" text-anchor="middle" class="peak-text">${fmtDay(rows[peakIdx].d)} · ${fmtValue(vals[peakIdx])}</text>
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
    tip.innerHTML = `${fmtDay(rows[idx].d)}<br><b>${fmtValue(vals[idx])}</b> ${escapeHtml(opts.unit || '')}`;
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
  setSelectedAccountLabel(ch.name);

  document.querySelector('.eyebrow').textContent = ch.name;
  document.querySelector('.date-range').textContent = ch.dateRangeIso || 'No data yet';
  renderFreshnessStatus(dashboardPayload);
  // Instagram ships period totals and traffic ships page views, neither is a
  // per-video daily series — don't promise a "Daily performance" view for them.
  document.querySelector('.page-head h1').firstChild.nodeValue = ig ? 'Account performance' : traffic ? 'Page performance' : 'Daily performance';

  const alertEl = document.getElementById('commentAlert');
  // Page-level question, so it matches the favicon: "is anything waiting?", not
  // "does this channel have something?" (the rail envelopes answer that). Still
  // hidden entirely on Instagram/traffic channels, which carry no comment data.
  const hasNew = !simple && anyNewComments();
  alertEl.classList.toggle('shown', !simple);
  alertEl.classList.toggle('flag', hasNew);
  const alertLabel = hasNew ? 'A comment is awaiting a reply' : 'Comments';
  alertEl.title = alertLabel;
  alertEl.setAttribute('aria-label', alertLabel);

  document.querySelector('.source').textContent = ch.dateRangeIso
    ? (ig ? 'instagram_analytics · ' : traffic ? 'goatcounter · ' : 'youtube_analytics · ') + ch.dateRangeIso
    : '';

  renderKPIs(ch);
  renderTopVideos(ch);
  renderComments(ch);
  renderTrafficChart(ch);
  renderSimpleChart(ch);

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
  setSelectedAccountLabel('All accounts');
  document.querySelector('.source').textContent = 'goatcounter + youtube_analytics + instagram_analytics · all accounts';

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

  scheduleCommentDisclosures(wrap);

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
   whole portfolio compares at a glance and the nav does real work.
   railItemHtml() itself lives in rail.js (shared with the desktop widget) —
   this just assembles the full rail (including the dashboard-only "All
   accounts" entry) and wires the filter-on-click behavior. */
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
      if(isAccountDrawerMode()) closeAccountDrawer();
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

/* Single source of truth for "is anything waiting for a reply?". The favicon
   and the page-head envelope both answer that page-level question, so they read
   the same helper rather than each rolling their own test — they previously
   disagreed, with the favicon global and the header scoped to the selected
   channel, so a comment on an unselected channel lit one and not the other.
   Which channel it is stays the rail envelopes' job. */
function anyNewComments(){ return CHANNELS.some(ch => !!ch.hasNewComments); }

/* ---------- Favicon comment-alert glow ----------
   Same mark, two renders: the plain tab icon, and a version with a warm
   radial wash + blurred underlay behind the checkmark so it reads as "lit up"
   even at favicon size. Driven by whether ANY channel has an unanswered recent
   comment — this is deliberately account-agnostic, so it doesn't use --accent
   (that's per-channel and changes with the tab).

   The glow pulses via `intensity` (0..1). Favicons can't be animated with CSS
   or SVG animation — browsers rasterise them as static images — so the only
   way to move one is to rewrite the icon href on a timer. Known limitation,
   accepted knowingly: browsers throttle timers in hidden tabs to roughly 1Hz,
   then to once a minute under Chrome's intensive throttling after ~5 minutes
   hidden, so this animates while the tab is visible and effectively freezes
   once it's backgrounded. */
function faviconSvg(glow, intensity = 1){
  const k = glow ? Math.max(0, Math.min(1, intensity)) : 0;
  const bg = glow
    ? `<defs><radialGradient id='g' cx='50%' cy='45%' r='75%'>
         <stop offset='0%' stop-color='#FF5A00' stop-opacity='${(0.45 + 0.45 * k).toFixed(3)}'/>
         <stop offset='55%' stop-color='#7A2E00' stop-opacity='${(0.30 + 0.25 * k).toFixed(3)}'/>
         <stop offset='100%' stop-color='#12161C'/>
       </radialGradient></defs>
       <rect width='16' height='16' rx='3' fill='url(#g)'/>`
    : `<rect width='16' height='16' rx='3' fill='#12161C'/>`;
  const glowStroke = glow
    ? `<path d='M2 11 L5 8 L8 9.5 L11 4.5 L14 6.5' fill='none' stroke='#FF5A00' stroke-width='3' stroke-linecap='round' stroke-linejoin='round' opacity='${(0.30 + 0.35 * k).toFixed(3)}' filter='blur(.8px)'/>`
    : '';
  const strokeColor = glow ? '#FFD9B3' : '#FF5A00';
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>${bg}${glowStroke}`
    + `<path d='M2 11 L5 8 L8 9.5 L11 4.5 L14 6.5' fill='none' stroke='${strokeColor}' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>`;
}

const FAVICON_PULSE_MS = 2000;
const FAVICON_PULSE_FPS = 10;
let faviconPulseTimer = null;

function paintFavicon(glow, intensity){
  const link = document.querySelector('link[rel="icon"]');
  if(!link) return;
  link.href = 'data:image/svg+xml,' + encodeURIComponent(faviconSvg(glow, intensity));
}

function updateFavicon(anyNew){
  // Clear first, unconditionally: repeated calls must not stack intervals, and
  // going from lit to unlit has to stop the timer rather than leave one
  // spinning against a tab icon that no longer changes.
  if(faviconPulseTimer){ clearInterval(faviconPulseTimer); faviconPulseTimer = null; }
  if(!anyNew){ paintFavicon(false, 0); return; }
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    paintFavicon(true, 1);
    return;
  }
  const start = performance.now();
  const tick = () => {
    const phase = ((performance.now() - start) % FAVICON_PULSE_MS) / FAVICON_PULSE_MS;
    paintFavicon(true, (1 - Math.cos(phase * 2 * Math.PI)) / 2);
  };
  tick();
  faviconPulseTimer = setInterval(tick, 1000 / FAVICON_PULSE_FPS);
}

/* ---------- Background manager ----------
   A single shared canvas plus swappable renderers (particles, matrix — more
   can be added to BACKGROUNDS without touching the switch logic). Each
   renderer owns its own state and rAF loop via start()/stop()/resize();
   setActiveBackground() stops whichever is running and starts the next.
   Colour-matched to whichever channel is active by reading --accent live off
   the root element each frame, so switching tabs recolors the field for free
   (applyAccent() already sets it; renderers don't need to know the channel).
   Falls back to a single static frame under prefers-reduced-motion. */
let bgCanvas, bgCtx, bgW = 0, bgH = 0;
function bgReducedMotion(){ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function bgAccentRgb(){
  const hex = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8B93A0';
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function bgResizeCanvas(){
  bgW = bgCanvas.width = window.innerWidth;
  bgH = bgCanvas.height = window.innerHeight;
}

/* ---- Particles: drifting dots, connected by lines when close enough ---- */
const particlesRenderer = (() => {
  const MAX_LINK_DIST = 280;
  let particles = [], rafId = null;

  function reset(){
    const count = Math.min(90, Math.max(36, Math.round((bgW * bgH) / 16000)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * bgW,
      y: Math.random() * bgH,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: 1.6 + Math.random() * 1.6
    }));
  }

  function draw(){
    const [cr, cg, cb] = bgAccentRgb();
    bgCtx.clearRect(0, 0, bgW, bgH);

    for(const p of particles){
      p.x += p.vx; p.y += p.vy;
      if(p.x <= 0 || p.x >= bgW) p.vx *= -1;
      if(p.y <= 0 || p.y >= bgH) p.vy *= -1;
      p.x = Math.min(Math.max(p.x, 0), bgW);
      p.y = Math.min(Math.max(p.y, 0), bgH);
    }

    for(let i = 0; i < particles.length; i++){
      for(let j = i + 1; j < particles.length; j++){
        const a = particles[i], b = particles[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if(dist < MAX_LINK_DIST){
          bgCtx.strokeStyle = `rgba(${cr},${cg},${cb},${((1 - dist / MAX_LINK_DIST) * 0.32).toFixed(3)})`;
          bgCtx.lineWidth = 3.6;
          bgCtx.beginPath();
          bgCtx.moveTo(a.x, a.y); bgCtx.lineTo(b.x, b.y);
          bgCtx.stroke();
        }
      }
    }
    bgCtx.fillStyle = `rgba(${cr},${cg},${cb},0.55)`;
    for(const p of particles){
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      bgCtx.fill();
    }
  }

  function loop(){
    draw();
    if(!bgReducedMotion()) rafId = requestAnimationFrame(loop);
  }

  return {
    id: 'particles', label: 'Particles',
    start(){ reset(); loop(); },
    stop(){ if(rafId != null) cancelAnimationFrame(rafId); rafId = null; },
    resize(){ reset(); if(bgReducedMotion()) draw(); }
  };
})();

/* ---- Matrix: dense falling-code rain, glowing leading characters ---- */
const matrixRenderer = (() => {
  const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789+-*/<>=';
  const COL_SPACING = 20; // tight relative to glyph size so columns overlap into a wall
  let columns = [], rafId = null;

  function reset(){
    const colCount = Math.ceil(bgW / COL_SPACING);
    columns = Array.from({ length: colCount }, () => ({
      y: Math.random() * -bgH,
      speed: 1.5 + Math.random() * 2,
      trail: 20 + Math.floor(Math.random() * 80), // 20-100
      fontSize: 20 + Math.random() * 20, // randomized per column, 20-40px
      glyphs: [] // per-cell glyph, only rerolled occasionally so it doesn't flicker every frame
    }));
  }

  function draw(dt){
    const [cr, cg, cb] = bgAccentRgb();
    // fade rate was tuned as "10% per frame at an assumed 60fps" -- normalize
    // to real elapsed time so a capped/uncapped/high-refresh loop all decay
    // trails at the same real-world rate instead of just whatever the
    // monitor's refresh happens to be
    const fadeAlpha = 1 - Math.pow(0.9, dt * 60);
    bgCtx.fillStyle = `rgba(0,0,0,${fadeAlpha.toFixed(4)})`;
    bgCtx.fillRect(0, 0, bgW, bgH);
    bgCtx.textBaseline = 'top';

    columns.forEach((col, i) => {
      const x = i * COL_SPACING;
      bgCtx.font = col.fontSize.toFixed(1) + 'px "Consolas", monospace';
      for(let t = 0; t < col.trail; t++){
        const y = col.y - t * col.fontSize;
        if(y < -col.fontSize || y > bgH) continue;
        if(Math.random() < 0.08 || !col.glyphs[t]) col.glyphs[t] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const glyph = col.glyphs[t];
        if(t === 0){
          bgCtx.shadowBlur = 16;
          bgCtx.shadowColor = `rgb(${Math.min(255, cr + 180)},${Math.min(255, cg + 180)},${Math.min(255, cb + 180)})`;
          bgCtx.fillStyle = `rgba(${Math.min(255, cr + 180)},${Math.min(255, cg + 180)},${Math.min(255, cb + 180)},1)`;
        } else if(t === 1){
          bgCtx.shadowBlur = 8;
          bgCtx.shadowColor = `rgba(${cr},${cg},${cb},0.9)`;
          bgCtx.fillStyle = `rgba(${Math.min(255, cr + 80)},${Math.min(255, cg + 80)},${Math.min(255, cb + 80)},0.95)`;
        } else {
          bgCtx.shadowBlur = 0;
          const alpha = Math.max(0, (1 - t / col.trail)) * 0.9;
          bgCtx.fillStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(3)})`;
        }
        bgCtx.fillText(glyph, x, y);
      }
      col.y += col.speed * dt * 60; // speeds were tuned per-frame at an assumed 60fps
      if(col.y - col.trail * col.fontSize > bgH) col.y = Math.random() * -200;
    });
    bgCtx.shadowBlur = 0;
  }

  // cap to 60fps so an uncapped rAF loop doesn't redraw this 2-3x more
  // often than needed on a 120Hz+ display -- movement is scaled by dt
  // (real elapsed time) so the capped frame rate doesn't change fall speed
  const MIN_FRAME_MS = 1000 / 60;
  let lastFrameTime = 0;
  function loop(now){
    if(now - lastFrameTime < MIN_FRAME_MS){
      rafId = requestAnimationFrame(loop);
      return;
    }
    const dt = lastFrameTime ? Math.min(0.05, (now - lastFrameTime) / 1000) : 1 / 60;
    lastFrameTime = now;
    draw(dt);
    if(!bgReducedMotion()) rafId = requestAnimationFrame(loop);
  }

  return {
    id: 'matrix', label: 'Matrix',
    start(){ reset(); lastFrameTime = 0; rafId = requestAnimationFrame(loop); },
    stop(){ if(rafId != null) cancelAnimationFrame(rafId); rafId = null; },
    resize(){ reset(); if(bgReducedMotion()) draw(1 / 60); }
  };
})();

/* ---- Matrix 2.0: perspective hallway of falling code, converging on a
   feathered door. Floor/ceiling march through depth toward the door; walls
   cascade vertically (ceiling to floor) like classic matrix rain wrapped
   onto the wall's perspective-shrinking cross-section. ---- */
const matrix2Renderer = (() => {
  const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789+-*/<>=';
  const BASE_Z = 3;           // depth at which a face's cross-section fills the screen
  const Z_NEAR = 0.55;        // depth at which a column head passes the camera and recycles
  const Z_FAR = 15;           // spawn depth, right at the door
  const RATIO_STEP = 1.016;   // multiplicative depth gap between consecutive trail glyphs
  const COLS_PER_FACE = 110;  // floor/ceiling columns -- same role as COL_SPACING in the flat renderer
  const WALL_SLOTS_PER_FACE = 220;
  const FACES = ['floor', 'ceiling']; // left/right use the vertical wall-rain system below
  const RING_STEP = 90;
  const RING_SPEED = 260;
  const DEPTH_BUCKETS = 28;
  const FLAT_SQUASH_Y = 0.6; // vertical scale for floor/ceiling glyphs so they read as lying flat on the plane (Star Wars crawl) instead of billboarded upright
  const FLAT_SQUASH_X = 0.6; // horizontal scale for wall glyphs -- walls recede along screen-X (see project()), so "flat against the wall" means squashing X instead of Y
  const DOOR_COLS = 20;
  const DOOR_GLYPH_STEP = 0.16; // trail spacing in door-normalized units
  const ALPHA_MIN = 0.025; // below this a glyph is imperceptible -- skip the fillText

  let columns = [], wallColumns = [], doorColumns = [], rafId = null, ringPhase = 0, lastT = 0;
  const buckets = Array.from({ length: DEPTH_BUCKETS }, () => []);
  const leadBucket = [];

  function spawnColumn(face, u, headZ){
    return {
      face, u, headZ,
      speed: 2.4 + Math.random() * 3.0,
      trail: 90 + Math.floor(Math.random() * 40),
      fontScale: 0.6 + Math.random() * 1.0,
      glyphs: []
    };
  }
  function spawnWallColumn(face, z, headU){
    const halfH = (bgW / 2) * (BASE_Z / z); // matches project()'s halfH -- see note there
    const fontScale = 0.6 + Math.random() * 1.0;
    const depthT = 1 - Math.min(1, Math.max(0, (z - Z_NEAR) / (Z_FAR - Z_NEAR)));
    const size = (10 + depthT * depthT * 40) * fontScale;
    return {
      face, z, headU, depthT,
      uStep: size / (2 * halfH),
      speed: 0.16 + Math.random() * 0.22,
      trail: 40 + Math.floor(Math.random() * 30),
      fontScale, size,
      glyphs: []
    };
  }
  function spawnDoorColumn(xNorm){
    return {
      xNorm,
      headYNorm: -1 - Math.random() * 1.5,
      speed: 0.35 + Math.random() * 0.5,
      trail: 6 + Math.floor(Math.random() * 6),
      glyphs: []
    };
  }
  function reset(){
    columns = [];
    for(const face of FACES){
      for(let c = 0; c < COLS_PER_FACE; c++){
        const u = (c + 0.5) / COLS_PER_FACE;
        columns.push(spawnColumn(face, u, Z_FAR * (0.15 + 0.85 * Math.random())));
      }
    }
    wallColumns = [];
    const ratio = Z_FAR / Z_NEAR;
    for(const face of ['left', 'right']){
      for(let c = 0; c < WALL_SLOTS_PER_FACE; c++){
        const t = (c + 0.5) / WALL_SLOTS_PER_FACE;
        const z = Z_NEAR * Math.pow(ratio, t);
        wallColumns.push(spawnWallColumn(face, z, Math.random()));
      }
    }
    doorColumns = [];
    for(let c = 0; c < DOOR_COLS; c++){
      doorColumns.push(spawnDoorColumn((c + 0.5) / DOOR_COLS * 2 - 1));
    }
  }

  function project(face, u, z){
    const halfW = (bgW / 2) * (BASE_Z / z);
    // halfH shares halfW's (width-based) formula rather than scaling off
    // bgH -- the door is a square sized off bgW, so floor/ceiling/wall
    // trails need the same width-based vertical scale to actually converge
    // on its edges instead of falling short of a taller-than-natural door
    const halfH = halfW;
    const cx = bgW / 2, cy = bgH / 2;
    switch(face){
      case 'floor':   return { x: cx + (u * 2 - 1) * halfW, y: cy + halfH };
      case 'ceiling': return { x: cx + (u * 2 - 1) * halfW, y: cy - halfH };
      case 'left':    return { x: cx - halfW, y: cy + (u * 2 - 1) * halfH };
      case 'right':   return { x: cx + halfW, y: cy + (u * 2 - 1) * halfH };
    }
  }

  // fades a face's glyphs toward 0 near its outer edge (u -> 0 or 1) so the
  // floor/ceiling field and the wall field overlap and blend into each other
  // at the seam instead of butting up against a hard boundary
  function edgeFade(u){
    const d = Math.min(u, 1 - u);
    const FADE_W = 0.14;
    return d >= FADE_W ? 1 : d / FADE_W;
  }

  function bucketIndexForZ(z){
    const t = Math.min(1, Math.max(0, (z - Z_NEAR) / (Z_FAR * 1.3 - Z_NEAR)));
    return Math.min(DEPTH_BUCKETS - 1, Math.floor(t * DEPTH_BUCKETS));
  }

  // hoisted out of draw() so these closures aren't reallocated 60x/sec
  const flatRank = { y: 0, x: 1 };
  let lastFont = '';
  function setFont(sizeBucket){
    const f = sizeBucket + 'px "Consolas", monospace';
    if(f !== lastFont){ bgCtx.font = f; lastFont = f; }
  }
  // floor/ceiling glyphs squash vertically (lying flat on the plane); wall
  // glyphs squash horizontally (flat against the wall -- walls recede along
  // screen-X, see project()). Tracks transform state so it's only touched
  // on a switch between flat/non-flat.
  let transformMode = null;
  function drawGlyph(d){
    if(d.flat === 'y'){
      bgCtx.setTransform(1, 0, 0, FLAT_SQUASH_Y, d.x, d.y);
      bgCtx.fillText(d.glyph, 0, 0);
      transformMode = 'y';
    } else if(d.flat === 'x'){
      bgCtx.setTransform(FLAT_SQUASH_X, 0, 0, 1, d.x, d.y);
      bgCtx.fillText(d.glyph, 0, 0);
      transformMode = 'x';
    } else {
      if(transformMode){ bgCtx.setTransform(1, 0, 0, 1, 0, 0); transformMode = null; }
      bgCtx.fillText(d.glyph, d.x, d.y);
    }
  }

  function draw(now){
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    const [cr, cg, cb] = bgAccentRgb();
    bgCtx.setTransform(1, 0, 0, 1, 0, 0); // floor/ceiling glyphs below leave a scale transform set; guarantee identity here
    transformMode = null; // drawGlyph's transform-tracking var is now module-level, so it must be reset alongside the canvas transform above
    bgCtx.fillStyle = '#000';
    bgCtx.fillRect(0, 0, bgW, bgH);

    const cx0 = bgW / 2, cy0 = bgH / 2;

    ringPhase = (ringPhase + RING_SPEED * dt) % RING_STEP;
    for(let r = ringPhase; r < Math.max(bgW, bgH); r += RING_STEP){
      const t = r / (Math.max(bgW, bgH) * 1.2);
      const halfW = Math.min(r, bgW / 2);
      const halfH = Math.min(r * (bgH / bgW), bgH / 2);
      bgCtx.strokeStyle = `rgba(${cr},${cg},${cb},${(0.07 * (1 - t)).toFixed(3)})`;
      bgCtx.strokeRect(cx0 - halfW, cy0 - halfH, halfW * 2, halfH * 2);
    }

    for(const b of buckets) b.length = 0;
    leadBucket.length = 0;

    for(const col of columns){
      col.headZ -= col.speed * dt;
      if(col.headZ <= Z_NEAR){
        Object.assign(col, spawnColumn(col.face, col.u, Z_FAR));
        continue;
      }

      let z = col.headZ;
      const colFade = edgeFade(col.u);
      for(let t = 0; t < col.trail; t++){
        if(z > Z_FAR * 1.3) break;

        const depthT = 1 - Math.min(1, Math.max(0, (z - Z_NEAR) / (Z_FAR - Z_NEAR)));
        const alpha = Math.max(0, 1 - t / col.trail) * Math.min(1, 0.4 + depthT * 1.0) * colFade;
        // below-threshold tail glyphs skip glyph selection + projection too,
        // not just the bucket push -- no point doing that work to discard it
        if(t !== 0 && alpha < ALPHA_MIN){ z *= RATIO_STEP; continue; }

        if(Math.random() < 0.06 || !col.glyphs[t]) col.glyphs[t] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

        const { x, y } = project(col.face, col.u, z);
        const size = (10 + depthT * depthT * 40) * col.fontScale;
        const sizeBucket = Math.round(size / 6) * 6;
        if(t === 0) leadBucket.push({ x, y, sizeBucket, alpha, glyph: col.glyphs[t], flat: 'y' });
        else buckets[bucketIndexForZ(z)].push({ x, y, sizeBucket, alpha, glyph: col.glyphs[t], flat: 'y' });
        z *= RATIO_STEP;
      }
    }

    for(const col of wallColumns){
      col.headU += col.speed * dt;
      if(col.headU - col.trail * col.uStep > 1){
        Object.assign(col, spawnWallColumn(col.face, col.z, -Math.random() * col.trail * col.uStep));
        continue;
      }

      const sizeBucket = Math.round(col.size / 6) * 6;
      const bIndex = bucketIndexForZ(col.z);

      for(let t = 0; t < col.trail; t++){
        const u = col.headU - t * col.uStep;
        if(u < 0 || u > 1) continue;

        const alpha = Math.max(0, 1 - t / col.trail) * Math.min(1, 0.4 + col.depthT * 1.0) * edgeFade(u);
        if(t !== 0 && alpha < ALPHA_MIN) continue;

        if(Math.random() < 0.06 || !col.glyphs[t]) col.glyphs[t] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

        const { x, y } = project(col.face, u, col.z);
        if(t === 0) leadBucket.push({ x, y, sizeBucket, alpha, glyph: col.glyphs[t], flat: 'x' });
        else buckets[bIndex].push({ x, y, sizeBucket, alpha, glyph: col.glyphs[t], flat: 'x' });
      }
    }

    bgCtx.textAlign = 'center';
    bgCtx.textBaseline = 'middle';

    bgCtx.shadowBlur = 0;
    for(let bi = DEPTH_BUCKETS - 1; bi >= 0; bi--){
      const list = buckets[bi];
      list.sort((a, b) => (flatRank[a.flat] ?? 2) - (flatRank[b.flat] ?? 2) || a.sizeBucket - b.sizeBucket);
      for(const d of list){
        setFont(d.sizeBucket);
        bgCtx.fillStyle = `rgba(${cr},${cg},${cb},${d.alpha.toFixed(3)})`;
        drawGlyph(d);
      }
    }

    leadBucket.sort((a, b) => (flatRank[a.flat] ?? 2) - (flatRank[b.flat] ?? 2) || a.sizeBucket - b.sizeBucket);
    // shadowBlur forces a blur pass per fillText -- one of the priciest
    // canvas ops there is; 12 was overkill for a still-glowy lead glyph
    bgCtx.shadowBlur = 7;
    bgCtx.shadowColor = `rgb(${Math.min(255, cr + 170)},${Math.min(255, cg + 170)},${Math.min(255, cb + 170)})`;
    for(const d of leadBucket){
      setFont(d.sizeBucket);
      bgCtx.fillStyle = `rgba(${Math.min(255, cr + 170)},${Math.min(255, cg + 170)},${Math.min(255, cb + 170)},${d.alpha.toFixed(3)})`;
      drawGlyph(d);
    }
    bgCtx.shadowBlur = 0;
    if(transformMode){ bgCtx.setTransform(1, 0, 0, 1, 0, 0); transformMode = null; }

    // the door: a small clipped panel of scrolling code standing in for
    // "the hallway keeps going past here", with a feathered edge blending
    // it into the dark -- layered fills, not ctx.filter blur (filter forces
    // a full-buffer blur pass and cost ~30% of the frame budget for one
    // rectangle; this costs nothing measurable).
    // square door, sized off bgW like the floor/ceiling/wall halfH above so
    // the trails converge right on its edges instead of stopping short
    const doorHalfW = (bgW / 2) * (BASE_Z / Z_FAR) * 0.9;
    const doorHalfH = doorHalfW;

    bgCtx.save();
    bgCtx.beginPath();
    bgCtx.rect(cx0 - doorHalfW, cy0 - doorHalfH, doorHalfW * 2, doorHalfH * 2);
    bgCtx.clip();
    bgCtx.fillStyle = 'rgba(2,4,2,0.92)';
    bgCtx.fillRect(cx0 - doorHalfW, cy0 - doorHalfH, doorHalfW * 2, doorHalfH * 2);

    const doorFontPx = Math.max(6, doorHalfH * 0.16);
    bgCtx.font = doorFontPx + 'px "Consolas", monospace';
    for(const col of doorColumns){
      col.headYNorm += col.speed * dt;
      if(col.headYNorm - col.trail * DOOR_GLYPH_STEP > 1.3){
        Object.assign(col, spawnDoorColumn(col.xNorm));
        continue;
      }
      const x = cx0 + col.xNorm * doorHalfW;
      for(let t = 0; t < col.trail; t++){
        const yNorm = col.headYNorm - t * DOOR_GLYPH_STEP;
        if(yNorm < -1.3 || yNorm > 1.3) continue;
        const alpha = Math.max(0, 1 - t / col.trail);
        if(alpha < ALPHA_MIN) continue;
        if(Math.random() < 0.08 || !col.glyphs[t]) col.glyphs[t] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const y = cy0 + yNorm * doorHalfH;
        bgCtx.fillStyle = t === 0
          ? `rgba(${Math.min(255, cr + 170)},${Math.min(255, cg + 170)},${Math.min(255, cb + 170)},${alpha.toFixed(3)})`
          : `rgba(${cr},${cg},${cb},${(alpha * 0.9).toFixed(3)})`;
        bgCtx.fillText(col.glyphs[t], x, y);
      }
    }
    bgCtx.restore();

    const FEATHER_LAYERS = 6;
    const FEATHER_PX = 14;
    for(let i = FEATHER_LAYERS; i >= 1; i--){
      const pad = (i / FEATHER_LAYERS) * FEATHER_PX;
      const alpha = (1 - i / FEATHER_LAYERS) * 0.55;
      bgCtx.fillStyle = `rgba(5,5,5,${alpha.toFixed(3)})`;
      // ring only (outer padded rect minus the door bounds) so the feather
      // never washes back over the scrolling code inside the door
      bgCtx.beginPath();
      bgCtx.rect(cx0 - doorHalfW - pad, cy0 - doorHalfH - pad, (doorHalfW + pad) * 2, (doorHalfH + pad) * 2);
      bgCtx.rect(cx0 - doorHalfW, cy0 - doorHalfH, doorHalfW * 2, doorHalfH * 2);
      bgCtx.fill('evenodd');
    }
  }

  // this scene is heavy (thousands of fillText calls/frame); on a 120Hz+
  // display an uncapped rAF loop redraws it 2-3x more often than the eye
  // can use, so cap to 60fps -- dt (derived from lastT in draw()) still
  // reflects real elapsed time, so motion speed is unaffected.
  const MIN_FRAME_MS = 1000 / 60;
  let lastFrameTime = 0;
  function loop(now){
    if(now - lastFrameTime < MIN_FRAME_MS){
      rafId = requestAnimationFrame(loop);
      return;
    }
    lastFrameTime = now;
    draw(now);
    if(!bgReducedMotion()) rafId = requestAnimationFrame(loop);
  }

  return {
    id: 'matrix2', label: 'Matrix 2.0',
    start(){ reset(); lastT = performance.now(); lastFrameTime = 0; rafId = requestAnimationFrame(loop); },
    stop(){ if(rafId != null) cancelAnimationFrame(rafId); rafId = null; },
    resize(){ reset(); if(bgReducedMotion()) draw(performance.now()); }
  };
})();

const BACKGROUNDS = [particlesRenderer, matrixRenderer, matrix2Renderer];
const BG_STORAGE_KEY = 'furadi-bg';
let activeBg = null;

function setActiveBackground(id, { persist = true } = {}){
  const next = BACKGROUNDS.find(b => b.id === id) || BACKGROUNDS[0];
  if(activeBg) activeBg.stop();
  activeBg = next;
  bgCtx.clearRect(0, 0, bgW, bgH);
  activeBg.start();
  if(persist) localStorage.setItem(BG_STORAGE_KEY, activeBg.id);
  document.querySelectorAll('.bg-switch-btn[data-bg]').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.bg === activeBg.id));
  });
  document.body.classList.toggle('bg-matrix-active', activeBg.id === 'matrix' || activeBg.id === 'matrix2');
}

function initBackground(){
  bgCanvas = document.getElementById('bgCanvas');
  if(!bgCanvas || !bgCanvas.getContext) return;
  bgCtx = bgCanvas.getContext('2d');
  bgResizeCanvas();
  window.addEventListener('resize', () => {
    bgResizeCanvas();
    if(activeBg) activeBg.resize();
  });
  const saved = localStorage.getItem(BG_STORAGE_KEY);
  const initial = BACKGROUNDS.some(b => b.id === saved) ? saved : BACKGROUNDS[0].id;
  setActiveBackground(initial, { persist: false });
}

/* ---------- Background-only mode ----------
   Hides the dashboard, leaving just the animated background full-screen.
   Transient by design — never persisted, always starts visible on load — so
   a small restore button stays on screen as the only way back. */
function setBackgroundOnly(active){
  document.body.classList.toggle('bg-only-mode', active);
  const restoreBtn = document.getElementById('bgRestoreBtn');
  if(restoreBtn) restoreBtn.hidden = !active;
}

function wireBackgroundControls(){
  document.querySelectorAll('.bg-switch-btn[data-bg]').forEach(btn => {
    btn.addEventListener('click', () => setActiveBackground(btn.dataset.bg));
  });
  const onlyBtn = document.getElementById('bgOnlyBtn');
  const restoreBtn = document.getElementById('bgRestoreBtn');
  if(onlyBtn) onlyBtn.addEventListener('click', () => setBackgroundOnly(true));
  if(restoreBtn) restoreBtn.addEventListener('click', () => setBackgroundOnly(false));
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
  dashboardPayload = payload;
  // Charts read oldest → newest, left to right; tables list newest first.
  CHANNELS.forEach(ch => { ch.tableRows = ch.data ? [...ch.data].reverse() : []; });

  document.getElementById('generatedAt').textContent = payload.generatedAt || '—';
  updateFavicon(anyNewComments());
  buildRail();
  wireAccountDrawer();
  wireTabs();
  wireCommentDisclosureMeasurements();
  // Steadfast Counter sits first in the rail, but Furad Ride stays the
  // default landing view — fall back to index 0 if it's ever missing.
  const defaultIdx = Math.max(0, CHANNELS.findIndex(ch => ch.slug === 'furad-ride'));
  renderChannel(defaultIdx);
  wireCommentActions();
}

document.addEventListener('DOMContentLoaded', () => { initBackground(); wireBackgroundControls(); init(); });

// Pick up the next scheduled pipeline run without a manual reload.
setTimeout(() => location.reload(), 20 * 60 * 1000);
