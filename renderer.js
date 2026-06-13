// ================================================================
//  렌더링 엔진 — renderer.js
// ================================================================

function esc(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

let _cellIdx = 0;

// ================================================================
//  수식어 렌더 — 강의 Reed-Kellogg 표기
//   · 단어 수식어(관사/형용사/부사)  → "\ 단어" (사선 매달기)
//   · 전치사구(into the wilderness)  → 전치사 → 명사 → \관사 의 꺾인 받침대(계층)
// ================================================================

// 전역(parser.js) PREP 집합 사용. 없으면 폴백.
const _PREP = (typeof PREP !== 'undefined') ? PREP : new Set(
    'in on at to for with by from of about into through during before after above below between under over up down out off near around against along across behind beside beyond among upon within without toward towards until since except like unlike despite throughout'.split(' '));

function _isPrepPhrase(m) {
    const w = m.trim().split(/\s+/)[0];
    return _PREP.has(w.toLowerCase());
}

// 명사구 문자열 → {head, mods}. parser의 splitNP가 있으면 사용.
function _splitNPstr(words) {
    if (typeof splitNP === 'function') return splitNP(words);
    if (!words.length) return { head: '', mods: [] };
    return { head: words[words.length - 1], mods: words.slice(0, -1) };
}

// 전치사구 받침대 HTML: 전치사(다리) → 목적어 명사(가로선) → \관사·형용사(아래 매달기)
function renderPrepStand(pp) {
    const words = pp.trim().split(/\s+/);
    const prep = words[0];
    const np = _splitNPstr(words.slice(1));
    const objMods = (np.mods || []).map(x =>
        `<div class="pp-objmod">${esc(x)}</div>`).join('');
    return `<div class="pp-stand">
        <div class="pp-prep">${esc(prep)}</div>
        <div class="pp-obj">
            <div class="pp-noun">${esc(np.head)}</div>
            ${objMods ? `<div class="pp-objmods">${objMods}</div>` : ''}
        </div>
    </div>`;
}

// 수식어 1개 → HTML (전치사구면 받침대, 아니면 \단어)
function renderOneMod(m) {
    if (_isPrepPhrase(m)) return renderPrepStand(m);
    const restored = m.startsWith('(');
    return `<div class="mod-item"><span class="mod-slash">\\</span><span class="mod-text${restored ? ' restored' : ''}">${esc(m)}</span></div>`;
}

function renderModCol(np) {
    let idx = _cellIdx++;
    let mods = np.mods ? [...np.mods] : [];
    if (!mods.length) return `<div class="mod-col" data-cell="${idx}"></div>`;
    let items = mods.map(renderOneMod).join('');
    return `<div class="mod-col" data-cell="${idx}"><div class="mod-stem"></div>${items}</div>`;
}

function renderModV(modV) {
    let idx = _cellIdx++;
    if (!modV.length) return `<div class="mod-col" data-cell="${idx}"></div>`;
    let items = modV.map(renderOneMod).join('');
    return `<div class="mod-col" data-cell="${idx}"><div class="mod-stem"></div>${items}</div>`;
}

// ================================================================
//  SVG Reed-Kellogg 다이어그램 — 좌표 기반(선 깨짐 없음)
//   텍스트 폭은 canvas measureText로 동기 측정 → 선·텍스트를 정확히 정렬.
// ================================================================
const _FONT_STACK = '"Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif';
const _FONT_MAIN = '500 22px ' + _FONT_STACK;
const _FONT_MOD = '400 13px ' + _FONT_STACK;
const _RK = {
    line: '#C0504D',                        // 주절(주성분) 빨강 선 — 교재 동일
    sub: '#37352f',                          // 종속·수식 검정 선 (밝은 배경=교재처럼 검정)
    S: '#1a56db', V: '#C0504D', O: '#1aae39', IO: '#5645d4', OC: '#dd5b00', C: '#1a56db',
    mod: '#37352f', restored: '#a4a097',    // 수식어 텍스트=검정 / 생략복원=연회색
};

let _mCanvas = null;
function _measure(text, font) {
    text = text == null ? '' : String(text);
    const fallback = () => text.length * (/22px/.test(font) ? 13.2 : 7.4);
    try {
        if (typeof document === 'undefined' || !document.createElement) return fallback();
        if (!_mCanvas) _mCanvas = document.createElement('canvas');
        const ctx = _mCanvas.getContext && _mCanvas.getContext('2d');
        if (!ctx) return fallback();
        ctx.font = font;
        return ctx.measureText(text).width;
    } catch (e) {
        return fallback();
    }
}

function _sx(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// color 인자 생략 시 주절 빨강(_RK.line). 수식어/받침대는 _RK.sub(검정계열) 전달.
function _line(x1, y1, x2, y2, w, color) {
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color || _RK.line}" stroke-width="${w || 2}" stroke-linecap="round"/>`;
}
function _txt(x, y, t, size, fill, italic) {
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}"${italic ? ' font-style="italic"' : ''}>${_sx(t)}</text>`;
}

