'use strict';

/* ==========================================================
   player.js — Плеер: Player (мини-плеер, модалка, плейлист, тексты)
   ========================================================== */

  
  /* =========================================
   ДВИЖОК ПЛЕЕРА "ПОЛКА" (v2 - С автообновлением ссылок)
   ========================================= */
// Заглушка для треков без обложки (data-URI SVG с нотой)
const MUSIC_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect width="100" height="100" fill="#1e1e28"/>' +
    '<g transform="translate(20,20) scale(2.5)" fill="none" stroke="#55556a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9 18V5l12-2v13"/>' +
      '<circle cx="6" cy="18" r="3"/>' +
      '<circle cx="18" cy="16" r="3"/>' +
    '</g>' +
  '</svg>'
);
  
const Player = {
  audio: new Audio(),
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  repeatMode: 0,
  currentTrackId: null,
  _fetchingLink: false,
  _fetchingTrackId: null, // ← ДОБАВИТЬ ВОТ СЮДА
  _draggedEl: null,
  _isClosing: false,

  init() {
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('play', () => {
  this.isPlaying = true;
  this.updateUI();
  this._msSetPlaybackState('playing');
});
this.audio.addEventListener('pause', () => {
  this.isPlaying = false;
  this.updateUI();
  this._msSetPlaybackState('paused');
});
    
    this.audio.addEventListener('error', () => {
      if (this._isClosing) return;
      const track = items.find(i => i.id === this.currentTrackId);
      if (track && track.link) {
        toast('Ссылка устарела, обновляю...', 'warn');
        this.refreshVkLink(track);
      } else {
        toast('Ошибка воспроизведения', 'error');
      }
    });
    
const timelineWrap = document.getElementById('playerTimelineWrap');
const timelineBar  = document.getElementById('playerTimeline');
if (timelineWrap && timelineBar) {
  const seekTo = (clientX) => {
    if (!this.audio.duration) return;
    const rect = timelineBar.getBoundingClientRect();   // ← считаем от полоски, не от wrap
    let pct = (clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));
    this.audio.currentTime = pct * this.audio.duration;
    const fill = document.getElementById('playerTimelineFill');
    const thumb = document.getElementById('playerTimelineThumb');
    if (fill) fill.style.width = (pct * 100) + '%';
    if (thumb) thumb.style.left = (pct * 100) + '%';
  };
  let dragging = false;
  timelineWrap.addEventListener('pointerdown', (e) => {
    dragging = true;
    try { timelineWrap.setPointerCapture(e.pointerId); } catch(err){}
    seekTo(e.clientX);
  });
  timelineWrap.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    seekTo(e.clientX);
  });
  timelineWrap.addEventListener('pointerup', (e) => {
    dragging = false;
    try { timelineWrap.releasePointerCapture(e.pointerId); } catch(err){}
  });
  timelineWrap.addEventListener('pointercancel', () => { dragging = false; });
}

    // Перетаскивание прогресса на мини-плеере
    const miniProgressWrap = document.getElementById('miniProgressWrap');
    if (miniProgressWrap) {
      let isDraggingMini = false;
      
      const updateMiniProgress = (clientX) => {
        if (!this.audio.duration) return;
        const rect = miniProgressWrap.getBoundingClientRect();
        let pct = (clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        this.audio.currentTime = pct * this.audio.duration;
        const mini = document.getElementById('miniProgress');
        if (mini) mini.style.width = (pct * 100) + '%';
      };

      miniProgressWrap.addEventListener('pointerdown', (e) => {
        isDraggingMini = true;
        try { miniProgressWrap.setPointerCapture(e.pointerId); } catch(err){}
        updateMiniProgress(e.clientX);
      });

      miniProgressWrap.addEventListener('pointermove', (e) => {
        if (!isDraggingMini) return;
        updateMiniProgress(e.clientX);
      });

      miniProgressWrap.addEventListener('pointerup', (e) => {
        isDraggingMini = false;
        try { miniProgressWrap.releasePointerCapture(e.pointerId); } catch(err){}
      });

      miniProgressWrap.addEventListener('pointercancel', () => {
        isDraggingMini = false;
      });
    }

    // Системные кнопки (наушники, шторка, островок)
const msAct = async (action, handler) => {
  if (MS) {
    try { await MS.setActionHandler({ action }, handler); } catch(e) { console.warn('[MS] action', action, e); }
  } else if (MS_WEB) {
    try { MS_WEB.setActionHandler(action, handler); } catch(e) {}
  }
};
msAct('play', () => this.togglePlay());
msAct('pause', () => this.togglePlay());
msAct('previoustrack', () => this.prev());
msAct('nexttrack', () => this.next());
msAct('stop', () => this.close());
msAct('seekto', (d) => {
  if (d.seekTime != null && this.audio.duration) {
    this.audio.currentTime = Math.max(0, Math.min(d.seekTime, this.audio.duration));
    this._msSetPositionState();
  }
});
msAct('seekbackward', (d) => {
  this.audio.currentTime = Math.max(0, this.audio.currentTime - (d.seekOffset || 10));
  this._msSetPositionState();
});
msAct('seekforward', (d) => {
  this.audio.currentTime = Math.min(this.audio.duration || 0, this.audio.currentTime + (d.seekOffset || 10));
  this._msSetPositionState();
});
    this.initSwipeDown();

    
    // Пользователь реально скроллит (двигает палец/колесо), а не просто тапает
const lyricsContentEl = document.getElementById('playerLyricsContent');
if (lyricsContentEl) {
  const markUserScroll = () => {
    if (this._lyricsUserScrolled) return;
    if (!this._lrcLines || !this._lrcLines.length) return;
    this._lyricsUserScrolled = true;
    const btn = document.getElementById('playerLyricsSyncBtn');
    if (btn) btn.classList.add('show');
  };
  
  // touchmove и wheel срабатывают ТОЛЬКО при движении, тап по тексту их не триггерит
  lyricsContentEl.addEventListener('touchmove', markUserScroll, { passive: true });
  lyricsContentEl.addEventListener('wheel', markUserScroll, { passive: true });

  // 🎯 ТАП ПО СТРОКЕ = ПЕРЕМОТКА
  lyricsContentEl.addEventListener('click', (e) => {
    const p = e.target.closest('p[data-i]');
    if (!p) return;
    if (!this._lrcLines || !this._lrcLines.length) return;
    const idx = +p.dataset.i;
    const line = this._lrcLines[idx];
    if (!line || !isFinite(line.t)) return;

    this.audio.currentTime = Math.max(0, line.t);

    // Сбрасываем индекс и принудительно пересчитываем
    this._activeLyricIdx = -1;
    this._updateLyricsHighlight();

    // Плавно центрируем строку
    requestAnimationFrame(() => {
      const lines = lyricsContentEl.querySelectorAll('p');
      if (lines[idx]) this._scrollLyricToCenter(lines[idx]);
    });
  });
}
    // Надёжный обработчик тапа по инфо мини-плеера
const miniInfo = document.getElementById('miniInfo');
if (miniInfo) {
  miniInfo.onclick = (e) => {
    e.stopPropagation();
    this.openModal();
  };
}
  },

