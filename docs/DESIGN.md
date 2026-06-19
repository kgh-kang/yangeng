# 양 번역기 — 디자인 스펙 (DESIGN)

> 출처: [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) → **Notion** DESIGN.md 기반.
> 밝은 교재풍 라이트 테마. 구조도(Reed-Kellogg)는 교재처럼 **흰 배경 + 빨강 주선 / 검정 수식**.
> 원본 레퍼런스: [notion-design-reference.md](notion-design-reference.md). UI 변경 시 이 문서도 업데이트.

## 컨셉
- **밝고 차분한 워크스페이스 톤** — 흰 캔버스, 회색 surface, 헤어라인 구분선.
- **시그니처 퍼플 CTA**(#5645d4) 하나로 액션 강조, 나머지는 무채색.
- 구조도가 종이 교재처럼 보이도록 라이트 배경 채택(다크→라이트 전환의 핵심 이유).

## 색 토큰 (`style.css :root`)
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--bg` | `#f6f5f4` | 페이지 배경(surface) |
| `--bg-surface` / `--card` | `#ffffff` | 카드·입력 |
| `--card-border`/`--border` | `#e5e3df` | 헤어라인 |
| `--border-light` | `#ede9e4` | 약한 구분선 |
| `--hairline-strong` | `#c8c4be` | 강조 헤어라인(hover) |
| `--text` | `#1a1a1a` (ink) | 본문 |
| `--text-2` | `#5d5b54` (slate) | 보조 |
| `--text-3` | `#787671` (steel) | 흐린 텍스트 |
| `--primary` | `#5645d4` | CTA·포커스·IO |
| `--primary-pressed` | `#4534b3` | 눌림 |
| `--gem-gradient` | `linear-gradient(135deg,#5645d4,#7b3ff2)` | 분석버튼 |

## 형식 배지색
1형식 `#1a56db` · 2형식 `#5645d4` · 3형식 `#1aae39` · 4형식 `#dd5b00` · 5형식 `#e03131`
(연한 틴트 배경 + 진한 글자.)

## 구조도 색 (`renderer.js _RK`) — 교재 규칙
- `line` `#C0504D` 빨강 = 주절·본동사 baseline
- `sub`/`mod` `#37352f` 검정 = 종속절·수식어(교재의 검정 선/글자)
- `restored` `#a4a097` 연회색 = 생략 복원어 `(one)/(a)/(to be)`
- 역할 글자색: S `#1a56db` · V `#C0504D` · O `#1aae39` · IO `#5645d4` · OC `#dd5b00` · C `#1a56db`

## 타이포그래피
- **Inter**(라틴) + **Noto Sans KR**(한글). 제목 weight 600~700, 음수 letter-spacing.

## 형태/간격
- 라운드: 카드/입력 `16~28px`, 버튼 `24px`(pill). 헤어라인 1px.
- 간격 스케일 8 / 12 / 16 / 20 / 24 / 32 / 40px.
- 그림자: `--shadow-sm` 0 1px 2px / `--shadow-md` 0 4px 16px (rgba 15,15,15 저투명).
- 포커스: `0 0 0 3px rgba(86,69,212,0.12)` 퍼플 링.

## 적용 범위
헤더(제목 텍스트 — 로고 그래픽 제거, 클릭 시 홈) · 입력 바(흰 카드+퍼플 포커스) · 분석 버튼(퍼플) ·
결과 카드(흰 배경+헤어라인) · 형식 배지(틴트) · 구조도 SVG(교재색) · 절 패널 · 상세/맞춤법.
