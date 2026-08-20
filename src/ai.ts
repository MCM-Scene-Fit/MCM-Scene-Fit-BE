import { GoogleGenAI } from '@google/genai'
import { EXPERIENCE_LABEL, ITEM_LABEL, MOBILITY_LABEL, SCENE_LABEL, WEAR_LABEL } from './data/labels.js'
import {
  ITEMS,
  MOBILITY,
  SCENES,
  type Conditions,
  type FitResult,
  type ItemId,
  type Mobility,
  type Product,
  type Scene,
  type WearStyle,
} from './types.js'

export type Explanation = {
  matches: string[]
  mismatches: string[]
  storeChecks: string[]
  storeQuestions: string[]
}

const MODEL = 'gemini-3.6-flash'

/**
 * AI 호출은 실패해도 규칙 엔진 문장으로 되돌아가므로 화면은 뜬다.
 * 다만 조용히 삼키면 배포 환경에서 원인을 못 찾으니, 어디서 왜 실패했는지는 남긴다.
 */
function aiWarn(where: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[ai] ${where} 실패 — 폴백 사용: ${message}`)
}

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
  } catch (error) {
    // AI가 실패해도 결과 화면은 떠야 한다. 규칙 엔진 문장으로 되돌린다.
    aiWarn('explain', error)
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
  } catch (error) {
    aiWarn('parseConditionsWithAI', error)
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

export type WeatherReference = {
  summary: string
  usableForMaterialJudgement: boolean
}

/**
 * 목적지·시기 참고 날씨. 실시간 예보가 아니라 일반적인 계절 정보다.
 * 공식 관리 정보가 없으므로 usableForMaterialJudgement는 항상 false다. (설계 원칙 3)
 * Fit Check 판정에 자동 반영하지 않는다.
 */
export async function weatherReference(destination: string, period: string): Promise<WeatherReference> {
  const apiKey = process.env.GEMINI_API_KEY
  const fallback: WeatherReference = {
    summary: `${destination} ${period} 날씨는 시점에 따라 달라질 수 있습니다. 출발 전 별도로 확인해 주세요.`,
    usableForMaterialJudgement: false,
  }
  if (!apiKey) return fallback

  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `목적지: ${destination}\n시기: ${period}`,
      config: {
        systemInstruction: WEATHER_SYSTEM,
        responseMimeType: 'application/json',
        responseJsonSchema: WEATHER_SCHEMA,
      },
    })
    if (!response.text) return fallback
    const parsed = JSON.parse(response.text) as { summary: string }
    if (!parsed.summary) return fallback
    // usableForMaterialJudgement는 모델 응답과 무관하게 항상 false로 고정한다.
    return { summary: parsed.summary, usableForMaterialJudgement: false }
  } catch (error) {
    aiWarn('photoSummary', error)
    return fallback
  }
}

const WEATHER_SYSTEM = `너는 여행 참고용 계절 정보를 한 문장으로 요약하는 담당이다.
실시간 예보가 아니라 그 시기의 일반적인 기후 특징을 짧게 알려준다.
확신할 수 없는 정확한 수치(정확한 기온, 강수 확률 등)는 만들어내지 마라.
소재의 방수·내구성에 대해서는 언급하지 마라. 존댓말 한 문장으로 답하라.`

const WEATHER_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
  },
  required: ['summary'],
  additionalProperties: false,
} as const

export type SceneConcept = {
  concept: string
  description: string
}

/**
 * 사용자가 고른 조건을 하나의 장면 컨셉으로 이름 붙인다.
 * 예: 여행 + 오래 걷기 + 카메라 + 도쿄 10월 -> "Tokyo Archive Walker"
 *
 * 조건에 없는 사실을 지어내지 않는다. 제품은 언급하지 않는다.
 * API 키가 없으면 조건 라벨을 그대로 조합해 돌려준다.
 */
export async function sceneConcept(conditions: Conditions): Promise<SceneConcept> {
  const fallback = fallbackConcept(conditions)
  const apiKey = process.env.GEMINI_API_KEY
  if (!conditions.scene) {
    aiWarn('sceneConcept', 'scene 값 없음')
    return fallback
  }
  if (!apiKey) {
    aiWarn('sceneConcept', 'GEMINI_API_KEY 없음')
    return (await conceptViaOpenAI(conditions)) ?? fallback
  }

  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: JSON.stringify(conditionBrief(conditions)),
      config: {
        systemInstruction: CONCEPT_SYSTEM,
        responseMimeType: 'application/json',
        responseJsonSchema: CONCEPT_SCHEMA,
      },
    })
    if (!response.text) return (await conceptViaOpenAI(conditions)) ?? fallback
    const parsed = JSON.parse(response.text) as SceneConcept
    if (!parsed.concept || !parsed.description) {
      return (await conceptViaOpenAI(conditions)) ?? fallback
    }
    return {
      concept: parsed.concept.slice(0, 40),
      description: parsed.description.slice(0, 80),
    }
  } catch (error) {
    // Gemini 무료 티어는 하루 호출 수가 적어 시연 중에 쉽게 소진된다.
    // 조건 나열 문장으로 바로 물러나지 말고, 이미 쓰고 있는 OpenAI로 한 번 더 시도한다.
    aiWarn('sceneConcept', error)
    return (await conceptViaOpenAI(conditions)) ?? fallback
  }
}

const CONCEPT_SYSTEM = `너는 MCM SCENE FIT의 장면 컨셉 담당이다. 사용자가 고른 조건을 하나의 장면으로 이름 붙인다.

concept:
- 영문 2~4단어. 도시나 장소가 있으면 앞에 둔다. 예: Tokyo Archive Walker, Weekend City Commuter
- 브랜드명이나 제품명은 넣지 마라.

description:
- 한국어 한 문장. 그 장면 속 사람이 어떤 하루를 보내는지 묘사한다.
- 존댓말을 쓰지 말고 명사형으로 끝낸다. 예: 많이 걸으며 전시와 오래된 공간을 기록하는 여행자

지켜야 할 것:
- 입력에 없는 사실을 지어내지 마라. 날씨, 동행, 예산 등을 임의로 넣지 마라.
- 가방이나 제품을 언급하지 마라. 아직 고르지 않았을 수 있다.
- 목적지가 비어 있으면 도시 이름을 지어내지 마라.`

const CONCEPT_SCHEMA = {
  type: 'object',
  properties: {
    concept: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['concept', 'description'],
  additionalProperties: false,
} as const

/** 프롬프트에 넣을 조건. 코드값 대신 사람이 읽는 라벨로 바꾼다. */
function conditionBrief(conditions: Conditions) {
  return {
    장면: conditions.scene ? SCENE_LABEL[conditions.scene] : null,
    이동량: conditions.mobility ? MOBILITY_LABEL[conditions.mobility] : null,
    소지품: conditions.items.map((item) => ITEM_LABEL[item]),
    착용방식: conditions.wearStyle ? WEAR_LABEL[conditions.wearStyle] : null,
    목적지시기: conditions.destination || null,
    이후활용장면: conditions.rewearScene ? SCENE_LABEL[conditions.rewearScene] : null,
  }
}

/** AI 없이도 화면에 뭔가는 보여야 한다. 조건 라벨을 그대로 쓴다. */
function fallbackConcept(conditions: Conditions): SceneConcept {
  const scene = conditions.scene ? SCENE_LABEL[conditions.scene] : '나의 장면'
  const mobility = conditions.mobility ? MOBILITY_LABEL[conditions.mobility] : null
  const place = conditions.destination || null
  return {
    concept: place ? `${place} ${scene}` : scene,
    description: [place, scene, mobility].filter(Boolean).join(' · '),
  }
}

export { EXPERIENCE_LABEL }

export type SceneBackground = { base64: string; mimeType: string; place: string }

const CHAT_MODEL = 'gpt-4o-mini'
const IMAGE_MODEL = 'gpt-image-1-mini'

const PLACE_SYSTEM = `너는 MCM SCENE FIT의 배경 장소 담당이다. 사용자가 고른 조건에 맞는, 목적지 도시 안의 실제 장소 하나를 지목한다.

지켜야 할 것:
- "동네" 수준으로 뭉뚱그리지 마라. place는 그 동네 안에 실제로 있는 구체적인 지명이어야
  한다 — 성당·광장·시장·다리·계단·골목처럼 실제로 존재하고 이름이 붙어 있는 곳.
  입력에 등장하는 도시가 무엇이든, 그 도시 안에서 매번 새로 떠올려라 — 예시를 외워
  그대로 베끼지 마라.
- 목적지 도시 안에 실제로 있는 곳이어야 한다. 존재하지 않는 곳을 지어내지 마라.
  구체적인 이름이 확실하지 않으면 존재가 확실한 더 넓은 지명으로 물러나도 된다 — 없는
  이름을 지어내는 것보다 낫다.
- 조건에 어울린다면 그 도시임을 한눈에 알아볼 수 있는 곳을 우선한다.
  유명 랜드마크는 배경 스카이라인이나 먼 풍경으로는 넣어도 된다.
  다만 그 건물 하나만 화면 가득 클로즈업하지는 않는다 — 초저해상도로 그리면 부정확하게
  나올 수 있고, 상표성 구조물을 잘못 재현하는 위험도 있다.
- 목적지가 비어 있으면 place를 빈 문자열로, imagePrompt도 빈 문자열로 답한다.

imagePrompt: 영어 한 문장. 그 동네의 실제 분위기를 묘사한다. 사람 없음, 가방 없음, 글자·로고 없음을 반드시 명시하고,
그림·일러스트가 아니라 실제 촬영한 사진처럼 보이도록 "candid documentary street photography, shot on a 35mm lens, natural exposure, realistic film grain" 같은 사진 촬영 표현을 반드시 포함한다.

JSON으로만 답한다: {"place": "한국어 장소명", "imagePrompt": "english prompt"}`

/**
 * Gemini가 막혔을 때 쓰는 두 번째 시도. 같은 지시문을 OpenAI에 그대로 넘긴다.
 * 여기까지 실패하면 그때 규칙 엔진 문장으로 물러난다.
 */
async function conceptViaOpenAI(conditions: Conditions): Promise<SceneConcept | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${CONCEPT_SYSTEM}\n\nJSON으로만 답한다: {"concept": "...", "description": "..."}`,
          },
          { role: 'user', content: JSON.stringify(conditionBrief(conditions)) },
        ],
        max_tokens: 200,
      }),
    })
    if (!res.ok) {
      aiWarn('conceptViaOpenAI', `HTTP ${res.status}`)
      return null
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as SceneConcept
    if (!parsed.concept || !parsed.description) return null
    return {
      concept: parsed.concept.slice(0, 40),
      description: parsed.description.slice(0, 80),
    }
  } catch (error) {
    aiWarn('conceptViaOpenAI', error)
    return null
  }
}

