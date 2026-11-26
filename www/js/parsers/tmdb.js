'use strict';
/* ==========================================================
   tmdb.js — TMDB: поиск, детали, постеры, окно поиска
   ========================================================== */

const TMDB_KEY = '96f6dc5b4b470e00a8f40ccdf42d6fa8';
const TMDB_IMG = 'https://image.tmdb.org/t/p';
const TMDB_PROXY = 'https://polka-proxy.foress-tfiree.workers.dev/?url=';

const TMDB_COUNTRIES_RU = {
  'China': 'Китай',
  'Hong Kong': 'Гонконг',
  'Taiwan': 'Тайвань',
  'South Korea': 'Южная Корея',
  'Korea': 'Корея',
  'Japan': 'Япония',
  'Thailand': 'Таиланд',
  'Vietnam': 'Вьетнам',
  'Philippines': 'Филиппины',
  'Indonesia': 'Индонезия',
  'Malaysia': 'Малайзия',
  'Singapore': 'Сингапур',
  'India': 'Индия',
  'United States of America': 'США',
  'USA': 'США',
  'United Kingdom': 'Великобритания',
  'France': 'Франция',
  'Germany': 'Германия',
  'Italy': 'Италия',
  'Spain': 'Испания',
  'Poland': 'Польша',
  'Russia': 'Россия',
  'Soviet Union': 'СССР',
  'Ukraine': 'Украина',
  'Belarus': 'Беларусь',
  'Kazakhstan': 'Казахстан',
  'Canada': 'Канада',
  'Australia': 'Австралия',
  'New Zealand': 'Новая Зеландия',
  'Brazil': 'Бразилия',
  'Mexico': 'Мексика',
  'Argentina': 'Аргентина',
  'Turkey': 'Турция',
  'Israel': 'Израиль',
  'Egypt': 'Египет',
  'South Africa': 'ЮАР',
  'Netherlands': 'Нидерланды',
  'Belgium': 'Бельгия',
  'Sweden': 'Швеция',
  'Norway': 'Норвегия',
  'Denmark': 'Дания',
  'Finland': 'Финляндия',
  'Ireland': 'Ирландия',
  'Portugal': 'Португалия',
  'Greece': 'Греция',
  'Czech Republic': 'Чехия',
  'Czechia': 'Чехия',
  'Hungary': 'Венгрия',
  'Romania': 'Румыния',
  'Bulgaria': 'Болгария',
  'Austria': 'Австрия',
  'Switzerland': 'Швейцария'
};

function countryRu(name) {
  if (!name) return '';
  return TMDB_COUNTRIES_RU[name] || name;
}

// Все запросы к TMDB — только через прокси: прямой fetch в WebView отваливается мгновенно
function tmdbProxy(url) {
  return TMDB_PROXY + encodeURIComponent(url);
}

/* ============ ПОСТЕРЫ ============ */

// Длинный список include_image_language TMDB не переваривает и отдаёт пустой posters.
// Рабочий вариант — короткие группы (по 5 языков), их и добираем ниже.
async function fetchAllTmdbPosters(id, type, baseLang, mainPath) {
  const groups = [
    [...new Set([baseLang, 'en', 'ko', 'ja', 'zh'].filter(Boolean))].join(','),
    'th,vi,id,ms,tl',
    'fr,de,es,it,pt',
    'ru,pl,tr,ar,hi'
  ];
  const map = new Map();
  for (const langs of groups) {
    const url = 'https://api.themoviedb.org/3/' + type + '/' + id + '/images'
      + '?api_key=' + TMDB_KEY
      + '&include_image_language=' + langs + ',null';
    try {
      const r = await fetch(tmdbProxy(url));
      if (!r.ok) continue;
      const data = await r.json();
      (data.posters || []).forEach(p => {
        if (p && p.file_path && !map.has(p.file_path)) map.set(p.file_path, p);
      });
    } catch (e) {
      console.warn('[TMDB] группа языков не пришла:', langs, e.message);
    }
  }

  const orig = (baseLang || '').split('-')[0];
  const rankOf = p => {
    if (mainPath && p.file_path === mainPath) return -1;
    const l = p.iso_639_1 || '';
    if (orig && l === orig) return 0;
    if (l === 'ru') return 1;
    if (l === 'en') return 2;
    if (!l) return 3;
    return 4;
  };

  return Array.from(map.values())
    .sort((a, b) => {
      const ra = rankOf(a), rb = rankOf(b);
      if (ra !== rb) return ra - rb;
      return (b.vote_average || 0) - (a.vote_average || 0);
    })
    .map(p => TMDB_IMG + '/w780' + p.file_path);
}

