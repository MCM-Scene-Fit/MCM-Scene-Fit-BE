import { CARRY_ITEMS } from './items'
import type {
  AxisStatus,
  BodyBuild,
  EvidenceLevel,
  FitPassExperience,
  ItemId,
  Mobility,
  Scene,
  WearStyle,
} from '../types'

export const SCENE_LABEL: Record<Scene, string> = {
  travel: '여행',
  work: '출근',
  culture: '전시·문화생활',
  meetup: '약속·모임',
  daily: '데일리',
}

export const SCENE_ICON: Record<Scene, string> = {
  travel: '🧳',
  work: '💼',
  culture: '🖼️',
  meetup: '🥂',
  daily: '☀️',
}

export const SCENE_HINT: Record<Scene, string> = {
  travel: '이동이 많고 수납이 중요한 날',
  work: '출퇴근과 미팅을 오가는 날',
  culture: '전시·공연을 가볍게 즐기는 날',
  meetup: '약속과 모임이 있는 날',
  daily: '평소 외출과 가까운 이동',
}

export const MOBILITY_LABEL: Record<Mobility, string> = {
  indoor: '실내 중심',
  'light-walk': '가벼운 도보',
  'long-walk': '오래 걷기',
}

export const MOBILITY_ICON: Record<Mobility, string> = {
  indoor: '🏛️',
  'light-walk': '🚶',
  'long-walk': '🗺️',
}

export const MOBILITY_HINT: Record<Mobility, string> = {
  indoor: '카페·실내 이동이 대부분인 날',
  'light-walk': '짧은 거리를 걸어 다니는 날',
  'long-walk': '오래 걷거나 대중교통이 많은 날',
}

export const WEAR_LABEL: Record<WearStyle, string> = {
  tote: '토트',
  shoulder: '숄더',
  crossbody: '크로스바디',
  backpack: '백팩',
}

export const WEAR_ICON: Record<WearStyle, string> = {
  tote: '🛍️',
  shoulder: '👛',
  crossbody: '👜',
  backpack: '🎒',
}

export const WEAR_HINT: Record<WearStyle, string> = {
  tote: '손에 들거나 팔에 거는 여유로운 형태',
  shoulder: '한쪽 어깨에 걸쳐 가볍게 메는 형태',
  crossbody: '양손이 자유롭고 오래 걷기 좋음',
  backpack: '무게를 분산해 장거리 이동에 편함',
}

export const ITEM_LABEL: Record<ItemId, string> = Object.fromEntries(
  CARRY_ITEMS.map((item) => [item.id, item.label]),
) as Record<ItemId, string>

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  confirmed: '확인됨',
  estimated: '예상됨',
  'store-check': '매장 확인 필요',
  unlikely: '어려움',
}

export const EVIDENCE_BADGE: Record<EvidenceLevel, string> = {
  confirmed: '🟢',
  estimated: '🔵',
  'store-check': '🟡',
  unlikely: '🔴',
}

export const CARRY_SCORE_POINTS: Record<EvidenceLevel, number> = {
  confirmed: 100,
  estimated: 80,
  'store-check': 50,
  unlikely: 0,
}

export const AXIS_STATUS_LABEL: Record<AxisStatus, string> = {
  match: '맞음',
  check: '확인 필요',
  weak: '약함',
}

export const EXPERIENCE_LABEL: Record<FitPassExperience, string> = {
  'fit-ratio': '실제 착용 비율과 스트랩 길이 확인',
  'storage-test': '가져갈 소지품 수납 테스트',
  styling: '내 옷과 어울리는 스타일링 제안',
  'color-compare': '다른 색상과 대안 제품 비교',
  care: '제품 관리와 오래 사용하는 방법 상담',
}

export const STORES = [
  { id: 'hyundai-pangyo', name: '현대백화점 판교' },
  { id: 'shinsegae-gangnam', name: '신세계백화점 강남' },
  { id: 'lotte-bon', name: '롯데백화점 본점' },
  { id: 'mcm-cheongdam', name: 'MCM 청담 플래그십' },
] as const

export const BUILD_LABEL: Record<BodyBuild, string> = {
  slim: '슬림',
  standard: '스탠다드',
  broad: '볼륨',
}

export function formatPrice(price: number) {
  return `₩${price.toLocaleString('ko-KR')}`
}