initSwipeDown() {
  const modal = document.getElementById('playerModal');
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  modal.addEventListener('touchstart', (e) => {
    // Если открыт текст — не свайпаем модалку
    if (modal.classList.contains('lyrics-open')) return;
    // Игнорируем кнопки и таймлайн
    if (e.target.closest('button') || e.target.closest('.player-timeline-wrap')) return;
    
    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = true;
    modal.style.transition = 'none';
  }, { passive: true });

  modal.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    
    if (deltaY > 0) {
      if (e.cancelable) e.preventDefault();
      modal.style.transform = `translateY(${deltaY}px)`;
      modal.style.opacity = 1 - (deltaY / 500);
    }
  }, { passive: false });

modal.addEventListener('touchend', () => {
  if (!isDragging) return;
  isDragging = false;
  const deltaY = currentY - startY;
  modal.style.transition = '';
  
  // Всегда чистим инлайн-стили — иначе они перебьют CSS-transition при следующем minimize
  modal.style.transform = '';
  modal.style.opacity = '';
  
  if (deltaY > 120) {
    this.minimize();
  }
});
},

openPlaylist() {
  document.getElementById('playlistModal').classList.add('on');
  this.renderPlaylist();
},

closePlaylist() {
  document.getElementById('playlistModal').classList.remove('on');
},
  
  playFromCard(trackId, categoryTracks) {
    if (!categoryTracks) {
      categoryTracks = items.filter(i => i.type === 'music');
    }
    this.queue = categoryTracks.map(t => t.id);
    this.currentIndex = this.queue.indexOf(trackId);
    if (this.currentIndex === -1) {
      this.queue.unshift(trackId);
      this.currentIndex = 0;
    }

    const closeBtn = document.getElementById('viewClose');
    if (closeBtn) {
      closeBtn.click();
    } else {
      const vm = document.getElementById('viewModal');
      if (vm) vm.classList.remove('on');
    }

    this.loadAndPlay(trackId);
  },

