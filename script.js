// ════════════════════════════════════════════════
// SUPABASE — hardcoded credentials
// ════════════════════════════════════════════════
const _SU = 'https://cfklprwibgmunquamsfd.supabase.co';
const _SK = 'sb_publishable_JnDvNVVSDG64KrnpbhYcIw_fAl9ZoYl';
const sb  = supabase.createClient(_SU, _SK);

// runtime integrity tokens
const _a=[73,65,111,99,93,99,118,91,87,86,123,63,83,61,97,68,82,36,100,74,72,101,14,11];
const _b=[29,22,3,23,62,36,26,50,51,14,49,14,50,14,9,47,51,22,49,50,4,2,51,54];
const _PH=_a.map((c,i)=>String.fromCharCode(c^_b[i])).join('');
const _wa=[106,69,124,108,53],_wb=[11,33,17,5,91];
const _trigger=_wa.map((c,i)=>String.fromCharCode(c^_wb[i])).join('');

// ════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════
let videos     = [];
let currentTag = 'ALL';
let editingId  = null;
let ctxId      = null;
let lbId       = null;
let _ue=false;
let keyBuf     = '';
let keyTmr     = null;

// ════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════
async function init() {
  await loadSettings();
  await loadVideos();

  sb.channel('vids').on('postgres_changes',
    { event:'*', schema:'public', table:'mv_videos' }, loadVideos).subscribe();
  sb.channel('cfg').on('postgres_changes',
    { event:'*', schema:'public', table:'mv_settings' }, loadSettings).subscribe();

  // Close lightbox on bg click
  document.getElementById('lightbox-bg').addEventListener('click', e => {
    if (e.target === document.getElementById('lightbox-bg')) closeLb();
  });

  // Global key listener
  document.addEventListener('keydown', onKey);
}

// ════════════════════════════════════════════════
// Input listener
// ════════════════════════════════════════════════
function onKey(e) {
  if (e.key === 'Escape') {
    closeLb(); closeModal(); _closePw(); return;
  }
  const active = document.activeElement;
  const inInput = active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'
    || active.isContentEditable;
  if (inInput) return;
  if (e.key.length !== 1) return;

  keyBuf += e.key.toLowerCase();
  clearTimeout(keyTmr);
  keyTmr = setTimeout(() => { keyBuf = ''; }, 1600);

  if (keyBuf.endsWith(_trigger)) {
    keyBuf = ''; clearTimeout(keyTmr);
    _ue?_lock():_unlock();
  }
}

// ════════════════════════════════════════════════
// PASSWORD MODAL
// ════════════════════════════════════════════════
function _unlock() {
  document.getElementById('pw-input').value = '';
  document.getElementById('pw-err').textContent = '';
  document.getElementById('pw-input').classList.remove('err');
  document.getElementById('fm-bg').classList.add('open');
  setTimeout(() => document.getElementById('pw-input').focus(), 80);
}
function _closePw() {
  document.getElementById('fm-bg').classList.remove('open');
}
function toggleEye() {
  const i = document.getElementById('pw-input');
  i.type = i.type === 'password' ? 'text' : 'password';
}
function _chk() {
  const val = document.getElementById('pw-input').value;
  if (btoa(val) === _PH) {
    _closePw();
    _setEdit();
  } else {
    const i = document.getElementById('pw-input');
    i.classList.add('err');
    document.getElementById('pw-err').textContent = 'INCORRECT PASSWORD';
    setTimeout(() => i.classList.remove('err'), 380);
    i.value = '';
  }
}
function _setEdit() {
  _ue=true;
  document.body.classList.add('edit-enabled');
  document.getElementById('e-dot').classList.add('on');
  initSortable();
  toast('Editor unlocked  ·  drag thumbnails to reorder');
}
function _lock() {
  _ue=false;
  document.body.classList.remove('edit-enabled');
  document.getElementById('e-dot').classList.remove('on');
  if (_sortable) { _sortable.destroy(); _sortable = null; }
  hideSaveBtn(); _orderChanged = false;
  // Close and hide color panel
  const panel = document.getElementById('color-panel');
  const btn   = document.getElementById('cp-toggle-btn');
  if (panel) panel.classList.remove('open');
  if (btn)   btn.classList.remove('active');
  toast('Editor locked');
}

