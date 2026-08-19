export const SCENES = ['travel', 'work', 'culture', 'meetup', 'daily'] as const
export type Scene = (typeof SCENES)[number]

export const MOBILITY = ['indoor', 'light-walk', 'long-walk'] as const
export type Mobility = (typeof MOBILITY)[number]

export const WEAR_STYLES = ['tote', 'shoulder', 'crossbody', 'backpack'] as const
export type WearStyle = (typeof WEAR_STYLES)[number]

export const ITEM_CATEGORIES = ['tech', 'beauty', 'drink', 'everyday'] as const
export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export const ITEMS = [
  'phone',
  'tablet',
  'laptop13',
  'laptop16',
  'powerbank',
  'earphones',
  'camera',
  'pouch',
  'lipbalm',
  'sanitizer',
  'tissues',
  'bottle',
  'umbrella',
  'wallet',
  'keys',
  'sunglasses',
] as const
export type ItemId = (typeof ITEMS)[number]

export type ItemPresets = Partial<Record<'phone' | 'tablet' | 'laptop' | 'powerbank', string>>

export type CarryLoad = {
  count: number
  volumeMl: number
  weightG: number
}

export const EVIDENCE = [
  'confirmed',
  'estimated',
  'store-check',
  'unlikely',
] as const
export type EvidenceLevel = (typeof EVIDENCE)[number]

export type ProductColor = {
  id: string
  name: string
  hex: string
  sku: string
  image: string
  imageWidth: number
  imageHeight: number
  sideImage: string
  sideImageWidth: number
  sideImageHeight: number
}

export type Product = {
  id: string
  name: string
  sku: string
  category: string
  colors: ProductColor[]
  price: number
  officialUrl: string
  widthMm: number
  heightMm: number
  depthMm: number
  sizeLabel: string
  wearStyles: WearStyle[]
  strapAdjustable: boolean
  officialStorage: ItemId[]
  likelyStorage: ItemId[]
  pockets: number
  material: string
  sceneTags: Scene[]
  mood: string[]
  rewearTags: Scene[]
  weightG?: number
}

export type Conditions = {
  scene: Scene | null
  mobility: Mobility | null
  items: ItemId[]
  itemPresets: ItemPresets
  wearStyle: WearStyle | null
  destination: string
  rewearScene: Scene | null
}

export type PreviewMode = 'photo' | 'silhouette'

export const BUILDS = ['slim', 'standard', 'broad'] as const
export type BodyBuild = (typeof BUILDS)[number]

export type BodyProfile = {
  heightCm: number
  build: BodyBuild
}

export type ItemVerdict = {
  item: ItemId
  label: string
  level: EvidenceLevel
  message: string
  /** 축 정렬 회전 후 가장 빡센 축 점유율. 1을 넘으면 가방 치수 초과. */
  fillRatio: number
}

export const AXIS_STATUSES = ['match', 'check', 'weak'] as const
export type AxisStatus = (typeof AXIS_STATUSES)[number]

export type FitResult = {
  sceneMatch: { headline: string; detail: string; positive: boolean; status: AxisStatus }
  carryCheck: {
    headline: string
    items: ItemVerdict[]
    status: AxisStatus
    load: CarryLoad
    /** 품목 판정 평균(0–100). 소지품이 없으면 null. */
    score: number | null
  }
  rewearPotential: { headline: string; detail: string; positive: boolean; status: AxisStatus }
  matches: string[]
  mismatches: string[]
  storeChecks: string[]
  alternativeId: string | null
}

export type FitPassExperience =
  | 'fit-ratio'
  | 'storage-test'
  | 'styling'
  | 'color-compare'
  | 'care'

export type FitPassDraft = {
  storeId: string
  visitTime: string
  experiences: FitPassExperience[]
  customNote: string
}

export type FitPassIssued = {
  id: string
  storeChecks: string[]
  createdAt: string
}

export type FitPassStatus = 'requested' | 'checking' | 'confirmed'
