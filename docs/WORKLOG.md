# 양 번역기 — 작업 로그 (WORKLOG)

## 2026-06-19 — 스크린샷→JSON 워크플로 + 전치사구 ㄴ 받침 표기 (세션 16)

- **워크플로 확정**: 사용자가 교재 답안지 **스크린샷**을 주면 Claude가 읽어 트리 JSON으로 변환,
  웹 "구조도 시각화"에 붙여 검증하는 흐름. (드래그 에디터 `draw.html`·폼빌더 `builder.html`은 보조)
- **JSON 초안 자동 생성**: JSON 모드에 문장 입력칸+`초안 생성` 버튼 추가
  (`seedFromSentence`→로컬 `parse`→`RToTreeJSON`(flat R→트리 스키마)→텍스트영역+실시간 미리보기).
- **전치사구 = ㄴ(L자) 받침으로 수정**(교재 표준): 기존 `전치사│목적어` 구분선 분리 →
  세로다리+가로받침선 위에 **전치사·목적어를 함께** 표기(`_rkPhrase`). `_rkMods`에 `legX` 추가해
  본선 연결선을 ㄴ 다리에 정렬, `_rkClause`는 수식어 블록을 셀 폭 안에 가둬 옆 칸 침범 방지.
  - 검증: `Civilians can buy similar products from electronics companies.`(3형식) → 교재 PDF와 일치
    (`from companies` ㄴ 묶음, `\electronics`(companies), `\similar`(products)).
- **문서 동기화**: `docs/구문분석_프롬프트.md`(작도 규약 ㄴ 받침 규칙+예시), `docs/문법.md`(작도 규칙) 갱신.

## 2026-06-13 — 검색 흐름 개편 + 병렬 평가(UX/디자인/UI) 반영 P1~P3 (세션 15)

- **흐름 개편**: 홈(로고+검색+예시+최근검색 세로중앙) ↔ 결과(상단 스티키 헤더: 제목 좌측 +
  검색창 화면중앙 + 최근검색 한 줄) `body.searched` 토글, 로고=홈 복귀. 안내문 제거.
- **헤더/입력/푸터**: 로고 시안 D(S│V│O), 결과헤더 제목만, 검색창 영어전용, 푸터 이메일만.
- **병렬 에이전트 3종(사용성·디자인·UI)** 평가 후 P1~P3 전부 수정:
  - P1 모바일 반응형(결과헤더 세로스택·입력바 overflow), 빈결과/비문 안내(.result-notice + 파서 경고).
  - P2 대비 WCAG(--green/orange/text-3 진하게), 색토큰 통일(배지/태그 role 변수), IME isComposing
    가드, a11y(로고 h1>button·focus-visible·aria), applyFix 보안(data+위임), 온보딩(힌트+예시칩), 구조도 범례.
  - P3 죽은 CSS 제거(.header/.tagline/.empty-state/.footer 등), copy/spell 인라인→위임 리스너,
    compromise CDN 14.14.4 고정, 분석버튼 솔리드 퍼플, 칩 회색·배경 글로우 밴딩 완화.
- 검증: 하니스 76/76, render_smoke 무예외, CSS 균형, 헤드리스 스크린샷(데스크탑/모바일/홈/결과).

영어 문장 5형식 구문분석 + Reed-Kellogg 구조도 웹앱. 강의 학습자료(공학영어 PDF) + YouTube 재생목록을 근거로 파싱/렌더링 로직을 개선하는 작업 기록.

---

## 2026-05-30 — 작업 시작 (세션 1)

### 목표
- 강의 학습자료(PDF 7종, 약 252p)와 YouTube 재생목록(`PL9eYjG9bLen72VdwPlOQ4IYU99MA_KptC`)을 근거로 파서/렌더러 로직 업데이트.
- 진행 상황을 본 WORKLOG와 Obsidian 볼트에 지속 기록.

