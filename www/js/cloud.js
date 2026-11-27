'use strict';

/* ==========================================================
   cloud.js — Облако (Supabase): Cloud, CloudUI, CloudBanner, DiscHashesCloud, шифрование, профиль
   ========================================================== */

  document.getElementById('cloudModal').onclick = (e) => {
  if(e.target.id === 'cloudModal') e.target.classList.remove('on');
};
/* ============ ОБЛАКО / АВТОРИЗАЦИЯ ============ */

  const SUPABASE_URL = 'https://wamdhzgsintfrawacaft.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhbWRoemdzaW50ZnJhd2FjYWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MDI0MTksImV4cCI6MjEwNzM3ODQxOX0.q1QER9sT67mhD2HWSMvse1YjzE1yXB08FbtTJx1SR7o';
let sb = null;
try {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch(e) {
  console.error('Ошибка инициализации Supabase:', e);
}
    // Пароль админа больше не лежит в коде открытым текстом — только его «отпечаток».
// Чтобы сменить пароль: открой консоль (Eruda) и выполни  await makeAdminVerifier('новый пароль')
// — получишь salt и hash, вставь их в две константы ниже.
const ADMIN_SALT = '1b66539c87f837d3020dd9ff';
const ADMIN_HASH = '3c103d06ab6cc47737471718e996cd4f22abcf3eae9fd038fd0fae5971e8944c';
async function adminDerive(pass, salt){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 200000, hash: 'SHA-256' }, key, 256);
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function isAdminPassword(pass){
  try{ return (await adminDerive(pass, ADMIN_SALT)) === ADMIN_HASH; }
  catch(e){ return false; }
}
window.makeAdminVerifier = async function(pass){
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join('');
  return { salt: salt, hash: await adminDerive(pass, salt) };
};

