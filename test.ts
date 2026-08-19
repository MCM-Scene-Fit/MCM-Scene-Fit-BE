import assert from 'node:assert/strict'
import { app } from './src/app.js'
import { getProduct } from './src/data/products.js'
import { judgeItemFit } from './src/lib/itemFit.js'
import { runFitCheck } from './src/lib/fitCheck.js'
import type { Conditions } from './src/types.js'

const 여행조건: Conditions = {
  scene: 'travel',
  mobility: 'light-walk',
  items: ['phone', 'wallet', 'camera'],
  wearStyle: 'crossbody',
  destination: '도쿄, 10월',
  rewearScene: 'daily',
  itemPresets: {},
}

const json = (path: string, init?: RequestInit) => app.request(path, init)
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  json(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...headers } })

async function run() {
  // 1. 공식 수납은 치수 추측으로 뒤집히지 않는다. (신뢰 지표 1번)
  const 작은가방 = { widthMm: 10, heightMm: 10, depthMm: 10, officialStorage: ['laptop13' as const] }
  assert.equal(judgeItemFit('laptop13', 작은가방).level, 'confirmed', '공식 수납이 치수로 뒤집혔다')

  // 2. 공식 수납이 아니고 치수도 안 되면 unlikely.
  const 파우치 = getProduct('aren-mini-pouch')!
  assert.equal(judgeItemFit('laptop13', 파우치).level, 'unlikely', '안 들어가는 노트북이 unlikely가 아니다')

  // 3. 세 축이 모두 나온다.
  const fit = runFitCheck(getProduct('aren-nova-crossbody')!, 여행조건)
  for (const axis of [fit.sceneMatch.status, fit.carryCheck.status, fit.rewearPotential.status]) {
    assert.ok(['match', 'check', 'weak'].includes(axis), `축 상태가 이상하다: ${axis}`)
  }

  // 4. 공식 무게가 없는 제품에 무게 문장을 붙이지 않는다. (신뢰 지표 4번)
  const 무게없음 = runFitCheck(getProduct('aren-nova-tote')!, { ...여행조건, mobility: 'long-walk', wearStyle: 'tote' })
  assert.ok(!무게없음.storeChecks.some((line) => line.includes('무게')), '무게 정보가 없는데 무게 문장을 붙였다')

  // 5. 필수 조건이 비면 409.
  assert.equal((await post('/v1/fit-check', { productId: 'aren-mini-pouch', conditions: { scene: 'travel' } })).status, 409)

  // 6. enum에 없는 값이면 400.
  assert.equal(
    (await post('/v1/fit-check', { productId: 'aren-mini-pouch', conditions: { ...여행조건, scene: 'space' } })).status,
    400,
  )

  // 7. 없는 제품이면 404.
  assert.equal((await post('/v1/fit-check', { productId: 'nope', conditions: 여행조건 })).status, 404)

  // 8. 정상 요청은 200.
  const ok = await post('/v1/fit-check', { productId: 'aren-nova-crossbody', conditions: 여행조건 })
  assert.equal(ok.status, 200)
  const body = (await ok.json()) as any
  assert.equal(body.data.productId, 'aren-nova-crossbody')
  assert.equal(body.data.carryCheck.items.length, 3)

  // 9. 목록·필터.
  assert.equal(((await (await json('/v1/items')).json()) as any).meta.count, 16)
  assert.equal(((await (await json('/v1/products')).json()) as any).meta.count, 10)
  const 백팩 = (await (await json('/v1/products?wear=backpack')).json()) as any
  assert.ok(백팩.data.every((p: any) => p.wearStyles.includes('backpack')), '착용 방식 필터가 안 걸린다')

  // 10. 세션 생성 → 저장 → 조회.
  const 세션 = (await (await post('/v1/sessions', {})).json()) as any
  const sid = 세션.data.sessionId
  await json('/v1/sessions/me', {
    method: 'PATCH',
    body: JSON.stringify({ selectedProductId: 'aren-mini-pouch', conditions: 여행조건 }),
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sid },
  })
  const 조회 = (await (await json('/v1/sessions/me', { headers: { 'X-Session-Id': sid } })).json()) as any
  assert.equal(조회.data.selectedProductId, 'aren-mini-pouch')
  assert.equal(조회.data.conditions.scene, 'travel')

  // 11. Fit Pass 생성 → 조회. 재고 확정 필드가 없어야 한다. (신뢰 지표 2·5번)
  const 신청 = (await (await post(
    '/v1/fit-passes',
    { productId: 'aren-nova-crossbody', storeId: 'mcm-cheongdam', experiences: ['fit-ratio'], conditions: 여행조건 },
    { 'X-Session-Id': sid },
  )).json()) as any
  assert.equal(신청.data.demo, true)
  assert.equal(신청.data.status, 'checking')
  const 직렬화 = JSON.stringify(신청.data)
  assert.ok(!직렬화.includes('inStock') && !직렬화.includes('available_now'), '재고 확정 필드가 들어갔다')
  const 재조회 = (await (await json(`/v1/fit-passes/${신청.data.id}`)).json()) as any
  assert.equal(재조회.data.id, 신청.data.id)

  // 12. 추천은 최대 3개.
  const 추천 = (await (await post('/v1/recommend', 여행조건)).json()) as any
  assert.ok(추천.data.candidates.length <= 3, '추천이 3개를 넘었다')

  // 13. AI 키 없이도 자연어 파싱 요청은 200이고, 값은 비어 있으며 이유가 남는다.
  const 파싱 = (await (await post('/v1/ai/parse-conditions', { text: '10월 도쿄 여행, 카메라 들고 오래 걸을 예정' })).json()) as any
  assert.equal(파싱.data.scene, null, 'AI 키 없이도 scene이 채워졌다')
  assert.ok(파싱.data.unparsed.length > 0, 'AI 키가 없다는 안내가 없다')

  // 14. 빈 문장은 400.
  assert.equal((await post('/v1/ai/parse-conditions', { text: '' })).status, 400)

  // 15. 날씨: 파라미터 있으면 200, usableForMaterialJudgement는 항상 false.
  const 날씨 = (await (await json('/v1/weather?destination=도쿄&period=2026-10')).json()) as any
  assert.equal(날씨.data.usableForMaterialJudgement, false, '공식 정보 없이 날씨 판단을 허용했다')
  assert.ok(날씨.data.summary.length > 0, '날씨 요약이 비었다')

  // 16. 날씨: 파라미터 없으면 400.
  assert.equal((await json('/v1/weather')).status, 400)

  // 17. 업로드: jpeg 파일을 넣으면 201이고, 내려받으면 원본과 같다.
  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0xff, 0xd9])
  const form = new FormData()
  form.append('file', new File([jpegBytes], 'test.jpg', { type: 'image/jpeg' }))
  const 업로드 = (await (await json('/v1/uploads', { method: 'POST', body: form })).json()) as any
  assert.ok(업로드.data.uploadId.startsWith('upl_'), '업로드 id 형식이 다르다')
  const 다운로드 = await json(new URL(업로드.data.url).pathname)
  assert.equal(다운로드.headers.get('content-type'), 'image/jpeg')
  const 받은바이트 = new Uint8Array(await 다운로드.arrayBuffer())
  assert.deepEqual(받은바이트, jpegBytes, '다운로드한 이미지가 원본과 다르다')

  // 18. 업로드: 삭제하면 204, 삭제 후 재조회는 404.
  assert.equal((await json(`/v1/uploads/${업로드.data.uploadId}`, { method: 'DELETE' })).status, 204)
  assert.equal((await json(new URL(업로드.data.url).pathname)).status, 404)

  // 19. 업로드: 허용 안 된 형식은 415, 파일 없으면 400.
  const 잘못된형식 = new FormData()
  잘못된형식.append('file', new File([jpegBytes], 'test.txt', { type: 'text/plain' }))
  assert.equal((await json('/v1/uploads', { method: 'POST', body: 잘못된형식 })).status, 415)
  assert.equal((await json('/v1/uploads', { method: 'POST', body: new FormData() })).status, 400)

  // 20. 소지품 규격을 바꾸면 판정 근거(점유율)도 달라진다.
  const 작은폰 = (await (await post('/v1/fit-check', {
    productId: 'aren-mini-pouch',
    conditions: { ...여행조건, items: ['phone'], itemPresets: { phone: 'se' } },
  })).json()) as any
  const 큰폰 = (await (await post('/v1/fit-check', {
    productId: 'aren-mini-pouch',
    conditions: { ...여행조건, items: ['phone'], itemPresets: { phone: '6.7' } },
  })).json()) as any
  assert.ok(
    작은폰.data.carryCheck.items[0].fillRatio < 큰폰.data.carryCheck.items[0].fillRatio,
    '소지품 규격을 바꿔도 점유율이 그대로다',
  )

  // 21. 목록에 없는 규격은 무시하고 기본값으로 판정한다.
  const 엉터리 = (await (await post('/v1/fit-check', {
    productId: 'aren-mini-pouch',
    conditions: { ...여행조건, items: ['phone'], itemPresets: { phone: '없는규격' } },
  })).json()) as any
  assert.equal(엉터리.status ?? 200, 200)
  assert.ok(엉터리.data.carryCheck.items[0].fillRatio > 0, '기본 규격으로 판정되지 않았다')

  console.log('통과: 21개 검사 모두 성공')
}

run().catch((error) => {
  console.error('실패:', error.message)
  process.exit(1)
})