### 현황 파악 (완료)
- GitHub `kgh-kang/yangeng` 로컬 클론 완료. 최신 커밋: `7436666` (맞춤법 offset/length 교체).
- 구성: `index.html`, `parser.js`(~1300줄), `renderer.js`(~750줄), `style.css`.
- 학습자료: `PDF/` 폴더에 공학영어 강의자료 7종.

### 현재 구현 구조 (요약)
- **parser.js**: 사전(LEXICON) 기반 품사 태깅 → `findSubject`/`findVerbPhrase`/`analyzePredicate` → `determinePattern`(5형식 판별) → `buildStructure`(렌더용 구조화).
  - 5형식 → 한국어 동사유형 매핑: 1 자존형(있다) / 2 의존형(이다·되다) / 3 소유형(하다) / 4 수여형(주다) / 5 복합형(이다고+하다).
  - 동사 세분류: 사역/지각/유도/간주.
- **renderer.js**: SVG 기반 Reed-Kellogg 메인라인 + 수직선(S-V, V-O)·사선(V-C, O-OC) 구분자.

### 식별된 약점 (착수 전 코드리뷰)
1. 수식어(modifiers)를 수집만 하고 구조도에 그리지 않음.
2. `analyzePredicate`가 빈 껍데기 — 술어 분석이 형식판별 로직과 분리됨.
3. 절(clause)/관계절/부정사/분사 등 복문 처리 미완성.
4. be동사 보어 명사/형용사 구분이 단순(관사 유무 등 휴리스틱).

### 진행 중
- [ ] PDF 7종 분석 (서브에이전트 병렬) → 강의 이론·규칙·예문 추출
- [ ] YouTube 재생목록 분석 → 다루는 문법 주제 파악
- [ ] 자료 vs 현재 구현 갭 분석
- [ ] 로직 업데이트 구현
- [ ] 검증(예문 회귀 테스트)

> 이후 분석 결과/결정/구현 내역을 본 섹션 아래에 계속 append.

---

## 2026-05-30 — 자료 분석 종합 (세션 1 계속)

PDF 6개 소스 + YouTube 재생목록을 서브에이전트 병렬 분석. 핵심 확인:
- **5형식 판별 알고리즘(동사→명사군 개수→이퀄)과 5형식↔한국어 동사유형 매핑이 현재 구현과 정확히 일치** (마스터 키: 공학영어13-1 p9 "형식 총정리").
- 미구현 영역 식별: ① 복문(종속절 3종) ② 句동사 ③ (compromise 미로드 시) 수동태/일부 어휘.
- 상세 이론은 옵시디언 `양 번역기/01 - 강의 이론 정리`, 갭 분석은 `02 - 갭 분석 & 개선안`.

## 2026-05-30 — 로직 업데이트 구현 (세션 1 계속)

### 테스트 인프라
- `test/harness.js` 추가: parser.js를 vm으로 로드, **compromise.js(실제 앱과 동일 NLP)** 주입, 강의 예문 29케이스 회귀. 결과 `test/results.json` 출력.
- `test/render_smoke.js`: DOM 목으로 renderer.js 복문 렌더 예외 검증.
- (환경 특성상 콘솔 출력이 불안정하여 결과를 파일로 출력 후 확인하는 방식 채택.)

### 구현 1 — isV 어미규칙 비결정성 버그 수정 (★실버그)
- 문제: `isV`가 `~ed/~es/~s/~ing` 어미를 **DB 확인 없이 무조건 동사**로 판정 →
  "stars"(복수명사)가 동사로 새고, compromise가 "stars"를 Verb로 태깅하면서
  `_posCache` 상태에 따라 "I saw the stars"가 **3↔5형식으로 비결정적으로 갈림**.
  (테스트뿐 아니라 실제 앱에서도 직전 분석 문장에 따라 결과가 달라지는 진짜 버그.)