async function pickScenePlace(conditions: Conditions): Promise<{ place: string; imagePrompt: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || !conditions.destination.trim()) return null

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PLACE_SYSTEM },
          { role: 'user', content: JSON.stringify(conditionBrief(conditions)) },
        ],
        max_tokens: 200,
      }),
    })
    if (!res.ok) {
      aiWarn('pickScenePlace', `HTTP ${res.status} ${(await res.text()).slice(0, 160)}`)
      return null
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content
    if (!content) return null
    const parsed = JSON.parse(content) as { place?: string; imagePrompt?: string }
    if (!parsed.place || !parsed.imagePrompt) return null
    return { place: parsed.place, imagePrompt: parsed.imagePrompt }
  } catch (error) {
    aiWarn('pickScenePlace', error)
    return null
  }
}

/**
 * 장면 배경만 실시간으로 생성한다. 가방은 절대 이 함수를 거치지 않는다 — AI로 다시 그리면
 * 다른 제품이 되어버려서(재질·로고·형태가 바뀜) 브랜드 자산 보호 원칙에 어긋난다.
 * 사람·가방은 프론트에서 실제 이미지를 그대로 합성한다.
 *
 * 두 단계다. 1) 목적지 도시 안에서 조건에 맞는 실제 동네를 고른다.
 * 2) 그 동네를 배경으로 그린다. 사전 생성이 아니라 요청 시점에 만든다.
 */
