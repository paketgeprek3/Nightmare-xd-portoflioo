(function() {
  const _SU = 'https://cfklprwibgmunquamsfd.supabase.co';
  const _SK = 'sb_publishable_JnDvNVVSDG64KrnpbhYcIw_fAl9ZoYl';
  const sb  = supabase.createClient(_SU, _SK);

  let videos     = [];
  let currentTag = 'ALL';
  let editingId  = null;
  let ctxId      = null;
  let lbId       = null;
  let _ue        = false;
  let keyBuf     = '';
  let keyTmr     = null;

  const _wa=[106,69,124,108,53],_wb=[11,33,17,5,91];
  const _trigger=_wa.map((c,i)=>String.fromCharCode(c^_wb[i])).join('');

  async function init() {
    await Promise.all([
      loadSettings(),
      loadVideos()
    ]);

    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      _setEdit();
    }

    sb.channel('vids').on('postgres_changes',
      { event:'*', schema:'public', table:'mv_videos' }, loadVideos).subscribe();
    sb.channel('cfg').on('postgres_changes',
      { event:'*', schema:'public', table:'mv_settings' }, loadSettings).subscribe();

    document.getElementById('lightbox-bg').addEventListener('click', e => {
      if (e.target === document.getElementById('lightbox-bg')) closeLb();
    });

    document.addEventListener('keydown', onKey);
  }

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

  function _unlock() {
    document.getElementById('email-input').value = '';
    document.getElementById('pw-input').value = '';
    document.getElementById('pw-err').textContent = '';
    document.getElementById('email-input').classList.remove('err');
    document.getElementById('pw-input').classList.remove('err');
    document.getElementById('fm-bg').classList.add('open');
    setTimeout(() => document.getElementById('email-input').focus(), 80);
  }

  function _closePw() {
    document.getElementById('fm-bg').classList.remove('open');
  }

  function toggleEye() {
    const i = document.getElementById('pw-input');
    i.type = i.type === 'password' ? 'text' : 'password';
  }

  async function _chk() {
    const email = document.getElementById('email-input').value.trim();
    const password = document.getElementById('pw-input').value;
    const err = document.getElementById('pw-err');
    const btn = document.querySelector('#fm-bg .btn-primary');

    if (!email || !password) {
      err.textContent = 'EMAIL AND PASSWORD REQUIRED';
      return;
    }

    btn.textContent = 'WAIT...';
    btn.disabled = true;
    err.textContent = '';

    const { data, error } = await sb.auth.signInWithPassword({
      email: email,
      password: password,
    });

    btn.textContent = 'LOGIN';
    btn.disabled = false;

    if (error) {
      const pwi = document.getElementById('pw-input');
      const emi = document.getElementById('email-input');
      pwi.classList.add('err');
      emi.classList.add('err');
      err.textContent = error.message.toUpperCase();
      setTimeout(() => { pwi.classList.remove('err'); emi.classList.remove('err'); }, 380);
    } else {
      _closePw();
      _setEdit();
    }
  }

  function _setEdit() {
    _ue=true;
    document.body.classList.add('edit-enabled');
    document.getElementById('e-dot').classList.add('on');
    initSortable();
    toast('Editor unlocked  ·  drag thumbnails to reorder');
  }

  async function _lock() {
    await sb.auth.signOut();
    _ue=false;
    document.body.classList.remove('edit-enabled');
    document.getElementById('e-dot').classList.remove('on');
    if (typeof _sortable !== 'undefined' && _sortable) { _sortable.destroy(); _sortable = null; }
    hideSaveBtn(); _orderChanged = false;

    const panel = document.getElementById('color-panel');
    const btn   = document.getElementById('cp-toggle-btn');
    if (panel) panel.classList.remove('open');
    if (btn)   btn.classList.remove('active');

    toast('Editor locked (Logged out)');
  }

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

  async function loadVideos() {
    const { data, error } = await sb.from('mv_videos').select('*').order('sort_order');
    if (error) {
      document.getElementById('masonry-grid').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎬</div>
          <div class="empty-text">DB ERROR<br><br>Check Supabase RLS Policies.</div>
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
        <div class="drag-handle" title="">⠿</div>
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

  function populateHero() {
    const rows = ['hero-row1','hero-row2','hero-row3'].map(id => document.getElementById(id));
    if (!rows[0]) return;

    let base = videos.map(v => v.custom_thumb || `https://img.youtube.com/vi/${v.yt_id}/hqdefault.jpg`);
    if (base.length === 0) return;
    while (base.length < 12) base = [...base, ...base];

    const row0 = base;
    const row1 = [...base.slice(Math.floor(base.length/3)), ...base.slice(0, Math.floor(base.length/3))];
    const row2 = [...base.slice(Math.floor(base.length*2/3)), ...base.slice(0, Math.floor(base.length*2/3))];
    const sets = [row0, row1, row2];

    const op = (window._heroOpacity !== undefined) ? window._heroOpacity : 0.4;
    function makeImgs(arr) {
      const imgs = arr.map(src => `<img class="hero-thumb" src="${src}" alt="" loading="lazy" style="opacity:${op}" onerror="this.style.display='none'">`).join('');
      return imgs + imgs;
    }

    rows.forEach((row, i) => { if (row) row.innerHTML = makeImgs(sets[i]); });
  }

  let _dragging = false;
  function handleItemClick(e, id) {
    if (_dragging) { _dragging = false; return; }
    if (_ue && e.target.classList.contains('drag-handle')) return;
    openLb(id);
  }

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
        _dragging = true; _orderChanged = true; showSaveBtn();
        setTimeout(() => { _dragging = false; }, 100);
      }
    });
  }

  function showSaveBtn() { document.getElementById('save-order-btn').classList.add('visible'); document.getElementById('reorder-banner').classList.add('on'); }
  function hideSaveBtn() { document.getElementById('save-order-btn').classList.remove('visible'); document.getElementById('reorder-banner').classList.remove('on'); }

  async function saveOrder() {
    if (!_ue || !_orderChanged) return;
    const grid = document.getElementById('masonry-grid');
    const items = [...grid.querySelectorAll('.grid-item[data-id]')];
    const updates = items.map((el, i) => ({ id: el.dataset.id, sort_order: i }));

    const promises = updates.map(u => sb.from('mv_videos').update({ sort_order: u.sort_order }).eq('id', u.id));
    const results = await Promise.all(promises);

    if (results.some(r => r.error)) {
      toast('Error saving order');
    } else {
      updates.forEach(u => { const v = videos.find(x => x.id === u.id); if (v) v.sort_order = u.sort_order; });
      videos.sort((a,b) => a.sort_order - b.sort_order);
      _orderChanged = false; hideSaveBtn(); toast('Order saved ✓');
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
      b.dataset.tag = t; b.textContent = t.toUpperCase(); b.onclick = () => filterTag(b);
      bar.appendChild(b);
    });
  }

  function filterTag(btn) {
    document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); currentTag = btn.dataset.tag; renderGrid();
  }

  function openLb(id) {
    const v = videos.find(x => x.id === id);
    if (!v) return;
    lbId = id;
    document.getElementById('lb-iframe').src = `https://www.youtube.com/embed/${v.yt_id}?autoplay=1&rel=0`;
    document.getElementById('lb-title').textContent = v.title || '';
    document.getElementById('lb-sub').textContent = [v.artist, v.year].filter(Boolean).join(' · ');
    document.getElementById('lb-ytlink').href = `https://www.youtube.com/watch?v=${v.yt_id}`;
    document.getElementById('lightbox-bg').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeLb() {
    document.getElementById('lb-iframe').src = '';
    document.getElementById('lightbox-bg').classList.remove('open');
    document.body.style.overflow = ''; lbId = null;
  }

  function editFromLb() { if(!_ue) return; const id = lbId; closeLb(); if (id) openEdit(id); }

  function openCtx(e, id) {
    e.preventDefault(); ctxId = id;
    const m = document.getElementById('ctx-menu');
    m.style.left = Math.min(e.clientX, window.innerWidth-160)+'px';
    m.style.top  = Math.min(e.clientY, window.innerHeight-110)+'px';
    m.classList.add('open');
  }

  document.addEventListener('click', () => document.getElementById('ctx-menu').classList.remove('open'));
  function ctxEdit() { document.getElementById('ctx-menu').classList.remove('open'); if(_ue) openEdit(ctxId); }
  function ctxYT()   { document.getElementById('ctx-menu').classList.remove('open'); const v = videos.find(x => x.id === ctxId); if (v) window.open(`https://www.youtube.com/watch?v=${v.yt_id}`,'_blank'); }
  function ctxDel() {
    document.getElementById('ctx-menu').classList.remove('open');
    if(!_ue) return;
    if (!confirm('Delete this video?')) return;
    sb.from('mv_videos').delete().eq('id',ctxId).then(({error}) => {
      if (!error) { toast('Deleted'); loadVideos(); } else toast('Error: '+error.message);
    });
  }

  function openAddModal() {
    if(!_ue) return;
    editingId = null;
    document.getElementById('modal-title').textContent = 'ADD VIDEO';
    document.getElementById('btn-delete').style.display = 'none';
    ['f-yturl','f-title','f-artist','f-tags','f-thumb'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('f-year').value = new Date().getFullYear();
    const p = document.getElementById('thumb-preview'); p.style.display='none'; p.src='';
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

  function closeModal() { document.getElementById('modal-bg').classList.remove('open'); editingId = null; }
  function bgCloseModal(e) { if (e.target === document.getElementById('modal-bg')) closeModal(); }

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
      if (r.ok) { const d = await r.json(); const el = document.getElementById('f-title'); if (!el.value) el.value = d.title || ''; }
    } catch(e) {}
  }

  async function saveItem() {
    if(!_ue) return;
    const id = ytId(document.getElementById('f-yturl').value.trim());
    const title = document.getElementById('f-title').value.trim();
    if (!id) { toast('Invalid YouTube URL'); return; }
    if (!title) { toast('Title required'); return; }

    const tags = document.getElementById('f-tags').value.split(',').map(t=>t.trim()).filter(Boolean);
    const payload = {
      yt_id: id, title, artist: document.getElementById('f-artist').value.trim(),
      year: document.getElementById('f-year').value.trim(), tags,
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
    if (!error) { toast('Deleted'); closeModal(); await loadVideos(); } else toast('Error: '+error.message);
  }

  async function loadSettings() {
    const { data } = await sb.from('mv_settings').select('*').eq('key','site').maybeSingle();
    if (data && data.value) {
      const s = data.value;
      localStorage.setItem('mv_settings_cache', JSON.stringify(s));
      if (s.site_title) document.getElementById('site-title-input').value = s.site_title;
      if (s.about_name) document.getElementById('about-name').textContent = s.about_name;
      if (s.about_role) document.getElementById('about-role').textContent = s.about_role;
      if (s.about_body) document.getElementById('about-body').textContent = s.about_body;
      if (s.colors) loadColors(s.colors);
      if (s.favicon) loadFavicon(s.favicon);
      
      // Load Links Sosmed
      if (s.link_twitter) document.getElementById('link-twitter').setAttribute('href', s.link_twitter);
      if (s.link_vgen) document.getElementById('link-vgen').setAttribute('href', s.link_vgen);
      if (s.link_email) document.getElementById('link-email').setAttribute('href', s.link_email);

      applyHeroSettings(s);
    }
  }

  function liveHeroTitle(v) { const el = document.getElementById('hero-title-text'); if (el) el.textContent = v || 'Nightmare XD'; }
  function liveHeroSubtitle(v) { const el = document.getElementById('hero-subtitle-text'); if (el) el.textContent = v || 'motion designer'; }
  function liveHeroSize(v) { document.documentElement.style.setProperty('--hero-fs', v + 'rem'); const sl = document.getElementById('hc-fontsize'); const lb = document.getElementById('hc-fontsize-val'); if (sl) sl.value = v; if (lb) lb.textContent = v + 'rem'; }
  function liveHeroOpacity(v) { document.querySelectorAll('.hero-thumb').forEach(img => { img.style.opacity = (v / 100).toFixed(2); }); window._heroOpacity = v / 100; }
  function liveHeroRowHeight(v) { document.querySelectorAll('.hero-strip').forEach(row => { row.style.height = v + 'px'; }); }
  function liveHeroSpeed(v) { document.querySelectorAll('.hero-strip').forEach(row => { row.style.animationDuration = v + 's'; }); }

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
    const tt = document.getElementById('hero-title-text'); const st = document.getElementById('hero-subtitle-text');
    if (s.hero_title && tt) { tt.textContent = s.hero_title; const i=document.getElementById('hc-title'); if(i) i.value=s.hero_title; }
    if (s.hero_subtitle && st) { st.textContent = s.hero_subtitle; const i=document.getElementById('hc-subtitle'); if(i) i.value=s.hero_subtitle; }
    if (s.hero_fontsize) { liveHeroSize(s.hero_fontsize); }
    if (s.hero_opacity !== undefined) { liveHeroOpacity(s.hero_opacity); const sl=document.getElementById('hc-opacity'); if(sl) sl.value=s.hero_opacity; const lb=document.getElementById('hc-opacity-val'); if(lb) lb.textContent=s.hero_opacity+'%'; }
    if (s.hero_rowheight) { liveHeroRowHeight(s.hero_rowheight); const sl=document.getElementById('hc-rowheight'); if(sl) sl.value=s.hero_rowheight; const lb=document.getElementById('hc-rh-val'); if(lb) lb.textContent=s.hero_rowheight+'px'; }
    if (s.hero_speed) { liveHeroSpeed(s.hero_speed); const sl=document.getElementById('hc-speed'); if(sl) sl.value=s.hero_speed; const lb=document.getElementById('hc-speed-val'); if(lb) lb.textContent=s.hero_speed+'s'; }
  }

  // Edit Link Khusus Sosmed
  function handleLinkClick(e, label) {
    if (_ue) {
      e.preventDefault();
      const el = e.currentTarget;
      let currentLink = el.getAttribute('href');
      if (currentLink === '#') currentLink = '';
      const newLink = prompt(`Set URL untuk ${label}\n(Contoh: https://twitter.com/namakamu atau mailto:kamu@email.com):`, currentLink);
      
      if (newLink !== null) {
        el.setAttribute('href', newLink.trim() || '#');
        saveAbout();
      }
    } else {
      // Cegah klik terbuka jika link masih kosong
      if (e.currentTarget.getAttribute('href') === '#') {
        e.preventDefault();
      }
    }
  }

  async function saveAbout() {
    if(!_ue) return;
    const s = {
      site_title: document.getElementById('site-title-input').value,
      about_name: document.getElementById('about-name').textContent,
      about_role: document.getElementById('about-role').textContent,
      about_body: document.getElementById('about-body').textContent,
      // Save link baru
      link_twitter: document.getElementById('link-twitter').getAttribute('href'),
      link_vgen: document.getElementById('link-vgen').getAttribute('href'),
      link_email: document.getElementById('link-email').getAttribute('href')
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

  function showPage(name, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
    document.getElementById('page-'+name).classList.add('active');
    if (btn) btn.classList.add('active');
  }

  let _tt;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(_tt);
    _tt = setTimeout(() => t.classList.remove('on'), 2400);
  }

  const DEFAULT_COLORS = {
    '--bg': '#0a0a0a', '--text': '#e8e8e8', '--accent': '#ffffff', '--muted': '#555555',
    '--surface': '#111111', '--border': '#222222', '--nav-bg': '#0a0a0a',
    'about-name-color': '#e8e8e8', 'about-role-color': '#555555', 'about-body-color': '#aaaaaa',
  };

  function toggleColorPanel() {
    const panel = document.getElementById('color-panel');
    const btn   = document.getElementById('cp-toggle-btn');
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open'); btn.classList.toggle('active', !isOpen);
  }

  document.addEventListener('click', (e) => {
    const panel = document.getElementById('color-panel');
    const btn   = document.getElementById('cp-toggle-btn');
    if (panel && panel.classList.contains('open')) {
      if (!panel.contains(e.target) && !btn.contains(e.target)) {
        panel.classList.remove('open'); btn.classList.remove('active');
      }
    }
  });

  function applyColor(varName, value) { document.documentElement.style.setProperty(varName, value); if (varName === '--bg') { document.querySelector('nav').style.background = hexToRgba(value, 0.95); } }
  function applyNavColor(value) { document.querySelector('nav').style.background = hexToRgba(value, 0.95); }
  function applyDirectColor(elId, prop, value) { const el = document.getElementById(elId); if (el) el.style[prop] = value; }
  function hexToRgba(hex, alpha) { const r = parseInt(hex.slice(1,3),16); const g = parseInt(hex.slice(3,5),16); const b = parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${alpha})`; }

  async function saveColors() {
    const colors = {
      '--bg': document.getElementById('cp-bg').value, '--text': document.getElementById('cp-text').value,
      '--accent': document.getElementById('cp-accent').value, '--muted': document.getElementById('cp-muted').value,
      '--surface': document.getElementById('cp-surface').value, '--border': document.getElementById('cp-border').value,
      '--nav-bg': document.getElementById('cp-nav').value, 'about-name-color': document.getElementById('cp-about-name').value,
      'about-role-color': document.getElementById('cp-about-role').value, 'about-body-color': document.getElementById('cp-about-body').value,
    };
    const { data } = await sb.from('mv_settings').select('*').eq('key','site').maybeSingle();
    const ex = (data && data.value) || {};
    ex.colors = colors;
    const { error } = await sb.from('mv_settings').upsert({ key:'site', value:ex });
    if (!error) toast('Colors saved ✓'); else toast('Error saving colors');
  }

  async function resetColors() {
    if (!confirm('Reset all colors to default?')) return;
    Object.entries(DEFAULT_COLORS).forEach(([k, v]) => {
      if (k.startsWith('--')) { document.documentElement.style.setProperty(k, v); } else if (k === '--nav-bg') { document.querySelector('nav').style.background = hexToRgba(v, 0.95); } else { applyDirectColor(k.replace('-color',''), 'color', v); }
    });
    const map = { '--bg': 'cp-bg', '--text': 'cp-text', '--accent': 'cp-accent', '--muted': 'cp-muted', '--surface': 'cp-surface', '--border': 'cp-border', '--nav-bg': 'cp-nav', 'about-name-color': 'cp-about-name', 'about-role-color': 'cp-about-role', 'about-body-color': 'cp-about-body' };
    Object.entries(map).forEach(([k, inputId]) => { const el = document.getElementById(inputId); if(el) { el.value = DEFAULT_COLORS[k]; el.parentElement.style.background = DEFAULT_COLORS[k]; } });

    const { data } = await sb.from('mv_settings').select('*').eq('key','site').maybeSingle();
    const ex = (data && data.value) || {};
    ex.colors = DEFAULT_COLORS;
    await sb.from('mv_settings').upsert({ key:'site', value:ex });
    toast('Colors reset ✓');
  }

  function loadColors(colors) {
    if (!colors) return;
    Object.entries(colors).forEach(([k, v]) => {
      if (k.startsWith('--') && k !== '--nav-bg') { document.documentElement.style.setProperty(k, v); } else if (k === '--nav-bg') { document.querySelector('nav').style.background = hexToRgba(v, 0.95); } else { applyDirectColor(k.replace('-color',''), 'color', v); }
    });
    const map = { '--bg': 'cp-bg', '--text': 'cp-text', '--accent': 'cp-accent', '--muted': 'cp-muted', '--surface': 'cp-surface', '--border': 'cp-border', '--nav-bg': 'cp-nav', 'about-name-color': 'cp-about-name', 'about-role-color': 'cp-about-role', 'about-body-color': 'cp-about-body' };
    Object.entries(map).forEach(([k, inputId]) => {
      if (colors[k]) { const el = document.getElementById(inputId); if (el) { el.value = colors[k]; el.parentElement.style.background = colors[k]; } }
    });
  }

  function setFavicon(dataUrl) {
    document.getElementById('favicon-link').href = dataUrl;
    const prev = document.getElementById('favicon-preview');
    if (prev) prev.innerHTML = `<img src="${dataUrl}" style="width:28px;height:28px;object-fit:cover;border-radius:3px"/>`;
  }

  function handleFaviconFile(input) {
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Please select an image file'); return; }
    const reader = new FileReader();
    reader.onload = async (e) => { const dataUrl = e.target.result; setFavicon(dataUrl); await saveFavicon(dataUrl); toast('Favicon updated ✓'); };
    reader.readAsDataURL(file);
  }

  async function applyFaviconUrl() {
    const url = document.getElementById('favicon-url-input').value.trim();
    if (!url) { toast('Please enter an image URL'); return; }
    try {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 64, 64);
        const dataUrl = canvas.toDataURL('image/png');
        setFavicon(dataUrl); await saveFavicon(dataUrl); toast('Favicon updated ✓');
      };
      img.onerror = () => { setFavicon(url); saveFavicon(url); toast('Favicon set ✓ (direct URL)'); };
      img.src = url;
    } catch(e) { setFavicon(url); await saveFavicon(url); toast('Favicon set ✓'); }
  }

  async function saveFavicon(dataUrl) {
    const { data } = await sb.from('mv_settings').select('*').eq('key','site').maybeSingle();
    const ex = (data && data.value) || {};
    ex.favicon = dataUrl;
    const { error } = await sb.from('mv_settings').upsert({ key:'site', value: ex });
    if (error) toast('Error saving favicon');
  }

  function loadFavicon(dataUrl) { if (!dataUrl) return; setFavicon(dataUrl); }

  init();

  Object.assign(window, {
    showPage, toggleColorPanel, saveSiteTitle, applyColor, applyNavColor,
    applyDirectColor, saveColors, resetColors, handleFaviconFile, applyFaviconUrl,
    liveHeroTitle, liveHeroSubtitle, liveHeroSize, liveHeroOpacity, liveHeroRowHeight,
    liveHeroSpeed, saveHeroSettings, filterTag, saveAbout, openAddModal,
    toggleEye, _closePw, _chk, closeModal, previewThumb, overrideThumb,
    deleteItem, saveItem, bgCloseModal, closeLb, editFromLb, ctxEdit,
    ctxYT, ctxDel, saveOrder, handleItemClick, openCtx, handleThumbErr,
    handleLinkClick
  });

})();
