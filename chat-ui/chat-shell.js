/*
 * chat-shell.js — 채팅형 AI 사이트 공용 껍데기 스크립트
 * 세 가지 시안(A/B/C)이 같은 data-* 훅을 공유하고, 마크업/스타일만 다르다.
 *
 *  [data-thread]          메시지가 쌓이는 컨테이너
 *  [data-scroll]          스크롤 영역 (없으면 thread)
 *  [data-input]           textarea
 *  [data-send]            전송/중지 버튼
 *  [data-suggest]         추천 칩 (data-suggest 값 또는 텍스트를 입력창에 채움)
 *  [data-new-chat]        새 대화
 *  [data-recents]         최근 대화 목록 (ul)
 *  [data-nav-toggle]      사이드바 열기/접기,  [data-scrim] 모바일 배경막
 *  [data-model-menu]      모델 선택 버튼, [data-model-pop] 팝오버, [data-model] 항목, [data-model-label]
 *  [data-theme-toggle]    라이트/다크 전환
 *  [data-greeting]        시간대별 인사말 (data-name 사용)
 *  <template data-ai-avatar>  AI 아바타 마크업
 *
 * 실제 API 연결:  ChatShell.setResponder(async function* (text, history) { yield '토큰'; })
 */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ICON = {
    copy: '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></svg>',
    check: '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 10.5l4 4 8-9"/></svg>',
    retry: '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M16 10a6 6 0 1 1-1.8-4.3M16 3v4h-4"/></svg>',
    up: '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 9v8H3V9h3zm0 0 4-6c1.2 0 2 .9 2 2v3h4.2a1.5 1.5 0 0 1 1.5 1.8l-1.2 6A1.5 1.5 0 0 1 15 17H6"/></svg>',
    down: '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 11V3H3v8h3zm0 0 4 6c1.2 0 2-.9 2-2v-3h4.2a1.5 1.5 0 0 0 1.5-1.8l-1.2-6A1.5 1.5 0 0 0 15 3H6"/></svg>',
  };

  /* ---------- 아주 작은 마크다운 렌더러 (스트리밍 중 부분 텍스트도 렌더 가능) ---------- */
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
  function md(src) {
    return src.split('```').map((b, i) => {
      if (i % 2) {
        const nl = b.indexOf('\n');
        const lang = nl < 0 ? b : b.slice(0, nl).trim();
        const code = nl < 0 ? '' : b.slice(nl + 1).replace(/\n$/, '');
        return `<pre class="codeblock"><div class="codeblock__head"><span>${esc(lang || 'code')}</span><button type="button" class="codeblock__copy" data-copy-code>복사</button></div><code>${esc(code)}</code></pre>`;
      }
      return b.split(/\n{2,}/).map((p) => {
        p = p.trim();
        if (!p) return '';
        const lines = p.split('\n');
        if (lines.every((l) => /^[-*] /.test(l))) return '<ul>' + lines.map((l) => '<li>' + inline(l.slice(2)) + '</li>').join('') + '</ul>';
        if (lines.every((l) => /^\d+\. /.test(l))) return '<ol>' + lines.map((l) => '<li>' + inline(l.replace(/^\d+\. /, '')) + '</li>').join('') + '</ol>';
        if (/^### /.test(p)) return '<h3>' + inline(p.slice(4)) + '</h3>';
        return '<p>' + lines.map(inline).join('<br>') + '</p>';
      }).join('');
    }).join('');
  }

  /* ---------- 기본 응답기 (데모용). 실제 서비스에서는 setResponder 로 교체 ---------- */
  const CANNED = [
    {
      match: /코드|html|css|js|자바스크립트|함수|버튼/i,
      text: '좋아요. 채팅 입력창에서 **Enter는 전송, Shift+Enter는 줄바꿈**으로 처리하는 예시예요. 한글 입력 중(조합 중)에 전송되지 않도록 `isComposing`을 꼭 확인해야 합니다.\n\n```js\ntextarea.addEventListener(\'keydown\', (e) => {\n  if (e.key === \'Enter\' && !e.shiftKey && !e.isComposing) {\n    e.preventDefault();\n    send(textarea.value);\n  }\n});\n```\n\n- 입력창 높이는 `scrollHeight`로 자동 조절\n- 응답 생성 중에는 전송 버튼을 **중지** 버튼으로 전환\n- 스트리밍 토큰은 마크다운으로 다시 렌더링',
    },
    {
      match: /요약|정리|회의|메일/i,
      text: '요약해 드릴게요.\n\n### 핵심 3줄\n1. 다음 분기 목표는 신규 가입 전환율 12% 개선입니다.\n2. 온보딩 단계를 5단계에서 3단계로 줄이기로 했어요.\n3. 디자인 시안은 금요일까지 공유합니다.\n\n후속으로 담당자별 할 일 목록도 만들어 드릴까요?',
    },
    {
      match: /여행|일정|맛집|추천/i,
      text: '부산 1박 2일 일정을 짜봤어요.\n\n### 1일차\n- 오전: 해운대 → 동백섬 산책\n- 점심: 밀면\n- 오후: 광안리 카페, 저녁엔 광안대교 야경\n\n### 2일차\n- 오전: 감천문화마을\n- 점심: 자갈치시장 회센터\n\n이동은 지하철 2호선 위주로 잡았어요. 숙소 위치를 알려주시면 동선을 다시 맞춰 드릴게요.',
    },
    {
      match: /.*/,
      text: '네, 도와드릴게요. 지금은 **데모 응답**이 나가고 있어요. `chat-shell.js`의 `ChatShell.setResponder()`에 실제 API 스트리밍 함수를 연결하면 이 자리에 모델 응답이 표시됩니다.\n\n원하시면 다음 중 하나를 이어서 해볼 수 있어요.\n- 대화 목록을 서버에 저장하기\n- 파일 첨부 업로드 처리\n- 응답 마크다운에 표·수식 렌더링 추가',
    },
  ];
  async function* defaultResponder(text) {
    await sleep(500);
    const t = CANNED.find((c) => c.match.test(text)).text;
    for (let i = 0; i < t.length; ) {
      const n = 2 + Math.floor(Math.random() * 4);
      yield t.slice(i, i + n);
      i += n;
      await sleep(16);
    }
  }

  const state = { responder: defaultResponder, busy: false, stop: false, history: [], started: false };

  function init() {
    const body = document.body;
    const thread = $('[data-thread]');
    const scroller = $('[data-scroll]') || thread;
    const input = $('[data-input]');
    const sendBtn = $('[data-send]');
    const recents = $('[data-recents]');
    if (!thread || !input) return;

    const isEmpty = () => !thread.querySelector('.msg');
    body.classList.toggle('is-empty', isEmpty());
    state.started = !isEmpty();

    /* 인사말 */
    $$('[data-greeting]').forEach((el) => {
      const h = new Date().getHours();
      const name = el.dataset.name || '';
      const g = h < 5 ? '늦은 밤이에요' : h < 11 ? '좋은 아침이에요' : h < 17 ? '좋은 오후예요' : '좋은 저녁이에요';
      el.textContent = name ? `${g}, ${name}님` : g;
    });

    /* 입력창 자동 높이 + 전송 버튼 상태 */
    const sync = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 240) + 'px';
      if (sendBtn) sendBtn.disabled = !state.busy && !input.value.trim();
    };
    input.addEventListener('input', sync);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    });
    sendBtn && sendBtn.addEventListener('click', () => (state.busy ? (state.stop = true) : submit()));
    sync();

    $$('[data-suggest]').forEach((el) =>
      el.addEventListener('click', () => {
        input.value = el.dataset.suggest || el.textContent.trim();
        sync();
        input.focus();
      })
    );

    /* 새 대화 */
    $$('[data-new-chat]').forEach((el) =>
      el.addEventListener('click', () => {
        if (state.busy) state.stop = true;
        thread.innerHTML = '';
        state.history = [];
        state.started = false;
        body.classList.add('is-empty');
        $$('[data-recents] .is-active').forEach((x) => x.classList.remove('is-active'));
        body.classList.remove('nav-open');
        document.dispatchEvent(new CustomEvent('chatshell:new'));
        input.value = '';
        sync();
        input.focus();
      })
    );

    /* 최근 대화 클릭 → 활성 표시 (데모) */
    recents && recents.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      $$('.is-active', recents).forEach((x) => x.classList.remove('is-active'));
      a.classList.add('is-active');
      body.classList.remove('nav-open');
    });

    /* 사이드바 */
    const mobile = window.matchMedia('(max-width: 860px)');
    $$('[data-nav-toggle]').forEach((el) =>
      el.addEventListener('click', () => {
        if (mobile.matches) body.classList.toggle('nav-open');
        else body.classList.toggle('nav-collapsed');
      })
    );
    $$('[data-scrim]').forEach((el) => el.addEventListener('click', () => body.classList.remove('nav-open')));

    /* 모델 선택 팝오버 */
    const menuBtn = $('[data-model-menu]');
    const pop = $('[data-model-pop]');
    if (menuBtn && pop) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pop.hidden = !pop.hidden;
        menuBtn.setAttribute('aria-expanded', String(!pop.hidden));
      });
      $$('[data-model]', pop).forEach((opt) =>
        opt.addEventListener('click', () => {
          $$('[data-model]', pop).forEach((o) => o.setAttribute('aria-checked', 'false'));
          opt.setAttribute('aria-checked', 'true');
          $$('[data-model-label]').forEach((l) => (l.textContent = opt.dataset.model));
          pop.hidden = true;
        })
      );
      document.addEventListener('click', (e) => {
        if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true;
      });
    }

    /* 테마 전환 */
    $$('[data-theme-toggle]').forEach((el) =>
      el.addEventListener('click', () => {
        const root = document.documentElement;
        const cur = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        root.dataset.theme = cur === 'dark' ? 'light' : 'dark';
      })
    );

    /* 복사 버튼 (메시지 / 코드블록) */
    thread.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-copy],[data-copy-code]');
      if (!btn) return;
      const src = btn.hasAttribute('data-copy-code')
        ? btn.closest('pre').querySelector('code').textContent
        : btn.closest('.msg').querySelector('.msg__body').innerText;
      try { await navigator.clipboard.writeText(src); } catch (_) { /* 클립보드 거부 시 무시 */ }
      const prev = btn.innerHTML;
      btn.innerHTML = btn.hasAttribute('data-copy-code') ? '복사됨' : ICON.check;
      setTimeout(() => (btn.innerHTML = prev), 1400);
    });
    thread.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-retry]');
      if (!btn || state.busy) return;
      const last = state.history.filter((h) => h.role === 'user').pop();
      if (last) respond(last.content, btn.closest('.msg'));
    });

    /* 메시지 DOM */
    function avatar(role) {
      if (role === 'user') {
        return `<div class="msg__avatar" aria-hidden="true">${esc(body.dataset.userInitial || '나')}</div>`;
      }
      const tpl = $('template[data-ai-avatar]');
      return `<div class="msg__avatar" aria-hidden="true">${tpl ? tpl.innerHTML : ''}</div>`;
    }
    function addMessage(role, html) {
      const el = document.createElement('div');
      el.className = `msg msg--${role === 'user' ? 'user' : 'ai'}`;
      el.innerHTML =
        avatar(role) +
        `<div class="msg__content"><div class="msg__body">${html}</div>` +
        (role === 'user'
          ? ''
          : `<div class="msg__actions">
               <button type="button" data-copy aria-label="복사">${ICON.copy}</button>
               <button type="button" data-retry aria-label="다시 생성">${ICON.retry}</button>
               <button type="button" aria-label="좋아요">${ICON.up}</button>
               <button type="button" aria-label="별로예요">${ICON.down}</button>
             </div>`) +
        `</div>`;
      thread.appendChild(el);
      return el;
    }
    const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    const toBottom = () => (scroller.scrollTop = scroller.scrollHeight);

    function addRecent(title) {
      if (!recents) return;
      $$('.is-active', recents).forEach((x) => x.classList.remove('is-active'));
      const li = document.createElement('li');
      li.innerHTML = `<a href="#" class="is-active">${esc(title)}</a>`;
      recents.prepend(li);
    }

    async function respond(text, replace) {
      state.busy = true;
      state.stop = false;
      body.classList.add('is-busy');
      sync();
      const el = replace || addMessage('ai', '');
      const out = el.querySelector('.msg__body');
      out.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
      el.classList.add('is-streaming');
      toBottom();
      let acc = '';
      try {
        for await (const chunk of state.responder(text, state.history.slice())) {
          if (state.stop) break;
          const stick = nearBottom();
          acc += chunk;
          out.innerHTML = md(acc);
          if (stick) toBottom();
        }
      } catch (err) {
        acc += '\n\n응답을 받지 못했어요. 네트워크 상태를 확인한 뒤 다시 생성을 눌러 주세요.';
        out.innerHTML = md(acc);
      }
      if (!acc) out.innerHTML = '<p class="msg__stopped">응답을 중지했어요.</p>';
      el.classList.remove('is-streaming');
      state.history.push({ role: 'assistant', content: acc });
      state.busy = false;
      body.classList.remove('is-busy');
      sync();
      document.dispatchEvent(new CustomEvent('chatshell:done', { detail: { text: acc, prompt: text, el } }));
    }

    async function submit(textArg) {
      const text = (textArg ?? input.value).trim();
      if (!text || state.busy) return;
      if (!state.started) {
        state.started = true;
        addRecent(text.length > 28 ? text.slice(0, 28) + '…' : text);
      }
      body.classList.remove('is-empty');
      addMessage('user', md(text));
      state.history.push({ role: 'user', content: text });
      input.value = '';
      sync();
      await respond(text);
    }

    window.ChatShell = {
      setResponder(fn) { state.responder = fn; },
      send: submit,
      md,
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