// ════════════════════════════════════════════════
// YOUTUBE
// ════════════════════════════════════════════════
function ytId(raw) {
  if (!raw) return null;
  raw = raw.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  for (const p of [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]) { const m = raw.match(p); if (m) return m[1]; }
  return null;
}
function ytThumb(id, q='maxresdefault') {
  return `https://img.youtube.com/vi/${id}/${q}.jpg`;
}

// Smart fallback: maxres → hqdefault → sddefault
const THUMB_CHAIN = ['maxresdefault','hqdefault','sddefault'];
function handleThumbErr(img) {
  const cur = img.dataset.fallback ? parseInt(img.dataset.fallback) : 0;
  const next = cur + 1;
  if (next < THUMB_CHAIN.length) {
    const ytid = img.dataset.ytid;
    img.dataset.fallback = next;
    img.src = ytThumb(ytid, THUMB_CHAIN[next]);
  }
}

// ════════════════════════════════════════════════
// LOAD VIDEOS
// ════════════════════════════════════════════════
async function loadVideos() {
  const { data, error } = await sb.from('mv_videos').select('*').order('sort_order');
  if (error) {
    document.getElementById('masonry-grid').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎬</div>
        <div class="empty-text">DB NOT SETUP<br><br>
          <a href="#" onclick="showSQL()" style="color:var(--accent);text-decoration:none">CLICK FOR SETUP SQL</a>
        </div>
      </div>`;
    return;
  }
  videos = data || [];
  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById('masonry-grid');
  const list = currentTag === 'ALL'
    ? videos
    : videos.filter(v => (v.tags||[]).map(t=>t.toLowerCase()).includes(currentTag.toLowerCase()));

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎬</div>
      <div class="empty-text">NO VIDEOS YET${_ue?'<br><br>CLICK + TO ADD':''}</div>
    </div>`;
    buildTags(); return;
  }

  grid.innerHTML = list.map(v => {
    const th   = v.custom_thumb || '';
    const tags = (v.tags||[]).map(t=>`<span class="item-tag">${esc(t)}</span>`).join('');
    const ytid = v.yt_id;
    return `<div class="grid-item" data-id="${v.id}"
        onclick="handleItemClick(event,'${v.id}')"
        oncontextmenu="openCtx(event,'${v.id}')">
      <div class="drag-handle" title="Drag to reorder">⠿</div>
      <div class="item-edit-badge">EDIT</div>
      <img ${th ? `src="${th}"` : `src="https://img.youtube.com/vi/${ytid}/maxresdefault.jpg" data-ytid="${ytid}" data-fallback="0"`}
        alt="${esc(v.title||'')}" loading="lazy"
        onerror="handleThumbErr(this)"/>
      <div class="play-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
      <div class="grid-item-overlay">
        <div class="item-title">${esc(v.title||'')}</div>
        <div class="item-tags">${tags}</div>
      </div>
    </div>`;
  }).join('');

  buildTags();
  initSortable();
  populateHero();
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ════════════════════════════════════════════════
// HERO STRIPS — seamless infinite scroll, no glitch
// KEY: each strip = [A, A] so translateX(-50%) loops perfectly
// ════════════════════════════════════════════════
function populateHero() {
  const rows = ['hero-row1','hero-row2','hero-row3'].map(id => document.getElementById(id));
  if (!rows[0]) return;

  // Base thumb list
  let base = videos.map(v =>
    v.custom_thumb || `https://img.youtube.com/vi/${v.yt_id}/mqdefault.jpg`
  );
  if (base.length === 0) return;

  // Pad to at least 12 unique items so strips look full
  while (base.length < 12) base = [...base, ...base];

  // Deterministic "shuffles" for each row using index offsets
  // (no Math.random so it's consistent and won't re-trigger layout)
  const row0 = base;
  const row1 = [...base.slice(Math.floor(base.length/3)), ...base.slice(0, Math.floor(base.length/3))];
  const row2 = [...base.slice(Math.floor(base.length*2/3)), ...base.slice(0, Math.floor(base.length*2/3))];
  const sets = [row0, row1, row2];

  // CRITICAL for seamless loop:
  // Render the set TWICE back-to-back inside the strip.
  // CSS animation: translateX(0) → translateX(-50%)
  // When it snaps back to 0, it looks identical to -50% → seamless.
  const op = (window._heroOpacity !== undefined) ? window._heroOpacity : 0.4;
  function makeImgs(arr) {
    const imgs = arr.map(src =>
      `<img class="hero-thumb" src="${src}" alt="" loading="lazy" style="opacity:${op}" onerror="this.style.display='none'">`
    ).join('');
    return imgs + imgs;
  }

  rows.forEach((row, i) => {
    if (row) row.innerHTML = makeImgs(sets[i]);
  });
}

// ════════════════════════════════════════════════
// DRAG CLICK GUARD — ignore click after drag
// ════════════════════════════════════════════════
let _dragging = false;
function handleItemClick(e, id) {
  if (_dragging) { _dragging = false; return; }
  if (_ue && e.target.classList.contains('drag-handle')) return;
  openLb(id);
}

// ════════════════════════════════════════════════
// SORTABLE — drag & drop reorder
// ════════════════════════════════════════════════
let _sortable = null;
let _orderChanged = false;

function initSortable() {
  const el = document.getElementById('masonry-grid');
  if (_sortable) { _sortable.destroy(); _sortable = null; }
  if (!_ue) return;

  _sortable = Sortable.create(el, {
    animation: 180,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    handle: '.drag-handle',
    filter: '.empty-state',
    onStart() { _dragging = false; },
    onMove() { _dragging = true; },
    onEnd() {
      _dragging = true;
      _orderChanged = true;
      showSaveBtn();
      setTimeout(() => { _dragging = false; }, 100);
    }
  });
}

function showSaveBtn() {
  document.getElementById('save-order-btn').classList.add('visible');
  document.getElementById('reorder-banner').classList.add('on');
}

function hideSaveBtn() {
  document.getElementById('save-order-btn').classList.remove('visible');
  document.getElementById('reorder-banner').classList.remove('on');
}

async function saveOrder() {
  if (!_ue || !_orderChanged) return;
  const grid = document.getElementById('masonry-grid');
  const items = [...grid.querySelectorAll('.grid-item[data-id]')];
  const updates = items.map((el, i) => ({
    id: el.dataset.id,
    sort_order: i
  }));

  // Update each row's sort_order
  const promises = updates.map(u =>
    sb.from('mv_videos').update({ sort_order: u.sort_order }).eq('id', u.id)
  );
  const results = await Promise.all(promises);
  const hasError = results.some(r => r.error);

  if (hasError) {
    toast('Error saving order');
  } else {
    // Update local state to reflect new order
    updates.forEach(u => {
      const v = videos.find(x => x.id === u.id);
      if (v) v.sort_order = u.sort_order;
    });
    videos.sort((a,b) => a.sort_order - b.sort_order);
    _orderChanged = false;
    hideSaveBtn();
    toast('Order saved ✓');
  }
}

function buildTags() {
  const all = new Set();
  videos.forEach(v => (v.tags||[]).forEach(t => all.add(t)));
  const bar = document.getElementById('filter-bar');
  bar.querySelectorAll('[data-tag]:not([data-tag="ALL"])').forEach(el => el.remove());
  all.forEach(t => {
    const b = document.createElement('button');
    b.className = 'filter-tag' + (t === currentTag ? ' active' : '');
    b.dataset.tag = t;
    b.textContent = t.toUpperCase();
    b.onclick = () => filterTag(b);
    bar.appendChild(b);
  });
}
function filterTag(btn) {
  document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentTag = btn.dataset.tag;
  renderGrid();
}

// ════════════════════════════════════════════════
// LIGHTBOX
// ════════════════════════════════════════════════
function openLb(id) {
  const v = videos.find(x => x.id === id);
  if (!v) return;
  lbId = id;
  document.getElementById('lb-iframe').src =
    `https://www.youtube.com/embed/${v.yt_id}?autoplay=1&rel=0`;
  document.getElementById('lb-title').textContent = v.title || '';
  document.getElementById('lb-sub').textContent =
    [v.artist, v.year].filter(Boolean).join(' · ');
  document.getElementById('lb-ytlink').href =
    `https://www.youtube.com/watch?v=${v.yt_id}`;
  document.getElementById('lightbox-bg').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLb() {
  document.getElementById('lb-iframe').src = '';
  document.getElementById('lightbox-bg').classList.remove('open');
  document.body.style.overflow = '';
  lbId = null;
}
function editFromLb() {
  if(!_ue) return;
  const id = lbId; closeLb(); if (id) openEdit(id);
}

// ════════════════════════════════════════════════
// CONTEXT MENU
// ════════════════════════════════════════════════
function openCtx(e, id) {
  e.preventDefault(); ctxId = id;
  const m = document.getElementById('ctx-menu');
  m.style.left = Math.min(e.clientX, window.innerWidth-160)+'px';
  m.style.top  = Math.min(e.clientY, window.innerHeight-110)+'px';
  m.classList.add('open');
}
document.addEventListener('click', () => document.getElementById('ctx-menu').classList.remove('open'));
function ctxEdit() { document.getElementById('ctx-menu').classList.remove('open'); if(_ue) openEdit(ctxId); }
function ctxYT()   {
  document.getElementById('ctx-menu').classList.remove('open');
  const v = videos.find(x => x.id === ctxId);
  if (v) window.open(`https://www.youtube.com/watch?v=${v.yt_id}`,'_blank');
}
function ctxDel() {
  document.getElementById('ctx-menu').classList.remove('open');
  if(!_ue) return;
  if (!confirm('Delete this video?')) return;
  sb.from('mv_videos').delete().eq('id',ctxId).then(({error}) => {
    if (!error) { toast('Deleted'); loadVideos(); }
    else toast('Error: '+error.message);
  });
}

// ════════════════════════════════════════════════
// ADD / EDIT MODAL
// ════════════════════════════════════════════════
function openAddModal() {
  if(!_ue) return;
  editingId = null;
  document.getElementById('modal-title').textContent = 'ADD VIDEO';
  document.getElementById('btn-delete').style.display = 'none';
  ['f-yturl','f-title','f-artist','f-tags','f-thumb'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-year').value = new Date().getFullYear();
  const p = document.getElementById('thumb-preview');
  p.style.display='none'; p.src='';
  document.getElementById('modal-bg').classList.add('open');
}
function openEdit(id) {
  if(!_ue) return;
  const v = videos.find(x => x.id === id);
  if (!v) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'EDIT VIDEO';
  document.getElementById('btn-delete').style.display = 'inline-flex';
  document.getElementById('f-yturl').value  = v.yt_id || '';
  document.getElementById('f-title').value  = v.title || '';
  document.getElementById('f-artist').value = v.artist || '';
  document.getElementById('f-year').value   = v.year || '';
  document.getElementById('f-tags').value   = (v.tags||[]).join(', ');
  document.getElementById('f-thumb').value  = v.custom_thumb || '';
  const p = document.getElementById('thumb-preview');
  if (v.custom_thumb) {
    p.src = v.custom_thumb;
  } else {
    p.dataset.ytid = v.yt_id; p.dataset.fallback = '0';
    p.onerror = function(){ handleThumbErr(this); };
    p.src = ytThumb(v.yt_id, 'maxresdefault');
  }
  p.style.display = 'block';
  document.getElementById('modal-bg').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-bg').classList.remove('open'); editingId = null;
}
function bgCloseModal(e) {
  if (e.target === document.getElementById('modal-bg')) closeModal();
}

function previewThumb() {
  const id  = ytId(document.getElementById('f-yturl').value);
  const ovr = document.getElementById('f-thumb').value.trim();
  const p   = document.getElementById('thumb-preview');
  if (id && !ovr) {
    p.dataset.ytid = id; p.dataset.fallback = '0';
    p.onerror = function(){ handleThumbErr(this); };
    p.src = ytThumb(id, 'maxresdefault'); p.style.display='block';
    if (!document.getElementById('f-title').value) autoTitle(id);
  }
}
function overrideThumb() {
  const url = document.getElementById('f-thumb').value.trim();
  const p   = document.getElementById('thumb-preview');
  if (url) { p.src=url; p.style.display='block'; } else previewThumb();
}
async function autoTitle(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (r.ok) {
      const d = await r.json();
      const el = document.getElementById('f-title');
      if (!el.value) el.value = d.title || '';
    }
  } catch(e) {}
}

async function saveItem() {
  if(!_ue) return;
  const id    = ytId(document.getElementById('f-yturl').value.trim());
  const title = document.getElementById('f-title').value.trim();
  if (!id)    { toast('Invalid YouTube URL'); return; }
  if (!title) { toast('Title required');      return; }

  const tags = document.getElementById('f-tags').value
    .split(',').map(t=>t.trim()).filter(Boolean);
  const payload = {
    yt_id: id, title,
    artist:       document.getElementById('f-artist').value.trim(),
    year:         document.getElementById('f-year').value.trim(),
    tags,
    custom_thumb: document.getElementById('f-thumb').value.trim()||null,
  };

  let error;
  if (editingId) {
    ({ error } = await sb.from('mv_videos').update(payload).eq('id', editingId));
  } else {
    payload.sort_order = videos.length;
    ({ error } = await sb.from('mv_videos').insert([payload]));
  }
  if (error) { toast('Error: '+error.message); return; }
  toast(editingId ? 'Updated ✓' : 'Added ✓');
  closeModal(); await loadVideos();
}

async function deleteItem() {
  if(!_ue||!editingId) return;
  if (!confirm('Delete this video?')) return;
  const { error } = await sb.from('mv_videos').delete().eq('id', editingId);
  if (!error) { toast('Deleted'); closeModal(); await loadVideos(); }
  else toast('Error: '+error.message);
}

// ════════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════════
async function loadSettings() {
  const { data } = await sb.from('mv_settings').select('*').eq('key','site').maybeSingle();
  if (data && data.value) {
    const s = data.value;
    if (s.site_title) document.getElementById('site-title-input').value = s.site_title;
    if (s.about_name) document.getElementById('about-name').textContent = s.about_name;
    if (s.about_role) document.getElementById('about-role').textContent = s.about_role;
    if (s.about_body) document.getElementById('about-body').textContent = s.about_body;
    if (s.colors) loadColors(s.colors);
    if (s.favicon) loadFavicon(s.favicon);
    applyHeroSettings(s);
  }
}
// ════════════════════════════════════════════════
// HERO LIVE CONTROLS (admin panel)
// ════════════════════════════════════════════════
function liveHeroTitle(v) {
  const el = document.getElementById('hero-title-text');
  if (el) el.textContent = v || 'Nightmare XD';
}
function liveHeroSubtitle(v) {
  const el = document.getElementById('hero-subtitle-text');
  if (el) el.textContent = v || 'motion designer';
}
function liveHeroSize(v) {
  // Use CSS variable so it applies before paint, no flash
  document.documentElement.style.setProperty('--hero-fs', v + 'rem');
  const sl = document.getElementById('hc-fontsize');
  const lb = document.getElementById('hc-fontsize-val');
  if (sl) sl.value = v;
  if (lb) lb.textContent = v + 'rem';
}
function liveHeroOpacity(v) {
  document.querySelectorAll('.hero-thumb').forEach(img => {
    img.style.opacity = (v / 100).toFixed(2);
  });
  window._heroOpacity = v / 100;
}
function liveHeroRowHeight(v) {
  document.querySelectorAll('.hero-strip').forEach(row => {
    row.style.height = v + 'px';
  });
}
function liveHeroSpeed(v) {
  document.querySelectorAll('.hero-strip').forEach(row => {
    row.style.animationDuration = v + 's';
  });
}
async function saveHeroSettings() {
  if (!_ue) return;
  const { data } = await sb.from('mv_settings').select('*').eq('key','site').maybeSingle();
  const ex = (data && data.value) || {};
  const titleEl    = document.getElementById('hero-title-text');
  const subtitleEl = document.getElementById('hero-subtitle-text');
  ex.hero_title    = (document.getElementById('hc-title').value.trim())    || (titleEl    ? titleEl.textContent    : 'Nightmare XD');
  ex.hero_subtitle = (document.getElementById('hc-subtitle').value.trim()) || (subtitleEl ? subtitleEl.textContent : 'motion designer');
  ex.hero_fontsize  = document.getElementById('hc-fontsize').value;
  ex.hero_opacity   = document.getElementById('hc-opacity').value;
  ex.hero_rowheight = document.getElementById('hc-rowheight').value;
  ex.hero_speed     = document.getElementById('hc-speed').value;
  await sb.from('mv_settings').upsert({ key:'site', value: ex });
  toast('Hero settings saved ✓');
}
function applyHeroSettings(s) {
  if (!s) return;
  const tt = document.getElementById('hero-title-text');
  const st = document.getElementById('hero-subtitle-text');
  if (s.hero_title    && tt) { tt.textContent = s.hero_title;    const i=document.getElementById('hc-title');    if(i) i.value=s.hero_title; }
  if (s.hero_subtitle && st) { st.textContent = s.hero_subtitle; const i=document.getElementById('hc-subtitle'); if(i) i.value=s.hero_subtitle; }
  if (s.hero_fontsize) {
    liveHeroSize(s.hero_fontsize);
  }
  if (s.hero_opacity !== undefined) {
    liveHeroOpacity(s.hero_opacity);
    const sl=document.getElementById('hc-opacity'); if(sl) sl.value=s.hero_opacity;
    const lb=document.getElementById('hc-opacity-val'); if(lb) lb.textContent=s.hero_opacity+'%';
  }
  if (s.hero_rowheight) {
    liveHeroRowHeight(s.hero_rowheight);
    const sl=document.getElementById('hc-rowheight'); if(sl) sl.value=s.hero_rowheight;
    const lb=document.getElementById('hc-rh-val'); if(lb) lb.textContent=s.hero_rowheight+'px';
  }
  if (s.hero_speed) {
    liveHeroSpeed(s.hero_speed);
    const sl=document.getElementById('hc-speed'); if(sl) sl.value=s.hero_speed;
    const lb=document.getElementById('hc-speed-val'); if(lb) lb.textContent=s.hero_speed+'s';
  }
}

async function saveAbout() {
  if(!_ue) return;
  const s = {
    site_title: document.getElementById('site-title-input').value,
    about_name: document.getElementById('about-name').textContent,
    about_role: document.getElementById('about-role').textContent,
    about_body: document.getElementById('about-body').textContent,
  };
  await sb.from('mv_settings').upsert({ key:'site', value:s });
  toast('Saved ✓');
}
async function saveSiteTitle(val) {
  if(!_ue) return;
  const { data } = await sb.from('mv_settings').select('*').eq('key','site').maybeSingle();
  const ex = (data && data.value) || {};
  ex.site_title = val;
  await sb.from('mv_settings').upsert({ key:'site', value:ex });
  toast('Saved ✓');
}

// ════════════════════════════════════════════════
// PAGE NAVIGATION
// ════════════════════════════════════════════════
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  if (btn) btn.classList.add('active');
}

// ════════════════════════════════════════════════
// SQL SETUP POPUP
// ════════════════════════════════════════════════
function showSQL() {
  const sql=`-- Run once in Supabase SQL Editor

create table if not exists mv_videos (
  id uuid primary key default gen_random_uuid(),
  yt_id text not null, title text, artist text, year text,
  tags text[] default '{}', custom_thumb text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists mv_settings (
  key text primary key,
  value jsonb
);

alter table mv_videos enable row level security;
alter table mv_settings enable row level security;

create policy "r" on mv_videos for select using (true);
create policy "w" on mv_videos for all using (true) with check (true);
create policy "r" on mv_settings for select using (true);
create policy "w" on mv_settings for all using (true) with check (true);`;

  const el = document.createElement('div');
  el.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:9999;display:flex;align-items:center;justify-content:center;';
  el.innerHTML=`<div style="background:#111;border:1px solid #2a2a2a;padding:2rem;max-width:640px;width:94vw;position:relative">
    <button onclick="this.closest('[style]').remove()" style="position:absolute;top:1rem;right:1rem;background:none;border:none;color:#555;font-size:1.2rem;cursor:pointer">✕</button>
    <div style="font-family:'Bebas Neue',sans-serif;font-size:1.3rem;letter-spacing:.12em;margin-bottom:.8rem">SUPABASE SETUP</div>
    <p style="font-family:'Space Mono',monospace;font-size:.6rem;color:#666;margin-bottom:1rem;line-height:1.8">
      1. Open Supabase → SQL Editor<br>2. Paste the SQL below → Run<br>3. Refresh this page
    </p>
    <textarea id="_sql" readonly style="width:100%;height:260px;background:#060606;border:1px solid #1e1e1e;color:#888;font-family:'Space Mono',monospace;font-size:.6rem;padding:.7rem;resize:none;outline:none">${sql}</textarea>
    <button onclick="navigator.clipboard.writeText(document.getElementById('_sql').value);this.textContent='COPIED!'"
      style="margin-top:.6rem;background:#fff;color:#000;border:none;padding:.42rem 1rem;font-family:'Space Mono',monospace;font-size:.62rem;cursor:pointer;letter-spacing:.1em;border-radius:2px">
      COPY SQL
    </button>
  </div>`;
  document.body.appendChild(el);
}

// ════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════
let _tt;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(_tt);
  _tt = setTimeout(() => t.classList.remove('on'), 2400);
}


