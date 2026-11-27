'use strict';

/* ==========================================================
   background.js — Работа в фоне
   ----------------------------------------------------------
   Android режет сеть и «замораживает» свёрнутое приложение — отсюда «Failed to fetch».
   Что делаем (модель «как у обычных приложений», без постоянного расхода батареи):
   1. Нативная служба KeepAlive (см. build.yml) стартует сама при сворачивании
      и живёт ~3 минуты — этого хватает, чтобы дослать синхронизацию/хэши/догрузки.
   2. Пока в свёрнутом состоянии есть незавершённые запросы, JS продлевает службу
      (раз в 30 с). Закончились запросы — служба сама гаснет, батарея не тратится.
   3. Сетевые «сбои на границе фона» (сворачивание/разворачивание) для безопасных GET
      повторяются 1–2 раза, вместо красных ошибок.
   4. Каждый упавший fetch пишется в консоль Eruda: [net] с адресом, откуда вызвали и в фоне ли.
   Отключить: bgKeepAlive(false)   Статус: await bgDiag()
   ========================================================== */

const BgKeepAlive = {
  inflight: 0,
  lastVisChange: Date.now(),
  _beat: null,
  _ENABLED_KEY: 'polka_bg_enabled',

  plugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.KeepAlive) || null;
  },
  enabled() {
    try { return localStorage.getItem(this._ENABLED_KEY) !== '0'; } catch (e) { return true; }
  },
  setEnabled(v) {
    try { localStorage.setItem(this._ENABLED_KEY, v ? '1' : '0'); } catch (e) {}
    const p = this.plugin();
    if (p) { try { p.setEnabled({ value: !!v }).catch(() => {}); } catch (e) {} }
    console.info('[bg] работа в фоне:', v ? 'включена' : 'выключена');
  },

  hold(ms) {
    if (!this.enabled()) return;
    const p = this.plugin();
    if (!p) return;
    try { p.hold({ ms: ms || 120000 }).catch(() => {}); } catch (e) {}
  },

  begin() {
    this.inflight++;
    if (document.hidden) this._startBeat();
  },
  end() {
    if (this.inflight > 0) this.inflight--;
  },

  _startBeat() {
    if (this._beat || !this.enabled()) return;
    this.hold(120000);
    this._beat = setInterval(() => {
      if (this.inflight <= 0 || !document.hidden) {
        clearInterval(this._beat);
        this._beat = null;
        return;
      }
      this.hold(120000);
    }, 30000);
  },

  async status() {
    const p = this.plugin();
    let native = null;
    if (p) { try { native = await p.status(); } catch (e) { native = { error: String(e && e.message || e) }; } }
    const rep = {
      enabled: this.enabled(),
      pluginInstalled: !!p,
      hidden: document.hidden,
      inflight: this.inflight,
      native
    };
    console.info('[bg] статус', rep);
    return rep;
  }
};

// Сворачивание: если запросы ещё в полёте — сразу держим службу
document.addEventListener('visibilitychange', () => {
  BgKeepAlive.lastVisChange = Date.now();
  if (document.hidden && BgKeepAlive.inflight > 0) BgKeepAlive._startBeat();
});

/* ---------- fetch: учёт запросов, повтор GET на границе фона, понятный лог ---------- */
(function patchFetch() {
  if (typeof window.fetch !== 'function' || window.fetch.__bgPatched) return;
  const origFetch = window.fetch.bind(window);

  const shortUrl = (u) => {
    try {
      const x = new URL(u, location.href);
      return x.host + x.pathname.slice(0, 60);
    } catch (e) { return String(u).slice(0, 80); }
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const patched = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const safe = method === 'GET' || method === 'HEAD';
    // Откуда вызвали — снимаем сразу, после await стек уже будет другим
    const where = (new Error().stack || '').split('\n').slice(2, 4).map((s) => s.trim()).join(' <- ');

    BgKeepAlive.begin();
    try {
      let attempt = 0;
      for (;;) {
        try {
          return await origFetch(input, init);
        } catch (e) {
          const isNet = e instanceof TypeError; // «Failed to fetch» / «Load failed»
          const nearBg = document.hidden || (Date.now() - BgKeepAlive.lastVisChange) < 10000;
          console.warn('[net] ❌ ' + method + ' ' + shortUrl(url) + ' — ' + (e && e.message)
            + ' | ' + (document.hidden ? 'приложение в фоне' : (nearBg ? 'сразу после смены фон/экран' : 'приложение на экране'))
            + (attempt ? ' | повтор #' + attempt : '') + ' | вызов: ' + where);
          if (!isNet || !safe || !nearBg || attempt >= 2) throw e;
          attempt++;
          await sleep(1200 * attempt);
        }
      }
    } finally {
      BgKeepAlive.end();
    }
  };
  patched.__bgPatched = true;
  window.fetch = patched;
})();

/* ---------- CapacitorHttp (нативные запросы): учёт для продления службы ---------- */
(function patchNativeHttp() {
  const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'request', 'downloadFile', 'uploadFile'];
  const wrap = () => {
    try {
      const P = window.Capacitor && window.Capacitor.Plugins;
      if (!P || !P.CapacitorHttp || P.CapacitorHttp.__bgWrapped) return !!(P && P.CapacitorHttp);
      const orig = P.CapacitorHttp;
      P.CapacitorHttp = new Proxy(orig, {
        get(t, prop) {
          if (prop === '__bgWrapped') return true;
          const v = t[prop];
          if (typeof v === 'function' && METHODS.includes(prop)) {
            return async (...a) => {
              BgKeepAlive.begin();
              try { return await v.apply(t, a); }
              finally { BgKeepAlive.end(); }
            };
          }
          return v;
        }
      });
      return true;
    } catch (e) {
      console.warn('[bg] не удалось обернуть CapacitorHttp:', e);
      return true;
    }
  };
  if (!wrap()) document.addEventListener('DOMContentLoaded', wrap);
})();

window.bgKeepAlive = (v) => BgKeepAlive.setEnabled(v);
window.bgDiag = () => BgKeepAlive.status();
