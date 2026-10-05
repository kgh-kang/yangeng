/* 모아 앱 E2E 테스트 (Playwright, 별도 러너 없이 node로 실행)
 *
 *   cd chat-ui && python3 -m http.server 8765 &
 *   node tests/e2e.js                      # 데모 모드 + UI 테스트
 *   SDK_BUNDLE=/path/sdk.bundle.mjs node tests/e2e.js   # + 실제 SDK 경로(API는 가짜 서버로 대체)
 *
 * SDK_BUNDLE: @anthropic-ai/sdk 를 esbuild로 묶은 ESM 파일. CDN 요청을 이 파일로 대체해
 * 네트워크 없이도 공식 SDK의 스트리밍·오류 처리 경로를 검증한다. */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://localhost:8765/app/';
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
const SDK_BUNDLE = process.env.SDK_BUNDLE;
const results = [];

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 820 }, colorScheme: opts.colorScheme || 'light' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  // 외부 폰트는 테스트와 무관하므로 차단
  await page.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net\/gh\//, (r) => r.abort());
  if (opts.settings) await ctx.addInitScript((s) => localStorage.setItem('moa.settings.v1', JSON.stringify(s)), opts.settings);
  await page.goto(BASE);
  return page;
}
async function sendAndWait(page, text) {
  await page.fill('#input', text);
  await page.press('#input', 'Enter');
  await page.waitForFunction(() => !document.body.classList.contains('is-busy') && document.querySelector('.msg--ai:last-child .actions'), null, { timeout: 20000 });
}

function sse(events) {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}
function streamBody(text, stopReason = 'end_turn', model = 'claude-opus-5-5') {
  const chunks = text.match(/.{1,4}/gs) || [];
  return sse([
    { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...chunks.map((t) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: chunks.length } },
    { type: 'message_stop' },
  ]);
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
async function mockApi(page, handler) {
  await page.route(SDK_URL, (r) => r.fulfill({ status: 200, headers: { 'content-type': 'application/javascript', ...CORS }, body: fs.readFileSync(SDK_BUNDLE, 'utf8') }));
  const calls = [];
  await page.route('https://api.anthropic.com/**', async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const call = { body: JSON.parse(r.request().postData() || '{}'), headers: r.request().headers() };
    calls.push(call);
    const res = handler(call, calls.length);
    return r.fulfill({ status: res.status || 200, headers: { 'content-type': res.json ? 'application/json' : 'text/event-stream', ...CORS }, body: res.json ? JSON.stringify(res.json) : res.body });
  });
  return calls;
}

