import { itemDisplayLabel, isCanonicalPreset, resolveCarryItem } from '../data/itemPresets.js'
import { CARRY_SCORE_POINTS, SCENE_LABEL, WEAR_LABEL } from '../data/labels.js'
import { sumCarryLoad } from '../data/items.js'
import { PRODUCTS } from '../data/products.js'
import { formatOccupancy, itemFitsProduct, judgeItemFit } from './itemFit.js'
import type {
  AxisStatus,
  Conditions,
  EvidenceLevel,
  FitResult,
  ItemId,
  ItemVerdict,
  Product,
} from '../types.js'

function verdictForItem(product: Product, item: ItemId, conditions: Conditions): ItemVerdict {
  const spec = resolveCarryItem(item, conditions.itemPresets)
  const { level, fillRatio } = judgeItemFit(
    item,
    product,
    spec,
    isCanonicalPreset(item, conditions.itemPresets),
  )
  const name = spec.label
  const fill = formatOccupancy(fillRatio)

  if (level === 'confirmed') {
    return {
      item,
      label: name,
      level,
      fillRatio,
      message: `${name} 수납이 공식 확인되었습니다.`,
    }
  }

  if (level === 'unlikely') {
    return {
      item,
      label: name,
      level,
      fillRatio,
      message:
        item === 'laptop13' || item === 'laptop16'
          ? '선택한 노트북 크기보다 가방이 작습니다.'
          : `${name} 크기보다 가방이 작아 수납은 어려워 보입니다.`,
    }
  }

  if (level === 'estimated') {
    return {
      item,
      label: name,
      level,
      fillRatio,
      message: `점유 ${fill}로 안정 범위(85% 이하)에 들어가 수납이 예상됩니다.`,
    }
  }

  return {
    item,
    label: name,
    level,
    fillRatio,
    message: `점유 ${fill}라 입구·형태에 따라 달라질 수 있어 매장에서 확인해 주세요.`,
  }
}

function carryScore(items: ItemVerdict[]) {
  if (items.length === 0) return null
  const total = items.reduce((sum, item) => sum + CARRY_SCORE_POINTS[item.level], 0)
  return Math.round(total / items.length)
}

function carryHeadline(items: ItemVerdict[], conditions: Conditions) {
  const label = (item: ItemId) => itemDisplayLabel(item, conditions.itemPresets)
  const confirmed = items.filter((item) => item.level === 'confirmed')
  const estimated = items.filter((item) => item.level === 'estimated')
  const store = items.filter((item) => item.level === 'store-check')
  const unlikely = items.filter((item) => item.level === 'unlikely')

  if (unlikely.length > 0) {
    return `${label(unlikely[0].item)} 수납은 어려워 보입니다`
  }
  if (confirmed.length && store.length) {
    return `${confirmed.map((item) => label(item.item)).join('·')}은 확인됨 / ${store.map((item) => label(item.item)).join('·')}은 확인 필요`
  }
  if (confirmed.length && estimated.length) {
    return `${confirmed.map((item) => label(item.item)).join('·')}은 확인됨 / ${estimated.map((item) => label(item.item)).join('·')}은 예상됨`
  }
  if (confirmed.length) {
    return `${confirmed.map((item) => label(item.item)).join('·')} 수납이 확인됨`
  }
  if (estimated.length && store.length === 0) {
    return '선택한 소지품은 크기상 수납이 예상됩니다'
  }
  return '선택한 소지품은 매장에서 확인이 필요합니다'
}

function sceneStatus(sceneSelected: boolean, scenePositive: boolean): AxisStatus {
  if (!sceneSelected) return 'check'
  return scenePositive ? 'match' : 'weak'
}

function carryStatus(items: ItemVerdict[], wearOk: boolean, hasWear: boolean): AxisStatus {
  if (items.some((item) => item.level === 'unlikely') || (hasWear && !wearOk)) {
    return 'weak'
  }
  if (items.length === 0) {
    return hasWear && wearOk ? 'match' : 'check'
  }
  const allConfirmed = items.every((item) => item.level === 'confirmed')
  if (allConfirmed && (!hasWear || wearOk)) return 'match'
  return 'check'
}

function rewearStatus(positive: boolean): AxisStatus {
  return positive ? 'match' : 'weak'
}

function findAlternative(product: Product, conditions: Conditions) {
  const wear = conditions.wearStyle
  const items = conditions.items
  const scene = conditions.scene

  const ranked = PRODUCTS.filter((candidate) => candidate.id !== product.id)
    .map((candidate) => {
      let score = 0
      if (wear && candidate.wearStyles.includes(wear)) score += 4
      if (scene && candidate.sceneTags.includes(scene)) score += 3
      score += items.filter((item) => candidate.officialStorage.includes(item)).length
      if (wear && !candidate.wearStyles.includes(wear)) score -= 5
      if (items.some((item) => !itemFitsProduct(item, candidate, resolveCarryItem(item, conditions.itemPresets)))) score -= 4
      return { candidate, score }
    })
    .sort((a, b) => b.score - a.score)

  return ranked[0]?.score > 0 ? ranked[0].candidate.id : null
}