/* ===== ШИФРОВАНИЕ ДЛЯ МАСТЕР-ВОССТАНОВЛЕНИЯ ===== */
async function _recoveryKey(){
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(ADMIN_HASH), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('polka_recovery_v1'), iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function _toB64(buf){
  const bytes = new Uint8Array(buf);
  let s = '';
  for(let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function _fromB64(s){
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function encryptForAdmin(plaintext){
  try {
    const key = await _recoveryKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(String(plaintext || ''))
    );
    return _toB64(iv) + '.' + _toB64(ct);
  } catch(e){
    console.error('encryptForAdmin:', e);
    return '';
  }
}

async function decryptForAdmin(blob){
  try {
    const parts = String(blob || '').split('.');
    if(parts.length !== 2) return '';
    const key = await _recoveryKey();
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: _fromB64(parts[0]) },
      key,
      _fromB64(parts[1])
    );
    return new TextDecoder().decode(pt);
  } catch(e){
    console.error('decryptForAdmin:', e);
    return '';
  }
}
  
// Аватар принимаем только как обычную картинку-data URL — иначе пустая строка
function safeAvatar(a){
  return (typeof a === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(a)) ? a : '';
}
// Ссылки открываем только http/https (без javascript: и прочего)
// Ссылки открываем только http/https/magnet (без javascript: и прочего)
function safeLink(h){
  h = String(h || '').trim();
  if(!h) return '';
  if(/^https?:\/\//i.test(h)) return h;
  if(/^magnet:/i.test(h)) return h; // <--- ДОБАВЛЕНО: разрешаем магнит-ссылки
  if(/^[a-z][a-z0-9+.\-]*:/i.test(h)) return ''; // Всё остальное (javascript:, data: и т.д.) блокируем
  return 'https://' + h;
}
  const CLOUD_KEY = 'polka_cloud';

function cloudGet(){ 
  try{ 
    const raw = localStorage.getItem(CLOUD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e){ return null; } 
}
function cloudSet(data){ 
  try{ localStorage.setItem(CLOUD_KEY, JSON.stringify(data)); } catch(e){}
}
function cloudClear(){ 
  try{ localStorage.removeItem(CLOUD_KEY); } catch(e){}
}

async function sha256(text){
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b => b.toString(16).padStart(2,'0')).join('');
}
// Превращает любую ошибку облака в понятный текст (чтобы не было просто «Ошибка сохранения»)
function describeCloudError(e){
  const m = String((e && (e.message || e.error_description || e.msg)) || e || 'неизвестная ошибка');
  if(/Нет сессии/i.test(m) || /JWT|token.*expired|session.*(missing|expired)/i.test(m))
    return 'сессия облака истекла — выйди и войди заново (' + m + ')';
  if(/bucket/i.test(m) && /not.?found/i.test(m))
    return 'в Supabase Storage нет бакета «backups» (' + m + ')';
  if(/row-level security|violates|not authorized|unauthorized|permission denied|forbidden|\b403\b/i.test(m))
    return 'Supabase не пускает: проверь политики (RLS) для Storage/таблиц (' + m + ')';
  if(/Failed to fetch|NetworkError|Load failed|network/i.test(m))
    return 'нет связи с облаком (' + m + ')';
  return m;
}

  const DiscHashesCloud = {
  _pushTimer: null,
  _busy: false,
  _pushing: false,
  _again: false,
  _DIRTY_KEY: 'polka_disc_dirty',

  // «Грязный» флаг переживает перезапуск приложения: если отправка не дошла
  // (нет сети / приложение закрыли раньше таймера) — повторим при следующем запуске
  _setDirty(v) {
    try {
      if (v) localStorage.setItem(this._DIRTY_KEY, '1');
      else localStorage.removeItem(this._DIRTY_KEY);
    } catch(e) {}
  },
  _isDirty() {
    try { return localStorage.getItem(this._DIRTY_KEY) === '1'; } catch(e) { return false; }
  },

  _localSet() {
    try {
      const raw = localStorage.getItem('polka_reader_disc_hashes');
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr.filter(h => typeof h === 'string' && h));
    } catch(e) { return new Set(); }
  },

  _saveLocal(set) {
    try {
      const arr = Array.from(set).slice(-300);
      localStorage.setItem('polka_reader_disc_hashes', JSON.stringify(arr));
    } catch(e) {}
  },

  // ───────── Видимость: всё пишем в консоль (Eruda) с префиксом [disc_hashes] ─────────
  // ✅ info — успех, ⚠ warn — не критично/нет входа, ❌ error — реальный сбой.
  // Состояние последней операции: DiscHashesCloud.last, полный отчёт: await discDiag()
  last: { pull: null, push: null },
  _lastToastAt: 0,

  _say(level, ...args) {
    try { console[level]('[disc_hashes]', ...args); } catch(e) {}
  },
  _fail(where, e) {
    const msg = String((e && (e.message || e.code || e.details)) || e || 'неизвестная ошибка');
    this._say('error', '❌ ' + where + ' не удалось:', msg, e && e.hint ? ('| hint: ' + e.hint) : '', e && e.code ? ('| code: ' + e.code) : '');
    // Тост — не чаще раза в минуту, чтобы не спамить при плохой сети
    if (Date.now() - this._lastToastAt > 60000 && typeof toast === 'function') {
      this._lastToastAt = Date.now();
      toast('Хэши дисклеймеров не ушли в облако: ' + msg.slice(0, 90), 'error');
    }
    return msg;
  },

  // Хэши, удалённые пользователем (отмена пометки): чтобы слияние с облаком их не воскресило
  _REMOVED_KEY: 'polka_disc_removed',
  _removedSet() {
    try {
      const arr = JSON.parse(localStorage.getItem(this._REMOVED_KEY) || '[]');
      return new Set(Array.isArray(arr) ? arr.filter(h => typeof h === 'string' && h) : []);
    } catch(e) { return new Set(); }
  },
  noteRemoved(hash) {
    if (!hash) return;
    try {
      const r = this._removedSet(); r.add(hash);
      localStorage.setItem(this._REMOVED_KEY, JSON.stringify(Array.from(r).slice(-300)));
    } catch(e) {}
  },
  _clearRemoved() { try { localStorage.removeItem(this._REMOVED_KEY); } catch(e) {} },

  async _fetchCloud(uid) {
    const { data, error } = await sb
      .from('profiles')
      .select('disc_hashes')
      .eq('id', uid)
      .maybeSingle();
    if (error) throw error;
    return {
      exists: !!data,
      arr: (data && Array.isArray(data.disc_hashes)) ? data.disc_hashes.filter(h => typeof h === 'string' && h) : []
    };
  },

  async pullAndMerge() {
    if (this._busy) return;
    this._busy = true;
    let needPush = false;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        this.last.pull = { at: Date.now(), ok: false, error: 'нет сессии облака' };
        this._say('warn', '⚠ нет входа в облако — хэши только на этом устройстве (локально: ' + this._localSet().size + (this._isDirty() ? ', ЕСТЬ неотправленные' : '') + ')');
        return;
      }

      const cloud = await this._fetchCloud(session.user.id);
      const removed = this._removedSet();
      const cloudSet = new Set(cloud.arr);
      const localSet = this._localSet();
      const before = localSet.size;

      cloudSet.forEach(h => { if (!removed.has(h)) localSet.add(h); });
      removed.forEach(h => localSet.delete(h));

      if (localSet.size !== before) this._saveLocal(localSet);

      needPush = this._isDirty()
        || removed.size > 0
        || Array.from(localSet).some(h => !cloudSet.has(h));

      this.last.pull = { at: Date.now(), ok: true, cloud: cloudSet.size, local: localSet.size, rowExists: cloud.exists };
      this._say('info', '✅ pull: в облаке ' + cloudSet.size + ', локально ' + localSet.size
        + (cloud.exists ? '' : ' (строки профиля в облаке НЕТ)')
        + (needPush ? ' → нужно отправить' : ' → синхронно'));
    } catch(e) {
      this.last.pull = { at: Date.now(), ok: false, error: String(e && e.message || e) };
      this._fail('pull', e);
    } finally {
      this._busy = false;
    }
    if (needPush) this._pushNow();
  },

  pushDebounced() {
    this._setDirty(true);
    this._say('info', '⏳ изменение хэшей, отправка через 1.5 с (локально: ' + this._localSet().size + ')');
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => {
      this._pushTimer = null;
      this._pushNow();
    }, 1500);
  },

  async _pushNow() {
    // Одна отправка за раз; если за это время хэши менялись — отправим ещё раз
    if (this._pushing) { this._again = true; return; }
    this._pushing = true;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        // флаг dirty остаётся — отправим после входа
        this.last.push = { at: Date.now(), ok: false, error: 'нет сессии облака' };
        this._say('warn', '⚠ push отложен: нет входа в облако (хэши ждут в очереди, локально ' + this._localSet().size + ')');
        return;
      }
      const uid = session.user.id;

      // 1. Сначала читаем облако и ОБЪЕДИНЯЕМ: раньше push заменял массив в базе локальным
      //    и, если pull не успел отработать (нет сети при старте), затирал хэши с других устройств.
      const cloud = await this._fetchCloud(uid);
      const removed = this._removedSet();
      const merged = new Set(cloud.arr);
      this._localSet().forEach(h => merged.add(h));
      removed.forEach(h => merged.delete(h));
      const arr = Array.from(merged).slice(-300);

      // 2. Запись
      const { data, error } = await sb
        .from('profiles')
        .update({ disc_hashes: arr })
        .eq('id', uid)
        .select('id');
      if (error) throw error;

      let how = 'update';
      if (!data || !data.length) {
        // Строки профиля нет (или RLS не дал обновить) — создаём
        const c = (typeof cloudGet === 'function' ? cloudGet() : null) || {};
        const ins = await sb.from('profiles').insert([{
          id: uid,
          display_name: c.display_name || 'User',
          disc_hashes: arr
        }]);
        if (ins.error) {
          if (ins.error.code === '23505')
            throw new Error('строка профиля есть, но UPDATE для неё запрещён (проверь RLS-политику UPDATE на profiles): ' + ins.error.message);
          throw ins.error;
        }
        how = 'insert';
      }

      // 3. Проверка чтением: база могла «принять» запрос, но ничего не сохранить (RLS / триггер)
      const back = await this._fetchCloud(uid);
      const backSet = new Set(back.arr);
      const missing = arr.filter(h => !backSet.has(h));
      if (missing.length) {
        throw new Error('база приняла запрос, но не сохранила ' + missing.length + ' из ' + arr.length + ' хэшей (проверь RLS-политику UPDATE для profiles)');
      }

      this._saveLocal(new Set(arr));
      this._clearRemoved();
      this._setDirty(false);
      this.last.push = { at: Date.now(), ok: true, count: arr.length, how, verified: true };
      this._say('info', '✅ push (' + how + '): в базе ' + arr.length + ' хэшей, проверено чтением');
    } catch(e) {
      // Флаг dirty остаётся → повтор при следующем запуске / изменении
      this.last.push = { at: Date.now(), ok: false, error: String(e && (e.message || e.code) || e) };
      this._fail('push', e);
    } finally {
      this._pushing = false;
      if (this._again) {
        this._again = false;
        this._pushNow();
      }
    }
  },

  // Полный отчёт: await discDiag()  — в консоли Eruda
  async diagnose() {
    const rep = { local: this._localSet().size, dirty: this._isDirty(), removedPending: this._removedSet().size,
      timerPending: !!this._pushTimer, session: false, cloudRow: null, cloud: null,
      onlyLocal: 0, onlyCloud: 0, last: this.last };
    try {
      const { data: { session } } = await sb.auth.getSession();
      rep.session = !!session;
      if (session) {
        const cloud = await this._fetchCloud(session.user.id);
        const cs = new Set(cloud.arr), ls = this._localSet();
        rep.cloudRow = cloud.exists; rep.cloud = cs.size;
        rep.onlyLocal = Array.from(ls).filter(h => !cs.has(h)).length;
        rep.onlyCloud = Array.from(cs).filter(h => !ls.has(h)).length;
      }
    } catch(e) { rep.error = String(e && (e.message || e.code) || e); }
    const verdict = !rep.session ? '⚠ нет входа в облако'
      : rep.error ? '❌ ошибка чтения облака'
      : rep.cloudRow === false ? '❌ строки профиля в облаке нет'
      : rep.onlyLocal ? '❌ ' + rep.onlyLocal + ' хэш(ей) есть только на устройстве (не в облаке)'
      : '✅ всё в облаке';
    this._say(rep.session && !rep.error && rep.onlyLocal === 0 && rep.cloudRow !== false ? 'info' : 'error', 'ДИАГНОСТИКА: ' + verdict, rep);
    return rep;
  }
};
window.discDiag = () => DiscHashesCloud.diagnose();

