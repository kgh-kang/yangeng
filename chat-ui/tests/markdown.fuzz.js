/* 마크다운 렌더러 보안·성능 테스트 (브라우저 없이 node로 실행)
 *   node tests/markdown.fuzz.js
 * - 알려진 XSS 패턴 + 무작위 입력 2만 개: 허용된 태그만, 이벤트 핸들러 속성 없음, 링크는 http(s)만
 * - ReDoS: 정규식이 지수적으로 느려지는 입력을 각각 200ms 안에 처리해야 함 */
const fs = require('fs');
const path = require('path');
global.window = {};
eval(fs.readFileSync(path.join(__dirname, '../app/js/markdown.js'), 'utf8'));
const { render, highlight } = window.MoaMarkdown;

const fails = [];
const ALLOWED = /^<\/?(p|br|strong|em|del|code|a|ul|ol|li|h[234]|blockquote|hr|div|table|thead|tbody|tr|th|td|span|pre|button)(\s|>|\/)/;
function checkHtml(src, out) {
  for (const t of out.match(/<\/?[a-zA-Z0-9]+[^>]*>/g) || []) {
    if (!ALLOWED.test(t)) fails.push(['허용되지 않은 태그', src, t]);
    // 따옴표 밖에 나온 on* 속성만 진짜 위험
    if (/\s on\w+\s*=|\son\w+\s*=/.test(t.replace(/"[^"]*"/g, '""'))) fails.push(['이벤트 속성', src, t]);
    const href = t.match(/href="([^"]*)"/);
    if (href && !/^https?:\/\//.test(href[1])) fails.push(['링크 스킴', src, t]);
  }
}
const PAYLOADS = [
  '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '[x](javascript:alert(1))', '[x](JAVASCRIPT:alert(1))',
  '[x](https://a.com" onmouseover="alert(1))', '![a](https://x" onerror="alert(1))', '`<b>`', '```html\n<script>alert(1)</script>\n```',
  '| <img src=x onerror=1> | b |\n|---|---|\n| c | d |', '> <svg onload=alert(1)>', '- [x] <iframe src=javascript:1>',
  'https://a.com/"><script>x</script>', '# <h1 onclick=1>', '```js\n"<\\/script><script>alert(1)</script>"\n```',
  '```" onmouseover="alert(1)\ncode\n```', '```svg\n<svg onload=alert(1)/>\n```',
];
for (const p of PAYLOADS) checkHtml(p, render(p));

const CH = ['<', '>', '"', "'", '`', '*', '_', '~', '[', ']', '(', ')', '#', '-', '|', '\n', ' ', 'a', '가', 'https://x.y', '```', '$', '\\', ':', '!', '&', 'javascript:', 'onerror=', '1.', '- '];
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = 0; i < 20000; i++) {
  let s = '';
  for (let j = 0, n = 1 + Math.floor(rnd() * 40); j < n; j++) s += CH[Math.floor(rnd() * CH.length)];
  try { checkHtml(s, render(s)); } catch (e) { fails.push(['예외', s, e.message]); }
}

const SLOW = {
  '표 구분선': 'a|b\n' + '|--'.repeat(4000) + 'x',
  '기울임': '*a'.repeat(10000),
  '링크': '[a]('.repeat(5000),
  '목록': '1. a\n'.repeat(5000),
  '인용': ('> '.repeat(200) + 'a\n').repeat(50),
  '닫히지 않은 HTML 태그': '```html\n<a ' + 'b="c" '.repeat(5000) + '\n```',
  '속성만 많은 태그': '```html\n<a' + ' b'.repeat(8000) + ' =\n```',
  '여는 꺾쇠만': '```html\n' + '<'.repeat(20000) + '\n```',
  '닫히지 않은 문자열': '```js\n"' + 'a\\'.repeat(20000) + '\n```',
};
for (const [name, src] of Object.entries(SLOW)) {
  const t = Date.now(); render(src); const ms = Date.now() - t;
  if (ms > 200) fails.push(['느림(ReDoS 의심)', name, `${ms}ms`]);
}
if (highlight('const a = "x"; // c', 'js').indexOf('tk-k') < 0) fails.push(['강조', 'js', '키워드 없음']);

// 수식 판별: 금액·인라인 코드 속 $는 수식이 아니고, $x$ · $$…$$ · \(…\) 는 수식
const MATH_CASES = [
  ['가격은 $5와 $10이에요', 0], ['$1,000 할인', 0], ['USD $5 to $7', 0], ['`$HOME` 경로', 0], ['돈 $ 기호', 0],
  ['$x$와 $2x+1$', 2], ['$$\\frac{a}{b}$$', 1], ['\\(E=mc^2\\)', 1], ['$a$$b$', 2],
];
for (const [src, n] of MATH_CASES) {
  const got = (render(src).match(/math-src/g) || []).length;
  if (got !== n) fails.push(['수식 판별', src, `수식 ${got}개 (기대 ${n})`]);
}

fails.slice(0, 10).forEach((f) => console.log('✗', JSON.stringify(f).slice(0, 240)));
console.log(fails.length ? `\n${fails.length}건 실패` : `✓ XSS ${PAYLOADS.length}개 + 무작위 20000개 + ReDoS ${Object.keys(SLOW).length}개 통과`);
process.exit(fails.length ? 1 : 0);
