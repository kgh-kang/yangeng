/* api.js — 응답 생성기.
 *  - API 키가 있으면: 공식 Anthropic TypeScript SDK(브라우저 ESM 빌드)로 Messages API 스트리밍
 *  - 없으면: 데모 응답기
 * 둘 다 같은 형태의 이벤트를 낸다: {type:'text', text} … {type:'done', stopReason, model}
 *
 * 주의: 브라우저에서 API 키를 직접 쓰는 방식은 개인용/프로토타입 용도다.
 * 여러 사용자가 쓰는 서비스라면 키를 서버에 두고 같은 요청을 서버에서 보내야 한다. */
(function () {
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
  const MODELS = [
    { id: 'claude-opus-5-5', name: '모아 깊게', desc: '어려운 문제도 정확하게 · Claude Opus 5.5', effort: true, fallbacks: true },
    { id: 'claude-sonnet-5-5', name: '모아 기본', desc: '빠르고 똑똑하게 · Claude Sonnet 5.5', effort: true, fallbacks: true },
    { id: 'claude-haiku-4-5', name: '모아 라이트', desc: '짧은 질문에 가장 빠르게 · Claude Haiku 4.5', effort: false, fallbacks: false },
  ];
  const modelInfo = (id) => MODELS.find((m) => m.id === id) || MODELS[0];

  let sdkPromise = null;
  const loadSdk = () => (sdkPromise ||= import(SDK_URL).catch((e) => { sdkPromise = null; throw e; }));

  /** 저장된 메시지 → API messages. 실패·빈 답변은 빼고, 같은 역할이 연속되면 합친다. */
  function toApiMessages(messages) {
    const out = [];
    for (const m of messages) {
      if (m.role === 'assistant' && (!m.content || m.error)) continue;
      let content;
      if (m.role === 'user') {
        const imgs = (m.images || []).filter((i) => i.data).map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } }));
        content = [...imgs, { type: 'text', text: m.content || '(이미지)' }];
      } else {
        content = [{ type: 'text', text: m.content }];
      }
      const prev = out[out.length - 1];
      if (prev && prev.role === m.role) prev.content.push(...content);
      else out.push({ role: m.role, content });
    }
    while (out.length && out[out.length - 1].role !== 'user') out.pop();
    return out;
  }

  function friendlyError(err, Anthropic) {
    if (Anthropic) {
      if (err instanceof Anthropic.APIUserAbortError) return { aborted: true };
      if (err instanceof Anthropic.AuthenticationError) return { message: 'API 키가 올바르지 않아요. 설정에서 키를 다시 확인해 주세요.', fix: 'settings' };
      if (err instanceof Anthropic.PermissionDeniedError) return { message: '이 API 키로는 선택한 모델을 쓸 수 없어요. 다른 모델을 골라 보세요.', fix: 'model' };
      if (err instanceof Anthropic.RateLimitError) return { message: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' };
      if (err instanceof Anthropic.BadRequestError) return { message: `요청을 처리하지 못했어요: ${err.message}` };
      if (err instanceof Anthropic.InternalServerError) return { message: '서버가 잠시 불안정해요. 다시 시도해 주세요.' };
      if (err instanceof Anthropic.APIConnectionError) return { message: '네트워크에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.' };
      if (err instanceof Anthropic.APIError) return { message: `오류가 발생했어요 (${err.status ?? '알 수 없음'}). 다시 시도해 주세요.` };
    }
    if (err && err.name === 'AbortError') return { aborted: true };
    return { message: 'SDK를 불러오지 못했어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.' };
  }

  async function* claude({ settings, messages, signal }) {
    let mod;
    try { mod = await loadSdk(); } catch (e) { throw Object.assign(new Error('sdk'), { friendly: friendlyError(e) }); }
    const Anthropic = mod.default;
    const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
    const info = modelInfo(settings.model);
    const params = { model: info.id, max_tokens: 64000, messages: toApiMessages(messages) };
    if (settings.system && settings.system.trim()) params.system = settings.system.trim();
    if (info.effort) params.output_config = { effort: settings.effort || 'medium' };
    // 안전 분류기에 걸려 거절되면 서버가 다른 모델로 이어서 답하도록 기본 폴백을 켠다.
    if (info.fallbacks) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }

    const stream = client.beta.messages.stream(params, { signal });
    try {
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield { type: 'text', text: ev.delta.text };
      }
      const final = await stream.finalMessage();
      yield { type: 'done', stopReason: final.stop_reason, model: final.model, usage: final.usage };
    } catch (e) {
      throw Object.assign(e, { friendly: friendlyError(e, Anthropic) });
    }
  }

  /* ---------- 데모 응답기 ---------- */
  const DEMO = [
    [/html|페이지|랜딩|버튼|카드|만들어/i, '간단한 프로모션 카드를 HTML로 만들어 봤어요. 코드 블록 오른쪽 위의 **미리보기**를 누르면 옆 패널에서 바로 확인할 수 있어요.\n\n```html\n<!doctype html>\n<html lang="ko">\n<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#f2f4f6;font-family:system-ui,sans-serif">\n  <div style="background:#fff;border-radius:24px;padding:28px;width:300px;box-shadow:0 8px 30px rgba(0,0,0,.08)">\n    <div style="font-size:14px;color:#8b95a1">이번 달 혜택</div>\n    <div style="font-size:24px;font-weight:700;margin:6px 0 18px;color:#191f28">커피 쿠폰 3장이<br>도착했어요</div>\n    <button onclick="this.textContent=\'받았어요 ✓\'" style="width:100%;height:52px;border:0;border-radius:14px;background:#3182f6;color:#fff;font-size:16px;font-weight:600">쿠폰 받기</button>\n  </div>\n</body>\n</html>\n```\n\n색상이나 문구를 바꾸고 싶으면 말씀해 주세요.'],
    [/요약|정리|회의/i, '요약해 드릴게요.\n\n### 핵심 3줄\n1. 다음 분기 목표는 가입 전환율 **12% 개선**이에요.\n2. 온보딩을 5단계에서 3단계로 줄이기로 했어요.\n3. 디자인 시안은 금요일까지 공유해요.\n\n| 담당 | 할 일 | 기한 |\n|---|---|---|\n| 지현 | 온보딩 화면 시안 | 10/10 |\n| 민수 | 전환 퍼널 대시보드 | 10/14 |\n\n후속 메일 초안도 써 드릴까요?'],
    [/저축|월급|돈|예산/i, '월급 300만 원 기준으로 **50 / 30 / 20 규칙**을 적용해 봤어요.\n\n| 구분 | 비율 | 금액 |\n|---|--:|--:|\n| 고정지출 (월세·통신·보험) | 50% | 1,500,000원 |\n| 생활비 (식비·교통·여가) | 30% | 900,000원 |\n| 저축·투자 | 20% | 600,000원 |\n\n- 비상금은 생활비 3개월치(약 270만 원)를 먼저 모으는 걸 추천해요.\n- 그다음 적금과 투자를 반씩 나눠 보세요.\n\n> 실제 상황(대출, 부양가족 등)에 따라 비율은 달라질 수 있어요.'],
    [/코드|js|자바스크립트|함수|python|파이썬/i, '한글 입력 중에 Enter로 전송되지 않게 하려면 `isComposing`을 확인해야 해요.\n\n```js\ntextarea.addEventListener(\'keydown\', (e) => {\n  if (e.key === \'Enter\' && !e.shiftKey && !e.isComposing) {\n    e.preventDefault();\n    send(textarea.value);\n  }\n});\n```\n\n- `Shift+Enter`는 줄바꿈으로 남겨 둬요.\n- 전송 중에는 버튼을 **중지**로 바꿔 주세요.'],
    [/여행|일정|맛집/i, '부산 1박 2일 코스예요.\n\n### 1일차\n- 오전: 해운대 → 동백섬 산책\n- 점심: 밀면\n- 저녁: 광안리에서 광안대교 야경\n\n### 2일차\n- 오전: 감천문화마을\n- 점심: 자갈치시장\n\n이동은 지하철 2호선 위주로 짰어요. 숙소 위치를 알려주시면 동선을 다시 맞춰 드릴게요.'],
    [/.*/, '지금은 **데모 모드**라 미리 준비된 답변이 나가고 있어요. 설정에서 Anthropic API 키를 연결하면 Claude가 실제로 답해요.\n\n데모에서 해볼 수 있는 것:\n- "HTML 카드 만들어줘" → 미리보기 패널\n- "회의록 요약해줘" → 표 렌더링\n- "월급 300 저축 계획" → 숫자 표'],
  ];
  const sleep = (ms, signal) => new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    signal && signal.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
  });
  async function* demo({ messages, signal }) {
    const last = [...messages].reverse().find((m) => m.role === 'user');
    const text = (last && last.content) || '';
    const hasImg = last && (last.images || []).length;
    const reply = hasImg ? `이미지 ${last.images.length}장을 받았어요. API 키를 연결하면 Claude가 이미지 내용을 실제로 읽고 설명해 줘요.` : DEMO.find(([re]) => re.test(text))[1];
    try {
      await sleep(450, signal);
      for (let i = 0; i < reply.length;) {
        const n = 2 + Math.floor(Math.random() * 5);
        yield { type: 'text', text: reply.slice(i, i + n) };
        i += n;
        await sleep(14, signal);
      }
    } catch (e) { throw Object.assign(e, { friendly: { aborted: true } }); }
    yield { type: 'done', stopReason: 'end_turn', model: 'demo' };
  }

  window.MoaAPI = {
    MODELS,
    modelInfo,
    toApiMessages,
    isLive: (settings) => !!(settings.apiKey && settings.apiKey.trim()),
    respond(opts) { return window.MoaAPI.isLive(opts.settings) ? claude(opts) : demo(opts); },
  };
})();