// Приложение уходит в фон — отправляем сразу, не дожидаясь таймера
// (иначе хэш, отмеченный перед сворачиванием, мог не успеть уйти в базу)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  if (DiscHashesCloud._pushTimer) {
    clearTimeout(DiscHashesCloud._pushTimer);
    DiscHashesCloud._pushTimer = null;
    DiscHashesCloud._pushNow();
  }
});

  
// Записывает профиль (имя/аватарку) в таблицу profiles. upsert — чтобы строка создалась, если её нет.
// Результат проверяется: раньше запись шла «вслепую», и если база её отклоняла, аватарка жила только на телефоне.
async function saveProfile(patch, silent){
  const c = cloudGet();
  if(!c || !c.user_id) return false;
  try{
    const row = Object.assign({ id: c.user_id, display_name: c.display_name || '' }, patch || {});
    // Страховка: имя вида "<64 hex>@polka.app" — это наш технический email, а не имя.
    // Никогда не пишем такое в профиль, иначе оно всплывёт в модалке логина.
    if(typeof row.display_name === 'string'){
      const t = row.display_name.trim();
      if(/^[a-f0-9]{64}@polka\.app$/i.test(t)) row.display_name = '';
    }
    const { error } = await sb.from('profiles').upsert(row);
    if(error) throw error;
    return true;
  }catch(e){
    console.error('profiles upsert failed:', e);
    if(!silent) toast('Профиль не сохранился в облаке: ' + describeCloudError(e));
    return false;
  }
}

async function saveTokensToCloud(patch) {
  const c = cloudGet();
  if (!c || !c.user_id) return false;
  
  // АВТОМАТИЧЕСКИ берём display_name из cloudGet(), если его нет в patch
  const row = Object.assign(
    { 
      id: c.user_id,
      display_name: c.display_name || ''  // <-- БЕРЁМ ИЗ cloudGet()
    }, 
    patch
  );
  
  // Если display_name всё ещё пустой (в cloudGet() его нет) — берём из сессии
  if (!row.display_name) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session && session.user) {
        row.display_name = session.user.user_metadata?.display_name || 
                          session.user.email || 
                          '';
      }
    } catch (e) {
      console.warn('[tokens] failed to get session:', e);
    }
  }
  
  try {
    const { error } = await sb.from('profiles').upsert(row);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[tokens] save failed:', e);
    return false;
  }
}

async function loadTokensFromCloud() {
  const c = cloudGet();
  if (!c || !c.user_id) return null;
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('vk_token, slashlib_token, slashlib_token_valid')
      .eq('id', c.user_id)
      .single();
    if (error || !data) return null;

    if (data.vk_token) {
      localStorage.setItem('vk_token', data.vk_token);
    }
    if (data.slashlib_token) {
      localStorage.setItem('slashlib_token', data.slashlib_token);
    }
    if (data.slashlib_token_valid) {
      localStorage.setItem('slashlib_token_valid', data.slashlib_token_valid);
    } else {
      localStorage.setItem('slashlib_token_valid', '1');
    }
    return data;
  } catch (e) {
    console.warn('[tokens] load failed:', e);
    return null;
  }
}
  
/*MERGE_START*/
function normalizeItem(it){
  if(!it) return it;
  const legacy = { anime:'series', video:'movie', game:'movie', other:'book' };
  if(legacy[it.type]) it.type = legacy[it.type];
  ['description','country','pages','link','link_sub','link_extras','title_en'].forEach(k => {
    if(typeof it[k] !== 'string') it[k] = '';
  });
  if(typeof it.bl !== 'boolean') it.bl = false;
  if(!Array.isArray(it.tags)) it.tags = [];
  if(typeof it.hearts !== 'number') it.hearts = 0;
  if(typeof it.favorite !== 'boolean') it.favorite = false;
  it.moments = normMoments(it.moments);
  return it;
}
// «Отпечаток» набора данных — чтобы быстро понять, отличаются ли две версии
function dataSig(its, trash){
  const a = (its || []).map(i => i.id + ':' + (i.updatedAt || 0)).sort().join('|');
  const b = (trash || []).map(t => t.id + ':' + (t.deletedAt || 0) + (t.purged ? 'x' : '')).sort().join('|');
  return a + '#' + b;
}
// Слияние локальных данных и облачных ПО КАЖДОЙ карточке:
//  — побеждает версия с более поздним updatedAt;
//  — удаление побеждает, если оно было позже последней правки (карточка уходит в корзину);
//  — preferLocal (после «Заменить всё»): локальный список главный, чужое уходит в корзину.
function mergeData(local, cloud, preferLocal, now){
  const ttl = TRASH_DAYS * 24 * 60 * 60 * 1000;
  const mapOf = arr => {
    const m = new Map();
    (arr || []).forEach(x => { if(x && x.id) m.set(x.id, x); });
    return m;
  };
  const L = mapOf(local.items), C = mapOf(cloud.items);
  const LT = mapOf(local.trash), CT = mapOf(cloud.trash);
  const ids = new Set([...L.keys(), ...C.keys(), ...LT.keys(), ...CT.keys()]);
  const outItems = [], outTrash = [];
  ids.forEach(id => {
    const li = L.get(id), ci = C.get(id), lt = LT.get(id), ct = CT.get(id);
    let dead = null;
    if(lt && ct) dead = (ct.deletedAt || 0) > (lt.deletedAt || 0) ? ct : lt;
    else dead = lt || ct || null;

    if(preferLocal){
      if(li) outItems.push(li);
      else if(ci) outTrash.push(Object.assign({}, ci, { deletedAt: now }));
      else if(dead) outTrash.push(dead);
      return;
    }

    let alive = null;
    if(li && ci) alive = (ci.updatedAt || 0) > (li.updatedAt || 0) ? ci : li;
    else alive = li || ci || null;

    if(alive && dead){
      if((alive.updatedAt || 0) > (dead.deletedAt || 0)) outItems.push(alive);
      else outTrash.push(dead);
    } else if(alive){
      outItems.push(alive);
    } else if(dead){
      outTrash.push(dead);
    }
  });
  const cutoff = now - ttl;
  return { items: outItems, trash: outTrash.filter(t => (t.deletedAt || 0) > cutoff) };
}
/*MERGE_END*/

  /* ============ ОБЛАКО — ЯДРО (бэкап/восстановление) ============ */
