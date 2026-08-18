import { GoogleGenAI } from '@google/genai'
import { EXPERIENCE_LABEL, ITEM_LABEL, SCENE_LABEL, WEAR_LABEL } from './data/labels.js'
import { ITEMS, MOBILITY, SCENES, type Conditions, type FitResult, type ItemId, type Mobility, type Product, type Scene } from './types.js'

export type Explanation = {
  matches: string[]
  mismatches: string[]
  storeChecks: string[]
  storeQuestions: string[]
}

const MODEL = 'gemini-2.5-flash'

/**
 * 판정을 바꾸지 않는다. 규칙 엔진이 낸 결과를 사람이 읽기 좋은 문장으로만 다듬는다.
 * API 키가 없으면 규칙 엔진 문장을 그대로 돌려준다. 서비스는 키 없이도 동작한다.
 */
export async function explain(
  product: Product,
  conditions: Conditions,
  fit: FitResult,
): Promise<Explanation> {
  const fallback: Explanation = {
    matches: fit.matches,
    mismatches: fit.mismatches,
    storeChecks: fit.storeChecks,
    storeQuestions: fallbackQuestions(conditions, fit),
  }
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return fallback

  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: JSON.stringify({ product: brief(product), conditions, fit }),
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseJsonSchema: SCHEMA,
      },
    })
    if (!response.text) return fallback
    const parsed = JSON.parse(response.text) as Explanation
    return {
      matches: parsed.matches ?? fallback.matches,
      mismatches: parsed.mismatches ?? fallback.mismatches,
      storeChecks: parsed.storeChecks ?? fallback.storeChecks,
      storeQuestions: parsed.storeQuestions ?? fallback.storeQuestions,
    }
  } catch {
    // AI가 실패해도 결과 화면은 떠야 한다. 규칙 엔진 문장으로 되돌린다.
    return fallback
  }
}

const SYSTEM = `너는 MCM SCENE FIT의 설명 담당이다. 입력으로 받은 판정 결과를 한국어 문장으로 다듬는 일만 한다.

지켜야 할 것:
- 입력 fit의 level(confirmed / estimated / store-check / unlikely)을 절대 바꾸지 마라.
- confirmed가 아닌 항목을 들어간다고 단정하지 마라.
- 공식 정보에 없는 소재 성능(방수, 내구성 등)을 주장하지 마라.
- 재고나 예약이 확정되었다고 말하지 마라.
- 각 배열은 최대 3개. 문장은 한 줄, 존댓말.
- storeQuestions는 사용자가 매장에서 그대로 읽을 수 있는 질문 문장으로 쓴다.`

const SCHEMA = {
  type: 'object',
  properties: {
    matches: { type: 'array', items: { type: 'string' } },
    mismatches: { type: 'array', items: { type: 'string' } },
    storeChecks: { type: 'array', items: { type: 'string' } },
    storeQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['matches', 'mismatches', 'storeChecks', 'storeQuestions'],
  additionalProperties: false,
} as const

/** 프롬프트에 넣을 제품 정보. 이미지 URL 같은 건 뺀다. */
function brief(product: Product) {
  return {
    name: product.name,
    category: product.category,
    sizeLabel: product.sizeLabel,
    widthMm: product.widthMm,
    heightMm: product.heightMm,
    depthMm: product.depthMm,
    material: product.material,
    pockets: product.pockets,
    strapAdjustable: product.strapAdjustable,
    wearStyles: product.wearStyles.map((wear) => WEAR_LABEL[wear]),
    sceneTags: product.sceneTags.map((scene) => SCENE_LABEL[scene]),
    officialStorage: product.officialStorage.map((item) => ITEM_LABEL[item]),
    weightG: product.weightG ?? null,
  }
}

/** AI 없이도 매장에서 물어볼 질문은 나와야 한다. */
function fallbackQuestions(conditions: Conditions, fit: FitResult) {
  const questions = fit.carryCheck.items
    .filter((item) => item.level !== 'confirmed')
    .map((item) => {
      const name = ITEM_LABEL[item.item]
      const last = name.charCodeAt(name.length - 1)
      const hasFinal = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0
      return `${name}${hasFinal ? '이' : '가'} 이 가방에 들어가는지 확인하고 싶어요.`
    })
  if (conditions.wearStyle) {
    questions.push(`제 키에서 ${WEAR_LABEL[conditions.wearStyle]} 스트랩 길이가 맞는지 보고 싶어요.`)
  }
  return questions.slice(0, 3)
}

export type ParsedConditions = {
  scene: Scene | null
  mobility: Mobility | null
  items: ItemId[]
  destination: string | null
  rewearScene: Scene | null
  confidence: number
  unparsed: string[]
}

const EMPTY_PARSE: ParsedConditions = {
  scene: null,
  mobility: null,
  items: [],
  destination: null,
  rewearScene: null,
  confidence: 0,
  unparsed: [],
}

/**
 * 사용자가 목적지·상황을 문장으로 적으면 장면·이동량·소지품으로 구조화한다.
 * 없는 enum으로 추측해 채우지 않는다. 확신이 낮으면 null과 unparsed로 돌려 사용자가 직접 고르게 한다.
 * API 키가 없으면 파싱할 수 없다는 안내만 돌려준다. (문장을 다듬는 explain과 달리 규칙 엔진 대체재가 없음)
 */
export async function parseConditions(text: string): Promise<ParsedConditions> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { ...EMPTY_PARSE, unparsed: ['AI 키가 설정되지 않아 문장을 분석할 수 없습니다.'] }
  }

  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: text,
      config: {
        systemInstruction: PARSE_SYSTEM,
        responseMimeType: 'application/json',
        responseJsonSchema: PARSE_SCHEMA,
      },
    })
    if (!response.text) return EMPTY_PARSE
    const parsed = JSON.parse(response.text) as ParsedConditions
    return sanitizeParsed(parsed)
  } catch {
    return { ...EMPTY_PARSE, unparsed: ['문장을 분석하는 중 오류가 발생했습니다.'] }
  }
}