// ════════════════════════════════════════════════
// COLOR CUSTOMIZER
// ════════════════════════════════════════════════
const DEFAULT_COLORS = {
  '--bg':      '#0a0a0a',
  '--text':    '#e8e8e8',
  '--accent':  '#ffffff',
  '--muted':   '#555555',
  '--surface': '#111111',
  '--border':  '#222222',
  '--nav-bg':  '#0a0a0a',
  'about-name-color': '#e8e8e8',
  'about-role-color': '#555555',
  'about-body-color': '#aaaaaa',
};

function toggleColorPanel() {
  const panel = document.getElementById('color-panel');
  const btn   = document.getElementById('cp-toggle-btn');
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open');
  btn.classList.toggle('active', !isOpen);
}

// Close panel when clicking outside
document.addEventListener('click', (e) => {
  const panel = document.getElementById('color-panel');
  const btn   = document.getElementById('cp-toggle-btn');
  if (panel && panel.classList.contains('open')) {
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
      panel.classList.remove('open');
      btn.classList.remove('active');
    }
  }
});

function applyColor(varName, value) {
  document.documentElement.style.setProperty(varName, value);
  // Keep nav background in sync if bg changes
  if (varName === '--bg') {
    document.querySelector('nav').style.background = hexToRgba(value, 0.95);
  }
}

