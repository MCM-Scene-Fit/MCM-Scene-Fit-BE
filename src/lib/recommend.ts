import { PRODUCTS } from '../data/products'
import { runFitCheck } from './fitCheck'
import type { Conditions, FitResult, Product } from '../types'

export type Candidate = { productId: string; fit: FitResult }

/**
 * 조건에 맞는 후보를 최대 3개 고른다. 점수 기준은 API.md 7절과 같다.
 * 총점 1등을 대표로 고정하지 않고, 세 축을 그대로 함께 내려 준다.
 */
export function recommend(conditions: Conditions): { candidates: Candidate[]; emptyReason: string | null } {
  const scored = PRODUCTS.map((product) => {
    const fit = runFitCheck(product, conditions)
    return { product, fit, score: scoreOf(product, fit, conditions) }
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  if (scored.length === 0) {
    return { candidates: [], emptyReason: '현재 선택한 조건을 모두 만족하는 제품을 찾지 못했습니다.' }
  }
  return {
    candidates: scored.map((entry) => ({ productId: entry.product.id, fit: entry.fit })),
    emptyReason: null,
  }
}

function scoreOf(product: Product, fit: FitResult, conditions: Conditions) {
  let score = 0
  if (fit.sceneMatch.positive) score += 3
  score += fit.carryCheck.items.filter((item) => item.level === 'confirmed').length
  if (fit.rewearPotential.positive) score += 1
  score -= fit.carryCheck.items.filter((item) => item.level === 'unlikely').length * 4
  if (conditions.wearStyle && !product.wearStyles.includes(conditions.wearStyle)) score -= 6
  return score
}
