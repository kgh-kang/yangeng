/* markdown.js — 채팅 응답용 경량 마크다운 렌더러.
 * 스트리밍 중 닫히지 않은 코드펜스도 안전하게 렌더한다. 모든 텍스트는 먼저 이스케이프된다. */
(function () {
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PREVIEWABLE = new Set(['html', 'svg', 'xml']);

  function inline(raw) {
    // 인라인 코드를 먼저 떼어내 나머지 규칙이 코드 안을 건드리지 않게 한다.
    const codes = [];
    let s = raw.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = esc(s)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`)
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, p, u) => `${p}<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
  }

  function table(lines) {
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const head = cells(lines[0]);
    const align = cells(lines[1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : ''));
    const th = head.map((c, i) => `<th${align[i] ? ` style="text-align:${align[i]}"` : ''}>${inline(c)}</th>`).join('');
    const rows = lines.slice(2).map((l) => '<tr>' + cells(l).map((c, i) => `<td${align[i] ? ` style="text-align:${align[i]}"` : ''}>${inline(c)}</td>`).join('') + '</tr>').join('');
    return `<div class="md-table"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function list(lines, ordered) {
    const tag = ordered ? 'ol' : 'ul';
    const start = ordered ? parseInt(lines[0], 10) : 1;
    const items = [];
    for (const l of lines) {
      const m = l.match(ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/);
      if (m) items.push(m[1]);
      else if (items.length) items[items.length - 1] += '\n' + l.trim();
    }
    const lis = items.map((t) => {
      const task = t.match(/^\[([ xX])\]\s+(.*)$/s);
      if (task) return `<li class="task"><span class="check${task[1] !== ' ' ? ' is-done' : ''}" aria-hidden="true"></span>${inline(task[2])}</li>`;
      return `<li>${t.split('\n').map(inline).join('<br>')}</li>`;
    }).join('');
    return `<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${lis}</${tag}>`;
  }

  function blocks(text) {
    const lines = text.split('\n');
    const out = [];
    let i = 0;
    const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || '');
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { const n = Math.min(m[1].length + 1, 4); out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
      if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (l.includes('|') && isTableSep(lines[i + 1])) {
        const t = [l, lines[i + 1]]; i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) t.push(lines[i++]);
        out.push(table(t)); continue;
      }
      if (/^\s*>/.test(l)) {
        const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push(`<blockquote>${blocks(q.join('\n'))}</blockquote>`); continue;
      }
      const ol = /^\s*\d+[.)]\s+/, ul = /^\s*[-*+]\s+/;
      if (ol.test(l) || ul.test(l)) {
        const ordered = ol.test(l); const re = ordered ? ol : ul; const g = [];
        while (i < lines.length && lines[i].trim() && (re.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) g.push(lines[i++]);
        out.push(list(g, ordered)); continue;
      }
      const p = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*>|\s*[-*+]\s+|\s*\d+[.)]\s+)/.test(lines[i]) && !(lines[i].includes('|') && isTableSep(lines[i + 1]))) p.push(lines[i++]);
      if (!p.length) p.push(lines[i++]);
      out.push(`<p>${p.map(inline).join('<br>')}</p>`);
    }
    return out.join('');
  }

  function render(src) {
    const parts = src.split(/^```/m);
    let html = '';
    parts.forEach((part, idx) => {
      if (idx % 2 === 0) { html += blocks(part); return; }
      const nl = part.indexOf('\n');
      const lang = (nl < 0 ? part : part.slice(0, nl)).trim().toLowerCase();
      const code = nl < 0 ? '' : part.slice(nl + 1).replace(/\n$/, '');
      const open = idx === parts.length - 1; // 아직 닫히지 않은 펜스(스트리밍 중)
      const canPreview = PREVIEWABLE.has(lang) && !open;
      html += `<div class="codeblock" data-lang="${esc(lang || 'text')}"><div class="codeblock__head"><span>${esc(lang || 'code')}</span><span class="codeblock__btns">` +
        (canPreview ? '<button type="button" data-preview>미리보기</button>' : '') +
        `<button type="button" data-copy-code>복사</button></span></div><pre><code>${esc(code)}</code></pre></div>`;
    });
    return html;
  }

  window.MoaMarkdown = { render, inline, esc };
})();