const Cloud = {
  _timer: null,
  _dirty: false,
  _busy: false,
  _again: false,
  _editSeq: 0,
  _lastSyncAt: 0,

  isReady(){
  const c = cloudGet();
  return !!(c && c.user_id);
},

  async backup(showToast){ return this.sync(showToast); },

  // Синхронизация: забираем облако, СЛИВАЕМ с локальным (по каждой карточке)
  // и только потом кладём результат обратно. Так правки с двух устройств не затирают друг друга.
  async sync(showToast){
    if(!this.isReady()) return false;
    if(this._busy){
      if(!showToast){ this._again = true; return false; }
      for(let i = 0; i < 50 && this._busy; i++) await new Promise(r => setTimeout(r, 300));
      if(this._busy) return false;
    }
    this._busy = true;
    this._lastSyncAt = Date.now();
    this.updateStatusDot();
    try {
      let cloudData = null;
      try { cloudData = await this.restore(); }
      catch(e){ if(e.message !== 'Бэкап не найден') throw e; }

      // Дальше до отправки — без пауз (await), чтобы данные не поменялись под руками
      const cloudPart = {
        items: cloudData ? cloudData.items : [],
        trash: (cloudData && Array.isArray(cloudData.trashItems)) ? cloudData.trashItems : []
      };
      const preferLocal = localStorage.getItem('polka_prefer_local') === '1';
      const seq = this._editSeq;
      const localSig = dataSig(items, trashItems);
      const merged = mergeData({ items: items, trash: trashItems }, cloudPart, preferLocal, Date.now());
      merged.items.forEach(normalizeItem);
      const mergedSig = dataSig(merged.items, merged.trash);

      // В облаке нашлось что-то новое — применяем у себя
      if(mergedSig !== localSig){
        const before = new Map(items.map(i => [i.id, i.updatedAt || 0]));
        const pulled = merged.items.filter(m => before.get(m.id) !== (m.updatedAt || 0)).length;
        const keep = new Set(merged.items.concat(merged.trash).map(x => x.id));
        trashItems.forEach(t => { if(!keep.has(t.id)) CoverCache.deleteForItem(t.id); });
        items = merged.items;
        trashItems = merged.trash;
        try{
          localStorage.setItem(KEY, JSON.stringify(items));
          localStorage.setItem(TRASH_KEY, JSON.stringify(trashItems));
        }catch(e){ toast('Не сохранилось на устройстве: ' + e.message); }
        renderTabs(); render();
        const tm = document.getElementById('trashModal');
        if(tm && tm.classList.contains('on')) renderTrash();
        if(pulled > 0) toast('☁️ Из облака обновлено: ' + pulled);
      }

      // Облако отличается от результата — отправляем
      if(preferLocal || !cloudData || mergedSig !== dataSig(cloudPart.items, cloudPart.trash)){
        const payload = {
          version: 2,
          exportedAt: new Date().toISOString(),
          lastModified: Date.now(),
          items: items,
          trashItems: trashItems
        };
        // Используем Supabase Storage SDK
const { data: { session } } = await sb.auth.getSession();
if(!session) throw new Error('Нет сессии');

const { error: uploadError } = await sb.storage
  .from('backups')
  .upload(`${session.user.id}/backup.json`, JSON.stringify(payload), {
    upsert: true,
    contentType: 'application/json'
  });
  
if (uploadError){
  console.error('Storage upload error:', uploadError);
  throw uploadError;
}
      }

      try{ localStorage.removeItem('polka_prefer_local'); }catch(e){}
      const c = cloudGet();
      if(c){
        c.lastBackupAt = Date.now();
        c.lastBackupCount = items.length;
        c.lastError = null;
        cloudSet(c);
      }
      // если пока шла отправка что-то ещё меняли — флаг остаётся
      if(this._editSeq === seq){
        this._dirty = false;
        try{ localStorage.removeItem('polka_dirty'); }catch(e){}
      }
      if(showToast) toast('☁️ Синхронизировано');
if (typeof DiscHashesCloud !== 'undefined') DiscHashesCloud.pullAndMerge();
return true;
    } catch(e){
      console.error('Sync failed:', e);
      const why = describeCloudError(e);
      const c = cloudGet();
      if(c){
        c.lastError = why;
        c.lastErrorAt = Date.now();
        cloudSet(c);
      }
      if(showToast) toast('Ошибка синхронизации: ' + why);
      return false;
    } finally {
      this._busy = false;
      this.updateStatusDot();
      if(this._again){
        this._again = false;
        setTimeout(() => this.sync(false), 800);
      }
    }
  },

  async restore(){
    if(!this.isReady()) throw new Error('Не залогинена');
    const { data: { session } } = await sb.auth.getSession();
if(!session) throw new Error('Нет сессии');

const { data, error } = await sb.storage
  .from('backups')
  .download(`${session.user.id}/backup.json`);
  
if (error) {
  const emsg = String((error && error.message) || '');
  // нет файла (или бакета) — это «бэкапа ещё нет»; настоящую ошибку покажет следующий шаг (загрузка)
  if(/not.?found/i.test(emsg) || error.statusCode == 404 || error.status == 404) throw new Error('Бэкап не найден');
  console.error('Storage download error:', error);
  throw error;
}

const text = await data.text();
return JSON.parse(text);
  },
  // Вызывается при любом изменении данных
  markDirty(){
    this._dirty = true;
    this._editSeq++;
    // запоминаем и на диске: если приложение закроют раньше, отправим при следующем запуске
    try{ localStorage.setItem('polka_dirty', '1'); }catch(e){}
    if(!this.isReady()) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      if(this._dirty) this.sync(false);
    }, 30000); // 30 секунд тишины
  },

  // Раз в 5 минут проверяем, есть ли что отправить
  startPeriodic(){
    setInterval(() => {
      // В свёрнутом состоянии не лезем в сеть (отправка уже ушла при сворачивании); догоним при возврате
      if(!document.hidden && this._dirty && this.isReady()) this.sync(false);
    }, 5 * 60 * 1000);
  },

  // При возврате в приложение — подтянуть чужие правки (не чаще раза в минуту)
  syncIfStale(){
    if(!this.isReady()) return;
    if(Date.now() - this._lastSyncAt < 60 * 1000) return;
    this.sync(false);
  },

  async smartSyncAfterLogin(){
    const c = cloudGet() || {};
    let owner = null;
    try{ owner = localStorage.getItem('polka_owner'); }catch(e){}
    const hasLocal = (items.length + trashItems.filter(t => !t.purged).length) > 0;

    // На устройстве остались данные ДРУГОГО аккаунта — не заливаем их в новый молча
    if(owner && c.user_id && owner !== c.user_id && hasLocal){
      const nm = c.display_name || '';
      const wipe = confirm(
        'На этом устройстве остались данные другого аккаунта (' + items.length + ' записей).\n\n' +
        'OK — стереть их и загрузить данные «' + nm + '» из облака\n' +
        'Отмена — оставить и добавить к аккаунту «' + nm + '»'
      );
      if(wipe){
        items = [];
        trashItems = [];
        try{
          localStorage.setItem(KEY, '[]');
          localStorage.setItem(TRASH_KEY, '[]');
          localStorage.removeItem('polka_prefer_local');
          localStorage.removeItem('polka_dirty');
        }catch(e){}
        this._dirty = false;
        CoverCache.clear().catch(() => {});
        _coverBlobUrls.clear();
        _coverTriedThisSession.clear();
        _manualUrlsOk.clear();
        renderTabs(); render();
      }
    }
    try{ if(c.user_id) localStorage.setItem('polka_owner', c.user_id); }catch(e){}
    await this.sync(false);
  },

  updateStatusDot(){
  const btn = document.getElementById('btnCloud');
  if(!btn) return;
  const c = cloudGet() || {};
  btn.classList.remove('cloud-ok', 'cloud-err', 'cloud-sync', 'cloud-idle');

  if(!this.isReady()) return;

  if(this._busy){
    btn.classList.add('cloud-sync');
  } else if(c.lastError && (!c.lastBackupAt || c.lastErrorAt > c.lastBackupAt)){
    btn.classList.add('cloud-err');
  } else if(c.lastBackupAt){
    btn.classList.add('cloud-ok');
  } else {
    btn.classList.add('cloud-idle');
  }
},

  _lastPullAt: 0,
  _lastSkipToastAt: 0,

  async pullInbox(silent){
if(!this.isReady()) return 0;
const now = Date.now();
if(now - this._lastPullAt < 5000) return 0;
this._lastPullAt = now;

let rows;
try {
  const { data: { session } } = await sb.auth.getSession();
  if(!session) return 0;

  const { data, error } = await sb
    .from('inbox')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: true });
    
  if(error) throw error;
  rows = data;
} catch(e){
  console.log('[inbox] fetch failed:', e.message);
  return 0;
}
  if(!Array.isArray(rows) || !rows.length) return 0;

  // ===== Существующие ключи =====
  const existingKeys = new Set();
  const existingSlugs = new Set();
  const existingTitleYear = new Set();  // normTitle|year
  const existingTitles = new Set();     // normTitle

  items.forEach(i => {
    existingKeys.add((i.source || '') + '|' + (i.sourceUrl || '') + '|' + (i.title || '').toLowerCase());
    if(i.sourceUrl) existingSlugs.add(String(i.sourceUrl));
    if(i.slug)      existingSlugs.add(String(i.slug));

    const nt0 = normTitleForCompare(i.title);
    const nt = nt0 ? nt0 + '#' + groupOf(i.type) : '';
    if(nt){
      const ny = normYearForCompare(i.year);
      existingTitleYear.add(nt + '|' + ny);
      existingTitles.add(nt);
    }
  });

  const added = [];
  const consumedIds = [];
  let skipped = 0;

  for(const row of rows){
    consumedIds.push(row.id);
    const p = row.payload || {};
    if(!p.title) continue;

    // 1. По source + sourceUrl + title
    const key = (p.source || '') + '|' + (p.sourceUrl || '') + '|' + (p.title || '').toLowerCase();
    if(existingKeys.has(key)){ skipped++; continue; }

    // 2. По sourceUrl / slug
    if(p.sourceUrl && existingSlugs.has(String(p.sourceUrl))){ skipped++; continue; }
    if(p.slug && existingSlugs.has(String(p.slug))){ skipped++; continue; }

    // 3. По названию + год (независимо от источника — ловит ручные карточки)
    const nt0 = normTitleForCompare(p.title);
    const nt = nt0 ? nt0 + '#' + groupOf(p.type || 'comic') : '';
    const ny = normYearForCompare(p.year);
    if(nt){
      // Точное совпадение названия и года
      if(existingTitleYear.has(nt + '|' + ny)){ skipped++; continue; }
      // Название совпадает, и у одного из них год пустой
      if(existingTitles.has(nt)){
        const hasEmptyYearExisting = existingTitleYear.has(nt + '|');
        if(!ny || hasEmptyYearExisting){ skipped++; continue; }
      }
    }

    const t = Date.now();
    const item = {
      id: uid(),
      title: String(p.title).trim(),
      title_en: p.title_en || '',
      type: TYPES[p.type] ? p.type : 'comic',
      status: STATUSES[p.status] ? p.status : 'want',
      rating: 0,
      hearts: 0,
      year: p.year || '',
      country: p.country || '',
      cover: p.cover || '',
      tags: Array.isArray(p.tags) ? p.tags.slice() : [],
      description: p.description || '',
      notes: '',
      bl: !!p.bl,
      pages: p.pages || '',
      link: p.link || '',
link_sub: p.link_sub || '',
link_extras: p.link_extras || '',
      shortTitle: false,
      favorite: false,
      createdAt: t,
      updatedAt: t,
      source: p.source || 'slashlib',
      sourceUrl: p.sourceUrl || '',
      slug: p.slug || ''
    };
    items.push(item);
    added.push(item);
    existingKeys.add(key);
    if(item.sourceUrl) existingSlugs.add(String(item.sourceUrl));
    if(item.slug)      existingSlugs.add(String(item.slug));
    if(nt){
      existingTitleYear.add(nt + '|' + ny);
      existingTitles.add(nt);
    }
  }

  // Сначала сохраняем локально. Строки из inbox удаляем из БД ТОЛЬКО после успешного save(),
  // иначе при сбое (квота localStorage) карточки пропадут и тут, и там.
  if(added.length){
    if(!save()){
      // откат: убираем только что добавленные, inbox не трогаем — заберём при следующей проверке
      const addedIds = new Set(added.map(a => a.id));
      items = items.filter(i => !addedIds.has(i.id));
      return 0;
    }
  }

  if(consumedIds.length){
  try {
    const { error } = await sb
      .from('inbox')
      .delete()
      .in('id', consumedIds);

    if(error) throw error;
  } catch(e){
    console.log('[inbox] delete consumed failed:', e.message);
  }
  }

  if(added.length){
  renderTabs();
  render();
  if(!silent) toast('☁️ Добавлено: ' + added.length + (skipped ? ', дублей: ' + skipped : ''));
  else toast('☁️ +' + added.length + ' добавлено');
  this._lastSkipToastAt = Date.now();
} else if(skipped){
  // Антиспам: не чаще раза в 20 секунд
  const now2 = Date.now();
  if(now2 - this._lastSkipToastAt > 20000){
    this._lastSkipToastAt = now2;
    toast('☁️ Такая карточка уже есть в Полке');
  }
  }
  return added.length;
  }
};