export function runFitCheck(product: Product, conditions: Conditions): FitResult {
  const scene = conditions.scene
  const scenePositive = Boolean(scene && product.sceneTags.includes(scene))
  const sceneMatch = {
    headline: scene
      ? scenePositive
        ? `${SCENE_LABEL[scene]} 장면과 잘 어울림`
        : `${SCENE_LABEL[scene]}보다 다른 장면에 더 잘 맞을 수 있음`
      : '장면을 선택하면 조화를 확인할 수 있습니다',
    detail: scenePositive
      ? '제품 스타일 태그가 선택한 장면과 맞습니다.'
      : '공식 장면 태그와 선택한 장면이 완전히 겹치지는 않습니다.',
    positive: scenePositive,
    status: sceneStatus(Boolean(scene), scenePositive),
  }

  const itemVerdicts = conditions.items.map((item) => verdictForItem(product, item, conditions))
  const wearOk = Boolean(
    conditions.wearStyle && product.wearStyles.includes(conditions.wearStyle),
  )

  const carryCheck = {
    headline: wearOk
      ? carryHeadline(itemVerdicts, conditions)
      : conditions.wearStyle
        ? `${WEAR_LABEL[conditions.wearStyle]} 착용은 이 제품의 기본 방식이 아닙니다`
        : carryHeadline(itemVerdicts, conditions),
    items: itemVerdicts,
    status: carryStatus(itemVerdicts, wearOk, Boolean(conditions.wearStyle)),
    load: sumCarryLoad(conditions.items, (id) => resolveCarryItem(id, conditions.itemPresets)),
    score: carryScore(itemVerdicts),
  }

  const rewearScene = conditions.rewearScene ?? 'daily'
  const rewearPositive = product.rewearTags.includes(rewearScene)
  const rewearPotential = {
    headline: rewearPositive
      ? `${SCENE_LABEL[rewearScene]}에 반복 활용 가능`
      : `${SCENE_LABEL[rewearScene]} 이후 활용은 제한적일 수 있음`,
    detail: rewearPositive
      ? '특별한 일정 이후에도 같은 제품 태그가 이어집니다.'
      : '해당 장면 태그가 약해 매장에서 다른 활용을 상담해 보세요.',
    positive: rewearPositive,
    status: rewearStatus(rewearPositive),
  }

  const matches: string[] = []
  const mismatches: string[] = []
  const storeChecks: string[] = []

  if (scenePositive && scene) {
    matches.push(`${SCENE_LABEL[scene]} 장면에 맞는 스타일 태그를 가지고 있습니다.`)
  } else if (scene) {
    mismatches.push(`${SCENE_LABEL[scene]} 장면과의 조화는 약합니다.`)
  }

  if (wearOk && conditions.wearStyle) {
    matches.push(`${WEAR_LABEL[conditions.wearStyle]} 착용이 가능합니다.`)
  } else if (conditions.wearStyle) {
    mismatches.push(
      `선호 착용 방식(${WEAR_LABEL[conditions.wearStyle]})과 제품 구조가 다릅니다.`,
    )
  }

  for (const verdict of itemVerdicts) {
    if (verdict.level === 'confirmed') matches.push(verdict.message)
    if (verdict.level === 'estimated' || verdict.level === 'store-check') {
      storeChecks.push(verdict.message)
    }
    if (verdict.level === 'unlikely') mismatches.push(verdict.message)
  }

  if (
    conditions.mobility === 'long-walk' &&
    product.wearStyles.includes('tote') &&
    !product.wearStyles.includes('backpack') &&
    !product.wearStyles.includes('crossbody')
  ) {
    mismatches.push('오래 걷기에는 토트보다 크로스바디·백팩이 더 편할 수 있습니다.')
  }

  if (conditions.mobility === 'long-walk' && product.weightG && product.weightG >= 850) {
    storeChecks.push('공식 무게가 있는 편이라 장시간 이동은 매장에서 착용해 보세요.')
  }

  if (storeChecks.length === 0 && itemVerdicts.some((item) => item.level !== 'confirmed')) {
    storeChecks.push('실제 제품 크기와 착용감은 매장에서 확인이 필요합니다.')
  }

  return {
    sceneMatch,
    carryCheck,
    rewearPotential,
    matches: matches.slice(0, 3),
    mismatches: mismatches.slice(0, 3),
    storeChecks: storeChecks.slice(0, 3),
    alternativeId: findAlternative(product, conditions),
  }
}

export function resultEvidence(result: FitResult): EvidenceLevel {
  const levels = result.carryCheck.items.map((item) => item.level)
  if (levels.includes('unlikely')) return 'unlikely'
  if (levels.includes('store-check')) return 'store-check'
  if (levels.includes('estimated')) return 'estimated'
  if (levels.length > 0 && levels.every((level) => level === 'confirmed')) return 'confirmed'
  if (result.sceneMatch.status === 'weak' || result.rewearPotential.status === 'weak') {
    return 'store-check'
  }
  if (result.sceneMatch.status === 'match' && result.carryCheck.status === 'match') {
    return 'confirmed'
  }
  return 'estimated'
}