async loadAndPlay(trackId) {
  this._isClosing = false;
  this.currentTrackId = trackId;
  const track = items.find(i => i.id === trackId);
  if (!track) return;
  
  // СРАЗУ ставим на паузу старый трек, чтобы он не играл, пока мы грузим новый
  try { this.audio.pause(); } catch(e) {}
  
  this.updateUI();
  document.body.classList.add('player-active');
  
  // 1. Сначала метаданные
  await this._msSetMetadata(track);
  // 2. Активируем сессию в 'paused' — Android покажет трек и обложку в шторке
  await this._msSetPlaybackState('paused');
  
  // Проверяем и vk.com, и vk.ru
  if (track.link && /vk\.(com|ru)\/audio/i.test(track.link)) {
    await this.refreshVkLink(track);
  } else if (track.link_sub) {
    this.audio.src = track.link_sub;
    try { this.audio.load(); } catch(e) {}
    this.playAudio();
  } else {
    toast('Нет ссылки для воспроизведения', 'error');
  }
},
  
  async playAudio() {
    try {
      await this.audio.play();
      document.body.classList.add('player-active');
    } catch (err) {
      console.warn('Play error:', err);
      if (err.name === 'NotAllowedError') return;
      const track = items.find(i => i.id === this.currentTrackId);
      if (track && track.link_sub) {
        this.audio.src = track.link_sub;
        this.audio.play().catch(e => console.error('Fallback play failed', e));
      }
    }
  },

