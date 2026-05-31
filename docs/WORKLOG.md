# 양 번역기 — 작업 로그 (WORKLOG)

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
