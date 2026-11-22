/* ==========================================================
   DomainsCloud — синхронизация доменов с Supabase
   ========================================================== */
const DomainsCloud = {
  TABLE: 'polka_domains_global',
  FUNC: 'polka_domains_upsert',
  LAST_PULL: 0,
  PULL_INTERVAL: 5 * 60 * 1000, // 5 минут

  _sb() {
    return (typeof window.sb !== 'undefined') ? window.sb : null;
  },

  _isAdmin() {
    try {
      const c = JSON.parse(localStorage.getItem('polka_cloud') || '{}');
      return c.admin === true;
    } catch (e) { return false; }
  },

  // Pull из Supabase → merge с локалкой
  async pull() {
    const sb = this._sb();
    if (!sb) { console.log('[DomainsCloud] Supabase недоступен'); return false; }
    try {
      const { data, error } = await sb
        .from(this.TABLE)
        .select('field_key, host, seq, t')
        .order('seq', { ascending: false });
      if (error) { console.warn('[DomainsCloud] pull error:', error.message); return false; }
      if (!Array.isArray(data)) return false;

      // Группируем по field_key
      const groups = {};
      data.forEach(row => {
        if (!groups[row.field_key]) groups[row.field_key] = [];
        groups[row.field_key].push(row);
      });

      let added = 0;
      for (const key in groups) {
        const rows = groups[key].sort((a, b) => b.seq - a.seq);
        rows.forEach(row => {
          const n = addRaw(key, row.host);
          if (n > 0) added++;
        });
      }
      if (added > 0) save();
      this.LAST_PULL = Date.now();
      console.log('[DomainsCloud] pull: ' + data.length + ' строк, добавлено ' + added);
      return true;
    } catch (e) {
      console.warn('[DomainsCloud] pull exception:', e.message);
      return false;
    }
  },

  // Push одной записи в Supabase (только если админ)
  async pushOne(fieldKey, host, seq) {
    if (!this._isAdmin()) return false;
    const sb = this._sb();
    if (!sb) return false;
    try {
      const { error } = await sb.rpc(this.FUNC, {
        p_field_key: fieldKey,
        p_host: host,
        p_seq: seq,
        p_t: new Date().toISOString()
      });
      if (error) {
        console.warn('[DomainsCloud] push error:', error.message);
        return false;
      }
      console.log('[DomainsCloud] pushed:', fieldKey, host, '#' + seq);
      return true;
    } catch (e) {
      console.warn('[DomainsCloud] push exception:', e.message);
      return false;
    }
  },

  // Push всей локальной базы (для первичной загрузки или ручной синхронизации)
  async pushAll() {
    if (!this._isAdmin()) return { ok: false, note: 'не админ' };
    const sb = this._sb();
    if (!sb) return { ok: false, note: 'Supabase недоступен' };
    let pushed = 0, errors = 0;
    for (const key in DB.fields) {
      const rows = DB.fields[key].rows || [];
      for (const row of rows) {
        const ok = await this.pushOne(key, row.h, row.n);
        if (ok) pushed++;
        else errors++;
        await sleep(50); // не спамить
      }
    }
    return { ok: errors === 0, pushed, errors, note: errors ? errors + ' ошибок' : '' };
  },

  // Периодический pull (как pullInbox)
  startPeriodic() {
    if (this._periodic) return;
    this._periodic = setInterval(() => { this.pull(); }, this.PULL_INTERVAL);
    console.log('[DomainsCloud] periodic pull started');
  },

  // Pull при возврате на страницу
  syncIfStale() {
    if (Date.now() - this.LAST_PULL > this.PULL_INTERVAL) this.pull();
  }
};