function applyNavColor(value) {
  document.querySelector('nav').style.background = hexToRgba(value, 0.95);
}

function applyDirectColor(elId, prop, value) {
  const el = document.getElementById(elId);
  if (el) el.style[prop] = value;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

async function saveColors() {
  const colors = {
    '--bg':      document.getElementById('cp-bg').value,
    '--text':    document.getElementById('cp-text').value,
    '--accent':  document.getElementById('cp-accent').value,
    '--muted':   document.getElementById('cp-muted').value,
    '--surface': document.getElementById('cp-surface').value,
    '--border':  document.getElementById('cp-border').value,
    '--nav-bg':  document.getElementById('cp-nav').value,
    'about-name-color': document.getElementById('cp-about-name').value,
    'about-role-color': document.getElementById('cp-about-role').value,
    'about-body-color': document.getElementById('cp-about-body').value,
  };
  const { data } = await sb.from('mv_settings').select('*').eq('key','site').maybeSingle();
  const ex = (data && data.value) || {};
  ex.colors = colors;
  const { error } = await sb.from('mv_settings').upsert({ key:'site', value:ex });
  if (!error) toast('Colors saved ✓');
  else toast('Error saving colors');
}

async function resetColors() {
  if (!confirm('Reset all colors to default?')) return;
  // Apply defaults visually
  Object.entries(DEFAULT_COLORS).forEach(([k, v]) => {
    if (k.startsWith('--')) {
      document.documentElement.style.setProperty(k, v);
    } else if (k === '--nav-bg') {
      document.querySelector('nav').style.background = hexToRgba(v, 0.95);
    } else {
      const elId = k.replace('-color','');
      applyDirectColor(elId, 'color', v);
    }
  });
  // Update swatches
  document.getElementById('cp-bg').value = DEFAULT_COLORS['--bg'];
  document.getElementById('cp-text').value = DEFAULT_COLORS['--text'];
  document.getElementById('cp-accent').value = DEFAULT_COLORS['--accent'];
  document.getElementById('cp-muted').value = DEFAULT_COLORS['--muted'];
  document.getElementById('cp-surface').value = DEFAULT_COLORS['--surface'];
  document.getElementById('cp-border').value = DEFAULT_COLORS['--border'];
  document.getElementById('cp-nav').value = DEFAULT_COLORS['--nav-bg'];
  document.getElementById('cp-about-name').value = DEFAULT_COLORS['about-name-color'];
  document.getElementById('cp-about-role').value = DEFAULT_COLORS['about-role-color'];
  document.getElementById('cp-about-body').value = DEFAULT_COLORS['about-body-color'];
  // Update swatch backgrounds
  ['cp-bg','cp-text','cp-accent','cp-muted','cp-surface','cp-border','cp-nav','cp-about-name','cp-about-role','cp-about-body'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.parentElement.style.background = el.value;
  });
  // Save reset to DB
  const { data } = await sb.from('mv_settings').select('*').eq('key','site').maybeSingle();
  const ex = (data && data.value) || {};
  ex.colors = DEFAULT_COLORS;
  await sb.from('mv_settings').upsert({ key:'site', value:ex });
  toast('Colors reset ✓');
}

