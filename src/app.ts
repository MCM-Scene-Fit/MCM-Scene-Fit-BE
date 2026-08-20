import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  explain,
  parseConditions as parseConditionsWithAI,
  sceneBackground,
  sceneConcept,
  scenePortrait,
  type ScenePortraitBody,
  weatherReference,
} from './ai.js'
import { CARRY_ITEMS } from './data/items.js'
import { ITEM_PRESETS, PRESET_KINDS, type PresetKind } from './data/itemPresets.js'
import { STORES } from './data/labels.js'
import { PRODUCTS, getProduct } from './data/products.js'
import { runFitCheck } from './lib/fitCheck.js'
import { recommend } from './lib/recommend.js'
import { get, newId, put, remove } from './db.js'
import {
  ITEMS,
  MOBILITY,
  SCENES,
  WEAR_STYLES,
  type Conditions,
  type FitPassExperience,
  type FitPassStatus,
  type ItemId,
  type ItemPresets,
  type Mobility,
  type Scene,
  type WearStyle,
} from './types.js'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
// 부스 데모용 상태 전이 시간. 접수 10초, 확인 중 40초 뒤 확인 완료.
const DEMO_REQUESTED_MS = 10_000
const DEMO_CHECKING_MS = 40_000

const EXPERIENCES: FitPassExperience[] = ['fit-ratio', 'storage-test', 'styling', 'color-compare', 'care']

type SessionData = {
  sessionId: string
  selectedProductId: string | null
  selectedColorId: string | null
  conditions: Conditions | null
  fitPassId: string | null
}

export const app = new Hono()

app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type', 'X-Session-Id'], exposeHeaders: ['X-Session-Id'] }))

/** 실패 응답은 전부 같은 모양으로 내려간다. */
function fail(code: string, message: string, status: 400 | 404 | 409 | 413 | 415 | 500 | 501, details?: unknown) {
  return Response.json({ error: { code, message, ...(details ? { details } : {}) } }, { status })
}

// ---------------------------------------------------------------- 제품 · 소지품 · 매장

app.get('/v1/items', (c) => c.json({ data: CARRY_ITEMS, meta: { count: CARRY_ITEMS.length } }))

app.get('/v1/stores', (c) => c.json({ data: STORES, meta: { count: STORES.length } }))

app.get('/v1/products', (c) => {
  const wear = c.req.query('wear') ?? 'all'
  const color = c.req.query('color') ?? 'all'
  const price = c.req.query('price') ?? 'all'

  const data = PRODUCTS.filter((product) => {
    if (wear !== 'all' && !product.wearStyles.includes(wear as WearStyle)) return false
    if (color !== 'all' && !product.colors.some((swatch) => swatch.id === color)) return false
    if (price === 'under-100' && product.price >= 1_000_000) return false
    if (price === '100-130' && (product.price < 1_000_000 || product.price > 1_300_000)) return false
    if (price === 'over-130' && product.price <= 1_300_000) return false
    return true
  })
  return c.json({ data, meta: { count: data.length } })
})

app.get('/v1/products/:productId', (c) => {
  const product = getProduct(c.req.param('productId'))
  if (!product) return fail('PRODUCT_NOT_FOUND', '제품을 찾을 수 없습니다.', 404, { productId: c.req.param('productId') })
  return c.json({ data: product })
})

// ---------------------------------------------------------------- 세션

app.post('/v1/sessions', async (c) => {
  const sessionId = newId('ses')
  const data: SessionData = { sessionId, selectedProductId: null, selectedColorId: null, conditions: null, fitPassId: null }
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await put('sessions', sessionId, data, expiresAt)
  c.header('X-Session-Id', sessionId)
  return c.json({ data: { ...data, expiresAt: expiresAt.toISOString() } }, 201)
})

app.get('/v1/sessions/me', async (c) => {
  const session = await loadSession(c.req.header('X-Session-Id'))
  if (!session) return fail('SESSION_NOT_FOUND', '세션이 없거나 만료되었습니다.', 404)
  return c.json({ data: session })
})

app.patch('/v1/sessions/me', async (c) => {
  const sessionId = c.req.header('X-Session-Id')
  const session = await loadSession(sessionId)
  if (!session || !sessionId) return fail('SESSION_NOT_FOUND', '세션이 없거나 만료되었습니다.', 404)

  const body = await safeJson(c)
  const next: SessionData = {
    ...session,
    selectedProductId: body.selectedProductId ?? session.selectedProductId,
    selectedColorId: body.selectedColorId ?? session.selectedColorId,
    conditions: body.conditions ? { ...(session.conditions ?? emptyConditions()), ...body.conditions } : session.conditions,
  }
  await put('sessions', sessionId, next, new Date(Date.now() + SESSION_TTL_MS))
  return c.json({ data: next })
})

