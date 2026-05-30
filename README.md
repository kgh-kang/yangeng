# 양 번역기

영어 문장을 입력하면 Reed-Kellogg 구조도로 5형식 구문 분석을 해주는 웹 앱입니다.

## 기능

- 영어 문장 입력 시 자동 구문 분석
- Reed-Kellogg 스타일 구조도 시각화
- 1~5형식 자동 판별
  - 1형식 (자존형 — '있다')
  - 2형식 (의존형 — '이다/되다')
  - 3형식 (소유형 — '하다')
  - 4형식 (수여형 — '주다')
  - 5형식 (복합형 — '이다고+하다')
- 문장 유형 인식: 평서문 / 의문문 / 명령문
- 5형식 동사 세분류: 사역동사 / 지각동사 / 유도동사 / 비사역동사 / 간주동사
- 수식어 자동 분리 (관사, 형용사, 부사, 전치사구)
- **句동사(phrasal verb) 인식** — take in / pull out / pick up / break down 등 (불변화사 흡수)
- **복문(종속절) 분석** — 명사절 / 형용사절 / 부사절 자동 분리 + 각 절의 형식 표시
  - 명사절: that·whether·if·의문사가 목적어 자리 (I saw **that** ... / I know **who** ...)
  - 형용사절: 관계사 + 선행사 (the stars **that** were shining)
  - 부사절: 종속접속사 (..., **when** they were shining)

## 구조도 규칙

| 기호 | 용도 |
|------|------|
| `\|` 수직선 | S-V, V-O, IO-DO 구분 (메인라인 관통) |
| `/` 사선 | V-C, O-OC 구분 (메인라인 위로만) |
| `\|` 수직선 (아래) | 수식어 연결 |

- 메인라인에는 핵(head)만 배치
- 관사 / 형용사 / 부사는 아래 수식어로 분리
- 2형식 형용사 보어 → (one) 복원, 형용사는 수식어

## 파일 구조

```
yangeng/
├── index.html      # HTML
├── style.css       # 스타일 (Noto Sans KR)
├── parser.js       # 구문 분석 엔진
└── renderer.js     # 구조도 렌더링
```

## 사용법

`index.html`을 브라우저에서 열거나 GitHub Pages로 배포하면 됩니다.
POS 태깅은 [compromise](https://github.com/spencermountain/compromise)를 CDN으로 로드합니다.

## 개발 / 테스트

파서 회귀 테스트는 Node에서 실제 앱과 동일하게 compromise를 주입해 실행합니다.

```bash
cd test
npm install            # compromise 설치 (회귀 테스트 정확도용)
node harness.js        # 강의 예문 회귀 → test/results.json
node render_smoke.js   # 렌더러 복문 렌더 예외 검증
```

이론적 근거(강의 5형식↔한국어 동사유형 매핑, 종속절 3분류, Reed-Kellogg 작도 규칙)와
작업 로그는 `docs/WORKLOG.md` 참고.
