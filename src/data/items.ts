import {
  ITEM_CATEGORIES,
  ITEMS,
  type CarryLoad,
  type ItemCategory,
  type ItemId,
} from '../types'

/**
 * 대표 소지품 카탈로그. 치수·무게는 자주 쓰는 실물 기준의 겉보기값(mm, g)이다.
 * 가방 내부 용량이나 적재율이 아니라, 선택 UI와 간이 합산·치수 판정에만 쓴다.
 */
export type CarryItem = {
  id: ItemId
  category: ItemCategory
  label: string
  widthMm: number
  heightMm: number
  depthMm: number
  weightG: number
  icon: string
}

export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  tech: 'IT 기기',
  beauty: '뷰티/위생',
  drink: '음료/우산',
  everyday: '소지품',
}

export const CARRY_ITEMS: CarryItem[] = [
  {
    id: 'phone',
    category: 'tech',
    label: '휴대전화',
    widthMm: 72,
    heightMm: 148,
    depthMm: 8,
    weightG: 200,
    icon: '/items/phone.svg',
  },
  {
    id: 'tablet',
    category: 'tech',
    label: '태블릿',
    widthMm: 180,
    heightMm: 250,
    depthMm: 6,
    weightG: 460,
    icon: '/items/tablet.svg',
  },
  {
    id: 'laptop13',
    category: 'tech',
    label: '13인치 노트북',
    widthMm: 304,
    heightMm: 215,
    depthMm: 12,
    weightG: 1240,
    icon: '/items/laptop13.svg',
  },
  {
    id: 'laptop16',
    category: 'tech',
    label: '16인치 노트북',
    widthMm: 356,
    heightMm: 248,
    depthMm: 17,
    weightG: 2140,
    icon: '/items/laptop16.svg',
  },
  {
    id: 'powerbank',
    category: 'tech',
    label: '보조배터리',
    widthMm: 70,
    heightMm: 140,
    depthMm: 20,
    weightG: 240,
    icon: '/items/powerbank.svg',
  },
  {
    id: 'earphones',
    category: 'tech',
    label: '무선이어폰',
    widthMm: 61,
    heightMm: 50,
    depthMm: 22,
    weightG: 50,
    icon: '/items/earphones.svg',
  },
  {
    id: 'camera',
    category: 'tech',
    label: '소형 카메라',
    widthMm: 108,
    heightMm: 62,
    depthMm: 42,
    weightG: 250,
    icon: '/items/camera.svg',
  },
  {
    id: 'pouch',
    category: 'beauty',
    label: '파우치',
    widthMm: 180,
    heightMm: 110,
    depthMm: 40,
    weightG: 150,
    icon: '/items/pouch.svg',
  },
  {
    id: 'lipbalm',
    category: 'beauty',
    label: '립밤',
    widthMm: 16,
    heightMm: 70,
    depthMm: 16,
    weightG: 12,
    icon: '/items/lipbalm.svg',
  },
  {
    id: 'sanitizer',
    category: 'beauty',
    label: '손소독제',
    widthMm: 35,
    heightMm: 90,
    depthMm: 25,
    weightG: 40,
    icon: '/items/sanitizer.svg',
  },
  {
    id: 'tissues',
    category: 'beauty',
    label: '티슈',
    widthMm: 110,
    heightMm: 75,
    depthMm: 25,
    weightG: 30,
    icon: '/items/tissues.svg',
  },
  {
    id: 'bottle',
    category: 'drink',
    label: '350mL 물병',
    widthMm: 65,
    heightMm: 185,
    depthMm: 65,
    weightG: 380,
    icon: '/items/bottle.svg',
  },
  {
    id: 'umbrella',
    category: 'drink',
    label: '3단 우산',
    widthMm: 55,
    heightMm: 280,
    depthMm: 55,
    weightG: 250,
    icon: '/items/umbrella.svg',
  },
  {
    id: 'wallet',
    category: 'everyday',
    label: '지갑',
    widthMm: 90,
    heightMm: 115,
    depthMm: 15,
    weightG: 80,
    icon: '/items/wallet.svg',
  },
  {
    id: 'keys',
    category: 'everyday',
    label: '열쇠',
    widthMm: 30,
    heightMm: 70,
    depthMm: 12,
    weightG: 45,
    icon: '/items/keys.svg',
  },
  {
    id: 'sunglasses',
    category: 'everyday',
    label: '선글라스',
    widthMm: 160,
    heightMm: 70,
    depthMm: 50,
    weightG: 90,
    icon: '/items/sunglasses.svg',
  },
]

export const CARRY_ITEM_MAP: Record<ItemId, CarryItem> = Object.fromEntries(
  CARRY_ITEMS.map((item) => [item.id, item]),
) as Record<ItemId, CarryItem>

export const ITEMS_BY_CATEGORY: { category: ItemCategory; label: string; items: CarryItem[] }[] =
  ITEM_CATEGORIES.map((category) => ({
    category,
    label: ITEM_CATEGORY_LABEL[category],
    items: CARRY_ITEMS.filter((item) => item.category === category),
  }))

export function getCarryItem(id: ItemId) {
  return CARRY_ITEM_MAP[id]
}

export function itemVolumeMl(item: Pick<CarryItem, 'widthMm' | 'heightMm' | 'depthMm'>) {
  return Math.round((item.widthMm * item.heightMm * item.depthMm) / 1000)
}

export function sumCarryLoad(ids: ItemId[]): CarryLoad {
  return ids.reduce<CarryLoad>(
    (total, id) => {
      const item = getCarryItem(id)
      total.count += 1
      total.volumeMl += itemVolumeMl(item)
      total.weightG += item.weightG
      return total
    },
    { count: 0, volumeMl: 0, weightG: 0 },
  )
}

export function formatVolume(volumeMl: number) {
  if (volumeMl >= 1000) {
    const liters = volumeMl / 1000
    return `${liters >= 10 ? Math.round(liters) : liters.toFixed(1)}L`
  }
  return `${volumeMl}mL`
}

export function formatWeight(weightG: number) {
  if (weightG >= 1000) {
    const kg = weightG / 1000
    return `${kg >= 10 ? Math.round(kg) : kg.toFixed(1)}kg`
  }
  return `${weightG}g`
}

export function formatCarryLoad(load: CarryLoad) {
  if (load.count === 0) return '소지품을 고르면 개수와 예상 부피·무게를 보여 줍니다.'
  return `${load.count}개 선택 · 예상 부피 약 ${formatVolume(load.volumeMl)} · 예상 무게 약 ${formatWeight(load.weightG)}`
}

const catalogIds = CARRY_ITEMS.map((item) => item.id)
if (catalogIds.length !== ITEMS.length || catalogIds.some((id, index) => id !== ITEMS[index])) {
  throw new Error('CARRY_ITEMS must match ITEMS order and length')
}
