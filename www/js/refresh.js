'use strict';

/* ==========================================================
   refresh.js — Обновление карточки из источников: refreshCard, refreshSlashlibNative
   ========================================================== */

  

async function refreshCard(id) {
  const it = items.find(x => x.id === id);
  if(!it) return;

  // ═══ ЗАЩИТА: если карточка из Slashlib — только обновляем главы Comizy, не трогаем поля ═══
const isSlashlibCard = it.link && it.link.includes('shlib.life');
const isComizyCard = it.link_comizy && it.link_comizy.includes('comizy.io');

// Гибрид: title/cover/desc/tags с Slashlib + главы с Comizy.
// Обновляем оба источника — иначе пользователь видит обновление только одной части.
if (isComizyCard && isSlashlibCard) {
  const token = localStorage.getItem('slashlib_token');
  if (!token) {
    toast('Нужно войти в Slashlib', 'error');
    return;
  }

  toast('Обновляю со Slashlib и Comizy...', 'success');

  // 1. Главы Comizy по сохранённой ссылке
  try {
    const slug = it.link_comizy.split('/').pop();
    const cDetails = await ComizyParser.getMangaDetails(slug);
    if (cDetails) {
      const keepChapter0 = await ComizyParser.checkSlashlibHasChapter0(it.link);
it.comizyChapters = await ComizyParser.getChapters(cDetails.hid, { keepChapter0 });
    }
  } catch(e) {
    console.warn('Comizy chapters refresh failed:', e);
  }

  // 2. Поля со Slashlib — refreshSlashlibNative делает всё сам:
  //    тянет данные, обновляет поля, делает auto-search Comizy
  //    (если найдёт — уточнит link_comizy; если нет — оставит наши свежие главы),
  //    вызывает save/render/openView и свой тост.
  return refreshSlashlibNative(it);
}

  // Если карточка уже из Comizy — обновляем только главы и метаданные
if (it.link_comizy) {
  toast('Обновляю из Comizy...', 'success');
  const slug = it.link_comizy.split('/').pop();
  const details = await ComizyParser.getMangaDetails(slug);
  if (details) {
    const chapters = await ComizyParser.getChaptersFor(details.hid, slug, it.link);
    it.title = details.title;
    it.title_en = details.altName || it.title_en;
    it.year = details.year || it.year;
    it.description = details.description || it.description;
    it.cover = details.cover || it.cover;
    it.tags = details.tags || it.tags;
    it.country = details.authors || it.country;
    it.comizyChapters = chapters;
    it.updatedAt = Date.now();
    save(); render();
    if(document.getElementById('viewModal').classList.contains('on')) openView(it.id);
    toast('Обновлено из Comizy', 'success');
    return;
  }
}
  
  const url = it.link || it.sourceUrl;
  const oldCover = it.cover; // Запоминаем старую обложку для проверки

  // Вспомогательная функция для сброса кэша
  const clearCoverCache = () => {
    if (oldCover && oldCover !== it.cover) {
      CoverCache.deleteKey(it.id + '_card');
      CoverCache.deleteKey(it.id + '_full');
      _coverBlobUrls.delete(it.id + '_card');
      _coverBlobUrls.delete(it.id + '_full');
      _coverTriedThisSession.delete(it.id + '_card');
      _coverTriedThisSession.delete(it.id + '_full');
      _manualUrlsOk.delete(oldCover);
    }
  };

  if (url && url.includes('shlib.life') && window.Capacitor) {
    return refreshSlashlibNative(it);
  }

  if(!url) {
    if (!it.title_en && !it.tmdbId) {
      toast('Нет ссылки на источник');
      return;
    }
    toast('Обновляю данные по названию...', 'success');
    try {
      if (it.title_en) {
        const kinoLink = await autoSearchKinogo(it.title, it.title_en, it.year);
        if (kinoLink) it.link = kinoLink;
        await autoSearch123Movies(it.title_en, it.year, null, it);
      }
      // ═══ ЗАЩИТА + Comizy-автопоиск ═══
const _isSlashlibCard = it.link && it.link.includes('shlib.life');
const _isComizyCard = it.link_comizy && it.link_comizy.includes('comizy.io');

if (_isComizyCard && _isSlashlibCard) {
  // Гибрид: обновляем только главы Comizy
  toast('Обновляю главы из Comizy...', 'success');
  try {
    const slug = it.link_comizy.split('/').pop();
    const cDetails = await ComizyParser.getMangaDetails(slug);
    if (cDetails) {
      it.comizyChapters = await ComizyParser.getChapters(cDetails.hid);
      it.updatedAt = Date.now();
      save(); render();
      if (document.getElementById('viewModal').classList.contains('on')) openView(it.id);
      toast('Главы обновлены (' + it.comizyChapters.length + ')', 'success');
      return;
    }
  } catch(e) {
    toast('Ошибка обновления Comizy: ' + e.message, 'error');
    return;
  }
} else if (!_isComizyCard && groupOf(it.type) === 'comic') {
  // Обычная карточка — ищем Comizy по всем именам Slashlib
  try {
    const allSlashNames = [
      it.title,
      it.title_en,
      ...(Array.isArray(it.otherNames) ? it.otherNames : [])
    ].filter(Boolean);
    
    if (allSlashNames.length) {
      const match = await ComizyParser.searchAndMatchByNames(allSlashNames, it.year);
      if (match) {
        it.link_comizy = match.url;
        it.comizyChapters = await ComizyParser.getChapters(match.hid);
      }
    }
  } catch(e) { console.warn('Comizy auto-search error', e); }
}
// ═══ /ЗАЩИТА ═══

const searchName = it.title_en || it.title;
      const isSeries = (it.type === 'series' || it.type === 'drama');
      if (isSeries) {
        await autoSearchEZTV(it.imdbId, searchName, null, it);
      } else {
        const ytsRes = await autoSearchYTS(searchName, it.year, null, it);
        if (!ytsRes) await autoSearchTorrentClaw(searchName, it.year, null, it, false);
      }
      
      it.updatedAt = Date.now();
      save(); render();
      if(document.getElementById('viewModal').classList.contains('on')) openView(it.id);
      toast('Обновлено', 'success');
    } catch(e) {
      toast('Ошибка: ' + e.message, 'error');
    }
    return;
  }

  toast('Обновляю данные...', 'success');
  
  try {
    if (url.includes('shlib.life')) {
      const win = window.open(url + (url.includes('?') ? '&' : '?') + 'polka_bridge=detail', '_blank');
      if(!win) throw new Error('Заблокировано всплывающее окно');
      
      const handler = (e) => {
        if (!e.data || e.data.type !== 'POLKA_SLASHLIB_DETAIL_RESULT') return;
        window.removeEventListener('message', handler);
        if(win && !win.closed) win.close();
        const d = e.data.data;
        if(!d) { toast('Ошибка обновления: нет данных', 'error'); return; }
        
        it.title = d.title || it.title;
        it.title_en = d.title_en || it.title_en;
        it.year = d.year || it.year;
        it.country = d.country || it.country;
        it.tags = d.tags || it.tags;
        it.description = d.description || it.description;
        it.pages = d.pages || it.pages;
        it.bl = d.bl || it.bl;
        it.projectStatus = d.projectStatus !== undefined ? d.projectStatus : it.projectStatus;
        
        // Добавлено обновление обложки для веба
        if (d.cover) it.cover = d.cover;
        clearCoverCache();

        it.updatedAt = Date.now();
        save(); render();
        if(document.getElementById('viewModal').classList.contains('on')) openView(it.id);
        toast('Обновлено', 'success');
      };
      window.addEventListener('message', handler);
      
      setTimeout(() => {
        window.removeEventListener('message', handler);
        if(win && !win.closed) win.close();
      }, 10000);
      return;
    }

    if (url.includes('kinogo.')) {
      const proxyUrl = 'https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(url);
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      
      const getText = (el) => el ? el.textContent.trim().replace(/\s+/g, ' ') : '';
      const getMeta = (sel) => doc.querySelector(sel)?.getAttribute('content') || '';

      const fullTitle = getText(doc.querySelector('h1'));
      let cleanTitle = cleanKinogoTitle(fullTitle);
      if (cleanTitle) {
        if (it.parentId) {
          it.title = cleanTitle + ' - Сезон ' + it.seasonNumber;
        } else {
          it.title = cleanTitle;
        }
      }
      
      it.title_en = getText(doc.querySelector('.pmovie__original-title')) || it.title_en;

      let description = getMeta('meta[property="og:description"]') || getMeta('meta[name="description"]');
      const possibleDescSelectors = ['.b-text', '.pmovie__text', '.pmovie__desc', '.full-text', '[itemprop="description"]', '.desc-text', '#full-desc'];
      for (const sel of possibleDescSelectors) {
        const el = doc.querySelector(sel);
        if (el) {
          const txt = getText(el);
          if (txt.length > description.length) description = txt;
        }
      }
      it.description = description || it.description;

      let scrapedCover = getMeta('meta[property="og:image"]');
      if (!scrapedCover) {
        const img = doc.querySelector('.pmovie__poster img, .poster img');
        if (img) {
          const src = img.getAttribute('src') || '';
          const origin = new URL(url).origin;
          scrapedCover = src.startsWith('/') ? origin + src : src;
        }
      }
      if (scrapedCover && !it.cover) it.cover = scrapedCover;

      const yearMatch = fullTitle.match(/\((\d{4})\)/);
      if (yearMatch) it.year = yearMatch[1] || it.year;

      const tags = [];
      doc.querySelectorAll('a[href*="/tags/"], a[href*="/tag/"], [itemprop="genre"] a, .pmovie__tags a').forEach(a => {
          const t = a.textContent.trim();
          if(t && t.length < 30 && !tags.includes(t)) tags.push(t);
      });
      it.tags = tags.length ? tags : it.tags;

      try {
        const titleRu = (it.title || '').trim();
        const titleEn = (it.title_en || '').trim();
        const yearStr = (it.year || '').trim();
        
        let query = titleRu;
        if (titleEn && titleEn.length > 2 && !/[\u0400-\u04FF]/.test(titleEn)) query = titleEn;
        
        let yearParam = yearStr ? `&year=${yearStr}` : '';
        let tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=ru-RU&query=${encodeURIComponent(query)}${yearParam}`;
        
        let tmdbRes = await fetch('https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(tmdbUrl));
        let tmdbJson = await tmdbRes.json();

        if (!tmdbJson.results || tmdbJson.results.length === 0) {
          tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=ru-RU&query=${encodeURIComponent(query)}`;
          tmdbRes = await fetch('https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(tmdbUrl));
          tmdbJson = await tmdbRes.json();
        }
        if ((!tmdbJson.results || tmdbJson.results.length === 0) && query === titleEn && titleRu) {
          tmdbUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=ru-RU&query=${encodeURIComponent(titleRu)}${yearParam}`;
          tmdbRes = await fetch('https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(tmdbUrl));
          tmdbJson = await tmdbRes.json();
        }

        if (tmdbJson.results && tmdbJson.results.length > 0) {
          const best = tmdbJson.results[0];
          if (best.poster_path && !it.customCover) {
            it.cover = TMDB_IMG + '/w780' + best.poster_path;
          }
          const detailsUrl = `https://api.themoviedb.org/3/movie/${best.id}?api_key=${TMDB_KEY}&language=ru-RU&append_to_response=images,external_ids&include_image_language=ru,en,null`;
          const detRes = await fetch('https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(detailsUrl));
          if (detRes.ok) {
            const details = await detRes.json();
            if (typeof extractTmdbPosters === 'function') it.altCovers = extractTmdbPosters(details);
            if (details.external_ids?.imdb_id) it.imdbId = details.external_ids.imdb_id;
          }
        }
      } catch(err) { console.warn('[Kinogo Refresh] TMDB failed:', err); }

      if (it.title_en) {
         try {
           const q = encodeURIComponent(it.title_en.trim());
           const apiUrl = `https://ww8.123moviesfree.net/searching?q=${q}&limit=40&offset=0`;
           const movieProxy = 'https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(apiUrl);
           const mRes = await fetch(movieProxy);
           if (mRes.ok) {
             const mJson = await mRes.json();
             if (mJson.data && mJson.data.length) {
               const bestM = mJson.data.find(item => item.t.toLowerCase() === it.title_en.toLowerCase() && (it.year ? String(item.y) === String(it.year) : true)) || mJson.data[0];
               const typePath = bestM.d === 'm' ? 'movie' : 'season';
               it.link_sub = `https://ww8.123moviesfree.net/${typePath}/${bestM.s}/`;
             }
           }
         } catch(e) { console.warn('[Kinogo Refresh] 123movies failed', e); }
      }
      
    } else {
      const html = await fetchProxied(url);
      const doc = new DOMParser().parseFromString(html, 'text/html');

      if (url.includes('dorama.land')) {
        const fullUrl = url;
        
        const h2 = doc.querySelector('h2.about-serial-header__title');
        const rawTitle = h2 ? cleanDoramaText(h2.textContent) : (doc.querySelector('h1') ? cleanDoramaText(doc.querySelector('h1').textContent) : it.title);
        
        let title = rawTitle.replace(/\s*[\(\[]?\s*(?:сериал|фильм|дорама|дорама-сериал|мини-дорама|лакорн).*/i, '').replace(/\s*[\(\[]?\s*\d{4}\s*[\)\]]?/i, '').replace(/\s*смотреть онлайн.*$/i, '').replace(/\(\s*\)/g, '').trim();
        if (!title) title = it.title;
        
        let country = it.country;
        const countryEl = doc.querySelector('[itemprop="countryOfOrigin"]');
        if (countryEl) country = cleanDoramaText(countryEl.textContent).split('\n')[0].trim();
        
        let description = '';
        const descEl = doc.querySelector('[itemprop="description"]');
        if (descEl) {
          const paragraphs = descEl.querySelectorAll('p');
          if (paragraphs.length > 0) {
            description = Array.from(paragraphs).map(p => cleanDoramaText(p.textContent)).filter(Boolean).join('\n\n');
          } else {
            description = cleanDoramaText(descEl.textContent);
          }
          description = description.replace(/\s*Смотреть дораму.*$/i, '').trim();
        }
        if (!description) {
          const metaDesc = doc.querySelector('meta[itemprop="description"]');
          if (metaDesc) description = cleanDoramaText(metaDesc.getAttribute('content') || '');
        }
        
        const rawGenres = [];
        doc.querySelectorAll('[itemprop="genre"]').forEach(el => {
          const links = el.querySelectorAll('a');
          if (links.length) links.forEach(a => { const t = cleanDoramaText(a.textContent); if (t) rawGenres.push(t); });
          else {
            const text = cleanDoramaText(el.textContent);
            if (text) text.split(/[,;]+/).forEach(c => c.split(/\s*\/\s*/).forEach(p => { const t = cleanDoramaText(p); if (t) rawGenres.push(t); }));
          }
        });
        
        const isBl = /яой|яои|yaoi|слэш|слеш|slash|boys?.?love|боярс|\bbl\b|shounen.?ai|сенен.?ай/i.test(rawGenres.join(' '));
        
        let sTags = [];
        rawGenres.forEach(c => c.split(/\s*\/\s*/).forEach(p => {
          const t = cleanDoramaText(p);
          if (t) sTags.push(t);
        }));
        sTags = [...new Set(sTags)].filter(g => !/^(яой|яои|yaoi|слэш|слеш|slash|bl|boys?\s*love|boys-love|boyslove|боярс)$/i.test(g));
        
        const statusEl = doc.querySelector('.about-serial__status');
        if (statusEl) it.projectStatus = normalizeProjectStatus(statusEl.textContent);

        let doramaYear = '';
        const dateEl = doc.querySelector('meta[itemprop="dateCreated"]');
        if (dateEl) { const m = (dateEl.getAttribute('content') || '').match(/\d{4}/); if (m) doramaYear = m[0]; }
        if (!doramaYear) { const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || ''; const m = ogTitle.match(/(\d{4})/); if (m) doramaYear = m[1]; }
        if (!doramaYear) { const m = rawTitle.match(/(\d{4})/); if (m) doramaYear = m[1]; }
        if (!doramaYear) {
          const bodyText = doc.body.textContent || '';
          const ym = bodyText.match(/Год[:\s]*(\d{4})/i) || bodyText.match(/(\d{4})\s*год/i);
          if (ym) doramaYear = ym[1];
        }
        
        let titleOrig = '';
        const spans = doc.querySelectorAll('span.font-light-18');
        for (const sp of spans) {
          const t = cleanDoramaText(sp.textContent);
          if (/[\u3000-\u9fff\uac00-\ud7af]/.test(t)) { titleOrig = t; break; }
        }
        
        let altTitles = [];
        const altEl = doc.querySelector('[itemprop="alternativeHeadline"]');
        if (altEl) {
          cleanDoramaText(altEl.textContent).split(/\s*\/\s*/).forEach(s => { const t = cleanDoramaText(s); if (t && t.length > 1) altTitles.push(t); });
        }
        let altBlockText = '';
        const h2El = doc.querySelector('h2.about-serial-header__title');
        if (h2El) {
          let sibling = h2El.nextElementSibling;
          for (let i = 0; i < 4 && sibling; i++) {
            const txt = cleanDoramaText(sibling.textContent || '');
            if (txt.length > 10 && txt.split(/\s*\/\s*/).filter(Boolean).length >= 2) { altBlockText = txt; break; }
            sibling = sibling.nextElementSibling;
          }
        }
        if (altBlockText) {
          altBlockText.split(/\s*\/\s*/).forEach(s => { const t = cleanDoramaText(s); if (t && t.length > 1 && !altTitles.includes(t)) altTitles.push(t); });
        }
        
        let tmdb = null;
        if (it.tmdbId) {
          const details = await tmdbDetailsDorama(it.tmdbId, it.type === 'movie' ? 'movie' : 'tv');
          if (details) tmdb = { details, media_type: 'tv' };
        }
        if (!tmdb) {
          if (!altTitles.length || !doramaYear) {
            const slug = (fullUrl || '').replace('https://dorama.land/', '');
            const meta = await fetchDoramaMeta(slug);
            if (meta.raw && !altTitles.length) {
              meta.raw.split(/\s*[\/|]\s*/).forEach(s => {
                const t = cleanDoramaText(s);
                if (t && t.length > 1 && !altTitles.includes(t)) altTitles.push(t);
              });
            }
            if (meta.year && !doramaYear) doramaYear = meta.year;
          }
          const siteData = { title, titleOrig, year: doramaYear, country, altTitles };
          tmdb = await findInTmdbDorama(siteData);
        }
        
        if (!doramaYear && tmdb && tmdb.details) {
          const d = tmdb.details;
          const tmdbYearStr = (d.first_air_date || d.release_date || '').substring(0, 4);
          if (tmdbYearStr) doramaYear = tmdbYearStr;
        }
        
        let cover = it.cover;
        let titleEn = '';
        let tmdbAltTitles = [];
        let newAltCovers = [];

        if (tmdb && tmdb.details) {
          const d = tmdb.details;
          it.tmdbId = d.id;
          if (!it.customCover && d.poster_path) {
            cover = TMDB_IMG + '/w780' + d.poster_path;
          }
          
          const baseLang = (d.original_language || 'en').split('-')[0];
          newAltCovers = await fetchAllTmdbPosters(d.id, 'tv', baseLang);
          
          if (d.alternative_titles) {
            const altList = d.alternative_titles.titles || d.alternative_titles.results || [];
            const enAlt = altList.find(x => {
              if (x.iso_3166_1 !== 'US' && x.iso_3166_1 !== 'GB') return false;
              const t = (x.title || x.name || '').trim();
              if (!t) return false;
              const lowerT = t.toLowerCase();
              if (lowerT.length < 4) return false;
              if (lowerT.includes('season')) return false;
              if (/\d+$/.test(lowerT)) return false;
              if (lowerT.includes(' 2') || lowerT.includes(' 3') || lowerT.includes(' 4')) return false;
              return true;
            });
            if (enAlt) titleEn = enAlt.title || enAlt.name || '';
            
            altList.forEach(x => { 
              const t = (x.title || x.name || '').trim(); 
              if (t && !t.toLowerCase().includes('season') && !/\d+$/.test(t)) tmdbAltTitles.push(t); 
            });
          }
          if (!titleEn && d.translations) {
            const enTr = (d.translations.translations || []).find(t => t.iso_639_1 === 'en' && t.data);
            if (enTr && enTr.data) titleEn = enTr.data.title || enTr.data.name || '';
          }
          if (!titleEn) titleEn = d.original_title || d.original_name || '';
          if (d.external_ids?.imdb_id) it.imdbId = d.external_ids.imdb_id;
        }
        
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
        
        if (it.parentId) {
          const parentSeasons = getSeasons(it.parentId);
          const isMultiSeason = parentSeasons.length > 1;
          
          let sKisskhUrl = '';
          if (allNames.length) {
            const kisskhS = await findSeasonOnKisskh(allNames, doramaYear, it.seasonNumber, isMultiSeason, country);
            if (kisskhS) sKisskhUrl = kisskhS.url;
          }
          
          it.title = title;
          if (titleEn) it.title_en = titleEn + ' ' + toRoman(it.seasonNumber);
          it.description = description;
          if (sTags.length) it.tags = sTags;
          it.year = doramaYear || it.year;
          if (!it.customCover) it.cover = cover;
          it.bl = isBl || it.bl;
          it.link = fullUrl;
          if (sKisskhUrl) it.link_sub = sKisskhUrl;
          it.updatedAt = Date.now();
          toast('Сезон обновлён', 'success');
          
        } else {
          const seasonLinksRaw = [];
          const seenSeasonUrls = new Set();
          const seenSeasonNums = new Set();
          const tryCollectSeasonLink = (a, isStrictSeason) => {
            const href = a.getAttribute('href');
            if (!href) return;
            if (/-seriya\b/i.test(href) || /#subtitry/i.test(href)) return;
            let fullSeasonUrl = href;
            if (!fullSeasonUrl.startsWith('http')) fullSeasonUrl = 'https://dorama.land' + (href.startsWith('/') ? '' : '/') + href;
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
          };

          doc.querySelectorAll('[class*="serial-seasons"] a[href]').forEach(a => tryCollectSeasonLink(a, true));
          doc.querySelectorAll('a.serial-seasons__link[href]').forEach(a => tryCollectSeasonLink(a, true));
          if (seasonLinksRaw.length < 2) doc.querySelectorAll('a[href*="-sezon"]').forEach(a => tryCollectSeasonLink(a, false));
          
          const isMultiSeason = seasonLinksRaw.length > 1;
          
          let mainKisskhUrl = it.link_sub || '';
          if (allNames.length) {
            const kisskh = await findSeasonOnKisskh(allNames, doramaYear, 1, isMultiSeason, country);
            if (kisskh) mainKisskhUrl = kisskh.url;
          }
          
          it.title = title;
          if (titleEn) it.title_en = titleEn;
          it.country = country;
          it.description = description;
          if (statusEl) it.projectStatus = normalizeProjectStatus(statusEl.textContent);
          if (sTags.length) it.tags = sTags;
          it.year = doramaYear || it.year;
          if (!it.customCover) it.cover = cover;
          if (newAltCovers.length) it.altCovers = newAltCovers;
          if (tmdb && tmdb.details) it.tmdbId = tmdb.details.id;
          it.bl = isBl || it.bl;
          it.link = fullUrl;
          if (mainKisskhUrl) it.link_sub = mainKisskhUrl;
          it.updatedAt = Date.now();
          
          const tmdbSeasonsMap = new Map();
          if (tmdb && tmdb.details && Array.isArray(tmdb.details.seasons)) {
            tmdb.details.seasons.forEach(s => {
              if (s.season_number > 0) tmdbSeasonsMap.set(s.season_number, s);
            });
          }
          
          for (const s of seasonLinksRaw) {
            const sNum = parseInt(s.number, 10) || 0;
            let seasonItem = items.find(x =>
              x.parentId === it.id && (parseInt(x.seasonNumber, 10) || 0) === sNum
            );
            if (!seasonItem) {
              seasonItem = items.find(x => x.parentId === it.id && x.sourceUrl && x.sourceUrl === s.url);
            }
                
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
                  
              let sTitleEn = '';
              if (titleEn) sTitleEn = titleEn + ' ' + toRoman(s.number);
                  
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
              if (metaDate) { const ym = (metaDate.getAttribute('content') || '').match(/\d{4}/); if (ym) sYear = ym[0]; }
                  
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
              if (tmdbS && tmdbS.poster_path) sCover = TMDB_IMG + '/w780' + tmdbS.poster_path;
                  
              let sKisskhUrl = '';
              if (allNames.length) {
                const kisskhS = await findSeasonOnKisskh(allNames, sYear || doramaYear, s.number, isMultiSeason);
                if (kisskhS) sKisskhUrl = kisskhS.url;
              }
                  
              let sProjectStatus = '';
              const sStatusEl2 = sDoc.querySelector('.about-serial__status');
              if (sStatusEl2) sProjectStatus = normalizeProjectStatus(sStatusEl2.textContent);

              if (seasonItem) {
                seasonItem.title = sTitle;
                if (sTitleEn) seasonItem.title_en = sTitleEn;
                seasonItem.description = sDesc;
                if (sTags.length) seasonItem.tags = sTags;
                seasonItem.bl = sBl || seasonItem.bl;
                if (sCover && !seasonItem.customCover) seasonItem.cover = sCover;
                seasonItem.link = s.url;
                if (sKisskhUrl) seasonItem.link_sub = sKisskhUrl;
                if (sProjectStatus) seasonItem.projectStatus = sProjectStatus;
                seasonItem.updatedAt = Date.now();
              } else {
                items.push({
                  id: uid(),
                  title: sTitle,
                  title_en: sTitleEn,
                  type: it.type,
                  status: 'want',
                  rating: 0,
                  hearts: 0,
                  year: sYear || doramaYear,
                  country: country,
                  cover: sCover || it.cover,
                  tags: sTags,
                  description: sDesc,
                  notes: '',
                  bl: sBl,
                  pages: '',
                  link: s.url,
                  link_sub: sKisskhUrl,
                  link_extras: '',
                  favorite: false,
                  moments: [],
                  parentId: it.id,
                  seasonNumber: s.number,
                  sourceUrl: s.url,
                  projectStatus: sProjectStatus
                });
              }
            } catch (e) {
              console.warn('[refresh seasons] ошибка для ' + s.url, e.message);
            }
          }
          
          const freshSeasons = getSeasons(it.id);
          if (freshSeasons.length > 0 && freshSeasons[0].year) {
            it.year = freshSeasons[0].year;
          }
        }
      } else if (url.includes('flibusta.club')) {
        const titleEl = doc.querySelector('.book_name h1');
        if(titleEl) it.title = titleEl.textContent.trim();
        const authorEl = doc.querySelector('.row.author .row_content a');
        if(authorEl) it.country = authorEl.textContent.trim();
        const yearEl = doc.querySelector('.row.year_public .row_content');
        if(yearEl) { const m = yearEl.textContent.match(/\d{4}/); if(m) it.year = m[0]; }
        const genreEls = doc.querySelectorAll('.row.genre .row_content a');
        if(genreEls.length) it.tags = Array.from(genreEls).map(a => a.textContent.trim()).filter(Boolean);
        const descEl = doc.querySelector('.b_biblio_book_annotation');
        if(descEl) it.description = descEl.textContent.replace(/\s+/g, ' ').trim();
        
      } else if (url.includes('knigi.ws')) {
        const titleEl = doc.querySelector('h1');
        if(titleEl) it.title = titleEl.textContent.trim().replace(/\s*-\s*читать онлайн.*$/i, '').trim();
        const authorEl = doc.querySelector('a[href*="/avtor/"], .author a, .autor a');
        if(authorEl) it.country = authorEl.textContent.trim();
        const bodyText = doc.body.textContent || '';
        const pagesMatch = bodyText.match(/Страницы:\s*(\d+)/i);
        if(pagesMatch) it.pages = pagesMatch[1];
        const yearMatch = bodyText.match(/Год:\s*(\d{4})/i);
        if(yearMatch) it.year = yearMatch[1];
        const ogDesc = doc.querySelector('meta[property="og:description"]');
        if(ogDesc) it.description = ogDesc.getAttribute('content');
        
      } else if (url.includes('ficbook.net')) {
        // 1. Название
        const titleEl = doc.querySelector('h1');
        if(titleEl) it.title = titleEl.textContent.trim();
      
        // 2. Автор (ищем через dl -> dt -> a, без картинок)
        let author = '';
        const authorDl = Array.from(doc.querySelectorAll('dl.fanfic-inline-info')).find(dl => dl.querySelector('dt')?.textContent.includes('Автор'));
        if (authorDl) author = authorDl.querySelector('dd a[href^="/authors/"]')?.textContent.trim() || '';
        if (author) it.country = author;
      
        // 3. Описание
        const descEl = doc.querySelector('.fanfic-description-text, .description.word-break');
        if (descEl) it.description = descEl.textContent.trim();
      
        // 4. Страницы (из блока "Размер")
        let pages = '';
        const sizeDl = Array.from(doc.querySelectorAll('dl.fanfic-inline-info')).find(dl => dl.querySelector('dt')?.textContent.includes('Размер'));
        if (sizeDl) {
          const pageMatch = sizeDl.querySelector('dd')?.textContent.match(/написано\s*(\d+)\s*страниц/i);
          if (pageMatch) pages = pageMatch[1];
        }
        if (pages) it.pages = pages;
      
        // 5. Год (из блока "Дата обновления")
        let year = '';
        const dateDl = Array.from(doc.querySelectorAll('dl.fanfic-inline-info')).find(dl => dl.querySelector('dt')?.textContent.includes('Дата обновления'));
        if (dateDl) {
          const yearMatch = dateDl.querySelector('dd')?.textContent.match(/\d{4}/);
          if (yearMatch) year = yearMatch[0];
        }
        if (year) it.year = year;
      
        // 6. Обложка (в высоком качестве d_, а не m_)
        let cover = '';
        const pictureEl = doc.querySelector('picture.fanfic-hat-cover-picture');
        if (pictureEl) {
          const desktopSource = pictureEl.querySelector('source[media*="min-width: 481px"]');
          if (desktopSource && desktopSource.getAttribute('srcset')) {
            cover = desktopSource.getAttribute('srcset');
          } else {
            const imgEl = pictureEl.querySelector('img');
            if (imgEl) cover = (imgEl.getAttribute('src') || '').replace('/m_', '/d_');
          }
        }
        // Если пользователь не ставил свою обложку, обновляем её
        if (cover && !it.customCover) it.cover = cover;
      
        // 7. Теги (исправлен баг с пустыми тегами)
        const tags = [];
        doc.querySelectorAll('.tags a.tag, a[href*="/tags/"]').forEach(a => {
            const t = a.textContent.trim();
            if (t && !tags.includes(t)) tags.push(t);
        });
        if (tags.length) it.tags = tags;
      
        // 8. Проверка на BL
        it.bl = isYaoiTags(tags) || /слэш|slash/i.test(it.tags.join(' '));
        
        // Функция clearCoverCache() вызывается ниже по коду `refreshCard`, 
        // так что если обложка сменилась, кэш сам почистится.
        
      } else if (url.includes('fanfics.me')) {
        const titleEl = doc.querySelector('.FicTable_Title h4 a');
        if(titleEl) it.title = titleEl.textContent.trim();
        const authorMatch = (doc.body.textContent || '').match(/Автор:\s*(.*?)(?:\n|Фандом:)/i);
        if(authorMatch) it.country = authorMatch[1].trim();
      } else {
        throw new Error('Источник не поддерживается для обновления');
      }
    }
     // Глобальная проверка кэша обложки перед сохранением
    clearCoverCache();

    const searchName = it.title_en || it.title;
    const isSeriesType = (it.type === 'series' || it.type === 'drama');
    
    if (searchName) {
      try {
        const tempDraft = { link_extras: it.link_extras };
        if (isSeriesType) {
          await autoSearchEZTV(it.imdbId, searchName, null, tempDraft);
        } else {
          const ytsRes = await autoSearchYTS(searchName, it.year, null, tempDraft);
          if (!ytsRes) {
            await autoSearchTorrentClaw(searchName, it.year, null, tempDraft, false);
          }
        }
        if (tempDraft.link_extras) it.link_extras = tempDraft.link_extras;
      } catch(e) { console.warn('[Refresh] Download search failed', e); }
    }

    it.updatedAt = Date.now();
    save();
    render();
    if(document.getElementById('viewModal').classList.contains('on')) openView(it.id);
    toast('Обновлено', 'success');
    
  } catch (e) {
    console.error(e);
    toast('Ошибка обновления: ' + e.message, 'error');
  }
}
  
/**
 * 2. Обновление существующей карточки
 */
async function refreshSlashlibNative(it) {
  const baseUrl = it.link || it.sourceUrl || '';
  const m = baseUrl.match(/\/manga\/([^\/?#]+)/);
  if (!m) { toast('Не удалось определить slug из ссылки', 'error'); return; }
  
  const slug = m[1];
  const token = localStorage.getItem('slashlib_token');
  if (!token) { toast('Нужно войти в Slashlib', 'error'); return; }

  toast('Обновляю из Slashlib API…', 'success');

  try {
    const fields = ['background', 'eng_name', 'otherNames', 'summary', 'releaseDate', 'country', 'authors', 'genres', 'tags'];
    const query = fields.map((f, i) => `fields[${i}]=${f}`).join('&');
    const apiUrl = `https://hapi.hentaicdn.org/api/manga/${slug}?${query}`;

    const res = await fetch(apiUrl, {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Site-Id': '2' }
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const d = json.data;
    if (!d) throw new Error('Пустой ответ API');

    const oldCover = it.cover;

    it.title = d.rus_name || d.name || it.title;
    it.title_en = d.eng_name || it.title_en;
    it.country = d.authors ? d.authors.map(a => a.name).join(', ') : it.country;
    
    // ПАРСИНГ ГОДА
    const getYear = (raw) => {
      if (!raw) return '';
      const m = String(raw).match(/\b(\d{4})\b/);
      return m ? m[1] : String(raw);
    };
    if (d.releaseDate) it.year = getYear(d.releaseDate);

    // ПАРСИНГ ОПИСАНИЯ
    const getSummaryText = (summary) => {
      if (!summary) return '';
      if (typeof summary === 'string') return summary;
      const walk = (node) => {
        if (!node) return '';
        if (node.type === 'text') return node.text || '';
        if (node.type === 'hardBreak') return '\n';
        if (Array.isArray(node.content)) {
          let txt = node.content.map(walk).join('');
          if (node.type === 'paragraph') txt += '\n';
          return txt;
        }
        return '';
      };
      return walk(summary).replace(/\n{3,}/g, '\n\n').trim();
    };
    if (d.summary) it.description = getSummaryText(d.summary);

    const allTags = [];
    if (d.genres) d.genres.forEach(g => allTags.push(g.name));
    if (d.tags) d.tags.forEach(t => allTags.push(t.name));
    if (allTags.length) it.tags = allTags;

    it.bl = isYaoiTags(it.tags);
    if (!it.customCover && d.cover && d.cover.default) {
      it.cover = d.cover.default;
    }

    if (d.status && d.status.label) {
      const s = d.status.label.toLowerCase();
      if (s.includes('онгоинг') || s.includes('выходит')) it.projectStatus = 'ongoing';
      else if (s.includes('завершен')) it.projectStatus = 'completed';
      else if (s.includes('анонс')) it.projectStatus = 'announced';
    }

    // ЗАПРОС ГЛАВ
    try {
      const chRes = await fetch(`https://api.cdnlibs.org/api/manga/${slug}/chapters?limit=500`, {
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Site-Id': '2' }
      });
      if (chRes.ok) {
        const chJson = await chRes.json();
        if (chJson.meta && chJson.meta.total) {
          it.pages = String(chJson.meta.total);
        } else if (Array.isArray(chJson.data)) {
          it.pages = String(chJson.data.length);
        }
      }
    } catch(e) { console.warn('Не удалось получить главы:', e); }

    if (oldCover && oldCover !== it.cover) {
      CoverCache.deleteKey(it.id + '_card');
      CoverCache.deleteKey(it.id + '_full');
      _coverBlobUrls.delete(it.id + '_card');
      _coverBlobUrls.delete(it.id + '_full');
      _coverTriedThisSession.delete(it.id + '_card');
      _coverTriedThisSession.delete(it.id + '_full');
      _manualUrlsOk.delete(oldCover);
    }

    // --- Автопоиск ссылки на Comizy ---
// Используем РУССКОЕ (it.title) + АНГЛИЙСКОЕ (it.title_en) названия.
// НЕ ПЕРЕЗАПИСЫВАЕМ поля карточки.
// --- Автопоиск ссылки на Comizy (exact match по всем именам Slashlib) ---
try {
  // d — это ответ Slashlib API в этой функции; берём все имена
  const slashOtherNames = Array.isArray(d.otherNames)
    ? d.otherNames.map(n => typeof n === 'string' ? n : (n && n.name)).filter(Boolean)
    : [];
  
  const allSlashNames = [
    d.rus_name, d.name, d.eng_name,
    ...slashOtherNames
  ].filter(Boolean);
  
  // Сохраняем в карточке, чтобы использовать при следующем refreshCard
  it.otherNames = slashOtherNames;
  
  const match = await ComizyParser.searchAndMatchByNames(allSlashNames, it.year);
  if (match) {
    it.link_comizy = match.url;
    const keepChapter0 = await ComizyParser.checkSlashlibHasChapter0(it.link);
it.comizyChapters = await ComizyParser.getChapters(match.hid, { keepChapter0 });
  }
} catch(e) { console.warn('Comizy auto-search error', e); }
    
it.updatedAt = Date.now();
save(); 
render();

if (document.getElementById('viewModal').classList.contains('on')) {
  openView(it.id);
}
toast('Обновлено через API Slashlib', 'success');

  } catch(e) {
    console.error('Slashlib API Error:', e);
    toast('Ошибка API: ' + e.message, 'error');
  }
}