const PARSE_SYSTEM = `너는 MCM SCENE FIT의 조건 파싱 담당이다. 사용자가 자유롭게 쓴 문장에서 아래 항목만 뽑아라.

- scene: ${SCENES.join(', ')} 중 하나. 문장에 명확한 근거가 없으면 null.
- mobility: ${MOBILITY.join(', ')} 중 하나. 근거가 없으면 null.
- items: ${ITEMS.join(', ')} 중에서 문장에 실제로 언급된 것만. 목록에 없는 물건은 items에 넣지 말고 unparsed에 "{물건}은 소지품 목록에 없어 반영하지 않음" 형태로 적어라.
- destination: 장소·시기를 합친 짧은 문자열. 없으면 null.
- rewearScene: ${SCENES.join(', ')} 중 하나. "그 다음에도", "평소에도" 같은 재사용 의도가 있을 때만. 없으면 null.
- confidence: 0~1 사이 숫자. 문장이 애매하면 낮게.
- unparsed: 반영하지 못한 내용을 한국어 문장으로.

없는 enum 값을 지어내지 마라. 확신이 없으면 null로 두고 unparsed에 이유를 적어라.`

const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    scene: { type: ['string', 'null'], enum: [...SCENES, null] },
    mobility: { type: ['string', 'null'], enum: [...MOBILITY, null] },
    items: { type: 'array', items: { type: 'string', enum: ITEMS } },
    destination: { type: ['string', 'null'] },
    rewearScene: { type: ['string', 'null'], enum: [...SCENES, null] },
    confidence: { type: 'number' },
    unparsed: { type: 'array', items: { type: 'string' } },
  },
  required: ['scene', 'mobility', 'items', 'destination', 'rewearScene', 'confidence', 'unparsed'],
  additionalProperties: false,
} as const

/** AI 응답을 그대로 믿지 않는다. enum을 벗어난 값은 null·제외로 되돌린다. */
function sanitizeParsed(parsed: ParsedConditions): ParsedConditions {
  return {
    scene: SCENES.includes(parsed.scene as Scene) ? parsed.scene : null,
    mobility: MOBILITY.includes(parsed.mobility as Mobility) ? parsed.mobility : null,
    items: Array.isArray(parsed.items) ? parsed.items.filter((item) => ITEMS.includes(item)) : [],
    destination: typeof parsed.destination === 'string' && parsed.destination ? parsed.destination : null,
    rewearScene: SCENES.includes(parsed.rewearScene as Scene) ? parsed.rewearScene : null,
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
    unparsed: Array.isArray(parsed.unparsed) ? parsed.unparsed.slice(0, 5) : [],
  }
}

export { EXPERIENCE_LABEL }
