"use strict";

/* ==========================================================
   comizy.js — Парсер Comizy + окно поиска Comizy
   ========================================================== */

// ============ ПАРСЕР COMIZY ============
const ComizyParser = {
  BASE: "https://comizy.io",
  API: "https://api.comizy.io",

  async search(query) {
    try {
      const url = `${this.BASE}/search?q=${encodeURIComponent(query)}`;
      const res = await nativeFetch(url, {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
      });
      if (!res.ok) return [];
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const nd = doc.getElementById("__NEXT_DATA__");
      if (!nd) return [];
      const pp = JSON.parse(nd.textContent).props?.pageProps;
      return (pp?.ssrItems || []).map((m) => {
        const allNames = [m.name, m.altName];
        if (Array.isArray(m.altNames)) {
          m.altNames.forEach((a) => {
            if (typeof a === "string") allNames.push(a);
            else if (a && a.name) allNames.push(a.name);
          });
        }
        return {
          hid: m.id,
          slug: m.slug,
          title: m.name,
          allNames: allNames.filter(Boolean),
          cover: m.cover,
          isAdult: m.isAdult,
          status: m.status,
          url: `${this.BASE}${m.url}`,
        };
      });
    } catch (e) {
      console.warn("Comizy search error:", e);
      return [];
    }
  },

  async getMangaDetails(slug) {
    try {
      const res = await nativeFetch(`${this.BASE}/${slug}`, {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
      });
      if (!res.ok) return null;
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const nd = doc.getElementById("__NEXT_DATA__");
      if (!nd) return null;
      const m = JSON.parse(nd.textContent).props?.pageProps?.initialManga;
      if (!m) return null;

      return {
        hid: m.id,
        slug: m.slug,
        title: m.name,
        altName: m.altName || "",
        altNames: (m.altNames || [])
          .map((a) => (typeof a === "string" ? a : a && a.name))
          .filter(Boolean),
        year: m.releaseDate || "",
        description: m.summary || "",
        cover: m.cover,
        status: m.status,
        isAdult: m.isAdult,
        contentRating: m.contentRating,
        tags: (m.genres || [])
          .map((g) => g.name)
          .concat((m.tags || []).map((t) => t.name)),
        authors: (m.authors || []).map((a) => a.name).join(", "),
        url: `${this.BASE}/${m.slug}`,
      };
    } catch (e) {
      console.warn("Comizy details error:", e);
      return null;
    }
  },

  checkSlashlibHasChapter0(itemLink) {
    return (async () => {
      if (!itemLink || !itemLink.includes("shlib.life")) return true;
      const token = localStorage.getItem("slashlib_token");
      if (!token) return true;
      const slSlug = (itemLink.match(/\/manga\/([^\/?#]+)/) || [])[1];
      if (!slSlug) return true;
      try {
        const res = await nativeFetch(
          `https://api.cdnlibs.org/api/manga/${slSlug}/chapters?limit=5`,
          {
            Authorization: "Bearer " + token,
            "Site-Id": "2",
          },
        );
        if (!res.ok) return true;
        const json = await res.json();
        const chapters = json.data || [];
        return chapters.some((c) => String(c.number) === "0");
      } catch (e) {
        return true;
      }
    })();
  },

  _extractChapterNumber(name) {
    if (!name) return null;
    const s = String(name).trim();
    const m = s.match(
      /(?:chapter|гл(?:ава)?\.?|ch\.?)\s*([\d]+(?:[.\-]\d+)*)/i,
    );
    return m ? m[1] : null;
  },

  filterJunkChapters(chapters, options) {
    if (!Array.isArray(chapters) || !chapters.length) return [];
    options = options || {};

    const parsed = chapters.map((ch) => ({
      ...ch,
      _parsed: this._extractChapterNumber(ch.name || ""),
    }));

    const groups = {};
    parsed.forEach((ch) => {
      if (!ch._parsed) return;
      const m = ch._parsed.match(/^(\d+)[.\-]/);
      const base = m ? m[1] : null;
      if (base) {
        if (!groups[base]) groups[base] = [];
        groups[base].push(ch);
      }
    });

    const junkBases = new Set();
    for (const [base, items] of Object.entries(groups)) {
      if (items.length >= 3) junkBases.add(base);
    }

    return parsed.filter((ch) => {
      if (!ch._parsed) return false;
      if (ch._parsed === "0" && options.keepChapter0 === false) return false;
      if (/^\d+-\d+$/.test(ch._parsed)) return false;
      const baseMatch = ch._parsed.match(/^(\d+)[.\-]/);
      if (baseMatch && junkBases.has(baseMatch[1])) return false;
      return true;
    });
  },

  // ======== ФИЛЬТР ГЛАВ ПО SLASHLIB (новая логика) ========
  _REMOVED_KEY: "polka_reader_removed_chapters",
  _key(n) {
    return Number(Number(n).toFixed(3));
  },

  getRemovedSet(fullSlug) {
    try {
      const all = JSON.parse(localStorage.getItem(this._REMOVED_KEY) || "{}");
      return new Set((all[fullSlug] || []).map(String));
    } catch (e) {
      return new Set();
    }
  },
  addRemoved(fullSlug, id) {
    try {
      const all = JSON.parse(localStorage.getItem(this._REMOVED_KEY) || "{}");
      const set = new Set((all[fullSlug] || []).map(String));
      set.add(String(id));
      all[fullSlug] = Array.from(set);
      localStorage.setItem(this._REMOVED_KEY, JSON.stringify(all));
    } catch (e) {}
  },
  removeRemoved(fullSlug, id) {
    try {
      const all = JSON.parse(localStorage.getItem(this._REMOVED_KEY) || "{}");
      all[fullSlug] = (all[fullSlug] || [])
        .map(String)
        .filter((x) => x !== String(id));
      localStorage.setItem(this._REMOVED_KEY, JSON.stringify(all));
    } catch (e) {}
  },

  // Номера глав на Slashlib (Set чисел) или null, если узнать не удалось
  async fetchSlashlibNumbers(itemLink) {
    try {
      if (!itemLink || !itemLink.includes("shlib.life")) return null;
      const token = localStorage.getItem("slashlib_token");
      if (!token) return null;
      const slSlug = (itemLink.match(/\/manga\/([^\/?#]+)/) || [])[1];
      if (!slSlug) return null;
      const res = await nativeFetch(
        `https://api.cdnlibs.org/api/manga/${slSlug}/chapters`,
        {
          Authorization: "Bearer " + token,
          "Site-Id": "2",
        },
      );
      if (!res.ok) return null;
      const json = await res.json();
      const set = new Set();
      (json.data || []).forEach((c) => {
        const n = parseFloat(c.number);
        if (isFinite(n)) set.add(this._key(n));
      });
      return set.size ? set : null;
    } catch (e) {
      return null;
    }
  },

  // num  — «Chapter 12», «Ch.12», «Глава 12», «12», «Chapter 12: Title»
  // junk — «Chapter 2-1», «Chapter 2xx», «Chapter 2.5.1» (число есть, но чистым его не назвать)
  // text — любое название без номера («Bonus», «Prologue»…)
  _classifyName(name) {
    const s = String(name || "").trim();
    const reA =
      /^(?:chapter|ch\.?|глава|гл\.?)\s*(\d+(?:\.\d+)?)(?![\p{L}\p{N}]|[.\-]\d)/iu;
    const reB = /^(\d+(?:\.\d+)?)\s*$/;
    const reP = /^(?:chapter|ch\.?|глава|гл\.?)\s*\d/iu;
    const m = s.match(reA) || s.match(reB);
    if (m) return { kind: "num", value: this._key(m[1]) };
    if (reP.test(s)) return { kind: "junk" };
    return { kind: "text" };
  },

  processChapters(raw, slashSet) {
    let items = raw.map((c) =>
      Object.assign({}, c, this._classifyName(c.name)),
    );

    // Нормализуем направление списка (по возрастанию)
    const nums = items.filter((i) => i.kind === "num");
    if (nums.length > 1 && nums[0].value > nums[nums.length - 1].value)
      items.reverse();

    // Хвост: если глав > 10, последние 5 не проверяем по Slashlib
    const cand = items.filter((i) => i.kind !== "junk");
    const protect = new Set();
    if (cand.length > 10) cand.slice(-5).forEach((i) => protect.add(i));

    // Если Slashlib ничего общего не дал — не фильтруем по нему (защита от пустого списка)
    let sl = slashSet && slashSet.size ? slashSet : null;
    if (sl && !items.some((i) => i.kind === "num" && sl.has(i.value)))
      sl = null;

    const kept = items.filter((i) => {
      if (i.kind === "junk") return false;
      if (i.kind === "text") return true;
      return !sl || sl.has(i.value) || protect.has(i);
    });

    // Нумерация текстовых глав (промежуточные номера)
    const used = new Set();
    if (sl) sl.forEach((v) => used.add(v));
    kept.forEach((i) => {
      if (i.kind === "num") used.add(i.value);
    });
    const firstNumItem = kept.find((i) => i.kind === "num");
    const firstNum = firstNumItem ? firstNumItem.value : null;
    let lastNum = null;
    const OFFS = [0.5, 0.6, 0.7, 0.8, 0.9, 0.4, 0.3, 0.2, 0.1];
    for (let idx = 0; idx < kept.length; idx++) {
      const it = kept[idx];
      if (it.kind === "num") {
        lastNum = it.value;
        continue;
      }
      let nextNum = null;
      for (let j = idx + 1; j < kept.length; j++) {
        if (kept[j].kind === "num") {
          nextNum = kept[j].value;
          break;
        }
      }
      const base =
        lastNum !== null ? lastNum : firstNum !== null ? firstNum - 1 : 0;
      let val = null;
      const tryVal = (v) => {
        v = this._key(v);
        if (!used.has(v) && v > base && (nextNum === null || v < nextNum)) {
          val = v;
          return true;
        }
        return false;
      };
      for (const o of OFFS) {
        if (tryVal(base + o)) break;
      }
      for (let k = 1; k < 50 && val === null; k++) tryVal(base + 0.5 + k / 100);
      if (val === null) val = this._key(base + 0.5 + (idx + 1) / 10000);
      used.add(val);
      it.value = val;
    }

    const out = kept.map((i, idx) => ({
      id: i.id,
      name: i.name,
      slug: i.slug,
      url: i.url,
      number: String(i.value),
      textual: i.kind === "text",
      _idx: idx,
    }));
    out.sort(
      (a, b) => parseFloat(a.number) - parseFloat(b.number) || a._idx - b._idx,
    );
    out.forEach((o) => {
      delete o._idx;
    });
    return out;
  },

  async _fetchRaw(hid) {
    const res = await nativeFetch(`${this.API}/titles/${hid}/chapters`, {
      Accept: "application/json",
    });
    if (!res.ok) return [];
    const json = await res.json();
    const chapters = json.data?.chapters || json.chapters || [];
    return chapters.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      url: this.BASE + c.url,
    }));
  },

  // Главы Comizy, уже отфильтрованные и пронумерованные по Slashlib. Вызывается ДО открытия читалки.
  async getChaptersFor(hid, mangaSlug, slashlibLink) {
    try {
      const raw = await this._fetchRaw(hid);
      if (!raw.length) return [];
      const slashSet = await this.fetchSlashlibNumbers(slashlibLink);
      const list = this.processChapters(raw, slashSet);
      const removed = this.getRemovedSet("comizy:" + mangaSlug);
      return list.filter((c) => !removed.has(String(c.id)));
    } catch (e) {
      console.warn("Comizy getChaptersFor error:", e);
      return [];
    }
  },

  async getChapters(hid, options) {
    try {
      const url = `${this.API}/titles/${hid}/chapters`;
      const res = await nativeFetch(url, { Accept: "application/json" });
      if (!res.ok) return [];
      const json = await res.json();
      const chapters = json.data?.chapters || json.chapters || [];
      const mapped = chapters
        .map((c) => {
          const parsedNum = this._extractChapterNumber(c.name);
          return {
            id: c.id,
            name: c.name,
            slug: c.slug,
            url: this.BASE + c.url,
            number: parsedNum || String(c.number),
          };
        })
        .sort((a, b) => parseFloat(a.number) - parseFloat(b.number));

      return this.filterJunkChapters(mapped, options);
    } catch (e) {
      console.warn("Comizy chapters error:", e);
      return [];
    }
  },

  async getChapterPages(mangaSlug, chapterSlug) {
    try {
      const url = `${this.BASE}/${mangaSlug}/${chapterSlug}`;
      const res = await nativeFetch(url, {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36",
      });
      if (!res.ok) return [];
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const nd = doc.getElementById("__NEXT_DATA__");
      if (!nd) return [];
      const pp = JSON.parse(nd.textContent).props?.pageProps;
      const raw = pp?.initialChapter?.pages || [];
      // Нормализуем: абсолютный URL + размеры (если пришли)
      return raw
        .map((p) => {
          let abs = String(p.url || p.image || p.src || "").trim();
          if (!abs) return null;
          if (!/^https?:\/\//i.test(abs)) {
            try {
              abs = new URL(abs, this.BASE).href;
            } catch (e) {
              return null;
            }
          }
          return {
            url: abs,
            width: p.width || p.w || 0,
            height: p.height || p.h || 0,
          };
        })
        .filter(Boolean);
    } catch (e) {
      console.warn("Comizy pages error:", e);
      return [];
    }
  },

  _norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  },

  _f1Score(t, c) {
    if (!t || !c) return 0;
    if (t === c) return 100;
    const tw = t.split(" ").filter((w) => w.length > 1);
    const cw = c.split(" ").filter((w) => w.length > 1);
    if (!tw.length || !cw.length) return 0;
    const hits = tw.filter((w) => cw.includes(w)).length;
    if (hits === 0) return 0;
    const p = hits / cw.length;
    const r = hits / tw.length;
    return Math.round(((2 * p * r) / (p + r)) * 100);
  },

  _consecutiveBonus(targetNorm, candidateNorm) {
    const tw = targetNorm.split(" ").filter((w) => w.length > 1);
    const cw = candidateNorm.split(" ").filter((w) => w.length > 1);
    if (tw.length < 2 || cw.length < 2) return 0;
    let best = 0;
    for (let start = 0; start < cw.length; start++) {
      let len = 0;
      for (let k = 0; k < tw.length && start + k < cw.length; k++) {
        if (tw[k] === cw[start + k]) len++;
        else break;
      }
      if (len > best) best = len;
    }
    return best >= 2 ? best * 10 : 0;
  },

  _scoreTitle(targetNorm, candidateNorm) {
    const f1 = this._f1Score(targetNorm, candidateNorm);
    if (f1 === 0) return 0;
    return f1 + this._consecutiveBonus(targetNorm, candidateNorm);
  },

  _scoreManga(targetNorm, allNames) {
    let best = 0;
    for (const n of allNames) {
      const s = this._scoreTitle(targetNorm, this._norm(n));
      if (s > best) best = s;
    }
    return best;
  },

  // Ищет по массиву имён (от Slashlib: rus_name + eng_name + otherNames)
  async searchAndMatchByNames(names, targetYear) {
    const cleanNames = (names || [])
      .filter(Boolean)
      .filter((n) => typeof n === "string" && n.length > 1)
      .filter(
        (v, i, a) =>
          a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i,
      );
    if (!cleanNames.length) return null;

    const targetYearStr = targetYear
      ? String(targetYear).match(/\d{4}/)?.[0]
      : "";

    // 1. Поиск в Comizy по первым 6 именам
    const allComizy = new Map();
    const toSearch = cleanNames
      .filter((n) => /[a-zA-Zа-яёА-ЯЁ\u3000-\u9fff\uac00-\ud7af]/.test(n))
      .slice(0, 6);
    for (const q of toSearch) {
      try {
        const res = await this.search(q);
        res.forEach((rr) => allComizy.set(rr.hid, rr));
      } catch (e) {
        console.warn("Comizy search error:", e);
      }
    }
    const cResults = Array.from(allComizy.values());
    if (!cResults.length) return null;

    // 2. EXACT MATCH с проверкой специфичности/года
    const uniqSlashNorms = [
      ...new Set(
        cleanNames.map((n) => this._norm(n)).filter((n) => n.length > 1),
      ),
    ];
    let exactFound = false;

    for (const cr of cResults) {
      const comizyNorms = cr.allNames
        .map((n) => this._norm(n))
        .filter((n) => n.length > 1);
      for (const sn of uniqSlashNorms) {
        if (!comizyNorms.includes(sn)) continue;

        exactFound = true;
        const words = sn.split(" ").filter((w) => w.length > 1);
        const isSpecific = words.length >= 2 || sn.length >= 10;
        const det = await this.getMangaDetails(cr.slug);

        // Специфичное имя (2+ слова или 10+ символов) — доверяем сразу
        if (isSpecific) {
          return {
            ...cr,
            _matchMethod: "exact",
            _matchedBy: sn,
            _details: det,
          };
        }

        // Короткое имя — требуем совпадения года у ОБЕИХ сторон (±2)
        const cy = det?.year || "";
        const hasBothYears = targetYearStr && cy;
        const yearOk =
          hasBothYears && Math.abs(parseInt(targetYearStr) - parseInt(cy)) <= 2;

        if (yearOk) {
          return {
            ...cr,
            _matchMethod: "exact",
            _matchedBy: sn,
            _details: det,
          };
        }
        // иначе отбрасываем и продолжаем (не возвращаем!)
      }
    }

    // ⚠️ Если exact был найден, но отклонён по году — правильной манги нет. F1 не запускаем.
    if (exactFound) return null;

    // 3. F1 FALLBACK (только если exact вообще не нашёлся)
    const scored = cResults.map((cr) => {
      let best = 0;
      for (const tn of uniqSlashNorms) {
        const s = this._scoreManga(tn, cr.allNames);
        if (s > best) best = s;
      }
      return { ...cr, titleScore: best };
    });

    const top5 = scored
      .filter((r) => r.titleScore >= 40)
      .sort((a, b) => b.titleScore - a.titleScore)
      .slice(0, 5);
    if (!top5.length) return null;

    for (const r of top5) {
      const det = await this.getMangaDetails(r.slug);
      if (det && det.year) {
        r.year = det.year;
        r._details = det;
        const ty = parseInt(targetYearStr),
          ry = parseInt(det.year);
        let bonus = 0;
        if (ty && ry) {
          if (ty === ry) bonus = 20;
          else if (Math.abs(ty - ry) <= 1) bonus = 10;
        }
        r.yearBonus = bonus;
        r.finalScore = r.titleScore + bonus;
      } else {
        r.year = det?.year || "";
        r._details = det;
        r.yearBonus = 0;
        r.finalScore = r.titleScore;
      }
    }

    top5.sort((a, b) => b.finalScore - a.finalScore);
    const winner = top5[0];
    // Порог: если слабее 60 — не берём
    if (winner.finalScore < 60) return null;
    return { ...winner, _matchMethod: "f1", _finalScore: winner.finalScore };
  },

  // Обратная совместимость — вызов с двумя названиями
  async searchAndMatch(titleEn, titleRu, targetYear) {
    return this.searchAndMatchByNames(
      [titleEn, titleRu].filter(Boolean),
      targetYear,
    );
  },
};

// ============ COMIZY UI ============
function openComizyModal() {
  const modal = document.getElementById("comizyModal");
  const input = document.getElementById("comizyQuery");
  const results = document.getElementById("comizyResults");
  if (!modal) return;
  input.value = "";
  results.innerHTML =
    '<div class="tmdb-status">Введи название и нажми Enter</div>';
  modal.classList.add("on");
  setTimeout(() => input.focus(), 60);
}

function closeComizyModal() {
  document.getElementById("comizyModal").classList.remove("on");
}

async function runComizySearch() {
  const input = document.getElementById("comizyQuery");
  const results = document.getElementById("comizyResults");
  const q = input.value.trim();
  if (!q) return;
  results.innerHTML = '<div class="tmdb-status">Ищу...</div>';

  const list = await ComizyParser.search(q);
  if (!list.length) {
    results.innerHTML = '<div class="tmdb-status">Ничего не найдено</div>';
    return;
  }

  window._comizyCache = list;
  results.innerHTML = list
    .map(
      (r, i) => `
    <div class="tmdb-result" data-idx="${i}">
      <div class="tmdb-result-poster">
        ${r.cover ? `<img src="${esc(coverProxy(r.cover, 92))}" alt="">` : SVG_ICONS.comic}
      </div>
      <div class="tmdb-result-info">
        <div class="tmdb-result-title">${esc(r.title)}</div>
        <div class="tmdb-result-meta">${r.isAdult ? "🔞 18+" : "Safe"} · ${r.status || ""}</div>
      </div>
    </div>
  `,
    )
    .join("");

  results.querySelectorAll(".tmdb-result").forEach((el) => {
    el.onclick = () => pickComizyResult(+el.dataset.idx);
  });
}

async function pickComizyResult(idx) {
  const list = window._comizyCache || [];
  const r = list[idx];
  if (!r) return;

  const results = document.getElementById("comizyResults");
  results.innerHTML =
    '<div class="tmdb-status">Загружаю данные с Comizy...</div>';

  const details = await ComizyParser.getMangaDetails(r.slug);
  if (!details) {
    results.innerHTML = '<div class="tmdb-status">Ошибка загрузки</div>';
    return;
  }

  const chapters = await ComizyParser.getChapters(details.hid);

  const panel = document.getElementById("panel");
  const setVal = (id, val) => {
    const el = panel.querySelector("#" + id);
    if (el && val !== undefined && val !== null) el.value = val;
  };

  // Заполняем Comizy (базовый слой)
  setVal("f_title", details.title);
  setVal("f_title_en", details.altName || "");
  setVal("f_year", details.year);
  setVal("f_country", details.authors);
  setVal("f_description", details.description);
  setVal("f_cover", details.cover);
  setVal("f_tags", details.tags.join(", "));
  setVal("f_link_comizy", details.url);
  setVal("f_comizy_chapters", JSON.stringify(chapters));

  if (details.cover) setCoverPreview(details.cover);

  const draft = window._currentDraft;
  const blTags = [
    "yaoi",
    "boys love",
    "shounen-ai",
    "yuri",
    "girls love",
    "shoujo-ai",
    "bara",
    "smut",
    "adult",
  ];
  const isBlComizy = details.tags.some((t) =>
    blTags.includes(String(t).toLowerCase().trim()),
  );

  if (draft) {
    draft.type = "comic";
    draft.link_comizy = details.url;
    draft.comizyChapters = chapters;
    draft.comizyLocked = true;
    draft.comizyOff = false;
    draft.bl = isBlComizy;
    if (details.status === "Ongoing") draft.projectStatus = "ongoing";
    else if (details.status === "Completed" || details.status === "Finished")
      draft.projectStatus = "completed";
    else if (details.status === "Announced" || details.status === "Upcoming")
      draft.projectStatus = "announced";
  }

  const segType = panel.querySelector("#f_type");
  if (segType) {
    const comicBtn = segType.querySelector('button[data-v="comic"]');
    if (comicBtn) {
      segType
        .querySelectorAll("button")
        .forEach((b) => b.classList.remove("on"));
      comicBtn.classList.add("on");
    }
  }

  const segBl = panel.querySelector("#f_bl");
  if (segBl && isBlComizy) {
    segBl.querySelector('button[data-v="yes"]')?.classList.add("on");
    segBl.querySelector('button[data-v="no"]')?.classList.remove("on");
  }

  const segProj = panel.querySelector("#f_project_status");
  if (segProj && draft?.projectStatus) {
    segProj.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("on", (b.dataset.v || "") === draft.projectStatus);
    });
  }

  if (window._refreshComizyHint) window._refreshComizyHint();
  closeComizyModal();
  toast("Заполнено с Comizy", "success");

  // ====================================================
  // 2.1: Ищем эту же мангу на Slashlib — приоритет латинице/кириллице, скоринг по всем именам
  // ====================================================
  try {
    const token = await getSlashlibTokenSafe();
    if (!token) {
      toast("Slashlib не подключён — оставляю данные Comizy", "warn");
      return;
    }

    // 1. Пробуем точный запрос по title Comizy
    let slibResults = await slashlibSearchApi(details.title, token);
    let exactHit = null;

    // Если результат 1 и title >= 5 символов — это exact hit (сервер уже отфильтровал)
    if (slibResults.length === 1 && details.title.length >= 5) {
      exactHit = slibResults[0];
    }

    // 2. Если пусто — ищем по altNames
    if (!exactHit && !slibResults.length) {
      const altQueries = [details.altName, ...(details.altNames || [])]
        .filter(Boolean)
        .filter((q) => /[a-zA-Zа-яёА-ЯЁ]/.test(q))
        .filter((q) => q.length > 2)
        .filter(
          (v, i, a) =>
            a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i,
        );
      for (const q of altQueries) {
        slibResults = await slashlibSearchApi(q, token);
        if (slibResults.length) break;
      }
    }

    if (!slibResults.length && !exactHit) {
      toast("На Slashlib не найдено, остаётся Comizy", "warn");
      return;
    }

    // 3. Финальный выбор
    let bestMatch, slibDetails;

    if (exactHit) {
      slibDetails = await fetchSlashlibDetailsApi(exactHit.slug_url, token);
      if (!slibDetails) {
        toast("Slashlib: не удалось загрузить детали", "warn");
        return;
      }
      bestMatch = { ...exactHit, finalScore: 100 };
    } else {
      // F1 скоринг
      const allComizyNames = [
        details.title,
        details.altName,
        ...(details.altNames || []),
      ]
        .filter(Boolean)
        .map((n) => ComizyParser._norm(n))
        .filter((n) => n.length > 1);
      const uniqComizyNames = [...new Set(allComizyNames)];

      const scored = slibResults.map((s) => {
        const slibNames = [s.rus_name, s.name, s.eng_name]
          .filter(Boolean)
          .map((n) => ComizyParser._norm(n));
        let ts = 0;
        for (const cn of uniqComizyNames)
          for (const sn of slibNames) {
            const sc = ComizyParser._scoreTitle(cn, sn);
            if (sc > ts) ts = sc;
          }
        return { ...s, titleScore: ts };
      });

      const top5 = scored
        .filter((r) => r.titleScore >= 40)
        .sort((a, b) => b.titleScore - a.titleScore)
        .slice(0, 5);
      if (!top5.length) {
        toast("Slashlib: слабое совпадение, остаётся Comizy", "warn");
        return;
      }

      const targetYear = String(details.year || "").match(/\d{4}/)?.[0] || "";
      for (const r of top5) {
        try {
          const det = await fetchSlashlibDetailsApi(r.slug_url, token);
          if (det) {
            r._details = det;
            let bonus = 0;
            if (targetYear && det.year) {
              const dy = parseInt(det.year),
                ty = parseInt(targetYear);
              if (dy === ty) bonus = 50;
              else if (Math.abs(dy - ty) <= 1) bonus = 20;
            }
            r.finalScore = r.titleScore + bonus;
          } else {
            r.finalScore = r.titleScore;
          }
        } catch (e) {
          r.finalScore = r.titleScore;
        }
      }
      top5.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
      bestMatch = top5[0];
      slibDetails = bestMatch._details;

      if (bestMatch.finalScore < 60 || !slibDetails) {
        toast("Slashlib: слабый матч, остаётся Comizy", "warn");
        return;
      }
    }

    // 4. Перезаписываем поля Slashlib-данными, Comizy в скрытых полях
    setVal("f_title", slibDetails.title);
    setVal("f_title_en", slibDetails.title_en || details.altName || "");
    setVal("f_year", slibDetails.year || details.year);
    setVal("f_country", slibDetails.country || details.authors);
    setVal("f_description", slibDetails.description || details.description);
    setVal("f_cover", slibDetails.cover || details.cover);
    setVal("f_tags", slibDetails.tags.join(", "));
    setVal("f_link", slibDetails.link);
    setVal("f_pages", slibDetails.pages);

    if (slibDetails.cover) setCoverPreview(slibDetails.cover);

    if (draft) {
      draft.title = slibDetails.title;
      draft.title_en = slibDetails.title_en || details.altName || "";
      draft.year = slibDetails.year || details.year;
      draft.country = slibDetails.country || details.authors;
      draft.description = slibDetails.description || details.description;
      draft.cover = slibDetails.cover || details.cover;
      draft.tags = slibDetails.tags;
      draft.link = slibDetails.link;
      draft.pages = slibDetails.pages;
      draft.otherNames = Array.isArray(slibDetails.otherNames)
        ? slibDetails.otherNames
        : [];
      draft.bl = slibDetails.bl || isBlComizy;
      draft.projectStatus = slibDetails.projectStatus || draft.projectStatus;
      // link_comizy и comizyChapters не трогаем
    }

    if (segBl && draft?.bl) {
      segBl.querySelector('button[data-v="yes"]')?.classList.add("on");
      segBl.querySelector('button[data-v="no"]')?.classList.remove("on");
    }
    if (segProj && draft?.projectStatus) {
      segProj.querySelectorAll("button").forEach((b) => {
        b.classList.toggle("on", (b.dataset.v || "") === draft.projectStatus);
      });
    }

    toast(
      "Slashlib: " +
        (bestMatch.finalScore === 100 ? "exact" : "f1") +
        ", год " +
        (slibDetails.year || "?") +
        " → взято",
      "success",
    );
  } catch (e) {
    console.warn("Slashlib auto-search failed:", e);
    toast("Slashlib: " + e.message + " (оставлены данные Comizy)", "warn");
  }
}

document.getElementById("comizyClose").onclick = closeComizyModal;
document.getElementById("comizyModal").onclick = (e) => {
  if (e.target.id === "comizyModal") closeComizyModal();
};
document.getElementById("comizyQuery").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    e.target.blur();
    runComizySearch();
  }
});
