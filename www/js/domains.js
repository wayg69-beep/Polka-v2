'use strict';
/* ==========================================================
   domains.js — Реестр доменов Полки.
   Кольца по 10 на поле, сквозные номера, чтение с самого свежего.
   Подмена доменов на сетевом слое (fetch + CapacitorHttp),
   проверка работоспособности и авто-поиск производных хостов.
   Синхронизация с Supabase (только для админа).
   Подключать после utils.js. Парсеры править не нужно.
   ========================================================== */
(function () {
  if (window.PolkaDomains) { console.warn('[domains] уже загружен'); return; }

  const LS_KEY = 'polka_domains_v1';
  const RING = 10;
  const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
  const TMDB_POSTER = 'jSziioSwPVrOy9Yow3XhWIBDjq1.jpg';

  const RAW_FETCH = window.fetch.bind(window);
  let RAW_GET = null, RAW_POST = null, PATCHED = false;
  const LAST = {};

  /* ---------- мелочь ---------- */
  const now = () => Date.now();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const CH = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) || null;
  const tmdbKey = () => (typeof TMDB_KEY !== 'undefined' ? TMDB_KEY : '');
  function TO(p, ms) { let t; return Promise.race([Promise.resolve(p).finally(() => clearTimeout(t)), new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })]); }
  async function pool(list, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.max(1, Math.min(n, list.length)) }, async () => { while (i < list.length) { const k = i++; await fn(list[k]); } })); }
  function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; } }
  function swapHost(u, h) { try { const x = new URL(u); x.hostname = h; return x.href; } catch (e) { return u; } }
  function clean(h) { return String(h || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[\/?#].*$/, ''); }
  function magic(b64) {
    try {
      const s = String(b64 || ''); const n = Math.min(16, Math.floor(s.length / 4) * 4);
      if (!n) return '';
      const bin = atob(s.slice(0, n)); let h = '';
      for (let i = 0; i < Math.min(8, bin.length); i++) h += bin.charCodeAt(i).toString(16).padStart(2, '0');
      return h;
    } catch (e) { return 'err'; }
  }
  const isImg = h => /^(89504e47|ffd8ff|52494646|47494638|424d)/.test(String(h || ''));
  const okCode = c => c >= 200 && c < 300;

  /* ---------- сырые запросы (мимо патча, чтобы не зациклиться) ---------- */
  async function nget(url, headers, ms, binary) {
    const ch = CH(); const get = RAW_GET || (ch && ch.get);
    if (!get) return { code: 0, err: 'нет CapacitorHttp', ms: 0 };
    const t0 = now();
    try {
      const o = { url: url, headers: headers || {} };
      if (binary) o.responseType = 'arraybuffer';
      const r = await TO(get.call(ch, o), ms || 14000);
      return { code: Number(r && r.status) || 0, data: r && r.data, ms: now() - t0 };
    } catch (e) { return { code: 0, err: String((e && e.message) || e), ms: now() - t0 }; }
  }
  async function dfetch(url, headers, ms) {
    const t0 = now();
    try {
      const r = await TO(RAW_FETCH(url, { headers: headers || {} }), ms || 14000);
      const text = await r.text();
      return { code: r.status, text: text, ms: now() - t0 };
    } catch (e) { return { code: 0, text: '', err: String((e && e.message) || e), ms: now() - t0 }; }
  }
  async function jfetch(url, headers) {
    let r = await dfetch(url, headers, 15000);
    if (!r.code) {
      const n = await nget(url, Object.assign({}, headers, { 'User-Agent': UA }), 15000);
      r = { code: n.code, text: typeof n.data === 'string' ? n.data : JSON.stringify(n.data || '') };
    }
    if (okCode(r.code)) { try { return JSON.parse(r.text); } catch (e) { return null; } }
    return null;
  }
  async function imgCheck(url, headers) {
    const h = Object.assign({ Accept: 'image/avif,image/webp,image/*,*/*;q=0.8', 'User-Agent': UA, Range: 'bytes=0-2047' }, headers || {});
    let r = await nget(url, h, 16000, true);
    if (r.code === 416) { delete h.Range; r = await nget(url, h, 16000, true); }
    const mg = magic(r.data);
    const good = okCode(r.code) && isImg(mg);
    return { code: r.code, via: 'img', ok: good, note: okCode(r.code) ? (good ? 'картинка' : 'НЕ картинка ' + mg) : (r.err || '') };
  }

  /* ---------- реестр полей ---------- */
  const IMG_BASES = ['cdnlibs.org', 'cdnlibs.link', 'hentaicdn.org', 'imglib.info'];
  function imgGrid() { const a = []; IMG_BASES.forEach(d => ['img', 'img1', 'img2', 'img3', 'img4', 'img5'].forEach(n => a.push(n + '.' + d))); return a; }
  function czGrid() { const a = []; for (let i = 1; i <= 12; i++) a.push('x' + i + '.cmzcdn.org'); return a; }
  function dzGrid() { const a = []; for (let i = 1; i <= 12; i++) a.push(i + '.doramaland.center'); return a; }

  const FIELDS = [
    { key: 'slashlib.main',  group: 'Slashlib', label: 'Сайт',            kind: 'site',     manual: true,  seed: ['v2.shlib.life'] },
    { key: 'slashlib.api',   group: 'Slashlib', label: 'API поиска/глав', kind: 'libapi',   manual: false, auto: 'slapi',  seed: ['api.cdnlibs.org'], aliases: ['api.imglib.info', 'api.cdnlibs.link'] },
    { key: 'slashlib.hapi',  group: 'Slashlib', label: 'API деталей',     kind: 'libapi',   manual: false, auto: 'slapi',  seed: ['hapi.hentaicdn.org'], aliases: ['hapi.cdnlibs.org', 'hapi.imglib.info'] },
    { key: 'slashlib.cover', group: 'Slashlib', label: 'CDN обложек',     kind: 'cover',    manual: false, auto: 'slcover', seed: ['cover.cdnlibs.org', 'cover.hentaicdn.org', 'cover.imglib.info'], aliases: ['cover.cdnlibs.link'], multi: true },
    { key: 'slashlib.img',   group: 'Slashlib', label: 'CDN читалки',     kind: 'slimg',    manual: false, auto: 'slimg',  seed: ['img3.cdnlibs.org', 'img3.hentaicdn.org', 'img2.hentaicdn.org', 'img2.imglib.info', 'img3.cdnlibs.link'], aliases: imgGrid(), multi: true },

    { key: 'comizy.main',  group: 'Comizy', label: 'Сайт',        kind: 'site',  manual: true,  seed: ['comizy.io'] },
    { key: 'comizy.api',   group: 'Comizy', label: 'API глав',    kind: 'czapi', manual: false, auto: 'czapi',   seed: ['api.comizy.io'] },
    { key: 'comizy.cover', group: 'Comizy', label: 'CDN обложек', kind: 'czimg', manual: false, auto: 'czhosts', seed: ['rx.comizy.io'], rewrite: false, hint: 'Ссылки приходят свежими из поиска — подмена не нужна' },
    { key: 'comizy.img',   group: 'Comizy', label: 'CDN страниц', kind: 'czimg', manual: false, auto: 'czhosts', seed: ['x8.cmzcdn.org', 'x9.cmzcdn.org', 'x10.cmzcdn.org'], aliases: czGrid(), rewrite: false, multi: true, hint: 'Шарды x1…x12, приходят из HTML главы' },

    { key: 'dorama.main', group: 'Дорамы', label: 'Dorama.land',  kind: 'site',  manual: true,  seed: ['dorama.land'] },
    { key: 'dorama.cdn',  group: 'Дорамы', label: 'CDN картинок', kind: 'dzimg', manual: false, auto: 'dzcdn', seed: ['9.doramaland.center'], aliases: dzGrid(), multi: true },
    { key: 'kisskh.main', group: 'Дорамы', label: 'Kisskh',       kind: 'site',  manual: true,  seed: ['kisskh.do'], aliases: ['kisskh.co', 'kisskh.me', 'kisskh.ovh'] },

    { key: 'kinogo.main', group: 'Кино', label: 'Kinogo', kind: 'site', manual: true, seed: ['kinogo.pl'], ms: 20000, hint: 'Известные зеркала: kinogo.film, kinogo.la, kinogo.ec, kinogo.onl, kinogo.inc' },

    { key: 'tmdb.api',    group: 'TMDB / AniList', label: 'TMDB API',     kind: 'tmdbapi', manual: true, seed: ['api.themoviedb.org'] },
    { key: 'tmdb.img',    group: 'TMDB / AniList', label: 'TMDB картинки', kind: 'tmdbimg', manual: true, seed: ['image.tmdb.org'] },
    { key: 'anilist.api', group: 'TMDB / AniList', label: 'AniList GraphQL', kind: 'graphql', manual: true, seed: ['graphql.anilist.co'], hint: 'На корень отдаёт 404 — это норма, проверка шлёт POST' },

    { key: 'knigi.main',   group: 'Книги', label: 'Knigi.ws',  kind: 'site', manual: true, seed: ['knigi.ws'] },
    { key: 'flibusta.main', group: 'Книги', label: 'Flibusta', kind: 'site', manual: true, seed: ['flibusta.club'], aliases: ['flibusta.is', 'flibusta.site'] },
    { key: 'ficbook.main', group: 'Книги', label: 'Ficbook',   kind: 'site', manual: true, seed: ['ficbook.net'] },
    { key: 'fanfics.main', group: 'Книги', label: 'Fanfics.me', kind: 'site', manual: true, seed: ['fanfics.me'] },
    { key: 'ao3.main',     group: 'Книги', label: 'AO3',       kind: 'site', manual: true, seed: ['archiveofourown.org'], aliases: ['archiveofourown.gay', 'ao3.org'] },

    { key: 'yts.main',      group: 'Торренты', label: 'YTS',         kind: 'site', manual: true, seed: ['yts.gg'], aliases: ['yts.mx', 'yts.rs', 'yts.am'] },
    { key: 'eztv.main',     group: 'Торренты', label: 'EZTV',        kind: 'site', manual: true, seed: ['eztvx.to'], aliases: ['eztv.re', 'eztv.io'] },
    { key: 'claw.main',     group: 'Торренты', label: 'TorrentClaw', kind: 'site', manual: true, seed: ['torrentclaw.com'] },
    { key: 'movies123.main', group: 'Торренты', label: '123movies',  kind: 'site', manual: true, seed: ['ww8.123moviesfree.net'] },

    { key: 'infra.proxy',    group: 'Инфраструктура', label: 'Воркер-прокси', kind: 'worker',   manual: true, seed: ['polka-proxy.foress-tfiree.workers.dev'] },
    { key: 'infra.wsrv',     group: 'Инфраструктура', label: 'wsrv (обложки)', kind: 'wsrv',    manual: true, seed: ['wsrv.nl'] },
    { key: 'infra.lrclib',   group: 'Инфраструктура', label: 'LRCLIB (тексты)', kind: 'lrclib', manual: true, seed: ['lrclib.net'] },
    { key: 'infra.tessdata', group: 'Инфраструктура', label: 'Tesseract (OCR)', kind: 'tessdata', manual: true, seed: ['tessdata.projectnaptha.com'] },
    { key: 'infra.supabase', group: 'Инфраструктура', label: 'Supabase',      kind: 'supabase', manual: true, seed: ['wamdhzgsintfrawacaft.supabase.co'], hint: '401 без ключа — норма' },
    { key: 'vk.api',         group: 'Инфраструктура', label: 'VK API',        kind: 'vk',       manual: true, seed: ['api.vk.com'] }
  ];
  const BY_KEY = {}; FIELDS.forEach(f => { BY_KEY[f.key] = f; });
  const GROUPS = []; FIELDS.forEach(f => { if (GROUPS.indexOf(f.group) < 0) GROUPS.push(f.group); });

  /* ---------- база с кольцами ---------- */
  const PROBE_SEED = {
    sl: { slug: '51200--menma-next-generation-naruto', cover: 'https://cover.cdnlibs.org/uploads/cover/menma-next-generation-naruto/cover/6seKovcza19q_250x350.jpg', path: 'manga/menma-next-generation-naruto/chapters/1001078/1_M9lT.png', t: 0 },
    cz: { hid: 'ZjoGX6jQ', img: 'https://x8.cmzcdn.org/e/E0AOClVPAAEECk0AW14AVwcDUhkFCQMHUQUGUlxUAwI.webp', t: 0 },
    dz: { img: '', t: 0 }
  };
  let DB = { v: 1, fields: {}, probe: JSON.parse(JSON.stringify(PROBE_SEED)) };
  let ALIASES = {};

  function addRaw(key, host) {
    host = clean(host);
    if (!host || host.indexOf('.') < 0) return 0;
    const f = DB.fields[key] || (DB.fields[key] = { seq: 0, rows: [] });
    f.seq = (f.seq || 0) + 1;
    const ex = f.rows.find(r => r.h === host);
    if (ex) { ex.n = f.seq; ex.t = now(); }
    else if (f.rows.length >= RING) {
      let mi = 0;
      for (let i = 1; i < f.rows.length; i++) if (f.rows[i].n < f.rows[mi].n) mi = i;
      f.rows[mi] = { n: f.seq, h: host, t: now() };
    } else f.rows.push({ n: f.seq, h: host, t: now() });
    return f.seq;
  }
  function buildAliases() {
    const m = {};
    FIELDS.forEach(f => {
      if (f.rewrite === false) return;
      const set = new Set([].concat(f.seed || [], f.aliases || [], all(f.key)));
      set.forEach(h => { h = clean(h); if (h) m[h] = f.key; });
    });
    ALIASES = m;
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); } catch (e) {} buildAliases(); }
  function loadDB() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) { const p = JSON.parse(raw); if (p && p.fields) DB = p; }
    } catch (e) {}
    DB.probe = Object.assign({}, PROBE_SEED, DB.probe || {});
    FIELDS.forEach(f => {
      if (!DB.fields[f.key]) {
        DB.fields[f.key] = { seq: 0, rows: [] };
        (f.seed || []).slice().reverse().forEach(h => addRaw(f.key, h));
      }
    });
    save();
  }

  const rows = key => (((DB.fields[key] || {}).rows) || []).slice().sort((a, b) => b.n - a.n);
  const all = key => rows(key).map(r => r.h);
  const current = key => all(key)[0] || clean((BY_KEY[key] || {}).seed && BY_KEY[key].seed[0]) || '';
  function add(key, host) {
    const n = addRaw(key, host);
    save();
    // Push в Supabase, если админ
    if (DomainsCloud._isAdmin()) {
      DomainsCloud.pushOne(key, host, n);
    }
    return n;
  }
  function remove(key, n) {
    const f = DB.fields[key]; if (!f) return;
    f.rows = f.rows.filter(r => r.n !== n); save();
  }

  /* ---------- подмена URL ---------- */
  function mapUrl(url) {
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
    let u; try { u = new URL(url); } catch (e) { return null; }
    const h = u.hostname.toLowerCase();
    const key = ALIASES[h];
    if (!key) return null;
    const chain = all(key);
    if (!chain.length) return null;
    return { u: u, key: key, chain: chain, host: h };
  }
  function rewriteOnce(url) {
    const m = mapUrl(url);
    if (!m) return url;
    let out = m.chain[0] === m.host ? url : swapHost(m.u.href, m.chain[0]);
    try {
      const x = new URL(out);
      if (ALIASES[x.hostname.toLowerCase()] === 'infra.proxy') {
        ['url', 'download'].forEach(p => {
          const inner = x.searchParams.get(p);
          if (!inner) return;
          const mi = mapUrl(inner);
          if (mi && mi.chain[0] !== mi.host) x.searchParams.set(p, swapHost(mi.u.href, mi.chain[0]));
        });
        out = x.href;
      }
    } catch (e) {}
    return out;
  }

  function patch() {
    if (PATCHED) return true;
    const ch = CH();
    if (ch && typeof ch.get === 'function') {
      RAW_GET = ch.get;
      ch.get = async function (opts) {
        const m = mapUrl(opts && opts.url);
        if (!m) return RAW_GET.call(ch, opts);
        let last = null;
        const tries = m.chain.length > 1 ? Math.min(m.chain.length, 4) : 1;
        for (let i = 0; i < tries; i++) {
          const o = Object.assign({}, opts, { url: swapHost(m.u.href, m.chain[i]) });
          try {
            const r = await RAW_GET.call(ch, o);
            last = r;
            const st = Number(r && r.status) || 0;
            if (okCode(st) || st === 401) return r;
          } catch (e) { last = { status: 0, data: '', error: String((e && e.message) || e) }; }
        }
        return last || { status: 0, data: '' };
      };
      if (typeof ch.post === 'function') {
        RAW_POST = ch.post;
        ch.post = function (opts) { return RAW_POST.call(ch, Object.assign({}, opts, { url: rewriteOnce(opts && opts.url) })); };
      }
    }
    window.fetch = function (input, init) {
      try {
        if (typeof input === 'string') input = rewriteOnce(input);
        else if (input && typeof Request !== 'undefined' && input instanceof Request) {
          const nu = rewriteOnce(input.url);
          if (nu !== input.url) input = new Request(nu, input);
        }
      } catch (e) {}
      return RAW_FETCH(input, init);
    };
    PATCHED = !!(ch && RAW_GET);
    return PATCHED;
  }
  function unpatch() {
    const ch = CH();
    if (ch && RAW_GET) ch.get = RAW_GET;
    if (ch && RAW_POST) ch.post = RAW_POST;
    window.fetch = RAW_FETCH;
    PATCHED = false;
  }

  /* ---------- контекст заголовков ---------- */
  function CTX() {
    const t = localStorage.getItem('slashlib_token') || '';
    const sm = current('slashlib.main'), cm = current('comizy.main');
    return {
      sl: { Accept: 'application/json', 'Site-Id': '2', Authorization: 'Bearer ' + t, Origin: 'https://' + sm, Referer: 'https://' + sm + '/' },
      slImg: { Authorization: 'Bearer ' + t, Origin: 'https://' + sm, Referer: 'https://' + sm + '/', 'Site-Id': '2' },
      cz: { Referer: 'https://' + cm + '/', Origin: 'https://' + cm, 'User-Agent': UA },
      czJson: { Accept: 'application/json', 'User-Agent': UA }
    };
  }

  /* ---------- проверка работоспособности ---------- */
  async function checkOnce(f, host) {
    const c = CTX(), base = 'https://' + host;
    switch (f.kind) {
      case 'site': { const r = await nget(base + '/', { Accept: 'text/html', 'User-Agent': UA }, f.ms || 14000); return { code: r.code, via: 'native', note: r.err || '' }; }
      case 'libapi': {
        const u = base + '/api/manga?site_id[]=2&page=1&limit=10';
        let r = await dfetch(u, c.sl, 14000);
        if (r.code) return { code: r.code, via: 'direct', note: r.code === 422 ? 'параметры' : '' };
        r = await nget(u, Object.assign({}, c.sl, { 'User-Agent': UA }), 14000);
        return { code: r.code, via: 'native', note: r.err || '' };
      }
      case 'czapi': { const r = await nget(base + '/titles/' + ((DB.probe.cz || {}).hid || 'ZjoGX6jQ') + '/chapters', c.czJson, 12000); return { code: r.code, via: 'native', note: r.err || '' }; }
      case 'slimg': { const p = (DB.probe.sl || {}).path; if (!p) return { code: 0, note: 'нет пути — нажми «обновить»' }; return imgCheck(base + '/' + p, c.slImg); }
      case 'cover': { const p = (DB.probe.sl || {}).cover; if (!p) return { code: 0, note: 'нет пути — нажми «обновить»' }; return imgCheck(swapHost(p, host), c.slImg); }
      case 'czimg': { const p = (DB.probe.cz || {}).img; if (!p) return { code: 0, note: 'нет пути — нажми «обновить»' }; return imgCheck(swapHost(p, host), c.cz); }
      case 'dzimg': { const p = (DB.probe.dz || {}).img; if (!p) return { code: 0, note: 'нет пути — нажми «обновить»' }; return imgCheck(swapHost(p, host), { Referer: 'https://' + current('dorama.main') + '/' }); }
      case 'tmdbapi': { const r = await dfetch(base + '/3/configuration?api_key=' + tmdbKey(), {}, 12000); return { code: r.code, via: 'direct', note: r.err || '' }; }
      case 'tmdbimg': return imgCheck(base + '/t/p/w92/' + TMDB_POSTER, {});
      case 'graphql': {
        try {
          const r = await TO(RAW_FETCH(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{"query":"{Media(id:1){id}}"}' }), 12000);
          return { code: r.status, via: 'direct' };
        } catch (e) { return { code: 0, note: String((e && e.message) || e) }; }
      }
      case 'worker': { const r = await dfetch(base + '/?url=' + encodeURIComponent('https://' + current('tmdb.api') + '/3/configuration?api_key=' + tmdbKey()), {}, 12000); return { code: r.code, via: 'direct', note: r.err || '' }; }
      case 'wsrv': return imgCheck(base + '/?url=' + encodeURIComponent(current('tmdb.img') + '/t/p/w92/' + TMDB_POSTER) + '&w=10', {});
      case 'lrclib': { const r = await nget(base + '/api/get?track_name=Believer&artist_name=Imagine%20Dragons', { Accept: 'application/json' }, 12000); return { code: r.code, via: 'native', note: r.err || '' }; }
      case 'tessdata': { const r = await nget(base + '/4.0.0/eng.traineddata.gz', { Range: 'bytes=0-1023' }, 12000); return { code: r.code, via: 'native', note: r.err || '' }; }
      case 'supabase': { const r = await nget(base + '/auth/v1/health', {}, 12000); return { code: r.code, via: 'native', note: r.code === 401 ? 'ожидаемо без ключа' : (r.err || '') }; }
      case 'vk': {
        const t = localStorage.getItem('vk_token') || '';
        const r = await nget(base + '/method/utils.getServerTime?v=5.131&access_token=' + t, { Accept: 'application/json' }, 12000);
        let note = r.err || '';
        try { const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; if (j && j.error) note = 'VK ошибка ' + j.error.error_code; else if (j && j.response) note = 'токен живой'; } catch (e) {}
        return { code: r.code, via: 'native', note: note };
      }
    }
    return { code: 0, note: 'неизвестный тип' };
  }
  async function check(key) {
    patch();
    const f = BY_KEY[key]; if (!f) return { key: key, code: 0, note: 'нет такого поля' };
    const host = current(key);
    if (!host) return { key: key, code: 0, note: 'пусто' };
    const t0 = now();
    let r = await checkOnce(f, host);
    if (!r.code) { await sleep(400); r = await checkOnce(f, host); }
    r.key = key; r.host = host; r.ms = now() - t0;
    LAST[key] = r;
    return r;
  }
  async function checkAll(keys) {
    const list = keys || FIELDS.map(f => f.key);
    const out = [];
    await pool(list, 4, async k => { out.push(await check(k)); });
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }

  /* ---------- образцы для проверок ---------- */
  async function slSample(force) {
    const p = DB.probe.sl || {};
    if (!force && p.path && p.cover && (now() - (p.t || 0)) < 7 * 864e5) return p;
    const api = current('slashlib.api'), c = CTX(), out = { t: now() };
    let j = await jfetch('https://' + api + '/api/manga?site_id[]=2&page=1&limit=10&sort_by=last_chapter_at&q=' + encodeURIComponent('наруто'), c.sl);
    let item = j && j.data && j.data[0];
    if (!item) { j = await jfetch('https://' + api + '/api/manga?site_id[]=2&page=1&limit=10', c.sl); item = j && j.data && j.data[0]; }
    if (!item) return p.path ? p : null;
    out.slug = item.slug_url;
    out.cover = (item.cover && (item.cover.default || item.cover.thumbnail)) || p.cover || '';
    const ch = await jfetch('https://' + api + '/api/manga/' + out.slug + '/chapters?limit=10', c.sl);
    const c0 = ch && ch.data && ch.data[0];
    if (c0) {
      const cp = await jfetch('https://' + api + '/api/manga/' + out.slug + '/chapter?volume=' + encodeURIComponent(c0.volume) + '&number=' + encodeURIComponent(c0.number), c.sl);
      const pg = cp && cp.data && cp.data.pages && cp.data.pages[0];
      if (pg) out.path = String(pg.url || pg.image || '').replace(/^\/+/, '');
    }
    if (!out.path) out.path = p.path || '';
    DB.probe.sl = out; save();
    return out;
  }
  async function sniffSite(host) {
    const found = new Set();
    const add = t => {
      const s = String(t || '').replace(/\\\//g, '/');
      (s.match(/https?:\/\/[a-z0-9.-]+/gi) || []).forEach(u => {
        const h = hostOf(u);
        if (h && /(cdnlibs|imglib|hentaicdn|cmzcdn|doramaland|comizy)/.test(h)) found.add(h);
      });
    };
    const home = await nget('https://' + host + '/', { Accept: 'text/html', 'User-Agent': UA }, 15000);
    const html = typeof home.data === 'string' ? home.data : JSON.stringify(home.data || '');
    add(html);
    const srcs = (html.match(/<script[^>]+src=["']([^"']+)/gi) || []).map(x => x.replace(/.*src=["']/, ''));
    for (const s of srcs.filter(u => /main|app|chunk|build|assets/i.test(u)).slice(0, 2)) {
      let u = s; try { u = new URL(s, 'https://' + host).href; } catch (e) {}
      const b = await nget(u, { Accept: '*/*', 'User-Agent': UA }, 25000);
      add(typeof b.data === 'string' ? b.data : JSON.stringify(b.data || ''));
      await sleep(120);
    }
    return Array.from(found);
  }

  /* ---------- авто-обновление ---------- */
  async function refreshSlApi(key) {
    const pref = key === 'slashlib.hapi' ? /^hapi\./ : /^api\./;
    const sniff = await sniffSite(current('slashlib.main'));
    const cands = Array.from(new Set([].concat(all(key), BY_KEY[key].aliases || [], ['api.cdnlibs.org', 'hapi.hentaicdn.org', 'api.imglib.info', 'hapi.imglib.info'], sniff)))
      .filter(h => pref.test(h));
    const c = CTX(), tried = [], good = [];
    await pool(cands, 4, async h => {
      const j = await jfetch('https://' + h + '/api/manga?site_id[]=2&page=1&limit=10', c.sl);
      const ok = !!(j && Array.isArray(j.data) && j.data.length);
      tried.push({ host: h, ok: ok });
      if (ok) good.push(h);
    });
    good.reverse().forEach(h => add(key, h));
    return { ok: !!good.length, added: good, tried: tried };
  }
  async function refreshSlCover() {
    const s = await slSample(true);
    if (!s || !s.cover) return { ok: false, note: 'API не отдал обложку' };
    const c = CTX(), hosts = new Set(all('slashlib.cover'));
    hosts.add(hostOf(s.cover));
    for (const api of [current('slashlib.api'), current('slashlib.hapi')]) {
      const j = await jfetch('https://' + api + '/api/manga?site_id[]=2&page=1&limit=10', c.sl);
      ((j && j.data) || []).forEach(it => { const u = it.cover && (it.cover.default || it.cover.thumbnail); if (u) hosts.add(hostOf(u)); });
    }
    const tried = [], good = [];
    await pool(Array.from(hosts).filter(Boolean), 4, async h => {
      const r = await imgCheck(swapHost(s.cover, h), c.slImg);
      tried.push({ host: h, code: r.code, ok: !!r.ok });
      if (r.ok) good.push({ h: h, ms: r.code && 0 });
    });
    good.map(g => g.h).reverse().forEach(h => add('slashlib.cover', h));
    return { ok: !!good.length, added: good.map(g => g.h), tried: tried };
  }
  async function refreshSlImg() {
    const s = await slSample(true);
    if (!s || !s.path) return { ok: false, note: 'не удалось получить путь кадра' };
    const sniff = (await sniffSite(current('slashlib.main'))).filter(h => /^img/.test(h));
    const cands = Array.from(new Set([].concat(all('slashlib.img'), sniff, imgGrid())));
    const c = CTX(), tried = [], good = [];
    await pool(cands, 4, async h => {
      const t0 = now();
      const r = await imgCheck('https://' + h + '/' + s.path, c.slImg);
      tried.push({ host: h, code: r.code, ok: !!r.ok, ms: now() - t0 });
      if (r.ok) good.push({ h: h, ms: now() - t0 });
    });
    good.sort((a, b) => b.ms - a.ms);
    good.forEach(g => add('slashlib.img', g.h));
    return { ok: !!good.length, added: good.map(g => g.h).reverse(), tried: tried };
  }
  async function refreshCzApi() {
    const main = current('comizy.main');
    const sniff = (await sniffSite(main)).filter(h => /^api\./.test(h));
    const cands = Array.from(new Set([].concat(all('comizy.api'), ['api.comizy.io', 'api.' + main], sniff)));
    const hid = (DB.probe.cz || {}).hid || 'ZjoGX6jQ';
    const tried = [], good = [];
    await pool(cands, 4, async h => {
      const r = await nget('https://' + h + '/titles/' + hid + '/chapters', { Accept: 'application/json' }, 12000);
      const ok = okCode(r.code);
      tried.push({ host: h, code: r.code, ok: ok });
      if (ok) good.push(h);
    });
    good.reverse().forEach(h => add('comizy.api', h));
    return { ok: !!good.length, added: good, tried: tried };
  }
  async function refreshCzHosts() {
    const CP = (typeof ComizyParser !== 'undefined') ? ComizyParser : null;
    if (!CP) return { ok: false, note: 'ComizyParser недоступен' };
    const tried = [], added = [];
    let list = [];
    try { list = await TO(CP.search('наруто'), 25000); } catch (e) {}
    const m = list && list[0];
    if (!m) return { ok: false, note: 'поиск Comizy пуст' };
    DB.probe.cz = DB.probe.cz || {}; DB.probe.cz.hid = m.hid;
    if (m.cover) {
      const h = hostOf(m.cover);
      const r = await imgCheck(m.cover, CTX().cz);
      tried.push({ host: h, code: r.code, ok: !!r.ok });
      if (r.ok) { add('comizy.cover', h); added.push(h); }
    }
    let chs = [];
    try { chs = await TO(CP.getChapters(m.hid, { keepChapter0: true }), 25000); } catch (e) {}
    const ch = chs && chs[0];
    if (!ch) { save(); return { ok: !!added.length, added: added, tried: tried, note: 'главы не пришли' }; }
    let pages = [];
    try { pages = await TO(CP.getChapterPages(m.slug, ch.slug), 25000); } catch (e) {}
    const p0 = pages && pages[0];
    if (p0 && p0.url) {
      DB.probe.cz.img = p0.url; DB.probe.cz.t = now();
      const r = await imgCheck(p0.url, CTX().cz);
      tried.push({ host: hostOf(p0.url), code: r.code, ok: !!r.ok });
      if (r.ok) { add('comizy.img', hostOf(p0.url)); added.push(hostOf(p0.url)); }
    }
    const html = await nget('https://' + current('comizy.main') + '/' + m.slug + '/' + ch.slug, { Accept: 'text/html', 'User-Agent': UA }, 20000);
    const txt = typeof html.data === 'string' ? html.data : JSON.stringify(html.data || '');
    const pool2 = Array.from(new Set((txt.replace(/\\\//g, '/').match(/x\d+\.cmzcdn\.org/gi) || []).map(s => s.toLowerCase())));
    pool2.filter(h => h !== hostOf((DB.probe.cz || {}).img || '')).reverse().forEach(h => { add('comizy.img', h); added.push(h); });
    save();
    return { ok: !!added.length, added: added, tried: tried };
  }
  async function refreshDzCdn() {
    const main = current('dorama.main');
    const r = await nget('https://' + main + '/search?q=' + encodeURIComponent('дорама'), { Accept: 'text/html', 'User-Agent': UA }, 18000);
    const txt = (typeof r.data === 'string' ? r.data : JSON.stringify(r.data || '')).replace(/\\\//g, '/');
    const urls = txt.match(/https?:\/\/\d+\.doramaland\.center\/[^\s"'<>\\)]+/gi) || [];
    const hosts = Array.from(new Set(urls.map(hostOf).filter(Boolean)));
    const tried = [], good = [];
    if (urls.length) { DB.probe.dz = { img: urls[0], t: now() }; save(); }
    await pool(hosts, 3, async h => {
      const res = await imgCheck(swapHost(urls[0], h), { Referer: 'https://' + main + '/' });
      tried.push({ host: h, code: res.code, ok: !!res.ok });
      if (res.ok) good.push(h);
    });
    good.reverse().forEach(h => add('dorama.cdn', h));
    return { ok: !!good.length, added: good, tried: tried, note: urls.length ? '' : 'картинки в разметке не найдены' };
  }
  const AUTO = { slapi: refreshSlApi, slcover: refreshSlCover, slimg: refreshSlImg, czapi: refreshCzApi, czhosts: refreshCzHosts, dzcdn: refreshDzCdn };
  async function refresh(key) {
    patch();
    const f = BY_KEY[key];
    if (!f || !f.auto) return { ok: false, note: 'поле только ручное' };
    try { return await AUTO[f.auto](key); }
    catch (e) { return { ok: false, note: String((e && e.message) || e) }; }
  }

  /* ---------- прочее для меню ---------- */
  async function slashlibAccount() {
    const t = localStorage.getItem('slashlib_token') || '';
    const out = { hasToken: !!t, daysLeft: null, expISO: null, username: '', guest: null };
    const p = t.split('.');
    if (p.length === 3) {
      try {
        let b = p[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b.length % 4) b += '=';
        const j = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b), c => c.charCodeAt(0))));
        if (j.exp) { out.expISO = new Date(j.exp * 1000).toISOString(); out.daysLeft = Math.floor((j.exp * 1000 - now()) / 86400000); }
      } catch (e) {}
    }
    if (t) {
      const j = await jfetch('https://' + current('slashlib.api') + '/api/user', CTX().sl);
      const u = j && j.data && (Array.isArray(j.data) ? j.data[0] : j.data);
      if (u && u.username) { out.username = String(u.username); out.guest = false; }
      else out.guest = true;
    }
    return out;
  }
  function exportJSON() { return JSON.stringify(DB); }
  function importJSON(text) {
    const p = JSON.parse(text);
    if (!p || !p.fields) throw new Error('Не похоже на базу доменов');
    DB = p; DB.probe = Object.assign({}, PROBE_SEED, DB.probe || {});
    FIELDS.forEach(f => { if (!DB.fields[f.key]) DB.fields[f.key] = { seq: 0, rows: [] }; });
    save(); return true;
  }

  /* ==========================================================
     DomainsCloud — синхронизация доменов с Supabase
     ========================================================== */
  const DomainsCloud = {
    TABLE: 'polka_domains_global',
    FUNC: 'polka_domains_upsert',
    LAST_PULL: 0,
    PULL_INTERVAL: 5 * 60 * 1000,

    _sb() {
      return (typeof window.sb !== 'undefined') ? window.sb : null;
    },

    _isAdmin() {
      try {
        const c = JSON.parse(localStorage.getItem('polka_cloud') || '{}');
        return c.admin === true;
      } catch (e) { return false; }
    },

    async pull() {
      const sb = this._sb();
      if (!sb) { console.log('[DomainsCloud] Supabase недоступен'); return false; }
      try {
        const { data, error } = await sb
          .from(this.TABLE)
          .select('field_key, host, seq, t')
          .order('seq', { ascending: false });
        if (error) { console.warn('[DomainsCloud] pull error:', error.message); return false; }
        if (!Array.isArray(data)) return false;

        const groups = {};
        data.forEach(row => {
          if (!groups[row.field_key]) groups[row.field_key] = [];
          groups[row.field_key].push(row);
        });

        let added = 0;
        for (const key in groups) {
          const rows = groups[key].sort((a, b) => b.seq - a.seq);
          rows.forEach(row => {
            const n = addRaw(key, row.host);
            if (n > 0) added++;
          });
        }
        if (added > 0) save();
        this.LAST_PULL = Date.now();
        console.log('[DomainsCloud] pull: ' + data.length + ' строк, добавлено ' + added);
        return true;
      } catch (e) {
        console.warn('[DomainsCloud] pull exception:', e.message);
        return false;
      }
    },

    async pushOne(fieldKey, host, seq) {
      if (!this._isAdmin()) return false;
      const sb = this._sb();
      if (!sb) return false;
      try {
        const { error } = await sb.rpc(this.FUNC, {
          p_field_key: fieldKey,
          p_host: host,
          p_seq: seq,
          p_t: new Date().toISOString()
        });
        if (error) {
          console.warn('[DomainsCloud] push error:', error.message);
          return false;
        }
        console.log('[DomainsCloud] pushed:', fieldKey, host, '#' + seq);
        return true;
      } catch (e) {
        console.warn('[DomainsCloud] push exception:', e.message);
        return false;
      }
    },

    async pushAll() {
      if (!this._isAdmin()) return { ok: false, note: 'не админ' };
      const sb = this._sb();
      if (!sb) return { ok: false, note: 'Supabase недоступен' };
      let pushed = 0, errors = 0;
      for (const key in DB.fields) {
        const rows = DB.fields[key].rows || [];
        for (const row of rows) {
          const ok = await this.pushOne(key, row.h, row.n);
          if (ok) pushed++;
          else errors++;
          await sleep(50);
        }
      }
      return { ok: errors === 0, pushed, errors, note: errors ? errors + ' ошибок' : '' };
    },

    startPeriodic() {
      if (this._periodic) return;
      this._periodic = setInterval(() => { this.pull(); }, this.PULL_INTERVAL);
      console.log('[DomainsCloud] periodic pull started');
    },

    syncIfStale() {
      if (Date.now() - this.LAST_PULL > this.PULL_INTERVAL) this.pull();
    }
  };

  loadDB();
  patch();
  if (!PATCHED) document.addEventListener('DOMContentLoaded', patch);

  // Pull из Supabase при старте (отложенно, чтобы не тормозить загрузку)
  setTimeout(() => { DomainsCloud.pull(); }, 3000);

  window.PolkaDomains = {
    FIELDS: FIELDS, GROUPS: GROUPS, BY_KEY: BY_KEY, LAST: LAST,
    rows: rows, all: all, current: current, add: add, remove: remove,
    check: check, checkAll: checkAll, refresh: refresh,
    rewrite: rewriteOnce, patch: patch, unpatch: unpatch,
    slashlibAccount: slashlibAccount, sample: slSample,
    exportJSON: exportJSON, importJSON: importJSON,
    db: () => DB,
    DomainsCloud: DomainsCloud
  };
  window.DomainsCloud = DomainsCloud;
  console.log('[domains] готов, полей:', FIELDS.length, '| патч сети:', PATCHED);
})();