function loadColors(colors) {
  if (!colors) return;
  Object.entries(colors).forEach(([k, v]) => {
    if (k.startsWith('--') && k !== '--nav-bg') {
      document.documentElement.style.setProperty(k, v);
    } else if (k === '--nav-bg') {
      document.querySelector('nav').style.background = hexToRgba(v, 0.95);
    } else {
      const elId = k.replace('-color','');
      applyDirectColor(elId, 'color', v);
    }
  });
  // Sync color picker inputs & swatches
  const map = {
    '--bg': 'cp-bg', '--text': 'cp-text', '--accent': 'cp-accent',
    '--muted': 'cp-muted', '--surface': 'cp-surface', '--border': 'cp-border',
    '--nav-bg': 'cp-nav',
    'about-name-color': 'cp-about-name',
    'about-role-color': 'cp-about-role',
    'about-body-color': 'cp-about-body',
  };
  Object.entries(map).forEach(([k, inputId]) => {
    if (colors[k]) {
      const el = document.getElementById(inputId);
      if (el) {
        el.value = colors[k];
        el.parentElement.style.background = colors[k];
      }
    }
  });
}


// ════════════════════════════════════════════════
// FAVICON CUSTOMIZER
// ════════════════════════════════════════════════
function setFavicon(dataUrl) {
  // Update the <link> tag
  let link = document.getElementById('favicon-link');
  link.href = dataUrl;

  // Update preview in panel
  const prev = document.getElementById('favicon-preview');
  if (prev) {
    prev.innerHTML = `<img src="${dataUrl}" style="width:28px;height:28px;object-fit:cover;border-radius:3px"/>`;
  }
}

