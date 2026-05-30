// renderer.js 스모크 테스트: 복문 R로 render() 호출 시 예외 없이 종속절 HTML 생성되는지
const fs = require('fs'), path = require('path'), vm = require('vm');
let nlp; try { nlp = require('compromise'); } catch (e) {}

// 최소 DOM 목
let captured = '';
const stubEl = {
    _html: '', set innerHTML(v){ this._html = v; captured = v; }, get innerHTML(){ return this._html; },
    setAttribute(){}, focus(){}, getAttribute(){ return null; },
    style: {}, querySelectorAll(){ return []; }, querySelector(){ return null; },
    offsetWidth: 100, offsetHeight: 20, getBoundingClientRect(){ return { left:0, width:100 }; },
    addEventListener(){}, appendChild(){}, removeChild(){}, select(){}, classList:{toggle(){},add(){}}, dataset:{},
    textContent:'', get innerHTMLraw(){return this._html;}
};
const doc = {
    getElementById(id){ if(id==='translation-area') return null; return stubEl; },
    querySelector(){ return stubEl; }, querySelectorAll(){ return []; },
    createElement(){ return { set textContent(v){ this._t=v; }, get innerHTML(){ return (this._t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); } }; },
    addEventListener(){}, body:{ appendChild(){}, removeChild(){} }
};
const ctx = {
    nlp, console,
    document: doc,
    requestAnimationFrame(){ /* noop */ },
    localStorage: { getItem(){ return '[]'; }, setItem(){}, removeItem(){} },
    fetch(){ return Promise.reject(new Error('no net')); },
    navigator: { clipboard: { writeText(){ return Promise.resolve(); } } },
    setTimeout(){}, encodeURIComponent: encodeURIComponent,
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','parser.js'),'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','renderer.js'),'utf8'), ctx);
vm.runInContext('var __api={parseMulti, render};', ctx);

const sents = [
    'I saw that the stars were shining in the sky.',
    'I saw the stars that were shining in the sky.',
    'I saw the stars, when they were shining in the sky.',
    'I know who gave her comic books.',
    'I saw the stars.',
];
const report = [];
for (const s of sents) {
    try {
        const { results } = ctx.__api.parseMulti(s);
        captured = '';
        ctx.__api.render(results[0]);
        const hasClause = /종속절 분석/.test(captured);
        const rel = (captured.match(/clause-(명사절|형용사절|부사절)/g) || []).map(x=>x.replace('clause-','')).join(',');
        report.push(s.slice(0,18) + ' => ok, clausePanel=' + hasClause + (rel?(' ['+rel+']'):''));
    } catch (e) {
        report.push(s.slice(0,18) + ' => ERROR: ' + e.message);
    }
}
fs.writeFileSync(path.join(__dirname,'render_smoke.txt'), report.join('\n') + '\n');
console.log('done');
