# MCM SCENE FIT — Backend

MCM 가방이 내 상황에 맞는지 확인해 주는 서비스의 API 서버입니다.

화면은 [MCM-Scene-Fit-FE](https://github.com/MCM-Scene-Fit/MCM-Scene-Fit-FE)가 맡고, 이 서버는 **판정과 저장**을 맡습니다.
API 명세는 프론트 레포의 [`Scene-Fit/docs/API.md`](https://github.com/MCM-Scene-Fit/MCM-Scene-Fit-FE/blob/develop/Scene-Fit/docs/API.md)를 따릅니다.

> 현재: P0 엔드포인트 13개 구현 완료 · Supabase 연결 완료 · 배포 전 (2026-08-18)

---

## 역할 분담

| 하는 일 | 어디서 |
| --- | --- |
| 사진 자세 분석, 가방 크기·위치 계산 | 브라우저 (사진은 서버로 보내지 않음) |
| 수납·착용·장면 판정 | **서버** |
| 판정 결과를 문장으로 정리 | **서버** (API 키를 브라우저에 두지 않기 위함) |
| 세션·Fit Pass 저장 | **서버** |

---

## 설계 원칙

1. 판정은 규칙 엔진이 하고, AI는 그 결과를 문장으로만 바꿉니다.
2. 공식 정보가 없으면 확정하지 않고 `store-check`(매장 확인 필요)로 둡니다.
3. 겉 치수로 내부 용량을 계산하지 않습니다.
4. 실시간 재고를 확정하지 않습니다. Fit Pass는 확인 요청입니다.
5. 총점 하나로 순위를 매기지 않습니다. 응답은 항상 세 축입니다.

---

## 실행

```bash
npm install
npm run dev     # http://localhost:8787
npm test        # 검사 12개
```

`.env` 없이도 동작합니다.

| 환경 변수 | 없으면 | 발급처 |
| --- | --- | --- |
| `DATABASE_URL` | 메모리에 저장 (종료 시 사라짐) | Supabase → Connect → Transaction pooler |
| `GEMINI_API_KEY` | 규칙 엔진 문장을 그대로 반환 | https://aistudio.google.com/apikey |

DB를 붙일 때는 [`schema.sql`](./schema.sql)을 먼저 실행합니다.

---

## 구조

```
src/
  types.ts          공통 타입·enum
  data/             가방 10개 · 소지품 16종 · 매장 4곳 · 한글 라벨
  lib/itemFit.ts    소지품 치수 판정
  lib/fitCheck.ts   규칙 엔진 (세 축 판정, 대안 제품)
  lib/recommend.ts  조건 기반 후보 최대 3개
  ai.ts             판정 결과 → 문장 (Gemini)
  db.ts             Postgres 또는 메모리
  app.ts            라우팅
api/index.ts        Vercel 진입점
schema.sql          테이블 2개
test.ts             자동 검사
```

**`types.ts` · `data/` · `lib/itemFit.ts` · `lib/fitCheck.ts` 는 프론트에서 그대로 가져온 파일입니다.**
판정이 양쪽에서 갈리면 안 되므로, 고칠 때는 두 레포를 함께 갱신합니다.

---

## 엔드포인트

Base URL `/v1` · JSON · 비회원 세션(`X-Session-Id`, 24시간)

| Method | Path | 설명 |
| --- | --- | --- |
| `GET` | `/items` | 소지품 16종 |
| `GET` | `/products` | 제품 목록 (`wear`·`color`·`price` 필터) |
| `GET` | `/products/{id}` | 제품 상세 |
| `GET` | `/stores` | 매장 4곳 |
| `POST` | `/sessions` | 세션 생성 |
| `GET` `PATCH` `DELETE` | `/sessions/me` | 세션 조회·저장·삭제 |
| `POST` | `/fit-check` | 세 축 판정 |
| `POST` | `/fit-check/compare` | 선택 제품 vs 대안 |
| `POST` | `/recommend` | 조건 기반 후보 3개 (P1) |
| `POST` | `/ai/explain` | 판정 결과 → 문장 |
| `POST` | `/fit-passes` | 매장 체험 요청 접수 |
| `GET` | `/fit-passes/{id}` | 신청 내역 조회 |

실시간 재고 조회, 예약·결제, 생성형 착용 이미지는 제공하지 않습니다.

---

## 판정 규칙

### 소지품 수납 4단계

품목마다 하나만 부여합니다. 공식 수납은 치수 계산으로 뒤집지 않습니다.

| level | 기준 |
| --- | --- |
| `confirmed` | 공식 상세에 수납이 명시됨 |
| `estimated` | 축 점유율 85% 이하 |
| `store-check` | 축 점유율 85% 초과 100% 이하 |
| `unlikely` | 어떻게 돌려도 가방 치수를 넘음 |

축 점유율은 소지품과 가방의 가로·세로·폭을 각각 정렬해 비교한 값 중 가장 큰 것입니다.

### 세 축

| 축 | `match` 조건 |
| --- | --- |
| Scene Match | 선택 장면이 제품 `sceneTags`에 있음 |
| Carry Check | 모든 품목이 `confirmed`이고 착용 방식이 맞음 |
| Rewear Potential | 재사용 장면이 `rewearTags`에 있음 |

### 대안 제품

착용 가능 +4 · 장면 일치 +3 · 공식 수납 품목 수 +1 · 착용 불일치 −5 · 치수 초과 품목 −4

최고점이 0보다 클 때만 대안을 내려 주고, 없으면 `alternativeId: null`입니다.

---

## 자동 검사

```bash
npm test
```

기획서 신뢰 지표를 검사로 옮겼습니다.

- 공식 수납 품목을 치수 계산으로 뒤집지 않는가
- 치수를 넘은 품목을 `unlikely`로 판정하는가
- 공식 무게가 없는 제품에 무게 문장을 붙이지 않는가
- Fit Pass 응답에 재고 확정 필드가 없는가
- 조건 미충족 `409`, enum 불일치 `400`을 반환하는가
- 세션·Fit Pass 저장과 조회가 동작하는가

검사는 항상 메모리 모드로 돌아가 실제 DB를 건드리지 않습니다.

---

## 배포 (예정)

1. Supabase에서 `schema.sql` 실행
2. Vercel에 레포 연결
3. `DATABASE_URL`, `GEMINI_API_KEY` 등록
4. 프론트 `.env`의 `VITE_API_BASE`를 배포 주소로 변경
