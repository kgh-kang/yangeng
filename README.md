# 공학영어 문장 분석기 (양 번역기)

영어 문장을 입력하면 **5형식 구문 분석**과 **Reed-Kellogg 구조도**를 보여주는 웹 앱입니다.
양박사네 공학영어 강의의 "동사 찾기 → 동사 뒤 명사군 + 이퀄 관계" 방법론을 그대로 구현했습니다.

## 형식 판별

| 형식 | 한국어 동사유형 | 예 |
|------|----------------|-----|
| 1형식 | 자존형 — '있다' | They came here. |
| 2형식 | 의존형 — '이(되)다' | He is a diligent person. |
| 3형식 | 소유형 — '하다' | I saw the stars. |
| 4형식 | 수여형 — '주다' | He gave her a book. |
| 5형식 | 복합형 — '이다'고+'하다' | They made him happy. |

## 기능

- **5형식 자동 판별** + 한국어 동사유형 매핑, 평서문/의문문/명령문 인식
- **동사 세분류**: 사역 / 지각 / 유도 / 비사역 / 간주동사
- **수동태** — `be + 과거분사`는 무조건 2형식 (진행·완료 수동, 지각·사역 수동의 원형부정사 to복원 포함)
- **to부정사** — 명사적 목적어(want to go=3형식)·주어(To learn is important=2형식)·5형식 OC
- **동명사** — 목적어(enjoy reading)·주어(Relying on … makes …=5형식)
- **句동사** — take in / pull out / pick up / break down 등 불변화사 흡수
- **복문(종속절)** — 명사절 / 형용사절(관계대명사절, 주어·목적어 수식) / 부사절(문두 포함) 분리 + 각 절 형식 표시
- **보정** — 비교구문(as~as / -er than), 시간 부사구(every day), 감각 연결동사, 생략어 복원 `(one)/(ones)`
- **비문 안내** — 동사가 없거나 분석 불가한 입력은 안내 메시지 표시
- 영어 전용 입력, 맞춤법/문법 체크(LanguageTool), 자동 번역, 결과 복사

## UI

- **홈 → 결과 흐름**: 처음엔 제목·검색창·예시·최근검색이 화면 중앙, 검색하면 상단 스티키 헤더(제목+검색창+최근검색)로 전환, 제목 클릭 시 홈 복귀
- **모드 2종**: `문장 분석`(로컬 파서) / `구조도 시각화 (Claude JSON)` — 후자엔 문장→JSON 초안 생성 보조 입력
- **구조도 색**: 주절·본동사 baseline = 빨강 / 종속절·수식어 = 검정 (교재 동일), 역할별 색 + 범례
- **반응형**(모바일 헤더 세로 스택), 접근성(키보드 포커스·aria)

## 구조도 작도 규칙

- S–V·V–O·IO–DO는 메인라인 **관통/반(half) 수직선**, 보어·OC는 **사선(`\`)**
- 메인라인엔 핵(head)만, 단어 수식어는 baseline 아래 `\`사선+단어
- **전치사구·분사구·to부정사구는 ㄴ(L자) 받침** — 세로다리 옆 **위에 전치사(분사/to)**, **가로받침선 위에 목적어**(둘 다 같은 ㄴ), 목적어 수식어는 그 아래 `\`
- 좌표는 canvas `measureText`로 측정해 SVG로 그려 픽셀 어긋남 없음

## 파일 구조

```
yangeng/
├── index.html        # 마크업 (Inter + Noto Sans KR)
├── style.css         # 디자인 (Notion 라이트 테마)
├── parser.js         # 구문 분석 엔진
├── renderer.js       # 구조도 렌더 + UI 로직
├── docs/
│   ├── 문법.md        # 문법 규칙 레퍼런스(스펙)
│   ├── DESIGN.md      # 디자인 스펙 (Notion 기반)
│   └── WORKLOG.md     # 작업 로그
└── test/             # 회귀 테스트 (harness / render_smoke)
```

## 사용법

`index.html`을 브라우저에서 열거나 GitHub Pages로 배포합니다.
POS 태깅은 [compromise](https://github.com/spencermountain/compromise)를 CDN으로 로드합니다.

## 개발 / 테스트

파서 회귀 테스트는 실제 앱과 동일하게 compromise를 주입해 실행합니다(**필수** — 미설치 시 결과가 달라짐).

```bash
cd test
npm install            # compromise 설치
node harness.js        # 형식 회귀 → test/results.json
node render_smoke.js   # 렌더러 예외/패널 검증
```

문법 규칙은 [docs/문법.md](docs/문법.md), 작업 이력은 [docs/WORKLOG.md](docs/WORKLOG.md) 참고.
디자인은 [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)의 Notion 시스템 기반([docs/DESIGN.md](docs/DESIGN.md)).
