"use strict";

/* ==========================================================
   reader.js — Читалка манги SlashLibReader
   ========================================================== */

// Нативный плагин яркости — доступен через Capacitor.Plugins (как MS, StatusBar, InAppBrowser).
// В web/десктоп его нет — останется null, все вызовы тихо пропустятся.
const ScreenBrightness = window.Capacitor?.Plugins?.ScreenBrightness || null;
if (!ScreenBrightness) {
  console.warn(
    "[brightness] plugin not available — проверь npx cap sync android",
  );
}

const BRIGHTNESS_VALUE_KEY = "polka_reader_brightness_value";
const BRIGHTNESS_REMEMBER_KEY = "polka_reader_brightness_remember";
const BRIGHTNESS_SWIPE_SENSITIVITY = 0.45; // свайп на 45% высоты экрана = 100% яркости

/* =========================================
   ЧИТАЛКА SLASHLIB (Ленивая загрузка)
   ========================================= */
const SlashLibReader = {
  _fullSlug: "",
  _shortSlug: "",
  _source: "slashlib",
  _pagesList: [], // [{ image, chapterId, volume, number }]
  _blobUrls: {},
  _currentIndex: 0,
  _saveTimer: null,
  _zoom: 1,
  _pinchActive: false,
  _pinchStartDist: 0,
  _pinchStartZoom: 1,
  _pinchContentX: 0,
  _pinchContentY: 0,
  _pinchPadL: 0,
  _pinchPadT: 0,
  _lastTapTime: 0,
  _lastTapX: 0,
  _lastTapY: 0,
  _lastScrollTop: 0,
  _scrollDir: "down",
  _tapTimer: null,
  _zoomAnimFrame: null,
  _chaptersList: [],
  _nextChapter: null,
  _prevChapter: null,
  _settings: {},
  _autoLoading: false,
  _prevLoading: false,
  _restoring: false,
  _opening: false,
  _inited: false,
  _userScrolledAt: 0,

  // Приводит настройки к рабочему виду. Умолчания: вертикальное листание,
  // русский язык (если для тайтла нет русского источника — читалка сама уходит на английский),
  // переход по главам «Авто». Значения пользователя не трогаем, дописываем только недостающее/битое.
  _normalizeSettings() {
    if (!this._settings || typeof this._settings !== "object")
      this._settings = {};
    const st = this._settings;
    let changed = false;
    if (st.mode !== "WEBTOON" && st.mode !== "LEFT_TO_RIGHT") {
      st.mode = "WEBTOON";
      changed = true;
    }
    if (st.nextChapter !== "auto" && st.nextChapter !== "button") {
      st.nextChapter = "auto";
      changed = true;
    }
    if (st.language !== "ru" && st.language !== "en") {
      st.language = "ru";
      changed = true;
    }
    if (typeof st.doubleTapZoom !== "boolean") {
      st.doubleTapZoom = false;
      changed = true;
    }
    if (changed) this.saveSettings();
  },

  init() {
    // Раньше init() вызывался дважды (init.js и view.js), и повторный вызов
    // перечитывал пустое хранилище и затирал настройки по умолчанию → читалка «без настроек».
    if (this._inited) return;
    this._inited = true;
    try {
      this._settings = JSON.parse(
        localStorage.getItem("polka_reader_settings") || "{}",
      );
    } catch (e) {
      this._settings = {};
    }
    this._normalizeSettings();

    const el = (id) => document.getElementById(id);

    if (el("readerSettingsBtn"))
      el("readerSettingsBtn").onclick = () => {
        const sModal = document.getElementById("readerSettingsModal");
        if (sModal && sModal.classList.contains("on")) {
          this.toggleSettings(false);
          return;
        }
        this._closeChaptersList();
        this.toggleSettings(true);
      };
    if (el("readerChaptersBtn"))
      el("readerChaptersBtn").onclick = () => this._openChaptersList();

    if (el("readerComizyChaptersBtn"))
      el("readerComizyChaptersBtn").onclick = () =>
        this._openComizyChaptersList();

    if (el("readerMusicBtn"))
      el("readerMusicBtn").onclick = () => {
        this._closeChaptersList();
        this.toggleSettings(false);
        this._openMusicPlayer();
      };

    if (el("readerPinBtn"))
      el("readerPinBtn").onclick = () => {
        this._closeChaptersList();
        this.saveProgress();
        toast("Позиция зафиксирована", "success");
      };

    const likeBtn = el("readerLikeBtn");
    if (likeBtn) {
      this._bindLikeButton(likeBtn);
      this._applyDefaultTagToLikeButton();
    }

    if (el("readerPrevChapter"))
      el("readerPrevChapter").onclick = () => {
        this._closeChaptersList();
        if (!this._prevChapter) return;
        this.loadChapter(
          this._prevChapter.volume,
          this._prevChapter.number,
          this._prevChapter.id,
        );
      };
    if (el("readerNextChapterBtn"))
      el("readerNextChapterBtn").onclick = () => {
        this._closeChaptersList();
        if (!this._nextChapter) return;
        this.loadChapter(
          this._nextChapter.volume,
          this._nextChapter.number,
          this._nextChapter.id,
        );
      };

    if (el("readerCloseBtn")) el("readerCloseBtn").onclick = () => this.close();

    const rsMode = el("rsViewMode");
    if (rsMode)
      rsMode.onclick = (e) => {
        const b = e.target.closest("button[data-v]");
        if (!b) return;
        this._settings.mode = b.dataset.v;
        this.saveSettings();
        this.updateSettingsUI();
        this.applyMode(this._settings.mode);
      };
    const rsNext = el("rsNextChapter");
    if (rsNext)
      rsNext.onclick = (e) => {
        const b = e.target.closest("button[data-v]");
        if (!b) return;
        this._settings.nextChapter = b.dataset.v;
        this.saveSettings();
        this.updateSettingsUI();
        this._updateIslandNavVisibility();
        this.checkNextChapterUI();
        if (b.dataset.v === "auto") this.checkAutoLoad();
      };
    this._bindSideWidthSlider();
    this._bindDiscMarkButton();
    this._bindDiscMarkTap();
    const rsZoom = el("rsDoubleTapZoom");
    if (rsZoom)
      rsZoom.onchange = () => {
        this._settings.doubleTapZoom = !!rsZoom.checked;
        this.saveSettings();
        if (!rsZoom.checked) this._resetZoom();
      };
    // Тоггл «Запоминать яркость»
    const rsBrightness = el("rsRememberBrightness");
    if (rsBrightness) {
      rsBrightness.checked = this._isBrightnessRememberEnabled();
      rsBrightness.onchange = () => {
        this._setBrightnessRememberEnabled(rsBrightness.checked);
      };
    }

    this._bindBrightnessSwipe();
    const rsLang = el("rsLanguage");
    if (rsLang)
      rsLang.onclick = (e) => {
        const b = e.target.closest("button[data-v]");
        if (!b) return;
        const newLang = b.dataset.v;
        if (newLang === this._settings.language) return;
        this._settings.language = newLang;
        this.saveSettings();
        this.updateSettingsUI();
        // Если ридер открыт и у карточки есть оба источника — переключаем
        if (this._fullSlug) this._switchSourceForLang(newLang);
      };

    // Клик по фону модалки = закрыть модалку + спрятать весь UI
    const sModal = el("readerSettingsModal");
    if (sModal)
      sModal.onclick = (e) => {
        if (e.target === sModal) this.toggleSettings(false);
      };
    const cModal = el("readerChaptersModal");
    if (cModal)
      cModal.onclick = (e) => {
        if (e.target === cModal) this._closeChaptersList();
      };

    const ccModal = el("readerComizyChaptersModal");
    if (ccModal)
      ccModal.onclick = (e) => {
        if (e.target === ccModal) this._closeComizyChaptersList();
      };

    this._bindProgressBar();
    this._bindBackSwipe();

    // Перестройка заголовка при resize и повороте экрана
    if (!this._resizeBound) {
      this._resizeBound = true;
      let _rt = null;
      const _refit = () => {
        clearTimeout(_rt);
        _rt = setTimeout(() => this._fitReaderTitle(), 120);
      };
      window.addEventListener("resize", _refit);
      window.addEventListener("orientationchange", _refit);
    }

    this.bindGestures();
    this.updateSettingsUI();
    this._updateIslandNavVisibility();
  },

  saveSettings() {
    try {
      localStorage.setItem(
        "polka_reader_settings",
        JSON.stringify(this._settings),
      );
    } catch (e) {}
  },

  updateSettingsUI() {
    document
      .querySelectorAll("#rsViewMode button")
      .forEach((b) =>
        b.classList.toggle("on", b.dataset.v === this._settings.mode),
      );
    document
      .querySelectorAll("#rsNextChapter button")
      .forEach((b) =>
        b.classList.toggle("on", b.dataset.v === this._settings.nextChapter),
      );
    document
      .querySelectorAll("#rsLanguage button")
      .forEach((b) =>
        b.classList.toggle("on", b.dataset.v === this._settings.language),
      );
    const rsZoom = document.getElementById("rsDoubleTapZoom");
    if (rsZoom) rsZoom.checked = !!this._settings.doubleTapZoom;
  },

  toggleSettings(show) {
    const modal = document.getElementById("readerSettingsModal");
    const panel = document.getElementById("readerSettingsPanel");
    if (!modal || !panel) return;

    if (!show) {
      modal.classList.remove("on");
      panel.classList.remove("on");
      return;
    }

    // Настройки и главы взаимоисключающие — сначала закрываем главы
    this._closeChaptersList();

    // Показываем невидимо, чтобы измерить реальные размеры
    panel.style.visibility = "hidden";
    modal.classList.add("on");

    requestAnimationFrame(() => {
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;
      const island = document.getElementById("readerIsland");
      const ir = island ? island.getBoundingClientRect() : null;

      let left, top;
      if (ir) {
        // Центр панели = центр островка
        left = ir.left + ir.width / 2 - pw / 2;
        left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
        // Низ панели — 8px над верхом островка
        top = ir.top - ph - 8;
        if (top < 8) top = ir.bottom + 8;
      } else {
        left = (window.innerWidth - pw) / 2;
        top = (window.innerHeight - ph) / 2;
      }

      panel.style.left = left + "px";
      panel.style.top = top + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.visibility = "";
      panel.classList.add("on");
    });
  },

  /* Текущая глава: startIdx/endIdx в общем пуле _pagesList, pageInChapter 1-based */
  getCurrentChapterBounds() {
    const page = this._pagesList[this._currentIndex];
    if (!page) return null;
    const chapterId = page.chapterId;
    let startIdx = -1,
      endIdx = -1;
    for (let i = 0; i < this._pagesList.length; i++) {
      if (this._pagesList[i].chapterId === chapterId) {
        if (startIdx === -1) startIdx = i;
        endIdx = i;
      }
    }
    if (startIdx === -1) return null;
    return {
      chapterId,
      volume: page.volume,
      number: page.number,
      startIdx,
      endIdx,
      pageInChapter: this._currentIndex - startIdx + 1,
      totalInChapter: endIdx - startIdx + 1,
    };
  },

  updateReaderTitle() {
    this.updateCounter();
  },

  _syncStatusBar() {
    const modal = document.getElementById("readerModal");
    const isUIHidden = modal && modal.classList.contains("ui-hidden");
    const FB = window.FullscreenBridge;
    if (!FB) return;
    try {
      if (isUIHidden) FB.hide();
      else FB.show();
    } catch (e) {
      console.warn("[FullscreenBridge]", e);
    }
  },

  _fitReaderTitle() {
    if (this._fitRafPending) return;
    this._fitRafPending = true;
    requestAnimationFrame(() => {
      this._fitRafPending = false;
      const bar = document.querySelector(".reader-head-bar");
      const el = document.getElementById("readerTitle");
      if (!bar || !el) return;

      // Сброс всех режимов
      bar.classList.remove("wide", "narrow");
      el.style.cssText = "";
      el.style.fontSize = "30px";

      // Узкий экран (< 600px) — всегда narrow. Без проверки влезания
      if (window.innerWidth < 600) {
        el.style.fontSize = "";
        el.style.maxWidth = "";
        bar.classList.add("narrow");
        return;
      }

      // Широкий — обычная раскладка, проверяем влезает ли в одну строку
      const inner = document.querySelector(".reader-head-inner");
      const info = document.querySelector(".reader-head-info");
      const close = document.querySelector(".reader-close-btn");
      if (!inner || !info || !close) return;

      const innerW = inner.clientWidth;
      const infoW = info.offsetWidth;
      const closeW = close.offsetWidth;
      const gap = 10;
      const sideMargin = Math.max(infoW, closeW) + gap;
      let maxW = innerW - 2 * sideMargin;
      if (maxW < 60) maxW = Math.max(60, innerW - 2 * (infoW + gap));
      el.style.maxWidth = maxW + "px";

      if (el.scrollWidth <= el.clientWidth + 1) return;

      // Не влезает — wide (info колонка, название 2 строки)
      el.style.fontSize = "";
      el.style.maxWidth = "";
      bar.classList.add("wide");
    });
  },

  _updateSourceBtn() {
    const btn = document.getElementById("readerSourceBtn");
    const label = document.getElementById("readerSourceLabel");
    if (!btn) return;

    const item = this._itemId ? items.find((x) => x.id === this._itemId) : null;
    if (!item) {
      btn.style.display = "none";
      return;
    }

    const hasSlash = item.link && item.link.includes("shlib.life");
    const hasComizy =
      item.link_comizy && item.link_comizy.includes("comizy.io");

    if (!hasSlash || !hasComizy) {
      btn.style.display = "none";
      return;
    }

    btn.style.display = "";
    if (label) label.textContent = this._source === "comizy" ? "EN" : "RU";
    btn.title =
      this._source === "comizy"
        ? "Переключить на SlashLib"
        : "Переключить на Comizy";
  },

  async _switchSourceForLang(lang) {
    const item = this._itemId ? items.find((x) => x.id === this._itemId) : null;
    if (!item) return;
    const hasSlash = item.link && item.link.includes("shlib.life");
    const hasComizy =
      item.link_comizy && item.link_comizy.includes("comizy.io");
    if (!hasSlash || !hasComizy) return;
    if (lang === "en" && this._source === "comizy") return;
    if (lang === "ru" && this._source === "slashlib") return;

    const bounds = this.getCurrentChapterBounds();
    if (!bounds) return;

    const wrap = document.getElementById("readerPages");
    const allImgs = wrap ? Array.from(wrap.querySelectorAll("img")) : [];

    // Позиция = доля ВЫСОТЫ главы (нормализованной по ширине), а не номер кадра.
    // Так разная нарезка (19 vs 43 кадра) и разные пропорции дают одну и ту же точку.
    const weightOf = (idx) => {
      const p = this._pagesList[idx];
      if (p && p.width > 0 && p.height > 0) return p.height / p.width;
      const im = allImgs[idx];
      if (im && im.offsetWidth > 0 && im.offsetHeight > 0)
        return im.offsetHeight / im.offsetWidth;
      return 1.5;
    };
    const curImg = allImgs[this._currentIndex];
    let intraFrac = 0;
    if (wrap && curImg) {
      if (this._settings.mode === "WEBTOON") {
        const h = curImg.offsetHeight;
        intraFrac = h > 0 ? (wrap.scrollTop - curImg.offsetTop) / h : 0;
      } else {
        const w = curImg.offsetWidth;
        intraFrac = w > 0 ? (wrap.scrollLeft - curImg.offsetLeft) / w : 0;
      }
      intraFrac = Math.max(0, Math.min(1, intraFrac));
    }
    let before = 0,
      total = 0;
    for (let i = bounds.startIdx; i <= bounds.endIdx; i++) {
      const w = weightOf(i);
      if (i < this._currentIndex) before += w;
      else if (i === this._currentIndex) before += w * intraFrac;
      total += w;
    }
    const pageRatio = total > 0 ? Math.max(0, Math.min(1, before / total)) : 0;

    this.saveProgress();
    toast(
      "Переключаю на " + (lang === "en" ? "Comizy" : "SlashLib") + "...",
      "success",
    );

    try {
      if (lang === "en") {
        await this._openComizyAt(item, bounds.number, pageRatio);
      } else {
        await this._openSlashlibAt(item, bounds.number, pageRatio);
      }
    } catch (e) {
      console.error("[switchSourceForLang]", e);
      toast("Ошибка: " + e.message, "error");
    }
  },

  _pickCeil(list, number) {
    // Точное совпадение уже проверено выше. Здесь — ближайшая глава В БОЛЬШУЮ сторону
    // (18.5 → 19). Если больших нет — последняя.
    const n = parseFloat(number);
    const sorted = (list || [])
      .slice()
      .sort((a, b) => parseFloat(a.number) - parseFloat(b.number));
    return (
      sorted.find((c) => parseFloat(c.number) >= n) ||
      sorted[sorted.length - 1] ||
      null
    );
  },

  async _openComizyAt(item, chapterNumber, pageRatio) {
    const slug = (item.link_comizy.match(/comizy\.io\/([^\/?#]+)/) || [])[1];
    if (!slug) throw new Error("Нет slug Comizy");
    let details = null;
    try {
      details = await ComizyParser.getMangaDetails(slug);
    } catch (e) {
      console.warn("[Comizy] getMangaDetails failed:", e.message);
    }
    if (!details || !details.hid) {
      toast("Comizy недоступен. Остаюсь на SlashLib.", "warn");
      throw new Error("Comizy недоступен");
    }
    const chapters = await ComizyParser.getChaptersFor(
      details.hid,
      slug,
      item.link,
    );
    if (!chapters || !chapters.length) throw new Error("Нет глав");
    chapters.sort((a, b) => a.number - b.number);
    let target = chapters.find(
      (c) => parseFloat(c.number) === parseFloat(chapterNumber),
    );
    if (!target) {
      target = SlashLibReader._pickCeil(chapters, chapterNumber);
      pageRatio = 0;
    }
    const rawPages = await ComizyParser.getChapterPages(slug, target.slug);
    if (!rawPages || !rawPages.length) throw new Error("Нет страниц");
    // Фильтр по размеру отключён для Comizy — только хэш через _filterDisclaimers
    const pages = rawPages.map((p) => ({
      image: "",
      url: p.url,
      width: p.width || 0,
      height: p.height || 0,
      chapterId: target.id,
      volume: 1,
      number: target.number,
    }));
    const chaptersList = chapters.map((c) => ({
      id: c.id,
      volume: 1,
      number: c.number,
      name: c.name,
      slug: c.slug,
      textual: !!c.textual,
    }));
    const fullSlug = "comizy:" + slug;
    const progress = { chapterRatio: pageRatio };
    this.open(
      fullSlug,
      target.id,
      1,
      target.number,
      pages,
      details.title + " - Chapter " + target.number,
      progress,
      chaptersList,
      item.id,
      "comizy",
    );
  },

  async _openSlashlibAt(item, chapterNumber, pageRatio) {
    const token = localStorage.getItem("slashlib_token");
    if (!token) throw new Error("Нужен вход в SlashLib");
    const fullSlug = (item.link.match(/\/manga\/([^\/?#]+)/) || [])[1];
    if (!fullSlug) throw new Error("Нет slug SlashLib");

    const listRes = await nativeFetch(
      `https://api.cdnlibs.org/api/manga/${fullSlug}/chapters`,
      {
        Authorization: "Bearer " + token,
        "Site-Id": "2",
        Origin: "https://v2.shlib.life",
        Referer: "https://v2.shlib.life/",
      },
    );
    if (!listRes.ok) {
      if (listRes.status === 401 || listRes.status === 403) {
        try {
          localStorage.removeItem("slashlib_token");
          localStorage.removeItem("slashlib_token_valid");
        } catch (e) {}
        throw new Error("Токен SlashLib истёк. Войди заново");
      }
      throw new Error("Ошибка API SlashLib: " + listRes.status);
    }
    let listJson;
    try {
      listJson = await listRes.json();
    } catch (e) {
      throw new Error("SlashLib вернул не JSON. Попробуй войти заново");
    }
    const chaptersList = listJson.data || [];
    if (!chaptersList.length) throw new Error("Нет глав");

    let target = chaptersList.find(
      (c) => parseFloat(c.number) === parseFloat(chapterNumber),
    );
    if (!target) {
      target = SlashLibReader._pickCeil(chaptersList, chapterNumber);
      pageRatio = 0;
    }

    const chapRes = await nativeFetch(
      `https://api.cdnlibs.org/api/manga/${fullSlug}/chapter?volume=${target.volume}&number=${target.number}`,
      {
        Authorization: "Bearer " + token,
        "Site-Id": "2",
        Origin: "https://v2.shlib.life",
        Referer: "https://v2.shlib.life/",
      },
    );
    if (!chapRes.ok) {
      if (chapRes.status === 401 || chapRes.status === 403) {
        try {
          localStorage.removeItem("slashlib_token");
          localStorage.removeItem("slashlib_token_valid");
        } catch (e) {}
        throw new Error("Токен SlashLib истёк. Войди заново");
      }
      throw new Error("Ошибка загрузки главы: " + chapRes.status);
    }
    let chapJson;
    try {
      chapJson = await chapRes.json();
    } catch (e) {
      throw new Error("SlashLib вернул не JSON. Попробуй войти заново");
    }
    const chapData = chapJson.data;
    if (!chapData || !chapData.pages || !chapData.pages.length)
      throw new Error("Нет страниц");

    const title =
      item.title + " - Том " + chapData.volume + " Глава " + chapData.number;
    const progress = { chapterRatio: pageRatio };
    this.open(
      fullSlug,
      chapData.id,
      chapData.volume,
      chapData.number,
      chapData.pages,
      title,
      progress,
      chaptersList,
      item.id,
      "slashlib",
    );
  },

  _resetZoom() {
    if (this._zoomAnimFrame) {
      cancelAnimationFrame(this._zoomAnimFrame);
      this._zoomAnimFrame = null;
    }
    this._zoom = 1;
    this._pinchActive = false;
    this._lastTapTime = 0;
    const wrap = document.getElementById("readerPages");
    if (wrap) {
      wrap.classList.remove("zoomed");
      wrap.style.removeProperty("--reader-zoom");
    }
  },

  _applyZoomTransform(z) {
    const wrap = document.getElementById("readerPages");
    if (!wrap) return;
    wrap.style.setProperty("--reader-zoom", String(z));
    if (z > 1.001 && !wrap.classList.contains("zoomed")) {
      wrap.classList.add("zoomed");
    }
  },

  _animateZoomTo(targetZ, clientX, clientY, duration) {
    const wrap = document.getElementById("readerPages");
    const stage = document.getElementById("readerStage");
    if (!wrap || !stage) return;
    if (this._zoomAnimFrame) {
      cancelAnimationFrame(this._zoomAnimFrame);
      this._zoomAnimFrame = null;
    }

    // Zoomed ставим ДО первого кадра, чтобы overflow-x сразу был auto
    // и scrollHeight на каждом кадре считался правильно
    if (targetZ > 1.001 && !wrap.classList.contains("zoomed")) {
      wrap.classList.add("zoomed");
    }

    const stageRect = stage.getBoundingClientRect();
    const cs = getComputedStyle(wrap);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padT = parseFloat(cs.paddingTop) || 0;
    const fx = clientX - stageRect.left;
    const fy = clientY - stageRect.top;

    const startZ = this._zoom || 1;
    const contentX = (wrap.scrollLeft + fx - padL) / startZ;
    const contentY = (wrap.scrollTop + fy - padT) / startZ;

    const startTime = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const e = ease(t);
      const z = startZ + (targetZ - startZ) * e;

      this._zoom = z;
      this._applyZoomTransform(z);
      // Полный forced reflow — иначе scrollHeight отстаёт на кадр
      wrap.getBoundingClientRect();

      const maxSL = wrap.scrollWidth - wrap.clientWidth;
      const maxST = wrap.scrollHeight - wrap.clientHeight;
      wrap.scrollLeft = Math.max(0, Math.min(maxSL, contentX * z + padL - fx));
      wrap.scrollTop = Math.max(0, Math.min(maxST, contentY * z + padT - fy));

      if (t < 1) {
        this._zoomAnimFrame = requestAnimationFrame(step);
      } else {
        this._zoom = targetZ;
        this._applyZoomTransform(targetZ);
        if (targetZ <= 1.001) {
          wrap.classList.remove("zoomed");
          wrap.style.removeProperty("--reader-zoom");
        }
        this._zoomAnimFrame = null;
      }
    };
    this._zoomAnimFrame = requestAnimationFrame(step);
  },

  _handleDoubleTap(clientX, clientY) {
    const currentZoom = this._zoom || 1;
    const targetZoom = currentZoom < 1.5 ? 2 : 1;
    this._animateZoomTo(targetZoom, clientX, clientY, 280);
  },

  async _probeImageInfo(page) {
    const path = String(page.url || page.image || "").replace(/^\/+/, "");
    if (!path) return null;

    // ═══ COMIZY URL — скачиваем напрямую ═══
    const isComizySource = this._source === "comizy";
    const looksHttp = /^https?:\/\//i.test(path);
    if (isComizySource || /(?:cmzcdn|comizy)/i.test(path)) {
      if (!looksHttp) return null;
      const url = path;
      const CHttp = window.Capacitor?.Plugins?.CapacitorHttp;
      if (!CHttp) return null;
      try {
        const headers = {
          Referer: "https://comizy.io/",
          Origin: "https://comizy.io",
          "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        };
        const r = await CHttp.get({
          url,
          headers,
          responseType: "arraybuffer",
        });
        if (r.status !== 200 || !r.data) return null;
        let b64 = r.data;
        if (b64.startsWith("data:image")) b64 = b64.split(",")[1];
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
        const hash = Array.from(new Uint8Array(hashBuf))
          .slice(0, 8)
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
        const blob = new Blob([bytes]);
        const dims = await new Promise((res) => {
          const u = URL.createObjectURL(blob);
          const im = new Image();
          im.onload = () => {
            URL.revokeObjectURL(u);
            res({ w: im.naturalWidth, h: im.naturalHeight });
          };
          im.onerror = () => {
            URL.revokeObjectURL(u);
            res(null);
          };
          im.src = u;
        });
        if (!dims) return null;
        return { w: dims.w, h: dims.h, hash };
      } catch (e) {
        console.warn("[probeImageInfo comizy]", url, e.message);
        return null;
      }
    }

    // ═══ SLASHLIB ═══
    const domains = [
      "https://img3.cdnlibs.org",
      "https://img3.cdnlibs.link",
      "https://img3.hentaicdn.org",
    ];
    const token = localStorage.getItem("slashlib_token");
    const headers = {
      Authorization: "Bearer " + token,
      Origin: "https://v2.shlib.life",
      Referer: "https://v2.shlib.life/",
      "Site-Id": "2",
      Accept: "image/*",
    };
    const CHttp = window.Capacitor?.Plugins?.CapacitorHttp;
    if (!CHttp) return null;
    for (const base of domains) {
      try {
        const url = path.startsWith("http") ? path : `${base}/${path}`;
        const r = await CHttp.get({
          url,
          headers,
          responseType: "arraybuffer",
        });
        if (r.status !== 200 || !r.data) continue;
        let b64 = r.data;
        if (b64.startsWith("data:image")) b64 = b64.split(",")[1];
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
        const hash = Array.from(new Uint8Array(hashBuf))
          .slice(0, 8)
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
        const blob = new Blob([bytes]);
        const dims = await new Promise((res) => {
          const u = URL.createObjectURL(blob);
          const im = new Image();
          im.onload = () => {
            URL.revokeObjectURL(u);
            res({ w: im.naturalWidth, h: im.naturalHeight });
          };
          im.onerror = () => {
            URL.revokeObjectURL(u);
            res(null);
          };
          im.src = u;
        });
        if (!dims) return null;
        return { w: dims.w, h: dims.h, hash };
      } catch (e) {}
    }
    return null;
  },

  async _probeImageInfoCached(page) {
    const path = String(page.url || page.image || "").replace(/^\/+/, "");
    if (!path) return null;
    let cache = {};
    try {
      cache = JSON.parse(
        localStorage.getItem("polka_reader_img_cache") || "{}",
      );
    } catch (e) {}
    if (cache[path]) return cache[path];

    const info = await this._probeImageInfo(page);
    if (info) {
      cache[path] = info;
      const keys = Object.keys(cache);
      if (keys.length > 500) {
        keys.slice(0, keys.length - 500).forEach((k) => delete cache[k]);
      }
      try {
        localStorage.setItem("polka_reader_img_cache", JSON.stringify(cache));
      } catch (e) {}
    }
    return info;
  },

  _getDiscHashes() {
    try {
      const raw = localStorage.getItem("polka_reader_disc_hashes");
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr);
    } catch (e) {
      return new Set();
    }
  },

  _addDiscHash(hash) {
    if (!hash) return;
    try {
      const set = this._getDiscHashes();
      if (set.has(hash)) return;
      set.add(hash);
      const arr = Array.from(set).slice(-300);
      localStorage.setItem("polka_reader_disc_hashes", JSON.stringify(arr));
      console.log("[reader] hash added:", hash, "| pool size:", arr.length);
      if (typeof DiscHashesCloud !== "undefined")
        DiscHashesCloud.pushDebounced();
    } catch (e) {
      console.warn("[reader] _addDiscHash FAILED:", e);
    }
  },

  _removeDiscHash(hash) {
    if (!hash) return;
    try {
      const set = this._getDiscHashes();
      set.delete(hash);
      localStorage.setItem(
        "polka_reader_disc_hashes",
        JSON.stringify(Array.from(set)),
      );
      if (typeof DiscHashesCloud !== "undefined")
        DiscHashesCloud.pushDebounced();
    } catch (e) {}
  },

  async _filterDisclaimers(pages, depth, silent) {
    depth = depth || 0;
    if (!silent) silent = false;
    if (!Array.isArray(pages) || !pages.length) {
      return { pages, removedFromStart: 0, allFiltered: false, warnings: [] };
    }
    const isComizy = this._source === "comizy";
    const showWarnOnce = () => {
      if (silent) return;
      if (this._discToastShown) return;
      this._discToastShown = true;
      toast("Глава может содержать дисклеймеры", "warn");
    };
    // Для Comizy фильтр по размеру отключён — только хэш
    const isDiscBySize = isComizy
      ? () => false
      : (d) => d && d.w > 0 && d.h > 0 && d.h / d.w < 2;
    const getSizeFast = async (page) => {
      if (page.width && page.height)
        return { w: page.width, h: page.height, hash: null };
      const path = String(page.url || page.image || "").replace(/^\/+/, "");
      if (!path) return null;
      let cache = {};
      try {
        cache = JSON.parse(
          localStorage.getItem("polka_reader_img_cache") || "{}",
        );
      } catch (e) {}
      if (cache[path])
        return { w: cache[path].w, h: cache[path].h, hash: cache[path].hash };
      return null;
    };
    const knownHashes = this._getDiscHashes();
    const beforeCount = pages.length;
    const discard = new Set();
    if (knownHashes.size > 0) {
      for (let i = 0; i < pages.length; i++) {
        const path = String(pages[i].url || pages[i].image || "").replace(
          /^\/+/,
          "",
        );
        if (!path) continue;
        let cache = {};
        try {
          cache = JSON.parse(
            localStorage.getItem("polka_reader_img_cache") || "{}",
          );
        } catch (e) {}
        const cached = cache[path];
        if (cached && cached.hash && knownHashes.has(cached.hash)) {
          discard.add(i);
        }
      }
    }
    if (!isComizy) {
      for (let i = 0; i < pages.length; i++) {
        if (discard.has(i)) continue;
        const sizeInfo = await getSizeFast(pages[i]);
        if (sizeInfo && isDiscBySize(sizeInfo)) {
        }
      }
    }
    // Проверяем первые 7 и последние 5 кадров (у Comizy дисклеймер может стоять
    // на любой из первых позиций). Качаем параллельно, по 4 штуки.
    // Для Comizy без известных хэшей проверять нечего — пропускаем (экономит время открытия).
    if (!(isComizy && knownHashes.size === 0)) {
      const CHECK_HEAD = 7;
      const CHECK_TAIL = 5;
      const toProbe = [];
      for (let i = 0; i < Math.min(CHECK_HEAD, pages.length); i++)
        if (!discard.has(i)) toProbe.push(i);
      for (
        let i = pages.length - 1;
        i >= Math.max(0, pages.length - CHECK_TAIL);
        i--
      )
        if (!discard.has(i) && !toProbe.includes(i)) toProbe.push(i);
      let cur = 0;
      const worker = async () => {
        while (cur < toProbe.length) {
          const i = toProbe[cur++];
          let d = null;
          try {
            d = await this._probeImageInfoCached(pages[i]);
          } catch (e) {}
          if (!d) continue;
          if (knownHashes.has(d.hash) || isDiscBySize(d)) discard.add(i);
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(4, toProbe.length) }, worker),
      );
    }

    if (!discard.size) {
      return { pages, removedFromStart: 0, allFiltered: false, warnings: [] };
    }
    let removedFromStart = 0;
    for (let i = 0; i < pages.length; i++) {
      if (discard.has(i)) removedFromStart++;
      else break;
    }
    const filtered = pages.filter((_, i) => !discard.has(i));
    console.log(
      "[reader] disclaimers filtered:",
      discard.size,
      "| pool:",
      knownHashes.size,
      "| before:",
      pages.length,
      "| after:",
      filtered.length,
    );
    const tooMuchRemoved =
      filtered.length === 0 || filtered.length < beforeCount * 0.5;
    if (!tooMuchRemoved) {
      return {
        pages: filtered,
        removedFromStart,
        allFiltered: false,
        warnings: [],
      };
    }
    const softFallback = async (extraHashes) => {
      const strictSet = new Set(extraHashes || []);
      const softDiscard = new Set();
      for (let i = 0; i < pages.length; i++) {
        const info = await this._probeImageInfoCached(pages[i]);
        if (info && (knownHashes.has(info.hash) || strictSet.has(info.hash))) {
          softDiscard.add(i);
        }
      }
      const softFiltered = pages.filter((_, i) => !softDiscard.has(i));
      if (!softFiltered.length) {
        console.warn(
          "[reader] soft fallback emptied chapter — showing all with warning",
        );
        showWarnOnce();
        return {
          pages,
          removedFromStart: 0,
          allFiltered: true,
          warnings: ["soft-empty"],
        };
      }
      let softRemovedFromStart = 0;
      for (let i = 0; i < pages.length; i++) {
        if (softDiscard.has(i)) softRemovedFromStart++;
        else break;
      }
      if (strictSet.size > 0) {
        strictSet.forEach((hash) => this._addDiscHash(hash));
      }
      console.log(
        "[reader] soft fallback:",
        softDiscard.size,
        "removed | after:",
        softFiltered.length,
      );
      if (softFiltered.length < beforeCount * 0.7) showWarnOnce();
      return {
        pages: softFiltered,
        removedFromStart: softRemovedFromStart,
        allFiltered: false,
        warnings: [],
      };
    };
    // Для Comizy не идём в SlashLib API за хэшами следующей главы
    if (depth === 0 && this._nextChapter && !isComizy) {
      console.log(
        "[reader] filter too aggressive, checking next chapter for hashes...",
      );
      try {
        const token = localStorage.getItem("slashlib_token");
        const nextRes = await nativeFetch(
          `https://api.cdnlibs.org/api/manga/${this._fullSlug}/chapter?volume=${this._nextChapter.volume}&number=${this._nextChapter.number}`,
          {
            Authorization: "Bearer " + token,
            "Site-Id": "2",
            Origin: "https://v2.shlib.life",
            Referer: "https://v2.shlib.life/",
          },
        );
        const nextJson = await nextRes.json();
        const nextPages = (nextJson.data && nextJson.data.pages) || [];
        const nextDisc = new Set();
        for (let i = 0; i < Math.min(2, nextPages.length); i++) {
          const d = await this._probeImageInfoCached(nextPages[i]);
          if (isDiscBySize(d) && d.hash) nextDisc.add(d.hash);
        }
        for (
          let i = nextPages.length - 1;
          i >= Math.max(0, nextPages.length - 2);
          i--
        ) {
          if (i < 0) continue;
          const d = await this._probeImageInfoCached(nextPages[i]);
          if (isDiscBySize(d) && d.hash) nextDisc.add(d.hash);
        }
        if (nextDisc.size > 0) {
          console.log("[reader] next chapter hashes:", Array.from(nextDisc));
          const strictDiscard = new Set();
          for (let i = 0; i < pages.length; i++) {
            const info = await this._probeImageInfoCached(pages[i]);
            if (info && nextDisc.has(info.hash)) strictDiscard.add(i);
          }
          const strictFiltered = pages.filter((_, i) => !strictDiscard.has(i));
          console.log(
            "[reader] strict filter:",
            strictDiscard.size,
            "removed | after:",
            strictFiltered.length,
          );
          if (strictFiltered.length > 0) {
            strictDiscard.forEach((i) => {
              this._probeImageInfoCached(pages[i]).then((info) => {
                if (info && info.hash) this._addDiscHash(info.hash);
              });
            });
            let strictRemovedFromStart = 0;
            for (let i = 0; i < pages.length; i++) {
              if (strictDiscard.has(i)) strictRemovedFromStart++;
              else break;
            }
            if (strictFiltered.length < beforeCount * 0.7) showWarnOnce();
            return {
              pages: strictFiltered,
              removedFromStart: strictRemovedFromStart,
              allFiltered: false,
              warnings: [],
            };
          }
          return await softFallback(Array.from(nextDisc));
        }
      } catch (e) {
        console.warn("[reader] next-chapter probe failed:", e);
      }
    }
    return await softFallback([]);
  },

  _autoAdvanceStatusIfNeeded(chapterNumber) {
    if (!this._itemId) return;
    const num = parseInt(chapterNumber, 10);
    if (num !== 4) return; // ← триггер только на ровно 4-й главе
    const it = items.find((x) => x.id === this._itemId);
    if (!it) return;
    if (it.status !== "want") return;
    it.status = "in_progress";
    it.updatedAt = Date.now();
    save();
    toast("Статус: В процессе", "success");
    if (typeof render === "function") render();
  },

  _checkEndOfManga() {
    if (!this._itemId) return;
    const it = items.find((x) => x.id === this._itemId);
    if (!it) return;
    if (it.status === "done") return;
    if (it.status === "dropped") return;
    // Онгоинг и анонс — не «Прочитано», потому что будут ещё главы
    if (it.projectStatus === "ongoing" || it.projectStatus === "announced")
      return;

    const bounds = this.getCurrentChapterBounds();
    if (!bounds) return;
    if (this._currentIndex !== bounds.endIdx) return;
    if (this._nextChapter) return;

    it.status = "done";
    it.updatedAt = Date.now();
    save();
    toast("Статус: Прочитано", "success");
    if (typeof render === "function") render();
  },

  _bindProgressBar() {
    const track = document.getElementById("readerProgressTrack");
    if (!track) return;
    let dragging = false;

    const seekFromX = (clientX) => {
      const bounds = this.getCurrentChapterBounds();
      if (!bounds) return;
      if (bounds.totalInChapter <= 1) return;
      const r = track.getBoundingClientRect();
      if (r.width <= 0) return;
      let pct = (clientX - r.left) / r.width;
      pct = Math.max(0, Math.min(1, pct));
      const targetPage = Math.min(
        bounds.totalInChapter - 1,
        Math.round(pct * (bounds.totalInChapter - 1)),
      );
      const targetIdx = bounds.startIdx + targetPage;
      this.scrollToIndex(targetIdx, false);
    };

    track.addEventListener("pointerdown", (e) => {
      dragging = true;
      try {
        track.setPointerCapture(e.pointerId);
      } catch (err) {}
      seekFromX(e.clientX);
    });
    track.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      seekFromX(e.clientX);
    });
    track.addEventListener("pointerup", (e) => {
      dragging = false;
      try {
        track.releasePointerCapture(e.pointerId);
      } catch (err) {}
    });
    track.addEventListener("pointercancel", () => {
      dragging = false;
    });
  },

  _isBrightnessRememberEnabled() {
    try {
      return localStorage.getItem(BRIGHTNESS_REMEMBER_KEY) === "1";
    } catch (e) {
      return false;
    }
  },

  _setBrightnessRememberEnabled(on) {
    try {
      localStorage.setItem(BRIGHTNESS_REMEMBER_KEY, on ? "1" : "0");
    } catch (e) {}
    const cb = document.getElementById("rsRememberBrightness");
    if (cb) cb.checked = on;
    if (!on) this._restoreSystemBrightness();
  },

  async _restoreSystemBrightness() {
    if (!ScreenBrightness) return;
    try {
      await ScreenBrightness.setBrightness({ brightness: -1 });
    } catch (e) {
      console.warn("[brightness] restore failed", e);
    }
  },

  async _applySavedBrightness() {
    if (!ScreenBrightness) return;
    if (!this._isBrightnessRememberEnabled()) return;
    let saved = NaN;
    try {
      saved = parseFloat(localStorage.getItem(BRIGHTNESS_VALUE_KEY));
    } catch (e) {}
    if (!isFinite(saved) || saved < 0 || saved > 1) return;
    try {
      await ScreenBrightness.setBrightness({ brightness: saved });
    } catch (e) {
      console.warn("[brightness] apply failed", e);
    }
  },

  async _saveAndSetBrightness(value) {
    if (!ScreenBrightness) return;
    const clamped = Math.max(0, Math.min(1, value));
    try {
      await ScreenBrightness.setBrightness({ brightness: clamped });
    } catch (e) {
      console.warn("[brightness] set failed", e);
      return;
    }
    if (this._isBrightnessRememberEnabled()) {
      try {
        localStorage.setItem(BRIGHTNESS_VALUE_KEY, String(clamped));
      } catch (e) {}
    }
  },

  _getSideVw() {
    try {
      const v = parseFloat(localStorage.getItem("polka_reader_side_vw"));
      if (isFinite(v) && v >= 8 && v <= 36) return v;
    } catch (e) {}
    return 22;
  },

  _applySideVw(vw) {
    const clamped = Math.max(8, Math.min(36, vw));
    // Слайдер показывает ширину ФРЕЙМА. В CSS уходит ширина ПОЛЕЙ = 44 - слайдер.
    // 22 слайдер → 22 поля (центр), 36 слайдер → 8 полей (фрейм широкий), 8 → 36 полей (фрейм узкий).
    const padVw = 44 - clamped;

    const wrap = document.getElementById("readerPages");

    // 1. Запомнить якорь: индекс фрейма + доля внутри него (0..1)
    let anchorIdx = this._currentIndex;
    let anchorFrac = 0;
    let imgs = wrap ? wrap.querySelectorAll("img") : [];

    if (wrap && imgs.length) {
      const curImg = imgs[anchorIdx];
      if (curImg && curImg.offsetHeight > 0) {
        anchorFrac = (wrap.scrollTop - curImg.offsetTop) / curImg.offsetHeight;
        anchorFrac = Math.max(0, Math.min(1, anchorFrac));
      } else {
        for (let i = 0; i < imgs.length; i++) {
          const im = imgs[i];
          if (!im.offsetHeight) continue;
          if (im.offsetTop + im.offsetHeight > wrap.scrollTop + 1) {
            anchorIdx = i;
            anchorFrac = Math.max(
              0,
              Math.min(1, (wrap.scrollTop - im.offsetTop) / im.offsetHeight),
            );
            break;
          }
        }
      }
    }

    // 2. Применить новую ширину полей
    document.documentElement.style.setProperty(
      "--reader-side-vw",
      padVw + "vw",
    );

    // 3. Слайдер и лейбл показывают то, что видит пользователь — ширину фрейма
    const slider = document.getElementById("rsPageWidth");
    const label = document.getElementById("rsPageWidthValue");
    if (slider) slider.value = String(clamped);
    if (label) label.textContent = Math.round(clamped) + "%";

    // 4. Форсировать reflow и восстановить позицию
    if (wrap && imgs.length) {
      void wrap.offsetHeight;
      const newImgs = wrap.querySelectorAll("img");
      const newImg = newImgs[anchorIdx];
      if (newImg && newImg.offsetHeight > 0) {
        wrap.scrollTop = newImg.offsetTop + anchorFrac * newImg.offsetHeight;
      }
    }
  },

  _saveSideVw(vw) {
    try {
      localStorage.setItem("polka_reader_side_vw", String(vw));
    } catch (e) {}
  },

  _bindSideWidthSlider() {
    const slider = document.getElementById("rsPageWidth");
    if (!slider || slider._bound) return;
    slider._bound = true;

    const start = this._getSideVw();
    slider.value = String(start);
    this._applySideVw(start);

    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      this._applySideVw(v);
    });

    slider.addEventListener("change", () => {
      const v = parseFloat(slider.value);
      this._saveSideVw(v);
    });
  },

  _bindDiscMarkButton() {
    const btn = document.getElementById("readerDiscMarkBtn");
    if (!btn || btn._bound) return;
    btn._bound = true;
    let timer = null,
      fired = false;
    const cancel = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    btn.addEventListener("pointerdown", () => {
      fired = false;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        try {
          if (navigator.vibrate) navigator.vibrate(30);
        } catch (e) {}
        this._deleteCurrentChapter();
      }, 600);
    });
    btn.addEventListener("pointerup", cancel);
    btn.addEventListener("pointerleave", cancel);
    btn.addEventListener("pointercancel", cancel);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.onclick = (e) => {
      if (fired) {
        fired = false;
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      this._discMarkMode = !this._discMarkMode;
      btn.classList.toggle("active", this._discMarkMode);
      if (this._discMarkMode) {
        toast(
          "Ткни на фрейм — пометить дисклеймер. Долгий тап по прицелу — удалить главу",
          "warn",
        );
      }
    };
  },

  _deleteCurrentChapter() {
    if (this._opening) return;
    if (this._source !== "comizy") {
      toast("Удаление глав работает только для источника Comizy", "warn");
      return;
    }
    const bounds = this.getCurrentChapterBounds();
    if (!bounds) return;
    const list = this._chaptersList || [];
    const chap = list.find((c) => c.id === bounds.chapterId);
    if (!chap) {
      toast("Глава не найдена в списке", "warn");
      return;
    }

    const sorted = list
      .slice()
      .sort((a, b) => parseFloat(a.number) - parseFloat(b.number));
    const idx = sorted.findIndex((c) => c.id === chap.id);
    const target = sorted[idx + 1] || sorted[idx - 1] || null;
    const fullSlug = this._fullSlug;

    // Номера остальных глав НЕ меняются: нумерация берётся из названий на сайте
    ComizyParser.addRemoved(fullSlug, chap.id);
    this._chaptersList = list.filter((c) => c.id !== chap.id);

    this._discMarkMode = false;
    const mb = document.getElementById("readerDiscMarkBtn");
    if (mb) mb.classList.remove("active");

    const label = chap.textual
      ? "«" + (chap.name || "доп. глава") + "»"
      : "Глава " + chap.number;
    // Удаление идёт на уровне списка глав — алгоритм «все фреймы дисклеймеры → показать всё» его не касается
    if (target) this.loadChapter(target.volume, target.number, target.id, null);
    else this.close();

    toast(label + " удалена", "warn", "Отменить", () => {
      ComizyParser.removeRemoved(fullSlug, chap.id);
      const rm = document.getElementById("readerModal");
      if (this._fullSlug === fullSlug && rm && rm.classList.contains("on")) {
        this._chaptersList = (this._chaptersList || [])
          .concat([chap])
          .sort((a, b) => parseFloat(a.number) - parseFloat(b.number));
        this.loadChapter(chap.volume, chap.number, chap.id, null);
      }
      toast("Глава восстановлена", "success");
    });
  },

  _reindexReaderImgs() {
    const wrap = document.getElementById("readerPages");
    if (!wrap) return;
    const imgs = wrap.querySelectorAll("img");
    imgs.forEach((img, i) => {
      img.dataset.index = String(i);
    });
  },

  _bindDiscMarkTap() {
    const wrap = document.getElementById("readerPages");
    if (!wrap || wrap._discMarkBound) return;
    wrap._discMarkBound = true;

    wrap.addEventListener(
      "pointerdown",
      async (e) => {
        if (!this._discMarkMode) return;
        if (this._discMarkProcessing) return;
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        // Ищем img под пальцем: берём тот, чей центр ближе всего к точке тапа,
        // и в чьи границы попадает clientY
        const imgs = Array.from(wrap.querySelectorAll("img"));
        let targetIdx = -1;
        let bestDist = Infinity;
        const tapY = e.clientY;
        for (let i = 0; i < imgs.length; i++) {
          const r = imgs[i].getBoundingClientRect();
          if (r.height <= 0) continue;
          if (tapY < r.top || tapY > r.bottom) continue;
          const centerY = r.top + r.height / 2;
          const dist = Math.abs(centerY - tapY);
          if (dist < bestDist) {
            bestDist = dist;
            targetIdx = i;
          }
        }
        if (targetIdx < 0 || targetIdx >= this._pagesList.length) {
          toast("Не попал по фрейму, попробуй ещё", "warn");
          return;
        }

        this._discMarkProcessing = true;
        const page = this._pagesList[targetIdx];
        toast("Запоминаю...", "success");
        const info = await this._probeImageInfo(page);
        this._discMarkProcessing = false;
        if (!info) {
          toast("Не удалось скачать фрейм", "error");
          return;
        }

        this._addDiscHash(info.hash);
        this._discMarkMode = false;
        const btn = document.getElementById("readerDiscMarkBtn");
        if (btn) btn.classList.remove("active");

        // Запоминаем главу и позицию, чтобы вернуться туда же
        const bounds = this.getCurrentChapterBounds();
        const savedPage = bounds ? bounds.pageInChapter - 1 : 0;
        const savedVol = bounds ? bounds.volume : 1;
        const savedNum = bounds ? bounds.number : 1;
        const savedChapId = bounds ? bounds.chapterId : null;

        toast("Дисклеймер запомнен", "success", "Отменить", () => {
          this._removeDiscHash(info.hash);
          if (savedChapId)
            this.loadChapter(savedVol, savedNum, savedChapId, {
              page: savedPage,
              offset: 0,
            });
          toast("Отменено", "warn");
        });

        if (savedChapId) {
          this.loadChapter(savedVol, savedNum, savedChapId, {
            page: savedPage,
            offset: 0,
          });
        }
      },
      { capture: true },
    );
  },

  _bindBrightnessSwipe() {
    const stage = document.getElementById("readerStage");
    if (!stage || stage._brightnessBound) return;
    stage._brightnessBound = true;

    let startX = 0,
      startY = 0,
      startBrightness = 0.5;
    let tracking = false;
    let decided = false;
    let isBrightness = false;

    stage.addEventListener(
      "touchstart",
      async (e) => {
        if (e.touches.length !== 1) return;
        // В горизонтальном режиме лента листается по горизонтали — не отбираем у неё жест
        if (this._settings.mode === "LEFT_TO_RIGHT") {
          tracking = false;
          return;
        }
        if (!ScreenBrightness) {
          tracking = false;
          return;
        }

        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        tracking = true;
        decided = false;
        isBrightness = false;

        try {
          const res = await ScreenBrightness.getBrightness();
          startBrightness = res.brightness >= 0 ? res.brightness : 0.5;
        } catch (e) {
          startBrightness = 0.5;
        }
      },
      { passive: true },
    );

    stage.addEventListener(
      "touchmove",
      (e) => {
        if (!tracking || e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        if (!decided) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          decided = true;
          // Горизонтальное движение — яркость; вертикальное — нативный скролл ленты
          isBrightness = Math.abs(dx) > Math.abs(dy) * 1.2;
        }

        if (!isBrightness) return;
        if (e.cancelable) e.preventDefault();

        // Вправо — ярче, влево — темнее
        const delta = dx / (window.innerWidth * BRIGHTNESS_SWIPE_SENSITIVITY);
        const newVal = Math.max(0, Math.min(1, startBrightness + delta));
        this._saveAndSetBrightness(newVal);
      },
      { passive: false },
    );

    stage.addEventListener("touchend", () => {
      tracking = false;
      decided = false;
      isBrightness = false;
    });
    stage.addEventListener("touchcancel", () => {
      tracking = false;
      decided = false;
      isBrightness = false;
    });
  },

  _bindBackSwipe() {
    const modal = document.getElementById("readerModal");
    if (!modal || modal._backSwipeBound) return;
    modal._backSwipeBound = true;

    let startX = 0,
      startY = 0;
    let tracking = false;
    let active = false;
    const EDGE = 32;
    const THRESHOLD = 60;

    const hasOpenModal = () => {
      const chapters = document.getElementById("readerChaptersModal");
      const settings = document.getElementById("readerSettingsModal");
      const picker = document.getElementById("readerTagPicker");
      return (
        (chapters && chapters.classList.contains("on")) ||
        (settings && settings.classList.contains("on")) ||
        (picker && picker.classList.contains("on"))
      );
    };

    modal.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
        active = false;
        tracking = false;
        if (startX > EDGE) return;
        if (!hasOpenModal()) return;
        tracking = true;
      },
      { capture: true, passive: true },
    );

    modal.addEventListener(
      "touchmove",
      (e) => {
        if (!tracking || e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        if (Math.abs(dy) > Math.abs(dx) * 1.5) {
          tracking = false;
          return;
        }
        if (dx > THRESHOLD) {
          active = true;
          if (e.cancelable) e.preventDefault();
        }
      },
      { capture: true, passive: false },
    );

    modal.addEventListener(
      "touchend",
      (e) => {
        if (!active) {
          tracking = false;
          return;
        }
        tracking = false;
        active = false;

        const picker = document.getElementById("readerTagPicker");
        const settings = document.getElementById("readerSettingsModal");
        const chapters = document.getElementById("readerChaptersModal");

        if (picker && picker.classList.contains("on")) {
          this._closeTagPicker();
          return;
        }
        if (settings && settings.classList.contains("on")) {
          this.toggleSettings(false);
          return;
        }
        if (chapters && chapters.classList.contains("on")) {
          this._closeChaptersList();
          return;
        }
      },
      { capture: true, passive: true },
    );

    modal.addEventListener(
      "touchcancel",
      () => {
        tracking = false;
        active = false;
      },
      { capture: true, passive: true },
    );
  },

  _updateIslandNavVisibility() {
    const nav = document.getElementById("readerIslandNav");
    if (!nav) return;
    if (this._settings.nextChapter === "auto") nav.classList.add("hidden");
    else nav.classList.remove("hidden");
  },

  _openChaptersList() {
    const modal = document.getElementById("readerChaptersModal");
    const panel = document.getElementById("readerChaptersPanel");
    const list = document.getElementById("readerChaptersList");
    if (!modal || !panel || !list) return;

    if (modal.classList.contains("on")) {
      this._closeChaptersList();
      return;
    }

    this.toggleSettings(false);

    // Для Comizy — прячем главы, скрытые глазиком в "Главы Comizy"
    let chapters = this._chaptersList || [];
    if (this._source === "comizy") {
      chapters = chapters.filter(
        (c) => !this._isComizyChapterHidden(this._fullSlug, c.id),
      );
    }

    if (!chapters.length) {
      list.innerHTML =
        '<div style="padding:20px;text-align:center;color:var(--fg2);font-size:13px;">Глав не найдено</div>';
    } else {
      const current = this.getCurrentChapterBounds();
      const currentId = current ? current.chapterId : null;
      const sorted = chapters
        .slice()
        .sort((a, b) => (a.number || 0) - (b.number || 0));
      list.innerHTML = sorted
        .map((c) => {
          const isCurrent = c.id === currentId;
          return (
            '<button type="button" class="rc-item' +
            (isCurrent ? " current" : "") +
            '" data-id="' +
            esc(c.id) +
            '" data-vol="' +
            (c.volume || 0) +
            '" data-num="' +
            (c.number || 0) +
            '">' +
            '<span class="rc-item-vol">Том ' +
            (c.volume || 0) +
            "</span>" +
            '<span class="rc-item-title">' +
            (c.textual
              ? esc(c.name || "Доп. " + c.number)
              : "Глава " + esc(c.number || 0)) +
            "</span>" +
            "</button>"
          );
        })
        .join("");

      list.querySelectorAll(".rc-item").forEach((btn) => {
        btn.onclick = () => {
          const id = btn.dataset.id;
          const vol = +btn.dataset.vol;
          const num = +btn.dataset.num;
          this._closeChaptersList();
          this.loadChapter(vol, num, id);
        };
      });
    }

    panel.style.visibility = "hidden";
    modal.classList.add("on");

    requestAnimationFrame(() => {
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;
      const island = document.getElementById("readerIsland");
      const ir = island ? island.getBoundingClientRect() : null;

      let left, top;
      if (ir) {
        left = ir.left + ir.width / 2 - pw / 2;
        left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
        top = ir.top - ph - 8;
        if (top < 8) top = ir.bottom + 8;
      } else {
        left = (window.innerWidth - pw) / 2;
        top = (window.innerHeight - ph) / 2;
      }

      panel.style.left = left + "px";
      panel.style.top = top + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.visibility = "";
      panel.classList.add("on");

      const cur = list.querySelector(".rc-item.current");
      if (cur) cur.scrollIntoView({ block: "center", behavior: "auto" });
    });
  },

  _closeChaptersList() {
    const modal = document.getElementById("readerChaptersModal");
    const panel = document.getElementById("readerChaptersPanel");
    if (modal) modal.classList.remove("on");
    if (panel) panel.classList.remove("on");
  },

  _closeChaptersList() {
    const modal = document.getElementById("readerChaptersModal");
    if (modal) modal.classList.remove("on");
  },

  async open(
    fullSlug,
    chapterId,
    volume,
    number,
    pagesList,
    title,
    progress,
    chaptersList,
    itemId,
    source,
  ) {
    if (this._opening) return;
    this._opening = true;
    this._source = source || "slashlib";

    try {
      // Новая сессия — все loadPage из прошлого открытия (если ещё работают)
      // увидят смену _sessionId и не запишут мусор в _blobUrls
      this._sessionId = (this._sessionId || 0) + 1;
      this._prevLoading = false;
      this._autoLoading = false;
      this._restoring = false;
      this._resetZoom();

      this._fullSlug = fullSlug;
      this._shortSlug = fullSlug.split("--").pop();
      this._chaptersList = chaptersList || [];
      this._itemId = itemId || this._itemId || null;
      this._blobUrls = {};

      // Автостатус: с 4-й главы «в планах» → «в процессе»
      this._autoAdvanceStatusIfNeeded(number);

      if (!pagesList || !pagesList.length) {
        toast("В главе нет страниц", "warn");
        return;
      }

      // Показать читалку и оверлей загрузки СРАЗУ, до фильтрации —
      // иначе пока фильтр скачивает 2-4 фрейма, висит пустой экран
      const _rme0 = document.getElementById("readerModal");
      if (_rme0) {
        _rme0.classList.add("on");
        _rme0.classList.remove("ui-hidden");
        void _rme0.offsetWidth;
      }
      document.body.classList.add("modal-open");
      {
        const _stg0 = document.getElementById("readerStage");
        if (_stg0 && !document.getElementById("readerLoadingOverlay")) {
          const _ov0 = document.createElement("div");
          _ov0.id = "readerLoadingOverlay";
          _ov0.className = "reader-loading-overlay";
          _ov0.innerHTML = '<div class="spinner"></div><div>Загрузка...</div>';
          _stg0.appendChild(_ov0);
        }
      }

      // Вычищаем дисклеймеры (короткие фреймы в начале/конце главы)
      const filterResult = await this._filterDisclaimers(pagesList);
      pagesList = filterResult.pages;
      if (!pagesList.length) {
        if (_rme0) _rme0.classList.remove("on");
        document.body.classList.remove("modal-open");
        const _ovx = document.getElementById("readerLoadingOverlay");
        if (_ovx) _ovx.remove();
        if (this._nextChapter && !this._discToastShown) {
          this._discToastShown = true;
          toast("Глава только из дисклеймеров, перехожу к следующей", "warn");
          setTimeout(() => {
            this.loadChapter(
              this._nextChapter.volume,
              this._nextChapter.number,
              this._nextChapter.id,
              null,
            );
          }, 400);
        } else if (!this._discToastShown) {
          this._discToastShown = true;
          toast("В главе только дисклеймеры", "warn");
        }
        return;
      }

      // Если прогресс указывал на страницу после дисклеймеров — сдвигаем на число удалённых
      if (progress && typeof progress.chapterRatio === "number") {
        // Переключение источника: ищем точку по доле высоты уже ОЧИЩЕННОЙ главы
        const wts = pagesList.map((p) =>
          p.width > 0 && p.height > 0 ? p.height / p.width : 1.5,
        );
        const sum = wts.reduce((a, b) => a + b, 0);
        let target = Math.max(0, Math.min(1, progress.chapterRatio)) * sum;
        let pg = 0;
        while (pg < wts.length - 1 && target >= wts[pg]) {
          target -= wts[pg];
          pg++;
        }
        progress.page = pg;
        progress.intraPageRatio = Math.max(0, Math.min(1, target / wts[pg]));
      } else if (
        progress &&
        typeof progress.page === "number" &&
        filterResult.removedFromStart > 0
      ) {
        progress.page = Math.max(
          0,
          Math.min(
            progress.page - filterResult.removedFromStart,
            pagesList.length - 1,
          ),
        );
      }

      this._pagesList = pagesList.map((p) => ({
        image: p.image,
        url: p.url || "",
        width: p.width || 0,
        height: p.height || 0,
        chapterId: chapterId,
        volume: volume,
        number: number,
      }));

      const currIdx = this._chaptersList.findIndex(
        (c) => String(c.id) === String(chapterId),
      );
      this._nextChapter =
        currIdx !== -1 && currIdx < this._chaptersList.length - 1
          ? this._chaptersList[currIdx + 1]
          : null;
      this._prevChapter = currIdx > 0 ? this._chaptersList[currIdx - 1] : null;

      let startPage = 0;
      if (progress && typeof progress.page === "number") {
        startPage = Math.max(
          0,
          Math.min(progress.page, this._pagesList.length - 1),
        );
      }
      this._currentIndex = startPage;

      this._baseTitle = (title || "").split(" - ")[0].trim();

      const wrap = document.getElementById("readerPages");
      if (!wrap) return;
      wrap.innerHTML = "";
      wrap.scrollTop = 0;
      wrap.scrollLeft = 0;

      wrap.className = "reader-pages";
      if (this._settings.mode === "LEFT_TO_RIGHT")
        wrap.classList.add("horizontal");

      this._pagesList.forEach((page, i) => {
        const img = document.createElement("img");
        img.alt = "Страница " + (i + 1);
        img.dataset.index = i;
        img.style.opacity = "0";
        img.style.transition = "opacity 0.3s ease";
        if (this._settings.mode === "WEBTOON") {
          if (page.width && page.height) {
  img.style.aspectRatio = `${page.width} / ${page.height}`;
} else {
  img.style.aspectRatio = "2 / 3";
          }
        }
        wrap.appendChild(img);
      });
      this._reindexReaderImgs();

      const nextDiv = document.createElement("div");
      nextDiv.className = "reader-next-chapter";
      nextDiv.id = "readerNextBlock";
      wrap.appendChild(nextDiv);
      this.updateNextBlock();

      const readerModalEl = document.getElementById("readerModal");
      if (readerModalEl) {
        readerModalEl.classList.add("on");
        this._applySavedBrightness();
        readerModalEl.classList.remove("ui-hidden");
        void readerModalEl.offsetWidth;
      }
      document.body.classList.add("modal-open");
      this._startMusicBtnWatcher();
      this._updateMusicBtnState();

      this.updateSettingsUI();
      this._updateIslandNavVisibility();
      this.updateChapterNav();
      this._updateComizyChaptersBtnVisibility();
      this.updateCounter();

      wrap.style.visibility = "hidden";

      const stage = document.getElementById("readerStage");
      let overlay = document.getElementById("readerLoadingOverlay");
      if (!overlay && stage) {
        overlay = document.createElement("div");
        overlay.id = "readerLoadingOverlay";
        overlay.className = "reader-loading-overlay";
        overlay.innerHTML = '<div class="spinner"></div><div>Загрузка...</div>';
        stage.appendChild(overlay);
      }

      // Ленивая загрузка: current + близкие, остальные — по скроллу
      const PRELOAD_BEFORE = 2;
      const PRELOAD_AFTER = this._source === "comizy" ? 5 : 3;

      const nearBefore = [];
      for (
        let i = Math.max(0, this._currentIndex - PRELOAD_BEFORE);
        i < this._currentIndex;
        i++
      )
        nearBefore.push(i);

      const nearAfter = [];
      for (
        let i = this._currentIndex + 1;
        i <
        Math.min(
          this._pagesList.length,
          this._currentIndex + 1 + PRELOAD_AFTER,
        );
        i++
      )
        nearAfter.push(i);

      (async () => {
        try {
          // Placeholder'ы уже с правильными размерами → layout готов,
          // скролл на нужную позицию мгновенный, без ожидания картинок
          await new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          );

          this._restoring = true;
          this.restoreScroll(progress || null);
          // Якорь: пока пользователь не трогал скролл, после загрузки каждого кадра
          // возвращаем ту же точку (высоты заглушек и реальных кадров не совпадают)
          this._anchor =
            progress && typeof progress.offset !== "number"
              ? {
                  idx: this._currentIndex,
                  ratio:
                    typeof progress.intraPageRatio === "number"
                      ? Math.max(0, Math.min(1, progress.intraPageRatio))
                      : 0,
                  t: Date.now(),
                }
              : null;

          // current (приоритет) + близкие — параллельно
          const currentPromise = this.loadPage(this._currentIndex);
          const beforePromise = nearBefore.length
            ? this.loadPagesBatch(nearBefore, 3)
            : Promise.resolve();
          const afterPromise = nearAfter.length
            ? this.loadPagesBatch(nearAfter, 3)
            : Promise.resolve();

          // Показываем читалку, когда загружены текущий и предыдущие кадры (иначе заглушки
          // подменяются реальными размерами на глазах — мелькание). Но не дольше 2.5 с.
          if (progress && typeof progress.offset !== "number") {
            await Promise.race([
              Promise.all([currentPromise, beforePromise]).catch(() => {}),
              new Promise((r) => setTimeout(r, 2500)),
            ]);
            this.restoreScroll(progress);
          } else {
            // не держим чёрный экран дольше 6 с, даже если кадр качается долго
            await Promise.race([
              currentPromise.catch(() => {}),
              new Promise((r) => setTimeout(r, 6000)),
            ]);
          }
          wrap.style.visibility = "visible";
          requestAnimationFrame(() =>
            requestAnimationFrame(() => this._fitReaderTitle()),
          );
          // якорь отсчитываем с момента показа
          if (this._anchor) this._anchor.t = Date.now();
          const ov = document.getElementById("readerLoadingOverlay");
          if (ov) ov.remove();

          setTimeout(() => {
            this._restoring = false;
          }, 200);

          // Остальные — в фоне
          Promise.all([beforePromise, afterPromise]).catch(() => {});
        } catch (e) {
          console.error("[Reader open]", e);
          this._restoring = false;
          wrap.style.visibility = "visible";
          const ov = document.getElementById("readerLoadingOverlay");
          if (ov) ov.remove();
        }
      })();
    } catch (outerErr) {
      // Если что-то упало до создания wrap-логики — убрать оверлей и читалку,
      // чтобы не висел чёрный экран со спиннером
      console.error("[Reader open] outer error:", outerErr);
      const _ovE = document.getElementById("readerLoadingOverlay");
      if (_ovE) _ovE.remove();
      const _rmE = document.getElementById("readerModal");
      if (_rmE) _rmE.classList.remove("on");
      document.body.classList.remove("modal-open");
      toast("Ошибка загрузки главы", "error");
    } finally {
      this._opening = false;
    }
  },

  restoreScroll(progress) {
    const wrap = document.getElementById("readerPages");
    if (!wrap) return;
    const imgs = wrap.querySelectorAll("img");
    const img = imgs[this._currentIndex];
    if (!img) return;

    // Поддержка обоих форматов: новый {intraPageRatio} и старый {offset}
    let intraPageRatio = 0;
    if (progress && typeof progress.intraPageRatio === "number") {
      intraPageRatio = Math.max(0, Math.min(1, progress.intraPageRatio));
    } else if (progress && typeof progress.offset === "number") {
      // Старый формат: offset в пикселях. Пытаемся масштабировать.
      const page = this._pagesList[this._currentIndex];
      const apiH = page ? page.height || 0 : 0;
      const domH = img.offsetHeight || 0;
      if (apiH > 100 && domH > 100) {
        intraPageRatio = (progress.offset * (domH / apiH)) / domH;
      } else {
        intraPageRatio = 0;
      }
    }

    const applyScroll = () => {
      const domH = img.offsetHeight || 0;
      if (domH < 10) return false; // ещё не загрузилась
      const offset = intraPageRatio * domH;
      if (this._settings.mode === "WEBTOON") {
        wrap.scrollTop = Math.max(0, img.offsetTop + offset);
      } else {
        wrap.scrollLeft = Math.max(0, img.offsetLeft + offset);
      }
      return true;
    };

    // Пробуем сразу
    if (applyScroll()) return;

    // Картинка ещё не загрузилась — ждём через ResizeObserver
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        if (applyScroll()) {
          ro.disconnect();
        }
      });
      ro.observe(img);
      // Страховка: отключаем через 3 секунды
      setTimeout(() => {
        try {
          ro.disconnect();
        } catch (e) {}
      }, 3000);
    } else {
      // Фолбэк: пробуем через 500мс
      setTimeout(() => applyScroll(), 500);
    }
  },

  _preloadAround(idx) {
    if (!this._pagesList.length) return;
    // Comizy — 5 кадров вперёд, SlashLib — 3; назад по 2
    const AHEAD = this._source === "comizy" ? 5 : 3;
    const BEHIND = 2;
    const list = [];
    // Сначала ближайшие вперёд, потом текущий и те, что позади
    for (
      let i = idx + 1;
      i <= Math.min(this._pagesList.length - 1, idx + AHEAD);
      i++
    )
      if (!this._blobUrls[i]) list.push(i);
    for (let i = idx; i >= Math.max(0, idx - BEHIND); i--)
      if (!this._blobUrls[i]) list.push(i);
    if (!list.length) return;
    this.loadPagesBatch(list, 3).catch(() => {});
  },

  async loadPagesBatch(indices, limit) {
    if (!indices.length) return;
    let cursor = 0;
    const worker = async () => {
      while (cursor < indices.length) {
        const idx = indices[cursor++];
        try {
          await this.loadPage(idx);
        } catch (e) {}
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(limit, indices.length) }, worker),
    );
  },

  // ═══ COMIZY CHAPTERS MODAL ═══
  _getComizyHiddenChapters() {
    try {
      const raw = localStorage.getItem("polka_comizy_hidden_chapters");
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      return {};
    }
  },
  _saveComizyHiddenChapters(data) {
    try {
      localStorage.setItem(
        "polka_comizy_hidden_chapters",
        JSON.stringify(data),
      );
    } catch (e) {}
  },
  _isComizyChapterHidden(slug, chapterId) {
    const data = this._getComizyHiddenChapters();
    const key = String(slug || "").replace(/^comizy:/, "");
    const hidden = data[key];
    if (!Array.isArray(hidden)) return false;
    return hidden.includes(String(chapterId));
  },
  _toggleComizyChapterHidden(slug, chapterId) {
    const data = this._getComizyHiddenChapters();
    const key = String(slug || "").replace(/^comizy:/, "");
    if (!data[key]) data[key] = [];
    const idStr = String(chapterId);
    const idx = data[key].indexOf(idStr);
    if (idx >= 0) {
      data[key].splice(idx, 1);
    } else {
      data[key].push(idStr);
    }
    this._saveComizyHiddenChapters(data);
    return idx < 0; // true = now hidden
  },
  _updateComizyChaptersBtnVisibility() {
    const btn = document.getElementById("readerComizyChaptersBtn");
    if (!btn) return;
    btn.style.display = this._source === "comizy" ? "" : "none";
  },
  _openComizyChaptersList() {
    const modal = document.getElementById("readerComizyChaptersModal");
    const panel = document.getElementById("readerComizyChaptersPanel");
    const list = document.getElementById("readerComizyChaptersList");
    if (!modal || !panel || !list) return;
    if (modal.classList.contains("on")) {
      this._closeComizyChaptersList();
      return;
    }
    this.toggleSettings(false);
    this._closeChaptersList();
    const chapters = this._chaptersList || [];
    const current = this.getCurrentChapterBounds();
    const currentId = current ? current.chapterId : null;
    const sorted = chapters
      .slice()
      .sort((a, b) => parseFloat(a.number) - parseFloat(b.number));
    const eyeOpenSVG =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeClosedSVG =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    list.innerHTML = sorted
      .map((c) => {
        const isCurrent = c.id === currentId;
        const isHidden = this._isComizyChapterHidden(this._fullSlug, c.id);
        const eyeClass = isHidden ? "rcc-eye hidden" : "rcc-eye";
        const eyeIcon = isHidden ? eyeClosedSVG : eyeOpenSVG;
        const chapLabel = c.textual
          ? c.name || "Доп. " + c.number
          : "Глава " + c.number;
        return (
          '<div class="rcc-item' +
          (isCurrent ? " current" : "") +
          '" data-id="' +
          esc(c.id) +
          '">' +
          '<span class="rcc-item-title">' +
          esc(chapLabel) +
          "</span>" +
          '<button type="button" class="' +
          eyeClass +
          '" data-eye="' +
          esc(c.id) +
          '">' +
          eyeIcon +
          "</button>" +
          "</div>"
        );
      })
      .join("");
    list.querySelectorAll(".rcc-item").forEach((item) => {
      const eyeBtn = item.querySelector(".rcc-eye");
      if (eyeBtn) {
        eyeBtn.onclick = (e) => {
          e.stopPropagation();
          const chapId = eyeBtn.dataset.eye;
          const nowHidden = this._toggleComizyChapterHidden(
            this._fullSlug,
            chapId,
          );
          eyeBtn.classList.toggle("hidden", nowHidden);
          eyeBtn.innerHTML = nowHidden ? eyeClosedSVG : eyeOpenSVG;
          toast(nowHidden ? "Глава скрыта" : "Глава видна", "success");
        };
      }
      item.onclick = () => {
        const id = item.dataset.id;
        const chap = chapters.find((c) => String(c.id) === String(id));
        if (!chap) return;
        if (this._isComizyChapterHidden(this._fullSlug, chap.id)) {
          toast("Глава скрыта. Включи глазик, чтобы открыть", "warn");
          return;
        }
        this._closeComizyChaptersList();
        this.loadChapter(chap.volume || 1, chap.number, chap.id);
      };
    });
    panel.style.visibility = "hidden";
    modal.classList.add("on");
    requestAnimationFrame(() => {
      const pw = panel.offsetWidth;
      const ph = panel.offsetHeight;
      const island = document.getElementById("readerIsland");
      const ir = island ? island.getBoundingClientRect() : null;
      let left, top;
      if (ir) {
        left = ir.left + ir.width / 2 - pw / 2;
        left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
        top = ir.top - ph - 8;
        if (top < 8) top = ir.bottom + 8;
      } else {
        left = (window.innerWidth - pw) / 2;
        top = (window.innerHeight - ph) / 2;
      }
      panel.style.left = left + "px";
      panel.style.top = top + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.visibility = "";
      panel.classList.add("on");
      const cur = list.querySelector(".rcc-item.current");
      if (cur) cur.scrollIntoView({ block: "center", behavior: "auto" });
    });
  },
  _closeComizyChaptersList() {
    const modal = document.getElementById("readerComizyChaptersModal");
    const panel = document.getElementById("readerComizyChaptersPanel");
    if (modal) modal.classList.remove("on");
    if (panel) panel.classList.remove("on");
  },

  close() {
    this._restoreSystemBrightness();
    this._closeTagPicker();
    this._closeChaptersList();
    this._closeComizyChaptersList();
    this.toggleSettings(false);
    this._stopMusicBtnWatcher();
    this._discToastShown = false;
    this._resetZoom();
    this.saveProgress();
    const rm = document.getElementById("readerModal");
    if (rm) {
      rm.classList.remove("on");
      rm.classList.remove("ui-hidden");
    }
    document.body.classList.remove("modal-open");
    Object.values(this._blobUrls).forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    });
    this._pagesList = [];
    this._blobUrls = {};
    this._nextChapter = null;
    this._prevChapter = null;
    this._chaptersList = [];
    this._currentIndex = 0;
    // Сброс всех флагов «в процессе» — иначе после повторного открытия
    // checkPrevLoad/checkAutoLoad навсегда заблокированы
    this._prevLoading = false;
    this._autoLoading = false;
    this._restoring = false;
    this._opening = false;
    // Новая сессия — все висящие промисы loadPage станут stale
    this._sessionId = (this._sessionId || 0) + 1;
    this.toggleSettings(false);

    const overlay = document.getElementById("readerLoadingOverlay");
    if (overlay) overlay.remove();

    // Возвращаем бары
    if (window.FullscreenBridge) {
      try {
        window.FullscreenBridge.show();
      } catch (e) {}
    } else {
      const SB = window.Capacitor?.Plugins?.SystemBars;
      if (SB) {
        try {
          SB.show();
        } catch (e) {}
      }
    }
  },

  saveProgress() {
    if (!this._fullSlug) return;
    const bounds = this.getCurrentChapterBounds();
    if (!bounds) return;

    const wrap = document.getElementById("readerPages");
    let offset = 0;
    if (wrap) {
      const imgs = wrap.querySelectorAll("img");
      const img = imgs[this._currentIndex];
      if (img) {
        if (this._settings.mode === "WEBTOON")
          offset = wrap.scrollTop - img.offsetTop;
        else offset = wrap.scrollLeft - img.offsetLeft;
      }
    }

    try {
      let progress = JSON.parse(
        localStorage.getItem("polka_reader_progress") || "{}",
      );
      progress[this._fullSlug] = {
        chapterId: bounds.chapterId,
        volume: bounds.volume,
        number: bounds.number,
        page: bounds.pageInChapter - 1, // 0-indexed
        offset: Math.max(0, offset),
      };
      localStorage.setItem("polka_reader_progress", JSON.stringify(progress));
    } catch (e) {}
  },

  _getDefaultMomentTag() {
    try {
      return (
        localStorage.getItem("polka_reader_default_moment_tag") ||
        MOMENT_DEFAULT_TAG
      );
    } catch (e) {
      return MOMENT_DEFAULT_TAG;
    }
  },

  _setDefaultMomentTag(tag) {
    try {
      localStorage.setItem("polka_reader_default_moment_tag", tag);
    } catch (e) {}
  },

  _getMomentsOnCurrentPage() {
    const bounds = this.getCurrentChapterBounds();
    if (!bounds) return [];
    const it = items.find((x) => x.id === this._itemId);
    if (!it || !Array.isArray(it.moments)) return [];
    return it.moments.filter(
      (m) => m.c === bounds.chapterId && m.p === bounds.pageInChapter,
    );
  },

  _getTagsOnCurrentPage() {
    const list = this._getMomentsOnCurrentPage();
    return new Set(list.map((m) => m.tag || MOMENT_DEFAULT_TAG));
  },

  _applyDefaultTagToLikeButton() {
    const btn = document.getElementById("readerLikeBtn");
    if (!btn) return;
    const tag = this._getDefaultMomentTag();
    btn.innerHTML = momentIconSVG(tag);
    btn.style.setProperty("--ic", momentColor(tag));
    this._updateLikeButtonState();
  },

  _updateLikeButtonState() {
    const btn = document.getElementById("readerLikeBtn");
    if (!btn) return;
    const tag = this._getDefaultMomentTag();
    const tagsHere = this._getTagsOnCurrentPage();
    const isLit = tagsHere.has(tag);
    btn.classList.toggle("lit", isLit);
    btn.style.setProperty("--ic", momentColor(tag));
  },

  _bindLikeButton(btn) {
    let longPressTimer = null;
    let longPressed = false;
    let startX = 0,
      startY = 0;
    let lastTouchAt = 0;

    const cancelTimer = () => {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    };

    const startLongPress = () => {
      cancelTimer();
      longPressTimer = setTimeout(() => {
        longPressed = true;
        try {
          if (navigator.vibrate) navigator.vibrate(20);
        } catch (err) {}
        this._openTagPicker(btn);
      }, 400);
    };

    btn.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        lastTouchAt = Date.now();
        longPressed = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startLongPress();
      },
      { passive: true },
    );

    btn.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length !== 1) return;
        if (
          Math.abs(e.touches[0].clientX - startX) > 12 ||
          Math.abs(e.touches[0].clientY - startY) > 12
        ) {
          cancelTimer();
        }
      },
      { passive: true },
    );

    btn.addEventListener("touchend", (e) => {
      cancelTimer();
      lastTouchAt = Date.now();
      if (longPressed) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      this._addMomentWithTag(this._getDefaultMomentTag(), true);
    });

    btn.addEventListener("touchcancel", () => {
      cancelTimer();
    });

    // Mouse-события — только если НЕ было touch за последние 600мс
    // (защита от эмуляции mouse на Android WebView после тапа)
    btn.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (Date.now() - lastTouchAt < 600) return;
      longPressed = false;
      startLongPress();
    });
    btn.addEventListener("mouseup", () => {
      if (Date.now() - lastTouchAt < 600) return;
      cancelTimer();
      if (longPressed) return;
      this._addMomentWithTag(this._getDefaultMomentTag(), true);
    });
    btn.addEventListener("mouseleave", () => {
      if (Date.now() - lastTouchAt < 600) return;
      cancelTimer();
    });

    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  },

  _updateMusicBtnState() {
    const btn = document.getElementById("readerMusicBtn");
    if (!btn) return;
    const hasTrack = document.body.classList.contains("player-active");
    btn.classList.toggle("lit-music", hasTrack);
  },

  _startMusicBtnWatcher() {
    if (this._musicBtnObserver) return;
    this._musicBtnObserver = new MutationObserver(() =>
      this._updateMusicBtnState(),
    );
    this._musicBtnObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
  },

  _stopMusicBtnWatcher() {
    if (this._musicBtnObserver) {
      this._musicBtnObserver.disconnect();
      this._musicBtnObserver = null;
    }
  },

  _openMusicPlayer() {
    const musicTracks = items.filter((i) => i.type === "music");
    if (!musicTracks.length) {
      toast("На полке нет музыки", "warn");
      return;
    }
    if (
      Player.currentTrackId !== null ||
      document.body.classList.contains("player-active")
    ) {
      Player.openModal();
    } else {
      Player.queue = musicTracks.map((t) => t.id);
      Player.currentIndex = -1;
      Player.openPlaylist();
    }
    this._updateMusicBtnState();
  },

  _addMomentWithTag(tag, toggle) {
    if (!this._itemId) {
      toast("Не удалось определить карточку", "warn");
      return;
    }
    const it = items.find((x) => x.id === this._itemId);
    if (!it) {
      toast("Карточка не найдена", "warn");
      return;
    }

    const bounds = this.getCurrentChapterBounds();
    if (!bounds) {
      toast("Позиция не определена", "warn");
      return;
    }

    if (!Array.isArray(it.moments)) it.moments = [];

    const tagSafe = typeof tag === "string" && tag ? tag : MOMENT_DEFAULT_TAG;

    const existingIdx = it.moments.findIndex(
      (m) =>
        m.c === bounds.chapterId &&
        m.p === bounds.pageInChapter &&
        (m.tag || MOMENT_DEFAULT_TAG) === tagSafe,
    );

    if (existingIdx >= 0) {
      if (toggle) {
        it.moments.splice(existingIdx, 1);
        it.updatedAt = Date.now();
        save();
        this._updateLikeButtonState();
        this._refreshMomentsBox();
        toast("Метка убрана", "warn");
      } else {
        toast("Такая метка уже стоит на этой странице", "warn");
      }
      return;
    }

    let frameOffset = 0;
    const wrap = document.getElementById("readerPages");
    if (wrap) {
      const imgs = wrap.querySelectorAll("img");
      const curImg = imgs[this._currentIndex];
      if (curImg) {
        if (this._settings.mode === "WEBTOON") {
          frameOffset = Math.max(
            0,
            Math.round(wrap.scrollTop - curImg.offsetTop),
          );
        } else {
          frameOffset = Math.max(
            0,
            Math.round(wrap.scrollLeft - curImg.offsetLeft),
          );
        }
      }
    }

    const newMoment = {
      p: bounds.pageInChapter,
      tag: tagSafe,
      c: bounds.chapterId,
      v: bounds.volume,
      n: bounds.number,
      o: frameOffset,
    };

    it.moments.push(newMoment);
    it.moments = sortMoments(it.moments);
    it.updatedAt = Date.now();
    save();

    this._updateLikeButtonState();
    this._refreshMomentsBox();

    const btn = document.getElementById("readerLikeBtn");
    if (btn) {
      btn.style.transition = "transform .15s ease";
      btn.style.transform = "scale(1.18)";
      setTimeout(() => {
        btn.style.transform = "";
      }, 150);
    }

    toast("Метка: " + tagSafe + " · Стр. " + bounds.pageInChapter, "success");
  },

  _refreshMomentsBox() {
    const box = document.getElementById("momentsBox");
    if (!box) return;
    const it = items.find((x) => x.id === this._itemId);
    if (!it) return;
    try {
      renderMomentsBox(box, it);
      requestAnimationFrame(() => layoutMomentsGradient(box));
    } catch (e) {
      console.warn("moments box refresh", e);
    }
  },

  _openTagPicker(anchorBtn) {
    const backdrop = document.getElementById("readerTagPickerBackdrop");
    const picker = document.getElementById("readerTagPicker");
    if (!backdrop || !picker) return;

    // Метки не открываются поверх других модалок — сначала закрываем их
    this._closeChaptersList();
    this.toggleSettings(false);

    const tagsHere = this._getTagsOnCurrentPage();
    const currentTag = this._getDefaultMomentTag();

    picker.innerHTML = Object.keys(MOMENT_ICONS)
      .map((k) => {
        const isLit = tagsHere.has(k);
        const isCurrent = k === currentTag;
        const color = MOMENT_ICONS[k].color;
        const cls =
          "reader-tag-picker-item" +
          (isLit ? " lit" : "") +
          (isCurrent ? " current" : "");
        return (
          '<button type="button" class="' +
          cls +
          '" data-tag="' +
          k +
          '" style="--ic:' +
          color +
          '">' +
          momentIconSVG(k) +
          "</button>"
        );
      })
      .join("");

    picker.querySelectorAll(".reader-tag-picker-item").forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        const tag = el.dataset.tag;
        if (!tag) return;
        // toggle: если метка с этим тегом уже стоит — удалится, иначе создастся
        this._setDefaultMomentTag(tag);
        this._addMomentWithTag(tag, true);
        this._applyDefaultTagToLikeButton();
        this._closeTagPicker();
      };
    });

    picker.style.visibility = "hidden";
    picker.classList.add("on");
    backdrop.classList.add("on");

    requestAnimationFrame(() => {
      const island = document.getElementById("readerIsland");
      // offsetWidth/Height — не зависят от transform/scale, дают реальные размеры
      const pw = picker.offsetWidth;
      const ph = picker.offsetHeight;
      const ir = island ? island.getBoundingClientRect() : null;

      let left, top;
      if (ir) {
        left = ir.left + ir.width / 2 - pw / 2;
        left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
        top = ir.top - ph - 8;
        if (top < 8) top = ir.bottom + 8;
      } else {
        left = (window.innerWidth - pw) / 2;
        top = (window.innerHeight - ph) / 2;
      }

      picker.style.left = left + "px";
      picker.style.top = top + "px";
      picker.style.visibility = "";
    });

    backdrop.onclick = () => this._closeTagPicker();
  },

  _closeTagPicker() {
    const backdrop = document.getElementById("readerTagPickerBackdrop");
    const picker = document.getElementById("readerTagPicker");
    if (backdrop) {
      backdrop.classList.remove("on");
      backdrop.onclick = null;
    }
    if (picker) picker.classList.remove("on");
  },

  applyMode(mode) {
    this._settings.mode = mode;
    const wrap = document.getElementById("readerPages");
    if (!wrap) return;
    this._resetZoom();
    wrap.className = "reader-pages";
    if (mode === "LEFT_TO_RIGHT") wrap.classList.add("horizontal");

    // При ручном переключении — прыгаем на текущую страницу
    this.scrollToIndex(this._currentIndex, false);
    this.updateSettingsUI();
  },

  scrollToIndex(idx, smooth = true) {
    const wrap = document.getElementById("readerPages");
    if (!wrap) return;
    const imgs = wrap.querySelectorAll("img");
    if (!imgs[idx]) return;
    const img = imgs[idx];
    if (this._settings.mode === "WEBTOON") {
      wrap.scrollTo({
        top: img.offsetTop - 10,
        behavior: smooth ? "smooth" : "auto",
      });
    } else {
      wrap.scrollTo({
        left: img.offsetLeft,
        behavior: smooth ? "smooth" : "auto",
      });
    }
    this._currentIndex = idx;
    this.updateCounter();
  },

  updateCounter() {
    const bounds = this.getCurrentChapterBounds();
    const titleEl = document.getElementById("readerTitle");
    const volEl = document.getElementById("readerHeadVol");
    const posEl = document.getElementById("readerHeadPos");
    const fill = document.getElementById("readerProgressFill");

    // Название — Great Vibes, по центру
    if (titleEl) {
      titleEl.textContent = this._baseTitle || "Полка";
    }

    if (!bounds) {
      if (volEl) volEl.textContent = "";
      if (posEl) posEl.textContent = "";
      if (fill) fill.style.width = "0%";
      this._updateLikeButtonState();
      return;
    }

    const _chObj = (this._chaptersList || []).find(
      (c) => c.id === bounds.chapterId,
    );
    const chapLabel =
      _chObj && _chObj.textual
        ? _chObj.name || "Доп. " + bounds.number
        : "Глава " + bounds.number;
    if (volEl) volEl.textContent = "Том " + bounds.volume;
    if (posEl)
      posEl.textContent =
        chapLabel +
        " • Фрейм " +
        bounds.pageInChapter +
        "/" +
        bounds.totalInChapter;

    if (fill) {
      if (bounds.totalInChapter > 1) {
        const pct =
          ((bounds.pageInChapter - 1) / (bounds.totalInChapter - 1)) * 100;
        fill.style.width = pct + "%";
      } else {
        fill.style.width = "0%";
      }
    }

    this._updateLikeButtonState();
    this._autoAdvanceStatusIfNeeded(bounds.number);
    this._checkEndOfManga();

    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveProgress(), 1000);
  },

  updateChapterNav() {
    const prevBtn = document.getElementById("readerPrevChapter");
    const nextBtn = document.getElementById("readerNextChapterBtn");
    if (prevBtn) prevBtn.disabled = !this._prevChapter;
    if (nextBtn) nextBtn.disabled = !this._nextChapter;
  },

  updateNextBlock() {
    const nextDiv = document.getElementById("readerNextBlock");
    if (!nextDiv) return;
    if (this._nextChapter) {
      nextDiv.innerHTML = `<button class="btn primary" id="btnNextChapter">Перейти к Главе ${this._nextChapter.number}</button>`;
    } else {
      nextDiv.innerHTML = `<div style="color:var(--fg2);text-align:center;">Это была последняя глава</div>`;
    }
    const btn = nextDiv.querySelector("#btnNextChapter");
    if (btn)
      btn.onclick = () => {
        if (!this._nextChapter) return;
        this.loadChapter(
          this._nextChapter.volume,
          this._nextChapter.number,
          this._nextChapter.id,
        );
      };
  },

  checkNextChapterUI() {
    const block = document.getElementById("readerNextBlock");
    if (!block) return;
    const bounds = this.getCurrentChapterBounds();
    if (!bounds) {
      block.classList.remove("show");
      return;
    }
    const isLastPage = this._currentIndex === bounds.endIdx;
    if (isLastPage && this._settings.nextChapter === "button") {
      block.classList.add("show");
    } else {
      block.classList.remove("show");
    }
  },

  // Обёртка: не качаем один и тот же кадр дважды (скролл вызывает предзагрузку многократно)
  loadPage(idx) {
    if (this._blobUrls[idx]) return Promise.resolve();
    const wrap = document.getElementById("readerPages");
    const img = wrap ? wrap.querySelectorAll("img")[idx] : null;
    if (!img) return Promise.resolve();
    if (img._loadingPromise) return img._loadingPromise;
    // После неудачи не долбим сервер чаще раза в 3 с — повтор сделает сторож/скролл
    if (img._failedAt && Date.now() - img._failedAt < 3000)
      return Promise.resolve();
    const pr = this._loadPageImpl(idx, img).finally(() => {
      img._loadingPromise = null;
    });
    img._loadingPromise = pr;
    return pr;
  },

  // Скачивает картинку: по списку зеркал, с таймаутами и до 3 кругов повторов.
  // Возвращает Blob или null. Раньше один сбой = кадр чёрный навсегда.
  async _fetchImageBlob(urls, headers, mime, mySession) {
    const CHttp = window.Capacitor?.Plugins?.CapacitorHttp;
    if (!CHttp) return null;
    const ROUNDS = 3;
    for (let round = 0; round < ROUNDS; round++) {
      let allPermanent = true; // все ответы 404/401/410 — повторять бессмысленно
      for (const tryUrl of urls) {
        if (this._sessionId !== mySession) return null;
        try {
          const r = await Promise.race([
            CHttp.get({
              url: tryUrl,
              headers,
              responseType: "arraybuffer",
              connectTimeout: 12000,
              readTimeout: 30000,
            }),
            // страховка: плагин мог «повиснуть» без ответа
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error("timeout")), 35000),
            ),
          ]);
          if (this._sessionId !== mySession) return null;
          if (r.status === 200 && r.data) {
            let b64 = r.data;
            if (typeof b64 === "string" && b64.startsWith("data:image"))
              b64 = b64.split(",")[1];
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new Blob([bytes], { type: mime });
          }
          if (![404, 401, 410].includes(r.status)) allPermanent = false;
          console.warn("[loadPage]", tryUrl, "HTTP", r.status);
        } catch (e) {
          allPermanent = false;
          console.warn("[loadPage]", tryUrl, "ERR", e && e.message);
        }
      }
      if (allPermanent) break;
      if (round < ROUNDS - 1)
        await new Promise((r) => setTimeout(r, 700 * (round + 1)));
    }
    return null;
  },

  _markPageFailed(img, mySession) {
    img._failedAt = Date.now();
    img._fails = (img._fails || 0) + 1;
    img.alt = "Не удалось загрузить страницу";
    img.style.opacity = "0.3";
    // Сторож: пока рядом есть незагруженные кадры — пробуем снова сами,
    // даже если пользователь стоит на месте и не скроллит
    if (img._fails <= 8) {
      setTimeout(() => {
        if (this._sessionId !== mySession || !img.isConnected) return;
        this._preloadAround(this._currentIndex);
      }, 3300);
    }
  },

  async _loadPageImpl(idx, img) {
    if (this._blobUrls[idx]) return;
    const wrap = document.getElementById("readerPages");
    if (!wrap || !img) return;

    const pageInfo = this._pagesList[idx];
    if (!pageInfo) return;

    const mySession = this._sessionId;
    if (!window.Capacitor?.Plugins?.CapacitorHttp) {
      console.warn("[loadPage] Нет CapacitorHttp");
      return;
    }

    let blob = null;

    if (this._source === "comizy") {
      // ═══ COMIZY ═══
      const url = String(pageInfo.url || "").trim();
      if (!url) return;
      blob = await this._fetchImageBlob(
        [url],
        {
          Referer: "https://comizy.io/",
          Origin: "https://comizy.io",
          "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        "image/webp",
        mySession,
      );
    } else {
      // ═══ SLASHLIB ═══
      let path;
      const rawUrl = String(pageInfo.url || "").trim();
      if (rawUrl) {
        if (/^https?:\/\//i.test(rawUrl)) path = rawUrl;
        else path = rawUrl.replace(/^\/+/, "");
      } else {
        const raw = String(pageInfo.image || "").replace(/^\/+/, "");
        path = `manga/${this._shortSlug}/chapters/${pageInfo.chapterId}/${raw}`;
      }
      const domains = [
        "https://img3.hentaicdn.org",
        "https://img3.cdnlibs.link",
        "https://img3.cdnlibs.org",
      ];
      const urls = path.startsWith("http")
        ? [path]
        : domains.map((base) => `${base}/${path}`);
      const token = localStorage.getItem("slashlib_token");
      blob = await this._fetchImageBlob(
        urls,
        {
          Authorization: "Bearer " + token,
          Origin: "https://v2.shlib.life",
          Referer: "https://v2.shlib.life/",
          "Site-Id": "2",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        "image/png",
        mySession,
      );
    }

    if (this._sessionId !== mySession) return;
    if (!blob) {
      this._markPageFailed(img, mySession);
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    if (!img.isConnected) {
      URL.revokeObjectURL(blobUrl);
      return;
    }
    // Индекс берём у самого элемента: он мог сдвинуться, пока кадр качался
    // (например, при подгрузке предыдущей главы сверху)
    const realIdx = Number(img.dataset.index);
    const key = Number.isFinite(realIdx) ? realIdx : idx;
    if (this._blobUrls[key]) {
      URL.revokeObjectURL(this._blobUrls[key]);
    }
    this._blobUrls[key] = blobUrl;
    img._failedAt = 0;
    img._fails = 0;
    this._setPageSrc(wrap, img, blobUrl);
  },

  // Ставит картинку и компенсирует скролл, если реальная высота отличается
  // от высоты заглушки (иначе контент над экраном «сдвигает» позицию вниз)
_setPageSrc(wrap, img, blobUrl) {
  const webtoon = this._settings.mode === "WEBTOON";
  const oldH = img.offsetHeight;
  img.src = blobUrl;
  img.style.opacity = "1";
  img.style.width = "";

  // Перезаписываем aspect-ratio по реальным размерам картинки.
  // API Comizy часто врёт (отдаёт 1000×1365 для 1080×1080) — это лечит.
  const fixRatio = () => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
    }
  };

  if (!webtoon) {
    if (img.complete && img.naturalHeight) fixRatio();
    else img.addEventListener("load", fixRatio, { once: true });
    void wrap.scrollHeight;
    return;
  }

  const fix = () => {
    if (!img.isConnected) return;
    fixRatio();
    const a = this._anchor;
    if (a && Date.now() - a.t < 8000 && (this._userScrolledAt || 0) < a.t) {
      const ai = wrap.querySelectorAll("img")[a.idx];
      if (ai && ai.offsetHeight > 0) {
        wrap.scrollTop = Math.max(
          0,
          ai.offsetTop + a.ratio * ai.offsetHeight,
        );
        return;
      }
    }
    const d = img.offsetHeight - oldH;
    if (!d || oldH <= 0) return;
    const top = img.offsetTop,
      cur = wrap.scrollTop;
    let adj = 0;
    if (top + oldH <= cur) adj = d;
    else if (top < cur) adj = (d * (cur - top)) / oldH;
    if (adj) wrap.scrollTop = cur + adj;
  };
  if (img.complete && img.naturalHeight) fix();
  else img.addEventListener("load", fix, { once: true });
},
  
  bindGestures() {
    const wrap = document.getElementById("readerPages");
    const stage = document.getElementById("readerStage");
    const modal = document.getElementById("readerModal");
    if (!wrap || !stage || !modal) return;

    wrap.onscroll = () => {
      if (this._restoring) return;
      if (!this._pagesList.length) return;

      const curST = wrap.scrollTop;
      if (curST !== this._lastScrollTop) {
        this._scrollDir = curST > this._lastScrollTop ? "down" : "up";
        this._lastScrollTop = curST;
      }

      // ── UI: гистерезис показа/скрытия ──
      {
        const showUI = () => {
          if (modal.classList.contains("ui-hidden")) {
            modal.classList.remove("ui-hidden");
            this._syncStatusBar();
            this._lastAutoShowAt = Date.now();
          }
        };
        const hideUI = () => {
          if (!modal.classList.contains("ui-hidden")) {
            modal.classList.add("ui-hidden");
            this._syncStatusBar();
          }
        };

        const st = wrap.scrollTop;
        const stMax = wrap.scrollHeight - wrap.clientHeight;
        const SHOW_EDGE = 80;
        const HIDE_EDGE = 200;
        const atTopShow = st <= SHOW_EDGE;
        const atTopHide = st > HIDE_EDGE;
        const atBottomShow = st >= stMax - SHOW_EDGE;
        const atBottomHide = st < stMax - HIDE_EDGE;
        const isButtonMode = this._settings.nextChapter === "button";
        const atStartManga = !this._prevChapter;
        const atEndManga = !this._nextChapter;
        const isUserScroll = Date.now() - (this._userScrolledAt || 0) <= 500;

        const inShowZone =
          (isButtonMode && (atTopShow || atBottomShow)) ||
          (atStartManga && atTopShow) ||
          (atEndManga && atBottomShow);
        const inHideZone =
          (isButtonMode && (atTopHide || atBottomHide)) ||
          (atStartManga && atTopHide) ||
          (atEndManga && atBottomHide);

        const uiHidden = modal.classList.contains("ui-hidden");
        if (uiHidden && inShowZone) showUI();
        else if (!uiHidden && inHideZone && isUserScroll) hideUI();
      }

      // ── Текущий фрейм ──
      const imgs = wrap.querySelectorAll("img");
      let idx = 0,
        found = false;

      if (this._settings.mode === "WEBTOON") {
        const threshold = wrap.scrollTop + window.innerHeight / 3;
        for (let i = 0; i < imgs.length; i++) {
          if (imgs[i].offsetTop <= threshold) {
            idx = i;
            found = true;
          }
        }
      } else {
        for (let i = 0; i < imgs.length; i++) {
          if (imgs[i].offsetLeft <= wrap.scrollLeft + 100) {
            idx = i;
            found = true;
          }
        }
      }

      if (!found) idx = this._currentIndex;

      if (idx !== this._currentIndex) {
        this._currentIndex = idx;
        this.updateCounter();
        this.updateChapterNav();
        this.updateReaderTitle();
        this.checkNextChapterUI();
      }
      // Предзагрузка — на КАЖДЫЙ скролл (с троттлингом), а не только при смене кадра:
      // иначе, если кадр не скачался, а текущий индекс не меняется, догрузка не запускалась никогда
      {
        const nowT = Date.now();
        if (nowT - (this._lastPreloadAt || 0) > 120) {
          this._lastPreloadAt = nowT;
          this._preloadAround(this._currentIndex);
        }
      }
      this.checkAutoLoad();
      this.checkPrevLoad();
    };

    let startX = 0,
      startY = 0,
      dragging = false;

    stage.ontouchstart = (e) => {
      // ── Pinch ──
      if (e.touches.length === 2 && this._settings.doubleTapZoom) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        if (d <= 0) return;

        const wrapRect = wrap.getBoundingClientRect();
        const cs = getComputedStyle(wrap);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padT = parseFloat(cs.paddingTop) || 0;

        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const fxRel = mx - wrapRect.left;
        const fyRel = my - wrapRect.top;

        this._pinchStartDist = d;
        this._pinchStartZoom = this._zoom || 1;
        this._pinchContentX =
          (wrap.scrollLeft + fxRel - padL) / this._pinchStartZoom;
        this._pinchContentY =
          (wrap.scrollTop + fyRel - padT) / this._pinchStartZoom;
        this._pinchPadL = padL;
        this._pinchPadT = padT;
        this._pinchActive = true;

        clearTimeout(this._tapTimer);
        this._tapTimer = null;
        this._lastTapTime = 0;
        return;
      }

      if (e.touches.length === 1) {
        // Отменяем отложенный одиночный тап, но _lastTapTime НЕ трогаем —
        // по нему в touchend определяется double-tap
        clearTimeout(this._tapTimer);
        this._tapTimer = null;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dragging = false;
      }
    };

    stage.ontouchmove = (e) => {
      // ── Pinch ──
      if (this._pinchActive && e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();

        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        if (this._pinchStartDist <= 0) return;

        let z = this._pinchStartZoom * (d / this._pinchStartDist);
        z = Math.max(1, Math.min(3, z));

        const wrapRect = wrap.getBoundingClientRect();
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const fxRel = mx - wrapRect.left;
        const fyRel = my - wrapRect.top;

        this._zoom = z;
        this._applyZoomTransform(z);
        wrap.getBoundingClientRect();

        const maxSL = wrap.scrollWidth - wrap.clientWidth;
        const maxST = wrap.scrollHeight - wrap.clientHeight;
        wrap.scrollLeft = Math.max(
          0,
          Math.min(maxSL, this._pinchContentX * z + this._pinchPadL - fxRel),
        );
        wrap.scrollTop = Math.max(
          0,
          Math.min(maxST, this._pinchContentY * z + this._pinchPadT - fyRel),
        );
        return;
      }

      if (e.touches.length !== 1) return;

      // Любое движение пальца = не тап. Отменяем таймер сразу,
      // не дожидаясь порога 8px — иначе медленный скролл мигает UI
      if (this._tapTimer) {
        clearTimeout(this._tapTimer);
        this._tapTimer = null;
      }

      if (
        Math.abs(e.touches[0].clientX - startX) > 8 ||
        Math.abs(e.touches[0].clientY - startY) > 8
      ) {
        dragging = true;
        this._userScrolledAt = Date.now();
      }
    };

    stage.ontouchend = (e) => {
      // ── Завершение pinch ──
      if (this._pinchActive && e.touches.length < 2) {
        this._pinchActive = false;

        if (this._zoom < 1.1) {
          const stageRect = stage.getBoundingClientRect();
          const fxRel = stageRect.left + stageRect.width / 2;
          const fyRel = stageRect.top + stageRect.height / 2;
          this._animateZoomTo(1, fxRel, fyRel, 200);
        }

        clearTimeout(this._tapTimer);
        this._tapTimer = null;
        this._lastTapTime = 0;
        return;
      }

      // Форс-скролл к низу — только если последнее движение было ВНИЗ.
      // Иначе при отъезжании вверх от низа пользователя вытянет обратно
      if (this._scrollDir === "down") {
        const mx = wrap.scrollHeight - wrap.clientHeight;
        const dist = mx - wrap.scrollTop;
        if (dist > 0 && dist < 350) wrap.scrollTop = mx;
      }

      // ── Горизонтальный режим ──
      if (this._settings.mode !== "WEBTOON" && dragging) {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 50) {
          if (dx < 0 && this._currentIndex < this._pagesList.length - 1) {
            this.scrollToIndex(this._currentIndex + 1);
          } else if (dx > 0 && this._currentIndex > 0) {
            this.scrollToIndex(this._currentIndex - 1);
          }
        }
        return;
      }

      if (!dragging) {
        if (e.target.closest("button")) return;
        if (e.target.closest("#readerNextBlock")) return;
        if (e.target.closest(".reader-island")) return;
        if (e.target.closest(".reader-head")) return;
        if (e.target.closest(".reader-settings-modal")) return;
        if (e.target.closest(".reader-chapters-modal")) return;
        if (Date.now() - (this._lastAutoShowAt || 0) < 500) return;

        const touch = e.changedTouches[0];
        const now = Date.now();
        const tapDist = Math.hypot(
          touch.clientX - this._lastTapX,
          touch.clientY - this._lastTapY,
        );

        // ── Double-tap ──
        if (
          this._settings.doubleTapZoom &&
          now - this._lastTapTime < 240 &&
          tapDist < 40
        ) {
          clearTimeout(this._tapTimer);
          this._tapTimer = null;
          this._lastTapTime = 0;
          this._handleDoubleTap(touch.clientX, touch.clientY);
          return;
        }

        // ── Одиночный тап: отложенный toggle UI ──
        this._lastTapTime = now;
        this._lastTapX = touch.clientX;
        this._lastTapY = touch.clientY;

        clearTimeout(this._tapTimer);
        this._tapTimer = setTimeout(() => {
          if (Date.now() - this._lastTapTime >= 240) {
            modal.classList.toggle("ui-hidden");
            this._syncStatusBar();
          }
        }, 240);
      }
    };

    stage.ontouchcancel = () => {
      this._pinchActive = false;
      dragging = false;
    };
  },

  _isSettling() {
    const a = this._anchor;
    if (!a) return false;
    // Если пользователь уже двигал скролл после установки якоря — не мешаем
    if ((this._userScrolledAt || 0) > a.t) return false;
    // Окно «прилипания» — 1.5 секунды хватает, чтобы восстановить позицию
    return Date.now() - a.t < 1500;
  },

  async checkAutoLoad() {
    if (this._isSettling()) return;
    if (this._settings.nextChapter !== "auto") return;
    if (!this._nextChapter) return;
    if (this._autoLoading) return;
    if (!this._pagesList.length) return;

    // ═══ COMIZY ═══
    if (this._source === "comizy") {
      const bounds = this.getCurrentChapterBounds();
      if (!bounds) return;
      const remaining = bounds.endIdx - this._currentIndex;
      if (remaining > 2) return;
      if (this._pagesList.length > bounds.endIdx + 1) return;

      const mySession = this._sessionId;
      let nextChapter = this._nextChapter;
      while (
        nextChapter &&
        this._isComizyChapterHidden(this._fullSlug, nextChapter.id)
      ) {
        const currIdx = this._chaptersList.findIndex(
          (c) => String(c.id) === String(nextChapter.id),
        );
        nextChapter =
          currIdx !== -1 && currIdx < this._chaptersList.length - 1
            ? this._chaptersList[currIdx + 1]
            : null;
      }
      if (!nextChapter) return;

      this._autoLoading = true;
      try {
        const mangaSlug = this._fullSlug.replace(/^comizy:/, "");
        const fetchedPages = await ComizyParser.getChapterPages(
          mangaSlug,
          nextChapter.slug,
        );
        if (this._sessionId !== mySession) return;
        if (!fetchedPages || !fetchedPages.length) return;

        // Дисклеймеры по хэшу — тихо, как и при открытии главы
        const fr = await this._filterDisclaimers(fetchedPages, 0, true);
        if (this._sessionId !== mySession) return;
        const rawPages = fr.pages;
        if (!rawPages.length) {
          // Глава из одних дисклеймеров — перепрыгиваем её
          const ci = this._chaptersList.findIndex(
            (c) => String(c.id) === String(nextChapter.id),
          );
          this._nextChapter =
            ci !== -1 && ci < this._chaptersList.length - 1
              ? this._chaptersList[ci + 1]
              : null;
          this.updateChapterNav();
          this.updateNextBlock();
          return;
        }

        const wrap = document.getElementById("readerPages");
        const nextBlock = document.getElementById("readerNextBlock");
        if (!wrap) return;
        const startIdx = this._pagesList.length;
        rawPages.forEach((page, i) => {
          const img = document.createElement("img");
          img.alt = "Страница " + (startIdx + i + 1);
          img.style.opacity = "0";
          img.style.transition = "opacity 0.3s ease";
          img.style.aspectRatio =
            page.width && page.height
              ? `${page.width} / ${page.height}`
              : "2 / 3";
          img.style.width = "100%";
          if (nextBlock) wrap.insertBefore(img, nextBlock);
          else wrap.appendChild(img);
          this._pagesList.push({
            image: "",
            url: page.url,
            width: page.width || 0,
            height: page.height || 0,
            chapterId: nextChapter.id,
            volume: 1,
            number: nextChapter.number,
          });
        });
        this._reindexReaderImgs();
        const currIdx = this._chaptersList.findIndex(
          (c) => String(c.id) === String(nextChapter.id),
        );
        this._nextChapter =
          currIdx !== -1 && currIdx < this._chaptersList.length - 1
            ? this._chaptersList[currIdx + 1]
            : null;
        this._prevChapter =
          currIdx > 0 ? this._chaptersList[currIdx - 1] : null;
        this.updateChapterNav();
        this.updateNextBlock();
        this.updateReaderTitle();
        for (let i = 0; i < Math.min(3, rawPages.length); i++) {
          try {
            await this.loadPage(startIdx + i);
          } catch (e) {}
        }
      } catch (e) {
        console.warn("[Comizy AutoLoad]", e);
      } finally {
        this._autoLoading = false;
      }
      return;
    }

    const bounds = this.getCurrentChapterBounds();
    if (!bounds) return;

    const remaining = bounds.endIdx - this._currentIndex;
    if (remaining > 2) return;

    if (this._pagesList.length > bounds.endIdx + 1) return;

    this._autoLoading = true;
    try {
      const token = localStorage.getItem("slashlib_token");
      const chapRes = await nativeFetch(
        `https://api.cdnlibs.org/api/manga/${this._fullSlug}/chapter?volume=${this._nextChapter.volume}&number=${this._nextChapter.number}`,
        {
          Authorization: "Bearer " + token,
          "Site-Id": "2",
          Origin: "https://v2.shlib.life",
          Referer: "https://v2.shlib.life/",
        },
      );
      const chapJson = await chapRes.json();
      const chapData = chapJson.data;
      if (!chapData || !chapData.pages || !chapData.pages.length) return;

      // Фильтруем дисклеймеры в подгружаемой главе — тихо, без тостов
      const filterResult = await this._filterDisclaimers(
        chapData.pages,
        0,
        true,
      );
      const filteredPages = filterResult.pages;
      if (!filteredPages.length) return;

      const wrap = document.getElementById("readerPages");
      const nextBlock = document.getElementById("readerNextBlock");
      if (!wrap) return;

      const startIdx = this._pagesList.length;
      filteredPages.forEach((page, i) => {
        const img = document.createElement("img");
        img.alt = "Страница " + (startIdx + i + 1);
        img.style.opacity = "0";
        img.style.transition = "opacity 0.3s ease";
        // Размер заглушки — по данным API: тогда подмена на реальный кадр не двигает ленту
        img.style.aspectRatio =
          page.width && page.height ? `${page.width} / ${page.height}` : "2 / 3";
        img.style.width = "100%";
        if (nextBlock) wrap.insertBefore(img, nextBlock);
        else wrap.appendChild(img);

        this._pagesList.push({
          image: page.image,
          url: page.url || "",
          width: page.width || 0,
          height: page.height || 0,
          chapterId: chapData.id,
          volume: chapData.volume,
          number: chapData.number,
        });
      });

      // Пересчитать индексы у всех img
      this._reindexReaderImgs();

      const currIdx = this._chaptersList.findIndex((c) => c.id === chapData.id);
      this._nextChapter =
        currIdx !== -1 && currIdx < this._chaptersList.length - 1
          ? this._chaptersList[currIdx + 1]
          : null;
      this._prevChapter = currIdx > 0 ? this._chaptersList[currIdx - 1] : null;

      this.updateChapterNav();
      this.updateNextBlock();
      this.updateReaderTitle();

      for (let i = 0; i < Math.min(3, filteredPages.length); i++) {
        try {
          await this.loadPage(startIdx + i);
        } catch (e) {}
      }
    } catch (e) {
      console.warn("[AutoLoad chapter]", e);
    } finally {
      this._autoLoading = false;
    }
  },

  async checkPrevLoad() {
    if (this._isSettling()) return;
    if (!this._prevChapter) return;
    if (this._prevLoading) return;
    if (this._restoring) return;
    if (!this._pagesList.length) return;
    const bounds = this.getCurrentChapterBounds();
    if (!bounds) return;
    if (
      this._prevChapter &&
      this._prevChapter.number != null &&
      bounds.number != null
    ) {
      if (parseFloat(this._prevChapter.number) >= parseFloat(bounds.number)) {
        this._prevChapter = null;
        this.updateChapterNav();
        return;
      }
    }
    if (this._pagesList[0].chapterId !== bounds.chapterId) return;

    const remaining = this._currentIndex - bounds.startIdx;
    if (remaining > 2) return;

    // ═══ COMIZY ═══
    if (this._source === "comizy") {
      const mySession = this._sessionId;
      let prevChapter = this._prevChapter;
      while (
        prevChapter &&
        this._isComizyChapterHidden(this._fullSlug, prevChapter.id)
      ) {
        const currIdx = this._chaptersList.findIndex(
          (c) => String(c.id) === String(prevChapter.id),
        );
        prevChapter = currIdx > 0 ? this._chaptersList[currIdx - 1] : null;
      }
      if (!prevChapter) {
        this._prevChapter = null;
        this.updateChapterNav();
        return;
      }

      this._prevLoading = true;
      try {
        const mangaSlug = this._fullSlug.replace(/^comizy:/, "");
        const rawPages = await ComizyParser.getChapterPages(
          mangaSlug,
          prevChapter.slug,
        );
        if (!rawPages || !rawPages.length) return;
        if (this._sessionId !== mySession) return;

        // Убираем дисклеймеры по хэшу (тихо), как при открытии главы
        const filterResult = await this._filterDisclaimers(rawPages, 0, true);
        if (this._sessionId !== mySession) return;
        const filteredPages = filterResult.pages;
        if (!filteredPages.length) {
          // Глава целиком из дисклеймеров — пропускаем её и идём дальше назад
          const ci = this._chaptersList.findIndex(
            (c) => String(c.id) === String(prevChapter.id),
          );
          this._prevChapter = ci > 0 ? this._chaptersList[ci - 1] : null;
          this.updateChapterNav();
          return;
        }

        const wrap = document.getElementById("readerPages");
        if (!wrap) return;
        const imgsBefore = wrap.querySelectorAll("img");
        const curImgBefore = imgsBefore[this._currentIndex];
        const relOffset = curImgBefore
          ? wrap.scrollTop - curImgBefore.offsetTop
          : 0;
        const addedCount = filteredPages.length;
        const firstChild = wrap.firstChild;
        this._restoring = true;

        // Вставляем в обратном порядке, чтобы итоговый порядок был P0, P1, P2...
        for (let i = addedCount - 1; i >= 0; i--) {
          const img = document.createElement("img");
          img.alt = "Страница " + (i + 1);
          img.style.opacity = "0";
          img.style.transition = "opacity 0.3s ease";
          img.style.aspectRatio =
            filteredPages[i].width && filteredPages[i].height
              ? `${filteredPages[i].width} / ${filteredPages[i].height}`
              : "2 / 3";
          img.style.width = "100%";
          if (firstChild) wrap.insertBefore(img, firstChild);
          else wrap.appendChild(img);
          this._pagesList.unshift({
            image: "",
            url: filteredPages[i].url,
            width: filteredPages[i].width || 0,
            height: filteredPages[i].height || 0,
            chapterId: prevChapter.id,
            volume: 1,
            number: prevChapter.number,
          });
        }
        this._reindexReaderImgs();

        // КРИТИЧНО: сдвигаем индекс текущего кадра и кэш blob-ов,
        // иначе loadPage считает новые кадры «уже загруженными»
        this._currentIndex += addedCount;
        const shiftedBlobs = {};
        for (const [key, url] of Object.entries(this._blobUrls)) {
          shiftedBlobs[parseInt(key, 10) + addedCount] = url;
        }
        this._blobUrls = shiftedBlobs;

        if (this._anchor) this._anchor.idx += addedCount;

        // Сразу возвращаем скролл на тот же кадр (заглушки уже имеют высоту)
        const imgsNow = wrap.querySelectorAll("img");
        const curNow = imgsNow[this._currentIndex];
        if (curNow) wrap.scrollTop = curNow.offsetTop + relOffset;
          setTimeout(() => {
          this._restoring = false;
        }, 250);

        // Следующий «предыдущий» — тот, что перед только что добавленной главой
        const ci = this._chaptersList.findIndex(
          (c) => String(c.id) === String(prevChapter.id),
        );
        this._prevChapter = ci > 0 ? this._chaptersList[ci - 1] : null;
        this.updateChapterNav();
        this.updateCounter();

        // Грузим нижние кадры добавленной главы (ближайшие к чтению) — остальные подтянутся скроллом
        const idxs = [];
        for (let i = addedCount - 1; i >= Math.max(0, addedCount - 4); i--)
          idxs.push(i);
        await this.loadPagesBatch(idxs, 4);
        if (this._sessionId !== mySession) return;

        this._reindexReaderImgs();
      } catch (e) {
        console.warn("[Comizy PrevLoad]", e);
        this._restoring = false;
      } finally {
        this._prevLoading = false;
      }
      return;
    }

    if (Date.now() - (this._prevFailAt || 0) < 4000) return;
    const mySession = this._sessionId;
    this._prevLoading = true;
    try {
      const token = localStorage.getItem("slashlib_token");
      const chapRes = await nativeFetch(
        `https://api.cdnlibs.org/api/manga/${this._fullSlug}/chapter?volume=${this._prevChapter.volume}&number=${this._prevChapter.number}`,
        {
          Authorization: "Bearer " + token,
          "Site-Id": "2",
          Origin: "https://v2.shlib.life",
          Referer: "https://v2.shlib.life/",
        },
      );
      const chapJson = await chapRes.json();
      const chapData = chapJson.data;
      if (this._sessionId !== mySession) return;
      if (!chapData || !chapData.pages || !chapData.pages.length) {
        this._prevFailAt = Date.now();
        return;
      }

      // Фильтруем дисклеймеры в подгружаемой главе — тихо, без тостов
      const filterResult = await this._filterDisclaimers(
        chapData.pages,
        0,
        true,
      );
      if (this._sessionId !== mySession) return;
      const filteredPages = filterResult.pages;
      if (!filteredPages.length) {
        // Глава целиком из дисклеймеров — идём к предыдущей
        const ci = this._chaptersList.findIndex(
          (c) => String(c.id) === String(chapData.id),
        );
        this._prevChapter = ci > 0 ? this._chaptersList[ci - 1] : null;
        this.updateChapterNav();
        return;
      }

      const wrap = document.getElementById("readerPages");
      if (!wrap) return;

      const imgsBefore = wrap.querySelectorAll("img");
      const curImgBefore = imgsBefore[this._currentIndex];
      const relOffset = curImgBefore
        ? wrap.scrollTop - curImgBefore.offsetTop
        : 0;

      const addedCount = filteredPages.length;
      const firstChild = wrap.firstChild;

      this._restoring = true;

      // Вставляем в ОБРАТНОМ порядке — каждая вставка идёт в начало,
      // поэтому итоговый порядок будет [P0, P1, P2, old...]
      for (let i = addedCount - 1; i >= 0; i--) {
        const img = document.createElement("img");
        img.alt = "Страница " + (i + 1);
        img.style.opacity = "0";
        img.style.transition = "opacity 0.3s ease";
        img.style.aspectRatio =
          filteredPages[i].width && filteredPages[i].height
            ? `${filteredPages[i].width} / ${filteredPages[i].height}`
            : "2 / 3";
        img.style.width = "100%";
        if (firstChild) wrap.insertBefore(img, firstChild);
        else wrap.appendChild(img);

        this._pagesList.unshift({
          image: filteredPages[i].image,
          url: filteredPages[i].url || "",
          width: filteredPages[i].width || 0,
          height: filteredPages[i].height || 0,
          chapterId: chapData.id,
          volume: chapData.volume,
          number: chapData.number,
        });
      }

      // КРИТИЧНО: всё, что хранит индексы, сдвигаем СИНХРОННО в один тик
      this._reindexReaderImgs();
      this._currentIndex += addedCount;
      if (this._anchor) this._anchor.idx += addedCount;
      const shiftedBlobs = {};
      for (const [key, url] of Object.entries(this._blobUrls)) {
        shiftedBlobs[parseInt(key, 10) + addedCount] = url;
      }
      this._blobUrls = shiftedBlobs;

      // Сразу возвращаем позицию (заглушки уже имеют высоту)
      {
        const cur = wrap.querySelectorAll("img")[this._currentIndex];
        if (cur) wrap.scrollTop = cur.offsetTop + relOffset;
      }

      const currIdx = this._chaptersList.findIndex(
        (c) => String(c.id) === String(chapData.id),
      );
      this._prevChapter = currIdx > 0 ? this._chaptersList[currIdx - 1] : null;
      this.updateReaderTitle();
      this.updateChapterNav();
      this.updateCounter();

      // Лента готова — не блокируем скролл дольше нескольких сотен мс
      setTimeout(() => {
        this._restoring = false;
      }, 250);

      // Грузим только нижние кадры новой главы (ближайшие к чтению),
      // остальные подтянет предзагрузка по мере скролла вверх
      const idxs = [];
      for (let i = addedCount - 1; i >= Math.max(0, addedCount - 4); i--)
        idxs.push(i);
      await this.loadPagesBatch(idxs, 4);
      if (this._sessionId !== mySession) return;

      // Финального «возврата» скролла нет: он дёргал ленту, если человек уже листал
      // (инерция). Разницу высот при подмене заглушек компенсирует _setPageSrc.
      this._reindexReaderImgs();
    } catch (e) {
      console.warn("[PrevLoad chapter]", e);
      this._prevFailAt = Date.now();
      this._restoring = false;
    } finally {
      this._prevLoading = false;
    }
  },

  async loadChapter(volume, number, chapterId, progress) {
    toast("Загружаю главу...", "success");

    // ═══ COMIZY ═══
    if (this._source === "comizy") {
      const mangaSlug = this._fullSlug.replace(/^comizy:/, "");
      const chapters = this._chaptersList || [];
      const target =
        chapters.find((c) => String(c.id) === String(chapterId)) ||
        chapters.find((c) => parseFloat(c.number) === parseFloat(number));
      if (!target) {
        toast("Глава не найдена", "error");
        return;
      }

      try {
        const rawPages = await ComizyParser.getChapterPages(
          mangaSlug,
          target.slug,
        );
        if (!rawPages || !rawPages.length) {
          toast("Нет страниц", "warn");
          return;
        }

        const pages = rawPages.map((p) => ({
          image: "",
          url: p.url,
          width: p.width || 0,
          height: p.height || 0,
          chapterId: target.id,
          volume: 1,
          number: target.number,
        }));

        const baseTitle = (this._baseTitle || "").trim();
        const title = baseTitle + " - Chapter " + target.number;
        this.open(
          this._fullSlug,
          target.id,
          1,
          target.number,
          pages,
          title,
          progress || null,
          chapters,
          this._itemId,
          "comizy",
        );
      } catch (e) {
        console.error("[Comizy loadChapter]", e);
        toast("Ошибка загрузки главы", "error");
      }
      return;
    }

    // ═══ SLASHLIB ═══
    const token = localStorage.getItem("slashlib_token");
    try {
      const chapRes = await nativeFetch(
        `https://api.cdnlibs.org/api/manga/${this._fullSlug}/chapter?volume=${volume}&number=${number}`,
        {
          Authorization: "Bearer " + token,
          "Site-Id": "2",
          Origin: "https://v2.shlib.life",
          Referer: "https://v2.shlib.life/",
        },
      );
      const chapJson = await chapRes.json();
      const chapData = chapJson.data;

      if (chapData && chapData.pages && chapData.pages.length) {
        const baseTitle = (this._baseTitle || "").trim();
        const title =
          baseTitle + ` - Том ${chapData.volume} Глава ${chapData.number}`;
        this.open(
          this._fullSlug,
          chapData.id,
          chapData.volume,
          chapData.number,
          chapData.pages,
          title,
          progress || null,
          this._chaptersList,
          this._itemId,
          "slashlib",
        );
      } else {
        toast("Не удалось загрузить главу", "warn");
      }
    } catch (e) {
      toast("Ошибка загрузки главы", "error");
    }
  },
};