app.delete('/v1/sessions/me', async (c) => {
  const sessionId = c.req.header('X-Session-Id')
  if (sessionId) await remove('sessions', sessionId)
  return new Response(null, { status: 204 })
})

// ---------------------------------------------------------------- 핏 체크 (규칙 엔진)

app.post('/v1/fit-check', async (c) => {
  const body = await safeJson(c)
  const product = getProduct(String(body.productId ?? ''))
  if (!product) return fail('PRODUCT_NOT_FOUND', '제품을 찾을 수 없습니다.', 404, { productId: body.productId })

  const parsed = parseConditions(body.conditions)
  if ('error' in parsed) return parsed.error

  const fit = runFitCheck(product, parsed.conditions)
  return c.json({ data: { productId: product.id, ...fit, allConditionsMet: fit.mismatches.length === 0 } })
})

app.post('/v1/fit-check/compare', async (c) => {
  const body = await safeJson(c)
  const product = getProduct(String(body.productId ?? ''))
  if (!product) return fail('PRODUCT_NOT_FOUND', '제품을 찾을 수 없습니다.', 404, { productId: body.productId })

  const parsed = parseConditions(body.conditions)
  if ('error' in parsed) return parsed.error

  const selected = runFitCheck(product, parsed.conditions)
  const alternativeId = body.alternativeId ?? selected.alternativeId
  const alternative = alternativeId ? getProduct(String(alternativeId)) : undefined

  if (!alternative) {
    return c.json({
      data: {
        selected: { productId: product.id, ...selected },
        alternative: null,
        message: '현재 선택한 조건을 모두 만족하는 제품을 찾지 못했습니다.',
      },
    })
  }
  return c.json({
    data: {
      selected: { productId: product.id, ...selected },
      alternative: { productId: alternative.id, ...runFitCheck(alternative, parsed.conditions) },
      message: null,
    },
  })
})

app.post('/v1/recommend', async (c) => {
  const parsed = parseConditions(await safeJson(c))
  if ('error' in parsed) return parsed.error
  return c.json({ data: recommend(parsed.conditions) })
})

// ---------------------------------------------------------------- AI 설명

app.post('/v1/ai/explain', async (c) => {
  const body = await safeJson(c)
  const product = getProduct(String(body.productId ?? ''))
  if (!product) return fail('PRODUCT_NOT_FOUND', '제품을 찾을 수 없습니다.', 404, { productId: body.productId })

  const parsed = parseConditions(body.conditions)
  if ('error' in parsed) return parsed.error

  // fit을 보내면 그 판정을 사실로 취급하고, 없으면 서버가 직접 돌린다.
  const fit = body.fit ?? runFitCheck(product, parsed.conditions)
  return c.json({ data: await explain(product, parsed.conditions, fit) })
})

app.post('/v1/ai/scene-concept', async (c) => {
  const parsed = parseConditions(await safeJson(c))
  if ('error' in parsed) return parsed.error
  return c.json({ data: await sceneConcept(parsed.conditions) })
})

app.post('/v1/ai/parse-conditions', async (c) => {
  const body = await safeJson(c)
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return fail('VALIDATION_ERROR', '분석할 문장을 보내 주세요.', 400)
  return c.json({ data: await parseConditionsWithAI(text) })
})

// ---------------------------------------------------------------- Store Fit Pass

