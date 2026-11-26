'use strict';
/* ==========================================================
   dorama.js — Dorama.land (+ Kisskh, поиск соответствий в TMDB)
   ========================================================== */

const TMDB_COUNTRY_TO_LANG = {
  'Тайвань': 'zh', 'Китай': 'zh', 'Гонконг': 'zh', 'Корея': 'ko',
  'Южная Корея': 'ko', 'Япония': 'ja', 'Таиланд': 'th', 'Филиппины': 'tl',
  'Вьетнам': 'vi', 'Индонезия': 'id', 'Малайзия': 'ms'
};

const NOISE_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'at', 'by', 'for', 'with',
  'series', 'season', 'part', 'chapter', 'episode', 'special', 'theseries',
  'la', 'forte', 'complete', 'uncut', 'extended', 'version'
]);

const DORAMA_CJK = /[\u3000-\u9fff\uac00-\ud7af]/;

function cleanDoramaText(s) {
  if (!s) return '';
  return String(s).replace(/\u00A0/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim();
}

function normalizeProjectStatus(txt) {
  if (!txt) return '';
  const t = txt.toLowerCase().trim();
  if (t.includes('завершен') || t.includes('закончен')) return 'completed';
  if (t.includes('выходит') || t.includes('онгоинг') || t.includes('сейчас')) return 'ongoing';
  if (t.includes('анонс') || t.includes('ожидается') || t.includes('скоро')) return 'announced';
  return 'unknown';
}

function toRoman(num) {
  const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
    'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
  return roman[num] || String(num);
}

function normDoramaTitle(s) {
  return String(s || '').toLowerCase()
    .replace(/(\d{4})/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeDorama(s) {
  return normDoramaTitle(s).split(' ').filter(w => w && !NOISE_WORDS.has(w) && w.length > 1);
}

function tokenMatchDorama(a, b) {
  const ta = tokenizeDorama(a);
  const tb = tokenizeDorama(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  let hits = 0;
  for (const t of ta) { if (setB.has(t)) hits++; }
  return hits / Math.max(ta.length, tb.length);
}

// Ключ для сравнения названий: без пунктуации, регистра и пробелов-разнобоя
function doramaKey(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/* ============ ГОД СО СТРАНИЦЫ ============
   meta[itemprop="dateCreated"] на Dorama.land теперь содержит дату ГЕНЕРАЦИИ страницы
   (вида 2026-09-18T13:23:10). Такой штамп — не год сериала, его игнорируем. */
function doramaYearFromDoc(doc, rawTitle) {
  if (!doc) return '';
  const now = new Date().getFullYear();
  const ok = y => {
    const n = parseInt(y, 10);
    return n >= 1900 && n <= now + 5 ? String(n) : '';
  };

  const bodyText = (doc.body && doc.body.textContent) || '';
  let m = bodyText.match(/Год[:\s]*(\d{4})/i) || bodyText.match(/(\d{4})\s*год/i);
  if (m) { const y = ok(m[1]); if (y) return y; }

  const og = doc.querySelector('meta[property="og:title"]');
  if (og) {
    m = (og.getAttribute('content') || '').match(/(\d{4})/);
    if (m) { const y = ok(m[1]); if (y) return y; }
  }

  const h2 = doc.querySelector('h2.about-serial-header__title, h1');
  if (h2) {
    m = cleanDoramaText(h2.textContent).match(/(\d{4})/);
    if (m) { const y = ok(m[1]); if (y) return y; }
  }

  if (rawTitle) {
    m = String(rawTitle).match(/(\d{4})/);
    if (m) { const y = ok(m[1]); if (y) return y; }
  }

  const dateEl = doc.querySelector('meta[itemprop="dateCreated"]');
  if (dateEl) {
    const txt = cleanDoramaText(dateEl.textContent || '');
    const attr = (dateEl.getAttribute('content') || '').trim();
    if (txt) { m = txt.match(/(\d{4})/); if (m) { const y = ok(m[1]); if (y) return y; } }
    if (attr && !/T\d{2}:\d{2}/.test(attr)) {
      m = attr.match(/(\d{4})/);
      if (m) { const y = ok(m[1]); if (y) return y; }
    }
  }
  return '';
}

// Год страницы сезона: тот же порядок + meta[name]/og:title, штамп генерации не берём
function doramaSeasonYear(sDoc) {
  let y = doramaYearFromDoc(sDoc);
  if (y) return y;
  const names = [
    sDoc.querySelector('meta[itemprop="name"]'),
    sDoc.querySelector('meta[property="og:title"]')
  ];
  for (const el of names) {
    if (!el) continue;
    const m = (el.getAttribute('content') || '').match(/(\d{4})/);
    if (m) {
      const n = parseInt(m[1], 10);
      const now = new Date().getFullYear();
      if (n >= 1900 && n <= now + 5) return String(n);
    }
  }
  return '';
}

/* ============ АНГЛИЙСКОЕ НАЗВАНИЕ ИЗ TMDB ============
   Берём не «первый US-альт», а тот, что совпадает с названиями сайта.
   Иначе у 吾岸 прилетало «City of the Sun» вместо «To My Shore». */
function tmdbEnTitle(d, siteNames) {
  if (!d) return '';
  const block = d.alternative_titles || {};
  const list = block.titles || block.results || [];
  const siteKeys = (siteNames || []).map(doramaKey).filter(Boolean);

  const cands = [];
  list.forEach(x => {
    if (x.iso_3166_1 !== 'US' && x.iso_3166_1 !== 'GB') return;
    const t = cleanDoramaText(x.title || x.name || '');
    if (t.length < 3) return;
    const low = t.toLowerCase();
    if (low.includes('season')) return;
    if (/\d+$/.test(low)) return;
    if (/\s[2-9]$/.test(low)) return;

    const k = doramaKey(t);
    let score = 0;
    if (siteKeys.includes(k)) score += 100;
    else {
      for (const sn of (siteNames || [])) {
        const tm = tokenMatchDorama(t, sn);
        if (tm > 0.5) { score += 40 + tm * 20; break; }
      }
    }
    if (x.iso_3166_1 === 'US') score += 3;
    score += Math.min(t.length, 40) / 40;
    cands.push({ t, score });
  });
  cands.sort((a, b) => b.score - a.score);
  if (cands.length && cands[0].score >= 40) return cands[0].t;

  const tr = ((d.translations && d.translations.translations) || []).find(t => t.iso_639_1 === 'en' && t.data);
  if (tr && tr.data) {
    const t = cleanDoramaText(tr.data.title || tr.data.name || '');
    if (t) return t;
  }
  if (cands.length) return cands[0].t;
  return d.original_title || d.original_name || '';
}

/* ============ TMDB: ПОИСК СЕРИАЛОВ ============ */

async function tmdbSearchTvOnly(query) {
  try {
    const url = 'https://api.themoviedb.org/3/search/tv?api_key=' + TMDB_KEY
      + '&language=ru-RU&query=' + encodeURIComponent(query) + '&include_adult=false';
    const r = await fetch(tmdbProxy(url));
    if (!r.ok) return [];
    const text = await r.text();
    const data = JSON.parse(text);
    return (data.results || []).map(item => Object.assign({}, item, { media_type: 'tv' }));
  } catch (e) {
    console.warn('[TMDB] Ошибка TV:', e.message);
    return [];
  }
}

async function tmdbDetailsDorama(id, type) {
  try {
    const url = 'https://api.themoviedb.org/3/' + type + '/' + id
      + '?api_key=' + TMDB_KEY
      + '&language=ru-RU'
      + '&append_to_response=alternative_titles,translations,images,external_ids'
      + '&include_image_language=ru,en,null';
    const r = await fetch(tmdbProxy(url));
    if (!r.ok) return null;
    const text = await r.text();
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function rankTmdbResults(results, targetYear) {
  const ty = parseInt(targetYear) || 0;
  return results.slice().sort((a, b) => {
    if (ty) {
      const ya = parseInt((a.first_air_date || a.release_date || '').substring(0, 4)) || 0;
      const yb = parseInt((b.first_air_date || b.release_date || '').substring(0, 4)) || 0;
      const da = ya ? Math.abs(ya - ty) : 999;
      const db = yb ? Math.abs(yb - ty) : 999;
      if (da !== db) return da - db;
    }
    if (a.media_type === 'tv' && b.media_type !== 'tv') return -1;
    if (b.media_type === 'tv' && a.media_type !== 'tv') return 1;
    return 0;
  });
}

/* ============ ГЛАВНЫЙ МАТЧ С TMDB ============
   Похожесть названий + год + язык + позиция в выдаче + сохранённый id.
   Год — мягкий сигнал: кривой год с сайта больше не утаскивает на чужой сериал.
   Если сравнить названия нечем (нет оригинала, у TMDB нет русского перевода) —
   решают год, язык и позиция, а не только похожесть. */
async function findInTmdbDorama(site) {
  site = site || {};
  const draft = window._currentDraft || null;
  const sameCard = !!(draft && doramaKey(draft.title) === doramaKey(site.title));

  let ty = parseInt(site.year) || 0;
  if (sameCard && parseInt(draft.year) && parseInt(draft.year) !== ty) {
    console.log('[Dorama→TMDB] год из карточки:', ty, '→', parseInt(draft.year));
    ty = parseInt(draft.year);
  }

  const langCode = TMDB_COUNTRY_TO_LANG[site.country] || '';
  const names = [];
  const pushN = n => {
    const c = cleanDoramaText(n);
    if (c && c.length > 1 && !names.some(x => doramaKey(x) === doramaKey(c))) names.push(c);
  };
  pushN(site.titleOrig);
  (site.altTitles || []).forEach(pushN);
  pushN(site.title);

  const origKey = doramaKey(site.titleOrig);
  const origIsCJK = DORAMA_CJK.test(site.titleOrig || '');
  const savedId = parseInt(site.tmdbId) || (sameCard ? parseInt(draft.tmdbId) || 0 : 0);

  const titleScore = it => {
    const cands = [it.original_name, it.name, it.original_title, it.title].filter(Boolean);
    let best = 0, how = '';
    for (const c of cands) {
      const cn = doramaKey(c);
      if (!cn) continue;
      for (const n of names) {
        const nn = doramaKey(n);
        if (!nn) continue;
        let s = 0;
        if (cn === nn) s = 100;
        else if (DORAMA_CJK.test(cn) || DORAMA_CJK.test(nn)) s = cn.includes(nn) ? 25 : 0;
        else {
          s = tokenMatchDorama(c, n) * 85;
          if (s < 55 && (cn.includes(nn) || nn.includes(cn))) s = Math.max(s, 55);
        }
        if (s > best) { best = s; how = c + ' ↔ ' + n; }
      }
    }
    return { best, how };
  };

  const scoreOf = (it, qIdx, rank, isSaved) => {
    const t = titleScore(it);
    const iy = parseInt((it.first_air_date || it.release_date || '').substring(0, 4)) || 0;
    const diff = (ty && iy) ? Math.abs(iy - ty) : -1;
    let sc = t.best;
    if (diff === 0) sc += 18;
    else if (diff === 1) sc += 6;
    else if (diff === 2) sc += 0;
    else if (diff > 2) sc -= Math.min(diff * 4, 30);
    else sc -= 4;
    if (langCode) sc += (it.original_language === langCode) ? 8 : -6;
    sc += it.poster_path ? 2 : -4;
    if (qIdx >= 0) sc += Math.max(0, 20 - qIdx * 4 - rank * 2);
    if (isSaved) sc += 20;
    if (origIsCJK && DORAMA_CJK.test(it.original_name || '') && doramaKey(it.original_name) !== origKey) sc -= 15;
    return { sc, title: t.best, how: t.how, iy, diff, langOk: !langCode || it.original_language === langCode };
  };

  console.log('[Dorama→TMDB] вход:', JSON.stringify({
    title: site.title, orig: site.titleOrig, year: ty, country: site.country, alts: site.altTitles, savedId
  }));

  // 1. Сохранённый id — самый надёжный вариант, но проверяем, что это тот же сериал
  if (savedId) {
    const d = await tmdbDetailsDorama(savedId, 'tv');
    if (d && d.id) {
      const s = scoreOf(d, -1, 0, true);
      const ok = s.title >= 60 || (!origIsCJK && s.diff >= 0 && s.diff <= 1 && s.langOk);
      console.log('[Dorama→TMDB] сохранённый id', savedId, '| похожесть', s.title, '| год', s.iy, '→', ok ? 'принят' : 'отклонён');
      if (ok) return { details: d, media_type: 'tv', titleScore: s.title };
    }
  }

  // 2. Поиск: оригинал → латинские альты (длинные первыми) → русское название
  const queries = [];
  const seenQ = new Set();
  const addQ = q => {
    const c = String(q || '').trim();
    if (c && !seenQ.has(c)) { seenQ.add(c); queries.push(c); }
  };
  addQ(site.titleOrig);
  (site.altTitles || [])
    .filter(t => /[a-zA-Z]/.test(t) && t.length > 3)
    .sort((a, b) => b.length - a.length)
    .forEach(addQ);
  addQ(site.title);

  const pool = new Map();
  for (let qi = 0; qi < queries.length; qi++) {
    const res = await tmdbSearchTvOnly(queries[qi]);
    console.log('[Dorama→TMDB] Q' + (qi + 1) + ' "' + queries[qi] + '" →', res.length);
    res.forEach((it, rank) => {
      const prev = pool.get(it.id);
      if (!prev || (qi * 100 + rank) < (prev.qIdx * 100 + prev.rank)) {
        pool.set(it.id, Object.assign({}, it, { qIdx: qi, rank }));
      }
    });
    let stop = false;
    for (const it of pool.values()) {
      const s = scoreOf(it, it.qIdx, it.rank, it.id === savedId);
      if (s.title >= 100 && (s.diff < 0 || s.diff <= 1)) { stop = true; break; }
    }
    if (stop) { console.log('[Dorama→TMDB] точное совпадение названия — стоп'); break; }
  }

  const scored = Array.from(pool.values())
    .map(it => Object.assign({}, it, { __s: scoreOf(it, it.qIdx, it.rank, it.id === savedId) }))
    .sort((a, b) => b.__s.sc - a.__s.sc);

  scored.slice(0, 5).forEach(it => console.log('[Dorama→TMDB]  #' + it.id, it.name,
    '|', (it.first_air_date || '----'), '| назв=' + it.__s.title, '| итог=' + it.__s.sc,
    '| q' + (it.qIdx + 1) + ' поз' + (it.rank + 1), '|', it.__s.how));

  const win = scored.find(it => it.__s.title >= 60 ||
    (it.__s.sc >= 40 && it.__s.diff >= 0 && it.__s.diff <= 1 && it.__s.langOk && it.rank <= 4));
  if (!win) { console.log('[Dorama→TMDB] ничего надёжного — пропускаем'); return null; }

  const details = await tmdbDetailsDorama(win.id, 'tv');
  if (!details) return null;
  console.log('[Dorama→TMDB] ВЫБРАЛ:', details.id, details.name, details.first_air_date);
  return { details, media_type: 'tv', titleScore: win.__s.title };
}

/* ============ KISSKH ============ */

function getKisskhYear(item) {
  if (!item) return 0;
  const mTitle = String(item.title || '').match(/(\d{4})/);
  if (mTitle) return parseInt(mTitle[1]);
  if (item.releaseDate) {
    const mDate = String(item.releaseDate).match(/(\d{4})/);
    if (mDate) return parseInt(mDate[1]);
  }
  return 0;
}

function makeKisskhSlug(title) {
  return String(title || '')
    .replace(/(\d{4})/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function searchKisskhDomain(domain, query) {
  try {
    const url = 'https://' + domain + '/api/DramaList/Search?q=' + encodeURIComponent(query) + '&type=0';
    const res = await nativeFetch(url, {
      'Accept': 'application/json',
      'Referer': 'https://' + domain + '/'
    });
    if (res.status === 200) return await res.json();
    console.warn('[KissKH] Ошибка HTTP:', res.status);
    return null;
  } catch (e) {
    console.error('[KissKH] Сетевая ошибка:', e.message);
    return null;
  }
}

async function findSeasonOnKisskh(names, year, seasonNum, isMultiSeason, targetCountry) {
  if (!names || !names.length) return null;
  const targetYear = parseInt(year) || 0;
  const domain = 'kisskh.do';
  let bestMatch = null;
  let bestScore = -Infinity;

  for (const name of names.slice(0, 3)) {
    if (!name || name.length < 2) continue;
    await new Promise(r => setTimeout(r, 800));
    const results = await searchKisskhDomain(domain, name);
    if (!results || !results.length) continue;

    for (const item of results) {
      const rTitle = item.title || item.name || '';
      const rTitleLower = rTitle.toLowerCase();
      const nameLower = name.toLowerCase();

      if (isMultiSeason) {
        let isTargetSeason = false;
        if (seasonNum === 1) {
          if (rTitleLower.includes('season 2') || rTitleLower.includes('season 3') || /\s2$/.test(rTitleLower)) continue;
          const ts = tokenMatchDorama(rTitle, name);
          if (rTitleLower.includes('season') || ts > 0.8) isTargetSeason = true;
        } else {
          isTargetSeason = rTitleLower.includes('season ' + seasonNum) || rTitleLower.includes(' ' + seasonNum);
        }
        if (!isTargetSeason) continue;
      } else {
        if (seasonNum === 1 && (rTitleLower.includes('season 2') || rTitleLower.includes('season 3'))) continue;
      }

      let tokenScore = tokenMatchDorama(rTitle, name);
      const isStart = rTitleLower.startsWith(nameLower);
      if (isStart) tokenScore = 2.0;
      else if (rTitleLower.includes(nameLower)) tokenScore = 1.0;
      if (tokenScore < 0.7) continue;

      const rYear = getKisskhYear(item);
      if (rYear && targetYear && Math.abs(rYear - targetYear) > 2) continue;

      let score = tokenScore * 100;
      if (isStart) {
        score += name.length;
      } else {
        if (rYear) score -= Math.abs(rYear - targetYear) * 10;
        else score -= 20;
        score += name.length;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { item, rTitle, rYear };
      }
    }
  }

  if (!bestMatch) return null;
  const slug = makeKisskhSlug(bestMatch.rTitle);
  return {
    url: 'https://' + domain + '/Drama/' + (slug || 'watch') + '?id=' + bestMatch.item.id,
    title: bestMatch.rTitle
  };
}

/* ============ ОКНО ПОИСКА DORAMA.LAND ============ */

function openDoramaModal() {
  const modal = document.getElementById('doramaModal');
  const input = document.getElementById('doramaQuery');
  const results = document.getElementById('doramaResults');
  if (!modal) return;
  input.value = '';
  results.innerHTML = '<div class="tmdb-status">Введи название и нажми Enter</div>';
  modal.classList.add('on');
  setTimeout(() => input.focus(), 60);
}

async function runDoramaSearch() {
  const input = document.getElementById('doramaQuery');
  const results = document.getElementById('doramaResults');
  const q = input.value.trim();
  if (!q) { results.innerHTML = '<div class="tmdb-status">Введи название</div>'; return; }
  results.innerHTML = '<div class="tmdb-status">Ищу…</div>';
  try {
    const searchUrl = 'https://dorama.land/search?q=' + encodeURIComponent(q);
    const html = await fetchProxied(searchUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items = doc.querySelectorAll('.search-item');
    if (!items.length) {
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
      return;
    }
    const list = [];
    items.forEach(el => {
      const a = el.querySelector('a.search-item-wrap');
      if (!a) return;
      const titleEl = el.querySelector('.search-item__title');
      const altTitleEl = el.querySelector('.search-item__alternative-title');
      const imgEl = el.querySelector('.search-item-img img');
      const ratingEl = el.querySelector('.search-item__rating span:last-child');
      const genreEl = el.querySelector('.search-item__genre span:last-child');
      let cover = '';
      if (imgEl) {
        cover = imgEl.getAttribute('data-src')
          || (imgEl.getAttribute('srcset') || '').split(' ')[0]
          || imgEl.getAttribute('src');
        if (cover && cover.startsWith('/')) cover = 'https://dorama.land' + cover;
      }
      list.push({
        url: a.getAttribute('href'),
        title: titleEl ? titleEl.textContent.trim() : '',
        title_en: altTitleEl ? altTitleEl.textContent.trim() : '',
        cover,
        rating: ratingEl ? ratingEl.textContent.trim() : '',
        genre: genreEl ? genreEl.textContent.trim() : ''
      });
    });
    window._doramaCache = list;
    results.innerHTML = list.map((r, idx) => `
      <div class="tmdb-result" data-idx="${idx}">
        <div class="tmdb-result-poster">
          ${r.cover ? `<img src="${esc(r.cover)}" alt="">` : SVG_ICONS.movie}
        </div>
        <div class="tmdb-result-info">
          <div class="tmdb-result-title">${esc(r.title)}</div>
          ${r.title_en ? `<div class="tmdb-result-meta">${esc(r.title_en)}</div>` : ''}
          <div class="tmdb-result-meta" style="margin-top:4px; opacity:.8;">
            ${r.rating ? `⭐ ${esc(r.rating)}` : ''}
            ${(r.rating && r.genre) ? '·' : ''}
            ${esc(r.genre)}
          </div>
        </div>
      </div>
    `).join('');
    results.querySelectorAll('.tmdb-result').forEach(el => {
      el.onclick = () => pickDoramaResult(+el.dataset.idx);
    });
  } catch (e) {
    results.innerHTML = '<div class="tmdb-status">Ошибка: ' + esc(e.message) + '</div>';
  }
}

async function fetchDoramaMeta(slug) {
  try {
    const url = 'https://dorama.land/' + slug;
    const res = await nativeFetch(url);
    if (!res.ok) return { raw: '', year: '', seasons: [] };
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    let raw = '';
    const altEl = doc.querySelector('[itemprop="alternativeHeadline"]');
    if (altEl) raw = (altEl.textContent || '').trim();
    if (!raw) {
      const candidates = Array.from(doc.querySelectorAll('.about-serial-header, .about-serial-header__subtitle, .about-serial-header__original-title, h2'));
      for (const el of candidates) {
        const t = (el.textContent || '').trim();
        if (t && /[\/|]/.test(t) && t.length < 400 && !/смотреть|озвучк|сериал|дорама/i.test(t)) { raw = t; break; }
      }
    }
    if (!raw) {
      const spans = doc.querySelectorAll('span.font-light-18');
      for (const sp of spans) {
        const t = (sp.textContent || '').trim();
        if (DORAMA_CJK.test(t)) { raw = t; break; }
      }
    }

    const year = doramaYearFromDoc(doc);

    const seasons = [];
    doc.querySelectorAll('a.serial-seasons__link').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      const text = (a.textContent || '').trim();
      const title = (a.getAttribute('title') || '').trim();
      let num = 0;
      const m = (text + ' ' + title).match(/(\d+)\s*сезон/i);
      if (m) num = parseInt(m[1], 10);
      if (!num) {
        const urlMatch = href.match(/-(\d+)-sezon/i) || href.match(/-(\d+)$/);
        if (urlMatch) num = parseInt(urlMatch[1], 10);
      }
      if (!num) num = 1;
      let fullUrl = href;
      if (!fullUrl.startsWith('http')) fullUrl = 'https://dorama.land' + (href.startsWith('/') ? '' : '/') + href;
      seasons.push({ number: num, url: fullUrl, title: text || title });
    });

    return { raw, year, seasons };
  } catch (e) {
    console.error('[DoramaMeta] Ошибка:', e.message);
    return { raw: '', year: '', seasons: [] };
  }
}

/* ============ ВЫБОР ДОРАМЫ ============ */

async function pickDoramaResult(idx) {
  const list = window._doramaCache || [];
  const r = list[idx];
  if (!r) return;
  const results = document.getElementById('doramaResults');
  results.innerHTML = '<div class="tmdb-status">Открываю карточку дорамы…</div>';

  try {
    const fullUrl = 'https://dorama.land' + r.url;
    const html = await fetchProxied(fullUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // === СЕЗОНЫ ===
    const seasonLinksRaw = [];
    const seenSeasonUrls = new Set();
    const seenSeasonNums = new Set();

    function tryCollectSeasonLink(a, isStrictSeason) {
      const href = a.getAttribute('href');
      if (!href) return;
      if (/-seriya\b/i.test(href) || /#subtitry/i.test(href)) return;
      let fullSeasonUrl = href;
      if (!fullSeasonUrl.startsWith('http')) {
        fullSeasonUrl = 'https://dorama.land' + (href.startsWith('/') ? '' : '/') + href;
      }
      if (fullSeasonUrl === fullUrl) return;
      if (seenSeasonUrls.has(fullSeasonUrl)) return;
      const text = (a.textContent || '').trim();
      const titleAttr = (a.getAttribute('title') || '').trim();
      let num = 0;
      const m = (text + ' ' + titleAttr).match(/(\d+)\s*сезон/i);
      if (m) num = parseInt(m[1], 10);
      if (!num) {
        const urlMatch = href.match(/-(\d+)-sezon/i) || href.match(/season[-_ ]?(\d+)/i);
        if (urlMatch) num = parseInt(urlMatch[1], 10);
      }
      if (!num) {
        if (isStrictSeason) num = 1;
        else return;
      }
      if (seenSeasonNums.has(num)) return;
      seenSeasonNums.add(num);
      seenSeasonUrls.add(fullSeasonUrl);
      seasonLinksRaw.push({ number: num, url: fullSeasonUrl });
    }

    doc.querySelectorAll('[class*="serial-seasons"] a[href]').forEach(a => tryCollectSeasonLink(a, true));
    doc.querySelectorAll('a.serial-seasons__link[href]').forEach(a => tryCollectSeasonLink(a, true));
    if (seasonLinksRaw.length < 2) {
      doc.querySelectorAll('a[href*="-sezon"]').forEach(a => tryCollectSeasonLink(a, false));
    }
    const isMultiSeason = seasonLinksRaw.length > 1;

    // === ОСНОВНЫЕ ПОЛЯ ===
    const h2 = doc.querySelector('h2.about-serial-header__title');
    const rawTitle = h2 ? cleanDoramaText(h2.textContent) : r.title;
    let title = rawTitle
      .replace(/\s*[\(\[]?\s*(?:сериал|фильм|дорама|дорама-сериал|мини-дорама|лакорн).*/i, '')
      .replace(/\s*[\(\[]?\s*\d{4}\s*[\)\]]?/i, '')
      .replace(/\s*смотреть онлайн.*$/i, '')
      .replace(/\(\s*\)/g, '')
      .trim();
    if (!title) title = r.title;

    let country = '';
    const countryEl = doc.querySelector('[itemprop="countryOfOrigin"]');
    if (countryEl) country = cleanDoramaText(countryEl.textContent);

    let description = '';
    const descEl = doc.querySelector('[itemprop="description"]');
    if (descEl) {
      const paragraphs = descEl.querySelectorAll('p');
      description = paragraphs.length
        ? Array.from(paragraphs).map(p => cleanDoramaText(p.textContent)).filter(Boolean).join('\n\n')
        : cleanDoramaText(descEl.textContent);
      description = description.replace(/\s*Смотреть\s+дораму\s*$/i, '').trim();
    }

    const rawGenres = [];
    doc.querySelectorAll('[itemprop="genre"]').forEach(el => {
      const links = el.querySelectorAll('a');
      if (links.length) links.forEach(a => { const t = cleanDoramaText(a.textContent); if (t) rawGenres.push(t); });
      else {
        const text = cleanDoramaText(el.textContent);
        if (text) text.split(/[,;]+/).forEach(c => c.split(/\s*\/\s*/).forEach(p => {
          const t = cleanDoramaText(p);
          if (t) rawGenres.push(t);
        }));
      }
    });
    const tags = [...new Set(rawGenres)].filter(g => !/^(яой|яои|yaoi|слэш|слеш|slash|bl|boys?\s*love|boys-love|boyslove|боярс)$/i.test(g));
    const isBl = /яой|яои|yaoi|слэш|слеш|slash|boys?.?love|боярс|\bbl\b|shounen.?ai|с[её]н[её]н.?ай/i.test(rawGenres.join(' '));

    let projectStatus = '';
    const statusEl = doc.querySelector('.about-serial__status');
    if (statusEl) projectStatus = normalizeProjectStatus(statusEl.textContent);

    let doramaYear = doramaYearFromDoc(doc, rawTitle);

    let titleOrig = '';
    const spans = doc.querySelectorAll('span.font-light-18');
    for (const sp of spans) {
      const t = cleanDoramaText(sp.textContent);
      if (DORAMA_CJK.test(t)) { titleOrig = t; break; }
    }

    let altTitles = [];
    const altEl = doc.querySelector('[itemprop="alternativeHeadline"]');
    if (altEl) {
      cleanDoramaText(altEl.textContent).split(/\s*\/\s*/).forEach(s => {
        const t = cleanDoramaText(s);
        if (t && t.length > 1) altTitles.push(t);
      });
    }
    let altBlockText = '';
    if (h2) {
      let sibling = h2.nextElementSibling;
      for (let i = 0; i < 4 && sibling; i++) {
        const txt = cleanDoramaText(sibling.textContent || '');
        if (txt.length > 10 && txt.split(/\s*\/\s*/).filter(Boolean).length >= 2) { altBlockText = txt; break; }
        sibling = sibling.nextElementSibling;
      }
    }
    if (altBlockText) {
      altBlockText.split(/\s*\/\s*/).forEach(s => {
        const t = cleanDoramaText(s);
        if (t && t.length > 1 && !altTitles.includes(t)) altTitles.push(t);
      });
    }

    if (!altTitles.length || !doramaYear) {
      results.innerHTML = '<div class="tmdb-status">Собираю доп. данные…</div>';
      const slug = (r.url || '').replace(/^\//, '');
      const meta = await fetchDoramaMeta(slug);
      if (meta.raw && !altTitles.length) {
        meta.raw.split(/\s*[\/|]\s*/).forEach(s => {
          const t = cleanDoramaText(s);
          if (t && t.length > 1 && !altTitles.includes(t)) altTitles.push(t);
        });
      }
      if (meta.year && !doramaYear) doramaYear = meta.year;
      console.log('[Dorama] после iframe — year:', doramaYear, '| altTitles:', altTitles);
    }

    results.innerHTML = '<div class="tmdb-status">Ищу постер в TMDB…</div>';
    const siteData = { title, titleOrig, year: doramaYear, country, altTitles };
    const tmdb = await findInTmdbDorama(siteData);

    if (!doramaYear && tmdb && tmdb.details) {
      const ym = (tmdb.details.first_air_date || tmdb.details.release_date || '').substring(0, 4);
      if (ym) doramaYear = ym;
    }

    let cover = r.cover;
    let titleEn = '';
    let tmdbAltTitles = [];
    let altCovers = [];

    if (tmdb && tmdb.details) {
      const d = tmdb.details;
      if (d.poster_path) cover = TMDB_IMG + '/w780' + d.poster_path;
      const baseLang = (d.original_language || 'en').split('-')[0];
      altCovers = await fetchAllTmdbPosters(d.id, 'tv', baseLang, d.poster_path);
      if (!altCovers.length) altCovers = extractTmdbPosters(d);

      titleEn = tmdbEnTitle(d, altTitles.concat([titleOrig, title]));

      const altList = (d.alternative_titles && (d.alternative_titles.titles || d.alternative_titles.results)) || [];
      altList.forEach(x => {
        const t = (x.title || x.name || '').trim();
        if (t && !t.toLowerCase().includes('season') && !/\d+$/.test(t)) tmdbAltTitles.push(t);
      });
    }

    results.innerHTML = '<div class="tmdb-status">Ищу на KissKH…</div>';
    const allNames = [];
    const seenNames = new Set();
    const pushName = (n) => {
      const c = cleanDoramaText(n);
      if (!c || c.length < 2) return;
      if (/[а-яёіїєґА-ЯЁІЇЄҐ]/.test(c)) return;
      if (seenNames.has(c.toLowerCase())) return;
      seenNames.add(c.toLowerCase());
      allNames.push(c);
    };
    altTitles.forEach(pushName);
    if (titleOrig) pushName(titleOrig);
    tmdbAltTitles.forEach(pushName);
    if (titleEn) pushName(titleEn);
    console.log('[Dorama] имена для KissKH:', allNames, '| год:', doramaYear);

    const kisskh = await findSeasonOnKisskh(allNames, doramaYear, 1, isMultiSeason, country);

    // === СЕЗОНЫ: разбираем страницы ===
    const pendingSeasons = [];
    const tmdbSeasonsMap = new Map();
    if (tmdb && tmdb.details && Array.isArray(tmdb.details.seasons)) {
      tmdb.details.seasons.forEach(s => {
        if (s.season_number > 0) tmdbSeasonsMap.set(s.season_number, s);
      });
    }

    for (const s of seasonLinksRaw) {
      try {
        const sHtml = await fetchProxied(s.url);
        const sDoc = new DOMParser().parseFromString(sHtml, 'text/html');

        let sTitle = '';
        const metaName = sDoc.querySelector('meta[itemprop="name"]');
        if (metaName) sTitle = (metaName.getAttribute('content') || '').trim();
        if (!sTitle) {
          const sH1 = sDoc.querySelector('h1');
          if (sH1) sTitle = cleanDoramaText(sH1.textContent);
        }
        if (sTitle) {
          sTitle = sTitle
            .replace(/\s*[\(\[]?\s*(?:сериал|фильм|дорама|дорама-сериал|мини-дорама|лакорн).*/i, '')
            .replace(/\s*[\(\[]?\s*\d{4}\s*[\)\]]?/i, '')
            .replace(/\s*смотреть онлайн.*$/i, '')
            .replace(/\(\s*\)/g, '')
            .trim();
        }
        if (!sTitle) sTitle = 'Сезон ' + s.number;

        let sTitleEn = '';
        if (titleEn) sTitleEn = titleEn + ' ' + toRoman(s.number);

        let sDesc = '';
        const sDescEl = sDoc.querySelector('[itemprop="description"]');
        if (sDescEl) {
          const paragraphs = sDescEl.querySelectorAll('p');
          sDesc = paragraphs.length
            ? Array.from(paragraphs).map(p => cleanDoramaText(p.textContent)).filter(Boolean).join('\n\n')
            : cleanDoramaText(sDescEl.textContent);
          sDesc = sDesc.replace(/\s*Смотреть\s+дораму\s*$/i, '').trim();
        }
        if (!sDesc) {
          const metaDesc = sDoc.querySelector('meta[itemprop="description"]');
          if (metaDesc) sDesc = cleanDoramaText(metaDesc.getAttribute('content') || '');
        }

        const sYear = doramaSeasonYear(sDoc);

        let sTags = [];
        let sBl = false;
        const metaGenre = sDoc.querySelector('meta[itemprop="genre"]');
        if (metaGenre) {
          const genresStr = metaGenre.getAttribute('content') || '';
          sBl = /яой|yaoi|слэш|slash|boys?.?love|боярс|\bbl\b|shounen.?ai|с[её]н[её]н.?ай/i.test(genresStr);
          const rawS = [];
          genresStr.split(/[,;]+/).forEach(c => c.split(/\s*\/\s*/).forEach(p => {
            const t = cleanDoramaText(p);
            if (t) rawS.push(t);
          }));
          sTags = [...new Set(rawS)].filter(g => !/^(яой|яои|yaoi|слэш|слеш|slash|bl|boys?\s*love|boys-love|boyslove|боярс)$/i.test(g));
        }

        let sCover = '';
        const tmdbS = tmdbSeasonsMap.get(s.number);
        if (tmdbS && tmdbS.poster_path) sCover = TMDB_IMG + '/w780' + tmdbS.poster_path;

        let sKisskhUrl = '';
        if (allNames.length) {
          const kisskhS = await findSeasonOnKisskh(allNames, sYear || doramaYear, s.number, isMultiSeason, country);
          if (kisskhS) sKisskhUrl = kisskhS.url;
        }

        let sProjectStatus = '';
        const sStatusEl = sDoc.querySelector('.about-serial__status');
        if (sStatusEl) sProjectStatus = normalizeProjectStatus(sStatusEl.textContent);

        pendingSeasons.push({
          number: s.number,
          url: s.url,
          link_sub: sKisskhUrl,
          title: sTitle,
          title_en: sTitleEn,
          description: sDesc,
          cover: sCover,
          year: sYear || doramaYear,
          yearFromPage: !!sYear,
          country: country,
          tags: sTags,
          bl: sBl,
          projectStatus: sProjectStatus
        });
      } catch (e) {
        console.warn('[seasons] не удалось спарсить ' + s.url, e.message);
        pendingSeasons.push({
          number: s.number, url: s.url, link_sub: '', title: 'Сезон ' + s.number,
          description: '', cover: '', year: doramaYear, yearFromPage: false,
          country: country, tags: [], bl: false, projectStatus: ''
        });
      }
    }

    // Год основной карточки перетираем только если своего года нет,
    // и только годом, который реально прочитан со страницы сезона.
    pendingSeasons.sort((a, b) => a.number - b.number);
    if (!doramaYear && pendingSeasons.length && pendingSeasons[0].yearFromPage) {
      doramaYear = pendingSeasons[0].year;
    }

    // === ФОРМА ===
    const panel = document.getElementById('panel');
    const setVal = (id, val) => { const el = panel.querySelector('#' + id); if (el && val) el.value = val; };
    setVal('f_title', title);
    setVal('f_title_en', titleEn);
    setVal('f_year', doramaYear);
    setVal('f_country', country);
    setVal('f_description', description);
    setVal('f_cover', cover);
    setVal('f_link', fullUrl);
    if (kisskh) setVal('f_link_sub', kisskh.url);
    setVal('f_tags', tags.join(', '));
    if (cover) setCoverPreview(cover);

    const altWrap = panel.querySelector('#altCoversWrap');
    if (altWrap && altCovers && altCovers.length) {
      altWrap.innerHTML = altCovers.map(url =>
        `<div class="alt-cover-thumb ${cover === url ? 'active' : ''}" data-url="${url}"><img src="${url}" loading="lazy" alt=""></div>`
      ).join('');
      altWrap.onclick = (e) => {
        const thumb = e.target.closest('.alt-cover-thumb');
        if (!thumb) return;
        const url = thumb.dataset.url;
        const hiddenCover = panel.querySelector('#f_cover');
        if (hiddenCover) hiddenCover.value = url;
        const d = window._currentDraft;
        if (d) { d.cover = url; d.customCover = true; }
        setCoverPreview(url);
        altWrap.querySelectorAll('.alt-cover-thumb').forEach(t => t.classList.toggle('active', t.dataset.url === url));
      };
    } else if (altWrap) {
      altWrap.innerHTML = '';
    }

    const segType = panel.querySelector('#f_type');
    if (segType) {
      const dramaBtn = segType.querySelector('button[data-v="drama"]');
      if (dramaBtn) {
        segType.querySelectorAll('button').forEach(b => b.classList.remove('on'));
        dramaBtn.classList.add('on');
      }
    }

    const draft = window._currentDraft;
    if (draft) {
      draft.type = 'drama';
      draft.sourceUrl = fullUrl;
      draft.projectStatus = projectStatus;
      draft._pendingSeasons = pendingSeasons;
      draft.altCovers = altCovers;
      draft.customCover = false;
      if (tmdb && tmdb.details) {
        draft.tmdbId = tmdb.details.id;
        const imdb = tmdb.details.external_ids && tmdb.details.external_ids.imdb_id;
        if (imdb) draft.imdbId = imdb;
      }
      const segProj = panel.querySelector('#f_project_status');
      if (segProj) {
        segProj.querySelectorAll('button').forEach(b => {
          b.classList.toggle('on', (b.dataset.v || '') === (projectStatus || ''));
        });
      }
    }

    if (isBl) {
      const segBl = panel.querySelector('#f_bl');
      if (segBl) {
        const yes = segBl.querySelector('button[data-v="yes"]');
        const no = segBl.querySelector('button[data-v="no"]');
        if (yes) yes.classList.add('on');
        if (no) no.classList.remove('on');
      }
      if (draft) draft.bl = true;
    }

    document.getElementById('doramaModal').classList.remove('on');
    if (kisskh) toast('Заполнено: Dorama + TMDB + KissKH (' + kisskh.title + ')', 'success');
    else toast('Заполнено с Dorama.land и TMDB (KissKH не найден)', 'warn');
  } catch (e) {
    results.innerHTML = '<div class="tmdb-status">Ошибка загрузки: ' + esc(e.message) + '</div>';
  }
}

document.getElementById('doramaClose').onclick = () => document.getElementById('doramaModal').classList.remove('on');
document.getElementById('doramaModal').onclick = (e) => {
  if (e.target.id === 'doramaModal') e.target.classList.remove('on');
};
document.getElementById('doramaQuery').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); runDoramaSearch(); }
});