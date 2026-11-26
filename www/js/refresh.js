'use strict';
/* ==========================================================
   refresh.js — Обновление карточки из источников:
   refreshCard, refreshSlashlibNative
   ========================================================== */

async function refreshCard(id) {
  const it = items.find(x => x.id === id);
  if (!it) return;

  const comizySlugOf = (u) => (String(u || '').match(/comizy\.io\/([^/?#\s]+)/i) || [])[1] || '';
  const primaryUrl = it.link || it.sourceUrl || '';
  const isSlashlibCard = it.link && it.link.includes('shlib.life');
  const hasComizy = !!(it.link_comizy && comizySlugOf(it.link_comizy));

  // ═══ Comizy — только ДОБАВКА к карточке с другим основным источником ═══
  // Ссылку Comizy можно подложить руками, но карточка от этого «карточкой Comizy» не становится:
  // обновляем только главы, поля (название, обложка, описание…) не трогаем.
  if (hasComizy && primaryUrl) {
    try {
      const cDetails = await ComizyParser.getMangaDetails(comizySlugOf(it.link_comizy));
      if (cDetails && cDetails.hid) {
        const keepChapter0 = await ComizyParser.checkSlashlibHasChapter0(primaryUrl);
        const fresh = await ComizyParser.getChapters(cDetails.hid, { keepChapter0 });
        if (fresh && fresh.length) it.comizyChapters = fresh;
      }
    } catch (e) {
      console.warn('Comizy chapters refresh failed:', e);
    }

    if (isSlashlibCard) {
      const token = localStorage.getItem('slashlib_token');
      if (!token) {
        save();
        toast('Нужно войти в Slashlib', 'error');
        return;
      }
      toast('Обновляю со Slashlib и Comizy...', 'success');
      return refreshSlashlibNative(it);
    }
    // иной основной источник — идём дальше обычным путём (главы Comizy уже свежие)
  }

  // Карточка целиком из Comizy
  if (hasComizy && !primaryUrl) {
    toast('Обновляю из Comizy...', 'success');
    const slug = comizySlugOf(it.link_comizy);
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
      if (document.getElementById('viewModal').classList.contains('on')) openView(it.id);
      toast('Обновлено из Comizy', 'success');
      return;
    }
  }

  const url = it.link || it.sourceUrl;
  const oldCover = it.cover;

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

  // ═══ Нет ссылки на источник — обновляем по названию ═══
  if (!url) {
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

      // ═══ Comizy: гибрид или автопоиск ═══
      const _isSlashlibCard = it.link && it.link.includes('shlib.life');
      const _isComizyCard = it.link_comizy && it.link_comizy.includes('comizy.io');

      if (_isComizyCard && _isSlashlibCard) {
        toast('Обновляю главы из Comizy...', 'success');
        try {
          const slug = comizySlugOf(it.link_comizy);
          const cDetails = await ComizyParser.getMangaDetails(slug);
          if (cDetails) {
            it.comizyChapters = await ComizyParser.getChapters(cDetails.hid);
            it.updatedAt = Date.now();
            save(); render();
            if (document.getElementById('viewModal').classList.contains('on')) openView(it.id);
            toast('Главы обновлены (' + it.comizyChapters.length + ')', 'success');
            return;
          }
        } catch (e) {
          toast('Ошибка обновления Comizy: ' + e.message, 'error');
          return;
        }
      } else if (!_isComizyCard && !it.comizyOff && !it.comizyLocked && groupOf(it.type) === 'comic') {
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
        } catch (e) { console.warn('Comizy auto-search error', e); }
      }

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
      if (document.getElementById('viewModal').classList.contains('on')) openView(it.id);
      toast('Обновлено', 'success');
    } catch (e) {
      toast('Ошибка: ' + e.message, 'error');
    }
    return;
  }

  toast('Обновляю данные...', 'success');

  try {
    /* ============ SLASHLIB (веб-мост) ============ */
    if (url.includes('shlib.life')) {
      const win = window.open(url + (url.includes('?') ? '&' : '?') + 'polka_bridge=detail', '_blank');
      if (!win) throw new Error('Заблокировано всплывающее окно');

      const handler = (e) => {
        if (!e.data || e.data.type !== 'POLKA_SLASHLIB_DETAIL_RESULT') return;
        window.removeEventListener('message', handler);
        if (win && !win.closed) win.close();
        const d = e.data.data;
        if (!d) { toast('Ошибка обновления: нет данных', 'error'); return; }
        it.title = d.title || it.title;
        it.title_en = d.title_en || it.title_en;
        it.year = d.year || it.year;
        it.country = d.country || it.country;
        it.tags = d.tags || it.tags;
        it.description = d.description || it.description;
        it.pages = d.pages || it.pages;
        it.bl = d.bl || it.bl;
        it.projectStatus = d.projectStatus !== undefined ? d.projectStatus : it.projectStatus;
        if (d.cover) it.cover = d.cover;
        clearCoverCache();
        it.updatedAt = Date.now();
        save(); render();
        if (document.getElementById('viewModal').classList.contains('on')) openView(it.id);
        toast('Обновлено', 'success');
      };
      window.addEventListener('message', handler);
      setTimeout(() => {
        window.removeEventListener('message', handler);
        if (win && !win.closed) win.close();
      }, 10000);
      return;
    }

    /* ============ KINOGO ============ */
    if (url.includes('kinogo.')) {
      const res = await fetch(tmdbProxy(url));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const getText = (el) => el ? el.textContent.trim().replace(/\s+/g, ' ') : '';
      const getMeta = (sel) => {
        const el = doc.querySelector(sel);
        return el ? (el.getAttribute('content') || '') : '';
      };

      const fullTitle = getText(doc.querySelector('h1'));
      const cleanTitle = cleanKinogoTitle(fullTitle);
      if (cleanTitle) {
        if (it.parentId) it.title = cleanTitle + ' - Сезон ' + it.seasonNumber;
        else it.title = cleanTitle;
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

      const yearMatch = fullTitle.match(/(\d{4})/);
      if (yearMatch) it.year = yearMatch[1] || it.year;

      const tags = [];
      doc.querySelectorAll('a[href*="/tags/"], a[href*="/tag/"], [itemprop="genre"] a, .pmovie__tags a').forEach(a => {
        const t = a.textContent.trim();
        if (t && t.length < 30 && !tags.includes(t)) tags.push(t);
      });
      it.tags = tags.length ? tags : it.tags;

      // --- TMDB: ищем по своему типу и не берём результат мимо года ---
      try {
        const titleRu = (it.title || '').trim();
        const titleEn = (it.title_en || '').trim();
        const yearStr = String(it.year || '').trim();
        const tmdbType = (it.type === 'series' || it.type === 'drama') ? 'tv' : 'movie';
        const yearKey = tmdbType === 'tv' ? 'first_air_date_year' : 'year';

        let query = titleRu;
        if (titleEn && titleEn.length > 2 && !/[\u0400-\u04FF]/.test(titleEn)) query = titleEn;

        const searchUrl = (q, withYear) =>
          'https://api.themoviedb.org/3/search/' + tmdbType
          + '?api_key=' + TMDB_KEY
          + '&language=ru-RU&query=' + encodeURIComponent(q)
          + (withYear && yearStr ? '&' + yearKey + '=' + yearStr : '');

        const runSearch = async (q, withYear) => {
          const r = await fetch(tmdbProxy(searchUrl(q, withYear)));
          if (!r.ok) return [];
          const j = await r.json();
          return j.results || [];
        };

        let found = await runSearch(query, true);
        if (!found.length) found = await runSearch(query, false);
        if (!found.length && query === titleEn && titleRu) found = await runSearch(titleRu, true);
        if (!found.length && query === titleEn && titleRu) found = await runSearch(titleRu, false);

        if (found.length) {
          const ranked = rankTmdbResults(found, yearStr);
          const ty = parseInt(yearStr) || 0;
          const best = ranked.find(r => {
            if (!ty) return true;
            const y = parseInt((r.release_date || r.first_air_date || '').substring(0, 4)) || 0;
            return !y || Math.abs(y - ty) <= 1;
          }) || ranked[0];

          if (best.poster_path && !it.customCover) it.cover = TMDB_IMG + '/w780' + best.poster_path;
          it.tmdbId = best.id;

          const details = await tmdbDetails(best.id, tmdbType);
          if (details) {
            const baseLang = (details.original_language || 'en').split('-')[0];
            let posters = [];
            try {
              posters = await fetchAllTmdbPosters(details.id, tmdbType, baseLang, details.poster_path);
            } catch (e) { posters = []; }
            if (!posters.length) posters = extractTmdbPosters(details);
            if (posters.length) it.altCovers = posters;
            if (details.external_ids && details.external_ids.imdb_id) it.imdbId = details.external_ids.imdb_id;
          }
        }
      } catch (err) { console.warn('[Kinogo Refresh] TMDB failed:', err); }

      // --- 123movies ---
      if (it.title_en) {
        try {
          const q = encodeURIComponent(it.title_en.trim());
          const apiUrl = 'https://ww8.123moviesfree.net/searching?q=' + q + '&limit=40&offset=0';
          const mRes = await fetch(tmdbProxy(apiUrl));
          if (mRes.ok) {
            const mJson = await mRes.json();
            if (mJson.data && mJson.data.length) {
              const bestM = mJson.data.find(item =>
                item.t.toLowerCase() === it.title_en.toLowerCase()
                && (it.year ? String(item.y) === String(it.year) : true)
              ) || mJson.data[0];
              const typePath = bestM.d === 'm' ? 'movie' : 'season';
              it.link_sub = 'https://ww8.123moviesfree.net/' + typePath + '/' + bestM.s + '/';
            }
          }
        } catch (e) { console.warn('[Kinogo Refresh] 123movies failed', e); }
      }

    } else {
      /* ============ ОСТАЛЬНЫЕ ИСТОЧНИКИ ============ */
      const html = await fetchProxied(url);
      const doc = new DOMParser().parseFromString(html, 'text/html');

      /* ---------- DORAMA.LAND ---------- */
      if (url.includes('dorama.land')) {
        const fullUrl = url;
        const h2 = doc.querySelector('h2.about-serial-header__title');
        const rawTitle = h2
          ? cleanDoramaText(h2.textContent)
          : (doc.querySelector('h1') ? cleanDoramaText(doc.querySelector('h1').textContent) : it.title);

        let title = rawTitle
          .replace(/\s*[\(\[]?\s*(?:сериал|фильм|дорама|дорама-сериал|мини-дорама|лакорн).*/i, '')
          .replace(/\s*[\(\[]?\s*\d{4}\s*[\)\]]?/i, '')
          .replace(/\s*смотреть онлайн.*$/i, '')
          .replace(/\(\s*\)/g, '')
          .trim();
        if (!title) title = it.title;

        let country = it.country;
        const countryEl = doc.querySelector('[itemprop="countryOfOrigin"]');
        if (countryEl) country = cleanDoramaText(countryEl.textContent).split('\n')[0].trim();

        let description = '';
        const descEl = doc.querySelector('[itemprop="description"]');
        if (descEl) {
          const paragraphs = descEl.querySelectorAll('p');
          description = paragraphs.length
            ? Array.from(paragraphs).map(p => cleanDoramaText(p.textContent)).filter(Boolean).join('\n\n')
            : cleanDoramaText(descEl.textContent);
          description = description.replace(/\s*Смотреть\s+дораму\s*$/i, '').trim();
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
            if (text) text.split(/[,;]+/).forEach(c => c.split(/\s*\/\s*/).forEach(p => {
              const t = cleanDoramaText(p);
              if (t) rawGenres.push(t);
            }));
          }
        });
        const isBl = /яой|яои|yaoi|слэш|слеш|slash|boys?.?love|боярс|\bbl\b|shounen.?ai|с[её]н[её]н.?ай/i.test(rawGenres.join(' '));
        let sTags = [];
        rawGenres.forEach(c => c.split(/\s*\/\s*/).forEach(p => {
          const t = cleanDoramaText(p);
          if (t) sTags.push(t);
        }));
        sTags = [...new Set(sTags)].filter(g => !/^(яой|яои|yaoi|слэш|слеш|slash|bl|boys?\s*love|boys-love|boyslove|боярс)$/i.test(g));

        const statusEl = doc.querySelector('.about-serial__status');
        if (statusEl) it.projectStatus = normalizeProjectStatus(statusEl.textContent);

        // Год: «Год:» и og:title в приоритете, dateCreated-штамп игнорируется
        let doramaYear = doramaYearFromDoc(doc, rawTitle);

        let titleOrig = '';
        const spans = doc.querySelectorAll('span.font-light-18');
        for (const sp of spans) {
          const t = cleanDoramaText(sp.textContent);
          if (/[\u3000-\u9fff\uac00-\ud7af]/.test(t)) { titleOrig = t; break; }
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
          altBlockText.split(/\s*\/\s*/).forEach(s => {
            const t = cleanDoramaText(s);
            if (t && t.length > 1 && !altTitles.includes(t)) altTitles.push(t);
          });
        }

        // --- TMDB: сохранённый id проверяется внутри findInTmdbDorama ---
        let tmdb = null;
        if (it.type === 'movie' && it.tmdbId) {
          const details = await tmdbDetailsDorama(it.tmdbId, 'movie');
          if (details) tmdb = { details, media_type: 'movie' };
        } else {
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
          tmdb = await findInTmdbDorama({
            title, titleOrig, year: doramaYear, country, altTitles, tmdbId: it.tmdbId
          });
        }

        if (!doramaYear && tmdb && tmdb.details) {
          const tmdbYearStr = (tmdb.details.first_air_date || tmdb.details.release_date || '').substring(0, 4);
          if (tmdbYearStr) doramaYear = tmdbYearStr;
        }

        let cover = it.cover;
        let titleEn = '';
        let tmdbAltTitles = [];
        let newAltCovers = [];

        if (tmdb && tmdb.details) {
          const d = tmdb.details;
          it.tmdbId = d.id;
          if (!it.customCover && d.poster_path) cover = TMDB_IMG + '/w780' + d.poster_path;

          const baseLang = (d.original_language || 'en').split('-')[0];
          try {
            newAltCovers = await fetchAllTmdbPosters(d.id, 'tv', baseLang, d.poster_path);
          } catch (e) { newAltCovers = []; }
          if (!newAltCovers.length) newAltCovers = extractTmdbPosters(d);

          titleEn = tmdbEnTitle(d, altTitles.concat([titleOrig, title]));

          const altList = (d.alternative_titles && (d.alternative_titles.titles || d.alternative_titles.results)) || [];
          altList.forEach(x => {
            const t = (x.title || x.name || '').trim();
            if (t && !t.toLowerCase().includes('season') && !/\d+$/.test(t)) tmdbAltTitles.push(t);
          });

          if (d.external_ids && d.external_ids.imdb_id) it.imdbId = d.external_ids.imdb_id;
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
          /* ---- Карточка отдельного сезона ---- */
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
          /* ---- Основная карточка + сезоны ---- */
          const seasonLinksRaw = [];
          const seenSeasonUrls = new Set();
          const seenSeasonNums = new Set();

          const tryCollectSeasonLink = (a, isStrictSeason) => {
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
          };

          doc.querySelectorAll('[class*="serial-seasons"] a[href]').forEach(a => tryCollectSeasonLink(a, true));
          doc.querySelectorAll('a.serial-seasons__link[href]').forEach(a => tryCollectSeasonLink(a, true));
          if (seasonLinksRaw.length < 2) {
            doc.querySelectorAll('a[href*="-sezon"]').forEach(a => tryCollectSeasonLink(a, false));
          }
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
            let seasonItem = items.find(x => x.parentId === it.id && (parseInt(x.seasonNumber, 10) || 0) === sNum);
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

              // Год сезона — со страницы сезона, без штампа генерации
              const sYear = doramaSeasonYear(sDoc);

              let sTagsSeason = [];
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
                sTagsSeason = [...new Set(rawS)].filter(g => !/^(яой|яои|yaoi|слэш|слеш|slash|bl|boys?\s*love|boys-love|boyslove|боярс)$/i.test(g));
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
              const sStatusEl2 = sDoc.querySelector('.about-serial__status');
              if (sStatusEl2) sProjectStatus = normalizeProjectStatus(sStatusEl2.textContent);

              if (seasonItem) {
                seasonItem.title = sTitle;
                if (sTitleEn) seasonItem.title_en = sTitleEn;
                seasonItem.description = sDesc;
                if (sTagsSeason.length) seasonItem.tags = sTagsSeason;
                seasonItem.bl = sBl || seasonItem.bl;
                if (sYear) seasonItem.year = sYear;
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
                  tags: sTagsSeason,
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

          // Год основной карточки сезонами НЕ перетираем — только запасной вариант
          if (!doramaYear) {
            const freshSeasons = getSeasons(it.id);
            if (freshSeasons.length > 0 && freshSeasons[0].year) it.year = freshSeasons[0].year;
          }
        }

      /* ---------- FLIBUSTA ---------- */
      } else if (url.includes('flibusta.club')) {
        const titleEl = doc.querySelector('.book_name h1');
        if (titleEl) it.title = titleEl.textContent.trim();
        const authorEl = doc.querySelector('.row.author .row_content a');
        if (authorEl) it.country = authorEl.textContent.trim();
        const yearEl = doc.querySelector('.row.year_public .row_content');
        if (yearEl) { const m = yearEl.textContent.match(/\d{4}/); if (m) it.year = m[0]; }
        const genreEls = doc.querySelectorAll('.row.genre .row_content a');
        if (genreEls.length) it.tags = Array.from(genreEls).map(a => a.textContent.trim()).filter(Boolean);
        const descBook = doc.querySelector('.b_biblio_book_annotation');
        if (descBook) it.description = descBook.textContent.replace(/\s+/g, ' ').trim();

      /* ---------- KNIGI.WS ---------- */
      } else if (url.includes('knigi.ws')) {
        const titleEl = doc.querySelector('h1');
        if (titleEl) it.title = titleEl.textContent.trim().replace(/\s*[-–—]\s*читать онлайн.*$/i, '').trim();
        const authorEl = doc.querySelector('a[href*="/avtor/"], .author a, .autor a');
        if (authorEl) it.country = authorEl.textContent.trim();
        const bodyText = doc.body.textContent || '';
        const pagesMatch = bodyText.match(/Страницы:\s*(\d+)/i);
        if (pagesMatch) it.pages = pagesMatch[1];
        const yearMatch = bodyText.match(/Год:\s*(\d{4})/i);
        if (yearMatch) it.year = yearMatch[1];
        const ogDesc = doc.querySelector('meta[property="og:description"]');
        if (ogDesc) it.description = ogDesc.getAttribute('content');

      /* ---------- FICBOOK ---------- */
      } else if (url.includes('ficbook.net')) {
        const titleEl = doc.querySelector('h1');
        if (titleEl) it.title = titleEl.textContent.trim();

        let author = '';
        const authorDl = Array.from(doc.querySelectorAll('dl.fanfic-inline-info'))
          .find(dl => { const dt = dl.querySelector('dt'); return dt && dt.textContent.includes('Автор'); });
        if (authorDl) {
          const a = authorDl.querySelector('dd a[href^="/authors/"]');
          author = a ? a.textContent.trim() : '';
        }
        if (author) it.country = author;

        const descFic = doc.querySelector('.fanfic-description-text, .description.word-break');
        if (descFic) it.description = descFic.textContent.trim();

        let pages = '';
        const sizeDl = Array.from(doc.querySelectorAll('dl.fanfic-inline-info'))
          .find(dl => { const dt = dl.querySelector('dt'); return dt && dt.textContent.includes('Размер'); });
        if (sizeDl) {
          const dd = sizeDl.querySelector('dd');
          const pageMatch = dd ? dd.textContent.match(/написано\s*(\d+)\s*страниц/i) : null;
          if (pageMatch) pages = pageMatch[1];
        }
        if (pages) it.pages = pages;

        let year = '';
        const dateDl = Array.from(doc.querySelectorAll('dl.fanfic-inline-info'))
          .find(dl => { const dt = dl.querySelector('dt'); return dt && dt.textContent.includes('Дата обновления'); });
        if (dateDl) {
          const dd = dateDl.querySelector('dd');
          const yearMatch = dd ? dd.textContent.match(/\d{4}/) : null;
          if (yearMatch) year = yearMatch[0];
        }
        if (year) it.year = year;

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
        if (cover && !it.customCover) it.cover = cover;

        const tags = [];
        doc.querySelectorAll('.tags a.tag, a[href*="/tags/"]').forEach(a => {
          const t = a.textContent.trim();
          if (t && !tags.includes(t)) tags.push(t);
        });
        if (tags.length) it.tags = tags;

        it.bl = isYaoiTags(tags) || /слэш|slash/i.test((it.tags || []).join(' '));

      /* ---------- FANFICS.ME ---------- */
      } else if (url.includes('fanfics.me')) {
        const titleEl = doc.querySelector('.FicTable_Title h4 a');
        if (titleEl) it.title = titleEl.textContent.trim();
        const authorMatch = (doc.body.textContent || '').match(/Автор:\s*(.*?)(?:\n|Фандом:)/i);
        if (authorMatch) it.country = authorMatch[1].trim();

      } else {
        throw new Error('Источник не поддерживается для обновления');
      }
    }

    /* ============ ФИНАЛ: кэш обложки + ссылки на скачивание ============ */
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
          if (!ytsRes) await autoSearchTorrentClaw(searchName, it.year, null, tempDraft, false);
        }
        if (tempDraft.link_extras) it.link_extras = tempDraft.link_extras;
      } catch (e) { console.warn('[Refresh] Download search failed', e); }
    }

    it.updatedAt = Date.now();
    save();
    render();
    if (document.getElementById('viewModal').classList.contains('on')) openView(it.id);
    toast('Обновлено', 'success');

  } catch (e) {
    console.error(e);
    toast('Ошибка обновления: ' + e.message, 'error');
  }
}