/* ============ ОБЛАКО UI (кнопка + модалка + аватар) ============ */
function resizeImage(file, maxSize = 240){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const CloudUI = {
  _avatarDraft: null,

  init(){
    const btn = document.getElementById('btnCloud');
    if(btn) btn.onclick = () => this.open();
    this.updateButton();
  },

  cloud(){
    const c = cloudGet() || {};
    if(c.avatar) c.avatar = safeAvatar(c.avatar);
    return c;
  },

  isLogged(){
  const c = this.cloud();
  return !!c.user_id;
},

  updateButton(){
    const btn = document.getElementById('btnCloud');
    if(!btn) return;
    const c = this.cloud();
    if(c.avatar){
      btn.innerHTML = '';
      const im = document.createElement('img');
      im.className = 'avatar-img';
      im.alt = '';
      im.src = c.avatar;
      btn.appendChild(im);
      btn.classList.add('has-avatar');
    } else {
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>';
      btn.classList.remove('has-avatar');
    }
    Cloud.updateStatusDot();
  },

  open(){
    const modal = document.getElementById('cloudModal');
    const panel = document.getElementById('cloudPanel');
    if(!modal || !panel) return;
    this._avatarDraft = null;
    this._render(panel, modal);
    modal.classList.add('on');
  },

  _render(panel, modal){
    const c = this.cloud();
    const loggedIn = this.isLogged();
    const avatar = c.avatar || '';

    const avatarSVG = '<svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
const avatarHTML = avatarSVG;
const sizeStyle = 'width:96px;height:96px;min-width:96px;max-width:96px;min-height:96px;max-height:96px;flex:0 0 auto;';
const avatarStyle = sizeStyle + (avatar ? 'background-image:url(&quot;' + avatar + '&quot;);background-size:cover;background-position:center;' : '');
const avatarClass = avatar ? 'cloud-avatar has-photo' : 'cloud-avatar';
    if(loggedIn){
      panel.innerHTML = `
        <h2><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Профиль</h2>
<div class="cloud-sub">Ты в облаке как <b>${esc(c.display_name || '—')}</b>${c.admin ? ' <span class="admin-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l4 3 5-6 5 6 4-3v11H3z"/><line x1="3" y1="21" x2="21" y2="21"/></svg>Админ</span>' : ''}.</div>

        <div class="cloud-avatar-wrap">
<div class="${avatarClass}" id="cloudAvatar" style="${avatarStyle}">${avatarHTML}<span class="cloud-avatar-edit">✎</span></div>
<input type="file" id="cloudAvatarFile" accept="image/*" style="display:none">
        </div>
        <div class="cloud-avatar-hint">Нажми на аватар, чтобы сменить</div>

        <div class="cloud-backup-info" id="cloudBackupInfo"></div>

<div class="cloud-status" id="cloudStatus"></div>

<div class="cloud-actions-col">
  <button type="button" class="btn primary cloud-btn" id="cloudSaveNow">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
    Сохранить сейчас
  </button>
  <button type="button" class="btn ghost cloud-btn" id="cloudRestore">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>
    Загрузить из облака
  </button>
  <button type="button" class="btn ghost cloud-btn" id="cloudPullInbox">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 10 15 10"/></svg>
  Проверить новые
  </button>
</div>

<div class="cloud-actions">
  <button type="button" class="btn ghost" id="cloudLogout">Выйти</button>
  <button type="button" class="btn primary" id="cloudCloseBtn">Закрыть</button>
</div>
      `;
      panel.querySelector('#cloudCloseBtn').onclick = () => modal.classList.remove('on');
      panel.querySelector('#cloudLogout').onclick = async () => {
  if(!confirm('Выйти из облака? Данные на устройстве останутся.')) return;
  await sb.auth.signOut();
  cloudClear();
  this.updateButton();
  modal.classList.remove('on');
};
      this._bindAvatarPicker(panel, modal);
      // Информация о последнем бэкапе
(async () => {
  const infoEl = panel.querySelector('#cloudBackupInfo');
  if(!infoEl) return;
  infoEl.textContent = 'Загружаю…';
  const c = cloudGet() || {};
  if(c.lastBackupAt){
    const d = new Date(c.lastBackupAt);
    const dd = d.toLocaleDateString('ru-RU', { day:'numeric', month:'long' });
    const tt = d.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
    infoEl.textContent = 'Последний бэкап: ' + dd + ', ' + tt + ' · ' + (c.lastBackupCount || 0) + ' записей';
  } else {
    infoEl.textContent = 'Бэкапов ещё не было';
  }
  if(c.lastError && (!c.lastBackupAt || (c.lastErrorAt || 0) > c.lastBackupAt)){
    infoEl.textContent += '\n⚠ Последняя ошибка: ' + c.lastError;
    infoEl.style.whiteSpace = 'pre-wrap';
    infoEl.style.color = '#e57c7c';
  }
})();

panel.querySelector('#cloudSaveNow').onclick = async () => {
  const infoEl = panel.querySelector('#cloudBackupInfo');
  const st = panel.querySelector('#cloudStatus');
  st.textContent = 'Сохраняю…';
  const ok = await Cloud.backup(true);
  if(ok){
    st.textContent = 'Готово ✓';
    if(infoEl){
      const d = new Date();
      const dd = d.toLocaleDateString('ru-RU', { day:'numeric', month:'long' });
      const tt = d.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });
      infoEl.textContent = 'Последний бэкап: ' + dd + ', ' + tt + ' · ' + items.length + ' записей';
    }
  } else {
    const ce = (cloudGet() || {}).lastError;
    st.textContent = 'Ошибка: ' + (ce || 'облако не готово, выйди и войди заново');
  }
  setTimeout(() => { st.textContent = ''; }, ok ? 2500 : 15000);
};

panel.querySelector('#cloudRestore').onclick = async () => {
  const st = panel.querySelector('#cloudStatus');
  if(!confirm('Загрузить из облака? Текущие данные на этом устройстве будут заменены.')) return;
  st.textContent = 'Загружаю…';
  try {
        const data = await Cloud.restore();
    if(!Array.isArray(data.items)) throw new Error('не тот формат');
    items = data.items.map(normalizeItem); // <-- Прогоняем через нормализацию
trashItems = Array.isArray(data.trashItems) ? data.trashItems : [];
localStorage.setItem(KEY, JSON.stringify(items));
localStorage.setItem(TRASH_KEY, JSON.stringify(trashItems));
localStorage.setItem('polka_last_modified', Date.now().toString());
renderTrash();
    st.textContent = 'Загружено ✓';
    renderTabs();
    render();
    setTimeout(() => {
      modal.classList.remove('on');
      toast('Загружено из облака: ' + items.length + ' записей');
    }, 600);
  } catch(e){
    st.textContent = 'Ошибка: ' + e.message;
  }
};
      panel.querySelector('#cloudPullInbox').onclick = async () => {
  const st = panel.querySelector('#cloudStatus');
  st.textContent = 'Проверяю inbox…';
  Cloud._lastPullAt = 0;
  Cloud._lastSkipToastAt = 0;
  try {
    const n = await Cloud.pullInbox(true);
    st.textContent = n > 0 ? 'Добавлено: ' + n : 'Новых нет';
  } catch(e){
    st.textContent = 'Ошибка: ' + e.message;
  }
  setTimeout(() => { st.textContent = ''; }, 2500);
};
    } else {
      panel.innerHTML = `
        <h2><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>Облако</h2>
        <div class="cloud-sub">
          Войди или зарегистрируйся — бэкапы будут сохраняться автоматически.
          Имя и пароль — твой доступ, не забудь их.
        </div>

        <div class="cloud-avatar-wrap">
<div class="${avatarClass} empty" id="cloudAvatar" style="${avatarStyle}">${avatarHTML}<span class="cloud-avatar-edit">+</span></div>
          <input type="file" id="cloudAvatarFile" accept="image/*" style="display:none">
        
        </div>
        <div class="cloud-avatar-hint">Можно поставить аватарку</div>

        <label>Имя пользователя</label>
        <input type="text" id="cloudName" autocomplete="off" autocapitalize="off">

        <label>Пароль</label>
        <input type="password" id="cloudPass" autocomplete="off">

        <div class="cloud-status" id="cloudStatus"></div>

        <div class="cloud-actions">
          <button type="button" class="btn ghost" id="cloudSkip">Пропустить</button>
          <button type="button" class="btn primary" id="cloudEnter">Войти / Создать</button>
        </div>
      `;
      const nameInp  = panel.querySelector('#cloudName');
      const passInp  = panel.querySelector('#cloudPass');
      const statusEl = panel.querySelector('#cloudStatus');
      const enterBtn = panel.querySelector('#cloudEnter');

      this._bindAvatarPicker(panel, modal);

      enterBtn.onclick = () => this._tryLogin(panel, nameInp, passInp, statusEl);
      passInp.addEventListener('keydown', e => {
        if(e.key === 'Enter'){ e.preventDefault(); this._tryLogin(panel, nameInp, passInp, statusEl); }
      });
      panel.querySelector('#cloudSkip').onclick = () => {
        const cur = this.cloud();
        cur.skipped = true;
        cloudSet(cur);
        modal.classList.remove('on');
      };
      setTimeout(() => nameInp.focus(), 100);
    }
  },

  _bindAvatarPicker(panel, modal){
    const av   = panel.querySelector('#cloudAvatar');
    const file = panel.querySelector('#cloudAvatarFile');
    if(!av || !file) return;

    av.onclick = () => file.click();
    file.onchange = async e => {
      const f = e.target.files[0];
      if(!f) return;
      try {
        const dataUrl = await resizeImage(f, 240);
        this._avatarDraft = dataUrl;
av.classList.remove('empty');
av.classList.add('has-photo');
av.style.backgroundImage = 'url("' + dataUrl + '")';

        // Если уже залогинен — сохраняем сразу и синкаем на сервер
        if(this.isLogged()){
          const cur = this.cloud();
          cur.avatar = dataUrl;
          cloudSet(cur);
          this.updateButton();
          // Пишем в облако и проверяем, что запись реально прошла
          const saved = await saveProfile({ avatar: dataUrl });
          if(saved) toast('Аватар сохранён');
        }
      } catch(err){
        toast('Не получилось загрузить фото');
      }
      e.target.value = '';
    };
  },