// Запасной вариант: постеры из уже загруженных деталей (оригинал -> ru -> en -> остальные)
function extractTmdbPosters(d) {
  if (!d) return [];
  const origLang = d.original_language || '';
  const scores = { 'ru': 1, 'en': 2 };
  if (origLang) scores[origLang] = 0;

  const list = [];
  if (d.poster_path) list.push({ path: d.poster_path, score: -1 });

  if (d.images && Array.isArray(d.images.posters)) {
    d.images.posters.forEach(p => {
      if (p && p.file_path && p.file_path !== d.poster_path) {
        const lang = p.iso_639_1 || '';
        list.push({ path: p.file_path, score: (scores[lang] !== undefined ? scores[lang] : 99) });
      }
    });
  }

  list.sort((a, b) => a.score - b.score);
  const seen = new Set();
  const result = [];
  for (const p of list) {
    if (seen.has(p.path)) continue;
    seen.add(p.path);
    result.push(TMDB_IMG + '/w780' + p.path);
  }
  return result;
}

/* ============ ПОИСК И ДЕТАЛИ ============ */

async function tmdbSearch(query) {
  const url = 'https://api.themoviedb.org/3/search/multi'
    + '?api_key=' + TMDB_KEY
    + '&language=ru-RU'
    + '&query=' + encodeURIComponent(query)
    + '&include_adult=false';
  const r = await fetch(tmdbProxy(url));
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const data = await r.json();
  return (data.results || []).filter(x => x.media_type === 'movie' || x.media_type === 'tv');
}