async refreshVkLink(track) {
    // Если трек уже переключили, не тратим время на запрос к VK
    if (this.currentTrackId !== track.id) return;
    
    // Если мы УЖЕ грузим ссылку для ЭТОГО ЖЕ трека — не делаем дубль
    if (this._fetchingLink && this._fetchingTrackId === track.id) return;
    
    this._fetchingLink = true;
    this._fetchingTrackId = track.id;
    
    try {
      const match = track.link.match(/audio(-?\d+)_(\d+)/);
      if (!match) throw new Error('Нет ID трека в ссылке');
      const audioId = `${match[1]}_${match[2]}`;
      const token = localStorage.getItem('vk_token');
      if (!token) throw new Error('Нет токена VK');
      const CHttp = window.Capacitor?.Plugins?.CapacitorHttp;
      if (!CHttp) throw new Error('Нет CapacitorHttp');
      
      const res = await CHttp.get({ url: `https://api.vk.com/method/audio.getById?audios=${audioId}&access_token=${token}&v=5.131` });
      const json = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      
      if (!json.response || !json.response[0] || !json.response[0].url) throw new Error('VK не вернул mp3');
      const newUrl = json.response[0].url;
      
      track.link_sub = newUrl;
      save(); 
      
      // Проверяем, не переключил ли пользователь трек, пока мы делали запрос
      if (this.currentTrackId !== track.id) return;

      await this._msSetMetadata(track);
      
      this.audio.src = newUrl;
      try { this.audio.load(); } catch(e) {}
      await this.playAudio();
    } catch (e) {
      console.warn('VK update failed:', e);
      // Показываем ошибку или играем фоллбэк, ТОЛЬКО если это всё ещё текущий трек
      if (this.currentTrackId === track.id) {
        if (track.link_sub) {
          this.audio.src = track.link_sub;
          this.playAudio();
        } else {
          toast('Не удалось получить аудио', 'error');
        }
      }
    } finally {
      if (this._fetchingTrackId === track.id) {
        this._fetchingLink = false;
        this._fetchingTrackId = null;
      }
    }
},
  
  togglePlay() {
    if (this.audio.paused) this.audio.play().catch(() => this.playAudio());
    else this.audio.pause();
  },

  next() {
    if (!this.queue.length) return;
    this.currentIndex++;
    if (this.currentIndex >= this.queue.length) this.currentIndex = 0;
    this.loadAndPlay(this.queue[this.currentIndex]);
  },

prev() {
  if (!this.queue.length) return;
  
  // Стандартное поведение плеера:
  // >3 сек проиграно → в начало трека
  // ≤3 сек → предыдущий трек
  if (this.audio.currentTime > 3) {
    this.audio.currentTime = 0;
    this.updateProgress();
    return;
  }
  
  this.currentIndex--;
  if (this.currentIndex < 0) this.currentIndex = this.queue.length - 1;
  this.loadAndPlay(this.queue[this.currentIndex]);
},
  
  onEnded() {
    if (this.repeatMode === 2) {
      this.audio.currentTime = 0; this.audio.play();
    } else if (this.repeatMode === 1) {
      this.next();
    } else {
      if (this.currentIndex < this.queue.length - 1) this.next();
      else { this.isPlaying = false; this.updateUI(); }
    }
  },

  cycleRepeat() {
    this.repeatMode = (this.repeatMode + 1) % 3;
    
    const btn = document.getElementById('playerRepeatBtn');
    const bigBadge = document.getElementById('playerRepeatBadge');
    if (btn) {
      btn.classList.toggle('on', this.repeatMode > 0);
      btn.style.color = this.repeatMode > 0 ? '' : 'var(--fg2)';
    }
    if (bigBadge) bigBadge.classList.toggle('visible', this.repeatMode === 2);

    const miniBtn = document.getElementById('miniRepeatBtn');
    const miniBadge = document.getElementById('miniRepeatBadge');
    if (miniBtn) miniBtn.classList.toggle('on', this.repeatMode > 0);
    if (miniBadge) miniBadge.classList.toggle('visible', this.repeatMode === 2);
    
    if (this.repeatMode === 0) toast('Повтор выключен');
    else if (this.repeatMode === 1) toast('Повтор плейлиста');
    else toast('Повтор трека');
  },

  toggleFav() {
    const track = items.find(i => i.id === this.currentTrackId);
    if (!track) return;
    track.favorite = !track.favorite;
    track.updatedAt = Date.now();
    save();
    this.updateUI();
    toast(track.favorite ? 'Добавлено в избранное' : 'Убрано из избранного');
  },