app.post('/v1/fit-passes', async (c) => {
  const body = await safeJson(c)
  const product = getProduct(String(body.productId ?? ''))
  if (!product) return fail('PRODUCT_NOT_FOUND', '제품을 찾을 수 없습니다.', 404, { productId: body.productId })

  const store = STORES.find((entry) => entry.id === body.storeId)
  if (!store) return fail('VALIDATION_ERROR', '매장을 선택해 주세요.', 400, { storeId: body.storeId })

  const experiences: FitPassExperience[] = Array.isArray(body.experiences)
    ? body.experiences.filter((value: unknown) => EXPERIENCES.includes(value as FitPassExperience))
    : []
  if (experiences.length === 0) return fail('VALIDATION_ERROR', '체험 항목을 하나 이상 선택해 주세요.', 400)

  const parsed = parseConditions(body.conditions)
  if ('error' in parsed) return parsed.error

  // 신청 당시 판정을 스냅샷으로 굳혀 둔다. 나중에 제품 태그가 바뀌어도 이 내용이 남는다.
  const fit = runFitCheck(product, parsed.conditions)
  const snapshot = await explain(product, parsed.conditions, fit)

  const id = newId('fp')
  const data = {
    id,
    status: 'checking' as const,
    demo: true,
    disclaimer: '실시간 재고를 확정하지 않습니다. 재고 및 체험 가능 여부 확인 요청만 접수했습니다.',
    productId: product.id,
    colorId: body.colorId ?? product.colors[0].id,
    alternativeId: body.alternativeId ?? fit.alternativeId,
    store,
    visitTime: body.visitTime || null,
    visitTimeStatus: body.visitTime ? 'requested' : 'reschedule',
    experiences,
    customNote: body.customNote ?? '',
    snapshot: {
      matches: snapshot.matches,
      storeChecks: snapshot.storeChecks,
      storeQuestions: snapshot.storeQuestions,
    },
    createdAt: new Date().toISOString(),
  }
  await put('fit_passes', id, data)

  const sessionId = c.req.header('X-Session-Id')
  const session = await loadSession(sessionId)
  if (session && sessionId) {
    await put('sessions', sessionId, { ...session, fitPassId: id }, new Date(Date.now() + SESSION_TTL_MS))
  }
  return c.json({ data }, 201)
})

app.get('/v1/fit-passes/:fitPassId', async (c) => {
  const data = await get<Record<string, unknown>>('fit_passes', c.req.param('fitPassId'))
  if (!data) return fail('FIT_PASS_NOT_FOUND', '신청 내역을 찾을 수 없습니다.', 404)
  return c.json({ data: { ...data, status: demoStatus(String(data.createdAt ?? '')) } })
})

// ---------------------------------------------------------------- 날씨 참고 (P1)

app.get('/v1/weather', async (c) => {
  const destination = c.req.query('destination')
  const period = c.req.query('period')
  if (!destination || !period) {
    return fail('VALIDATION_ERROR', 'destination과 period를 모두 보내 주세요.', 400)
  }
  return c.json({ data: await weatherReference(destination, period) })
})

// ---------------------------------------------------------------- 장면 배경 (실시간 생성 + 캐시)

const BACKGROUND_TTL_MS = 24 * 60 * 60 * 1000

type BackgroundRecord = { base64: string; mimeType: string; place: string }

/** 같은 조건이면 같은 배경을 재사용한다. 문자열 조건을 짧은 id로 접는다. */
function backgroundCacheKey(conditions: Conditions) {
  const raw = JSON.stringify({
    destination: conditions.destination.trim().toLowerCase(),
    scene: conditions.scene,
    mobility: conditions.mobility,
    wearStyle: conditions.wearStyle,
    items: [...conditions.items].sort(),
  })
  let hash = 0
  for (let i = 0; i < raw.length; i += 1) {
    hash = (Math.imul(hash, 31) + raw.charCodeAt(i)) | 0
  }
  return `bg_${(hash >>> 0).toString(36)}`
}

app.post('/v1/scene/background', async (c) => {
  const body = (await safeJson(c)) as Record<string, unknown>
  const destination = typeof body.destination === 'string' ? body.destination.trim() : ''
  if (!destination) {
    return fail('VALIDATION_ERROR', 'destination을 보내 주세요.', 400)
  }

  const conditions: Conditions = {
    scene: (body.scene as Scene | null) ?? null,
    mobility: (body.mobility as Mobility | null) ?? null,
    wearStyle: (body.wearStyle as WearStyle | null) ?? null,
    items: Array.isArray(body.items) ? (body.items as ItemId[]) : [],
    destination,
    rewearScene: null,
    itemPresets: {},
  }

  const cacheId = backgroundCacheKey(conditions)
  const origin = new URL(c.req.url).origin
  const cached = await get<BackgroundRecord>('uploads', cacheId)
  if (cached) {
    return c.json({ data: { url: `${origin}/v1/uploads/${cacheId}/content`, place: cached.place, cached: true } })
  }

  const generated = await sceneBackground(conditions)
  if (!generated) {
    return fail('SCENE_BACKGROUND_UNAVAILABLE', '지금은 장면 배경을 만들 수 없습니다. 목적지를 입력했는지 확인해 주세요.', 409)
  }

  const expiresAt = new Date(Date.now() + BACKGROUND_TTL_MS)
  await put('uploads', cacheId, generated satisfies BackgroundRecord, expiresAt)

  return c.json({ data: { url: `${origin}/v1/uploads/${cacheId}/content`, place: generated.place, cached: false } }, 201)
})