async function tmdbDetails(id, type) {
  const url = 'https://api.themoviedb.org/3/' + type + '/' + id
    + '?api_key=' + TMDB_KEY
    + '&language=ru-RU'
    + '&append_to_response=alternative_titles,translations,keywords,images,external_ids'
    + '&include_image_language=ru,en,null';
  const r = await fetch(tmdbProxy(url));
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* ============ ОКНО ПОИСКА ============ */

function openTmdbModal() {
  const modal = document.getElementById('tmdbModal');
  const input = document.getElementById('tmdbQuery');
  const results = document.getElementById('tmdbResults');
  if (!modal) return;
  input.value = '';
  results.innerHTML = '<div class="tmdb-status">Введи название и нажми Enter</div>';
  modal.classList.add('on');
  setTimeout(() => input.focus(), 60);
}

function closeTmdbModal() {
  const modal = document.getElementById('tmdbModal');
  if (modal) modal.classList.remove('on');
}

async function runTmdbSearch() {
  const input = document.getElementById('tmdbQuery');
  const results = document.getElementById('tmdbResults');
  const q = input.value.trim();
  if (!q) { results.innerHTML = '<div class="tmdb-status">Введи название</div>'; return; }
  results.innerHTML = '<div class="tmdb-status">Ищу…</div>';
  try {
    const list = await tmdbSearch(q);
    if (!list.length) {
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
      return;
    }
    results.innerHTML = list.slice(0, 15).map(r => {
      const title = r.title || r.name || r.original_title || r.original_name || '—';
      const orig = r.original_title || r.original_name || '';
      const date = r.release_date || r.first_air_date || '';
      const year = date ? date.substring(0, 4) : '';
      const poster = r.poster_path ? (TMDB_IMG + '/w92' + r.poster_path) : '';
      const typeLabel = r.media_type === 'movie' ? 'Фильм' : 'Сериал';
      return '<div class="tmdb-result" data-id="' + r.id + '" data-type="' + r.media_type + '">'
        + '<div class="tmdb-result-poster">'
        + (poster ? '<img src="' + esc(poster) + '" alt="">' : SVG_ICONS.movie)
        + '</div>'
        + '<div class="tmdb-result-info">'
        + '<div class="tmdb-result-title">' + esc(title)
        + ' <span class="tmdb-result-type">' + typeLabel + '</span></div>'
        + '<div class="tmdb-result-meta">' + esc(orig) + (year ? ' · ' + year : '') + '</div>'
        + '</div>'
        + '</div>';
    }).join('');
    results.querySelectorAll('.tmdb-result').forEach(el => {
      el.onclick = () => pickTmdbResult(el.dataset.id, el.dataset.type);
    });
  } catch (e) {
    results.innerHTML = '<div class="tmdb-status">Ошибка: ' + esc(e.message) + '</div>';
  }
}

async function pickTmdbResult(id, type) {
  const results = document.getElementById('tmdbResults');
  results.innerHTML = '<div class="tmdb-status">Загружаю данные…</div>';
  try {
    const d = await tmdbDetails(id, type);
    await applyTmdbData(d, type);
    closeTmdbModal();
    toast('Заполнено');
  } catch (e) {
    results.innerHTML = '<div class="tmdb-status">Ошибка: ' + esc(e.message) + '</div>';
  }
}

async function applyTmdbData(d, type) {
  const panel = document.getElementById('panel');
  if (!panel) return;
  const draft = window._currentDraft || null;
  const setVal = (id, val) => {
    const el = panel.querySelector('#' + id);
    if (el && val !== undefined && val !== null) el.value = val;
  };

  const ruTitle = d.title || d.name || '';
  const enTitle = tmdbEnTitle(d, []);
  const date = d.release_date || d.first_air_date || '';
  const year = date ? date.substring(0, 4) : '';
  const poster = d.poster_path ? (TMDB_IMG + '/w780' + d.poster_path) : '';
  const overview = d.overview || '';
  const countries = (d.production_countries || []).map(c => c.name).filter(Boolean);
  const country = countries.length ? countryRu(countries[0]) : '';
  const genres = (d.genres || []).map(g => g.name).filter(Boolean);
  const imdbId = (d.external_ids && d.external_ids.imdb_id) || '';

  setVal('f_title', ruTitle);
  setVal('f_title_en', enTitle);
  setVal('f_year', year);
  setVal('f_country', country);
  setVal('f_description', overview);
  setVal('f_cover', poster);
  setVal('f_tags', genres.join(', '));
  setCoverPreview(poster);

  let altPosters = [];
  try {
    const baseLang = (d.original_language || 'en').split('-')[0];
    altPosters = await fetchAllTmdbPosters(d.id, type, baseLang, d.poster_path);
  } catch (e) {
    altPosters = extractTmdbPosters(d);
  }
  if (!altPosters.length) altPosters = extractTmdbPosters(d);

  const altWrap = panel.querySelector('#altCoversWrap');
  if (altWrap) {
    if (altPosters.length) {
      altWrap.innerHTML = altPosters.map(url =>
        `<div class="alt-cover-thumb ${poster === url ? 'active' : ''}" data-url="${url}"><img src="${url}" loading="lazy" alt=""></div>`
      ).join('');
      altWrap.onclick = (e) => {
        const thumb = e.target.closest('.alt-cover-thumb');
        if (!thumb) return;
        const url = thumb.dataset.url;
        const hiddenCover = panel.querySelector('#f_cover');
        if (hiddenCover) hiddenCover.value = url;
        if (draft) { draft.cover = url; draft.customCover = true; }
        setCoverPreview(url);
        altWrap.querySelectorAll('.alt-cover-thumb').forEach(t => t.classList.toggle('active', t.dataset.url === url));
      };
    } else {
      altWrap.innerHTML = '';
    }
  }

  const kwBlock = d.keywords || {};
  const kwList = kwBlock.results || kwBlock.keywords || [];
  const isBl = kwList.some(k => k.name === "boys' love (bl)" || k.name === "boys' love" || k.name === "bl" || k.id === 289844);
  if (isBl) {
    const segBl = panel.querySelector('#f_bl');
    if (segBl) {
      const blBtn = segBl.querySelector('button[data-v="yes"]');
      const noBtn = segBl.querySelector('button[data-v="no"]');
      if (blBtn && noBtn) { blBtn.classList.add('on'); noBtn.classList.remove('on'); }
    }
  }

  let newType = 'movie';
  if (type === 'tv') {
    const lang = d.original_language || '';
    newType = (['zh', 'ko', 'ja', 'th', 'cn', 'tw', 'hk'].indexOf(lang) >= 0) ? 'drama' : 'series';
  }
  const segType = panel.querySelector('#f_type');
  if (segType) {
    const btn = segType.querySelector('button[data-v="' + newType + '"]');
    if (btn) {
      segType.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      btn.classList.add('on');
    }
  }

  if (draft) {
    draft.title = ruTitle;
    draft.title_en = enTitle;
    draft.year = year;
    draft.country = country;
    draft.description = overview;
    draft.cover = poster;
    draft.tags = genres;
    draft.type = newType;
    draft.bl = isBl;
    draft.altCovers = altPosters;
    draft.customCover = false;
    draft.imdbId = imdbId;
    draft.tmdbId = d.id;
  }

  // ===== АВТОПОИСК ССЫЛОК =====
  try {
    if (newType === 'movie' || newType === 'series') {
      toast('Ищу озвучку на Kinogo...', 'success');
      const kinoLink = await autoSearchKinogo(ruTitle, enTitle, year);
      if (kinoLink) {
        setVal('f_link', kinoLink);
        if (draft) draft.link = kinoLink;
      }
    }
  } catch (e) { console.warn('Kinogo error', e); }

  try {
    if (enTitle) {
      toast('Ищу оригинал на 123movies...', 'success');
      await autoSearch123Movies(enTitle, year, panel, draft);
    }
  } catch (e) { console.warn('123movies error', e); }

  const searchName = enTitle || ruTitle;
  if (newType === 'movie') {
    try {
      if (searchName && year) {
        toast('Ищу ссылки на YTS...', 'success');
        const ytsResult = await autoSearchYTS(searchName, year, panel, draft);
        if (!ytsResult) await autoSearchTorrentClaw(searchName, year, panel, draft, false);
      }
    } catch (e) { console.warn('YTS/TorrentClaw error', e); }
  } else {
    try {
      if (searchName) {
        toast('Ищу ссылки на EZTV...', 'success');
        await autoSearchEZTV(imdbId, searchName, panel, draft);
      }
    } catch (e) { console.warn('EZTV error', e); }
  }
}

document.getElementById('tmdbClose').onclick = () => closeTmdbModal();
document.getElementById('tmdbModal').onclick = (e) => {
  if (e.target.id === 'tmdbModal') closeTmdbModal();
};
document.getElementById('tmdbQuery').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); runTmdbSearch(); }
});