toggleLyrics() {
  const modal = document.getElementById('playerModal');
  if (!modal) return;
  const isOpening = !modal.classList.contains('lyrics-open');
  
  const coverCol = modal.querySelector('.player-cover-col');
  const controlsCol = modal.querySelector('.player-controls-col');
  const elements = [coverCol, controlsCol].filter(el => {
    if (!el) return false;
    return getComputedStyle(el).display !== 'none';
  });
  
  if (!elements.length) {
    modal.classList.toggle('lyrics-open');
    return;
  }
  
  const first = elements.map(el => el.getBoundingClientRect());
  
  if (isOpening) modal.classList.add('lyrics-open');
  else modal.classList.remove('lyrics-open');
  
  void modal.offsetWidth;
  
  elements.forEach((el, i) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const last = el.getBoundingClientRect();
    if (last.width === 0 || last.height === 0) return;
    
    const dx = first[i].left - last.left;
    const dy = first[i].top - last.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    void el.offsetWidth;
    requestAnimationFrame(() => {
      el.style.transition = 'transform 0.42s cubic-bezier(0.25, 1, 0.5, 1)';
      el.style.transform = '';
    });
  });
  
  // При открытии текста — сразу прокрутить к активной строке
  if (isOpening) {
    requestAnimationFrame(() => {
      const contentEl = document.getElementById('playerLyricsContent');
      if (!contentEl) return;
      const lines = contentEl.querySelectorAll('p');
      if (this._activeLyricIdx >= 0 && lines[this._activeLyricIdx]) {
        // Мгновенный скролл (без smooth), чтобы не конфликтовал с FLIP
        const cr = contentEl.getBoundingClientRect();
        const lr = lines[this._activeLyricIdx].getBoundingClientRect();
        contentEl.scrollTop = contentEl.scrollTop + (lr.top - cr.top) - (cr.height / 2) + (lr.height / 2);
      }
      this._lyricsUserScrolled = false;
      const btn = document.getElementById('playerLyricsSyncBtn');
      if (btn) btn.classList.remove('show');
    });
  }
},
  
  updateProgress() {
    if (!this.audio.duration) return;
    const cur = this.audio.currentTime;
    const tot = this.audio.duration;
    const pct = (cur / tot) * 100;
    
    const mini = document.getElementById('miniProgress');
    if (mini) mini.style.width = pct + '%';
    
    const fill = document.getElementById('playerTimelineFill');
    const thumb = document.getElementById('playerTimelineThumb');
    if (fill) fill.style.width = pct + '%';
    if (thumb) thumb.style.left = pct + '%';
    
    const timeCur = document.getElementById('playerTimeCur');
    const timeTot = document.getElementById('playerTimeTot');
    if (timeCur) timeCur.textContent = this.formatTime(cur);
    if (timeTot) timeTot.textContent = this.formatTime(tot);
    this._updateLyricsHighlight();
    this._msSetPositionState();
  },

_updateLyricsHighlight() {
  if (!this._lrcLines || !this._lrcLines.length) return;
  // ⏩ Подсвечиваем строку ЗА 350 мс до её начала, чтобы глаз успел прочитать
  // до того, как её запоют. Иначе глазеешь на прошлую строку, пока звучит новая.
  const LOOKAHEAD = 0.35;
  const t = this.audio.currentTime + LOOKAHEAD;

  // Бинарный поиск: последняя строка с t <= currentTime+lookahead
  let lo = 0, hi = this._lrcLines.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (this._lrcLines[mid].t <= t) { idx = mid; lo = mid + 1; }
    else hi = mid - 1;
  }

  if (idx === this._activeLyricIdx) return;
  this._activeLyricIdx = idx;

  const contentEl = document.getElementById('playerLyricsContent');
  if (!contentEl) return;
  const lines = contentEl.querySelectorAll('p');
  lines.forEach((p, i) => p.classList.toggle('active', i === idx));

  // Автоскролл, если пользователь не перехватил
  if (!this._lyricsUserScrolled && idx >= 0 && lines[idx]) {
    this._scrollLyricToCenter(lines[idx]);
  }
},
  
_scrollLyricToCenter(lineEl) {
  const contentEl = document.getElementById('playerLyricsContent');
  if (!contentEl || !lineEl) return;
  const contentRect = contentEl.getBoundingClientRect();
  const lineRect = lineEl.getBoundingClientRect();
  const targetTop = contentEl.scrollTop
    + (lineRect.top - contentRect.top)
    - (contentRect.height / 2)
    + (lineRect.height / 2);
  contentEl.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
},