// 전치사구 한 줄 메트릭 (받침대 폭)
function _ppMetrics(pp) {
    const parts = pp.trim().split(/\s+/);
    const prep = parts[0];
    const np = _splitNPstr(parts.slice(1));
    const prepW = _measure(prep, _FONT_MOD);
    const nounW = _measure(np.head, _FONT_MOD);
    const modW = (np.mods && np.mods.length) ? Math.max.apply(null, np.mods.map(m => _measure(m, _FONT_MOD))) : 0;
    const width = Math.max(8 + prepW + 12, 22 + nounW, 48 + modW) + 6;
    return { prep, np, prepW, width };
}

// 수식어 1개의 렌더 폭
function _modItemW(m) {
    if (_isPrepPhrase(m)) return _ppMetrics(m).width;
    return 16 + _measure(m, _FONT_MOD);
}

// 전치사구 받침대 SVG (left, top 기준) → {svg, height}
function _ppStandSVG(pp, left, top) {
    const m = _ppMetrics(pp);
    const K = _RK.sub;   // 전치사구 받침대는 검정계열(종속·수식)
    let svg = '';
    const prepBaseY = top + 15;
    const underY = prepBaseY + 5;
    svg += _line(left, top, left, underY, 2, K);                          // 세로 다리
    svg += _txt(left + 8, prepBaseY, m.prep, 13, _RK.mod);               // 전치사
    svg += _line(left, underY, left + Math.max(m.prepW + 14, 46), underY, 2, K); // 명사 받침 가로선
    const nounBaseY = underY + 20;
    svg += _txt(left + 20, nounBaseY, m.np.head, 13, _RK.mod);           // 목적어 명사
    let y = nounBaseY;
    (m.np.mods || []).forEach(mm => {
        y += 19;
        svg += _line(left + 34, y - 11, left + 43, y - 2, 2, K);          // \ 사선
        svg += _txt(left + 47, y, mm, 12, _RK.restored);
    });
    return { svg, height: (y - top) + 10 };
}

// 수식어 블록 총 가로폭 (가로 배치)
function _modRowW(mods) {
    if (!mods || !mods.length) return 0;
    const GAP = 10;
    return mods.map(_modItemW).reduce((a, b) => a + b, 0) + GAP * (mods.length - 1);
}

// cell 아래 수식어 블록 (cx 중심) — 교재처럼 가로로 나란히 배치 → {svg, height, width}
//   · 단어 수식어(관사/형용사)  : \사선 + 단어 를 좌→우로 나열
//   · 전치사구 받침대          : 받침대(세로 다리+가로선+명사+\사선)를 좌→우로 나열
function _modBlockSVG(mods, cx, startY) {
    if (!mods || !mods.length) return { svg: '', height: 0, width: 0 };
    const GAP = 10;
    const widths = mods.map(_modItemW);
    const totalW = _modRowW(mods);
    let left = cx - totalW / 2;
    let svg = '', maxH = 0;
    mods.forEach((m, i) => {
        if (_isPrepPhrase(m)) {
            const r = _ppStandSVG(m, left, startY);     // 받침대는 자체 세로 다리를 baseline에서 시작
            svg += r.svg;
            if (r.height > maxH) maxH = r.height;
        } else {
            const restored = m.startsWith('(');
            svg += _line(left, startY + 2, left + 9, startY + 12, 2, _RK.sub);  // \ 사선(검정계열)
            svg += _txt(left + 13, startY + 13, m, 13, restored ? _RK.restored : _RK.mod, restored);
            if (20 > maxH) maxH = 20;
        }
        left += widths[i] + GAP;
    });
    return { svg, height: maxH, width: totalW };
}

