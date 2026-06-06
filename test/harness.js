// 양 번역기 파서 회귀 테스트 하니스 (Node)
// 결과를 test/results.json 으로 출력(콘솔 렌더 신뢰불가 환경 대응).
// 사용: node test/harness.js  →  test/results.json 확인
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const parserCode = fs.readFileSync(path.join(__dirname, '..', 'parser.js'), 'utf8');
// 실제 앱과 동일하게 compromise.js(NLP) 로드 (없으면 undefined로 진행)
let nlp;
try { nlp = require('compromise'); } catch (e) { nlp = undefined; }
const ctx = { nlp, console };
vm.createContext(ctx);
vm.runInContext(parserCode + '\nvar __api = { parse, parseMulti, isV, getNlpTags };', ctx);
const { parse, parseMulti } = ctx.__api;
// 자가진단: 환경 일치 여부 기록 (stars가 동사로 오판되면 비결정성 버그 재발)
const _diag = {
    compromiseLoaded: typeof nlp === 'function',
    compromiseVer: nlp && nlp.version,
    isV_stars: ctx.__api.isV('stars'),
    isV_watched: ctx.__api.isV('watched'),
    tags_stars: (() => { const t = ctx.__api.getNlpTags('stars'); return t ? [...t].join('/') : 'null'; })(),
};

const T = { '1형식': 1, '2형식': 2, '3형식': 3, '4형식': 4, '5형식': 5 };

// [문장, 기대형식(단문) 또는 null, 비고]
const CASES = [
    ['The stars were shining in the sky.', 1, '1형식 진행형(자동사 shine)'],
    ['I saw the stars.', 3, '3형식'],
    ['He gave her comic books.', 4, '4형식 수여'],
    ['The deep analysis will make you wise.', 5, '5형식 사역+형용사OC(aux)'],
    ['They make you wise.', 5, '5형식 사역+형용사OC'],
    ['He made her happy.', 5, '5형식'],
    ['It matters.', 1, '1형식'],
    ['The concept of the GPS is simple.', 2, '2형식'],
    ['Computers are fast.', 2, '2형식'],
    ['She made a good wife.', 2, '2형식 이퀄'],
    ['She made a good meal.', 3, '3형식 비이퀄'],
    ['They called him a genius.', 5, '5형식 명사OC'],
    ['He keeps his room clean.', 5, '5형식 형용사OC'],
    ['I painted the wall red.', 5, '5형식 형용사OC'],
    ['He made her a cake.', 4, '4형식(make 이중목적)'],
    // 句동사
    ['Computers can take in very large amounts of information.', 3, '句동사 take in'],
    ['They can pull out a single fact.', 3, '句동사 pull out'],
    ['Machines can break down.', 1, '句동사 break down(자동사)'],
    ['The devices pick up signals.', 3, '句동사 pick up'],
    // 수동태 (13주차 강의: 무조건 2형식, 형식 강등)
    ['Engineering was advanced by the researcher.', 2, '3형식 수동→2형식'],
    ['You will be made wise by the deep analysis.', 2, '5형식 수동→2형식'],
    ['He was offered a grand prize by the university.', 2, '4형식 수동(IO주어)→2형식'],
    ['A grand prize was offered to him by the university.', 2, '4형식 수동(DO주어,to복원)→2형식'],
    ['The window was broken by the boy.', 2, '3형식 수동(by)→2형식'],
    ['The work was done.', 2, '수동(by생략)→2형식'],
    ['He was called a genius by them.', 2, '5형식 수동(명사보어)→2형식'],
    // 원형부정사 5형식 수동 → to 복원 (saw him go → was seen to go)
    ['He was seen to go.', 2, '지각동사 수동 to복원'],
    ['She was made to cry by the movie.', 2, '사역동사 수동 to복원'],
    ['You were heard to sing.', 2, '지각동사(heard) 수동 to복원'],
    // 진행/완료 수동
    ['The window is being broken by the boy.', 2, '진행 수동(is being p.p.)'],
    ['The work has been done.', 2, '완료 수동(has been p.p.)'],
    ['The bridge had been built.', 2, '과거완료 수동(had been p.p.)'],
    // 복문(종속절) — 단문 기대 null, clauses 검사 별도
    ['I saw that the stars were shining in the sky.', null, '복문 명사절'],
    ['I saw the stars that were shining in the sky.', null, '복문 형용사절'],
    ['I saw the stars, when they were shining in the sky.', null, '복문 부사절'],
    ['I know who gave her comic books.', null, '복문 의문사 명사절'],
    // 중문
    ['The stars were shining and I saw the stars.', null, '중문'],
    // 의문/명령
    ['Did you have lunch?', null, '의문문'],
    ['When will you come there?', null, '의문사 의문문'],
    ['Tell me how to go there.', null, '명령문'],
];

const out = CASES.map(([sent, expect, note], idx) => {
    let r;
    try {
        const { results, conjunctions } = parseMulti(sent);
        const main = results[0] || {};
        r = {
            idx, sent, note, expect,
            n: results.length,
            type: main.type, got: T[main.type] || 0,
            S: main.sub && main.sub.head, V: main.verb,
            SC: main.comp && main.comp.head, IO: main.io && main.io.head,
            O: main.obj && main.obj.head, OC: main.oc && main.oc.head,
            sub: main.sentType, vsub: main.verbSub,
            clauses: (main.clauses || []).map(c => ({ rel: c.relation, t: c.type, fmt: c.type, txt: c.orig, ctype: c.result && c.result.type })),
            conj: conjunctions,
            pass: expect ? (results.length === 1 && (T[main.type] || 0) === expect) : null,
        };
    } catch (e) {
        r = { idx, sent, note, error: String(e && e.message) };
    }
    return r;
});

// 루프 종료 후 isV('stars') 재측정 — 캐시 오염(비결정성) 여부 확인
_diag.isV_stars_afterLoop = ctx.__api.isV('stars');
{ const t = ctx.__api.getNlpTags('stars'); _diag.tags_stars_afterLoop = t ? [...t].join('/') : 'null'; }
const checked = out.filter(r => r.pass !== null && r.pass !== undefined);
const pass = checked.filter(r => r.pass).length;
const summary = { pass, fail: checked.length - pass, checked: checked.length, total: out.length };
fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify({ summary, diag: _diag, out }, null, 1));
console.log('OK');
