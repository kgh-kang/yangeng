/* store.js — 대화·설정 저장소 (브라우저 localStorage). 저장 실패(용량 초과·차단)에도 앱은 계속 동작한다. */
(function () {
  const K_CONVS = 'moa.convs.v1';
  const K_SETTINGS = 'moa.settings.v1';
  const K_SESSION_KEY = 'moa.key.session.v1';
  const DEFAULTS = { name: '', apiKey: '', rememberKey: true, model: 'claude-opus-5-5', effort: 'medium', system: '', theme: 'system', webSearch: false };

  const read = (k, fallback) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /** 예전 형식(images 배열)을 files 배열로 옮긴다 */
  function migrate(list) {
    for (const c of list) for (const m of c.messages || []) {
      if (m.images && !m.files) m.files = m.images.map((i) => ({ kind: 'image', ...i }));
      delete m.images;
    }
    return list;
  }
  let convs = migrate(read(K_CONVS, []));
  /** rememberKey가 꺼져 있으면 API 키는 이 탭(sessionStorage)에만 둔다 */
  function loadSettings() {
    const st = Object.assign({}, DEFAULTS, read(K_SETTINGS, {}));
    if (!st.rememberKey) { try { st.apiKey = sessionStorage.getItem(K_SESSION_KEY) || ''; } catch (_) { st.apiKey = ''; } }
    return st;
  }
  let settings = loadSettings();
  const listeners = new Set();
  const removed = new Set();
  const emit = (what) => listeners.forEach((fn) => fn(what));

  /** 저장. 용량 초과면 오래된 대화의 이미지 원본부터 비우고 다시 시도한다. 결과: 'ok' | 'trimmed' | 'failed' */
  function persist() {
    try { localStorage.setItem(K_CONVS, JSON.stringify(convs)); return 'ok'; } catch (_) { /* fallthrough */ }
    const sorted = convs.slice().sort((a, b) => a.updatedAt - b.updatedAt);
    for (const c of sorted) {
      let changed = false;
      for (const m of c.messages) for (const f of m.files || []) if (f.data || f.text) { f.data = ''; f.text = ''; f.dropped = true; changed = true; }
      if (changed) {
        try { localStorage.setItem(K_CONVS, JSON.stringify(convs)); return 'trimmed'; } catch (_) { /* 계속 */ }
      }
    }
    return 'failed';
  }

  const Store = {
    uid,
    /** 다른 탭에서 바뀐 저장 내용을 다시 읽는다 */
    reload() {
      convs = migrate(read(K_CONVS, []));
      settings = loadSettings();
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get settings() { return settings; },
    saveSettings(patch) {
      settings = Object.assign({}, settings, patch);
      const toSave = Object.assign({}, settings);
      try {
        if (settings.rememberKey) sessionStorage.removeItem(K_SESSION_KEY);
        else { sessionStorage.setItem(K_SESSION_KEY, settings.apiKey || ''); toSave.apiKey = ''; }
      } catch (_) { if (!settings.rememberKey) toSave.apiKey = ''; }
      try { localStorage.setItem(K_SETTINGS, JSON.stringify(toSave)); } catch (_) {}
      emit('settings');
    },
    list() { return convs.slice().sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt)); },
    get(id) { return convs.find((c) => c.id === id) || null; },
    create() {
      const c = { id: uid(), title: '', createdAt: Date.now(), updatedAt: Date.now(), pinned: false, messages: [] };
      convs.push(c);
      return c;
    },
    /** 대화를 목록에 반영하고 저장. 빈 대화는 저장하지 않는다. */
    commit(c, { touch = true } = {}) {
      if (removed.has(c.id)) return 'ok'; // 답변 도중 삭제된 대화는 되살리지 않는다
      if (touch) c.updatedAt = Date.now();
      const i = convs.findIndex((x) => x.id === c.id);
      if (i < 0) convs.push(c); else if (convs[i] !== c) convs[i] = c; // 다른 탭 동기화로 배열이 바뀐 경우
      if (!c.messages.length) convs = convs.filter((x) => x.id !== c.id || x.messages.length);
      const r = persist();
      emit('convs');
      return r;
    },
    rename(id, title) { const c = this.get(id); if (c) { c.title = title.trim().slice(0, 80) || c.title; this.commit(c, { touch: false }); } },
    togglePin(id) { const c = this.get(id); if (c) { c.pinned = !c.pinned; this.commit(c, { touch: false }); } },
    remove(id) { removed.add(id); convs = convs.filter((c) => c.id !== id); persist(); emit('convs'); },
    clearAll() { convs.forEach((c) => removed.add(c.id)); convs = []; persist(); emit('convs'); },
    /** 백업 파일 내용 (API 키는 넣지 않는다) */
    backup() {
      const { apiKey, ...safe } = settings;
      return JSON.stringify({ app: 'moa', version: 1, exportedAt: new Date().toISOString(), settings: safe, conversations: convs }, null, 1);
    },
    /** 백업 복원: 같은 id는 더 최근 것으로, 새 대화는 추가. 반환: 추가·갱신된 대화 수 */
    restore(text) {
      let data;
      try { data = JSON.parse(text); } catch (_) { throw new Error('백업 파일을 읽지 못했어요. 모아에서 받은 .json 파일인지 확인해 주세요.'); }
      if (!data || data.app !== 'moa' || !Array.isArray(data.conversations)) throw new Error('모아 백업 파일이 아니에요.');
      migrate(data.conversations.filter((c) => c && Array.isArray(c.messages)));
      let n = 0;
      for (const c of data.conversations) {
        if (!c || typeof c.id !== 'string' || !Array.isArray(c.messages)) continue;
        const clean = {
          id: c.id, title: String(c.title || ''), createdAt: +c.createdAt || Date.now(), updatedAt: +c.updatedAt || Date.now(), pinned: !!c.pinned,
          messages: c.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant')).map((m) => ({ ...m, id: String(m.id || uid()), content: String(m.content || ''), pending: undefined })),
        };
        removed.delete(clean.id);
        const i = convs.findIndex((x) => x.id === clean.id);
        if (i < 0) { convs.push(clean); n++; } else if (clean.updatedAt > convs[i].updatedAt) { convs[i] = clean; n++; }
      }
      const r = persist();
      emit('convs');
      if (r === 'failed') throw new Error('저장 공간이 부족해 백업을 다 불러오지 못했어요.');
      return n;
    },
    exportMarkdown(c) {
      const lines = [`# ${c.title || '새 대화'}`, ''];
      for (const m of c.messages) {
        lines.push(m.role === 'user' ? '**나**' : '**모아**', '', m.content || (m.error ? `(오류: ${m.error})` : ''), '');
      }
      return lines.join('\n');
    },
  };
  window.MoaStore = Store;
})();
