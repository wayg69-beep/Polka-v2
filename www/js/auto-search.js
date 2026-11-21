'use strict';

/* ==========================================================
   auto-search.js — Автопоиск торрентов/ссылок: TorrentClaw, EZTV, YTS, Kinogo, 123movies
   ========================================================== */

async function autoSearchTorrentClaw(title, year, panel, draft, isSeries) {
  if (!title) return;
  console.log(`[TorrentClaw] Ищу: "${title}" (${year || 'без года'}) | Тип: ${isSeries ? 'show' : 'movie'}`);
  
  const q = encodeURIComponent(title.trim());
  const type = isSeries ? 'show' : 'movie';
  // Ищем с сортировкой по сидам, чтобы взять самый живой торрент
  const apiUrl = `https://torrentclaw.com/api/v1/search?q=${q}&type=${type}&limit=10&sort=seeders`;
  const proxyUrl = 'https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(apiUrl);
  
  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    const json = await res.json();
    const results = json.results || [];
    
    if (!results.length) {
      console.log('[TorrentClaw] Ничего не найдено.');
      return;
    }
    
    // Берем первый результат (API уже отсортировал по сидам)
    const bestContent = results[0];
    
    if (!bestContent.torrents || !bestContent.torrents.length) {
      console.log('[TorrentClaw] У контента нет торрентов.');
      return;
    }
    
    const trackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.tracker.cl:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://open.stealth.si:80/announce',
      'udp://exodus.desync.com:6969/announce',
      'udp://open.demonii.com:1337/announce'
    ];
    
    const linksMap = {};
    
    bestContent.torrents.forEach(t => {
      // Берем качество из сырого названия (парсим 1080p, 720p и т.д.)
      let quality = 'unknown';
      const titleStr = (t.rawTitle || '').toLowerCase();
      if (titleStr.includes('2160p') || titleStr.includes('4k')) quality = '2160p';
      else if (titleStr.includes('1080p')) quality = '1080p';
      else if (titleStr.includes('720p')) quality = '720p';
      else if (titleStr.includes('480p')) quality = '480p';
      
      // Если качество определилось и еще нет такой таблетки — сохраняем
      if (quality !== 'unknown' && !linksMap[quality]) {
        let magnet = t.magnetUrl;
        
        // Если magnetUrl нет (без API-ключа) — строим сами из infoHash
        if (!magnet && t.infoHash) {
          const dn = encodeURIComponent((bestContent.title || 'video').replace(/\s+/g, '.'));
          const tr = trackers.map(tr => encodeURIComponent(tr)).join('&tr=');
          magnet = `magnet:?xt=urn:btih:${t.infoHash}&dn=${dn}&tr=${tr}`;
        }
        
        if (magnet) {
          linksMap[quality] = magnet;
        }
      }
    });
    
    if (Object.keys(linksMap).length === 0) {
      console.log('[TorrentClaw] Не удалось собрать ни одной magnet-ссылки (возможно, нет хешей).');
      return;
    }
    
    const extrasData = 'json:' + JSON.stringify(linksMap);
    
    if (panel) {
      const extrasInput = panel.querySelector('#f_link_extras');
      if (extrasInput) extrasInput.value = extrasData;
    }
    if (draft) draft.link_extras = extrasData;
    
    console.log('[TorrentClaw] Успех! Найдены качества:', Object.keys(linksMap));
    toast('Ссылки на скачивание (TorrentClaw) найдены', 'success');
    return extrasData;
    
  } catch(e) {
    console.error('[TorrentClaw] Ошибка:', e.message || e);
  }
}

  
async function autoSearchEZTV(imdbId, titleEn, panel, draft) {
  // EZTV требует IMDb ID (tt1234567). Если его нет — ищем через TMDB
  if (!imdbId) {
    console.log('[EZTV] Нет IMDb ID, пробую получить через TMDB...');
    try {
      const searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(titleEn)}`;
      const res = await fetch('https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(searchUrl));
      const json = await res.json();
      const match = json.results?.[0];
      if (!match) return;
      const extUrl = `https://api.themoviedb.org/3/tv/${match.id}/external_ids?api_key=${TMDB_KEY}`;
      const extRes = await fetch('https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(extUrl));
      const ext = await extRes.json();
      imdbId = ext.imdb_id;
    } catch (e) { return; }
  }
  if (!imdbId) return;

  console.log(`[EZTV] Ищу по IMDb: ${imdbId}`);
  const apiUrl = `https://eztvx.to/api/get-torrents?limit=100&imdb_id=${imdbId.replace('tt', '')}`;
  const proxyUrl = 'https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(apiUrl);

  try {
    const res = await fetch(proxyUrl);
    const json = await res.json();
    const torrents = json.torrents || [];
    if (!torrents.length) {
      console.log('[EZTV] По этому IMDb ничего нет.');
      return;
    }

    const trackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.tracker.cl:1337/announce',
      'udp://tracker.openbittorrent.com:6969/announce'
    ];
    const linksMap = {};

    torrents.forEach(t => {
      let quality = 'unknown';
      const tStr = t.title.toLowerCase();
      if (tStr.includes('2160p') || tStr.includes('4k')) quality = '2160p';
      else if (tStr.includes('1080p')) quality = '1080p';
      else if (tStr.includes('720p')) quality = '720p';
      else if (tStr.includes('480p')) quality = '480p';

      if (quality !== 'unknown' && !linksMap[quality] && t.magnet_url) {
        // Добавляем дополнительные трекеры, если их нет
        let magnet = t.magnet_url;
        if (!magnet.includes('&tr=')) {
          const tr = trackers.map(tr => encodeURIComponent(tr)).join('&tr=');
          magnet += `&tr=${tr}`;
        }
        linksMap[quality] = magnet;
      }
    });

    if (!Object.keys(linksMap).length) return;
    const extrasData = 'json:' + JSON.stringify(linksMap);
    if (panel) {
      const input = panel.querySelector('#f_link_extras');
      if (input) input.value = extrasData;
    }
    if (draft) draft.link_extras = extrasData;
    console.log('[EZTV] Успех:', Object.keys(linksMap));
    toast('Ссылки EZTV найдены', 'success');
  } catch (e) {
    console.error('[EZTV] Ошибка:', e);
  }
}

  
  

