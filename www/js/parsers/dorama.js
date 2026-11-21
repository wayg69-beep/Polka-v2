'use strict';

/* ==========================================================
   dorama.js — Dorama.land (+ Kisskh, поиск соответствий в TMDB)
   ========================================================== */

  // ===== ХЕЛПЕРЫ ДЛЯ ПОИСКА DORAMA =====
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

function cleanDoramaText(s) {
  if(!s) return '';
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
  const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
  return roman[num] || num.toString();
}
function normDoramaTitle(s) {
  return String(s || '').toLowerCase().replace(/\(\d{4}\)/, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function tokenizeDorama(s) {
  return normDoramaTitle(s).split(' ').filter(w => w && !NOISE_WORDS.has(w) && w.length > 1);
}
function tokenMatchDorama(a, b) {
  const ta = tokenizeDorama(a); const tb = tokenizeDorama(b);
  if(!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  let hits = 0;
  for(const t of ta) { if(setB.has(t)) hits++; }
  return hits / Math.max(ta.length, tb.length);
}
function getKisskhYear(item) {
  if(!item) return 0;
  const mTitle = String(item.title || '').match(/\((\d{4})\)/);
  if(mTitle) return parseInt(mTitle[1]);
  if(item.releaseDate) {
    const mDate = String(item.releaseDate).match(/(\d{4})/);
    if(mDate) return parseInt(mDate[1]);
  }
  return 0;
}
function makeKisskhSlug(title) {
  return String(title || '').replace(/\(\d{4}\)/, '').replace(/\s+/g, '-').replace(/[^\w\-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function tmdbSearchTvOnly(query) {
  try {
    const url = 'https://api.themoviedb.org/3/search/tv?api_key=' + TMDB_KEY + '&language=ru-RU&query=' + encodeURIComponent(query) + '&include_adult=false';
    const proxyUrl = 'https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(url);
    
    const r = await fetch(proxyUrl);
    if(!r.ok) return [];
    
    const text = await r.text();
    const data = JSON.parse(text);
    return (data.results || []).map(item => Object.assign({}, item, { media_type: 'tv' }));
  } catch(e){ 
    console.warn('[TMDB] Ошибка TV:', e.message);
    return []; 
  }
}
  
async function tmdbDetailsDorama(id, type) {
  try {
    const url = 'https://api.themoviedb.org/3/' + type + '/' + id + '?api_key=' + TMDB_KEY + '&language=ru-RU&append_to_response=alternative_titles,translations,images&include_image_language=aa,ab,ae,af,ak,am,an,ar,as,av,ay,az,ba,be,bg,bh,bi,bm,bn,bo,br,bs,ca,ce,ch,co,cr,cs,cu,cv,cy,da,de,dv,dz,ee,el,en,eo,es,et,eu,fa,ff,fi,fj,fo,fr,fy,ga,gd,gl,gn,gu,gv,ha,he,hi,ho,hr,ht,hu,hy,hz,ia,id,ie,ig,ii,ik,io,is,it,iu,ja,jv,ka,kg,ki,kj,kk,kl,km,kn,ko,kr,ks,ku,kv,kw,ky,la,lb,lg,li,ln,lo,lt,lu,lv,mg,mh,mi,mk,ml,mn,mr,ms,mt,my,na,nb,nd,ne,ng,nl,nn,no,nr,nv,ny,oc,oj,om,or,os,pa,pi,pl,ps,pt,qu,rm,rn,ro,ru,rw,sa,sc,sd,se,sg,si,sk,sl,sm,sn,so,sq,sr,ss,st,su,sv,sw,ta,te,tg,th,ti,tk,tl,tn,to,tr,ts,tt,tw,ty,ug,uk,ur,uz,ve,vi,vo,wa,wo,xh,yi,yo,za,zh,zu,null';
    const proxyUrl = 'https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(url);
    
    const r = await fetch(proxyUrl);
    if(!r.ok) return null;
    
    const text = await r.text();
    return JSON.parse(text);
  } catch(e){ 
    return null; 
  }
}
  
  function rankTmdbResults(results, targetYear) {
  const ty = parseInt(targetYear) || 0;
  return results.slice().sort((a, b) => {
    if(ty) {
      const ya = parseInt((a.first_air_date || a.release_date || '').substring(0,4)) || 0;
      const yb = parseInt((b.first_air_date || b.release_date || '').substring(0,4)) || 0;
      const da = ya ? Math.abs(ya - ty) : 999;
      const db = yb ? Math.abs(yb - ty) : 999;
      if(da !== db) return da - db;
    }
    if(a.media_type === 'tv' && b.media_type !== 'tv') return -1;
    if(b.media_type === 'tv' && a.media_type !== 'tv') return 1;
    return 0;
  });
}
async function findInTmdbDorama(site) {
  const langCode = TMDB_COUNTRY_TO_LANG[site.country] || '';
  const targetYear = parseInt(site.year) || 0;
  
  const latinAlts = (site.altTitles || []).filter(t => /[a-zA-Z]/.test(t) && t.length > 3);
  // Сортируем альтернативы по длине (сначала более специфичные "ABO Desire", потом просто "Desire")
  latinAlts.sort((a, b) => b.length - a.length);
  
  const origTitle = site.titleOrig || '';
  const ruTitle = site.title || '';

  // Собираем список запросов в порядке приоритета
  const queries = [];
  const seen = new Set();
  const addQuery = (q) => {
    const cleanQ = q.trim();
    if(cleanQ && !seen.has(cleanQ)) {
      seen.add(cleanQ);
      queries.push(cleanQ);
    }
  };

  // ВАЖНО: НЕ добавляем год в строку поиска. TMDB ищет точное совпадение.
  // "ABO Desire 2025" возвращает 0 результатов, а "ABO Desire" находит нужный сериал.
  
  // 1. Приоритет: оригинальное название (иероглифы) — самое точное
  if(origTitle) addQuery(origTitle);

  // 2. Специфичные латинские названия (отсортированы по длине)
  latinAlts.forEach(alt => addQuery(alt));

  // 3. Русское название
  if(ruTitle) addQuery(ruTitle);

  for(const q of queries) {
    let results = await tmdbSearchTvOnly(q);
    if(!results || !results.length) continue;

    if(langCode) {
      const byLang = results.filter(r => r.original_language === langCode);
      if(byLang.length) results = byLang;
    }

    const ranked = rankTmdbResults(results, site.year);
    
    for(const item of ranked) {
      // СТРОГАЯ ПРОВЕРКА ГОДА
      if (targetYear) {
        const itemYearStr = (item.first_air_date || item.release_date || '').substring(0, 4);
        const itemYear = parseInt(itemYearStr) || 0;
        // Если у элемента есть год, и он отличается от нашего больше чем на 1, пропускаем
        if (itemYear && Math.abs(itemYear - targetYear) > 1) {
          continue; 
        }
      }

      // Если проверка пройдена — берем детали (обложку, английское название)
      const details = await tmdbDetailsDorama(item.id, 'tv');
      if(details) return { details, media_type: item.media_type };
    }
  }
  
  return null;
}  
// ===== KISSKH ПОИСК =====
async function searchKisskhDomain(domain, query) {
  try {
    const url = 'https://' + domain + '/api/DramaList/Search?q=' + encodeURIComponent(query) + '&type=0';
    const res = await nativeFetch(url, { 
      'Accept': 'application/json', 
      'Referer': 'https://' + domain + '/' 
    });
    
    if (res.status === 200) {
      return await res.json();
    }
    console.warn('[KissKH] Ошибка HTTP:', res.status);
    return null;
  } catch(e) {
    console.error('[KissKH] Сетевая ошибка:', e.message);
    return null;
  }
}
  
  
  
async function findSeasonOnKisskh(names, year, seasonNum, isMultiSeason, targetCountry) {
  if(!names || !names.length) return null;
  const targetYear = parseInt(year) || 0;
  const domain = 'kisskh.do';
  let bestMatch = null;
  let bestScore = -Infinity;

  for(const name of names.slice(0, 3)) {
    if(!name || name.length < 2) continue;
    await new Promise(r => setTimeout(r, 800));
    const results = await searchKisskhDomain(domain, name);
    if(!results || !results.length) continue;

    for(const item of results) {
      const rTitle = item.title || item.name || '';
      const rTitleLower = rTitle.toLowerCase();
      const nameLower = name.toLowerCase();
      
      if (isMultiSeason) {
        let isTargetSeason = false;
        if (seasonNum === 1) {
          if (rTitleLower.includes('season 2') || rTitleLower.includes('season 3') || /\s2$/.test(rTitleLower)) continue;
          const tokenScore = tokenMatchDorama(rTitle, name);
          if (rTitleLower.includes('season') || tokenScore > 0.8) isTargetSeason = true;
        } else {
          isTargetSeason = rTitleLower.includes('season ' + seasonNum) || rTitleLower.includes(' ' + seasonNum);
        }
        if (!isTargetSeason) continue;
      } else {
        if (seasonNum === 1 && (rTitleLower.includes('season 2') || rTitleLower.includes('season 3'))) continue;
      }

      let tokenScore = tokenMatchDorama(rTitle, name);
      const isStart = rTitleLower.startsWith(nameLower);
      
      if (isStart) {
        tokenScore = 2.0; 
      } else if (rTitleLower.includes(nameLower)) {
        tokenScore = 1.0;
      }
      
      if(tokenScore < 0.7) continue; 

      const rYear = getKisskhYear(item);
      if(rYear && targetYear && Math.abs(rYear - targetYear) > 2) continue;

      let score = tokenScore * 100;
      
      // ГЛАВНЫЙ ФИКС: Если название НАЧИНАЕТСЯ с нашей фразы, мы не штрафуем за год.
      // "ABO Desire" (начинается) получит 200 + 10 = 210.
      // "Desire (2026)" (тоже начинается) получит 200 + 6 - 10 = 196.
      if (isStart) {
        score += name.length; 
      } else {
        if(rYear) score -= Math.abs(rYear - targetYear) * 10;
        else score -= 20;
        score += name.length;
      }

      if(score > bestScore) {
        bestScore = score;
        bestMatch = { item, rTitle, rYear };
      }
    }
  }

  if(!bestMatch) return null;
  
  const slug = makeKisskhSlug(bestMatch.rTitle);
  return {
    url: 'https://' + domain + '/Drama/' + (slug || 'watch') + '?id=' + bestMatch.item.id,
    title: bestMatch.rTitle
  };
}
  
function openDoramaModal() {
  const modal = document.getElementById('doramaModal');
  const input = document.getElementById('doramaQuery');
  const results = document.getElementById('doramaResults');
  if(!modal) return;
  input.value = '';
  results.innerHTML = '<div class="tmdb-status">Введи название и нажми Enter</div>';
  modal.classList.add('on');
  setTimeout(() => input.focus(), 60);
}
  
// ===== ПОИСК НА DORAMA.LAND =====
async function runDoramaSearch(){
  const input = document.getElementById('doramaQuery');
  const results = document.getElementById('doramaResults');
  const q = input.value.trim();
  if(!q){ results.innerHTML = '<div class="tmdb-status">Введи название</div>'; return; }
  results.innerHTML = '<div class="tmdb-status">Ищу…</div>';
  
  try {
    const searchUrl = 'https://dorama.land/search?q=' + encodeURIComponent(q);
    const html = await fetchProxied(searchUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    const items = doc.querySelectorAll('.search-item');
    if(!items.length){
      results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
      return;
    }

    const list = [];
    items.forEach(el => {
      const a = el.querySelector('a.search-item-wrap');
      if(!a) return;
      
      const titleEl = el.querySelector('.search-item__title');
      const altTitleEl = el.querySelector('.search-item__alternative-title');
      const imgEl = el.querySelector('.search-item-img img');
      const ratingEl = el.querySelector('.search-item__rating span:last-child');
      const genreEl = el.querySelector('.search-item__genre span:last-child');

let cover = '';
if (imgEl) {
  cover = imgEl.getAttribute('data-src') || imgEl.getAttribute('srcset')?.split(' ')[0] || imgEl.getAttribute('src');
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
  } catch(e){
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
    
    let raw = '', year = '';
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
        if (/[\u3000-\u9fff\uac00-\ud7af]/.test(t)) { raw = t; break; }
      }
    }
    
    const bodyText = doc.body.textContent || '';
    const ym = bodyText.match(/Год[:\s]*(\d{4})/i) || bodyText.match(/(\d{4})\s*год/i);
    if (ym) year = ym[1];
    
    if (!year) {
      const og = doc.querySelector('meta[property="og:title"]');
      if (og) { const m = (og.getAttribute('content') || '').match(/(\d{4})/); if (m) year = m[1]; }
    }

    const seasons = [];
    const seasonLinks = doc.querySelectorAll('a.serial-seasons__link');
    seasonLinks.forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      const text = (a.textContent || '').trim();
      const title = (a.getAttribute('title') || '').trim();
      let num = 0;
      const m = (text + ' ' + title).match(/(\d+)\s*сезон/i);
      if (m) num = parseInt(m[1], 10);
      if (!num) { const urlMatch = href.match(/-(\d+)-sezon/i) || href.match(/-(\d+)$/); if (urlMatch) num = parseInt(urlMatch[1], 10); }
      if (!num) num = 1;
      
      let fullUrl = href;
      if (!fullUrl.startsWith('http')) fullUrl = 'https://dorama.land' + (href.startsWith('/') ? '' : '/') + href;
      seasons.push({ number: num, url: fullUrl, title: text || title });
    });
    
    return { raw, year, seasons };
  } catch(e) {
    console.error('[DoramaMeta] Ошибка:', e.message);
    return { raw: '', year: '', seasons: [] };
  }
}
  
  async function pickDoramaResult(idx) {
  const list = window._doramaCache || [];
  const r = list[idx];
  if(!r) return;

  const results = document.getElementById('doramaResults');
  results.innerHTML = '<div class="tmdb-status">Открываю карточку дорамы…</div>';

  try {
        const fullUrl = 'https://dorama.land' + r.url;
    const html = await fetchProxied(fullUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');

// === СБОР СЕЗОНОВ С DORAMA.LAND (перенесено вверх) ===
const seasonLinksRaw = [];
const seenSeasonUrls = new Set();
const seenSeasonNums = new Set();

function tryCollectSeasonLink(a, isStrictSeason) {
  const href = a.getAttribute('href');
  if (!href) return;

  // Пропускаем ссылки на серии и якоря субтитров — это не сезоны.
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
// ======================================================

    const h2 = doc.querySelector('h2.about-serial-header__title');
    const rawTitle = h2 ? cleanDoramaText(h2.textContent) : r.title;

    let title = rawTitle.replace(/\s*[\(\[]?\s*(?:сериал|фильм|дорама|дорама-сериал|мини-дорама|лакорн).*/i, '').replace(/\s*[\(\[]?\s*\d{4}\s*[\)\]]?/i, '').replace(/\s*смотреть онлайн.*$/i, '').replace(/\(\s*\)/g, '').trim();
if(!title) title = r.title;

    let country = '';
    const countryEl = doc.querySelector('[itemprop="countryOfOrigin"]');
    if(countryEl) country = cleanDoramaText(countryEl.textContent);

    let description = '';
    const descEl = doc.querySelector('[itemprop="description"]');
    if(descEl) {
      const paragraphs = descEl.querySelectorAll('p');
      description = paragraphs.length
        ? Array.from(paragraphs).map(p => cleanDoramaText(p.textContent)).filter(Boolean).join('\n\n')
        : cleanDoramaText(descEl.textContent);
      description = description.replace(/\s*Смотреть\s+дораму\s*$/i, '').trim();
    }

    const rawGenres = [];
    doc.querySelectorAll('[itemprop="genre"]').forEach(el => {
      const links = el.querySelectorAll('a');
      if(links.length) links.forEach(a => { const t = cleanDoramaText(a.textContent); if(t) rawGenres.push(t); });
      else {
        const text = cleanDoramaText(el.textContent);
        if(text) text.split(/[,;]+/).forEach(c => c.split(/\s*\/\s*/).forEach(p => { const t = cleanDoramaText(p); if(t) rawGenres.push(t); }));
      }
    });
    const tags = [...new Set(rawGenres)].filter(g => !/^(яой|яои|yaoi|слэш|слеш|slash|bl|boys?\s*love|boys-love|boyslove|боярс)$/i.test(g));
    const isBl = /яой|яои|yaoi|слэш|слеш|slash|boys?.?love|боярс|\bbl\b|shounen.?ai|сенен.?ай/i.test(rawGenres.join(' '));

    let projectStatus = '';
const statusEl = doc.querySelector('.about-serial__status');
if (statusEl) projectStatus = normalizeProjectStatus(statusEl.textContent);

let doramaYear = '';
const dateEl = doc.querySelector('meta[itemprop="dateCreated"]');
    if(dateEl) {
      const ym = dateEl.textContent.match(/(\d{4})/);
      if(ym) doramaYear = ym[1];
    }
    if(!doramaYear) {
      const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
      const ym = ogTitle.match(/(\d{4})/);
      if(ym) doramaYear = ym[1];
    }
    if(!doramaYear) {
      const bodyText = doc.body.textContent || '';
      const ym = bodyText.match(/Год[:\s]*(\d{4})/i) || bodyText.match(/(\d{4})\s*год/i);
      if(ym) doramaYear = ym[1];
    }
    if(!doramaYear) {
      const ymFallback = rawTitle.match(/(\d{4})/);
      if(ymFallback) doramaYear = ymFallback[1];
    }

    let titleOrig = '';
    const spans = doc.querySelectorAll('span.font-light-18');
    for(const sp of spans) {
      const t = cleanDoramaText(sp.textContent);
      if(/[\u3000-\u9fff\uac00-\ud7af]/.test(t)) {
        titleOrig = t;
        break;
      }
    }

    let altTitles = [];
// 1. Пробуем старую микроразметку
const altEl = doc.querySelector('[itemprop="alternativeHeadline"]');
if(altEl) {
  cleanDoramaText(altEl.textContent).split(/\s*\/\s*/).forEach(s => {
    const t = cleanDoramaText(s);
    if(t && t.length > 1) altTitles.push(t);
  });
}

// 2. Ищем блок с альт-названиями: смотрим на несколько элементов после заголовка
let altBlockText = '';
const h2El = doc.querySelector('h2.about-serial-header__title');
if(h2El) {
  let sibling = h2El.nextElementSibling;
  for(let i = 0; i < 4 && sibling; i++) {
    const txt = cleanDoramaText(sibling.textContent || '');
    // Хороший блок: длинный текст с "/" внутри (2+ названия)
    if(txt.length > 10 && txt.split(/\s*\/\s*/).filter(Boolean).length >= 2) {
      altBlockText = txt;
      break;
    }
    sibling = sibling.nextElementSibling;
  }
}

if(altBlockText) {
  altBlockText.split(/\s*\/\s*/).forEach(s => {
    const t = cleanDoramaText(s);
    if(t && t.length > 1 && !altTitles.includes(t)) altTitles.push(t);
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

    const siteData = { title, titleOrig, year: doramaYear, country, altTitles: altTitles };
    const tmdb = await findInTmdbDorama(siteData);

    // ГЛАВНЫЙ ФИКС: если Dorama.land и iframe не дали год — берём его из TMDB.
    // TMDB знает точный год всегда: Strangers from Hell = 2019, японский ремейк = 2025.
    if(!doramaYear && tmdb && tmdb.details) {
      const d = tmdb.details;
      const tmdbYearStr = (d.first_air_date || d.release_date || '').substring(0, 4);
      if(tmdbYearStr) doramaYear = tmdbYearStr;
      console.log('[Dorama] год из TMDB:', doramaYear);
    }

    let cover = r.cover;
let titleEn = '';
let tmdbAltTitles = [];
let altCovers = [];

if(tmdb && tmdb.details) {
  const d = tmdb.details;
  if(d.poster_path) cover = TMDB_IMG + '/w780' + d.poster_path;
  
  const baseLang = (d.original_language || 'en').split('-')[0];
  altCovers = await fetchAllTmdbPosters(d.id, 'tv', baseLang);


      // 2. Пытаемся найти английское название в alternative_titles
if(d.alternative_titles) {
  const altList = d.alternative_titles.titles || d.alternative_titles.results || [];
  // Ищем название для US/GB, в котором НЕТ упоминания сезона (цифры или слова Season)
  const enAlt = altList.find(x => {
  if (x.iso_3166_1 !== 'US' && x.iso_3166_1 !== 'GB') return false;
  const t = (x.title || x.name || '').trim();
  if (!t) return false;
  const lowerT = t.toLowerCase();
  if (lowerT.length < 4) return false; // Отсекаем слишком короткие названия (например, "Nu")
  if (lowerT.includes('season')) return false;
  if (/\d+$/.test(lowerT)) return false;
  if (lowerT.includes(' 2') || lowerT.includes(' 3') || lowerT.includes(' 4')) return false;
  return true;
});
  if(enAlt) titleEn = enAlt.title || enAlt.name || '';
  
  // В tmdbAltTitles тоже не добавляем названия с сезонами, чтобы они не мешали поиску
  altList.forEach(x => { 
    const t = (x.title || x.name || '').trim(); 
    if(t && !t.toLowerCase().includes('season') && !/\d+$/.test(t)) {
      tmdbAltTitles.push(t); 
    }
  });
}
      if(!titleEn && d.translations) {
        const enTr = (d.translations.translations || []).find(t => t.iso_639_1 === 'en' && t.data);
        if(enTr && enTr.data) titleEn = enTr.data.title || enTr.data.name || '';
      }
      if(!titleEn) titleEn = d.original_title || d.original_name || '';
    }

    results.innerHTML = '<div class="tmdb-status">Ищу на KissKH…</div>';

    // altTitles с Dorama.land — ПЕРВЫМИ (там и Strangers from Hell, и Hell Is Other People)
    const allNames = [];
const seenNames = new Set();
const pushName = (n) => {
  const c = cleanDoramaText(n);
  if(!c || c.length < 2) return;
  // KissKH ищет по латинице и тайскому. Русские/украинские названия там бесполезны
  // и занимают первые 5 слотов в поиске — из-за этого до "The Wicked Game" дело не доходит.
  if(/[а-яёіїєґА-ЯЁІЇЄҐ]/.test(c)) return;
  if(seenNames.has(c.toLowerCase())) return;
  seenNames.add(c.toLowerCase());
  allNames.push(c);
};
    altTitles.forEach(pushName);
if(titleOrig) pushName(titleOrig);
// Сначала используем названия с Dorama.land (они самые точные), 
// потом оригинальные, и только в конце — то, что нашел TMDB.
tmdbAltTitles.forEach(pushName); 
if(titleEn) pushName(titleEn);
    console.log('[Dorama] имена для KissKH:', allNames, '| ФИНАЛЬНЫЙ год:', doramaYear);

    // Передаем флаг isMultiSeason, чтобы для многосезонных дорам включилось обязательное условие "season"
// Но wait, seasonLinksRaw определяется ДО этого места. Убедимся, что он доступен.
// Да, он определяется в начале функции pickDoramaResult.
const kisskh = await findSeasonOnKisskh(allNames, doramaYear, 1, seasonLinksRaw.length > 1, country);

// По каждому сезону — заходим на его страницу и вытаскиваем поля
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
  sTitle = sTitle.replace(/\s*[\(\[]?\s*(?:сериал|фильм|дорама|дорама-сериал|мини-дорама|лакорн).*/i, '').replace(/\s*[\(\[]?\s*\d{4}\s*[\)\]]?/i, '').replace(/\s*смотреть онлайн.*$/i, '').replace(/\(\s*\)/g, '').trim();
}
if (!sTitle) sTitle = 'Сезон ' + s.number;

// Английское название: оригинальное английское имя + римская цифра
let sTitleEn = '';
if (titleEn) {
  sTitleEn = titleEn + ' ' + toRoman(s.number);
}

let sDesc = '';
const descEl = sDoc.querySelector('[itemprop="description"]');
if (descEl) {
  const paragraphs = descEl.querySelectorAll('p');
  if (paragraphs.length > 0) {
    sDesc = Array.from(paragraphs).map(p => cleanDoramaText(p.textContent)).filter(Boolean).join('\n\n');
  } else {
    sDesc = cleanDoramaText(descEl.textContent);
  }
  sDesc = sDesc.replace(/\s*Смотреть дораму.*$/i, '').trim();
}
if (!sDesc) {
  const metaDesc = sDoc.querySelector('meta[itemprop="description"]');
  if (metaDesc) sDesc = cleanDoramaText(metaDesc.getAttribute('content') || '');
}

    let sYear = '';
    const metaDate = sDoc.querySelector('meta[itemprop="dateCreated"]');
    if (metaDate) {
      const ym = (metaDate.getAttribute('content') || '').match(/\d{4}/);
      if (ym) sYear = ym[0];
    }

    let sTags = [];
let sBl = false;
const metaGenre = sDoc.querySelector('meta[itemprop="genre"]');
if (metaGenre) {
  const genresStr = metaGenre.getAttribute('content') || '';
  sBl = /яой|yaoi|слэш|slash|boys?.?love|боярс|\bbl\b|shounen.?ai|сенен.?ай/i.test(genresStr);
  
  const rawS = [];
  genresStr.split(/[,;]+/).forEach(c => c.split(/\s*\/\s*/).forEach(p => {
    const t = cleanDoramaText(p);
    if (t) rawS.push(t);
  }));
  sTags = [...new Set(rawS)].filter(g => !/^(яой|яои|yaoi|слэш|слеш|slash|bl|boys?\s*love|boys-love|boyslove|боярс)$/i.test(g));
}

    let sCover = '';
    const tmdbS = tmdbSeasonsMap.get(s.number);
    if (tmdbS && tmdbS.poster_path) {
      sCover = TMDB_IMG + '/w780' + tmdbS.poster_path;
    }

        let sKisskhUrl = '';
if (allNames && allNames.length) {
  // Используем уже готовый allNames, который собрал 16 названий для основной карточки
  const kisskhS = await findSeasonOnKisskh(allNames, sYear || doramaYear, s.number, isMultiSeason, country);
  if (kisskhS) sKisskhUrl = kisskhS.url;
}

    // Проект-статус сезона — парсим со страницы конкретного сезона.
// На каждой странице сезона есть свой .about-serial__status.
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
  country: country,
  tags: sTags,
  bl: sBl,
  projectStatus: sProjectStatus
});

  } catch(e) {
    console.warn('[seasons] не удалось спарсить ' + s.url, e.message);
    pendingSeasons.push({
  number: s.number, url: s.url, link_sub: '', title: 'Сезон ' + s.number,
  description: '', cover: '', year: '', country: '', tags: [], bl: false,
  projectStatus: ''
});
  }

}

// Год основной карточки — год первого сезона (если есть сезоны)
pendingSeasons.sort((a, b) => a.number - b.number);
if (pendingSeasons.length > 0 && pendingSeasons[0].year) {
  doramaYear = pendingSeasons[0].year;
}

const panel = document.getElementById('panel');
    const setVal = (id, val) => { const el = panel.querySelector('#' + id); if(el && val) el.value = val; };


    setVal('f_title', title);
    setVal('f_title_en', titleEn);
    setVal('f_year', doramaYear);
    setVal('f_country', country);
    setVal('f_description', description);
    setVal('f_cover', cover);
    setVal('f_link', fullUrl);
    if(kisskh) setVal('f_link_sub', kisskh.url);
    setVal('f_tags', tags.join(', '));

if(cover) setCoverPreview(cover);

// Отрисовка альтернативных обложек
const altWrap = panel.querySelector('#altCoversWrap');
if (altWrap && altCovers && altCovers.length) {
  altWrap.innerHTML = altCovers.map(url =>
    `<div class="alt-cover-thumb ${cover === url ? 'active' : ''}" data-url="${url}"><img src="${url}" loading="lazy" alt=""></div>`
  ).join('');
  
  altWrap.onclick = (e) => {
    const thumb = e.target.closest('.alt-cover-thumb');
    if(!thumb) return;
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
  if (tmdb && tmdb.details) draft.tmdbId = tmdb.details.id; // Сохраняем ID

  // Синхронизируем кнопки статуса проекта в открытой форме.
  // Без этого readInto() при сохранении прочитает из DOM значение «Нет» (''),
  // и затрёт projectStatus, который только что пришёл с Dorama.land.
  const segProj = panel.querySelector('#f_project_status');
  if (segProj) {
    segProj.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', (b.dataset.v || '') === (projectStatus || ''));
    });
  }
}

    if(isBl) {
      const segBl = panel.querySelector('#f_bl');
      if(segBl) {
        segBl.querySelector('button[data-v="yes"]')?.classList.add('on');
        segBl.querySelector('button[data-v="no"]')?.classList.remove('on');
      }
      const draft2 = window._currentDraft;
      if(draft2) draft2.bl = true;
    }

    document.getElementById('doramaModal').classList.remove('on');
    if(kisskh) {
      toast('Заполнено: Dorama + TMDB + KissKH (' + kisskh.title + ')', 'success');
    } else {
      toast('Заполнено с Dorama.land и TMDB (KissKH не найден)', 'warn');
    }

  } catch(e) {
    results.innerHTML = '<div class="tmdb-status">Ошибка загрузки: ' + esc(e.message) + '</div>';
  }
}
  document.getElementById('doramaClose').onclick = () => document.getElementById('doramaModal').classList.remove('on');
document.getElementById('doramaModal').onclick = (e) => {
  if(e.target.id === 'doramaModal') e.target.classList.remove('on');
};
document.getElementById('doramaQuery').addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); e.target.blur(); runDoramaSearch(); }
});