// 메인 다이어그램 SVG 생성
//  opts.mainColor: 메인 baseline·구분선 색. 주절=빨강(_RK.line, 기본) / 종속절=검정(_RK.sub).
function buildDiagramSVG(R, opts) {
    const MC = (opts && opts.mainColor) || _RK.line;   // 메인선 색(주절 빨강 / 종속절 검정)
    const PADX = 22, TOP = 16, STEM = 14;
    const mk = (key, np, color) => ({
        key, text: np.head, color,
        restored: String(np.head).startsWith('('),
        mods: np.mods || []
    });

    // 1) 셀 + 셀 사이 구분자(sepAfter) 구성
    const cells = [];
    const sub = mk('S', R.sub, _RK.S);
    const verb = { key: 'V', text: R.verb, color: _RK.V, restored: false, mods: R.modV || [] };
    sub.sepAfter = 'through';
    cells.push(sub, verb);
    if (R.type === '2형식') { verb.sepAfter = 'slash'; cells.push(mk('C', R.comp, _RK.C)); }
    else if (R.type === '3형식') { verb.sepAfter = 'half'; cells.push(mk('O', R.obj, _RK.O)); }
    else if (R.type === '4형식') { verb.sepAfter = 'half'; const io = mk('IO', R.io, _RK.IO); io.sepAfter = 'half'; cells.push(io, mk('O', R.obj, _RK.O)); }
    else if (R.type === '5형식') { verb.sepAfter = 'half'; const o = mk('O', R.obj, _RK.O); o.sepAfter = 'slash'; cells.push(o, mk('OC', R.oc, _RK.OC)); }

    // 2) 셀 폭(헤드 vs 수식어 블록 중 큰 쪽) + x 좌표
    cells.forEach(c => {
        c.headW = _measure(c.text, _FONT_MAIN);
        c.modW = _modRowW(c.mods);   // 수식어 가로 배치 총폭
        c.cellW = Math.max(c.headW, c.modW) + PADX * 2;
    });
    let x = 0;
    cells.forEach(c => { c.x = x; c.cx = x + c.cellW / 2; x += c.cellW; });
    const mainW = x;

    const textBaseY = TOP + 24;     // 메인 단어 baseline
    const lineY = textBaseY + 8;    // 메인 가로선
    const textTop = TOP - 4;        // 구분자 상단

    let parts = [];
    // 메인 baseline (주절 빨강 / 종속절 검정)
    parts.push(_line(0, lineY, mainW, lineY, 2, MC));
    // 셀 텍스트
    cells.forEach(c => {
        const fill = c.restored ? _RK.restored : c.color;
        parts.push(`<text x="${c.cx.toFixed(1)}" y="${textBaseY}" text-anchor="middle" font-size="22" font-weight="500" fill="${fill}"${c.restored ? ' font-style="italic"' : ''}>${_sx(c.text)}</text>`);
    });
    // 구분자 (메인선 색 따름)
    cells.forEach((c, i) => {
        if (!c.sepAfter || !cells[i + 1]) return;
        const bx = cells[i + 1].x;
        if (c.sepAfter === 'through') parts.push(_line(bx, textTop, bx, lineY + 12, 2.5, MC));
        else if (c.sepAfter === 'half') parts.push(_line(bx, textTop, bx, lineY, 2.5, MC));
        else if (c.sepAfter === 'slash') parts.push(_line(bx, lineY, bx + 22, textTop, 2.5, MC)); // 보어 / 사선
    });
    // 수식어 블록 (교재처럼 baseline 바로 아래 가로 배치 — 별도 stem 없이 각 수식어가 직접 매닲)
    // S-V 관통선(through)이 baseline 아래 12px까지 내려가므로 높이에 반영(선 돌출/클리핑 방지)
    let maxBottom = lineY + 13;
    cells.forEach(c => {
        if (!c.mods || !c.mods.length) return;
        const blk = _modBlockSVG(c.mods, c.cx, lineY + 2);
        parts.push(blk.svg);
        const bottom = lineY + 2 + blk.height;
        if (bottom > maxBottom) maxBottom = bottom;
    });

    const W = Math.ceil(mainW + 4), H = Math.ceil(maxBottom + 10);
    return `<svg class="rk-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family='${_FONT_STACK}'>${parts.join('')}</svg>`;
}

