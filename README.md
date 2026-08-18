# MCM SCENE FIT — Backend

MCM SCENE FIT의 API 서버입니다.
서비스 기획은 [MCM-Scene-Fit-FE](https://github.com/MCM-Scene-Fit/MCM-Scene-Fit-FE), API 계약은 프론트 레포의 [`Scene-Fit/docs/API.md`](https://github.com/MCM-Scene-Fit/MCM-Scene-Fit-FE/blob/develop/Scene-Fit/docs/API.md)를 따릅니다.

> 현재 단계: **P0 엔드포인트 전체 구현 완료 / 프론트 연동 완료 / Supabase 연결 완료 / 배포 전**
> 기준일: 2026-08-18

---

## 이 서버가 하는 일

프론트는 화면을 그리고, 서버는 **판정과 기록**을 맡습니다.

| 하는 일 | 위치 | 이유 |
| --- | --- | --- |
| 전신 사진 자세·마스크 분석 | 브라우저 | 사진을 서버로 보내지 않습니다 |
| 가방 2D 크기·위치 계산 | 브라우저 | 공식 치수 : 사용자 키 비율 |
| **수납·착용·장면 판정** | **서버** | 규칙의 단일 출처 |
| **AI 설명 문장 생성** | **서버** | API 키를 브라우저에 두지 않기 위함 |
| **세션·Fit Pass 저장** | **서버** | 신청 당시 판정을 스냅샷으로 보관 |

---

## 설계 원칙

기획서 9절·14절과 API.md 0절을 서버 규칙으로 고정하였습니다.

1. **사실과 설명을 분리합니다.** 수납·착용·크기 판정은 규칙 엔진이 하고, AI는 그 결과를 문장으로만 정리합니다.
2. **공식 정보가 없으면 확정하지 않습니다.** 감점 대신 `store-check`(매장 확인 필요)로 표시합니다.
3. **외부 치수로 내부 용량을 계산하지 않습니다.** `90% 찼다` 같은 표현을 만들지 않습니다.
4. **실시간 재고를 확정 표시하지 않습니다.** Fit Pass는 확인 요청입니다.
5. **총점 하나로 순위를 고정하지 않습니다.** 응답은 항상 세 축입니다.

---

## 개발 현황

| 항목 | 상태 | 비고 |
| --- | --- | --- |
| 기술 스택 확정 | 완료 | Node.js, TypeScript, Hono |
| P0 엔드포인트 | 완료 | 13개 |
| 규칙 엔진 이식 | 완료 | 프론트 `src/lib/fitCheck.ts`와 동일 |
| 추천 (P1) | 완료 | `POST /v1/recommend` |
| AI 설명 | 완료 | Gemini, 키 없으면 규칙 문장 사용 |
| DB 연결 | 완료 | Supabase(Postgres), 키 없으면 메모리 |
| 프론트 연동 | 완료 | 결과·비교·Fit Pass 화면 |
| 자동 검사 | 완료 | 12개 |
| 배포 | 미착수 | Vercel 예정 |

---

## 기술 스택

| 구분 | 내용 |
| --- | --- |
| 런타임 | Node.js 20+ |
| 언어 | TypeScript |
| 웹 프레임워크 | Hono 4 |
| DB | Supabase (PostgreSQL) / `postgres` 드라이버 |
| AI | Google Gemini (`gemini-2.5-flash`) |
| 실행 | tsx |

프론트가 TypeScript라 **판정 로직을 그대로 옮길 수 있도록** 같은 언어를 선택하였습니다.

---

## 실행 방법

```bash
npm install
npm run dev     # http://localhost:8787
npm test        # 검사 12개
```

`.env` 없이도 동작합니다. 없으면 메모리에 저장하고, AI 대신 규칙 엔진 문장을 사용합니다.

```bash
cp .env.example .env
```

| 환경 변수 | 없을 때 | 발급처 |
| --- | --- | --- |
| `DATABASE_URL` | 메모리에 저장 (프로세스 종료 시 소멸) | Supabase → Connect → Transaction pooler |
| `GEMINI_API_KEY` | 규칙 엔진 문장을 그대로 반환 | https://aistudio.google.com/apikey |

DB를 붙일 때는 [`schema.sql`](./schema.sql)을 먼저 실행합니다.

---

## 프로젝트 구조

```
src/
  types.ts          공통 타입·enum (프론트 src/types/index.ts와 동일)
  data/
    products.ts     공식몰 검수 가방 10개
    items.ts        소지품 카탈로그 16종
    labels.ts       한글 라벨 · 데모 매장 4곳
  lib/
    itemFit.ts      소지품 치수 판정 (축 정렬 AABB)
    fitCheck.ts     규칙 엔진 — 세 축 판정, 대안 제품
    recommend.ts    조건 기반 후보 최대 3개
  ai.ts             규칙 결과 → 설명 문장
  db.ts             Postgres 또는 메모리
  app.ts            라우팅
  server.ts         로컬 실행 진입점
api/index.ts        Vercel 진입점
schema.sql          테이블 정의
test.ts             자동 검사
```

### 프론트와 공유하는 파일

`types.ts`, `data/`, `lib/itemFit.ts`, `lib/fitCheck.ts` 는 프론트 `develop` 브랜치에서 **그대로 가져온 파일**입니다.

판정이 양쪽에서 갈리면 안 되므로 임의로 수정하지 않습니다. 로직을 바꿀 때는 **양쪽 레포를 함께 갱신**합니다.

---

## 엔드포인트

Base URL `/v1` · JSON(UTF-8) · camelCase · 비회원 세션(`X-Session-Id`)

### 제품 · 소지품 · 매장

| Method | Path | 설명 |
| --- | --- | --- |
| `GET` | `/v1/items` | 소지품 카탈로그 16종 |
| `GET` | `/v1/products` | 제품 목록 (`wear` · `color` · `price` 필터) |
| `GET` | `/v1/products/{productId}` | 제품 상세 |
| `GET` | `/v1/stores` | 데모 매장 4곳 |

### 세션

| Method | Path | 설명 |
| --- | --- | --- |
| `POST` | `/v1/sessions` | 세션 생성 (응답 헤더 `X-Session-Id`) |
| `GET` | `/v1/sessions/me` | 세션 조회 |
| `PATCH` | `/v1/sessions/me` | 선택 제품·조건 저장 |
| `DELETE` | `/v1/sessions/me` | 세션 삭제 |

TTL은 24시간이며, 전신 사진은 저장하지 않습니다.

### 판정

| Method | Path | 설명 |
| --- | --- | --- |
| `POST` | `/v1/fit-check` | 규칙 기반 세 축 판정 |
| `POST` | `/v1/fit-check/compare` | 선택 제품 vs 대안 |
| `POST` | `/v1/recommend` | 조건 기반 후보 최대 3개 (P1) |
| `POST` | `/v1/ai/explain` | 규칙 결과 → 설명 문장 |

### Store Fit Pass

| Method | Path | 설명 |
| --- | --- | --- |
| `POST` | `/v1/fit-passes` | 매장 체험 확인 요청 접수 |
| `GET` | `/v1/fit-passes/{fitPassId}` | 신청 내역 조회 |

응답에는 항상 `demo: true`와 재고 비확정 문구가 포함됩니다.

### 제공하지 않는 것

실시간 재고 조회, 예약·결제 확정, 생성형 가상 착용, 사진 기반 신체 추정은 제공하지 않습니다.

---

## 판정 규칙 요약

### 소지품 수납 4단계

품목 하나당 하나만 부여하며, 공식 수납은 치수 추측으로 뒤집지 않습니다.

| level | 기준 |
| --- | --- |
| `confirmed` | 공식 상세에 해당 품목 수납이 명시됨 |
| `estimated` | 축 점유율 85% 이하 (치수상 가능, 내부 구조 미확인) |
| `store-check` | 축 점유율 85% 초과 100% 이하 |
| `unlikely` | 어떤 축 정렬 회전으로도 가방 치수를 초과 |

### 세 축

| 축 | 판정 |
| --- | --- |
| Scene Match | 선택 장면이 제품 `sceneTags`에 있으면 `match` |
| Carry Check | `unlikely` 또는 착용 방식 불일치면 `weak`, 전부 `confirmed`면 `match` |
| Rewear Potential | 재사용 장면이 `rewearTags`에 있으면 `match` |

### 대안 제품

착용 가능 +4 · 장면 일치 +3 · 공식 수납 품목 수 +1 · 착용 불일치 −5 · 치수 초과 품목 −4
최고점이 **0보다 클 때만** 대안을 제시하며, 없으면 `alternativeId: null`입니다.

---

## 자동 검사

```bash
npm test
```

기획서 12-1 신뢰 지표를 검사로 옮겼습니다.

- 공식 수납 품목을 치수 추측으로 뒤집지 않는가
- 치수를 초과한 품목을 `unlikely`로 판정하는가
- 공식 무게가 없는 제품에 무게 기반 문장을 붙이지 않는가
- Fit Pass 응답에 재고 확정 필드(`inStock` 등)가 없는가
- 필수 조건 미충족 시 `409`, enum 불일치 시 `400`을 반환하는가
- 세션 저장·조회, Fit Pass 접수·조회가 동작하는가

검사는 항상 메모리 모드로 실행되어 실제 DB를 건드리지 않습니다.

---

## 배포 (예정)

1. Supabase에서 [`schema.sql`](./schema.sql) 실행
2. Vercel에 이 레포를 연결
3. 환경 변수 `DATABASE_URL`, `GEMINI_API_KEY` 등록
4. 프론트 `.env`의 `VITE_API_BASE`를 배포 주소로 변경