/**
 * 장소를 고르는 텍스트 모델이 막혀도 배경은 나와야 한다.
 * 목적지만으로 만든 무난한 장면으로 물러난다 — 배경이 아예 없는 것보다 낫다.
 */
function fallbackScenePlace(conditions: Conditions) {
  const destination = conditions.destination.trim()
  if (!destination) return null
  return {
    place: destination,
    imagePrompt: `a quiet everyday street in ${destination}, no people, no bags, no text or logos, candid documentary street photography, shot on a 35mm lens, natural exposure, realistic film grain`,
  }
}

export async function sceneBackground(conditions: Conditions): Promise<SceneBackground | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    aiWarn('sceneBackground', 'OPENAI_API_KEY 없음')
    return null
  }

  const picked = (await pickScenePlace(conditions)) ?? fallbackScenePlace(conditions)
  if (!picked) {
    aiWarn('sceneBackground', '목적지가 없어 장소를 정할 수 없음')
    return null
  }

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: `${picked.imagePrompt}, empty walkway in the foreground for a person to stand on`,
        size: '1024x1536',
        quality: 'low',
        n: 1,
      }),
    })
    if (!res.ok) {
      aiWarn('sceneBackground', `HTTP ${res.status} ${(await res.text()).slice(0, 160)}`)
      return null
    }
    const data = (await res.json()) as { data?: { b64_json?: string }[] }
    const b64 = data.data?.[0]?.b64_json
    if (!b64) return null
    return { base64: b64, mimeType: 'image/png', place: picked.place }
  } catch (error) {
    aiWarn('sceneBackground', error)
    return null
  }
}