// ================================================================
//  교수님 스타일 해설 생성
// ================================================================
function getTypeExplanation(R) {
    const vb = esc(R.verb);
    // 성분 구조화 원칙: 명사 뼈대 원칙에 따른 해설
    let extra = '';
    // (one)/(ones) 복원 설명
    if (R.comp.head === '(one)') {
        extra = ' 형용사 보어는 불완전한 뼈대이므로 명사 <strong>(one)</strong>을 복원하고, 형용사는 수식어로 낙하합니다.';
    }
    if (R.oc.head === '(ones)' && R.oc.mods.length > 0) {
        const mod = esc(R.oc.mods[0]);
        if (mod.startsWith('to ')) {
            extra = ` 목적어보어 자리에 명사 <strong>(ones)</strong>를 복원하고, <strong>${mod}</strong>은 형용사구로서 (ones)를 수식합니다.`;
        } else {
            extra = ` 목적어보어 자리에 명사 <strong>(ones)</strong>를 복원하고, <strong>${mod}</strong>은 원형부정사로서 (ones)를 수식합니다.`;
        }
    }
    switch (R.type) {
        case '1형식':
            return `동사 <strong>${vb}</strong> 뒤에 목적어/보어 없이 문장이 완성되므로 <strong>1형식</strong>입니다.`;
        case '2형식':
            if (R.passive) {
                let p = `수동태(be+과거분사)는 양박사 체계에서 항상 <strong>2형식</strong>입니다. <strong>be</strong>가 동사, <strong>${esc(R.comp.head)}</strong>(과거분사)가 형용사 보어입니다 (능동태의 형식이 강등됨).`;
                if (R.restoredInf) {
                    p += ` 지각·사역동사 수동태에서는 능동태의 <strong>원형부정사</strong>가 <strong>to부정사</strong>로 복원됩니다 — 능동태의 원형부정사가 이 문장에서 <strong>${esc(R.restoredInf)}</strong>로 바뀌었습니다 (예: They saw him go → He was seen <strong>to go</strong>).`;
                }
                return p + extra;
            }
            return `동사 <strong>${vb}</strong> 뒤에 명사/형용사가 와서 주어와 <strong>이퀄(=) 관계</strong>이므로 <strong>2형식</strong>입니다.` + extra;
        case '3형식':
            if (R.objIsInf) {
                return `동사 <strong>${vb}</strong> 뒤의 <strong>${esc(R.obj.head)}</strong>은 to부정사의 <strong>명사적 용법(목적어)</strong>입니다. 목적어가 1개이므로 <strong>3형식</strong>입니다.`;
            }
            return `동사 <strong>${vb}</strong> 뒤에 명사 1개가 와서 주어와 <strong>이퀄 관계가 아니므로</strong> (목적어) <strong>3형식</strong>입니다.`;
        case '4형식':
            return `동사 <strong>${vb}</strong> 뒤에 명사 2개가 와서 <strong>"~에게 ~을"</strong> 수여 의미이므로 <strong>4형식</strong>입니다.`;
        case '5형식':
            return `동사 <strong>${vb}</strong> 뒤에 목적어와 목적어보어가 와서 <strong>목적어 = 목적어보어</strong> 관계이므로 <strong>5형식</strong>입니다.` + extra;
        default:
            return '';
    }
}

function getRoleDescriptions() {
    return {
        S: '문장의 주인공',
        V: '행위/동작/상태를 서술',
        'S.C': '주어의 성질/상태를 보충 설명 (주어 = 주어보어)',
        IO: '행위의 대상(~에게)',
        O: '행위의 대상(~을/를)',
        'O.C': '목적어의 성질/상태를 보충 설명 (목적어 = 목적어보어)',
        M: '동사를 꾸며주는 부사(구)'
    };
}

// ================================================================
//  분석 히스토리 (localStorage)
// ================================================================
const HISTORY_KEY = 'yangeng_history';
const HISTORY_MAX = 10;

function loadHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch { return []; }
}

function saveToHistory(sentence) {
    let hist = loadHistory();
    // 중복 제거 (같은 문장이면 맨 앞으로)
    hist = hist.filter(h => h !== sentence);
    hist.unshift(sentence);
    if (hist.length > HISTORY_MAX) hist = hist.slice(0, HISTORY_MAX);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
}

function renderHistory() {
    const container = document.getElementById('history-area');
    if (!container) return;
    const hist = loadHistory();
    if (!hist.length) {
        container.innerHTML = '';
        return;
    }
    const items = hist.map((s, i) =>
        `<button class="history-item" data-idx="${i}" title="${esc(s)}">${esc(s)}</button>`
    ).join('');
    container.innerHTML = `
        <div class="history-section">
            <div class="history-header">
                <span class="history-title">최근 분석</span>
                <button class="history-clear" onclick="clearHistory()">전체 삭제</button>
            </div>
            <div class="history-list">${items}</div>
        </div>
    `;
    container.querySelectorAll('.history-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const sentence = hist[parseInt(btn.dataset.idx)];
            document.getElementById('inp').value = sentence;
            go();
        });
    });
}

function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
}

