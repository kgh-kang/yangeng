/* files.js — 첨부 파일 읽기: 이미지(필요하면 축소) · PDF · 텍스트/코드 파일
 * 결과 형식: { kind: 'image'|'pdf'|'text', name, mediaType, data?(base64), text?, size } */
(function () {
  const IMG_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|ya?ml|xml|html?|css|scss|js|mjs|cjs|jsx|ts|tsx|py|java|kt|go|rs|c|h|cpp|hpp|cs|rb|php|swift|sql|sh|bash|zsh|log|ini|toml|env|conf)$/i;
  const LIMIT = { pdf: 20 * 1024 * 1024, text: 500 * 1024 };
  const kindOf = (f) => (IMG_TYPES.includes(f.type) ? 'image' : f.type === 'application/pdf' || /\.pdf$/i.test(f.name) ? 'pdf' : f.type.startsWith('text/') || TEXT_EXT.test(f.name) ? 'text' : null);
  const sizeLabel = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB');
  const readAs = (file, how) => new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = () => rej(new Error(`${file.name}을(를) 읽지 못했어요.`)); fr.onload = () => res(fr.result); fr[how](file); });

  /** 이미지는 긴 변 1568px 이하로 줄여 저장 공간과 토큰을 아낀다 (Claude 권장 크기). */
  async function readImage(file) {
    const url = await readAs(file, 'readAsDataURL');
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`${file.name} 이미지를 열지 못했어요.`)); i.src = url; });
    const scale = Math.min(1, 1568 / Math.max(img.width, img.height));
    if (scale === 1 && (file.size < 1.5e6 || file.type === 'image/gif')) return { kind: 'image', name: file.name, mediaType: file.type, data: String(url).split(',')[1], size: file.size };
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const data = cv.toDataURL(type, 0.86).split(',')[1];
    return { kind: 'image', name: file.name, mediaType: type, data, size: Math.round(data.length * 0.75) };
  }
  async function readFile(file) {
    const kind = kindOf(file);
    if (!kind) throw new Error(`${file.name}: 이미지, PDF, 텍스트·코드 파일만 첨부할 수 있어요.`);
    if (kind === 'image') return readImage(file);
    if (file.size > LIMIT[kind]) throw new Error(`${file.name}: ${kind === 'pdf' ? 'PDF는 20MB' : '텍스트 파일은 500KB'}까지 올릴 수 있어요.`);
    if (kind === 'pdf') return { kind, name: file.name, mediaType: 'application/pdf', data: String(await readAs(file, 'readAsDataURL')).split(',')[1], size: file.size };
    const text = await readAs(file, 'readAsText');
    if (/\u0000/.test(text.slice(0, 2000))) throw new Error(`${file.name}: 텍스트 파일이 아닌 것 같아요.`);
    return { kind, name: file.name, mediaType: 'text/plain', text, size: file.size };
  }

  window.MoaFiles = { read: readFile, kindOf, sizeLabel };
})();
