// ================================================================
//  렌더링 엔진 — renderer.js
// ================================================================

function esc(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

let _cellIdx = 0;

function renderModCol(np) {
    let idx = _cellIdx++;
    let mods = np.mods ? [...np.mods] : [];
    if (!mods.length) return `<div class="mod-col" data-cell="${idx}"></div>`;
    let items = mods.map(m => {
        const cls = m.startsWith('(') ? ' restored' : '';
        return `<div class="mod-item"><span class="mod-text${cls}">${esc(m)}</span></div>`;
    }).join('');
    return `<div class="mod-col" data-cell="${idx}"><div class="mod-stem"></div>${items}</div>`;
}

function renderModV(modV) {
    let idx = _cellIdx++;
    if (!modV.length) return `<div class="mod-col" data-cell="${idx}"></div>`;
    let items = modV.map(m =>
        `<div class="mod-item"><span class="mod-text">${esc(m)}</span></div>`
    ).join('');
    return `<div class="mod-col" data-cell="${idx}"><div class="mod-stem"></div>${items}</div>`;
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
            return `동사 <strong>${vb}</strong> 뒤에 명사/형용사가 와서 주어와 <strong>이퀄(=) 관계</strong>이므로 <strong>2형식</strong>입니다.` + extra;
        case '3형식':
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

function render(R) {
    _lastResult = R;
    const c = document.getElementById('result');
    _cellIdx = 0; // reset

    let cells = '', modCols = '';
    const subCls = R.sub.head.startsWith('(') ? ' restored' : '';

    // S | V (항상) — data-idx matches mod-col data-cell
    cells += `<div class="m-cell" data-idx="0"><div class="m-word${subCls ? ' ' + subCls : ''}">${esc(R.sub.head)}</div></div>`;
    cells += `<div class="m-sep"><div class="m-sep-v"></div></div>`;
    cells += `<div class="m-cell" data-idx="1"><div class="m-word verb-color">${esc(R.verb)}</div></div>`;

    let modSub = renderModCol(R.sub);   // data-cell="0"
    let modVerb = renderModV(R.modV);   // data-cell="1"

    if (R.type === '2형식') {
        cells += `<div class="m-sep"><div class="m-sep-s"></div></div>`;
        const cc = R.comp.head.startsWith('(') ? ' restored' : '';
        cells += `<div class="m-cell" data-idx="2"><div class="m-word${cc ? ' ' + cc : ''}">${esc(R.comp.head)}</div></div>`;
        modCols = modSub + modVerb + renderModCol(R.comp);
    } else if (R.type === '3형식') {
        cells += `<div class="m-sep"><div class="m-sep-v"></div></div>`;
        cells += `<div class="m-cell" data-idx="2"><div class="m-word obj-color">${esc(R.obj.head)}</div></div>`;
        modCols = modSub + modVerb + renderModCol(R.obj);
    } else if (R.type === '4형식') {
        cells += `<div class="m-sep"><div class="m-sep-v"></div></div>`;
        cells += `<div class="m-cell" data-idx="2"><div class="m-word io-color">${esc(R.io.head)}</div></div>`;
        cells += `<div class="m-sep"><div class="m-sep-v"></div></div>`;
        cells += `<div class="m-cell" data-idx="3"><div class="m-word obj-color">${esc(R.obj.head)}</div></div>`;
        modCols = modSub + modVerb + renderModCol(R.io) + renderModCol(R.obj);
    } else if (R.type === '5형식') {
        cells += `<div class="m-sep"><div class="m-sep-v"></div></div>`;
        cells += `<div class="m-cell" data-idx="2"><div class="m-word obj-color">${esc(R.obj.head)}</div></div>`;
        cells += `<div class="m-sep"><div class="m-sep-s"></div></div>`;
        cells += `<div class="m-cell" data-idx="3"><div class="m-word oc-color">${esc(R.oc.head)}</div></div>`;
        modCols = modSub + modVerb + renderModCol(R.obj) + renderModCol(R.oc);
    } else {
        modCols = modSub + modVerb;
    }

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
                <div class="r-diagram">
                    <div class="main-row">${cells}</div>
                    <div class="m-line" id="ml"></div>
                    <div class="mod-row" id="mr">${modCols}</div>
                </div>
            </div>
            <div class="r-explanation">${explanation}</div>
            <div class="r-detail">${det.join('<br>')}</div>
            <div class="r-actions">
                <button id="copy-btn" class="btn-copy" data-copy-text="${esc(copyText).replace(/"/g, '&quot;')}" onclick="copyResult()">결과 복사</button>
            </div>
        </div>
    `;

    // 결과 영역 포커스
    c.setAttribute('tabindex', '-1');
    c.focus({ preventScroll: true });

    requestAnimationFrame(() => {
        const row = document.querySelector('.main-row');
        const ml = document.getElementById('ml');
        const mr = document.getElementById('mr');
        if (!row || !ml) return;

        const w = row.offsetWidth;
        ml.style.width = w + 'px';

        if (!mr) return;
        mr.style.width = w + 'px';

        // mod-col을 대응하는 m-cell 정중앙에 배치
        const diagramLeft = row.getBoundingClientRect().left;
        const modCols = mr.querySelectorAll('.mod-col[data-cell]');
        let maxBottom = 0;

        modCols.forEach(col => {
            const idx = col.getAttribute('data-cell');
            const cell = row.querySelector(`.m-cell[data-idx="${idx}"]`);
            if (!cell) return;

            const cellRect = cell.getBoundingClientRect();
            const centerX = cellRect.left + cellRect.width / 2 - diagramLeft;
            col.style.left = centerX + 'px';

            // 높이 측정
            const h = col.offsetHeight;
            if (h > maxBottom) maxBottom = h;
        });

        mr.style.minHeight = maxBottom + 'px';

        // 긴 문장: 다이어그램 래핑 스크롤 보정
        const wrap = document.querySelector('.r-diagram-wrap');
        if (wrap && row.scrollWidth > wrap.clientWidth) {
            wrap.style.overflowX = 'auto';
            wrap.style.webkitOverflowScrolling = 'touch';
        }
    });

    // 비동기 번역
    translateText(R.orig);
}

function go() {
    const v = document.getElementById('inp').value.trim();
    if (!v) {
        document.getElementById('result').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d0d0d0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>
                </div>
                <p>문장을 입력하면 구조도가 여기에 표시됩니다</p>
            </div>`;
        return;
    }
    const { results, conjunctions } = parseMulti(v);
    if (results.length === 1) {
        render(results[0]);
    } else if (results.length > 1) {
        renderMulti(results, conjunctions);
    }
    saveToHistory(v);
    renderHistory();
    // 비동기 맞춤법/문법 체크
    checkSpelling(v);
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

    // 다이어그램 영역: 각 절의 다이어그램을 가로로 나란히 + 접속사
    let diagramPanels = '';
    results.forEach((R, i) => {
        _cellIdx = 0; // 각 절마다 0부터 시작 (절별 diagram 내부에서만 사용)
        let cells = '', modCols = '';
        const subCls = R.sub.head.startsWith('(') ? ' restored' : '';

        // S cell: data-idx="0"
        cells += `<div class="m-cell" data-idx="0"><div class="m-word${subCls ? ' ' + subCls : ''}">${esc(R.sub.head)}</div></div>`;
        cells += `<div class="m-sep"><div class="m-sep-v"></div></div>`;
        // V cell: data-idx="1"
        cells += `<div class="m-cell" data-idx="1"><div class="m-word verb-color">${esc(R.verb)}</div></div>`;

        // renderModCol/renderModV use _cellIdx++ internally
        // so data-cell will be 0, 1, 2, ... matching data-idx
        let modSub = renderModCol(R.sub);   // data-cell="0"
        let modVerb = renderModV(R.modV);   // data-cell="1"

        if (R.type === '2형식') {
            cells += `<div class="m-sep"><div class="m-sep-s"></div></div>`;
            const cc = R.comp.head.startsWith('(') ? ' restored' : '';
            cells += `<div class="m-cell" data-idx="2"><div class="m-word${cc ? ' ' + cc : ''}">${esc(R.comp.head)}</div></div>`;
            modCols = modSub + modVerb + renderModCol(R.comp); // data-cell="2"
        } else if (R.type === '3형식') {
            cells += `<div class="m-sep"><div class="m-sep-v"></div></div>`;
            cells += `<div class="m-cell" data-idx="2"><div class="m-word obj-color">${esc(R.obj.head)}</div></div>`;
            modCols = modSub + modVerb + renderModCol(R.obj); // data-cell="2"
        } else if (R.type === '4형식') {
            cells += `<div class="m-sep"><div class="m-sep-v"></div></div>`;
            cells += `<div class="m-cell" data-idx="2"><div class="m-word io-color">${esc(R.io.head)}</div></div>`;
            cells += `<div class="m-sep"><div class="m-sep-v"></div></div>`;
            cells += `<div class="m-cell" data-idx="3"><div class="m-word obj-color">${esc(R.obj.head)}</div></div>`;
            modCols = modSub + modVerb + renderModCol(R.io) + renderModCol(R.obj); // data-cell="2","3"
        } else if (R.type === '5형식') {
            cells += `<div class="m-sep"><div class="m-sep-v"></div></div>`;
            cells += `<div class="m-cell" data-idx="2"><div class="m-word obj-color">${esc(R.obj.head)}</div></div>`;
            cells += `<div class="m-sep"><div class="m-sep-s"></div></div>`;
            cells += `<div class="m-cell" data-idx="3"><div class="m-word oc-color">${esc(R.oc.head)}</div></div>`;
            modCols = modSub + modVerb + renderModCol(R.obj) + renderModCol(R.oc); // data-cell="2","3"
        } else {
            modCols = modSub + modVerb;
        }

        // 접속사 표시 (이전 절과 현재 절 사이)
        if (i > 0 && conjunctions[i - 1]) {
            diagramPanels += `<div class="multi-conj"><span class="conj-word">${esc(conjunctions[i - 1])}</span></div>`;
        }

        diagramPanels += `<div class="multi-diagram-panel" id="panel-${i}">
            <div class="r-diagram" id="diagram-${i}">
                <div class="main-row">${cells}</div>
                <div class="m-line" id="ml-${i}"></div>
                <div class="mod-row" id="mr-${i}">${modCols}</div>
            </div>
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

    requestAnimationFrame(() => {
        results.forEach((R, i) => {
            const row = document.querySelector(`#diagram-${i} .main-row`);
            const ml = document.getElementById(`ml-${i}`);
            const mr = document.getElementById(`mr-${i}`);
            if (!row || !ml) return;
            ml.style.width = row.offsetWidth + 'px';
            if (!mr) return;
            mr.style.width = row.offsetWidth + 'px';
            const diagramLeft = row.getBoundingClientRect().left;
            mr.querySelectorAll('.mod-col[data-cell]').forEach(col => {
                const idx = col.getAttribute('data-cell');
                const cell = row.querySelector(`.m-cell[data-idx="${idx}"]`);
                if (!cell) return;
                const cellRect = cell.getBoundingClientRect();
                col.style.left = (cellRect.left + cellRect.width / 2 - diagramLeft) + 'px';
            });
            let maxH = 0;
            mr.querySelectorAll('.mod-col').forEach(col => { if (col.offsetHeight > maxH) maxH = col.offsetHeight; });
            mr.style.minHeight = maxH + 'px';
        });
    });

    // 비동기 번역 — 각 절 개별 번역
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

        const count = data.matches.length;
        const items = data.matches.map(m => {
            const orig = text.substring(m.offset, m.offset + m.length);
            const suggestion = m.replacements.length > 0 ? m.replacements[0].value : null;
            const fix = suggestion
                ? `<span class="spell-orig">${esc(orig)}</span> → <span class="spell-fix">${esc(suggestion)}</span>`
                : `<span class="spell-orig">${esc(orig)}</span>`;
            return `<div class="spell-item">
                <span class="spell-msg">${fix} <span class="spell-desc">${esc(m.message)}</span></span>
                ${suggestion ? `<button class="spell-apply" onclick="applyFix('${esc(orig).replace(/'/g,"\\'")}','${esc(suggestion).replace(/'/g,"\\'")}')">적용</button>` : ''}
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

function applyFix(orig, fix) {
    // 현재 입력값에서 교체 (stale 데이터 방지)
    const inp = document.getElementById('inp');
    const current = inp.value;
    const updated = current.replace(orig, fix);
    if (updated === current) return; // 교체 실패 시 무시
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
