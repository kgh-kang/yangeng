/* ui.js — 공통 UI 조각: 토스트, 레이어(바텀시트·다이얼로그·메뉴), 확인/입력 다이얼로그, 복사, 파일 저장
 * 앱 상태와 무관하게 동작하므로 다른 화면에서도 그대로 쓸 수 있다. */
(function () {
  const { esc } = window.MoaMarkdown;
  const layerRoot = () => document.getElementById('layer') || document.body;

  let toastTimer;
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2200);
  }

  const layers = [];
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  /** 레이어를 연다. kind: 'sheet' | 'dialog' | 'menu'. 반환된 close()로 닫는다.
   *  열린 동안 Tab 포커스는 레이어 안에서만 돈다. 닫으면 연 요소로 포커스를 돌려준다. */
  function openLayer(kind, html, { anchor, label } = {}) {
    closeLayers();
    const returnTo = document.activeElement;
    const wrap = document.createElement('div');
    const ov = kind === 'menu' ? '<div class="overlay" style="background:transparent" data-close></div>' : '<div class="overlay" data-close></div>';
    wrap.innerHTML = ov + `<div class="${kind}" role="${kind === 'menu' ? 'menu' : 'dialog'}" ${kind === 'menu' ? '' : 'aria-modal="true"'} ${label ? `aria-label="${esc(label)}"` : ''} tabindex="-1">${kind === 'sheet' ? '<div class="sheet__grip"></div>' : ''}${html}</div>`;
    layerRoot().appendChild(wrap);
    const box = wrap.lastElementChild;
    if (kind === 'menu' && anchor) {
      const r = anchor.getBoundingClientRect();
      const w = 200;
      box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
      const below = r.bottom + 6;
      box.style.top = (below + 220 > window.innerHeight ? Math.max(8, r.top - 6 - box.offsetHeight) : below) + 'px';
    }
    const close = () => {
      if (!wrap.isConnected) return;
      wrap.remove();
      const i = layers.indexOf(close); if (i >= 0) layers.splice(i, 1);
      if (returnTo && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
    };
    wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const items = Array.from(box.querySelectorAll(FOCUSABLE)).filter((x) => x.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    layers.push(close);
    const first = box.querySelector('input:not([type="hidden"]):not([hidden]), textarea, [autofocus]') || box.querySelector('button');
    setTimeout(() => { if (wrap.isConnected && !box.contains(document.activeElement)) (first || box).focus({ preventScroll: true }); }, 30);
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

  function downloadFile(name, text, type) {
    const blob = new Blob([text], { type: `${type};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name.replace(/[\\/:*?"<>|]/g, '_');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* 복사 불가 환경 */ }
      ta.remove(); return ok;
    }
  }

  window.MoaUI = {
    toast, openLayer, closeLayers, confirmDialog, promptDialog, downloadFile, copyText,
    hasLayer: () => layers.length > 0,
    closeTop: () => layers.length && layers[layers.length - 1](),
  };
})();
