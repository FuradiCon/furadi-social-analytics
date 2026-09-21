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

/* IG_ACCENT, fmtInt, escapeHtml, isIG, isTraffic, accentOf, platformLabel,
   accentVarsStyle, sparklinePath, MAIL_ICON_PATH, and railItemHtml now live in
   rail.js (loaded before this file in index.html) so the dashboard and the
   desktop widget share one copy of the rail's rendering logic. */

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

/* ---------- Dismissed "needs reply" flags ----------
   Sticky per-browser dismissal, keyed by YouTube's own comment-thread ID
   (assigned by the pipeline in fetch_recent_comments(), stable across runs).
   Dismissing an ID stays dismissed even if a future hourly pipeline run
   re-fetches the same still-unanswered comment -- only a genuinely new
   comment (a new ID) can re-trigger the flag. Not synced to the desktop
   widget on purpose: it has its own localStorage and keeps showing raw,
   undismissed pipeline state. */
const DISMISSED_COMMENTS_KEY = 'furadiDismissedComments';
let dismissedCommentIds = null;

function loadDismissedComments(){
  if(dismissedCommentIds) return dismissedCommentIds;
  try {
    const raw = localStorage.getItem(DISMISSED_COMMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    dismissedCommentIds = new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    dismissedCommentIds = new Set();
  }
  return dismissedCommentIds;
}

function isCommentDismissed(id){
  return !!id && loadDismissedComments().has(id);
}

function dismissComments(ids){
  const set = loadDismissedComments();
  let changed = false;
  ids.forEach(id => {
    if(id && !set.has(id)){ set.add(id); changed = true; }
  });
  if(changed){
    try {
      localStorage.setItem(DISMISSED_COMMENTS_KEY, JSON.stringify([...set]));
    } catch {
      // Best-effort persistence — the in-memory Set still works for this session.
    }
  }
  return changed;
}

function channelAwaitingCommentIds(ch){
  return (ch.comments || []).filter(c => c.awaitingReply).map(c => c.id).filter(Boolean);
}

function channelHasAwaitingComments(ch){
  return (ch.comments || []).some(c => c.awaitingReply && !isCommentDismissed(c.id));
}

function commentsHtml(ch){
  if(!ch.comments || !ch.comments.length) return null;
  const renderContext = ++commentRenderSequence;
  const withState = ch.comments.map(c => ({ c, awaiting: !!c.awaitingReply && !isCommentDismissed(c.id) }));
  const comments = withState.sort((a, b) => {
    const awaitingOrder = Number(b.awaiting) - Number(a.awaiting);
    if(awaitingOrder) return awaitingOrder;
    return new Date(b.c.publishedAt).getTime() - new Date(a.c.publishedAt).getTime();
  });
  return comments.map(({ c, awaiting }, index) => {
    const textId = commentTextId(ch, renderContext, index);
    const author = escapeHtml(c.author);
    const reviewDestination = c.commentUrl || c.videoUrl;
    return `
    <article class="comment-item${awaiting ? ' awaiting' : ''}" tabindex="-1">
      ${c.avatar
        ? `<img class="comment-avatar" src="${escapeHtml(c.avatar)}" alt="" loading="lazy" />`
        : `<div class="comment-avatar comment-avatar-fallback">${escapeHtml((c.author || '?').charAt(0).toUpperCase())}</div>`}
      <div class="comment-body">
        <div class="comment-meta">
          <span class="comment-author">${author}</span>
          <span class="comment-time">${timeAgo(c.publishedAt)}</span>
          ${awaiting ? '<span class="comment-flag">Needs reply</span>' : ''}
        </div>
        <p class="comment-text" id="${textId}">${escapeHtml(c.text)}</p>
        <div class="comment-footer">
          <span>${fmtInt(c.likes)} likes</span>
          ${c.videoUrl ? `<a href="${escapeHtml(c.videoUrl)}" target="_blank" rel="noopener noreferrer">Open video</a>` : ''}
          <button class="comment-action comment-expand" type="button" hidden aria-expanded="false" aria-controls="${textId}" aria-label="Show full comment from ${author}">Show more</button>
          ${awaiting ? (reviewDestination
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
    const clearAllButton = event.target.closest('#commentClearAll');
    if(clearAllButton){
      const ch = CHANNELS[activeIdx];
      if(!ch) return;
      const ids = channelAwaitingCommentIds(ch);
      dismissComments(ids);
      ch.hasNewComments = ch.hasNewComments && channelHasAwaitingComments(ch);
      renderComments(ch);
      updateCommentAlert(isIG(ch) || isTraffic(ch));
      updateFavicon(anyNewComments());
      buildRail();
      syncRail();
      return;
    }

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
  const clearAllButton = document.getElementById('commentClearAll');
  const html = commentsHtml(ch);
  if(!html){ section.hidden = true; list.innerHTML = ''; clearAllButton.hidden = true; return; }
  list.innerHTML = html;
  section.hidden = false;
  clearAllButton.hidden = !channelHasAwaitingComments(ch);
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

function updateCommentAlert(simple){
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
  document.querySelector('.active-account-platform-label').innerHTML = platformLabel(ch);
  document.querySelector('.date-range').textContent = ch.dateRangeIso || 'No data yet';
  renderFreshnessStatus(dashboardPayload);
  // Instagram ships period totals and traffic ships page views, neither is a
  // per-video daily series — don't promise a "Daily performance" view for them.
  document.querySelector('.page-head h1').firstChild.nodeValue = ig ? 'Account performance' : traffic ? 'Page performance' : 'Daily performance';

  updateCommentAlert(simple);

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

/* ---------- All-accounts attention summary ---------- */
function sumAccountRows(account, key){
  const rows = Array.isArray(account.data) ? account.data : [];
  if(!rows.length) return null;
  let total = 0;
  for(const row of rows){
    const value = row && row[key];
    if(typeof value !== 'number' || !Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}

function numericField(record, key){
  const value = record && record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sumNumericFields(record, keys){
  const values = keys.map(key => numericField(record, key));
  return values.every(value => value !== null) ? values.reduce((total, value) => total + value, 0) : null;
}

function sumAccountFields(account, keys){
  const values = keys.map(key => sumAccountRows(account, key));
  return values.every(value => value !== null) ? values.reduce((total, value) => total + value, 0) : null;
}

function attentionMetric(label, value){
  return { label, value: value == null ? '—' : String(value) };
}

function isInstagramSummary(account){
  return String(account.platform || '').toLowerCase() === 'instagram';
}

function percentChange(current, previous){
  if(!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function attentionTrend(label, current, previous){
  const value = percentChange(current, previous);
  if(value == null) return { value:null, label:'No comparison available' };
  const rounded = Math.round(value);
  if(rounded === 0) return { value:0, label:label + ' flat' };
  return {
    value,
    label:label + (rounded > 0 ? ' up ' : ' down ') + Math.abs(rounded) + '%'
  };
}

function attentionMetadataReasons(account){
  const metadata = account.attention || {};
  const values = [
    account.attentionReasons,
    metadata.reasons,
    metadata.reason,
    typeof metadata === 'string' ? metadata : null,
  ];
  return values.flatMap(value => Array.isArray(value) ? value : [value])
    .filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim());
}

function attentionReasonPriority(reasons){
  if(!reasons.length) return null;
  const text = reasons.join(' ').toLowerCase();
  if(/needs?\s+reply|reply\b|new comments?/.test(text)) return 0;
  if(/down|declin|drop|decreas|loss|lost|negative/.test(text)) return 1;
  if(/up|best|growth|increas|positive|no immediate issue|no issue|flat/.test(text)) return 3;
  return 2;
}

function fallbackAttentionPriority(trend){
  if(trend.value < 0) return 1;
  if(trend.value > 0) return 2;
  return 3;
}

function buildAttentionRows(accounts){
  return accounts.map((account, index) => {
    const instagram = isInstagramSummary(account);
    const youtube = !instagram && !isTraffic(account);
    const currentViews = sumAccountRows(account, 'views');
    const currentMinutes = youtube ? sumAccountRows(account, 'min') : null;
    const currentEngagement = youtube
      ? sumAccountFields(account, ['likes', 'comments', 'shares'])
      : instagram && account.totals
        ? sumNumericFields(account.totals, ['likes', 'comments'])
        : null;
    const subscriberGained = youtube ? sumAccountRows(account, 'subG') : null;
    const subscriberLost = youtube ? sumAccountRows(account, 'subL') : null;
    const currentAudienceChange = subscriberGained === null || subscriberLost === null
      ? null
      : subscriberGained - subscriberLost;
    const previousActivity = instagram
      ? sumNumericFields(account.priorTotals, ['likes', 'comments'])
      : numericField(account.prior, 'views');
    const trendLabel = instagram ? 'Engagement' : isTraffic(account) ? 'Page views' : 'Views';
    const trend = attentionTrend(trendLabel, instagram ? currentEngagement : currentViews, previousActivity);
    const generatedReasons = attentionMetadataReasons(account);
    const reasons = [...generatedReasons];
    if(account.hasNewComments && !reasons.includes('Needs reply: new comments')) reasons.push('Needs reply: new comments');
    if(trend.value < 0 && !reasons.includes(trend.label)) reasons.push(trend.label);
    if(!reasons.length) reasons.push('No immediate issue');
    const generatedPriority = attentionReasonPriority([
      ...generatedReasons,
      ...(account.hasNewComments ? ['Needs reply: new comments'] : []),
    ]);
    const attentionPriority = generatedPriority === null ? fallbackAttentionPriority(trend) : generatedPriority;

    return {
      index,
      name: account.name || 'Unnamed account',
      platform: platformLabel(account),
      hasNewComments: !!account.hasNewComments,
      attentionPriority,
      attentionPrioritySource: generatedPriority === null ? 'fallback' : 'generated',
      activity: attentionMetric(
        instagram ? 'Posts' : isTraffic(account) ? 'Page views' : 'Views',
        instagram ? numericField(account.totals, 'posts') : currentViews == null ? null : fmtInt(currentViews)
      ),
      watchTime: attentionMetric(
        'Watch time',
        currentMinutes == null ? null : Math.floor(currentMinutes / 60) + 'h ' + Math.round(currentMinutes % 60) + 'm'
      ),
      engagement: attentionMetric('Engagement', currentEngagement == null ? null : fmtInt(currentEngagement)),
      audienceChange: attentionMetric(
        'Subscriber change',
        currentAudienceChange == null ? null : (currentAudienceChange >= 0 ? '+' : '') + fmtInt(currentAudienceChange)
      ),
      trend,
      reasons,
    };
  }).sort((left, right) => {
    const priorityDifference = left.attentionPriority - right.attentionPriority;
    if(priorityDifference) return priorityDifference;
    if(left.attentionPrioritySource !== right.attentionPrioritySource){
      return left.attentionPrioritySource === 'generated' ? -1 : 1;
    }
    if(left.attentionPrioritySource === 'fallback' && left.attentionPriority === 2){
      return right.trend.value - left.trend.value;
    }
    return left.index - right.index;
  });
}

function attentionMetricHtml(metric){
  return `<span class="attention-metric"><span class="attention-metric-value">${escapeHtml(metric.value)}</span><span class="attention-metric-label">${escapeHtml(metric.label)}</span></span>`;
}

function attentionSummaryHtml(rows){
  return `<table class="attention-summary-table">
    <thead><tr><th scope="col">Account</th><th scope="col">Attention</th><th scope="col">Views / activity</th><th scope="col">Watch time</th><th scope="col">Engagement</th><th scope="col">Audience change</th></tr></thead>
    <tbody>${rows.map(row => {
      const trend = row.trend.value === null || row.reasons.includes(row.trend.label) ? '' : `<span class="attention-trend">${escapeHtml(row.trend.label)}</span>`;
      return `<tr>
        <th scope="row"><button class="attention-account-button" type="button" data-account-index="${row.index}" aria-label="Open ${escapeHtml(row.name)} account"><span>${escapeHtml(row.name)}</span><span class="account-platform-label">${row.platform}</span></button></th>
        <td data-label="Attention"><span class="attention-reasons">${row.reasons.map(escapeHtml).join(' · ')}</span>${trend}</td>
        <td data-label="Views / activity">${attentionMetricHtml(row.activity)}</td>
        <td data-label="Watch time">${attentionMetricHtml(row.watchTime)}</td>
        <td data-label="Engagement">${attentionMetricHtml(row.engagement)}</td>
        <td data-label="Audience change">${attentionMetricHtml(row.audienceChange)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

/* ---------- All accounts at once ---------- */
function renderViewAll(){
  activeIdx = 'all';
  showAll();
  setSelectedAccountLabel('All accounts');
  document.querySelector('.source').textContent = 'goatcounter + youtube_analytics + instagram_analytics · all accounts';

  const wrap = document.getElementById('viewAllWrap');
  const attentionRows = buildAttentionRows(CHANNELS);
  wrap.innerHTML = `
    <section class="attention-summary" aria-labelledby="attentionSummaryHeading">
      <div class="attention-summary-head">
        <div>
          <p class="section-label">All accounts</p>
          <h1 id="attentionSummaryHeading">Where to look first</h1>
        </div>
        <p class="hint">Current reporting window · select an account for detail</p>
      </div>
      <div class="attention-summary-scroll">${attentionSummaryHtml(attentionRows)}</div>
    </section>
  ` + CHANNELS.map((ch,i) => {
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
            <div class="viewall-title-copy">
              <h2>${escapeHtml(ch.name)}</h2>
              <span class="account-platform-label">${platformLabel(ch)}</span>
            </div>
          </div>
          <span class="date-range">${escapeHtml(ch.dateRangeIso || 'No data yet')}</span>
        </div>
        <div class="kpi-grid">${kpi || '<p class="empty-note">No data for this account yet.</p>'}</div>
        ${showChart ? `<div class="card"><div class="card-title"><h2>Views</h2><span class="hint">peak marked</span></div><div class="chart-wrap" id="viewall-chart-${i}"></div></div>` : ''}
        ${comments ? `<p class="section-label">Recent comments <span class="hint">latest 4</span></p><div class="comment-list">${comments}</div>` : ''}
        ${videos ? `<p class="section-label">${videos.label}</p><div class="video-grid">${videos.html}</div>` : ''}
      </section>`;
  }).join('');

  wrap.querySelector('.attention-summary').addEventListener('click', event => {
    const button = event.target.closest('.attention-account-button');
    if(button) renderChannel(Number(button.dataset.accountIndex));
  });

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
  // Re-apply any prior-session "Clear all" dismissals: hasNewComments is raw
  // pipeline state and knows nothing about the dismissal store, so without
  // this a dismissed channel's envelope/favicon/rail-dot would come back lit
  // on the next 20-minute auto-reload even though every comment is still
  // individually dismissed.
  CHANNELS.forEach(ch => {
    ch.hasNewComments = ch.hasNewComments && channelHasAwaitingComments(ch);
  });
  // Charts read oldest → newest, left to right; tables list newest first.
  CHANNELS.forEach(ch => { ch.tableRows = ch.data ? [...ch.data].reverse() : []; });

  document.getElementById('generatedAt').textContent = payload.generatedAt || '—';
  updateFavicon(anyNewComments());
  buildRail();
  wireAccountDrawer();
  wireTabs();
  wireCommentDisclosureMeasurements();
  // build_data.py orders channels as [YouTube by 28d views, descending] ->
  // Instagram -> Steadfast Counter, so index 0 is always the top-viewed
  // YouTube channel (or whatever fetched successfully, if none did) --
  // exactly what should land by default.
  renderChannel(0);
  wireCommentActions();
}

document.addEventListener('DOMContentLoaded', init);

// Pick up the next scheduled pipeline run without a manual reload.
setTimeout(() => location.reload(), 20 * 60 * 1000);
