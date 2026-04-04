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

function render(R) {
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

    // 상세 분석
    let det = [];
    det.push(`<span class="tag tS">S</span> 주어: <strong>${esc(R.sub.head)}</strong>${R.sub.mods.length ? ' <small style="color:#999">(수식: ' + R.sub.mods.map(esc).join(', ') + ')</small>' : ''}`);
    det.push(`<span class="tag tV">V</span> 동사: <strong>${esc(R.verb)}</strong>`);
    if (R.comp.head) det.push(`<span class="tag tC">C</span> 보어: <strong>${esc(R.comp.head)}</strong>${R.comp.mods.length ? ' <small style="color:#999">(수식: ' + R.comp.mods.map(esc).join(', ') + ')</small>' : ''}`);
    if (R.io.head) det.push(`<span class="tag tIO">I.O</span> 간접목적어: <strong>${esc(R.io.head)}</strong>${R.io.mods.length ? ' <small style="color:#999">(수식: ' + R.io.mods.map(esc).join(', ') + ')</small>' : ''}`);
    if (R.obj.head) det.push(`<span class="tag tO">O</span> 목적어: <strong>${esc(R.obj.head)}</strong>${R.obj.mods.length ? ' <small style="color:#999">(수식: ' + R.obj.mods.map(esc).join(', ') + ')</small>' : ''}`);
    if (R.oc.head) det.push(`<span class="tag tOC">O.C</span> 목적보어: <strong>${esc(R.oc.head)}</strong>${R.oc.mods.length ? ' <small style="color:#999">(수식: ' + R.oc.mods.map(esc).join(', ') + ')</small>' : ''}`);
    if (R.modV.length) det.push(`<span class="tag tM">M</span> 동사 수식: ${R.modV.map(esc).join(', ')}`);

    c.innerHTML = `
        <div class="result-card">
            <div class="r-badge-area">
                <div class="r-badge">${R.type} ${R.typeKo} — ${R.verbStyle}</div>
                <span class="r-sent-type">${R.sentType}${verbInfo}</span>
            </div>
            <div class="r-original">${esc(R.orig)}</div>
            <div class="r-diagram-wrap">
                <div class="r-diagram">
                    <div class="main-row">${cells}</div>
                    <div class="m-line" id="ml"></div>
                    <div class="mod-row" id="mr">${modCols}</div>
                </div>
            </div>
            <div class="r-detail">${det.join('<br>')}</div>
        </div>
    `;

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
    });
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
    const R = parse(v);
    if (R) render(R);
}
