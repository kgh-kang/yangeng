/* 모아 서버 — 앱 파일을 제공하고, Claude API 요청을 대신 보내는 작은 서버 (선택 사항)
 *
 *   ANTHROPIC_API_KEY=sk-ant-... APP_PASSWORD=비밀번호 node server/server.mjs
 *
 * 왜 필요한가: 브라우저에 API 키를 넣는 방식은 개인용으로만 안전하다. 이 서버를 쓰면
 *  - 키는 서버 환경변수에만 있고 브라우저로 내려가지 않는다
 *  - 허용한 모델·도구·파라미터만 통과시키고 max_tokens 상한을 건다
 *  - 접속 비밀번호(APP_PASSWORD)와 IP별 요청 속도 제한으로 남용을 막는다
 * 브라우저 SDK는 baseURL만 이 서버(/api/anthropic)로 바꿔 똑같이 스트리밍한다.
 *
 * 환경변수
 *   ANTHROPIC_API_KEY   (필수) Anthropic API 키
 *   APP_PASSWORD        (권장) 접속 비밀번호. 없으면 누구나 이 서버로 요청할 수 있다
 *   PORT                기본 8780
 *   RATE_LIMIT          IP당 분당 요청 수, 기본 20
 *   MAX_TOKENS          요청당 max_tokens 상한, 기본 64000
 *   ANTHROPIC_BASE_URL  (테스트용) API 주소를 바꿀 때
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app');
const PORT = +process.env.PORT || 8780;
const PASSWORD = process.env.APP_PASSWORD || '';
const RATE_LIMIT = +process.env.RATE_LIMIT || 20;
const MAX_TOKENS = +process.env.MAX_TOKENS || 64000;
const MAX_BODY = 32 * 1024 * 1024; // API 요청 한도와 같음 (PDF 첨부 고려)

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY 환경변수를 설정해 주세요.');
  process.exit(1);
}
if (!PASSWORD) console.warn('경고: APP_PASSWORD가 없어 이 서버 주소를 아는 누구나 API를 쓸 수 있어요.');

const client = new Anthropic(); // ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL 을 환경변수에서 읽음

/* ---------- 허용 목록 ---------- */
const MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5']);
const BETAS = new Set(['server-side-fallback-2026-07-01']);
const KEYS = new Set(['model', 'max_tokens', 'messages', 'system', 'output_config', 'thinking', 'cache_control', 'tools', 'fallbacks', 'stream']);
const TOOL_TYPES = new Set(['web_search_20260209', 'web_search_20250305']);

class HttpError extends Error {
  constructor(status, type, message) { super(message); this.status = status; this.type = type; }
}
/** 브라우저에서 온 요청 본문을 검사해 Claude에 보낼 파라미터로 만든다 */
function buildParams(body, betaHeader) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'invalid_request_error', '요청 본문이 올바르지 않아요.');
  for (const k of Object.keys(body)) if (!KEYS.has(k)) throw new HttpError(400, 'invalid_request_error', `허용되지 않은 파라미터: ${k}`);
  if (!MODELS.has(body.model)) throw new HttpError(400, 'invalid_request_error', `허용되지 않은 모델: ${body.model}`);
  if (!Array.isArray(body.messages) || !body.messages.length) throw new HttpError(400, 'invalid_request_error', 'messages가 비어 있어요.');
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools) || body.tools.some((t) => !t || !TOOL_TYPES.has(t.type) || t.name !== 'web_search')) {
      throw new HttpError(400, 'invalid_request_error', '웹 검색 외의 도구는 쓸 수 없어요.');
    }
    body.tools = body.tools.map((t) => ({ type: t.type, name: 'web_search', max_uses: Math.min(+t.max_uses || 5, 5) }));
  }
  const { stream, ...params } = body;
  params.max_tokens = Math.max(1, Math.min(+body.max_tokens || MAX_TOKENS, MAX_TOKENS));
  const betas = String(betaHeader || '').split(',').map((s) => s.trim()).filter((b) => BETAS.has(b));
  if (betas.length) params.betas = betas;
  else delete params.fallbacks; // fallbacks는 베타 헤더가 있을 때만
  return params;
}

