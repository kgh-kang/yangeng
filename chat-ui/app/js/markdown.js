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
    return `<div class="md-table" tabindex="0" role="region" aria-label="표"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
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
      if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { const n = m[1].length >= 4 ? 4 : 3; /* 메시지 제목(h2) 아래 단계 */ out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
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

  /* ---------- 코드 문법 강조 (가벼운 토크나이저: 주석·문자열·숫자·키워드·태그) ---------- */
  const KW = {
    js: 'await|async|break|case|catch|class|const|continue|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|yield|true|false|null|undefined|interface|type|enum|implements|readonly|as',
    py: 'and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|True|False|None|self|print',
    css: 'important|media|supports|keyframes|from|to|root',
    sql: 'select|from|where|join|left|right|inner|outer|on|group|by|order|having|limit|insert|into|values|update|set|delete|create|table|alter|drop|and|or|not|null|as|distinct|count|sum|avg|min|max|case|when|then|else|end|union|all|index|primary|key',
    sh: 'if|then|else|fi|for|in|do|done|while|case|esac|function|return|export|echo|cd|ls|npm|npx|git|pip|python3?|node|sudo|cat|grep|curl',
    java: 'abstract|boolean|break|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|func|go|if|implements|import|int|interface|long|new|package|private|protected|public|return|short|static|struct|super|switch|this|throw|throws|try|var|void|while|true|false|null|nil|fn|let|mut|pub|use|impl|match',
  };
  const LANG = { js: 'js', javascript: 'js', ts: 'js', typescript: 'js', jsx: 'js', tsx: 'js', json: 'js', py: 'py', python: 'py', css: 'css', scss: 'css', sql: 'sql', sh: 'sh', bash: 'sh', shell: 'sh', zsh: 'sh', java: 'java', go: 'java', rust: 'java', rs: 'java', kotlin: 'java', c: 'java', cpp: 'java', 'c++': 'java', cs: 'java', swift: 'java' };
  const span = (cls, t) => `<span class="tk-${cls}">${esc(t)}</span>`;
  /** HTML/XML 강조. 한 덩어리 정규식은 닫히지 않은 긴 태그에서 지수적으로 느려지므로(ReDoS)
   *  sticky 정규식으로 앞에서부터 한 번씩만 읽는 선형 스캐너로 처리한다. */
  function highlightMarkup(code) {
    const TAG = /<(\/?)([\w:-]+)/y, ATTR = /(\s+)([\w:@.-]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+))?/y, END = /\s*\/?>/y;
    let out = '', i = 0;
    while (i < code.length) {
      const lt = code.indexOf('<', i);
      if (lt < 0) { out += esc(code.slice(i)); break; }
      out += esc(code.slice(i, lt));
      if (code.startsWith('<!--', lt)) {
        const endC = code.indexOf('-->', lt + 4);
        const stop = endC < 0 ? code.length : endC + 3;
        out += span('c', code.slice(lt, stop)); i = stop; continue;
      }
      TAG.lastIndex = lt;
      const t = TAG.exec(code);
      if (!t) { out += '&lt;'; i = lt + 1; continue; }
      out += esc('<' + t[1]) + span('t', t[2]);
      i = TAG.lastIndex;
      for (;;) {
        ATTR.lastIndex = i;
        const a = ATTR.exec(code);
        if (!a) break;
        out += esc(a[1]) + span('a', a[2]) + (a[3] ? esc(a[3]) + span('s', a[4]) : '');
        i = ATTR.lastIndex;
      }
      END.lastIndex = i;
      const e = END.exec(code);
      if (e) { out += esc(e[0]); i = END.lastIndex; }
    }
    return out;
  }

  function highlight(code, lang) {
    if (code.length > 60000) return esc(code);
    if (lang === 'html' || lang === 'xml' || lang === 'svg' || lang === 'vue') return highlightMarkup(code);
    const fam = LANG[lang];
    if (!fam) return esc(code);
    const kw = KW[fam];
    const comment = fam === 'py' || fam === 'sh' ? String.raw`#[^\n]*` : fam === 'sql' ? String.raw`--[^\n]*` : String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`;
    const str = String.raw`${'`'}(?:\\[\s\S]|[^${'`'}\\])*${'`'}|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`;
    const num = String.raw`\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b`;
    const fn = String.raw`[A-Za-z_$][\w$]*(?=\s*\()`;
    const re = new RegExp(`(${comment})|(${str})|(${num})|(\\b(?:${kw})\\b)|(${fn})`, fam === 'sql' ? 'gi' : 'g');
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      out += m[1] ? span('c', m[0]) : m[2] ? span('s', m[0]) : m[3] ? span('n', m[0]) : m[4] ? span('k', m[0]) : span('f', m[0]);
      last = re.lastIndex;
      if (m[0] === '') re.lastIndex++;
    }
    return out + esc(code.slice(last));
  }

  /* ---------- 수식: $…$, $$…$$, \(…\), \[…\] → KaTeX(MathML 출력, 별도 CSS 불필요) ---------- */
  // 인라인 코드는 건너뛰고, "$5와 $10" 같은 금액은 수식으로 보지 않는다(닫는 $ 뒤에 숫자가 오면 제외).
  const MATH = /(`[^`\n]+`)|\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([^\n]+?)\\\)|\$(?![\s$])(?!\d[\d,.]*(?:[\s가-힣]|$))([^$`\n]{1,300}?)(?<!\s)\$(?!\d)/g;
  let mathNeeded = null; // 앱이 등록: KaTeX가 아직 없을 때 불러오기
  function mathHTML(tex, display) {
    const k = window.katex;
    if (k) {
      try { return k.renderToString(tex, { displayMode: display, output: 'mathml', throwOnError: false, trust: false, maxSize: 50, maxExpand: 500 }); } catch (_) { /* 아래 원문 표시 */ }
    } else if (mathNeeded) mathNeeded();
    return `<code class="math-src${display ? ' is-block' : ''}">${esc(display ? `$$${tex}$$` : `$${tex}$`)}</code>`;
  }
  function withMath(text, fn) {
    const found = [];
    const marked = text.replace(MATH, (m, code, d1, d2, i1, i2) => {
      if (code) return m;
      const display = d1 != null || d2 != null;
      found.push({ tex: (d1 ?? d2 ?? i1 ?? i2).trim(), display });
      return `\u0001${found.length - 1}\u0002`;
    });
    if (!found.length) return fn(text);
    return fn(marked)
      .replace(/<p>\u0001(\d+)\u0002<\/p>/g, (_, i) => `<div class="math-block">${mathHTML(found[+i].tex, true)}</div>`)
      .replace(/\u0001(\d+)\u0002/g, (_, i) => mathHTML(found[+i].tex, found[+i].display));
  }

  function render(src) {
    const parts = src.replace(/[\u0001\u0002]/g, '').split(/^```/m);
    let html = '';
    parts.forEach((part, idx) => {
      if (idx % 2 === 0) { html += withMath(part, blocks); return; }
      const nl = part.indexOf('\n');
      // 언어 이름은 첫 단어만, 안전한 글자만 남긴다 (예: "```html title" → html)
      const lang = ((nl < 0 ? part : part.slice(0, nl)).trim().split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z0-9+#._-]/g, '').slice(0, 20);
      const code = nl < 0 ? '' : part.slice(nl + 1).replace(/\n$/, '');
      const open = idx === parts.length - 1; // 아직 닫히지 않은 펜스(스트리밍 중)
      const canPreview = PREVIEWABLE.has(lang) && !open;
      html += `<div class="codeblock" data-lang="${esc(lang || 'text')}"><div class="codeblock__head"><span>${esc(lang || 'code')}</span><span class="codeblock__btns">` +
        (canPreview ? '<button type="button" data-preview>미리보기</button>' : '') +
        `<button type="button" data-copy-code>복사</button></span></div><pre tabindex="0"><code>${highlight(code, lang)}</code></pre></div>`;
    });
    return html;
  }

  window.MoaMarkdown = { render, inline, esc, highlight, hasMath: (s) => { MATH.lastIndex = 0; return [...s.matchAll(MATH)].some((m) => !m[1]); }, onMathNeeded(fn) { mathNeeded = fn; } };
})();
