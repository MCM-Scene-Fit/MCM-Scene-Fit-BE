import { CARRY_ITEMS, getCarryItem, ITEM_CATEGORY_LABEL, type CarryItem } from './items.js'
import { ITEM_CATEGORIES, type ItemId, type ItemPresets } from '../types.js'

export const PRESET_KINDS = ['phone', 'tablet', 'laptop', 'powerbank'] as const
export type PresetKind = (typeof PRESET_KINDS)[number]

export type ItemPreset = {
  id: string
  label: string
  hint: string
  widthMm: number
  heightMm: number
  depthMm: number
  weightG: number
}

export const DEFAULT_PRESET: Record<PresetKind, string> = {
  phone: '6.1',
  tablet: '11',
  laptop: '13',
  powerbank: '10k',
}

export const PRESET_KIND_LABEL: Record<PresetKind, string> = {
  phone: '휴대전화',
  tablet: '태블릿',
  laptop: '노트북',
  powerbank: '보조배터리',
}

export const ITEM_PRESETS: Record<PresetKind, ItemPreset[]> = {
  phone: [
    {
      id: 'se',
      label: '소형 5.4″',
      hint: '64×135mm · 144g',
      widthMm: 64,
      heightMm: 135,
      depthMm: 8,
      weightG: 144,
    },
    {
      id: '6.1',
      label: '기본 6.1″',
      hint: '72×148mm · 200g',
      widthMm: 72,
      heightMm: 148,
      depthMm: 8,
      weightG: 200,
    },
    {
      id: '6.7',
      label: '큰 화면 6.7″',
      hint: '78×163mm · 227g',
      widthMm: 78,
      heightMm: 163,
      depthMm: 8,
      weightG: 227,
    },
  ],
  tablet: [
    {
      id: '11',
      label: '11인치',
      hint: '180×250mm · 460g',
      widthMm: 180,
      heightMm: 250,
      depthMm: 6,
      weightG: 460,
    },
    {
      id: '13',
      label: '13인치',
      hint: '215×280mm · 682g',
      widthMm: 215,
      heightMm: 280,
      depthMm: 6,
      weightG: 682,
    },
  ],
  laptop: [
    {
      id: '13',
      label: '13인치',
      hint: '304×215mm · 1.2kg',
      widthMm: 304,
      heightMm: 215,
      depthMm: 12,
      weightG: 1240,
    },
    {
      id: '14',
      label: '14인치',
      hint: '312×221mm · 1.6kg',
      widthMm: 312,
      heightMm: 221,
      depthMm: 15,
      weightG: 1600,
    },
    {
      id: '16',
      label: '16인치',
      hint: '356×248mm · 2.1kg',
      widthMm: 356,
      heightMm: 248,
      depthMm: 17,
      weightG: 2140,
    },
  ],
  powerbank: [
    {
      id: '5k',
      label: '5,000mAh',
      hint: '62×96mm · 150g',
      widthMm: 62,
      heightMm: 96,
      depthMm: 15,
      weightG: 150,
    },
    {
      id: '10k',
      label: '10,000mAh',
      hint: '70×140mm · 240g',
      widthMm: 70,
      heightMm: 140,
      depthMm: 20,
      weightG: 240,
    },
    {
      id: '20k',
      label: '20,000mAh',
      hint: '78×148mm · 430g',
      widthMm: 78,
      heightMm: 148,
      depthMm: 28,
      weightG: 430,
    },
  ],
}

export function presetKindOf(id: ItemId): PresetKind | null {
  if (id === 'phone') return 'phone'
  if (id === 'tablet') return 'tablet'
  if (id === 'laptop13' || id === 'laptop16') return 'laptop'
  if (id === 'powerbank') return 'powerbank'
  return null
}

export function laptopIdForPreset(presetId: string): ItemId {
  return presetId === '16' ? 'laptop16' : 'laptop13'
}

export function kindSelected(kind: PresetKind, items: ItemId[]) {
  if (kind === 'laptop') return items.includes('laptop13') || items.includes('laptop16')
  return items.includes(kind)
}

export function activePresetId(kind: PresetKind, presets: ItemPresets = {}) {
  return presets[kind] ?? DEFAULT_PRESET[kind]
}

export function findPreset(kind: PresetKind, presets: ItemPresets = {}) {
  const id = activePresetId(kind, presets)
  return ITEM_PRESETS[kind].find((preset) => preset.id === id) ?? ITEM_PRESETS[kind][0]
}

export function isCanonicalPreset(id: ItemId, presets: ItemPresets = {}) {
  const kind = presetKindOf(id)
  if (!kind) return true
  const presetId = activePresetId(kind, presets)
  if (id === 'laptop13') return presetId === '13'
  if (id === 'laptop16') return presetId === '16'
  return presetId === DEFAULT_PRESET[kind]
}

export function resolveCarryItem(id: ItemId, presets: ItemPresets = {}): CarryItem {
  const base = getCarryItem(id)
  const kind = presetKindOf(id)
  if (!kind) return base
  const preset = findPreset(kind, presets)
  return {
    ...base,
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    depthMm: preset.depthMm,
    weightG: preset.weightG,
    label: kind === 'laptop' ? `노트북 ${preset.label}` : `${base.label} ${preset.label}`,
  }
}

export function itemDisplayLabel(id: ItemId, presets: ItemPresets = {}) {
  return resolveCarryItem(id, presets).label
}

export function applyItemToggle(items: ItemId[], item: ItemId, presets: ItemPresets = {}): ItemId[] {
  const kind = presetKindOf(item)
  if (kind === 'laptop') {
    if (kindSelected('laptop', items)) {
      return items.filter((value) => value !== 'laptop13' && value !== 'laptop16')
    }
    return [...items, laptopIdForPreset(activePresetId('laptop', presets))]
  }
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item]
}

export function applyPresetChange(
  items: ItemId[],
  presets: ItemPresets,
  kind: PresetKind,
  presetId: string,
) {
  const nextPresets = { ...presets, [kind]: presetId }
  if (kind !== 'laptop' || !kindSelected('laptop', items)) {
    return { items, itemPresets: nextPresets }
  }
  const nextId = laptopIdForPreset(presetId)
  return {
    items: [...items.filter((value) => value !== 'laptop13' && value !== 'laptop16'), nextId],
    itemPresets: nextPresets,
  }
}

export const PICKER_ITEMS_BY_CATEGORY = ITEM_CATEGORIES.map((category) => ({
  category,
  label: ITEM_CATEGORY_LABEL[category],
  items: CARRY_ITEMS.filter((item) => item.category === category && item.id !== 'laptop16').map(
    (item) => (item.id === 'laptop13' ? { ...item, label: PRESET_KIND_LABEL.laptop } : item),
  ),
}))
