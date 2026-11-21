'use strict';

/* ==========================================================
   media-session.js — Нативный MediaSession (Android) + приём ссылок из VK (vkShareLink)
   ========================================================== */

// Плагин MediaSession (нативный Android-сервис)
const MS = window.Capacitor?.Plugins?.MediaSession || null;
// Фолбэк на браузерный API (десктоп, iOS WebView)
const MS_WEB = ('mediaSession' in navigator) ? navigator.mediaSession : null;

  // Слушаем ссылки, которыми поделились из VK X

window.addEventListener('vkShareLink', async (e) => {
  const { text, title, html } = e.detail || {};
  const fullText = text || html || '';
  
  const urlMatch = fullText.match(/https:\/\/(?:m\.)?vk\.(?:com|ru)\/audio(-?\d+)_(\d+)(?:_\w+)?/);
  if (!urlMatch) {
    toast('Ссылка на VK аудио не найдена', 'warn');
    return;
  }

  const audioId = `${urlMatch[1]}_${urlMatch[2]}`;
  const originalUrl = urlMatch[0];
  const CHttp = window.Capacitor?.Plugins?.CapacitorHttp;

  if (!CHttp) return toast('Нет доступа к нативным запросам', 'error');

  const token = localStorage.getItem('vk_token');
  if (!token) {
    toast('Введите токен VK в настройках категории', 'warn');
    return;
  }

  toast('Загружаю данные трека...', 'success');

  try {
    // 1. Метаданные трека через VK API
    const vkUrl = `https://api.vk.com/method/audio.getById?audios=${audioId}&access_token=${token}&v=5.131`;
    const vkRes = await CHttp.get({ url: vkUrl });
    let vkJson = typeof vkRes.data === 'string' ? JSON.parse(vkRes.data) : vkRes.data;
    
    if (!vkJson.response || !vkJson.response[0]) throw new Error('VK API не вернул данные');
    const track = vkJson.response[0];
    
    const cleanTitle = (track.title || '').trim();
    const cleanArtist = (track.artist || '').trim();
    if (!cleanTitle) throw new Error('VK вернул трек без названия (приватный или удалён)');
    track.title = cleanTitle;
    track.artist = cleanArtist || 'Неизвестный исполнитель';

    // 2. Обложка
    let coverUrl = '';
    if (track.album && track.album.thumb) {
      const t = track.album.thumb;
      coverUrl = t.photo_1200 || t.photo_600 || t.photo_300 || '';
    }

    // 3. Текст песни через lrclib (plain + synced)
    let lyrics = '';
    let lyricsLrc = '';
    try {
      const lyricsUrl = `https://lrclib.net/api/search?artist_name=${encodeURIComponent(track.artist)}&track_name=${encodeURIComponent(track.title)}`;
      const lRes = await CHttp.get({ url: lyricsUrl });
      let lData = typeof lRes.data === 'string' ? JSON.parse(lRes.data) : lRes.data;
      if (lData && lData.length > 0) {
        lyricsLrc = lData[0].syncedLyrics || '';
        lyrics = lData[0].plainLyrics || '';
        if (!lyrics && lyricsLrc) {
          lyrics = lyricsLrc.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]\s*/g, '').trim();
        }
      }
    } catch(lyricsErr) {
      console.warn('[VK Share] lrclib failed:', lyricsErr);
    }

    // 4. Новый трек
    const newItem = {
      id: uid(),
      title: track.title,
      country: track.artist,
      type: 'music',
      status: 'want',
      rating: 0,
      hearts: 0,
      year: '',
      tags: [],
      notes: '',
      bl: false,
      pages: '',
      link: originalUrl,
      link_sub: track.url || '',
      link_extras: '',
      cover: coverUrl,
      description: lyrics,
      lyricsLrc: lyricsLrc,
      favorite: false,
      moments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentId: null,
      seasonNumber: 0
    };

    items.push(newItem);
    
    // 5. Переключаем вкладку, если трек не будет виден
    if (state.category !== 'all' && state.category !== 'music') {
      state.category = 'music';
      state.search = '';
      state.typeFilter = null;
      state.tagFilter = null;
      const searchInp = document.getElementById('search');
      if (searchInp) searchInp.value = '';
      updateSearchClear();
      saveCat();
      renderTabs();
    }
    state.search = '';
    state.typeFilter = null;
    state.tagFilter = null;
    state.favOnly = false;
    state.blOnly = false;
    
    save();
    render();
    toast(`Добавлено: ${track.artist}`, 'success');

  } catch(err) {
    console.error('VK Share Error:', err);
    toast('Ошибка VK: ' + err.message, 'error');
  }
});