/** 5cm 단위가 아니라 큰 구간으로 묶는다 — 아니면 캐시가 사실상 무의미해진다. */
function heightBucket(heightCm: number) {
  if (heightCm < 155) return 150
  if (heightCm < 165) return 160
  if (heightCm < 175) return 170
  if (heightCm < 185) return 180
  return 190
}

function portraitCacheKey(conditions: Conditions, body: ScenePortraitBody) {
  const raw = JSON.stringify({
    destination: conditions.destination.trim().toLowerCase(),
    scene: conditions.scene,
    mobility: conditions.mobility,
    wearStyle: conditions.wearStyle,
    items: [...conditions.items].sort(),
    heightBucket: heightBucket(body.heightCm),
    build: body.build,
    sex: body.sex,
  })
  let hash = 0
  for (let i = 0; i < raw.length; i += 1) {
    hash = (Math.imul(hash, 31) + raw.charCodeAt(i)) | 0
  }
  return `pt_${(hash >>> 0).toString(36)}`
}

app.post('/v1/scene/portrait', async (c) => {
  const body = (await safeJson(c)) as Record<string, unknown>
  const destination = typeof body.destination === 'string' ? body.destination.trim() : ''
  if (!destination) {
    return fail('VALIDATION_ERROR', 'destination을 보내 주세요.', 400)
  }
  const heightCm = typeof body.heightCm === 'number' ? body.heightCm : NaN
  const build = body.build as ScenePortraitBody['build']
  const sex = body.sex as ScenePortraitBody['sex']
  if (!Number.isFinite(heightCm) || !['slim', 'standard', 'broad'].includes(build) || !['female', 'male'].includes(sex)) {
    return fail('VALIDATION_ERROR', 'heightCm·build·sex를 보내 주세요.', 400)
  }
  const personBody: ScenePortraitBody = { heightCm, build, sex }

  const conditions: Conditions = {
    scene: (body.scene as Scene | null) ?? null,
    mobility: (body.mobility as Mobility | null) ?? null,
    wearStyle: (body.wearStyle as WearStyle | null) ?? null,
    items: Array.isArray(body.items) ? (body.items as ItemId[]) : [],
    destination,
    rewearScene: null,
    itemPresets: {},
  }

  const cacheId = portraitCacheKey(conditions, personBody)
  const origin = new URL(c.req.url).origin
  const cached = await get<BackgroundRecord>('uploads', cacheId)
  if (cached) {
    return c.json({ data: { url: `${origin}/v1/uploads/${cacheId}/content`, place: cached.place, cached: true } })
  }

  const generated = await scenePortrait(conditions, personBody)
  if (!generated) {
    return fail('SCENE_PORTRAIT_UNAVAILABLE', '지금은 장면 인물을 만들 수 없습니다. 목적지를 입력했는지 확인해 주세요.', 409)
  }

  const expiresAt = new Date(Date.now() + BACKGROUND_TTL_MS)
  await put('uploads', cacheId, generated satisfies BackgroundRecord, expiresAt)

  return c.json({ data: { url: `${origin}/v1/uploads/${cacheId}/content`, place: generated.place, cached: false } }, 201)
})

// ---------------------------------------------------------------- 전신 사진 임시 업로드 (P1)

const UPLOAD_TTL_MS = 60 * 60 * 1000
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const ALLOWED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

type UploadRecord = { base64: string; mimeType: string }

app.post('/v1/uploads', async (c) => {
  const body = await c.req.parseBody().catch(() => null)
  const file = body?.file
  if (!(file instanceof File)) {
    return fail('VALIDATION_ERROR', 'file 필드로 이미지를 보내 주세요.', 400)
  }
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    return fail('UNSUPPORTED_MEDIA_TYPE', 'jpeg·png·webp만 업로드할 수 있습니다.', 415, { mimeType: file.type })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail('IMAGE_TOO_LARGE', '업로드 용량은 8MB를 넘을 수 없습니다.', 413, { sizeBytes: file.size })
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const uploadId = newId('upl')
  const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS)
  await put('uploads', uploadId, { base64, mimeType: file.type } satisfies UploadRecord, expiresAt)

  return c.json(
    {
      data: {
        uploadId,
        url: `${new URL(c.req.url).origin}/v1/uploads/${uploadId}/content`,
        expiresAt: expiresAt.toISOString(),
      },
    },
    201,
  )
})

app.get('/v1/uploads/:uploadId/content', async (c) => {
  const record = await get<UploadRecord>('uploads', c.req.param('uploadId'))
  if (!record) return fail('VALIDATION_ERROR', '이미지가 없거나 만료되었습니다.', 404)
  return new Response(Buffer.from(record.base64, 'base64'), {
    headers: { 'Content-Type': record.mimeType, 'Cache-Control': 'private, max-age=3600' },
  })
})