export type ScenePortraitBody = {
  heightCm: number
  build: 'slim' | 'standard' | 'broad'
  sex: 'female' | 'male'
}

export type ScenePortrait = SceneBackground

const BUILD_TEXT: Record<ScenePortraitBody['build'], string> = {
  slim: 'slender build',
  standard: 'average build',
  broad: 'broad-shouldered build',
}

const SEX_TEXT: Record<ScenePortraitBody['sex'], string> = {
  female: 'a woman',
  male: 'a man',
}

/** 착용 방식별로, 아직 가방이 없는 빈 끈만 그리게 한다. 가방은 프론트에서 원본 이미지를 합성한다. */
function strapPromptFor(wear: WearStyle | null) {
  if (wear === 'backpack') {
    return 'wearing two empty plain black backpack straps over both shoulders, nothing hanging behind them, hands empty'
  }
  if (wear === 'tote' || wear === null) {
    return 'one hand relaxed at their side as if about to hold a bag handle, no bag, no strap'
  }
  // shoulder, crossbody
  return 'a plain black webbing strap running diagonally across the torso from one shoulder toward the opposite hip, but the strap simply ends there with nothing attached — no bag'
}

function heightBucketText(heightCm: number) {
  if (heightCm < 155) return 'around 150cm tall'
  if (heightCm < 165) return 'around 160cm tall'
  if (heightCm < 175) return 'around 170cm tall'
  if (heightCm < 185) return 'around 180cm tall'
  return 'around 190cm tall'
}

/**
 * 사용자 사진 없이도 "착용한 모습"을 보여주기 위해, 키·체형·성별에 맞는 사람을 장면 배경과
 * 함께 통째로 그린다. 가방은 이 함수를 거치지 않는다 — 프론트가 원본 가방 이미지를
 * 이 인물 위에 합성하고, 어깨끈 자리는 이미 그림에 있으니 겹쳐 보이지 않는다.
 *
 * sceneBackground와 달리 사람이 있어야 해서, 생성된 이미지를 실제 업로드 사진과 동일하게
 * 자세 인식(analyzeBody) 파이프라인에 태운다 — 이 함수는 이미지만 만들고 좌표는 몰라도 된다.
 */
export async function scenePortrait(
  conditions: Conditions,
  body: ScenePortraitBody,
): Promise<ScenePortrait | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const picked = await pickScenePlace(conditions)
  const placeLine = picked ? picked.imagePrompt : 'a plain quiet city street, natural daylight'
  const place = picked?.place ?? ''

  const prompt = [
    `Full-body photograph of ${SEX_TEXT[body.sex]} with a ${BUILD_TEXT[body.build]}, ${heightBucketText(body.heightCm)}, standing on a ${placeLine}`,
    strapPromptFor(conditions.wearStyle),
    'seen from head to toe, facing slightly to the side, candid documentary street photography, shot on a 35mm lens, natural exposure, realistic film grain, no text, no logos, plain simple outfit',
  ].join(', ')

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: '1024x1536', quality: 'low', n: 1 }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: { b64_json?: string }[] }
    const b64 = data.data?.[0]?.b64_json
    if (!b64) return null
    return { base64: b64, mimeType: 'image/png', place }
  } catch (error) {
    aiWarn('scenePortrait', error)
    return null
  }
}