const tests = {
  async '빈 화면: 인사말·데모 안내·추천 질문이 보인다'(b) {
    const p = await newPage(b);
    assert(await p.isVisible('#welcome'), '환영 화면이 보여야 함');
    assert(await p.isVisible('#demo-notice'), '데모 안내가 보여야 함');
    assert((await p.$$('.row')).length === 4, '추천 질문 4개');
    assert(await p.isHidden('#to-bottom'), '빈 화면에서 맨 아래로 버튼은 숨김');
    assert(await p.isDisabled('#send'), '빈 입력이면 전송 비활성');
    assert(!p.errors.length, p.errors.join());
  },
  async '데모 대화: 전송 → 스트리밍 답변 → 목록·제목·저장'(b) {
    const p = await newPage(b);
    await sendAndWait(p, '회의록 요약해줘');
    assert((await p.textContent('.msg--user .bubble')).includes('회의록'), '내 메시지 표시');
    assert(await p.isVisible('.msg--ai table'), '표가 렌더링되어야 함');
    assert((await p.textContent('#title')).includes('회의록'), '제목 갱신');
    assert((await p.$$('.conv')).length === 1, '사이드바에 대화 1개');
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('moa.convs.v1')));
    assert(saved.length === 1 && saved[0].messages.length === 2, '대화가 저장되어야 함');
    assert(!saved[0].messages[1].pending, 'pending 플래그가 남으면 안 됨');
  },
  async 'Shift+Enter는 줄바꿈, Enter는 전송'(b) {
    const p = await newPage(b);
    await p.fill('#input', '첫 줄');
    await p.press('#input', 'Shift+Enter');
    await p.type('#input', '둘째 줄');
    assert((await p.inputValue('#input')).includes('\n'), '줄바꿈 들어가야 함');
    assert(!(await p.$('.msg')), '아직 전송되면 안 됨');
  },
  async '중지: 답변 도중 멈추면 부분 답변과 안내가 남는다'(b) {
    const p = await newPage(b);
    await p.fill('#input', '여행 일정 짜줘');
    await p.press('#input', 'Enter');
    await p.waitForSelector('.msg--ai .md');
    await p.click('#send');
    await p.waitForSelector('.msg--ai .note');
    assert((await p.textContent('.msg--ai .note')).includes('멈췄어요'), '중지 안내');
    assert(!(await p.evaluate(() => document.body.classList.contains('is-busy'))), 'busy 해제');
  },
  async '다시 생성 / 수정: 이후 메시지를 정리하고 새로 답한다'(b) {
    const p = await newPage(b);
    await sendAndWait(p, '저축 계획 세워줘');
    await p.click('.msg--ai [data-action="retry"]');
    await p.waitForFunction(() => !document.body.classList.contains('is-busy') && document.querySelector('.msg--ai .actions'));
    assert((await p.$$('.msg')).length === 2, '다시 생성 후에도 메시지 2개');
    await p.hover('.msg--user');
    await p.click('.msg--user [data-action="edit-msg"]');
    await p.fill('[data-edit-form] textarea', 'HTML 카드 만들어줘');
    await p.press('[data-edit-form] textarea', 'Enter');
    await p.waitForFunction(() => !document.body.classList.contains('is-busy') && document.querySelector('.msg--ai .actions'));
    assert((await p.$$('.msg')).length === 2, '수정 후 메시지 2개');
    assert((await p.textContent('.msg--user .bubble')).includes('HTML'), '수정된 내용');
    assert(await p.isVisible('.msg--ai [data-preview]'), '새 답변(HTML) 표시');
  },
  async '미리보기 패널: 열기 · 코드 탭 · Esc로 닫기'(b) {
    const p = await newPage(b);
    await sendAndWait(p, 'HTML 카드 만들어줘');
    await p.click('[data-preview]');
    await p.waitForSelector('#panel iframe', { state: 'visible', timeout: 3000 });
    assert((await p.getAttribute('#panel iframe', 'sandbox')).includes('allow-scripts'), 'sandbox 적용');
    const frame = p.frame({ url: /about:srcdoc/ }) || p.frames()[1];
    await frame.waitForSelector('button');
    await p.click('#panel [data-tab="code"]');
    assert((await p.textContent('.panel__code')).includes('<button'), '코드 탭');
    await p.click('#input');
    await p.keyboard.press('Escape');
    assert(await p.isHidden('#panel'), 'Esc로 닫힘');
  },
  async '새로고침해도 대화가 유지되고 주소(#id)로 다시 열린다'(b) {
    const p = await newPage(b);
    await sendAndWait(p, '안녕');
    const hash = await p.evaluate(() => location.hash);
    assert(hash.length > 2, '해시에 대화 id');
    await p.reload();
    assert((await p.$$('.msg')).length === 2, '새로고침 후 메시지 유지');
    await p.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+O' : 'Control+Shift+O');
    assert(await p.isVisible('#welcome'), '단축키로 새 대화');
  },
  async '검색 · 이름 바꾸기 · 고정 · 삭제'(b) {
    const p = await newPage(b);
    await sendAndWait(p, '부산 여행 일정');
    await p.click('[data-action="new-chat"]');
    await sendAndWait(p, '저축 계획');
    await p.fill('#search', '부산');
    assert((await p.$$('.conv')).length === 1, '검색 필터');
    await p.fill('#search', '없는검색어');
    assert(await p.isVisible('.empty-list'), '검색 결과 없음 안내');
    await p.fill('#search', '');
    await p.click('.conv.is-active [data-action="conv-more"]', { force: true });
    await p.click('[data-m="rename"]');
    await p.fill('#dlg-input', '내 저축 계획');
    await p.press('#dlg-input', 'Enter');
    assert((await p.textContent('#title')) === '내 저축 계획', '이름 변경');
    await p.click('[data-action="conv-menu"]');
    await p.click('[data-m="pin"]');
    assert((await p.textContent('.group')) === '고정됨', '고정 그룹');
    await p.click('[data-action="conv-menu"]');
    await p.click('[data-m="delete"]');
    await p.click('.dialog [data-yes]');
    assert((await p.$$('.conv')).length === 1, '삭제 후 1개');
    assert(await p.isVisible('#welcome'), '현재 대화 삭제 시 새 대화');
  },
  async '설정: 이름·테마 저장, 인사말과 테마에 반영'(b) {
    const p = await newPage(b);
    await p.click('.me');
    await p.fill('#set-name', '지현');
    await p.click('[data-seg="theme"][data-v="dark"]');
    await p.click('#settings-form .btn--blue');
    assert((await p.textContent('#greeting')).includes('지현님'), '인사말 반영');
    assert((await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark', '다크 테마');
    await p.reload();
    assert((await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark', '새로고침 후에도 다크');
  },
  async '이미지 첨부: 미리보기 → 전송 → 말풍선 위에 표시'(b) {
    const p = await newPage(b);
    // 1x1 PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    await p.setInputFiles('#file', { name: 'dot.png', mimeType: 'image/png', buffer: png });
    await p.waitForSelector('.attach img');
    assert(!(await p.isDisabled('#send')), '이미지만 있어도 전송 가능');
    await p.click('#send');
    await p.waitForFunction(() => !document.body.classList.contains('is-busy') && document.querySelector('.msg--ai .actions'));
    assert(await p.isVisible('.msg--user .imgs img'), '보낸 이미지 표시');
    assert(await p.isHidden('#attach-list'), '첨부 목록 비움');
  },
  async '모바일: 가로 넘침 없음 · 메뉴 서랍 열고 닫기'(b) {
    const p = await newPage(b, { viewport: { width: 390, height: 844 } });
    await sendAndWait(p, '월급 300 저축 계획');
    const ow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(ow <= 0, `가로 넘침 ${ow}px`);
    await p.click('.head [data-action="toggle-nav"]');
    await p.waitForTimeout(300);
    const x = await p.evaluate(() => document.querySelector('#side').getBoundingClientRect().x);
    assert(x >= 0, '서랍 열림');
    await p.mouse.click(380, 400);
    await p.waitForTimeout(300);
    assert((await p.evaluate(() => document.querySelector('#side').getBoundingClientRect().right)) <= 1, '배경 눌러 닫힘');
  },
};

const liveTests = {
  async '실제 SDK: 요청 형식(모델·effort·fallbacks·브라우저 헤더)과 스트리밍 표시'(b) {
    const p = await newPage(b, { settings: { apiKey: 'sk-ant-test', model: 'claude-opus-5-5', effort: 'high', system: '존댓말로 답해줘' } });
    const calls = await mockApi(p, () => ({ body: streamBody('안녕하세요! **Claude**가 답하고 있어요.\n\n- 하나\n- 둘') }));
    assert(await p.isHidden('#demo-notice'), '키가 있으면 데모 안내 숨김');
    await sendAndWait(p, '안녕?');
    const c = calls[0];
    assert(c.body.model === 'claude-opus-5-5', 'model');
    assert(c.body.output_config && c.body.output_config.effort === 'high', 'effort');
    assert(c.body.fallbacks === 'default', 'fallbacks');
    assert((c.headers['anthropic-beta'] || '').includes('server-side-fallback-2026-07-01'), 'beta 헤더');
    assert(c.headers['anthropic-dangerous-direct-browser-access'] === 'true', '브라우저 헤더');
    assert(c.headers['x-api-key'] === 'sk-ant-test', 'API 키');
    assert(c.body.system === '존댓말로 답해줘', 'system');
    assert(c.body.stream === true, 'stream');
    assert(c.body.messages.length === 1 && c.body.messages[0].role === 'user', 'messages');
    assert((await p.textContent('.msg--ai .md strong')) === 'Claude', '마크다운 렌더');
    assert((await p.textContent('.msg--ai .ai__head')).includes('모아 깊게'), '모델 라벨');
    // 두 번째 턴: 이전 대화가 함께 전달되는지
    await sendAndWait(p, '고마워');
    assert(calls[1].body.messages.length === 3, '이전 대화 포함');
    assert(calls[1].body.messages[1].role === 'assistant', '역할 교대');
  },
  async '실제 SDK: Haiku는 effort·fallbacks 없이 보낸다'(b) {
    const p = await newPage(b, { settings: { apiKey: 'sk-ant-test', model: 'claude-haiku-4-5' } });
    const calls = await mockApi(p, () => ({ body: streamBody('네.', 'end_turn', 'claude-haiku-4-5') }));
    await sendAndWait(p, '짧게');
    assert(!calls[0].body.output_config, 'effort 없음');
    assert(!calls[0].body.fallbacks, 'fallbacks 없음');
  },
  async '실제 SDK: 잘못된 키(401)면 안내와 설정 버튼'(b) {
    const p = await newPage(b, { settings: { apiKey: 'sk-ant-wrong' } });
    await mockApi(p, () => ({ status: 401, json: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } }));
    await sendAndWait(p, '안녕');
    assert((await p.textContent('.err')).includes('API 키가 올바르지 않아요'), '친절한 오류');
    assert(await p.isVisible('.err [data-action="settings"]'), '설정 열기 버튼');
  },
  async '실제 SDK: 거절(refusal)과 길이 초과(max_tokens) 처리'(b) {
    const p = await newPage(b, { settings: { apiKey: 'sk-ant-test' } });
    let n = 0;
    await mockApi(p, () => (++n === 1 ? { body: streamBody('', 'refusal') } : { body: streamBody('아주 긴 답변의 앞부분', 'max_tokens') }));
    await sendAndWait(p, '첫 질문');
    assert((await p.textContent('.err')).includes('답변할 수 없어요'), '거절 안내');
    await sendAndWait(p, '두 번째 질문');
    assert((await p.textContent('.msg--ai:last-child .note')).includes('너무 길어서'), '길이 초과 안내');
  },
};

(async () => {
  const browser = await chromium.launch();
  const all = Object.entries(tests).concat(SDK_BUNDLE ? Object.entries(liveTests) : []);
  for (const [name, fn] of all) {
    const t0 = Date.now();
    try { await fn(browser); results.push(['PASS', name, Date.now() - t0]); }
    catch (e) { results.push(['FAIL', name, Date.now() - t0, e.message.split('\n')[0]]); }
  }
  await browser.close();
  for (const [s, n, ms, err] of results) console.log(`${s === 'PASS' ? '✓' : '✗'} ${n} (${ms}ms)${err ? '\n    → ' + err : ''}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} 통과${SDK_BUNDLE ? '' : ' (SDK_BUNDLE 없음: 실제 SDK 테스트 건너뜀)'}`);
  process.exit(failed ? 1 : 0);
})();