// ================================================================
//  결과 텍스트 복사
// ================================================================
function buildCopyText(R) {
    let parts = [];
    parts.push(`${R.orig} → ${R.type} ${R.typeKo}`);
    parts.push(`S: ${R.sub.head}${R.sub.mods.length ? ' [수식: ' + R.sub.mods.join(', ') + ']' : ''}`);
    parts.push(`V: ${R.verb}`);
    if (R.comp.head) parts.push(`S.C: ${R.comp.head}${R.comp.mods.length ? ' [수식: ' + R.comp.mods.join(', ') + ']' : ''}`);
    if (R.io.head) parts.push(`I.O: ${R.io.head}${R.io.mods.length ? ' [수식: ' + R.io.mods.join(', ') + ']' : ''}`);
    if (R.obj.head) parts.push(`O: ${R.obj.head}${R.obj.mods.length ? ' [수식: ' + R.obj.mods.join(', ') + ']' : ''}`);
    if (R.oc.head) parts.push(`O.C: ${R.oc.head}${R.oc.mods.length ? ' [수식: ' + R.oc.mods.join(', ') + ']' : ''}`);
    if (R.modV.length) parts.push(`M: ${R.modV.join(', ')}`);
    return parts.join(' | ');
}

function copyResult() {
    const btn = document.getElementById('copy-btn');
    if (!btn) return;
    const text = btn.dataset.copyText || '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '복사 완료!';
        setTimeout(() => { btn.textContent = '결과 복사'; }, 1500);
    }).catch(() => {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.textContent = '복사 완료!';
        setTimeout(() => { btn.textContent = '결과 복사'; }, 1500);
    });
}

// ================================================================
//  메인 렌더 함수
// ================================================================
let _lastResult = null;

// ================================================================
//  종속절(복문) 분석 패널 — 강의: 명사절/형용사절/부사절 + 각 절의 형식
// ================================================================
function renderClauses(R) {
    if (!R.clauses || !R.clauses.length) return '';
    const items = R.clauses.map(cl => {
        const r = cl.result;
        if (!r) return '';
        let comp = [`<span class="tag tS">S</span> ${esc(r.sub.head)}`, `<span class="tag tV">V</span> ${esc(r.verb)}`];
        if (r.comp.head) comp.push(`<span class="tag tC">S.C</span> ${esc(r.comp.head)}`);
        if (r.io.head) comp.push(`<span class="tag tIO">I.O</span> ${esc(r.io.head)}`);
        if (r.obj.head) comp.push(`<span class="tag tO">O</span> ${esc(r.obj.head)}`);
        if (r.oc.head) comp.push(`<span class="tag tOC">O.C</span> ${esc(r.oc.head)}`);
        if (r.modV.length) comp.push(`<span class="tag tM">M</span> ${r.modV.map(esc).join(', ')}`);
        const ante = cl.antecedent ? ` <span class="clause-ante">선행사: ${esc(cl.antecedent)}</span>` : '';
        // 종속절은 검정 테마 SVG 다이어그램으로 (주절=빨강과 구분)
        let clauseSVG = '';
        try { clauseSVG = buildDiagramSVG(r, { mainColor: _RK.sub }); } catch (e) { clauseSVG = ''; }
        return `
            <div class="clause-item clause-${cl.relation}">
                <div class="clause-head">
                    <span class="clause-rel">${esc(cl.relation)}</span>
                    <span class="clause-conn">${esc(cl.connector)}</span>
                    <span class="r-badge badge-${r.type[0]}">${r.type} ${r.typeKo}</span>${ante}
                </div>
                <div class="clause-orig">${esc(cl.orig)}</div>
                ${clauseSVG ? `<div class="clause-diagram">${clauseSVG}</div>` : ''}
                <div class="clause-detail">${comp.join(' &nbsp;·&nbsp; ')}</div>
            </div>`;
    }).join('');
    return `<div class="clause-section">
        <div class="clause-title">종속절 분석 <span class="clause-sub">복문 · 주절 + 종속절 ${R.clauses.length}개</span></div>
        ${items}
    </div>`;
}