- 수정: (a) 어미 추측은 **원형이 동사 DB에 있을 때만** 동사 인정(형태+DB 우선).
  watched→watch=동사, stars→star=명사, shining→shine=동사, stopped→stop(자음겹침).
  (b) NLP 가드를 형태+DB 경로 **뒤로** 이동(shining 등이 먼저 DB로 잡히도록).
  (c) -s로 끝나는 단어는 NLP 단독으로 동사 판정 안 함(진짜 -s 동사는 형태+DB가 잡음).
- 효과: "I saw the stars" 3형식 안정(결정성 x10 검증), "Machines can break down" 1형식.

### 구현 2 — 句동사(phrasal verb) 인식 [P2]
- `PARTICLE`/`PHRASAL` 사전 + `verbBases`/`phrasalParticle` 헬퍼 추가.
- `parsePred`에서 본동사 뒤 불변화사가 句동사를 이루면 동사구에 흡수.
- `parseRem`의 동사핵 추출이 불변화사를 건너뛰고 본동사로 분류하도록 수정.
- `EXTRA_TRANS`(pull/push/pick/turn) 보강.
- 효과: take in / pull out / pick up → 3형식, break down → 1형식 정상화.

### 구현 3 — 수동태 2형식 [P3]
- compromise 로드 환경에서 be+p.p.가 이미 2형식으로 정상 처리됨을 확인(추가 코드 불필요).

### 구현 4 — 복문(종속절) 분리·분석 [P1] ★핵심
- `splitComplex`: 종속접속사/관계사/의문사로 종속절 경계 검출 → 주절/종속절 분리.
  - **명사절**(that·whether·if·의문사가 목적어 자리), **형용사절**(관계사+선행사, 선행사를 주어로 복원), **부사절**(종속접속사·콤마+when 등).
- `parseClauseAware`: 주절 + 각 종속절을 독립 파싱, `R.clauses[]`에 관계/접속사/형식 부착. 명사절 목적어는 주절에 더미목적어로 3형식 인식 후 `(접속사…절)` 라벨 치환.
- `parseMulti`가 각 절에 대해 `parseClauseAware` 적용 (중문→복문 중첩 처리).
- `renderer.js`: `renderClauses()` 추가 — 명사/형용사/부사절별 색상 패널 + 각 절 형식·성분 표시. `style.css`에 `.clause-*` 스타일 추가.

### 검증 결과 (회귀 테스트, compromise 로드 기준)
- **하니스 21/21 PASS** (착수 14 → 21). 단문 1~5형식 / 句동사 4종 / 수동태 / 이퀄(2vs3) / OC(4vs5).
- **비결정성 해소**: 사이사이 OC문 섞어 "I saw the stars" 10회 → 전부 3형식. `isV('stars')`=false 안정.
- **-s 동사 회귀 정상**: runs/makes/barks/pick up 등 유지.
- **복문 4종 정확 분류**:
  - "I saw that the stars were shining" → 주절 3형식 + 명사절(1형식)
  - "I saw the stars that were shining" → 주절 3형식 + 형용사절(1형식)
  - "I saw the stars, when they were shining" → 주절 3형식 + 부사절(1형식)
  - "I know who gave her comic books" → 주절 3형식 + 명사절(4형식)
- renderer 복문 렌더 예외 없음.

### 변경 파일
- `parser.js` (isV, EXTRA_TRANS/PHRASAL 사전, phrasal 흡수, splitComplex/parseClauseAware/parseMulti)
- `renderer.js` (renderClauses + 카드 삽입)
- `style.css` (.clause-* 스타일)
- `test/harness.js`, `test/render_smoke.js` (신규)
- `docs/WORKLOG.md` (본 문서)

### 남은 과제(차기)
- of 4분류 의미 라벨, will/shall 의지 해설, 종속절 중첩(절 안의 절), 관계사 목적격 복원, 상관접속사(both A and B) 병렬, 의문문 do-support 환원 표시.

---

## 2026-05-30~31 — UI 피드백 (세션 2~4)