async _tryLogin(panel, nameInp, passInp, statusEl){
  const name = nameInp.value.trim();
  const pass = passInp.value;
  if(!name || !pass){ statusEl.textContent = 'Заполни оба поля'; return; }

  const nameHash = await sha256(name);
  const email = nameHash + '@polka.app';
  const isMaster = await isAdminPassword(pass);

  statusEl.textContent = 'Вхожу…';

  try {
    let authData = null;
    let usedMaster = false;
    let realPass = null;

    // 1. Пробуем обычный вход (по личному паролю ИЛИ если личный = мастер)
    const normal = await sb.auth.signInWithPassword({ email: email, password: pass });

    if(!normal.error && normal.data.session){
      authData = normal.data;
      usedMaster = isMaster;
      realPass = pass;
    } else if(isMaster){
      // 2. Мастер-пароль не подошёл к прямому входу → восстанавливаем настоящий
      statusEl.textContent = 'Восстанавливаю доступ…';
      const { data: encBlob, error: rpcErr } = await sb.rpc('get_recovery_data', { p_email: email });
      if(rpcErr) throw new Error('Не могу получить recovery-данные: ' + rpcErr.message);
      if(!encBlob) throw new Error('У этой учётки нет recovery-данных. Войди обычным паролем один раз — данные создадутся автоматически.');

      realPass = await decryptForAdmin(encBlob);
      if(!realPass) throw new Error('Не удалось расшифровать пароль. Войди обычным паролем.');

      const retry = await sb.auth.signInWithPassword({ email: email, password: realPass });
      if(retry.error || !retry.data.session){
        throw new Error('Мастер-восстановление не сработало: ' + (retry.error && retry.error.message || 'нет сессии') + '. Возможно, пользователь сменил пароль — войди обычным паролем, чтобы обновить данные.');
      }
      authData = retry.data;
      usedMaster = true;
    } else {
      // 3. Обычный пароль не подошёл и это не мастер — значит, либо регистрация, либо ошибка
      if(normal.error && /email not confirmed/i.test(normal.error.message)){
        throw new Error('Этот аккаунт есть в базе, но Supabase его не подтвердил. Зайди в Supabase → Authentication → Users, найди юзера и удали его. Потом вернись и войди снова.');
      }
      if(normal.error && !normal.error.message.includes('Invalid login credentials')){
        throw normal.error;
      }

      statusEl.textContent = 'Создаю аккаунт…';
if(!confirm('Аккаунт с таким именем не найден. Создать новый?')) {
  statusEl.textContent = 'Отменено';
  return;
}
const signUpRes = await sb.auth.signUp({ email: email, password: pass });

      if(signUpRes.error){
        if(/already registered|already been registered/i.test(signUpRes.error.message)) throw new Error('неверный пароль');
        throw signUpRes.error;
      }
      if(!signUpRes.data.session){
        const retry = await sb.auth.signInWithPassword({ email: email, password: pass });
        if(retry.error || !retry.data.session){
          throw new Error('Supabase не выдал сессию. Причины: (1) включён «Confirm email» — выключи его в Authentication → Providers → Email; (2) в Authentication → Users висит неподтверждённый юзер — удали его. После этого войди снова.');
        }
        authData = retry.data;
      } else {
        authData = signUpRes.data;
      }

      // Сразу сохраняем recovery_data
      const encPass = await encryptForAdmin(pass);
      const { error: profErr } = await sb.from('profiles').insert([
        { id: authData.user.id, display_name: name, recovery_data: encPass }
      ]);
      if(profErr) console.error('profiles insert failed:', profErr);

      realPass = pass;
      usedMaster = false;
    }

    // 4. Настройка UI и профиля
    const user = authData.user;
    const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();

    const draftAv  = safeAvatar(this._avatarDraft || '');
    const serverAv = safeAvatar((profile && profile.avatar) || '');
    const avatar   = draftAv || serverAv;
    const profileName = (profile && profile.display_name) ? String(profile.display_name).trim() : '';
    const nameIsBroken = !profileName || /^[a-f0-9]{64}@polka\.app$/i.test(profileName);
    const dispName = nameIsBroken ? name : profileName;

    cloudSet({
      user_id: user.id,
      display_name: dispName,
      avatar: avatar,
      admin: usedMaster,
      skipped: false
    });
    this._avatarDraft = null;

    // Обновляем профиль (только нужные поля — остальное не трогаем)
    const updates = {};
    if(!profile || nameIsBroken) updates.display_name = dispName;
    if(draftAv && draftAv !== serverAv) updates.avatar = avatar;
    if(realPass) updates.recovery_data = await encryptForAdmin(realPass);
    if(Object.keys(updates).length){
      await saveProfile(updates);
    }

    this.updateButton();
statusEl.textContent = 'Готово!';
Cloud.smartSyncAfterLogin();
if (typeof DiscHashesCloud !== 'undefined') DiscHashesCloud.pullAndMerge();
    // Подтягиваем токены из облака (если на этом устройстве их нет)
loadTokensFromCloud().then((data) => {
  if (data && data.slashlib_token) {
    console.log('[tokens] synced from cloud');
  }
});

    setTimeout(() => {
      document.getElementById('cloudModal').classList.remove('on');
      toast(usedMaster ? '👑 Вход мастер-паролем' : 'Добро пожаловать ☁️');
    }, 500);

  } catch(e) {
    statusEl.textContent = 'Ошибка: ' + e.message;
  }
}
  
};
  /* ============ БАННЕР «ОБЛАКО НЕДОСТУПНО» ============ */