app.delete('/v1/uploads/:uploadId', async (c) => {
  await remove('uploads', c.req.param('uploadId'))
  return new Response(null, { status: 204 })
})

// ---------------------------------------------------------------- 안 하는 것

for (const path of ['/v1/inventory', '/v1/reservations']) {
  app.all(path, () => fail('NOT_IMPLEMENTED', '이 서비스는 실시간 재고와 예약 확정을 제공하지 않습니다.', 501))
}

app.get('/', (c) => c.json({ data: { name: 'MCM SCENE FIT API', version: 'v1' } }))

// ---------------------------------------------------------------- 헬퍼

/**
 * 데모용 상태 전이. 접수 → 확인 중 → 확인 완료로 시간에 따라 넘어간다.
 * 저장된 값을 바꾸지 않고 조회 시점에 계산한다.
 *
 * confirmed는 매장이 회신했다는 뜻이며, 재고가 있다는 의미가 아니다.
 * 실제 운영에서는 매장 직원이 상태를 바꾸고, 이 함수는 사라진다.
 */
function demoStatus(createdAt: string): FitPassStatus {
  const startedAt = Date.parse(createdAt)
  if (Number.isNaN(startedAt)) return 'checking'
  const elapsed = Date.now() - startedAt
  if (elapsed < DEMO_REQUESTED_MS) return 'requested'
  if (elapsed < DEMO_CHECKING_MS) return 'checking'
  return 'confirmed'
}

async function loadSession(sessionId: string | undefined) {
  if (!sessionId) return null
  return get<SessionData>('sessions', sessionId)
}

async function safeJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return ((await c.req.json()) ?? {}) as Record<string, any>
  } catch {
    return {} as Record<string, any>
  }
}

/**
 * 사용자가 고른 소지품 규격(폰 6.1인치, 노트북 16인치 등)만 통과시킨다.
 * 목록에 없는 값은 조용히 버리고 기본 규격으로 판정한다.
 */
function sanitizePresets(raw: unknown): ItemPresets {
  const input = (raw ?? {}) as Record<string, unknown>
  const presets: ItemPresets = {}
  for (const kind of PRESET_KINDS) {
    const value = input[kind]
    if (typeof value !== 'string') continue
    if (ITEM_PRESETS[kind as PresetKind].some((preset) => preset.id === value)) {
      presets[kind] = value
    }
  }
  return presets
}

function emptyConditions(): Conditions {
  return { scene: null, mobility: null, items: [], wearStyle: null, destination: '', rewearScene: null, itemPresets: {} }
}

/**
 * 필수 4개(scene · mobility · items · wearStyle)를 확인한다.
 * 값이 enum에 없으면 400, 아예 비어 있으면 409로 나눈다.
 */
function parseConditions(raw: unknown): { conditions: Conditions } | { error: Response } {
  const input = (raw ?? {}) as Record<string, unknown>
  const scene = input.scene as Scene | undefined
  const mobility = input.mobility as Mobility | undefined
  const wearStyle = input.wearStyle as WearStyle | undefined
  const items = Array.isArray(input.items) ? (input.items as ItemId[]) : []

  if (!scene || !mobility || !wearStyle || items.length === 0) {
    return {
      error: fail('CONDITIONS_INCOMPLETE', '장면·이동·소지품·착용 방식을 모두 선택해 주세요.', 409, {
        missing: [
          !scene && 'scene',
          !mobility && 'mobility',
          items.length === 0 && 'items',
          !wearStyle && 'wearStyle',
        ].filter(Boolean),
      }),
    }
  }

  const invalid = [
    !SCENES.includes(scene) && `scene=${scene}`,
    !MOBILITY.includes(mobility) && `mobility=${mobility}`,
    !WEAR_STYLES.includes(wearStyle) && `wearStyle=${wearStyle}`,
    ...items.filter((item) => !ITEMS.includes(item)).map((item) => `items=${item}`),
  ].filter(Boolean)

  if (invalid.length > 0) {
    return { error: fail('VALIDATION_ERROR', '허용되지 않는 값이 있습니다.', 400, { invalid }) }
  }

  const rewearScene = input.rewearScene as Scene | null | undefined
  return {
    conditions: {
      scene,
      mobility,
      wearStyle,
      items,
      destination: typeof input.destination === 'string' ? input.destination : '',
      rewearScene: rewearScene && SCENES.includes(rewearScene) ? rewearScene : null,
      itemPresets: sanitizePresets(input.itemPresets),
    },
  }
}