### 맞춤법: 대소문자 지적 제외
- LanguageTool 결과에서 대소문자 규칙 제외. 단, "i → I"는 카테고리가 `CASING`이 아니라
  **`TYPOS` / ruleId `I_LOWERCASE`** 로 내려옴(실 API 확인) → ruleId 기준 제외 추가
  (`I_LOWERCASE`, `UPPERCASE_SENTENCE_START`). 첫 글자 대문자·인칭대명사 대문자 안 잡음.

### 구조도 선 가독성
- 구분선을 어긋나게 하던 음수 margin 정리(`.m-sep-v` margin-bottom -2px, `.m-sep-s` 0),
  흐릿하던 opacity 보정(구분선 불투명화, `.mod-stem` 0.65), 두께 2px 통일.
- 수식어 컬럼 위치 `Math.round`로 정수 px 반올림(소수점 좌표로 흐릿하던 선 개선).

### 전치사구 받침대(계층) 작도
- 강의 Reed-Kellogg처럼 전치사구를 **전치사(다리) → 명사(가로선) → 관사·형용사(아래 매달기)**
  계층 받침대로 렌더(`renderer.js` renderPrepStand/renderOneMod, `style.css` `.pp-*`/`.mod-slash`).
- 검증 예문 "No well-prepared boy scout troop would wander into the wilderness without a compass.":
  받침대 2개(into→wilderness→the, without→compass→a) + 주어 단어수식어 4개 사선 정상. 파서 21/21.

> ⚠️ 이 구간 작업 중 style.css를 잘못 편집해 손상시킨 사고가 두어 번 있었으나 매번 원본 기준 복구 후 최소 변경만 재적용. WORKLOG 세션2~3 상세 로그는 amend/복구 과정에서 유실되어 본 항목으로 통합 기록함.

## 2026-05-30 — UI 피드백 반영 (세션 2)

### 맞춤법: 대소문자 규칙 제외
- LanguageTool 결과에서 **CASING 카테고리 제외**(`m.rule.category.id === 'CASING'`).
- 문장 첫 글자 대문자, `i → I`(인칭대명사 대문자) 등 대소문자 지적은 더 이상 표시 안 함. (renderer.js `checkSpelling`)

