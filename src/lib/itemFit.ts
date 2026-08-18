import { CARRY_ITEM_MAP } from '../data/items.js'
import { ITEMS, type EvidenceLevel, type ItemId, type Product } from '../types.js'

type Box = {
  widthMm: number
  heightMm: number
  depthMm: number
}

/** 가방 치수 대비 안정 범위. 이하면 예상됨, 초과~100%는 매장 확인. */
export const STABLE_FILL_RATIO = 0.85

function sortedDims(box: Box) {
  return [box.widthMm, box.heightMm, box.depthMm].sort((a, b) => a - b)
}

/**
 * 축 정렬 회전만 허용한 뒤, 세 축 중 가장 빡센 축의 점유율.
 * 1을 넘으면 가방 AABB를 초과한다.
 */
export function occupancyRatio(item: Box, bag: Box) {
  const inner = sortedDims(item)
  const outer = sortedDims(bag)
  return Math.max(inner[0] / outer[0], inner[1] / outer[1], inner[2] / outer[2])
}

export function itemOccupancy(itemId: ItemId, product: Box) {
  return occupancyRatio(CARRY_ITEM_MAP[itemId], product)
}

/** 축 정렬 회전만 허용. 가방 외형 AABB보다 크면 명백히 불가. */
export function boxFitsIn(item: Box, bag: Box) {
  return occupancyRatio(item, bag) <= 1
}

export function itemFitsProduct(itemId: ItemId, product: Box) {
  return boxFitsIn(CARRY_ITEM_MAP[itemId], product)
}

export function levelFromOccupancy(fillRatio: number): Exclude<EvidenceLevel, 'confirmed'> {
  if (fillRatio > 1) return 'unlikely'
  if (fillRatio <= STABLE_FILL_RATIO) return 'estimated'
  return 'store-check'
}

/**
 * 가방 스펙(공식 수납 · 가로/세로/폭)과 소지품 스펙을 대조한다.
 * 공식 수납 품목은 치수 추측으로 뒤집지 않는다.
 */
export function judgeItemFit(
  itemId: ItemId,
  product: Pick<Product, 'widthMm' | 'heightMm' | 'depthMm' | 'officialStorage'>,
) {
  const fillRatio = itemOccupancy(itemId, product)
  if (product.officialStorage.includes(itemId)) {
    return { level: 'confirmed' as const, fillRatio, official: true }
  }
  return { level: levelFromOccupancy(fillRatio), fillRatio, official: false }
}

export function formatOccupancy(fillRatio: number) {
  if (!Number.isFinite(fillRatio)) return '—'
  return `${Math.round(fillRatio * 100)}%`
}

export function deriveLikelyStorage(
  product: Pick<Product, 'widthMm' | 'heightMm' | 'depthMm' | 'officialStorage'>,
) {
  return ITEMS.filter(
    (id) => !product.officialStorage.includes(id) && itemFitsProduct(id, product),
  )
}
