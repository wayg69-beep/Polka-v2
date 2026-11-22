'use strict';
/* ==========================================================
   dev-menu.js — Dev-меню: долгий тап по «Полка», пункт в сайдбаре,
   вход в Slashlib, срок жизни токена, токен VK, домены (админ).
   ========================================================== */
(function () {
  if (window.DevMenu) return;

  const FLAG = 'polka_dev_menu';
  const D = () => window.PolkaDomains;
  const st = { hist: new Set(), busy: new Set(), notes: {}, acc: null };

  const enabled = () => { try { return localStorage.getItem(FLAG) === '1'; } catch (e) { return false; } };
  const isAdmin = () => { try { return JSON.parse(localStorage.getItem('polka_cloud') || '{}').admin === true; } catch (e) { return false; } };
  const $ = (s) => document.querySelector(s);
  const plural = (n) => {
    let w;
    if (typeof pluralRu === 'function') w = pluralRu(n, 'день', 'дня', 'дней');
    else { const a = n % 10, b = n % 100; w = (a === 1 && b !== 11) ? 'день' : (a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? 'дня' : 'дней'; }
    return n + ' ' + w;
  };

  /* ---------- модалка ---------- */
  function buildModal() {
    if (document.getElementById('devModal')) return;
    const m = document.createElement('div');
    m.className = 'modal dev-modal';
    m.id = 'devModal';
    m.innerHTML =
      '<div class="dev-panel">' +
        '<div class="dev-head">' +
          '<h2>Dev-меню</h2>' +
          '<span class="dev-role" id="devRole"></span>' +
          '<button type="button" class="dev-x" id="devClose" aria-label="Закрыть">✕</button>' +
        '</div>' +
        '<div class="dev-body" id="devBody"></div>' +
      '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m) close(); });
    m.querySelector('#devClose').onclick = close;
    const body = m.querySelector('#devBody');
    body.addEventListener('click', onClick);
    body.addEventListener('change', onChange);
  }

  function open() {
    if (!D()) { toast('PolkaDomains не загружен', 'error'); return; }
    buildModal();
    $('#devRole').textContent = isAdmin() ? 'admin' : 'user';
    render();
    document.getElementById('devModal').classList.add('on');
    loadAccount();
  }
  function close() {
    const m = document.getElementById('devModal');
    if (m) m.classList.remove('on');
  }

  /* ---------- пункт в сайдбаре ---------- */
  function ensureBtn() {
    let b = document.getElementById('btnDev');
    if (b) return b;
    const bottom = document.querySelector('.sidebar-bottom');
    if (!bottom) return null;
    b = document.createElement('button');
    b.className = 'side-action';
    b.id = 'btnDev';
    b.title = 'Dev-меню';
    b.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>' +
      '<span class="side-action-label">Dev</span>';
    const trash = document.getElementById('btnTrash');
    if (trash) bottom.insertBefore(b, trash); else bottom.appendChild(b);
    b.onclick = () => open();
    return b;
  }
  function applyVisibility() {
    const b = ensureBtn();
    if (b) b.style.display = enabled() ? '' : 'none';
  }
  function toggle() {
    const on = !enabled();
    try { localStorage.setItem(FLAG, on ? '1' : '0'); } catch (e) {}
    applyVisibility();
    if (!on) close();
    toast(on ? 'Dev-меню включено' : 'Dev-меню выключено', on ? 'success' : 'warn');
  }

  /* ---------- долгий тап по «Полка» ---------- */
  function bindLongPress() {
    const el = document.querySelector('.brand-text') || document.querySelector('.brand');
    if (!el || el._devBound) return;
    el._devBound = true;
    let t = null, sx = 0, sy = 0, fired = false, lastTouch = 0;
    const cancel = () => { if (t) { clearTimeout(t); t = null; } };
    const start = (x, y) => {
      fired = false; sx = x; sy = y; cancel();
      t = setTimeout(() => {
        t = null; fired = true;
        try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}
        toggle();
      }, 700);
    };
    el.addEventListener('touchstart', (e) => {
      lastTouch = Date.now();
      if (e.touches.length !== 1) { cancel(); return; }
      start(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) { cancel(); return; }
      if (Math.abs(e.touches[0].clientX - sx) > 10 || Math.abs(e.touches[0].clientY - sy) > 10) cancel();
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      lastTouch = Date.now(); cancel();
      if (fired && e.cancelable) e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('mousedown', (e) => { if (e.button !== 0 || Date.now() - lastTouch < 700) return; start(e.clientX, e.clientY); });
    el.addEventListener('mouseup', () => { if (Date.now() - lastTouch < 700) return; cancel(); });
    el.addEventListener('mouseleave', () => { if (Date.now() - lastTouch < 700) return; cancel(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ---------- строки доменов ---------- */
  function badgeHTML(key, r) {
    if (st.busy.has(key)) return '<span class="dev-badge busy" data-badge="' + key + '">…</span>';
    if (!r) return '<span class="dev-badge idle" data-badge="' + key + '">—</span>';
    const c = Number(r.code) || 0;
    const cls = (c >= 200 && c < 300) ? 'ok' : (c >= 300 && c < 400) ? 'redir' : (c >= 400 && c < 500) ? 'warn' : (c >= 500) ? 'bad' : 'dead';
    return '<span class="dev-badge ' + cls + '" data-badge="' + key + '">' + esc(String(c) + ' · ' + (r.ms || 0) + 'ms') + '</span>';
  }
  function histHTML(key) {
    const rows = D().rows(key);
    if (!rows.length) return '<div class="dev-hist"><div class="dev-hint">Пусто</div></div>';
    return '<div class="dev-hist">' + rows.map((r, i) =>
      '<div class="dev-hist-row' + (i === 0 ? ' cur' : '') + '">' +
        '<span class="dev-n">#' + r.n + '</span>' +
        '<span class="dev-h">' + esc(r.h) + '</span>' +
        '<button type="button" class="dev-mini" data-act="promote" data-key="' + key + '" data-n="' + r.n + '" title="Сделать текущим">↑</button>' +
        '<button type="button" class="dev-mini" data-act="del" data-key="' + key + '" data-n="' + r.n + '" title="Удалить">✕</button>' +
      '</div>').join('') + '</div>';
  }
  function rowHTML(f) {
    const cur = D().current(f.key);
    const last = D().LAST[f.key];
    const notes = [];
    if (last && last.note) notes.push(last.note);
    if (st.notes[f.key]) notes.push(st.notes[f.key]);
    if (f.hint) notes.push(f.hint);
    return '<div class="dev-row" data-row="' + f.key + '">' +
      '<div class="dev-row-top"><span class="dev-row-label">' + esc(f.label) + '</span>' + badgeHTML(f.key, last) + '</div>' +
      '<input class="dev-input' + (f.manual ? '' : ' ro') + '" data-key="' + f.key + '" value="' + esc(cur) + '"' + (f.manual ? '' : ' readonly') + ' spellcheck="false" autocomplete="off">' +
      '<div class="dev-btnrow">' +
        '<button type="button" class="dev-btn" data-act="check" data-key="' + f.key + '">Проверить</button>' +
        (f.auto ? '<button type="button" class="dev-btn" data-act="refresh" data-key="' + f.key + '">Обновить</button>' : '') +
        '<button type="button" class="dev-btn ghost" data-act="hist" data-key="' + f.key + '">История</button>' +
      '</div>' +
      (notes.length ? '<div class="dev-note">' + esc(notes.join(' · ')) + '</div>' : '') +
      (st.hist.has(f.key) ? histHTML(f.key) : '') +
    '</div>';
  }
  function updateRow(key) {
    const el = document.querySelector('[data-row="' + key + '"]');
    if (el) el.outerHTML = rowHTML(D().BY_KEY[key]);
  }
  function paintBadge(key) {
    const el = document.querySelector('[data-badge="' + key + '"]');
    if (el) el.outerHTML = badgeHTML(key, D().LAST[key]);
  }

  /* ---------- разделы ---------- */
  function slashSection() {
    return '<div class="dev-sec"><div class="dev-sec-head">Slashlib</div><div class="dev-card">' +
      '<div class="dev-line" id="devSlUser">Проверяю токен…</div>' +
      '<div class="dev-line big" id="devSlTtl"></div>' +
      '<div class="dev-btnrow">' +
        '<button type="button" class="dev-btn primary" data-act="slLogin">Войти в Slashlib</button>' +
        '<button type="button" class="dev-btn" data-act="slCheck">Обновить статус</button>' +
        '<button type="button" class="dev-btn danger" data-act="slLogout">Сбросить токен</button>' +
      '</div><div class="dev-note" id="devSlMsg"></div></div></div>';
  }
  function vkSection() {
    const t = localStorage.getItem('vk_token') || '';
    return '<div class="dev-sec"><div class="dev-sec-head">Токен VK</div><div class="dev-card">' +
      '<div class="dev-warn">Токен вечный. Изменение этого поля может сломать музыку — меняй, только если точно уверена.</div>' +
      '<input type="password" class="dev-input" id="devVkInput" value="' + esc(t) + '" placeholder="vk1.a.…" spellcheck="false" autocomplete="off">' +
      '<div class="dev-btnrow">' +
        '<button type="button" class="dev-btn primary" data-act="vkSave">Сохранить</button>' +
        '<button type="button" class="dev-btn" data-act="vkShow">Показать</button>' +
        '<button type="button" class="dev-btn" data-act="vkTest">Проверить</button>' +
        '<button type="button" class="dev-btn danger" data-act="vkDel">Удалить</button>' +
      '</div><div class="dev-note" id="devVkMsg">' + (t ? 'Токен есть, ' + t.length + ' символов' : 'Токена нет') + '</div></div></div>';
  }
  function domainsSections() {
    const d = D();
    let html = '<div class="dev-sec"><div class="dev-sec-head">Домены</div><div class="dev-card">' +
      '<div class="dev-btnrow">' +
        '<button type="button" class="dev-btn primary" data-act="checkAll">Проверить все</button>' +
        '<button type="button" class="dev-btn" data-act="refreshAll">Обновить авто</button>' +
        '<button type="button" class="dev-btn ghost" data-act="export">Экспорт</button>' +
        '<button type="button" class="dev-btn ghost" data-act="import">Импорт</button>' +
      '</div><input type="file" id="devImportFile" accept="application/json,.json" style="display:none">' +
      '<div class="dev-note">Кольцо на 10 строк у каждого поля. Полка пробует с самого свежего номера вниз.</div></div></div>';
    d.GROUPS.forEach(g => {
      html += '<div class="dev-sec"><div class="dev-sec-head">' + esc(g) + '</div>';
      d.FIELDS.filter(f => f.group === g).forEach(f => { html += rowHTML(f); });
      html += '</div>';
    });
    return html;
  }
  function render() {
    const body = document.getElementById('devBody');
    if (!body) return;
    body.innerHTML = slashSection() + vkSection() + (isAdmin() ? domainsSections() : '');
    paintAccount();
  }

  /* ---------- аккаунт Slashlib ---------- */
  function paintAccount() {
    const u = document.getElementById('devSlUser');
    const t = document.getElementById('devSlTtl');
    if (!u || !t) return;
    const a = st.acc;
    if (!a) { u.textContent = 'Проверяю токен…'; t.textContent = ''; return; }
    if (!a.hasToken) { u.textContent = 'Входа нет'; t.textContent = 'Токена нет — войди в аккаунт'; return; }
    u.textContent = a.username ? ('Вошла как ' + a.username) : (a.guest ? 'Гостевой токен — войди в аккаунт' : 'Токен есть, аккаунт не определён');
    if (a.daysLeft === null || a.daysLeft === undefined) t.textContent = 'Срок жизни неизвестен (токен не JWT)';
    else if (a.daysLeft < 0) t.textContent = 'Токен протух ' + plural(-a.daysLeft) + ' назад';
    else if (a.daysLeft === 0) t.textContent = 'Токен протухает сегодня';
    else t.textContent = 'До конца жизни токена осталось: ' + plural(a.daysLeft);
  }
  async function loadAccount() {
    const u = document.getElementById('devSlUser');
    if (!u) return;
    u.textContent = 'Проверяю токен…';
    try { st.acc = await D().slashlibAccount(); }
    catch (e) { st.acc = { hasToken: !!localStorage.getItem('slashlib_token'), daysLeft: null }; }
    paintAccount();
  }

  /* ---------- действия ---------- */
  async function doCheck(key) {
    if (st.busy.has(key)) return;
    st.busy.add(key); paintBadge(key);
    try { await D().check(key); }
    catch (e) { D().LAST[key] = { code: 0, ms: 0, note: String((e && e.message) || e) }; }
    st.busy.delete(key); updateRow(key);
  }
  async function doRefresh(key) {
    if (st.busy.has(key)) return;
    st.busy.add(key); paintBadge(key);
    let r = null;
    try { r = await D().refresh(key); } catch (e) { r = { ok: false, note: String((e && e.message) || e) }; }
    st.busy.delete(key);
    const added = (r && r.added) || [];
    st.notes[key] = r && r.ok
      ? ('Найдено ' + added.length + (added.length ? ': ' + added.slice(0, 3).join(', ') : ''))
      : ('Не удалось: ' + ((r && r.note) || 'ничего не найдено'));
    updateRow(key);
    toast(r && r.ok ? 'Обновлено: ' + key : 'Не удалось: ' + key, r && r.ok ? 'success' : 'warn');
  }
  async function doCheckAll() {
    const keys = D().FIELDS.map(f => f.key);
    let i = 0;
    const worker = async () => {
      while (i < keys.length) {
        const k = keys[i++];
        st.busy.add(k); paintBadge(k);
        try { await D().check(k); } catch (e) {}
        st.busy.delete(k); updateRow(k);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    toast('Проверка завершена', 'success');
  }
  async function doRefreshAll() {
    const list = D().FIELDS.filter(f => f.auto);
    for (const f of list) { await doRefresh(f.key); }
    toast('Авто-обновление завершено', 'success');
  }
  function doExport() {
    try {
      const blob = new Blob([D().exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'polka-domains.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast('База доменов выгружена', 'success');
    } catch (e) { toast('Ошибка экспорта: ' + e.message, 'error'); }
  }
  async function doSlLogin() {
    const msg = document.getElementById('devSlMsg');
    if (typeof getSlashlibToken !== 'function') { if (msg) msg.textContent = 'getSlashlibToken недоступен'; return; }
    if (msg) msg.textContent = 'Открываю Slashlib…';
    try {
      const t = await getSlashlibToken(true, (m) => { if (msg) msg.textContent = m || ''; });
      if (msg) msg.textContent = t ? 'Вход выполнен' : 'Токен не найден';
      st.acc = null;
      await loadAccount();
    } catch (e) { if (msg) msg.textContent = 'Ошибка: ' + ((e && e.message) || e); }
  }
  function vkMsg(text) { const el = document.getElementById('devVkMsg'); if (el) el.textContent = text; }
  function doVkSave() {
    const i = document.getElementById('devVkInput');
    if (!i) return;
    const v = i.value.trim();
    if (!v) { vkMsg('Пусто — не сохранено'); return; }
    try { localStorage.setItem('vk_token', v); } catch (e) {}
    try {
      if (typeof Cloud !== 'undefined' && Cloud.isReady() && typeof saveTokensToCloud === 'function') saveTokensToCloud({ vk_token: v });
    } catch (e) {}
    vkMsg('Сохранено, ' + v.length + ' символов');
    toast('Токен VK сохранён', 'success');
  }
  async function doVkTest() {
    vkMsg('Проверяю…');
    try {
      const r = await D().check('vk.api');
      vkMsg('Код ' + r.code + ' · ' + r.ms + 'ms' + (r.note ? ' · ' + r.note : ''));
    } catch (e) { vkMsg('Ошибка: ' + ((e && e.message) || e)); }
  }

  async function onClick(e) {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const act = b.dataset.act, key = b.dataset.key;
    if (act === 'check') return doCheck(key);
    if (act === 'refresh') return doRefresh(key);
    if (act === 'hist') { st.hist.has(key) ? st.hist.delete(key) : st.hist.add(key); updateRow(key); return; }
    if (act === 'promote') {
      const r = D().rows(key).find(x => x.n === Number(b.dataset.n));
      if (r) { const n = D().add(key, r.h); updateRow(key); toast('Поднят наверх: ' + r.h + ' (#' + n + ')', 'success'); }
      return;
    }
    if (act === 'del') { D().remove(key, Number(b.dataset.n)); updateRow(key); return; }
    if (act === 'checkAll') return doCheckAll();
    if (act === 'refreshAll') return doRefreshAll();
    if (act === 'export') return doExport();
    if (act === 'import') { const f = document.getElementById('devImportFile'); if (f) f.click(); return; }
    if (act === 'slLogin') return doSlLogin();
    if (act === 'slCheck') { st.acc = null; return loadAccount(); }
    if (act === 'slLogout') {
      try { localStorage.removeItem('slashlib_token'); localStorage.removeItem('slashlib_token_valid'); } catch (err) {}
      st.acc = null; paintAccount(); toast('Токен Slashlib сброшен', 'warn'); return;
    }
    if (act === 'vkShow') {
      const i = document.getElementById('devVkInput');
      if (!i) return;
      i.type = i.type === 'password' ? 'text' : 'password';
      b.textContent = i.type === 'password' ? 'Показать' : 'Скрыть';
      return;
    }
    if (act === 'vkSave') return doVkSave();
    if (act === 'vkTest') return doVkTest();
    if (act === 'vkDel') {
      try { localStorage.removeItem('vk_token'); } catch (err) {}
      const i = document.getElementById('devVkInput'); if (i) i.value = '';
      vkMsg('Токен удалён'); toast('Токен VK удалён', 'warn'); return;
    }
  }

  async function onChange(e) {
    const t = e.target;
    if (t.id === 'devImportFile') {
      const f = t.files && t.files[0];
      if (!f) return;
      try { D().importJSON(await f.text()); render(); toast('База доменов импортирована', 'success'); }
      catch (err) { toast('Ошибка импорта: ' + err.message, 'error'); }
      t.value = '';
      return;
    }
    if (t.classList && t.classList.contains('dev-input') && t.dataset && t.dataset.key) {
      const key = t.dataset.key, v = t.value.trim();
      if (!v) { updateRow(key); return; }
      const n = D().add(key, v);
      st.notes[key] = 'Записан как #' + n;
      updateRow(key);
      toast('Сохранено: ' + v, 'success');
    }
  }

  /* ---------- старт ---------- */
  buildModal();
  applyVisibility();
  bindLongPress();
  document.addEventListener('DOMContentLoaded', () => { applyVisibility(); bindLongPress(); });

  window.DevMenu = { open, close, toggle, render, isAdmin, enabled };
  console.log('[dev-menu] готов, включён:', enabled(), '| админ:', isAdmin());
})();