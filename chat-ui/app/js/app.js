/* app.js — 모아 채팅 앱 본체: 화면 렌더링, 대화 흐름, 첨부, 시트/다이얼로그, 단축키 */
(function () {
  const { render: md, esc } = window.MoaMarkdown;
  const Store = window.MoaStore;
  const API = window.MoaAPI;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const body = document.body;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const mobileMQ = window.matchMedia('(max-width: 860px)');

  const el = {
    convs: $('#convs'), search: $('#search'), thread: $('#thread'), scroll: $('#scroll'), title: $('#title'),
    input: $('#input'), send: $('#send'), composer: $('#composer'), file: $('#file'), attachList: $('#attach-list'),
    modelLabel: $('#model-label'), greeting: $('#greeting'), demoNotice: $('#demo-notice'), toBottom: $('#to-bottom'),
    meName: $('#me-name'), meAv: $('#me-av'), mePlan: $('#me-plan'), liveDot: $('#live-dot'),
    panel: $('#panel'), panelBody: $('#panel-body'), panelTitle: $('#panel-title'), panelSub: $('#panel-sub'), layer: $('#layer'),
  };

  const S = { conv: null, busy: false, abort: null, attachments: [], panel: null, query: '', editing: null };
  const MAX_ATTACH = 5;

  const I = {
    copy: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></svg>',
    check: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 10.5l4 4 8-9"/></svg>',
    retry: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3v4h-4"/></svg>',
    edit: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M13.5 3.5l3 3L7 16H4v-3z"/></svg>',
    up: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 9v8H3V9h3zm0 0 4-6c1.2 0 2 .9 2 2v3h4.2a1.5 1.5 0 0 1 1.5 1.8l-1.2 6A1.5 1.5 0 0 1 15 17H6"/></svg>',
    down: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 11V3H3v8h3zm0 0 4 6c1.2 0 2-.9 2-2v-3h4.2a1.5 1.5 0 0 0 1.5-1.8l-1.2-6A1.5 1.5 0 0 0 15 3H6"/></svg>',
    alert: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="7.5"/><path d="M10 6v4.5M10 13.5v.5" stroke-linecap="round"/></svg>',
    x: '<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>',
    more: '<svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><circle cx="4.5" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="15.5" cy="10" r="1.5"/></svg>',
  };

  /* ================= 공통 UI: 토스트 · 레이어(시트/다이얼로그/메뉴) ================= */
  let toastTimer;
  function toast(msg) {
    $$('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2200);
  }

  const layers = [];
  let lastFocus = null;
  /** 레이어를 연다. kind: 'sheet' | 'dialog' | 'menu'. 반환된 close()로 닫는다. */
  function openLayer(kind, html, { anchor, label } = {}) {
    closeLayers();
    lastFocus = document.activeElement;
    const wrap = document.createElement('div');
    const ov = kind === 'menu' ? '<div class="overlay" style="background:transparent" data-close></div>' : '<div class="overlay" data-close></div>';
    wrap.innerHTML = ov + `<div class="${kind}" role="${kind === 'menu' ? 'menu' : 'dialog'}" ${kind === 'menu' ? '' : 'aria-modal="true"'} ${label ? `aria-label="${esc(label)}"` : ''} tabindex="-1">${kind === 'sheet' ? '<div class="sheet__grip"></div>' : ''}${html}</div>`;
    el.layer.appendChild(wrap);
    const box = wrap.lastElementChild;
    if (kind === 'menu' && anchor) {
      const r = anchor.getBoundingClientRect();
      const w = 200;
      box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
      const below = r.bottom + 6;
      box.style.top = (below + 220 > window.innerHeight ? Math.max(8, r.top - 6 - box.offsetHeight) : below) + 'px';
    }
    const close = () => {
      wrap.remove();
      const i = layers.indexOf(close); if (i >= 0) layers.splice(i, 1);
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    };
    wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    layers.push(close);
    const first = box.querySelector('input, textarea, [autofocus]') || box.querySelector('button');
    setTimeout(() => (first || box).focus({ preventScroll: true }), 30);
    return { box, close };
  }
  function closeLayers() { while (layers.length) layers[layers.length - 1](); }

  function confirmDialog({ title, text, ok = '확인', danger = false }) {
    return new Promise((resolve) => {
      const { box, close } = openLayer('dialog', `<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="dialog__btns"><button class="btn" data-no>취소</button><button class="btn ${danger ? 'btn--red' : 'btn--blue'}" data-yes>${esc(ok)}</button></div>`, { label: title });
      box.querySelector('[data-no]').onclick = () => { close(); resolve(false); };
      box.querySelector('[data-yes]').onclick = () => { close(); resolve(true); };
      box.querySelector('[data-yes]').focus();
    });
  }
  function promptDialog({ title, value = '', ok = '저장' }) {
    return new Promise((resolve) => {
      const { box, close } = openLayer('dialog', `<h2>${esc(title)}</h2><form><input class="input" id="dlg-input" maxlength="80" value="${esc(value)}" aria-label="${esc(title)}" style="margin:8px 0 16px"><div class="dialog__btns"><button type="button" class="btn" data-no>취소</button><button class="btn btn--blue">${esc(ok)}</button></div></form>`, { label: title });
      const input = box.querySelector('input');
      setTimeout(() => input.select(), 40);
      box.querySelector('[data-no]').onclick = () => { close(); resolve(null); };
      box.querySelector('form').onsubmit = (e) => { e.preventDefault(); close(); resolve(input.value.trim() || null); };
    });
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); return ok;
    }
  }

  /* ================= 사이드바: 날짜별 대화 목록 ================= */
  function groupOf(c) {
    if (c.pinned) return '고정됨';
    const d = new Date(c.updatedAt), now = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff <= 0) return '오늘';
    if (diff === 1) return '어제';
    if (diff < 7) return '지난 7일';
    if (diff < 30) return '지난 30일';
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  }
  function matches(c, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return (c.title || '').toLowerCase().includes(q) || c.messages.some((m) => (m.content || '').toLowerCase().includes(q));
  }
  function renderSidebar() {
    const list = Store.list().filter((c) => matches(c, S.query));
    if (!list.length) {
      el.convs.innerHTML = `<div class="empty-list">${S.query ? `“${esc(S.query)}”에 맞는 대화가 없어요` : '아직 대화가 없어요.<br>첫 질문을 보내 보세요.'}</div>`;
      return;
    }
    let html = '', last = '';
    for (const c of list) {
      const g = groupOf(c);
      if (g !== last) { html += `<div class="group">${g}</div>`; last = g; }
      const active = S.conv && S.conv.id === c.id;
      html += `<div class="conv${active ? ' is-active' : ''}" data-id="${c.id}"><button class="conv__link" data-action="open" data-id="${c.id}"${active ? ' aria-current="page"' : ''}>${c.pinned ? '<span class="conv__pin" aria-label="고정됨">●</span>' : ''}<span>${esc(c.title || '새 대화')}</span></button><button class="icon-btn icon-btn--sm conv__more" data-action="conv-more" data-id="${c.id}" aria-label="${esc(c.title || '새 대화')} 메뉴">${I.more}</button></div>`;
    }
    el.convs.innerHTML = html;
  }

  /* ================= 상단/프로필/인사말 ================= */
  function renderChrome() {
    const st = Store.settings;
    const live = API.isLive(st);
    el.modelLabel.textContent = API.modelInfo(st.model).name;
    el.meName.textContent = st.name ? `${st.name}` : '내 계정';
    el.meAv.textContent = (st.name || '나').slice(0, 1);
    el.mePlan.textContent = live ? 'Claude 연결됨' : '데모 모드';
    el.liveDot.classList.toggle('is-live', live);
    el.demoNotice.hidden = live;
    el.greeting.innerHTML = `${st.name ? esc(st.name) + '님,' : '안녕하세요,'}<br><em>무엇이든</em> 물어보세요`;
    el.title.textContent = (S.conv && S.conv.title) || '새 대화';
    document.title = S.conv && S.conv.title ? `${S.conv.title} · 모아` : '모아';
    const t = st.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  }

  /* ================= 메시지 렌더링 ================= */
  function userHTML(m) {
    const imgs = (m.images || []).length
      ? `<div class="imgs">${m.images.map((i) => (i.data ? `<img src="data:${i.mediaType};base64,${i.data}" alt="${esc(i.name || '첨부 이미지')}" loading="lazy">` : '<div class="gone">저장 공간이 부족해 이미지를 지웠어요</div>')).join('')}</div>`
      : '';
    if (S.editing === m.id) {
      return `${imgs}<form class="edit" data-edit-form="${m.id}"><label class="sr-only" for="edit-${m.id}">메시지 수정</label><textarea id="edit-${m.id}">${esc(m.content)}</textarea><div class="edit__btns"><button type="button" class="btn" data-action="edit-cancel">취소</button><button class="btn btn--blue">보내기</button></div></form>`;
    }
    const acts = `<div class="actions"><button data-action="copy-msg" aria-label="복사" title="복사">${I.copy}</button><button data-action="edit-msg" aria-label="수정" title="수정">${I.edit}</button></div>`;
    return `${imgs}<div class="user-row">${acts}${m.content ? `<div class="bubble">${esc(m.content)}</div>` : ''}</div>`;
  }
  const secs = (ms) => Math.max(1, Math.round(ms / 1000));
  function aiBodyHTML(m) {
    let h = '';
    if (m.pending && !m.content && m.thinkStart) {
      h += `<div class="think-live" aria-live="off"><span class="think-live__dot"></span>생각하는 중 · ${secs(Date.now() - m.thinkStart)}초</div>`;
      if (m.thinking) h += `<div class="think-live__text">${esc(m.thinking.slice(-160))}</div>`;
    } else if (m.thinking) {
      h += `<details class="think"><summary>생각 과정${m.thinkMs ? ` · ${secs(m.thinkMs)}초` : ''}</summary><div class="think__body md">${md(m.thinking)}</div></details>`;
    }
    if (m.content) h += `<div class="md${m.pending ? ' caret' : ''}">${md(m.content)}</div>`;
    else if (m.pending && !m.thinkStart) h += '<span class="typing" aria-label="답변 작성 중"><i></i><i></i><i></i></span>';
    if (m.stopped) h += '<div class="note">답변을 중간에 멈췄어요.</div>';
    if (m.truncated) h += '<div class="note">답변이 너무 길어서 여기까지만 받았어요. “이어서 써줘”라고 보내 보세요.</div>';
    if (m.error) {
      const fix = m.fix === 'settings' ? '<button class="btn btn--weak" data-action="settings">설정 열기</button>' : m.fix === 'model' ? '<button class="btn btn--weak" data-action="model">모델 바꾸기</button>' : '';
      h += `<div class="err" role="alert">${I.alert}<span>${esc(m.error)}</span>${fix}<button class="btn btn--weak" data-action="retry">다시 시도</button></div>`;
    }
    return h;
  }
  function aiHTML(m) {
    const model = m.model && m.model !== 'demo' ? API.modelInfo(m.model).name : m.model === 'demo' ? '데모' : '';
    const actions = m.pending ? '' : `<div class="actions">${m.content ? `<button data-action="copy-msg" aria-label="복사" title="복사">${I.copy}</button>` : ''}<button data-action="retry" aria-label="다시 생성" title="다시 생성">${I.retry}</button>${m.content ? `<button data-action="feedback" data-v="up" aria-label="좋아요" aria-pressed="${m.feedback === 'up'}">${I.up}</button><button data-action="feedback" data-v="down" aria-label="별로예요" aria-pressed="${m.feedback === 'down'}">${I.down}</button>` : ''}</div>`;
    return `<h2 class="ai__head"><i class="logo" aria-hidden="true">모</i>모아${model ? ` <small>· ${esc(model)}</small>` : ''}<span class="sr-only">의 답변</span></h2><div class="ai__body">${aiBodyHTML(m)}</div>${actions}`;
  }
  function msgNode(m) {
    const n = document.createElement('div');
    n.className = `msg msg--${m.role === 'user' ? 'user' : 'ai'}`;
    n.dataset.id = m.id;
    n.innerHTML = m.role === 'user' ? userHTML(m) : aiHTML(m);
    return n;
  }
  function renderThread() {
    const msgs = S.conv ? S.conv.messages : [];
    body.classList.toggle('is-empty', !msgs.length);
    el.thread.replaceChildren(...msgs.map(msgNode));
    const ta = $('[data-edit-form] textarea', el.thread);
    if (ta) { autosize(ta); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
  function rerenderMsg(m) {
    const old = el.thread.querySelector(`.msg[data-id="${m.id}"]`);
    if (old) old.replaceWith(msgNode(m));
  }

  /* 스크롤: 바닥 근처면 따라 내려가고, 위로 올렸으면 '맨 아래로' 버튼을 보여준다. */
  const nearBottom = () => el.scroll.scrollHeight - el.scroll.scrollTop - el.scroll.clientHeight < 80;
  const toBottom = (smooth) => el.scroll.scrollTo({ top: el.scroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  el.scroll.addEventListener('scroll', () => { el.toBottom.hidden = nearBottom() || body.classList.contains('is-empty'); }, { passive: true });

  /* ================= 대화 열기 / 새 대화 ================= */
  function openConv(id) {
    if (S.busy) stop();
    const c = Store.get(id);
    if (!c) return;
    S.conv = c; S.editing = null;
    renderChrome(); renderSidebar(); renderThread();
    requestAnimationFrame(() => toBottom(false));
    closeNav();
    try { history.replaceState(null, '', '#' + id); } catch (_) {}
  }
  function newChat() {
    if (S.busy) stop();
    S.conv = null; S.editing = null;
    clearAttachments();
    renderChrome(); renderSidebar(); renderThread();
    el.input.value = ''; syncInput();
    closeNav(); closePanel();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
    el.input.focus();
  }

  /* ================= 입력창 ================= */
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'; }
  function syncInput() {
    autosize(el.input);
    el.send.disabled = !S.busy && !el.input.value.trim() && !S.attachments.length;
    el.send.setAttribute('aria-label', S.busy ? '응답 중지' : '보내기');
  }
  el.input.addEventListener('input', syncInput);
  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (!S.busy) submit();
    }
    // 빈 입력창에서 ↑ : 마지막 내 메시지 수정
    if (e.key === 'ArrowUp' && !el.input.value && S.conv && !S.busy) {
      const lastUser = [...S.conv.messages].reverse().find((m) => m.role === 'user');
      if (lastUser) { e.preventDefault(); startEdit(lastUser.id); }
    }
  });
  el.composer.addEventListener('submit', (e) => { e.preventDefault(); S.busy ? stop() : submit(); });

  /* ================= 이미지 첨부 ================= */
  const OK_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  /** 긴 변 1568px 이하로 줄여 저장 공간과 토큰을 아낀다 (Claude 권장 크기). */
  function readImage(file) {
    return new Promise((resolve, reject) => {
      if (!OK_TYPES.includes(file.type)) return reject(new Error('PNG, JPG, GIF, WEBP 이미지만 올릴 수 있어요.'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('이미지를 읽지 못했어요.'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('이미지를 열지 못했어요.'));
        img.onload = () => {
          const MAX = 1568;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          if (scale === 1 && file.size < 1.5e6 && file.type !== 'image/gif') {
            return resolve({ name: file.name, mediaType: file.type, data: String(fr.result).split(',')[1] });
          }
          if (file.type === 'image/gif' && scale === 1) return resolve({ name: file.name, mediaType: file.type, data: String(fr.result).split(',')[1] });
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const url = cv.toDataURL(type, 0.86);
          resolve({ name: file.name, mediaType: type, data: url.split(',')[1] });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  async function addFiles(files) {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) { if (files.length) toast('이미지 파일만 첨부할 수 있어요.'); return; }
    for (const f of imgs) {
      if (S.attachments.length >= MAX_ATTACH) { toast(`이미지는 한 번에 ${MAX_ATTACH}장까지 보낼 수 있어요.`); break; }
      try { S.attachments.push(await readImage(f)); } catch (e) { toast(e.message); }
    }
    renderAttachments(); syncInput(); el.input.focus();
  }
  function renderAttachments() {
    el.attachList.hidden = !S.attachments.length;
    el.attachList.innerHTML = S.attachments.map((a, i) => `<div class="attach"><img src="data:${a.mediaType};base64,${a.data}" alt="${esc(a.name)}"><button type="button" data-action="detach" data-i="${i}" aria-label="${esc(a.name)} 빼기">${I.x}</button></div>`).join('');
  }
  function clearAttachments() { S.attachments = []; renderAttachments(); }
  el.file.addEventListener('change', () => { addFiles(el.file.files); el.file.value = ''; });
  el.input.addEventListener('paste', (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) { e.preventDefault(); addFiles(files); }
  });
  let dragDepth = 0;
  const main = $('#main');
  main.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; el.composer.classList.add('is-drop'); } });
  main.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; el.composer.classList.remove('is-drop'); } });
  main.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  main.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault(); dragDepth = 0; el.composer.classList.remove('is-drop');
    addFiles(e.dataTransfer.files);
  });

  /* ================= 대화 흐름 ================= */
  function titleFrom(text) {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length > 30 ? t.slice(0, 30) + '…' : t || '이미지 질문';
  }
  function saveConv(opts) {
    const r = Store.commit(S.conv, opts);
    if (r === 'trimmed') toast('저장 공간이 부족해 오래된 대화의 이미지를 지웠어요.');
    if (r === 'failed') toast('저장 공간이 가득 차서 이 대화를 저장하지 못했어요.');
  }

  function submit() {
    const text = el.input.value.trim();
    if ((!text && !S.attachments.length) || S.busy) return;
    if (!S.conv) {
      S.conv = Store.create();
      try { history.replaceState(null, '', '#' + S.conv.id); } catch (_) {}
    }
    const c = S.conv;
    c.messages.push({ id: Store.uid(), role: 'user', content: text, images: S.attachments.slice(), at: Date.now() });
    if (!c.title) c.title = titleFrom(text);
    el.input.value = ''; clearAttachments(); syncInput();
    saveConv();
    renderChrome(); renderSidebar(); renderThread();
    toBottom(false);
    generate();
  }

  async function generate() {
    const c = S.conv;
    const st = Store.settings;
    const m = { id: Store.uid(), role: 'assistant', content: '', model: API.isLive(st) ? st.model : 'demo', pending: true, at: Date.now() };
    c.messages.push(m);
    el.thread.appendChild(msgNode(m));
    toBottom(false);
    S.busy = true; body.classList.add('is-busy'); syncInput();
    el.thread.setAttribute('aria-busy', 'true');
    const ctrl = new AbortController(); S.abort = ctrl;

    let frame = 0;
    const paint = () => {
      frame = 0;
      if (S.conv !== c) return;
      const node = el.thread.querySelector(`.msg[data-id="${m.id}"] .ai__body`);
      if (!node) return;
      const stick = nearBottom();
      node.innerHTML = aiBodyHTML(m);
      if (stick) toBottom(false);
    };
    const tick = setInterval(() => { if (m.thinkStart && !m.content && !frame) frame = requestAnimationFrame(paint); }, 1000);
    try {
      for await (const ev of API.respond({ settings: st, messages: c.messages.slice(0, -1), signal: ctrl.signal })) {
        if (ev.type === 'thinking') { if (!m.thinkStart) m.thinkStart = Date.now(); m.thinking = (m.thinking || '') + ev.text; if (!frame) frame = requestAnimationFrame(paint); }
        if (ev.type === 'text') {
          if (m.thinkStart && !m.thinkMs) m.thinkMs = Date.now() - m.thinkStart;
          m.content += ev.text; if (!frame) frame = requestAnimationFrame(paint);
        }
        if (ev.type === 'done') {
          if (ev.model && ev.model !== 'demo') m.model = ev.model;
          if (ev.stopReason === 'refusal') m.error = '이 요청에는 답변할 수 없어요. 질문을 바꿔서 다시 물어봐 주세요.';
          if (ev.stopReason === 'max_tokens') m.truncated = true;
        }
      }
    } catch (e) {
      const f = e.friendly || { message: '알 수 없는 오류가 발생했어요. 다시 시도해 주세요.' };
      if (f.aborted) m.stopped = true;
      else { m.error = f.message; if (f.fix) m.fix = f.fix; }
    }
    cancelAnimationFrame(frame); clearInterval(tick);
    if (m.thinkStart && !m.thinkMs) m.thinkMs = Date.now() - m.thinkStart;
    delete m.thinkStart;
    delete m.pending;
    S.busy = false; S.abort = null;
    body.classList.remove('is-busy'); syncInput();
    el.thread.removeAttribute('aria-busy');
    saveConv();
    if (S.conv === c) { const stick = nearBottom(); rerenderMsg(m); if (stick) toBottom(false); }
    renderSidebar();
  }
  function stop() { if (S.abort) S.abort.abort(); }

  function regenerate(msgId) {
    if (S.busy || !S.conv) return;
    const i = S.conv.messages.findIndex((m) => m.id === msgId);
    if (i < 0) return;
    S.conv.messages.splice(i);
    saveConv();
    renderThread();
    generate();
  }
  function startEdit(msgId) { S.editing = msgId; renderThread(); }
  function finishEdit(msgId, text) {
    const i = S.conv.messages.findIndex((m) => m.id === msgId);
    if (i < 0) return;
    const m = S.conv.messages[i];
    S.editing = null;
    if (!text.trim() && !(m.images || []).length) { renderThread(); return; }
    m.content = text.trim();
    S.conv.messages.splice(i + 1);
    saveConv(); renderThread(); toBottom(false);
    generate();
  }

  /* ================= 결과물 미리보기 패널 ================= */
  function openPanel(code, lang) {
    S.panel = { code, lang };
    const doc = lang === 'svg' ? `<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh">${code}</body>` : code;
    el.panelTitle.textContent = (code.match(/<title>([^<]{1,60})<\/title>/i) || [])[1] || '미리보기';
    el.panelSub.textContent = `${lang.toUpperCase()} · ${code.split('\n').length}줄`;
    el.panel.hidden = false; body.classList.add('panel-open');
    setPanelTab('preview', doc);
  }
  function setPanelTab(tab, doc) {
    $$('#panel [data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    if (tab === 'preview') {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
      f.setAttribute('title', '미리보기');
      f.srcdoc = doc || (S.panel.lang === 'svg' ? `<!doctype html><body style="margin:0;display:grid;place-items:center;min-height:100vh">${S.panel.code}</body>` : S.panel.code);
      el.panelBody.replaceChildren(f);
    } else {
      el.panelBody.innerHTML = `<pre class="panel__code"><code>${esc(S.panel.code)}</code></pre>`;
    }
  }
  function closePanel() { S.panel = null; el.panel.hidden = true; body.classList.remove('panel-open'); el.panelBody.replaceChildren(); }

  /* ================= 시트: 모델 / 설정 ================= */
  function openModelSheet() {
    const st = Store.settings;
    const live = API.isLive(st);
    const { box, close } = openLayer('sheet', `<h2>어떤 모아와 대화할까요?</h2><p class="sheet__lead">${live ? '언제든 바꿀 수 있어요' : '데모 모드에서는 모델과 상관없이 준비된 답변이 나와요'}</p>` +
      '<div role="radiogroup" aria-label="모델">' + API.MODELS.map((m, i) => `<button class="opt" role="radio" data-model="${m.id}" aria-checked="${m.id === st.model}"><span class="tile" style="background:${['var(--t-purple)', 'var(--blue-weak)', 'var(--t-green)'][i]}">${['🧠', '⚡️', '🍃'][i]}</span><span><b>${esc(m.name)}</b><small>${esc(m.desc)}</small></span><span class="radio"></span></button>`).join('') + '</div>', { label: '모델 선택' });
    box.addEventListener('click', (e) => {
      const o = e.target.closest('[data-model]'); if (!o) return;
      Store.saveSettings({ model: o.dataset.model });
      close(); toast(`${API.modelInfo(o.dataset.model).name}(으)로 바꿨어요`);
    });
  }

  function openSettings() {
    const st = Store.settings;
    const effort = [['low', '빠르게'], ['medium', '균형'], ['high', '깊게']];
    const theme = [['system', '시스템'], ['light', '라이트'], ['dark', '다크']];
    const seg = (name, opts, cur) => `<div class="seg seg--full" role="radiogroup" aria-label="${name}">${opts.map(([v, l]) => `<button type="button" role="radio" data-seg="${name}" data-v="${v}" aria-checked="${v === cur}">${l}</button>`).join('')}</div>`;
    const { box, close } = openLayer('sheet', `<form id="settings-form"><h2>설정</h2><p class="sheet__lead">모든 설정과 대화는 이 브라우저에만 저장돼요</p>
      <label class="field"><span class="field__label">이름</span><input class="input" id="set-name" maxlength="20" value="${esc(st.name)}" placeholder="인사말에 쓸 이름" autocomplete="nickname"></label>
      <div class="field"><label class="field__label" for="set-key">Anthropic API 키 <small>${API.isLive(st) ? '연결됨' : '없으면 데모 모드'}</small></label>
        <div class="input-wrap"><input class="input" id="set-key" type="password" value="${esc(st.apiKey)}" placeholder="sk-ant-..." autocomplete="off" spellcheck="false"><button type="button" data-toggle-key>보기</button></div>
        <p class="hint">키는 이 브라우저에만 저장되고 Anthropic API로만 전송돼요. 개인용으로만 쓰고, 여러 사람이 쓰는 서비스라면 키를 서버에 두세요. 키는 <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer">Claude Console</a>에서 만들 수 있어요.</p></div>
      <div class="field"><span class="field__label">답변 깊이 <small>Haiku에는 적용되지 않아요</small></span>${seg('effort', effort, st.effort)}</div>
      <label class="field"><span class="field__label">맞춤 지침 <small>모든 대화에 적용</small></span><textarea class="input" id="set-system" maxlength="4000" placeholder="예) 항상 존댓말로, 핵심부터 짧게 답해줘">${esc(st.system)}</textarea></label>
      <div class="field"><span class="field__label">화면 테마</span>${seg('theme', theme, st.theme)}</div>
      <div class="sheet__foot"><button type="button" class="btn" data-close-sheet>닫기</button><button class="btn btn--blue">저장하기</button></div>
      <button type="button" class="danger-link" data-clear-all>모든 대화 삭제</button></form>`, { label: '설정' });
    box.addEventListener('click', async (e) => {
      const s = e.target.closest('[data-seg]');
      if (s) $$(`[data-seg="${s.dataset.seg}"]`, box).forEach((b) => b.setAttribute('aria-checked', String(b === s)));
      if (e.target.closest('[data-toggle-key]')) {
        const k = $('#set-key', box); const show = k.type === 'password';
        k.type = show ? 'text' : 'password'; e.target.textContent = show ? '숨기기' : '보기';
      }
      if (e.target.closest('[data-close-sheet]')) close();
      if (e.target.closest('[data-clear-all]')) {
        close();
        if (await confirmDialog({ title: '모든 대화를 삭제할까요?', text: '삭제한 대화는 되돌릴 수 없어요.', ok: '모두 삭제', danger: true })) {
          Store.clearAll(); newChat(); toast('모든 대화를 삭제했어요');
        }
      }
    });
    $('#settings-form', box).addEventListener('submit', (e) => {
      e.preventDefault();
      const get = (n) => ($(`[data-seg="${n}"][aria-checked="true"]`, box) || {}).dataset?.v;
      const wasLive = API.isLive(Store.settings);
      Store.saveSettings({
        name: $('#set-name', box).value.trim(),
        apiKey: $('#set-key', box).value.trim(),
        system: $('#set-system', box).value,
        effort: get('effort') || 'medium',
        theme: get('theme') || 'system',
      });
      close();
      const live = API.isLive(Store.settings);
      toast(live && !wasLive ? 'Claude에 연결했어요' : !live && wasLive ? '데모 모드로 바꿨어요' : '설정을 저장했어요');
    });
  }

  /* ================= 대화 메뉴 (이름 변경 · 고정 · 내보내기 · 삭제) ================= */
  function openConvMenu(id, anchor) {
    const c = Store.get(id); if (!c) return;
    const { box, close } = openLayer('menu', `<button role="menuitem" data-m="rename">${I.edit}이름 바꾸기</button><button role="menuitem" data-m="pin"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 3h6l-1 5 3 3H5l3-3zM10 11v6"/></svg>${c.pinned ? '고정 해제' : '맨 위에 고정'}</button><button role="menuitem" data-m="export"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 3v10M6 9l4 4 4-4M4 16h12"/></svg>마크다운으로 저장</button><button role="menuitem" class="is-danger" data-m="delete"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>삭제</button>`, { anchor, label: '대화 메뉴' });
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      close();
      if (b.dataset.m === 'rename') {
        const t = await promptDialog({ title: '대화 이름 바꾸기', value: c.title });
        if (t) { Store.rename(id, t); renderChrome(); toast('이름을 바꿨어요'); }
      }
      if (b.dataset.m === 'pin') { Store.togglePin(id); toast(c.pinned ? '맨 위에 고정했어요' : '고정을 해제했어요'); }
      if (b.dataset.m === 'export') {
        const blob = new Blob([Store.exportMarkdown(c)], { type: 'text/markdown;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `${(c.title || '대화').replace(/[\\/:*?"<>|]/g, '_')}.md`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
      if (b.dataset.m === 'delete') {
        if (await confirmDialog({ title: '대화를 삭제할까요?', text: `“${c.title || '새 대화'}”을(를) 삭제하면 되돌릴 수 없어요.`, ok: '삭제', danger: true })) {
          const wasCurrent = S.conv && S.conv.id === id;
          Store.remove(id);
          if (wasCurrent) newChat();
          toast('대화를 삭제했어요');
        }
      }
    });
  }

  /* ================= 사이드바 열고 닫기 ================= */
  function toggleNav() { if (mobileMQ.matches) body.classList.toggle('nav-open'); else body.classList.toggle('nav-collapsed'); }
  function closeNav() { body.classList.remove('nav-open'); }

  /* ================= 이벤트 위임 ================= */
  document.addEventListener('click', async (e) => {
    const sug = e.target.closest('[data-suggest]');
    if (sug) { el.input.value = sug.dataset.suggest; syncInput(); el.input.focus(); el.input.setSelectionRange(el.input.value.length, el.input.value.length); return; }
    const tab = e.target.closest('#panel [data-tab]');
    if (tab && S.panel) { setPanelTab(tab.dataset.tab); return; }
    const pv = e.target.closest('[data-preview]');
    if (pv) { const cb = pv.closest('.codeblock'); openPanel(cb.querySelector('code').textContent, cb.dataset.lang); return; }
    const cc = e.target.closest('[data-copy-code]');
    if (cc) { const ok = await copyText(cc.closest('.codeblock').querySelector('code').textContent); cc.textContent = ok ? '복사됨' : '복사 실패'; setTimeout(() => (cc.textContent = '복사'), 1400); return; }

    const a = e.target.closest('[data-action]');
    if (!a) return;
    const msgEl = a.closest('.msg');
    const msg = msgEl && S.conv ? S.conv.messages.find((m) => m.id === msgEl.dataset.id) : null;
    switch (a.dataset.action) {
      case 'new-chat': newChat(); break;
      case 'open': openConv(a.dataset.id); break;
      case 'conv-more': openConvMenu(a.dataset.id, a); break;
      case 'conv-menu': if (S.conv) openConvMenu(S.conv.id, a); break;
      case 'rename-current': if (S.conv) { const t = await promptDialog({ title: '대화 이름 바꾸기', value: S.conv.title }); if (t) { Store.rename(S.conv.id, t); renderChrome(); } } break;
      case 'toggle-nav': toggleNav(); break;
      case 'close-nav': closeNav(); break;
      case 'settings': openSettings(); break;
      case 'model': openModelSheet(); break;
      case 'attach': el.file.click(); break;
      case 'detach': S.attachments.splice(+a.dataset.i, 1); renderAttachments(); syncInput(); break;
      case 'to-bottom': toBottom(true); break;
      case 'panel-close': closePanel(); break;
      case 'panel-copy': if (S.panel) { toast((await copyText(S.panel.code)) ? '코드를 복사했어요' : '복사하지 못했어요'); } break;
      case 'copy-msg': if (msg) { const ok = await copyText(msg.content); a.innerHTML = ok ? I.check : I.copy; setTimeout(() => (a.innerHTML = I.copy), 1400); } break;
      case 'edit-msg': if (msg && !S.busy) startEdit(msg.id); break;
      case 'edit-cancel': S.editing = null; renderThread(); break;
      case 'retry': if (msg && !S.busy) regenerate(msg.id); break;
      case 'feedback':
        if (msg) {
          msg.feedback = msg.feedback === a.dataset.v ? null : a.dataset.v;
          saveConv({ touch: false }); rerenderMsg(msg);
          if (msg.feedback) toast('의견을 남겨 주셔서 고마워요');
        }
        break;
    }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-edit-form]');
    if (!f) return;
    e.preventDefault();
    finishEdit(f.dataset.editForm, f.querySelector('textarea').value);
  });
  document.addEventListener('keydown', (e) => {
    const ta = e.target.closest && e.target.closest('[data-edit-form] textarea');
    if (ta && e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); ta.form.requestSubmit(); return; }
    if (ta && e.key === 'Escape') { S.editing = null; renderThread(); el.input.focus(); return; }
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); if (mobileMQ.matches) body.classList.add('nav-open'); else body.classList.remove('nav-collapsed'); el.search.focus(); el.search.select(); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); newChat(); return; }
    if (e.key === 'Escape') {
      if (layers.length) { layers[layers.length - 1](); return; }
      if (S.busy && document.activeElement === el.input) { stop(); return; }
      if (S.panel) { closePanel(); return; }
      if (body.classList.contains('nav-open')) { closeNav(); return; }
    }
  });
  document.addEventListener('input', (e) => { if (e.target.matches('[data-edit-form] textarea')) autosize(e.target); });
  el.search.addEventListener('input', () => { S.query = el.search.value.trim(); renderSidebar(); });
  el.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = $('.conv__link', el.convs); if (first) first.click(); }
    if (e.key === 'Escape') { el.search.value = ''; S.query = ''; renderSidebar(); el.input.focus(); }
  });
  $('.cta').title = `새 대화 (${isMac ? '⌘' : 'Ctrl'}+Shift+O)`;
  el.search.placeholder = matchMedia('(pointer: fine)').matches ? `대화 검색  (${isMac ? '⌘' : 'Ctrl'} K)` : '대화 검색';

  Store.on((what) => { if (what === 'settings') renderChrome(); if (what === 'convs') renderSidebar(); });
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('moa.')) location.reload(); });

  /* ================= 시작 ================= */
  // 답변 도중 창이 닫혔던 메시지는 '중지됨'으로 정리
  for (const c of Store.list()) for (const m of c.messages) if (m.pending) { delete m.pending; m.stopped = true; }
  const startId = location.hash.slice(1);
  if (startId && Store.get(startId)) openConv(startId);
  else { renderChrome(); renderSidebar(); renderThread(); }
  syncInput();
  if (!mobileMQ.matches) el.input.focus();

  window.Moa = { openPanel, toast, state: S };
})();
