import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { explain, parseConditions as parseConditionsWithAI } from './ai.js'
import { CARRY_ITEMS } from './data/items.js'
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
  type ItemId,
  type Mobility,
  type Scene,
  type WearStyle,
} from './types.js'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
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
function fail(code: string, message: string, status: 400 | 404 | 409 | 500 | 501, details?: unknown) {
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
  return c.json({ data })
})

// ---------------------------------------------------------------- 안 하는 것

for (const path of ['/v1/inventory', '/v1/reservations']) {
  app.all(path, () => fail('NOT_IMPLEMENTED', '이 서비스는 실시간 재고와 예약 확정을 제공하지 않습니다.', 501))
}

app.get('/', (c) => c.json({ data: { name: 'MCM SCENE FIT API', version: 'v1' } }))

// ---------------------------------------------------------------- 헬퍼

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

function emptyConditions(): Conditions {
  return { scene: null, mobility: null, items: [], wearStyle: null, destination: '', rewearScene: null }
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
    },
  }
}
