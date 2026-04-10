// Konfigurasi Supabase
const _SU = 'https://cfklprwibgmunquamsfd.supabase.co';
const _SK = 'sb_publishable_JnDvNVVSDG64KrnpbhYcIw_fAl9ZoYl';
const sb  = supabase.createClient(_SU, _SK);

// Integrity tokens
const _a=[73,65,111,99,93,99,118,91,87,86,123,63,83,61,97,68,82,36,100,74,72,101,14,11];
const _b=[29,22,3,23,62,36,26,50,51,14,49,14,50,14,9,47,51,22,49,50,4,2,51,54];
const _PH=_a.map((c,i)=>String.fromCharCode(c^_b[i])).join('');
const _wa=[106,69,124,108,53],_wb=[11,33,17,5,91];
const _trigger=_wa.map((c,i)=>String.fromCharCode(c^_wb[i])).join('');

// State
let videos     = [];
let currentTag = 'ALL';
let editingId  = null;
let _ue=false;

// Init
async function init() {
  await loadSettings();
  await loadVideos();

  sb.channel('vids').on('postgres_changes', { event:'*', schema:'public', table:'mv_videos' }, loadVideos).subscribe();
  sb.channel('cfg').on('postgres_changes', { event:'*', schema:'public', table:'mv_settings' }, loadSettings).subscribe();

  document.getElementById('lightbox-bg').addEventListener('click', e => {
    if (e.target === document.getElementById('lightbox-bg')) closeLb();
  });

  document.addEventListener('keydown', onKey);
}

// ... [Masukkan semua fungsi javascript lainnya dari kode asli ke sini] ...

init();
