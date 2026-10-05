/* 서버 모드 E2E: 가짜 Anthropic API + 실제 모아 서버(server/server.mjs) + 브라우저
 *   SDK_BUNDLE=tests/.cache/sdk.bundle.mjs node tests/server.e2e.js
 * 확인하는 것: 키가 브라우저로 새지 않음, 비밀번호, 허용 목록, max_tokens 상한, 속도 제한, 경로 탈출 차단, 스트리밍 표시 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
const SDK_BUNDLE = process.env.SDK_BUNDLE || path.join(__dirname, '.cache/sdk.bundle.mjs');
const API_PORT = 8791, APP_PORT = 8781;
const BASE = `http://localhost:${APP_PORT}/`;
const SECRET = 'sk-ant-server-only-secret';
const assert = (c, m) => { if (!c) throw new Error(m); };

/* ---------- 가짜 Anthropic API ---------- */
const upstream = [];
const sse = (evs) => evs.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
function answer(text, model) {
  return sse([
    { type: 'message_start', message: { id: 'msg_s', type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 9, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...text.match(/.{1,3}/gs).map((t) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ]);
}
const api = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const body = JSON.parse(b || '{}');
    upstream.push({ headers: req.headers, body, url: req.url });
    if (req.headers['x-api-key'] !== SECRET) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'bad key' } })); }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(answer('서버를 거쳐 답하고 있어요.', body.model));
  });
});