async function autoSearchYTS(titleEn, year, panel, draft) {
  if (!titleEn) return;
  console.log(`[YTS] Ищу: "${titleEn}" (${year || 'без года'})`);
  
  const q = encodeURIComponent(titleEn.trim());
  const apiUrl = `https://yts.gg/api/v2/list_movies.json?query_term=${q}&limit=10`;
  const proxyUrl = 'https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(apiUrl);
  
  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    const json = await res.json();
    
    if (json.status !== 'ok' || !json.data || !json.data.movies || !json.data.movies.length) {
      console.log('[YTS] Ничего не найдено.');
      return;
    }
    
    const cleanEn = titleEn.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Сначала ищем с годом, если он есть
    let bestMatch = json.data.movies.find(m => {
      const mTitle = (m.title_english || m.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const isTitleMatch = mTitle.includes(cleanEn) || cleanEn.includes(mTitle);
      const isYearMatch = year ? String(m.year) === String(year) : true;
      return isTitleMatch && isYearMatch;
    });
    
    // Если с годом не нашли, ищем только по названию
    if (!bestMatch) {
      bestMatch = json.data.movies.find(m => {
        const mTitle = (m.title_english || m.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return mTitle.includes(cleanEn) || cleanEn.includes(mTitle);
      });
    }
    
    // Если совсем ничего похожего, берём первый
    if (!bestMatch) bestMatch = json.data.movies[0];
    
    if (bestMatch && bestMatch.torrents && bestMatch.torrents.length) {
      const trackers = [
        'udp://open.demonii.com:1337/announce',
        'udp://tracker.openbittorrent.com:80',
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://tracker.coppersurfer.tk:6969'
      ];
      
      const linksMap = {};
      
      bestMatch.torrents.forEach(t => {
        if (t.quality && t.hash) {
          const magnet = `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(bestMatch.title_long || bestMatch.title)}&tr=${trackers.map(tr => encodeURIComponent(tr)).join('&tr=')}`;
          linksMap[t.quality] = magnet;
        }
      });
      
      const extrasData = 'json:' + JSON.stringify(linksMap);
      
      if (panel) {
        const extrasInput = panel.querySelector('#f_link_extras');
        if (extrasInput) extrasInput.value = extrasData;
      }
      if (draft) draft.link_extras = extrasData;
      
      console.log('[YTS] Успех! Найдены качества:', Object.keys(linksMap));
      toast('Ссылки на скачивание (YTS) найдены', 'success');
      return extrasData;
    } else {
      console.log('[YTS] Фильм найден, но торрентов нет.');
    }
  } catch(e) {
    console.error('[YTS] Ошибка:', e.message || e);
  }
}
  
  async function autoSearchKinogo(titleRu, titleEn, year) {
  if (!titleRu) return null;
  
  const q = encodeURIComponent(titleRu.trim());
  const url = 'https://kinogo.pl/index.php?do=search&subaction=search&titleonly=3&story=' + q;
  const proxyUrl = 'https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(url);

  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) return null;
    
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const cards = doc.querySelectorAll('.card.d-flex');

    if (!cards.length) return null;

    let bestMatch = null;
    const cleanRu = titleRu.toLowerCase().replace(/[^a-zа-яё0-9]/g, '');

    for (const card of cards) {
      const a = card.querySelector('h2.card__title a');
      if (!a) continue;
      
      const cTitle = a.textContent.trim();
      const cClean = cTitle.toLowerCase().replace(/[^a-zа-яё0-9]/g, '');

      // Проверяем совпадение названия (хотя бы частичное)
      if (cClean.includes(cleanRu) || cleanRu.includes(cClean)) {
        bestMatch = a.href;
        
        // Если в названии карточки есть год, проверяем его
        if (year && cTitle.includes(year)) {
          return bestMatch; // Идеальное совпадение по названию и году
        }
      }
    }

    // Если точного совпадения с годом нет, но название подошло, возвращаем первый найденный
    if (bestMatch) return bestMatch;
    
    // Если совсем ничего не подошло по буквам, но карточки есть, берем первую
    return cards[0].querySelector('h2.card__title a')?.href || null;

  } catch(e) {
    console.error('Kinogo auto search error:', e);
    return null;
  }
  }
  
