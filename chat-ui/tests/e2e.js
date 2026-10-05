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
const KATEX_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js';
const KATEX_FILE = process.env.KATEX_FILE; // katex.min.js 로컬 경로 (없으면 수식은 원문 표시까지만 검사)
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
function streamBody(text, stopReason = 'end_turn', model = 'claude-opus-5-5', thinking = '') {
  const chunks = text.match(/.{1,4}/gs) || [];
  const ti = thinking ? 1 : 0;
  return sse([
    { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 1 } } },
    ...(thinking ? [
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
      { type: 'content_block_stop', index: 0 },
    ] : []),
    { type: 'content_block_start', index: ti, content_block: { type: 'text', text: '' } },
    ...chunks.map((t) => ({ type: 'content_block_delta', index: ti, delta: { type: 'text_delta', text: t } })),
    { type: 'content_block_stop', index: ti },
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
    const mf = await p.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
    assert(mf.name === '모아' && mf.icons.length === 4, '매니페스트');
    const ok = await p.evaluate(async () => (await Promise.all(['icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'].map((u) => fetch(u)))).every((r) => r.ok));
    assert(ok, '아이콘 파일');
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
    assert(/\d/.test(await p.getAttribute('.msg--user', 'title')), '보낸 시각 툴팁');
    assert(!(await p.$('.msg--ai .usage')), '데모 답변엔 비용 표시 없음');
  },
  async '데모: 답변 전 "생각하는 중"이 보이고, 끝나면 접힌 생각 과정으로 바뀐다'(b) {
    const p = await newPage(b);
    await p.fill('#input', '여행 일정 짜줘');
    await p.press('#input', 'Enter');
    await p.waitForSelector('.think-live', { timeout: 3000 });
    await p.waitForFunction(() => !document.body.classList.contains('is-busy'), null, { timeout: 20000 });
    assert(await p.isVisible('.think summary'), '생각 과정 요약');
    assert(await p.isHidden('.think__body'), '기본은 접힘');
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
    await p.waitForSelector('.msg--ai .ai__body > .md');
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
  async '결과물 버전: 넓은 화면에선 자동으로 열리고, 버전을 넘겨볼 수 있다'(b) {
    const p = await newPage(b, { viewport: { width: 1400, height: 860 } });
    await sendAndWait(p, 'HTML 카드 만들어줘');
    await p.waitForSelector('#panel iframe', { state: 'visible' });
    assert(await p.isHidden('#panel-foot'), '버전 1개면 버전 바 숨김');
    await sendAndWait(p, '버튼 색 바꾼 HTML 카드 다시 만들어줘');
    await p.waitForFunction(() => document.querySelector('#panel-ver').textContent === '버전 2 / 2');
    await p.click('#panel-prev');
    assert((await p.textContent('#panel-ver')) === '버전 1 / 2', '이전 버전');
    assert(await p.isDisabled('#panel-prev'), '첫 버전에서 이전 비활성');
    await p.click('[data-action="panel-close"]');
    await sendAndWait(p, 'HTML 카드 하나 더');
    assert(await p.isHidden('#panel'), '사용자가 닫은 대화에선 자동으로 다시 열지 않음');
  },
  async '모델 선택 UI 없음 · 빈 화면의 최근 대화 이어하기'(b) {
    const p = await newPage(b);
    await sendAndWait(p, '저축 계획');
    assert(!(await p.$('[data-action="model"], [data-action="retry-model"], #model-label')), '모델 선택 UI가 없어야 함');
    await p.click('[data-action="new-chat"]');
    assert(await p.isVisible('#recent'), '최근 대화 섹션');
    assert((await p.textContent('#recent .row b')) === '저축 계획', '최근 대화 제목');
    await p.click('#recent .row');
    assert((await p.$$('.msg')).length === 2, '최근 대화 열림');
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
  async '웹 검색(데모): 켜기 → 검색 중/검색함 표시 → 인용 출처가 먼저'(b) {
    const p = await newPage(b);
    await p.click('[data-action="toggle-search"]');
    assert((await p.getAttribute('[data-action="toggle-search"]', 'aria-pressed')) === 'true', '토글 켜짐');
    await p.fill('#input', '오늘 환율 알려줘');
    await p.press('#input', 'Enter');
    await p.waitForSelector('.searching .is-live', { timeout: 3000 });
    await p.waitForFunction(() => !document.body.classList.contains('is-busy'), null, { timeout: 20000 });
    assert((await p.textContent('.searching')).includes('검색함'), '검색 완료 표시');
    assert((await p.$$('.src')).length === 4, '출처 4개');
    assert(await p.isVisible('.src.is-cited:first-child'), '인용된 출처가 첫 번째');
    await p.reload();
    assert((await p.getAttribute('[data-action="toggle-search"]', 'aria-pressed')) === 'true', '설정 유지');
    assert((await p.$$('.src')).length === 4, '새로고침 후에도 출처 유지');
  },
  async '코드 문법 강조'(b) {
    const p = await newPage(b);
    await sendAndWait(p, 'JS 코드 예시');
    assert((await p.$$('.codeblock .tk-k')).length > 0, '키워드 강조');
    assert((await p.$$('.codeblock .tk-s')).length > 0, '문자열 강조');
    await p.click('[data-copy-code]');
  },
  async '백업 받기 → 모두 삭제 → 백업 불러오기 (API 키는 백업에 없음)'(b) {
    const p = await newPage(b, { settings: { apiKey: '', name: '지현' } });
    await sendAndWait(p, '첫 대화');
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('moa.settings.v1')); s.apiKey = 'sk-ant-secret'; localStorage.setItem('moa.settings.v1', JSON.stringify(s)); });
    await p.reload();
    await p.click('.me');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-backup]')]);
    const text = fs.readFileSync(await dl.path(), 'utf8');
    assert(!text.includes('sk-ant-secret'), 'API 키가 백업에 없어야 함');
    assert(JSON.parse(text).conversations.length === 1, '대화 1개 백업');
    await p.click('[data-clear-all]');
    await p.click('.dialog [data-yes]');
    assert(!(await p.$('.conv')), '모두 삭제됨');
    await p.click('.me');
    await p.setInputFiles('[data-restore-file]', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await p.waitForSelector('.conv');
    assert((await p.$$('.conv')).length === 1, '복원됨');
    await p.click('.me');
    await p.setInputFiles('[data-restore-file]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await p.waitForSelector('.toast');
    assert((await p.textContent('.toast')).includes('백업 파일이 아니에요'), '잘못된 파일 안내');
  },
  async '회귀: 답변 도중 새 대화를 눌러도 오류 없이 중지된 답변이 저장된다'(b) {
    const p = await newPage(b);
    await p.fill('#input', '여행 일정');
    await p.press('#input', 'Enter');
    await p.waitForSelector('.think-live');
    await p.click('[data-action="new-chat"]');
    await p.waitForTimeout(600);
    assert(!p.errors.length, p.errors.join());
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('moa.convs.v1'))[0].messages);
    assert(saved.length === 2 && saved[1].stopped, '중지된 답변 저장');
  },
  async '회귀: 답변 도중 그 대화를 삭제하면 되살아나지 않는다'(b) {
    const p = await newPage(b);
    await p.fill('#input', '여행 일정');
    await p.press('#input', 'Enter');
    await p.waitForSelector('.think-live');
    await p.click('[data-action="conv-menu"]');
    await p.click('[data-m="delete"]');
    await p.click('.dialog [data-yes]');
    await p.waitForTimeout(600);
    assert((await p.evaluate(() => JSON.parse(localStorage.getItem('moa.convs.v1')).length)) === 0, '삭제 유지');
    assert(!(await p.$('.conv')), '목록에 없음');
  },
  async '여러 탭: 다른 탭에서 만든 대화가 목록에 나타나고, 진행 중 답변은 끊기지 않는다'(b) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
    const [p1, p2] = [await ctx.newPage(), await ctx.newPage()];
    for (const p of [p1, p2]) { await p.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net\/gh\//, (r) => r.abort()); await p.goto(BASE); }
    await p1.fill('#input', '여행 일정 짜줘');
    await p1.press('#input', 'Enter');
    await p1.waitForSelector('.think-live');
    await p2.fill('#input', '저축 계획');
    await p2.press('#input', 'Enter');
    await p2.waitForFunction(() => !document.body.classList.contains('is-busy'), null, { timeout: 20000 });
    await p1.waitForFunction(() => !document.body.classList.contains('is-busy'), null, { timeout: 20000 });
    assert(!(await p1.$('.msg--ai .note')), '탭1 답변이 끊기지 않음');
    await p1.waitForTimeout(200);
    assert((await p1.$$('.conv')).length === 2, '탭1 목록에 2개');
    const n = await p1.evaluate(() => JSON.parse(localStorage.getItem('moa.convs.v1')).length);
    assert(n === 2, `저장된 대화 2개 (${n})`);
    await ctx.close();
  },
  async 'PDF·텍스트 파일 첨부: 칩으로 보이고, 지원하지 않는 형식은 안내'(b) {
    const p = await newPage(b);
    await p.setInputFiles('#file', [
      { name: '보고서.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%fake\n') },
      { name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# 메모\n- 하나') },
    ]);
    await p.waitForFunction(() => document.querySelectorAll('#attach-list .fchip').length === 2);
    assert((await p.textContent('#attach-list')).includes('보고서.pdf'), 'PDF 칩');
    await p.setInputFiles('#file', { name: 'app.exe', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 1, 2]) });
    await p.waitForSelector('.toast');
    assert((await p.textContent('.toast')).includes('첨부할 수 있어요'), '형식 안내');
    await p.fill('#input', '요약해줘');
    await p.press('#input', 'Enter');
    await p.waitForFunction(() => !document.body.classList.contains('is-busy') && document.querySelector('.msg--ai .actions'));
    assert((await p.$$('.msg--user .fchip')).length === 2, '보낸 메시지에 파일 칩');
    assert((await p.textContent('.msg--ai .md')).includes('보고서.pdf'), '데모 답변이 파일을 언급');
  },
  async '예전 형식(images) 대화를 불러오면 files로 옮겨 그대로 보인다'(b) {
    const ctx = await b.newContext();
    await ctx.addInitScript(() => {
      if (localStorage.getItem('moa.convs.v1')) return;
      localStorage.setItem('moa.convs.v1', JSON.stringify([{ id: 'old1', title: '예전 대화', createdAt: 1, updatedAt: Date.now(), pinned: false, messages: [
        { id: 'u', role: 'user', content: '이 그림', images: [{ name: 'a.png', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }] },
        { id: 'a', role: 'assistant', content: '네', model: 'demo' }] }]));
    });
    const p = await ctx.newPage();
    await p.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net\/gh\//, (r) => r.abort());
    await p.goto(BASE + '#old1');
    assert(await p.isVisible('.msg--user .imgs img'), '예전 이미지 표시');
    await p.click('.msg--ai [data-v="up"]');
    const m = await p.evaluate(() => JSON.parse(localStorage.getItem('moa.convs.v1'))[0].messages[0]);
    assert(m.files && m.files[0].kind === 'image' && !m.images, 'files로 저장');
    await ctx.close();
  },
  async '단축키 도움말(?)과 키 기억하지 않기'(b) {
    const p = await newPage(b);
    await p.evaluate(() => document.activeElement.blur());
    await p.keyboard.press('?');
    assert(await p.isVisible('.keys'), '단축키 창');
    await p.keyboard.press('Escape');
    await p.waitForSelector('.keys', { state: 'detached' });
    await p.click('.me');
    await p.waitForSelector('#set-key');
    await p.waitForTimeout(100); // 시트가 첫 입력칸에 포커스를 주는 타이머가 끝난 뒤 입력
    await p.fill('#set-key', 'sk-ant-temp');
    assert((await p.inputValue('#set-key')) === 'sk-ant-temp', '키 입력');
    await p.uncheck('#set-remember');
    await p.click('#settings-form .btn--blue');
    const stored = await p.evaluate(() => [JSON.parse(localStorage.getItem('moa.settings.v1')).apiKey, JSON.parse(sessionStorage.getItem('moa.key.session.v1')).apiKey]);
    assert(stored[0] === '' && stored[1] === 'sk-ant-temp', `키는 세션에만 (${stored})`);
    assert((await p.textContent('#me-plan')) === 'Claude 연결됨', '연결 표시');
    await p.reload();
    assert((await p.textContent('#me-plan')) === 'Claude 연결됨', '같은 탭 새로고침은 유지');
  },
  async '보안: 악의적인 백업 파일을 불러와도 스크립트가 실행되지 않는다'(b) {
    const p = await newPage(b);
    const evil = {
      app: 'moa', version: 1, conversations: [{
        id: 'x" onmouseover="window.__pwned=1" a="', title: '<img src=x onerror="window.__pwned=2">', createdAt: 1, updatedAt: Date.now(),
        messages: [
          { id: 'm" onclick="window.__pwned=3', role: 'user', content: '<script>window.__pwned=4</script>', files: [{ kind: 'image', name: 'a', mediaType: 'image/png" onerror="window.__pwned=5', data: 'AAA" onerror="window.__pwned=6' }] },
          { id: 'a1', role: 'assistant', content: '[x](javascript:window.__pwned=7)', model: '<b onclick=1>', usage: { input: '<img src=x onerror="window.__pwned=8">', output: 1, cost: 'x' },
            sources: [{ url: 'javascript:window.__pwned=9', title: 't' }, { url: 'https://ok.example', title: '<img src=x onerror="window.__pwned=10">' }] },
          { id: 'z', role: 'system', content: 'ignored' },
        ],
      }],
    };
    await p.click('.me');
    await p.setInputFiles('[data-restore-file]', { name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(evil)) });
    await p.waitForSelector('.conv');
    await p.hover('.conv');
    await p.click('.conv__link');
    await p.hover('.msg--user');
    await p.waitForTimeout(300);
    assert(!(await p.evaluate(() => window.__pwned)), `스크립트 실행됨: ${await p.evaluate(() => window.__pwned)}`);
    assert(!p.errors.length, p.errors.join());
    assert((await p.$$('.msg')).length === 2, 'system 역할 메시지는 버림');
    assert((await p.$$('.src')).length === 1, 'javascript: 출처는 버림');
    assert(!(await p.$('.msg--ai a[href^="javascript"]')), 'javascript 링크 없음');
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('moa.convs.v1'))[0]);
    assert(/^[A-Za-z0-9_-]+$/.test(saved.id), '안전한 id로 교체');
  },
  async '수식: 처음 나올 때만 KaTeX를 불러와 MathML로 그린다'(b) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
    const p = await ctx.newPage();
    p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
    await p.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net\/gh\//, (r) => r.abort());
    let loads = 0;
    await p.route(KATEX_URL, (r) => { loads++; return KATEX_FILE ? r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(KATEX_FILE, 'utf8') }) : r.abort(); });
    await p.goto(BASE);
    await sendAndWait(p, '안녕');
    assert(loads === 0, '수식이 없으면 KaTeX를 불러오지 않음');
    await sendAndWait(p, '근의 공식 수식으로 알려줘');
    if (KATEX_FILE) {
      await p.waitForSelector('.msg--ai:last-child .math-block math[display="block"]');
      assert((await p.$$('.msg--ai:last-child .md math')).length >= 5, '인라인 수식');
      assert((await p.$$('.msg--ai:last-child table math')).length === 3, '표 안 수식');
    } else {
      assert(await p.isVisible('.math-src'), 'KaTeX가 없으면 원문 표시');
    }
    assert(loads === 1, `KaTeX 한 번만 요청 (${loads})`);
    assert(!p.errors.length, p.errors.join());
    await ctx.close();
  },
  async '접근성: 설정 시트에서 Tab 포커스가 시트 밖으로 나가지 않고, 닫으면 연 버튼으로 돌아온다'(b) {
    const p = await newPage(b);
    await p.focus('.me');
    await p.keyboard.press('Enter');
    await p.waitForSelector('#set-name');
    for (let i = 0; i < 25; i++) {
      await p.keyboard.press('Tab');
      assert(await p.evaluate(() => !!document.activeElement.closest('.sheet')), `Tab ${i + 1}번째에 시트 밖으로 나감`);
    }
    await p.keyboard.press('Shift+Tab');
    assert(await p.evaluate(() => !!document.activeElement.closest('.sheet')), 'Shift+Tab도 안에서');
    await p.keyboard.press('Escape');
    assert(await p.evaluate(() => document.activeElement.classList.contains('me')), '연 버튼으로 포커스 복귀');
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
    const calls = await mockApi(p, () => ({ body: streamBody('안녕하세요! **Claude**가 답하고 있어요.\n\n- 하나\n- 둘', 'end_turn', 'claude-opus-5-5', '인사에 답하는 방법을 생각 중') }));
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
    assert(c.body.thinking && c.body.thinking.type === 'adaptive' && c.body.thinking.display === 'summarized', 'thinking 요약 표시');
    assert(c.body.cache_control && c.body.cache_control.type === 'ephemeral', '프롬프트 캐시');
    assert((await p.textContent('.msg--ai .think summary')).includes('생각 과정'), '생각 과정 접힘 표시');
    assert(!(await p.evaluate(() => JSON.parse(localStorage.getItem('moa.convs.v1'))[0].messages[1].thinkStart)), 'thinkStart 정리');
    assert(c.body.messages.length === 1 && c.body.messages[0].role === 'user', 'messages');
    assert((await p.textContent('.msg--ai .md strong')) === 'Claude', '마크다운 렌더');
    assert((await p.textContent('.msg--ai .ai__head')).trim().startsWith('모'), '답변 머리말');
    assert(/토큰 · \$/.test(await p.textContent('.msg--ai .usage')), '토큰·비용 표시');
    assert((await p.getAttribute('.msg--ai .usage', 'title')).includes('입력 12토큰'), '토큰 상세 툴팁');
    // 두 번째 턴: 이전 대화가 함께 전달되는지
    await sendAndWait(p, '고마워');
    assert(calls[1].body.messages.length === 3, '이전 대화 포함');
    assert(calls[1].body.messages[1].role === 'assistant', '역할 교대');
  },
  async '실제 SDK: 예전에 다른 모델을 골라 저장했어도 항상 같은 모델로 보낸다'(b) {
    const p = await newPage(b, { settings: { apiKey: 'sk-ant-test', model: 'claude-haiku-4-5' } });
    const calls = await mockApi(p, () => ({ body: streamBody('네.') }));
    await sendAndWait(p, '짧게');
    assert(calls[0].body.model === 'claude-opus-5-5', `모델 고정 (${calls[0].body.model})`);
  },
  async '실제 SDK: 웹 검색 도구 · 검색어/출처/인용 표시 · pause_turn 이어받기'(b) {
    const p = await newPage(b, { settings: { apiKey: 'sk-ant-test', webSearch: true } });
    const search = sse([
      { type: 'message_start', message: { id: 'm1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query": "서울 ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '날씨"}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [
        { type: 'web_search_result', url: 'https://weather.example/seoul', title: '서울 날씨', encrypted_content: 'x', page_age: null },
        { type: 'web_search_result', url: 'https://news.example/a', title: '기상 뉴스', encrypted_content: 'y', page_age: null },
      ] } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'pause_turn', stop_sequence: null }, usage: { output_tokens: 3 } },
      { type: 'message_stop' },
    ]);
    const answer = sse([
      { type: 'message_start', message: { id: 'm2', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 1 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: [] } },
      { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: { type: 'web_search_result_location', url: 'https://weather.example/seoul', title: '서울 날씨', cited_text: '맑음', encrypted_index: 'z' } } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '오늘 서울은 맑아요.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 8 } },
      { type: 'message_stop' },
    ]);
    const calls = await mockApi(p, (c, n) => ({ body: n === 1 ? search : answer }));
    await sendAndWait(p, '서울 날씨');
    assert(calls[0].body.tools && calls[0].body.tools[0].type === 'web_search_20260209', 'web_search_20260209 도구');
    assert(calls.length === 2, `pause_turn 뒤 이어서 요청 (${calls.length}회)`);
    const last = calls[1].body.messages[calls[1].body.messages.length - 1];
    assert(last.role === 'assistant' && last.content.some((b) => b.type === 'server_tool_use'), '멈춘 답변을 그대로 붙여 보냄');
    assert((await p.textContent('.searching')).includes('서울 날씨'), '검색어 표시');
    assert((await p.$$('.src')).length === 2, '출처 2개');
    assert((await p.getAttribute('.src.is-cited', 'href')) === 'https://weather.example/seoul', '인용 출처 강조');
    assert((await p.textContent('.msg--ai .ai__body > .md')).includes('맑아요'), '답변 본문');
  },
  async '실제 SDK: PDF·텍스트는 document 블록으로, 파일이 질문보다 먼저'(b) {
    const p = await newPage(b, { settings: { apiKey: 'sk-ant-test' } });
    const calls = await mockApi(p, () => ({ body: streamBody('요약했어요.') }));
    await p.setInputFiles('#file', [
      { name: 'r.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') },
      { name: 'a.csv', mimeType: 'text/csv', buffer: Buffer.from('이름,값\n가,1') },
    ]);
    await p.waitForFunction(() => document.querySelectorAll('#attach-list .fchip').length === 2);
    await sendAndWait(p, '정리해줘');
    const content = calls[0].body.messages[0].content;
    assert(content[0].type === 'document' && content[0].source.type === 'base64' && content[0].source.media_type === 'application/pdf' && content[0].title === 'r.pdf', 'PDF document 블록');
    assert(content[1].type === 'document' && content[1].source.type === 'text' && content[1].source.data.includes('이름,값'), '텍스트 document 블록');
    assert(content[2].type === 'text' && content[2].text === '정리해줘', '질문은 마지막');
  },
  async '실제 SDK: 길이 초과 후 "이어서 쓰기"는 새 요청을 보낸다'(b) {
    const p = await newPage(b, { settings: { apiKey: 'sk-ant-test' } });
    let n = 0;
    const calls = await mockApi(p, () => ({ body: streamBody(++n === 1 ? '긴 답변 앞부분' : '뒷부분', n === 1 ? 'max_tokens' : 'end_turn') }));
    await sendAndWait(p, '길게 써줘');
    await p.click('[data-action="continue"]');
    await p.waitForFunction(() => document.querySelectorAll('.msg--ai').length === 2 && !document.body.classList.contains('is-busy'));
    const msgs = calls[1].body.messages;
    assert(msgs.length === 3 && msgs[1].content[0].text === '긴 답변 앞부분' && msgs[2].content[0].text.includes('이어서'), '이어서 요청');
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