function handleFaviconFile(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Please select an image file'); return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    setFavicon(dataUrl);
    await saveFavicon(dataUrl);
    toast('Favicon updated ✓');
  };
  reader.readAsDataURL(file);
}

async function applyFaviconUrl() {
  const url = document.getElementById('favicon-url-input').value.trim();
  if (!url) { toast('Please enter an image URL'); return; }

  // Convert URL to base64 via canvas to avoid CORS issues when saving
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 64, 64);
      const dataUrl = canvas.toDataURL('image/png');
      setFavicon(dataUrl);
      await saveFavicon(dataUrl);
      toast('Favicon updated ✓');
    };
    img.onerror = () => {
      // If CORS fails, use the URL directly without saving as base64
      setFavicon(url);
      saveFavicon(url);
      toast('Favicon set ✓ (direct URL)');
    };
    img.src = url;
  } catch(e) {
    setFavicon(url);
    await saveFavicon(url);
    toast('Favicon set ✓');
  }
}

async function saveFavicon(dataUrl) {
  const { data } = await sb.from('mv_settings').select('*').eq('key','site').maybeSingle();
  const ex = (data && data.value) || {};
  ex.favicon = dataUrl;
  const { error } = await sb.from('mv_settings').upsert({ key:'site', value: ex });
  if (error) toast('Error saving favicon');
}

function loadFavicon(dataUrl) {
  if (!dataUrl) return;
  setFavicon(dataUrl);
}

// ════════════════════════════════════════════════
// GO
// ════════════════════════════════════════════════
init();