async function main() {
  await new Promise((r) => api.listen(API_PORT, r));
  const srv = spawn(process.execPath, [path.join(__dirname, '../server/server.mjs')], {
    env: { ...process.env, ANTHROPIC_API_KEY: SECRET, ANTHROPIC_BASE_URL: `http://localhost:${API_PORT}`, APP_PASSWORD: 'pw1234', PORT: String(APP_PORT), RATE_LIMIT: '6', MAX_TOKENS: '1000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 50 && !log.includes('모아 서버'); i++) await new Promise((r) => setTimeout(r, 100));

  const browser = await chromium.launch();
  const results = [];
  const run = async (name, fn) => { try { await fn(); results.push(['✓', name]); } catch (e) { results.push(['✗', name, e.message.split('\n')[0]]); } };
  const page = async () => {
    const p = await (await browser.newContext()).newPage();
    p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
    await p.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net\/gh\//, (r) => r.abort());
    await p.route(SDK_URL, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(SDK_BUNDLE, 'utf8') }));
    await p.goto(BASE);
    await p.waitForFunction(() => document.querySelector('#me-plan').textContent !== '데모 모드');
    return p;
  };
  const send = async (p, t) => {
    await p.fill('#input', t); await p.press('#input', 'Enter');
    await p.waitForFunction(() => !document.body.classList.contains('is-busy') && document.querySelector('.msg--ai:last-child .actions, .msg--ai:last-child .err'), null, { timeout: 20000 });
  };
  const setPassword = async (p, pw) => {
    await p.click('.me'); await p.waitForSelector('#set-pass'); await p.waitForTimeout(80);
    await p.fill('#set-pass', pw); await p.click('#settings-form .btn--blue');
  };

  await run('서버 모드를 감지하고, 키 입력칸 대신 비밀번호 칸을 보여준다', async () => {
    const p = await page();
    assert((await p.textContent('#me-plan')) === '비밀번호 필요', '상태 표시');
    assert((await p.textContent('#demo-notice b')).includes('비밀번호'), '안내 문구');
    await p.click('.me');
    assert(await p.isVisible('.server-note') && await p.isVisible('#set-pass') && !(await p.$('#set-key')), '설정 시트');
  });
  await run('틀린 비밀번호면 안내하고, API로 요청을 보내지 않는다', async () => {
    const p = await page();
    await setPassword(p, 'wrong');
    const before = upstream.length;
    await send(p, '안녕');
    assert((await p.textContent('.err')).includes('접속 비밀번호가 올바르지 않아요'), '오류 문구');
    assert(upstream.length === before, '위쪽 요청 없음');
  });
  await run('맞는 비밀번호면 서버를 거쳐 스트리밍되고, 키는 서버에서만 붙는다', async () => {
    const p = await page();
    const browserHeaders = [];
    p.on('request', (r) => { if (r.url().includes('/api/anthropic')) browserHeaders.push(r.headers()); });
    await setPassword(p, 'pw1234');
    assert((await p.textContent('#me-plan')) === '서버 연결됨', '연결 표시');
    await send(p, '안녕');
    assert((await p.textContent('.msg--ai .md')).includes('서버를 거쳐'), '답변 표시');
    const up = upstream[upstream.length - 1];
    assert(up.headers['x-api-key'] === SECRET, '서버가 키를 붙임');
    assert(!up.headers['x-moa-password'], '비밀번호는 위쪽으로 전달하지 않음');
    assert(up.body.max_tokens <= 1000, `max_tokens 상한 (${up.body.max_tokens})`);
    assert(up.body.model === 'claude-opus-5-5' && up.body.fallbacks === 'default', '모델·폴백 전달');
    assert((up.headers['anthropic-beta'] || '').includes('server-side-fallback-2026-07-01'), '허용된 베타 헤더 전달');
    assert(browserHeaders.length && browserHeaders.every((h) => h['x-api-key'] !== SECRET), '브라우저 요청에 진짜 키 없음');
    const html = await p.content();
    assert(!html.includes(SECRET), '페이지에 키 없음');
    assert(!p.errors.length, p.errors.join());
  });
  const post = (body, headers = {}) => fetch(BASE + 'api/anthropic/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-moa-password': 'pw1234', ...headers }, body: JSON.stringify(body) });
  const msgs = [{ role: 'user', content: '안녕' }];
  await run('허용 목록: 다른 모델·모르는 파라미터·다른 도구는 400', async () => {
    const before = upstream.length;
    for (const [body, why] of [
      [{ model: 'claude-fable-5-1', max_tokens: 10, messages: msgs }, '모델'],
      [{ model: 'claude-haiku-4-5', max_tokens: 10, messages: msgs }, '앱이 쓰지 않는 모델'],
      [{ model: 'claude-opus-5-5', max_tokens: 10, messages: msgs, container: { skills: [] } }, '파라미터'],
      [{ model: 'claude-opus-5-5', max_tokens: 10, messages: msgs, tools: [{ type: 'code_execution_20260521', name: 'code_execution' }] }, '도구'],
      [{ model: 'claude-opus-5-5', max_tokens: 10, messages: [] }, '빈 messages'],
    ]) {
      const r = await post(body);
      assert(r.status === 400, `${why}: ${r.status}`);
      assert((await r.json()).error.type === 'invalid_request_error', `${why}: 오류 형식`);
    }
    assert(upstream.length === before, '위쪽 요청 없음');
  });
  await run('경로 탈출 차단, 없는 API는 404', async () => {
    const r1 = await fetch(`http://localhost:${APP_PORT}/%2e%2e/server/server.mjs`);
    assert(r1.status === 403 || r1.status === 404, `경로 탈출 ${r1.status}`);
    const t = await r1.text(); assert(!t.includes('ANTHROPIC_API_KEY'), '서버 코드 노출');
    assert((await fetch(BASE + 'api/nope')).status === 404, '없는 API');
    assert((await fetch(BASE + 'index.html')).status === 200, '앱 파일');
  });
  await run('속도 제한: 한도를 넘으면 429, 브라우저는 자동 재시도 없이 안내', async () => {
    let last;
    for (let i = 0; i < 8; i++) last = await post({ model: 'claude-opus-5-5', max_tokens: 10, messages: msgs });
    assert(last.status === 429 && last.headers.get('x-should-retry') === 'false', `429 (${last.status})`);
    const p = await page();
    await setPassword(p, 'pw1234');
    const before = upstream.length;
    await send(p, '또 안녕');
    assert((await p.textContent('.err')).includes('요청이 너무 많아요'), '안내 문구');
    assert(upstream.length === before, '재시도 없음');
  });

  await browser.close();
  srv.kill(); api.close();
  for (const [s, n, e] of results) console.log(`${s} ${n}${e ? '\n    → ' + e : ''}`);
  const failed = results.filter((r) => r[0] === '✗').length;
  console.log(`\n서버 모드 ${results.length - failed}/${results.length} 통과`);
  if (failed) console.log('--- 서버 로그 ---\n' + log);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