async function autoSearch123Movies(titleEn, year, panel, draft) {
  if (!titleEn) return;
  const query = encodeURIComponent(titleEn.trim());
  const searchUrl = `https://ww8.123moviesfree.net/searching?q=${query}&limit=40&offset=0`;
  
  try {
    const res = await fetch('https://polka-proxy.foress-tfiree.workers.dev/?url=' + encodeURIComponent(searchUrl));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    const json = await res.json();
    if (!json.data || !json.data.length) {
      console.log('123movies: ничего не найдено.');
      return;
    }

    const cleanEn = titleEn.toLowerCase().replace(/[^a-z0-9]/g, '');
    const bestMatch = json.data.find(r => {
       const t = r.t.toLowerCase().replace(/[^a-z0-9]/g, '');
       return t.includes(cleanEn) || cleanEn.includes(t);
    }) || json.data[0];

    if (bestMatch) {
      const typePath = bestMatch.d === 'm' ? 'movie' : 'season';
      const finalUrl = `https://ww8.123moviesfree.net/${typePath}/${bestMatch.s}/`;
      if (panel) {
        const subInput = panel.querySelector('#f_link_sub');
        if (subInput) subInput.value = finalUrl;
      }
      if (draft) draft.link_sub = finalUrl;
    }
  } catch(e) {
    console.error('123movies Error:', e);
  }
}