function render(R) {
    _lastResult = R;
    const c = document.getElementById('result');
    _cellIdx = 0; // reset

    const diagramSVG = buildDiagramSVG(R);

    let verbInfo = R.verbSub ? ` · ${R.verbSub}` : '';
    const roles = getRoleDescriptions();

    // 상세 분석 — 양박사님 용어 적용
    let det = [];
    det.push(`<span class="tag tS">S</span> 주어: <strong>${esc(R.sub.head)}</strong>${R.sub.mods.length ? ' <small style="color:#999">(수식: ' + R.sub.mods.map(esc).join(', ') + ')</small>' : ''} <small class="role-desc">— ${roles.S}</small>`);
    det.push(`<span class="tag tV">V</span> 동사: <strong>${esc(R.verb)}</strong> <small class="role-desc">— ${roles.V}</small>`);
    if (R.comp.head) det.push(`<span class="tag tC">S.C</span> 주어보어: <strong>${esc(R.comp.head)}</strong>${R.comp.mods.length ? ' <small style="color:#999">(수식: ' + R.comp.mods.map(esc).join(', ') + ')</small>' : ''} <small class="role-desc">— ${roles['S.C']}</small>`);
    if (R.io.head) det.push(`<span class="tag tIO">I.O</span> 간접목적어: <strong>${esc(R.io.head)}</strong>${R.io.mods.length ? ' <small style="color:#999">(수식: ' + R.io.mods.map(esc).join(', ') + ')</small>' : ''} <small class="role-desc">— ${roles.IO}</small>`);
    if (R.obj.head) det.push(`<span class="tag tO">O</span> 목적어: <strong>${esc(R.obj.head)}</strong>${R.obj.mods.length ? ' <small style="color:#999">(수식: ' + R.obj.mods.map(esc).join(', ') + ')</small>' : ''} <small class="role-desc">— ${roles.O}</small>`);
    if (R.oc.head) det.push(`<span class="tag tOC">O.C</span> 목적어보어: <strong>${esc(R.oc.head)}</strong>${R.oc.mods.length ? ' <small style="color:#999">(수식: ' + R.oc.mods.map(esc).join(', ') + ')</small>' : ''} <small class="role-desc">— ${roles['O.C']}</small>`);
    if (R.modV.length) det.push(`<span class="tag tM">M</span> 동사 수식: ${R.modV.map(esc).join(', ')} <small class="role-desc">— ${roles.M}</small>`);

    // 교수님 스타일 해설
    const explanation = getTypeExplanation(R);

    // 복사용 텍스트
    const copyText = buildCopyText(R);

    c.innerHTML = `
        <div class="result-card">
            <div class="r-badge-area">
                <div class="r-badge badge-${R.type[0]}">${R.type} ${R.typeKo} — ${R.verbStyle}</div>
                <span class="r-sent-type">${R.sentType}${verbInfo}</span>
            </div>
            <div class="r-original">${esc(R.orig)}</div>
            <div class="r-translation" id="translation-area"><span class="translation-loading">번역 중...</span></div>
            ${R.warnings && R.warnings.length ? R.warnings.map(w => `<div class="r-warning"><span class="warn-icon">⚠</span> ${esc(w)}</div>`).join('') : ''}
            <div class="r-diagram-wrap">
                <div class="r-diagram">${diagramSVG}</div>
            </div>
            <div class="r-explanation">${explanation}</div>
            ${renderClauses(R)}
            <div class="r-detail">${det.join('<br>')}</div>
            <div class="r-actions">
                <button id="copy-btn" class="btn-copy" data-copy-text="${esc(copyText).replace(/"/g, '&quot;')}" onclick="copyResult()">결과 복사</button>
            </div>
        </div>
    `;

    // 결과 영역 포커스
    c.setAttribute('tabindex', '-1');
    c.focus({ preventScroll: true });

    // 비동기 번역 (SVG는 좌표 기반이라 사후 측정 불필요)
    translateText(R.orig);
}

function go() {
    const v = document.getElementById('inp').value.trim();
    if (!v) {            // 빈 입력이면 홈으로
        goHome();
        return;
    }
    const { results, conjunctions } = parseMulti(v);
    if (results.length === 0) {   // 분석 불가(너무 짧거나 문장이 아님)
        document.body.classList.add('searched');
        document.getElementById('result').innerHTML =
            `<div class="result-notice">분석할 수 없는 입력이에요. <strong>주어와 동사를 갖춘 영어 문장</strong>을 입력해 보세요. (예: She gave him a book.)</div>`;
        const sp = document.getElementById('spell-area'); if (sp) sp.innerHTML = '';
        saveToHistory(v); renderHistory();
        return;
    }
    if (results.length === 1) {
        render(results[0]);
    } else if (results.length > 1) {
        renderMulti(results, conjunctions);
    }
    document.body.classList.add('searched');   // 홈 → 결과 화면 전환
    saveToHistory(v);
    renderHistory();
    // 비동기 맞춤법/문법 체크
    checkSpelling(v);
    window.scrollTo({ top: 0, behavior: 'auto' });
}