/* ---------- 속도 제한 (IP별 1분 창) ---------- */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_LIMIT;
}
setInterval(() => { const now = Date.now(); for (const [ip, l] of hits) if (!l.some((t) => now - t < 60_000)) hits.delete(ip); }, 60_000).unref();

const safeEqual = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

/* ---------- 응답 도우미 ---------- */
const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
function sendJson(res, status, obj, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...SEC, ...extra });
  res.end(JSON.stringify(obj));
}
// 브라우저 SDK가 오류 종류를 알아보도록 Anthropic API와 같은 모양으로 보낸다
const sendError = (res, status, type, message, extra) => sendJson(res, status, { type: 'error', error: { type, message } }, extra);

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new HttpError(413, 'request_too_large', '요청이 너무 커요 (32MB 초과).');
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { throw new HttpError(400, 'invalid_request_error', 'JSON을 읽지 못했어요.'); }
}

async function handleMessages(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (PASSWORD && !safeEqual(req.headers['x-moa-password'] || '', PASSWORD)) {
    return sendError(res, 401, 'authentication_error', '접속 비밀번호가 올바르지 않아요.');
  }
  if (rateLimited(ip)) {
    // x-should-retry: false → 브라우저 SDK가 자동 재시도하지 않고 바로 알린다
    return sendError(res, 429, 'rate_limit_error', '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', { 'retry-after': '30', 'x-should-retry': 'false' });
  }
  let params;
  try { params = buildParams(await readBody(req), req.headers['anthropic-beta']); } catch (e) {
    return sendError(res, e.status || 400, e.type || 'invalid_request_error', e.message);
  }

  const ctrl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctrl.abort(); }); // 브라우저가 중지하면 위쪽 요청도 끊는다
  const stream = client.beta.messages.stream(params, { signal: ctrl.signal });
  let started = false;
  try {
    for await (const ev of stream) {
      if (!started) {
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no', ...SEC });
        started = true;
      }
      res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
    }
    if (!started) res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', ...SEC });
    res.end();
  } catch (e) {
    if (ctrl.signal.aborted) return res.end();
    const status = e instanceof Anthropic.APIError && e.status ? e.status : 502;
    const type = (e.error && e.error.error && e.error.error.type) || 'api_error';
    const message = (e.error && e.error.error && e.error.error.message) || 'Claude API 요청에 실패했어요.';
    console.error(`[messages] ${status} ${type}: ${message}`);
    if (!started) return sendError(res, status, type, message);
    // 스트리밍 도중 오류: SSE error 이벤트로 알린다 (SDK가 예외로 바꿔 준다)
    res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type, message } })}\n\n`);
    res.end();
  }
}

/* ---------- 정적 파일 ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
async function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.resolve(ROOT, '.' + p);
  if (!file.startsWith(ROOT + path.sep)) return sendError(res, 403, 'forbidden', '접근할 수 없어요.');
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': p.endsWith('.html') ? 'no-cache' : 'public, max-age=300', ...SEC });
    res.end(data);
  } catch (_) {
    sendError(res, 404, 'not_found_error', '페이지를 찾을 수 없어요.');
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname === '/api/config' && req.method === 'GET') {
      return sendJson(res, 200, { mode: 'server', passwordRequired: !!PASSWORD, models: [...MODELS] }, { 'cache-control': 'no-store' });
    }
    if (pathname === '/api/anthropic/v1/messages' && req.method === 'POST') return await handleMessages(req, res);
    if (pathname.startsWith('/api/')) return sendError(res, 404, 'not_found_error', '없는 API예요.');
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'invalid_request_error', '허용되지 않은 메서드예요.');
    return await serveStatic(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendError(res, 500, 'api_error', '서버 오류가 발생했어요.');
    else res.end();
  }
});
server.listen(PORT, () => console.log(`모아 서버: http://localhost:${PORT}/`));
