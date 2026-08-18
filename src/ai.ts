import { GoogleGenAI } from '@google/genai'
import { EXPERIENCE_LABEL, ITEM_LABEL, SCENE_LABEL, WEAR_LABEL } from './data/labels.js'
import type { Conditions, FitResult, Product } from './types.js'

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

export { EXPERIENCE_LABEL }