/* ==========================================================
   Обновление карточки Slashlib через нативный API
   ========================================================== */
async function refreshSlashlibNative(it) {
  const baseUrl = it.link || it.sourceUrl || '';
  const m = baseUrl.match(/\/manga\/([^/?#]+)/);
  if (!m) { toast('Не удалось определить slug из ссылки', 'error'); return; }
  const slug = m[1];

  const token = localStorage.getItem('slashlib_token');
  if (!token) { toast('Нужно войти в Slashlib', 'error'); return; }

  toast('Обновляю из Slashlib API…', 'success');

  try {
    const fields = ['background', 'eng_name', 'otherNames', 'summary', 'releaseDate', 'country', 'authors', 'genres', 'tags'];
    const query = fields.map((f, i) => 'fields[' + i + ']=' + f).join('&');
    const apiUrl = 'https://hapi.hentaicdn.org/api/manga/' + slug + '?' + query;

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
    if (d.releaseDate) it.year = slashlibYear(d.releaseDate);
    if (d.summary) it.description = slashlibSummaryText(d.summary);

    const allTags = [];
    if (d.genres) d.genres.forEach(g => allTags.push(g.name));
    if (d.tags) d.tags.forEach(t => allTags.push(t.name));
    if (allTags.length) it.tags = allTags;
    it.bl = isYaoiTags(it.tags);

    if (!it.customCover && d.cover && d.cover.default) it.cover = d.cover.default;

    const pStatus = parseSlashlibStatus(d.status);
    if (pStatus) it.projectStatus = pStatus;

    const chapterCount = await fetchSlashlibChapterCount(slug, token);
    if (chapterCount) it.pages = chapterCount;

    if (oldCover && oldCover !== it.cover) {
      CoverCache.deleteKey(it.id + '_card');
      CoverCache.deleteKey(it.id + '_full');
      _coverBlobUrls.delete(it.id + '_card');
      _coverBlobUrls.delete(it.id + '_full');
      _coverTriedThisSession.delete(it.id + '_card');
      _coverTriedThisSession.delete(it.id + '_full');
      _manualUrlsOk.delete(oldCover);
    }

    // --- Автопоиск ссылки на Comizy по всем именам Slashlib ---
    try {
      const slashOtherNames = Array.isArray(d.otherNames)
        ? d.otherNames.map(n => typeof n === 'string' ? n : (n && n.name)).filter(Boolean)
        : [];
      const allSlashNames = [d.rus_name, d.name, d.eng_name, ...slashOtherNames].filter(Boolean);
      it.otherNames = slashOtherNames;

      // Закреплённую руками (comizyLocked) или убранную (comizyOff) ссылку не трогаем
      if (!it.comizyLocked && !it.comizyOff) {
        const match = await ComizyParser.searchAndMatchByNames(allSlashNames, it.year);
        if (match) {
          it.link_comizy = match.url;
          const keepChapter0 = await ComizyParser.checkSlashlibHasChapter0(it.link);
          it.comizyChapters = await ComizyParser.getChapters(match.hid, { keepChapter0 });
        }
      }
    } catch (e) { console.warn('Comizy auto-search error', e); }

    it.updatedAt = Date.now();
    save();
    render();
    if (document.getElementById('viewModal').classList.contains('on')) openView(it.id);
    toast('Обновлено через API Slashlib', 'success');

  } catch (e) {
    console.error('Slashlib API Error:', e);
    toast('Ошибка API: ' + e.message, 'error');
  }
}