### 구조도 선 정리 (가독성) — "선이 안 깔끔" 피드백
- **근본 원인**: 수식어 연결선(`.mod-stem`)이 `var(--border)`(#ebebeb)라 배경(#f8f9fa)에서 거의 안 보임 — 메인 구분선(`var(--text)` #1f1f1f, 진함)과 대비가 극단적이라 다이어그램이 "선 없이 떠 있는" 느낌. → `.mod-stem` 배경을 `var(--text-3)`(#9aa0a6) 회색으로 변경(메인선보다 옅되 또렷한 연결선).
- **선 선명도**: `renderer.js`에서 수식어 컬럼 위치(`col.style.left`)를 `Math.round`로 정수 px 반올림 — 소수점 좌표로 흐릿하게 렌더되던 선 개선(render/renderMulti 양쪽).
- **CSS 중복 정리**: 원본에 있던 `.mod-text { font-weight: 400; }` 76회 중복(라인 211~287) 제거. 905→884줄.
- 검증: renderer 스모크 무예외, 파서 회귀 21/21 유지, CSS 중괄호 균형(178/178)·셀렉터 단일 정의 확인.

> ⚠️ 작업 중 style.css splice 실수로 spell-check 스타일을 한 번 날리고 다이어그램을 중복시킨 사고가 있었음. 원본(`7436666:style.css`)을 기준으로 복구한 뒤 위 변경만 재적용해 해결. (교훈: CSS 대량 편집은 원본 기준 복구가 안전)

## 2026-05-31 — 전치사구 받침대(계층) 작도 (세션 4)

강의 표준 Reed-Kellogg처럼 전치사구를 "꺾인 받침대" 계층으로 렌더:
- `renderer.js`: `renderPrepStand()`/`renderOneMod()` 추가. 수식어 중 전치사구
  (into the wilderness 등)는 `전치사(다리) → 명사(가로선) → \관사·형용사(매달기)`
  계층으로, 일반 단어 수식어는 `\ 단어` 사선 표기로 렌더.
- `style.css`: `.pp-stand/.pp-prep/.pp-obj/.pp-noun/.pp-objmods/.pp-objmod` +
  `.mod-slash` 추가(빨강 다리·가로선, `\` 마커).
- 검증(예문 "No well-prepared boy scout troop would wander into the wilderness
  without a compass."): 받침대 2개(into→wilderness→\the, without→compass→\a),
  주어 수식어 \No \well-prepared \boy \scout 정상. 파서 21/21, CSS 172/172 균형.

## 2026-05-31 — 구조도 SVG 전환 (세션 5)

HTML border 기반 다이어그램은 픽셀 정렬이 계속 어긋나(수직선이 baseline 아래로
삐져나오는 등) → **SVG 좌표 기반 렌더로 전면 전환**.
- `renderer.js`: `buildDiagramSVG(R)` 신설. 텍스트 폭을 canvas `measureText`로
  동기 측정해 셀 x좌표·구분선·받침대를 정확히 배치. 헬퍼: `_measure/_line/_txt/
  _ppMetrics/_ppStandSVG/_modBlockSVG`.
  · 구분선: S-V/V-O 전체관통선, 보어/OC 사선, 4형식 IO/O 반선.
  · 전치사구 받침대: 전치사(세로다리)→명사(가로선)→관사(\사선) 계층을 SVG로.
  · 단어 수식어: stem + \사선.
- render()/renderMulti()의 옛 HTML 마크업(.m-cell/.m-sep/.mod-col)과
  requestAnimationFrame 사후측정 블록 전부 제거 → SVG는 측정 불필요.
- 부수 수정: 중문 상세줄 OC 라벨 'O:' → 'O.C:' 오타 수정.
- 검증: 1~5형식·전치사구·중문 모두 svg 1개씩 정상 생성(line/text 좌표 OK, 예외 0),
  파서 21/21, CSS 172/172.

## 2026-05-31 — 종속절 SVG 색 테마 (세션 7)

복문 종속절도 교재처럼 다이어그램으로(주절=빨강과 구분되게 검정):
- `buildDiagramSVG(R, opts)`: `opts.mainColor`로 메인 baseline·구분선 색 지정.
  주절은 빨강(_RK.line, 기본), 종속절은 검정(_RK.sub) 전달.
- `renderClauses()`: 각 종속절을 `buildDiagramSVG(r, {mainColor:_RK.sub})`로 그려
  카드 안에 검정 SVG 다이어그램 표시. `style.css`에 `.clause-diagram` 추가.
- 검증("I saw the stars that were shining in the sky"): 종속절 패널 SVG 검정선 11·
  빨강선 0, 주절 메인 빨강선 2. 파서 21/21, CSS 172/172, 렌더 무예외.

## 2026-05-31 — 수동태 처리 (세션 8, YouTube 13주차 반영)

13주차 "능동태와 수동태" 영상 분석 → 강의 규칙 구현.
- **강의 규칙**: 수동태(be + 과거분사)는 **무조건 2형식**. be=본동사, 과거분사=형용사(보어 수식),
  생략보어 one/ones. 형식 강등: 3형식→2 / 4형식→2(IO·DO 각각 주어화한 두 패턴) / 5형식→2.
- **착수 전 버그**: `was offered a prize`→4형식 오판, `was broken/advanced`(뒤 목적어 X)→1형식,
  by/to 행위자구 미부착.
- **구현(parser.js)**:
  · `PP_IRREGULAR` 불규칙 과거분사 사전 + `isPastParticiple()`(불규칙 또는 ~ed).
  · `parsePassive()`: parsePred에서 be+과거분사 감지 시 분기. 과거분사를 보어(comp)로,
    뒤 전치사구(by/to/for 행위자)·잔여목적어를 보어 수식어로. 무조건 2형식(의존형).
- **검증**: 수동태 9문장 전부 2형식 정상. 하니스 28/28(수동 7케이스 추가). be+형용사(She was happy),
  ~ed 형용사보어(I am tired/interested), 진행형(were shining=1형식) 회귀 정상.
- **미구현(영상 범위 밖)**: 원형부정사 5형식 수동 to복원(see him go→was seen to go),
  진행/완료 수동(is being p.p., has been p.p.).

## 2026-06-06 — 원형부정사 to복원 + 진행/완료 수동 (세션 9)

세션 8의 남은 미구현 2건 처리.
- **(1) 원형부정사 5형식 수동의 to복원** (saw him go → was seen **to** go):
  지각·사역동사(see/hear/make 등)의 능동태 5형식 원형부정사 목적격보어는 수동태로 가면
  to부정사로 복원됨. `parsePassive()`에서 과거분사가 PERCEPTION/CAUSATIVE/INDUCTIVE면
  뒤의 "to+동사"를 복원된 원형부정사로 인식 → `R.restoredInf`에 저장, 보어 수식어로 부착.
  렌더러 해설(getTypeExplanation)에 to복원 설명 추가.
- **(2) 진행/완료 수동** (is being p.p. / has been p.p. / had been p.p.):
  분석 결과 조동사 체인 수집 로직이 이미 정상 처리(2형식) 확인. 추가로 결정성 강화:
  과거분사 흡수를 `isV`(compromise 캐시 의존) → `isPastParticiple` 기준으로 변경해
  `was done`류가 캐시 상태와 무관하게 항상 수동 2형식이 되도록 함.
- **버그 수정**: `heard`(및 read/led/sat/won 등 다수 불규칙 과거분사)가 `PP_IRREGULAR`에
  누락 → `You were heard to sing.`이 5형식 오판되던 것 수정. 사전 대폭 확장.
- **분사형용사 구분**: by행위자 없는 감정 분사형용사(tired/interested 등 `EMOTION_ADJ`)는
  진짜 수동태가 아닌 일반 2형식 형용사 보어로 처리 → "형식 강등" 해설 오부착 방지.
- **검증**: 하니스 32/32(신규 6케이스: 지각/사역 수동 to복원 3, 진행/완료 수동 3).
  determinism 3회 반복 동일, stars 비결정성 없음. render_smoke 수동태 3문장 무예외.

## 2026-06-06 — 시험 대비 재검증 & 대규모 보강 (세션 10)

오픈북 시험에 사용할 예정 → 70여 문장 경험적 audit으로 구멍을 찾아 일괄 보강.
착수 시 audit 오판 9건 → 완료 후 1건(진행형↔동명사보어 본질 모호성만 잔존).

- **to부정사 (신규)**: `TO_INF_OBJ` 사전 + `takesToInfObj()`.
  · 명사적 용법 목적어: "I want to go"=3형식(`parseRem`에 분기, `R.objIsInf`).
  · to부정사 주어: "To learn is important"=2형식(`parseDecl` 문두 처리, `R.subIsInf`).
  · 회귀 유지: "I want him to go"=5형식, "I came to help"=1형식(부사적), "I go to school"=1형식.
- **관계대명사절 — 주어 수식 (신규)**: `splitComplex`에 선행 본동사가 없을 때만(주어 안)
  who/whom/whose/which/that 관계절을 검출 → 주절+형용사절 분리. 선행사 복원.
  "The man who runs is fast"→주절2형식+형용사절. 목적어수식 관계절(기존)·"I saw the stars that…" 회귀 정상.
- **문두 부사절 (신규)**: "When/If/Because/Although …, 주절" 콤마 분리. 강한 종속접속사는 항상 절,
  모호한 접속사(as/before/after…)는 절 내 동사 유무 확인("As a student," 전치사구 제외).
- **자잘한 보정**:
  · 시간 부사구(`TIME_DET`+`TIME_NOUN`, `TIME_ADV`): "every day/this morning/yesterday"를 목적어가 아닌 부사구로.
  · 비교구문: be/연결동사 + "as ADJ as …", "ADJ-er than …", "more ADJ than …" → 형용사 보어(2형식).
  · 감각 연결동사+형용사("smell sweet")·"found her honest"(목적격 her) → ADJ 사전 보강으로 해결.
- **★ -ent/-ant 명사 버그 수정**: 형용사 접미사 규칙이 student/agent/document/government/equipment
  등 -ent/-ant **명사**를 형용사로 오태깅(→isNoun=false) → 주어/관계절 분석 광범위 오류.
  규칙에서 `ent|ant` 제거 + 흔한 -ent/-ant 형용사(different/important/efficient…)는 `ADJ_EXTRA`에 명시.
- **동사 DB 보강**: 공학·일반 동사 대량 추가(process/store/generate/transmit/compute/collect/connect…,
  succeed/fail/pass/win/lose… 등). regular verb를 isV가 못 잡아 S-V가 뒤바뀌던 문제 완화.
- **검증**: 하니스 **53/53**(신규 21케이스: to부정사·관계절·부사절·보정), determinism 5회 동일,
  render_smoke 7문장 무예외(관계절·부사절 패널 정상), audit 70문장 중 오판 1건(동명사보어).
- **알려진 한계(시험 시 주의)**: ① "My hobby is reading"류 동명사 보어↔진행형 모호. ② DB에 없는
  희귀 동사의 S-V 오인 가능. ③ 목적격 관계절의 절 내부 형식 라벨은 근사(분리 자체는 성공).

## 2026-06-13 — 14주차(종합복습+GPS Reading) 반영 (세션 11)

`PDF/공학영어14.pdf` = Chapter 2 형식 종합복습 + 연습문제 25 + Chapter 6 Reading
"Ask a Satellite for Directions"(13문장, 각 문장에 강의 공식 형식 라벨 = 사실상 정답지).
전 문장을 공식 라벨과 대조 → 오판 5건 발견·수정. (오픈북 시험 대비 핵심 검증.)

- **go there / is here = 1형식**: 순수 부사(here/there/now)만 오면 보어가 아니라 수식어로
  처리(`assignComp` 가드). go가 LINKING이라 "go there"를 2형식으로 오판하던 것 수정.
- **사역 make/have + to부정사 ≠ 5형식**: 사역(make/have/let)·지각(see/hear)은 능동에서
  원형부정사만 OC로 취함. to부정사 OC 경로에서 isCau/isPerc 제거 → "have a way to keep"=3형식.
- **get은 원형부정사 OC 안 취함**: 원형부정사 5형식 경로를 (isCau||isPerc||help)로 한정.
  "get a prize"가 (prize의 NLP 동사 오태깅 시) 5형식으로 새던 비결정성 제거 → 항상 3형식.
- **동명사 주어**: "Relying on satellites … makes the system precise"=5형식. parseDecl에
  동명사 주어 처리 추가. **본동사 탐색에 `isVStrict`(DB확인 동사, NLP 제외) 도입** →
  "ground/stations"를 본동사로 오인하던 비결정성 제거(to부정사 주어 탐색도 동일 적용).
- **make a X of Y 관용구 → 3형식**: "make a success of this election" 등 of전치사구가 붙은
  make류는 이퀄(2형식)로 보지 않음.
- **호격(vocative)**: "Ladies and gentlemen, be ambitious!" → 콤마 앞 호격 건너뛰고 명령 파싱.
- **누락 동사 보강**: steer/track/pinpoint/broadcast/negotiate/rely/earn/receive 등(지문 동사).
- **검증**: 하니스 **76/76**(14주차 23케이스 추가), determinism 5회 동일, render 무예외.
  Reading 13문장 형식·콤마 관계절(which)·동명사 주어 5형식 모두 정상.
- **추가 한계**: 문두 부사적 to부정사("To find …, soldiers relied …")는 미완(주어 오인 가능).

## 2026-06-13 — 구조도 수식어 가로 배치 (세션 12)

교재 예제(14주차 ① No well-prepared boy scout troop would wander…)와 앱 렌더 비교 →
수식어가 세로로 쌓여 교재(가로 나열)와 달랐음. `renderer.js` 수식어 레이아웃을 가로로 전환.
- `_modBlockSVG`: 단어 수식어(\사선+단어)·전치사구 받침대를 좌→우로 나란히 배치(+`width` 반환).
  `_modRowW()` 신설(수식어 총 가로폭). 단일 stem 제거 → 각 수식어가 baseline에서 직접 매닲.
- `buildDiagramSVG`: 셀 폭을 수식어 가로 합산(`_modRowW`)으로 계산해 셀 겹침 방지.
- 결과(① 문장): 210px(세로) → 129px(높이↓)·548px(폭↑). "No·well-prepared·boy·scout"가
  주어 아래 한 줄, "into…·without…"가 동사 아래 나란히 — 교재와 동일 구조.
- 검증: render_smoke 무예외, 하니스 76/76 유지.

## 2026-06-13 — Notion 라이트 테마 디자인 개선 (세션 13)

[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)의 **Notion** DESIGN.md
기반으로 다크 → 밝은 교재풍 라이트 테마 전환(구조도가 교재처럼 흰 배경+빨강/검정 선으로 보이게).
- `style.css :root` 토큰 전면 교체: 흰 캔버스(#f6f5f4/#fff), ink/slate/steel 텍스트,
  헤어라인(#e5e3df), 시그니처 퍼플 CTA(#5645d4), Notion 라운드/그림자 스케일.
- 다크 전제 흰색 오버레이(rgba(255,255,255,.0x)) → 어두운 오버레이로 일괄 변환.
- 파란 액센트(입력 포커스·버튼 hover) → 퍼플 통일, 배경 글로우 퍼플로 순화.
- 폰트: Inter(라틴) + Noto Sans KR(한글).
- `renderer.js _RK`: 흰 배경용으로 수식어/종속선 검정(#37352f), 역할색 심화
  (S #1a56db, O #1aae39, IO #5645d4, OC #dd5b00). 주선은 교재 빨강 유지.
- 문서: `docs/DESIGN.md`(프로젝트 디자인 스펙) + `docs/notion-design-reference.md`(원본).
- 검증: 헤드리스 스크린샷으로 빈 화면·구조도(①1형식/②4형식) 확인 — 교재와 동일 레이아웃·색.
  render_smoke 무예외, 하니스 76/76 유지.

## 2026-06-13 — 헤더 로고 구조도화 + UI 다듬기 (세션 14)

- **로고 = 미니 Reed-Kellogg 구조도**(SVG): "공학영어 │ 문장 │ 분석기"를 빨강 baseline+세로
  구분선으로 분절(첫 구분선은 baseline 관통=S-V선), "강광현 제작"은 `\`사선으로 매달린
  수식어처럼 배치. 로고 시안 10종을 `logo-demo.html`로 비교 후 1번(baseline형) 채택.
- **페이지 너비** `.app` 960→1120px(긴 구조도 여유).
- **최근 분석(히스토리)**: 결과 아래→**검색창 바로 밑**으로 이동, **한 줄 표시**(nowrap+
  가로 스크롤, 스크롤바 숨김), hover 퍼플 통일.
- **★ 선 돌출 버그 수정**: S-V 관통선이 baseline 아래 12px까지 내려가는데 SVG 높이가
  이를 반영 못해(예: "I love you" H=58 < 선 y=60) 선이 박스 밖으로 삐져나오던 것 →
  `maxBottom = lineY + 13`으로 높이 보정. 1~5형식 전 선이 박스 내 안전 확인.
- 검증: 헤드리스 스크린샷(로고·너비), 하니스 76/76, render_smoke 무예외.