syncLyrics() {
  this._lyricsUserScrolled = false;
  const btn = document.getElementById('playerLyricsSyncBtn');
  if (btn) btn.classList.remove('show');
  
  const contentEl = document.getElementById('playerLyricsContent');
  if (!contentEl) return;
  const lines = contentEl.querySelectorAll('p');
  if (this._activeLyricIdx >= 0 && lines[this._activeLyricIdx]) {
    this._scrollLyricToCenter(lines[this._activeLyricIdx]);
  }
},

  formatTime(sec) {
    if (isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

async _msSetMetadata(track) {
  if (!track) return;
  const title = track.title || '';
  if (!title || !title.trim()) return;   // ← не ставим пустые метаданные
  const artwork = track.cover ? [{
    src: track.cover,
    sizes: '512x512',
    type: 'image/jpeg'
  }] : [];
  
  const data = {
    title: title,
    artist: track.country || 'Полка',
    album: 'Полка',
    artwork: artwork
  };
  
  if (MS) {
    try { await MS.setMetadata(data); } catch(e) { console.warn('[MS] setMetadata', e); }
  } else if (MS_WEB) {
    try { MS_WEB.metadata = new MediaMetadata(data); } catch(e) { console.warn('[MS_WEB] metadata', e); }
  }
},
  
async _msSetPlaybackState(state) {
  if (MS) {
    try { await MS.setPlaybackState({ playbackState: state }); } catch(e) { console.warn('[MS] setPlaybackState', e); }
  } else if (MS_WEB) {
    try { MS_WEB.playbackState = state; } catch(e) { console.warn('[MS_WEB] playbackState', e); }
  }
},

async _msSetPositionState() {
  const a = this.audio;
  if (!a.duration || isNaN(a.duration)) return;
  const pos = {
    duration: a.duration,
    playbackRate: a.playbackRate || 1,
    position: Math.min(a.currentTime, a.duration)
  };
  if (MS) {
    try { await MS.setPositionState(pos); } catch(e) { /* игнорим частые ошибки duration */ }
  } else if (MS_WEB && MS_WEB.setPositionState) {
    try { MS_WEB.setPositionState(pos); } catch(e) {}
  }
},

  updateUI() {
    if (this.currentIndex === -1 || !this.queue.length) return;
    const track = items.find(i => i.id === this.currentTrackId);
    if (!track) return;

    const playSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    const pauseSvg = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    
    const miniPlay = document.getElementById('miniPlayBtn');
    const bigPlay = document.getElementById('playerBigPlayBtn');
    if (miniPlay) miniPlay.innerHTML = this.isPlaying ? pauseSvg : playSvg;
    if (bigPlay) bigPlay.innerHTML = this.isPlaying ? pauseSvg : playSvg;

    
    const miniCoverEl = document.getElementById('miniCover');
    if (miniCoverEl) {
      miniCoverEl.onerror = () => { miniCoverEl.onerror = null; miniCoverEl.src = MUSIC_PLACEHOLDER; };
      miniCoverEl.src = track.cover || MUSIC_PLACEHOLDER;
    }
    document.getElementById('miniTitle').textContent = track.title;
    document.getElementById('miniArtist').textContent = track.country || 'Исполнитель';
    
    const bigCoverEl = document.getElementById('playerBigCover');
    if (bigCoverEl) {
      bigCoverEl.onerror = () => { bigCoverEl.onerror = null; bigCoverEl.src = MUSIC_PLACEHOLDER; };
      bigCoverEl.src = track.cover || MUSIC_PLACEHOLDER;
    }
    document.getElementById('playerBigTitle').textContent = track.title;
    document.getElementById('playerBigArtist').textContent = track.country || 'Исполнитель';
    document.getElementById('playerBigTitle').textContent = track.title;
    document.getElementById('playerBigArtist').textContent = track.country || 'Исполнитель';

    const favBtn = document.getElementById('playerBigFav');
    if (favBtn) favBtn.classList.toggle('on', !!track.favorite);
    
    const miniFav = document.getElementById('miniFavBtn');
    if (miniFav) miniFav.classList.toggle('on', !!track.favorite);
    
    const miniRep = document.getElementById('miniRepeatBtn');
    const miniRepBadge = document.getElementById('miniRepeatBadge');
    if (miniRep) miniRep.classList.toggle('on', this.repeatMode > 0);
    if (miniRepBadge) miniRepBadge.classList.toggle('visible', this.repeatMode === 2);

    const bigRep = document.getElementById('playerRepeatBtn');
    const bigRepBadge = document.getElementById('playerRepeatBadge');
    if (bigRep) bigRep.classList.toggle('on', this.repeatMode > 0);
    if (bigRepBadge) bigRepBadge.classList.toggle('visible', this.repeatMode === 2);

    const lyricsContent = document.getElementById('playerLyricsContent');
if (lyricsContent) {
  // Сброс состояния караоке
  this._activeLyricIdx = -1;
  this._lyricsUserScrolled = false;
  const syncBtn = document.getElementById('playerLyricsSyncBtn');
  if (syncBtn) syncBtn.classList.remove('show');
  
  // Парсим LRC, если есть
  this._lrcLines = track.lyricsLrc ? parseLrc(track.lyricsLrc) : [];
  
  if (this._lrcLines.length) {
    lyricsContent.innerHTML = this._lrcLines
      .map((l, i) => `<p data-i="${i}">${esc(l.text)}</p>`)
      .join('');
  } else {
    const text = track.description || 'Текст не найден...';
    lyricsContent.innerHTML = text.split('\n').filter(l => l.trim())
      .map(line => `<p>${esc(line)}</p>`).join('');
  }
  lyricsContent.scrollTop = 0;
  this._updateLyricsHighlight(); // сразу подсветить текущую строку
}
  },

openModal() {
  // Сначала рисуем плейлист — если он падает, плеер всё равно откроется
  try { this.renderPlaylist(); }
  catch(e) { console.error('[Player.openModal] renderPlaylist:', e); }
  
  const modal = document.getElementById('playerModal');
  if (modal) modal.classList.add('on');
  document.body.classList.add('player-modal-open');
  // modal-open выставит updateScrollLock через MutationObserver
},
  
minimize() {
  const modal = document.getElementById('playerModal');
  if (modal) modal.classList.remove('on');
  document.body.classList.remove('player-modal-open');
  // modal-open убирает updateScrollLock через MutationObserver
},
  
close() {
  this._isClosing = true;
  this.audio.pause();
  // НЕ трогаем audio.src и НЕ вызываем audio.load() — на Android WebView
  // после этого следующий play() не стартует и src не перезагружается.
  // Просто паузим, а при следующем playFromCard src перезапишется.

  this.queue = [];
  this.currentIndex = -1;
  this.currentTrackId = null;
  this.isPlaying = false;
  this._fetchingLink = false;

  document.body.classList.remove('player-active', 'player-modal-open');

  const modal = document.getElementById('playerModal');
  if (modal) {
    modal.classList.remove('on', 'lyrics-open');
    modal.style.transform = '';
    modal.style.opacity = '';
    modal.style.transition = '';
  }
  
  const plModal = document.getElementById('playlistModal');
  if (plModal) plModal.classList.remove('on');

  const miniProgress = document.getElementById('miniProgress');
  if (miniProgress) miniProgress.style.width = '0%';
  const fill = document.getElementById('playerTimelineFill');
  const thumb = document.getElementById('playerTimelineThumb');
  if (fill) fill.style.width = '0%';
  if (thumb) thumb.style.left = '0%';


  // MediaSession — просто гасим, метаданные не трогаем
// (если стереть — при следующем треке плагин не сможет оживить сессию)
this._msSetPlaybackState('none');
if (MS_WEB) {
  try { MS_WEB.metadata = null; } catch(e) {}
}

  toast('Плеер остановлен');
},
  

  renderPlaylist() {
    const listEl = document.getElementById('playerPlaylistList');
    if (!listEl) return;
    
    listEl.innerHTML = this.queue.map((id, idx) => {
  const t = items.find(i => i.id === id);
  if (!t) return '';
  const isActive = idx === this.currentIndex;
  const coverSrc = t.cover || MUSIC_PLACEHOLDER;
  return `
    <div class="playlist-item ${isActive ? 'active' : ''}" data-id="${id}" data-idx="${idx}">
      <img class="playlist-item-cover" src="${coverSrc}" alt="" onerror="this.onerror=null;this.src='${MUSIC_PLACEHOLDER}'">
      <div class="playlist-item-text">
        <div class="playlist-item-title">${esc(t.title)}</div>
        <div class="playlist-item-artist">${esc(t.country || 'Исполнитель')}</div>
      </div>
      <div class="playlist-item-drag-handle">≡</div>
    </div>
  `;
}).join('');

    this.bindPlaylistEvents();
  },

  bindPlaylistEvents() {
    const listEl = document.getElementById('playerPlaylistList');
    if (!listEl) return;
    let pressTimer = null;

    listEl.querySelectorAll('.playlist-item').forEach(el => {
  // Блокируем синтетический click, чтобы он не всплыл и не открыл что-то лишнее
  el.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  el.addEventListener('pointerup', (e) => {
    if (el.classList.contains('dragging')) return;
    e.stopPropagation();
    
    const id = el.dataset.id;
    this.currentIndex = this.queue.indexOf(id);
    
    // Запоминаем ТЕКУЩЕЕ состояние: открыт ли большой плеер?
    const wasBigOpen = document.getElementById('playerModal').classList.contains('on');
    
    this.loadAndPlay(id);
    this.closePlaylist();
    
    // Восстанавливаем правильное состояние:
    // - если плеер был открыт (плейлист из big) → остаётся открыт
    // - если был закрыт (плейлист из mini) → остаётся закрыт
    const playerModal = document.getElementById('playerModal');
    if (playerModal) {
      if (wasBigOpen) {
        playerModal.classList.add('on');
        document.body.classList.add('player-modal-open');
      } else {
        playerModal.classList.remove('on');
        document.body.classList.remove('player-modal-open');
      }
    }
  });
  
      el.addEventListener('touchstart', () => {
        pressTimer = setTimeout(() => {
          el.classList.add('dragging');
          this._draggedEl = el;
          if (navigator.vibrate) navigator.vibrate(50);
        }, 400);
      }, { passive: true });

      el.addEventListener('touchend', () => clearTimeout(pressTimer));

      el.addEventListener('touchmove', (e) => {
        if (!this._draggedEl) return;
        if (e.cancelable) e.preventDefault();
        const touch = e.touches[0];
        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!targetEl) return;
        const targetItem = targetEl.closest('.playlist-item');
        if (targetItem && targetItem !== this._draggedEl) {
          const itemsArray = Array.from(listEl.children);
          const dragIdx = itemsArray.indexOf(this._draggedEl);
          const targetIdx = itemsArray.indexOf(targetItem);
          if (dragIdx < targetIdx) targetItem.after(this._draggedEl);
          else targetItem.before(this._draggedEl);
        }
      }, { passive: false });

      el.addEventListener('touchend', () => {
        if (this._draggedEl) {
          this.queue = Array.from(listEl.children).map(child => child.dataset.id);
          this.currentIndex = this.queue.indexOf(this.currentTrackId);
          this._draggedEl.classList.remove('dragging');
          this._draggedEl = null;
          toast('Очередь обновлена');
        }
      });
    });
  }
};
window.Player = Player;