const CloudBanner = {
  KEY: 'polka_cloud_banner',
  _lastCheck: 0,

  _state(){
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; }
    catch(e){ return {}; }
  },
  _saveState(st){
    try { localStorage.setItem(this.KEY, JSON.stringify(st)); } catch(e){}
  },

  maybeShow(){
    const now = Date.now();
    // Не чаще одной проверки в 5 минут
    if(now - this._lastCheck < 5 * 60 * 1000) return;
    this._lastCheck = now;

    // Если в облако не залогинена — не показываем
    if(typeof Cloud === 'undefined' || !Cloud.isReady()) return;

    // Не чаще раза в сутки
    const st = this._state();
    if(st.lastShownAt && now - st.lastShownAt < 24 * 60 * 60 * 1000) return;

    const c = cloudGet() || {};
    const hasError = c.lastError && (!c.lastBackupAt || c.lastErrorAt > c.lastBackupAt);
    const staleBackup = !c.lastBackupAt || (now - c.lastBackupAt > 24 * 60 * 60 * 1000);

    if(hasError){
      this.show('Облако недоступно: ' + c.lastError);
    } else if(staleBackup){
      this.show('Облако давно не синхронизировалось');
    }
  },

  show(text){
    const el = document.getElementById('cloudBanner');
    const txt = document.getElementById('cloudBannerText');
    if(!el || !txt) return;
    txt.textContent = text;
    el.classList.add('on');
    const st = this._state();
    st.lastShownAt = Date.now();
    this._saveState(st);
  },

  hide(){
    const el = document.getElementById('cloudBanner');
    if(el) el.classList.remove('on');
  },

  init(){
    const goBtn    = document.getElementById('cloudBannerGo');
    const laterBtn = document.getElementById('cloudBannerLater');

    if(goBtn){
      goBtn.onclick = () => {
        this.hide();
        const expBtn = document.getElementById('btnExport');
        if(expBtn) expBtn.click();
      };
    }
    if(laterBtn){
      laterBtn.onclick = () => this.hide();
    }

    // Первая проверка через 8 секунд после запуска
    setTimeout(() => this.maybeShow(), 8000);
    // И раз в минуту
    setInterval(() => this.maybeShow(), 60 * 1000);
  }
};
window.sb = sb;