// 로고 클릭 → 홈(처음 화면)으로 복귀
function goHome() {
    document.body.classList.remove('searched');
    document.getElementById('result').innerHTML = '';
    const sp = document.getElementById('spell-area');
    if (sp) sp.innerHTML = '';
    const inp = document.getElementById('inp');
    if (inp) { inp.value = ''; inp.focus(); }
    renderHistory();
    window.scrollTo({ top: 0, behavior: 'auto' });
}

// 복수 문장 렌더링 — 가로 한 줄 배치
function renderMulti(results, conjunctions) {
    const c = document.getElementById('result');
    _lastResult = results[0];
    conjunctions = conjunctions || [];

    // 원문 전체
    const fullOrig = results.map(R => R.orig).join(' + ');

    // 뱃지 영역: 각 절의 형식 뱃지를 나란히
    let badgeItems = results.map((R, i) => {
        let verbInfo = R.verbSub ? ` · ${R.verbSub}` : '';
        return `<div class="multi-badge-item">
            <span class="clause-num">${i + 1}</span>
            <div class="r-badge badge-${R.type[0]}">${R.type} ${R.typeKo} — ${R.verbStyle}</div>
            <span class="r-sent-type">${R.sentType}${verbInfo}</span>
        </div>`;
    }).join('');

    // 다이어그램 영역: 각 절의 SVG 다이어그램을 가로로 나란히 + 접속사
    let diagramPanels = '';
    results.forEach((R, i) => {
        // 접속사 표시 (이전 절과 현재 절 사이)
        if (i > 0 && conjunctions[i - 1]) {
            diagramPanels += `<div class="multi-conj"><span class="conj-word">${esc(conjunctions[i - 1])}</span></div>`;
        }
        diagramPanels += `<div class="multi-diagram-panel" id="panel-${i}">
            <div class="r-diagram" id="diagram-${i}">${buildDiagramSVG(R)}</div>
        </div>`;
    });

    // 상세 분석: 아래에 합쳐서 번호로 표시
    let detailLines = '';
    results.forEach((R, i) => {
        let parts = [];
        parts.push(`S:<strong>${esc(R.sub.head)}</strong>`);
        parts.push(`V:<strong>${esc(R.verb)}</strong>`);
        if (R.comp.head) parts.push(`S.C:<strong>${esc(R.comp.head)}</strong>${R.comp.mods.length ? ' <small style="color:#999">[수식: ' + R.comp.mods.map(esc).join(', ') + ']</small>' : ''}`);
        if (R.io.head) parts.push(`I.O:<strong>${esc(R.io.head)}</strong>${R.io.mods.length ? ' <small style="color:#999">[수식: ' + R.io.mods.map(esc).join(', ') + ']</small>' : ''}`);
        if (R.obj.head) parts.push(`O:<strong>${esc(R.obj.head)}</strong>${R.obj.mods.length ? ' <small style="color:#999">[수식: ' + R.obj.mods.map(esc).join(', ') + ']</small>' : ''}`);
        if (R.oc.head) parts.push(`O.C:<strong>${esc(R.oc.head)}</strong>${R.oc.mods.length ? ' <small style="color:#999">[수식: ' + R.oc.mods.map(esc).join(', ') + ']</small>' : ''}`);
        if (R.modV.length) parts.push(`M:${R.modV.map(esc).join(', ')}`);
        detailLines += `<div class="multi-detail-line"><span class="clause-num">${i + 1}</span> <span class="tag badge-${R.type[0]}" style="color:#fff;background:var(--badge-${R.type[0]})">${R.type}</span> ${parts.join(' &nbsp;')}</div>`;
    });

    c.innerHTML = `
        <div class="result-card">
            <div class="r-badge-area multi-badge-area">
                ${badgeItems}
            </div>
            <div class="r-original">
                <span class="multi-tag">중문 · ${results.length}절</span>
                ${esc(fullOrig)}
            </div>
            <div class="r-translation" id="translation-area"><span class="translation-loading">번역 중...</span></div>
            <div class="r-diagram-wrap multi-diagram-wrap">
                <div class="multi-diagram-row">
                    ${diagramPanels}
                </div>
            </div>
            <div class="r-detail multi-detail">
                ${detailLines}
            </div>
        </div>
    `;

    c.setAttribute('tabindex', '-1');
    c.focus({ preventScroll: true });

    // 비동기 번역 — 각 절 개별 번역 (SVG는 사후 측정 불필요)
    translateMulti(results.map(R => R.orig));
}

// ================================================================
//  번역 (MyMemory API — 무료, 키 불필요)
// ================================================================
async function translateOne(text) {
    try {
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data[0]) return data[0].map(s => s[0]).join('');
    } catch (e) {}
    return null;
}

async function translateText(text) {
    const el = document.getElementById('translation-area');
    if (!el) return;
    const translated = await translateOne(text);
    if (translated) {
        el.innerHTML = `<span class="translation-text">해석: ${esc(translated)}</span><span class="translation-auto">(자동 번역)</span>`;
    } else {
        el.innerHTML = '';
    }
}

// 중문: 각 절을 개별 번역
async function translateMulti(parts) {
    const el = document.getElementById('translation-area');
    if (!el) return;
    const translations = await Promise.all(parts.map(p => translateOne(p)));
    const valid = translations.filter(t => t);
    if (valid.length > 0) {
        el.innerHTML = `<span class="translation-text">해석: ${valid.map(t => esc(t)).join(' / ')}</span><span class="translation-auto">(자동 번역)</span>`;
    } else {
        el.innerHTML = '';
    }
}

// ================================================================
//  키보드 접근성
// ================================================================
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const inp = document.getElementById('inp');
        inp.value = '';
        inp.focus();
    }
});

// ================================================================
//  LanguageTool 맞춤법/문법 체크
// ================================================================
let _spellReqId = 0; // 레이스 컨디션 방지용 요청 카운터

async function checkSpelling(text, keepOpen) {
    const container = document.getElementById('spell-area');
    if (!container) return;
    container.innerHTML = '';

    const reqId = ++_spellReqId; // 현재 요청 ID

    try {
        const res = await fetch('https://api.languagetool.org/v2/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `text=${encodeURIComponent(text)}&language=en-US`
        });
        // 응답이 도착했을 때 이미 새 요청이 시작됐으면 무시
        if (reqId !== _spellReqId) return;
        if (!res.ok) return;
        const data = await res.json();
        if (reqId !== _spellReqId) return;
        if (!data.matches || data.matches.length === 0) return;

        // 대소문자 규칙은 제외 — 문장 첫 글자 대문자, 'i → I' 등은 굳이 잡지 않음.
        // ※ LanguageTool은 'i→I'를 CASING이 아니라 TYPOS/I_LOWERCASE 로 주므로 ruleId도 함께 본다.
        const CASING_RULES = new Set(['I_LOWERCASE', 'UPPERCASE_SENTENCE_START']);
        const matches = data.matches.filter(m => {
            const rule = m.rule || {};
            const cat = rule.category && rule.category.id;
            if (cat === 'CASING') return false;
            if (CASING_RULES.has(rule.id)) return false;
            return true;
        });
        if (matches.length === 0) return;

        const count = matches.length;
        const items = matches.map(m => {
            const orig = text.substring(m.offset, m.offset + m.length);
            const suggestion = m.replacements.length > 0 ? m.replacements[0].value : null;
            const fix = suggestion
                ? `<span class="spell-orig">${esc(orig)}</span> → <span class="spell-fix">${esc(suggestion)}</span>`
                : `<span class="spell-orig">${esc(orig)}</span>`;
            return `<div class="spell-item">
                <span class="spell-msg">${fix} <span class="spell-desc">${esc(m.message)}</span></span>
                ${suggestion ? `<button class="spell-apply" onclick="applyFix(${m.offset},${m.length},'${esc(suggestion).replace(/'/g,"\\'")}')">적용</button>` : ''}
            </div>`;
        }).join('');

        container.innerHTML = `
            <div class="spell-section${keepOpen ? ' spell-open' : ''}">
                <div class="spell-summary" onclick="this.parentElement.classList.toggle('spell-open')">
                    <span class="spell-icon">!</span>
                    <span>${count}개의 오류가 발견되었습니다</span>
                    <span class="spell-toggle">펼치기</span>
                </div>
                <div class="spell-details">${items}</div>
            </div>`;
    } catch (e) {
        // 네트워크 오류 시 무시
    }
}

function applyFix(offset, length, fix) {
    // offset/length로 정확한 위치의 문자를 교체 (단순 replace는 첫 매치만 잡음)
    const inp = document.getElementById('inp');
    const current = inp.value;
    const updated = current.substring(0, offset) + fix + current.substring(offset + length);
    if (updated === current) return;
    inp.value = updated;

    const v = inp.value.trim();
    if (!v) return;
    const { results, conjunctions } = parseMulti(v);
    if (results.length === 1) render(results[0]);
    else if (results.length > 1) renderMulti(results, conjunctions);
    saveToHistory(v);
    renderHistory();
    checkSpelling(v, true);
}


// ================================================================
//  초기화: 히스토리 렌더
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    renderHistory();
});
