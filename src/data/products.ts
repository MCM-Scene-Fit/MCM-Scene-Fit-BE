import { deriveLikelyStorage } from '../lib/itemFit'
import type { Product, ProductColor } from '../types'

/**
 * MCM 공식몰(kr.mcmworldwide.com) 공개 정보로 검수한 P0 10개.
 * 수납 `officialStorage`는 상세 페이지에 해당 품목이 명시된 경우만 넣는다.
 * 치수는 공식 표기(깊이 × 가로 × 세로 cm)를 width/height/depth(mm)로 변환했다.
 * 이미지는 공식 정면 컷을 로컬 자산으로 등록한 것이다. 런타임에 공식몰을 호출하지 않는다.
 */

const IMAGE_SIZE: Record<string, readonly [number, number]> = {
  MMKEAVE17PZ001: [720, 872],
  MMKFSVE05CO001: [694, 900],
  MMRGATA07BK001: [720, 398],
  MMTGATA01BK001: [720, 682],
  MMVGATT01BK001: [720, 528],
  MMVGATT01CO001: [720, 525],
  MWHESTA01CO001: [720, 682],
  MWPAATN04BK001: [720, 739],
  MWPAATN04CO001: [720, 697],
  MWPGSLR02CO001: [615, 900],
  MWPGSLR02I8001: [620, 900],
  MWSGATA01BK001: [706, 900],
  MWSGATA01I8001: [708, 900],
  MYZGATA01BK001: [720, 377],
  MYZGATA01CO001: [720, 373],
}

function swatch(id: string, name: string, hex: string, sku: string): ProductColor {
  const [imageWidth, imageHeight] = IMAGE_SIZE[sku]
  return { id, name, hex, sku, image: `/products/${sku}.webp`, imageWidth, imageHeight }
}

function withLikelyStorage(def: Omit<Product, 'likelyStorage'>): Product {
  return { ...def, likelyStorage: deriveLikelyStorage(def) }
}

export const PRODUCTS: Product[] = [
  withLikelyStorage({
    id: 'aren-nova-crossbody',
    name: 'Aren 노바 모노그램 ECONYL® 크로스바디',
    sku: 'MMRGATA07BK001',
    category: '크로스바디',
    colors: [swatch('black', 'Black', '#1A1A1A', 'MMRGATA07BK001')],
    price: 1090000,
    officialUrl:
      'https://kr.mcmworldwide.com/ko_KR/%EB%82%A8%EC%84%B1/%EA%B0%80%EB%B0%A9/%ED%81%AC%EB%A1%9C%EC%8A%A4%EB%B0%B1/aren-%EB%85%B8%EB%B0%94-%EB%AA%A8%EB%85%B8%EA%B7%B8%EB%9E%A8-econyl%C2%AE-%ED%81%AC%EB%A1%9C%EC%8A%A4%EB%B0%94%EB%94%94/MMRGATA07BK001.html',
    widthMm: 290,
    heightMm: 190,
    depthMm: 70,
    sizeLabel: 'S',
    wearStyles: ['crossbody'],
    strapAdjustable: true,
    officialStorage: [],
    pockets: 1,
    material: 'ECONYL® 재생 나일론, 비세토스 모노그램 모티프',
    sceneTags: ['travel', 'daily', 'meetup'],
    mood: ['nomad', 'city'],
    rewearTags: ['daily', 'meetup', 'culture'],
  }),
  withLikelyStorage({
    id: 'aren-mini-pouch',
    name: 'Aren 비세토스 크로스바디 파우치',
    sku: 'MYZGATA01CO001',
    category: '크로스바디',
    colors: [
      swatch('cognac', 'Cognac', '#9A6546', 'MYZGATA01CO001'),
      swatch('black', 'Black', '#1A1A1A', 'MYZGATA01BK001'),
    ],
    price: 690000,
    officialUrl:
      'https://kr.mcmworldwide.com/ko_KR/%EC%97%AC%EC%84%B1/%ED%95%B8%EB%93%9C%EB%B0%B1/%ED%81%B4%EB%9F%AC%EC%B9%98-%ED%8C%8C%EC%9A%B0%EC%B9%98/aren-%EB%B9%84%EC%84%B8%ED%86%A0%EC%8A%A4-%ED%81%AC%EB%A1%9C%EC%8A%A4%EB%B0%94%EB%94%94-%ED%8C%8C%EC%9A%B0%EC%B9%98/MYZGATA01CO001.html',
    widthMm: 260,
    heightMm: 150,
    depthMm: 20,
    sizeLabel: 'Mini',
    wearStyles: ['crossbody'],
    strapAdjustable: true,
    officialStorage: ['phone', 'wallet'],
    pockets: 2,
    material: '비세토스 모노그램 캔버스, 나파 가죽 트림',
    sceneTags: ['meetup', 'daily', 'culture'],
    mood: ['compact', 'evening'],
    rewearTags: ['daily', 'meetup'],
  }),
  withLikelyStorage({
    id: 'aren-ew-shoulder',
    name: 'Aren 비세토스 E/W 숄더백',
    sku: 'MWSGATA01BK001',
    category: '숄더',
    colors: [
      swatch('black', 'Black', '#1A1A1A', 'MWSGATA01BK001'),
      swatch('cream', 'Beige', '#E8D9C8', 'MWSGATA01I8001'),
    ],
    price: 1090000,
    officialUrl:
      'https://kr.mcmworldwide.com/ko_KR/%EC%97%AC%EC%84%B1/%ED%95%B8%EB%93%9C%EB%B0%B1/%EC%88%84%EB%8D%94%EB%B0%B1-%ED%81%AC%EB%A1%9C%EC%8A%A4%EB%B0%B1/aren-%EB%B9%84%EC%84%B8%ED%86%A0%EC%8A%A4-e%2Fw-%EC%88%84%EB%8D%94%EB%B0%B1/MWSGATA01BK001.html',
    widthMm: 290,
    heightMm: 120,
    depthMm: 90,
    sizeLabel: 'S',
    wearStyles: ['shoulder'],
    strapAdjustable: false,
    officialStorage: ['wallet'],
    pockets: 1,
    material: '비세토스 모노그램 캔버스, 레더 트림',
    sceneTags: ['meetup', 'culture', 'daily'],
    mood: ['clean', 'evening'],
    rewearTags: ['meetup', 'culture', 'daily'],
  }),
  withLikelyStorage({
    id: 'aren-hobo',
    name: 'Aren 비세토스 호보',
    sku: 'MWHESTA01CO001',
    category: '숄더',
    colors: [swatch('cognac', 'Cognac', '#9A6546', 'MWHESTA01CO001')],
    price: 1290000,
    officialUrl:
      'https://kr.mcmworldwide.com/ko_KR/%EC%97%AC%EC%84%B1/%ED%95%B8%EB%93%9C%EB%B0%B1/%EC%88%84%EB%8D%94%EB%B0%B1-%ED%81%AC%EB%A1%9C%EC%8A%A4%EB%B0%B1/aren-%EB%B9%84%EC%84%B8%ED%86%A0%EC%8A%A4-%ED%98%B8%EB%B3%B4/MWHESTA01CO001.html',
    widthMm: 260,
    heightMm: 190,
    depthMm: 100,
    sizeLabel: 'S',
    wearStyles: ['shoulder', 'crossbody'],
    strapAdjustable: true,
    officialStorage: [],
    pockets: 1,
    material: '비세토스 모노그램 캔버스, 나파 가죽 트림',
    sceneTags: ['daily', 'meetup', 'culture'],
    mood: ['relaxed', 'city'],
    rewearTags: ['daily', 'meetup', 'culture'],
  }),
  withLikelyStorage({
    id: 'toni-mini-shopper',
    name: 'Toni 비세토스 상단 지퍼 쇼퍼',
    sku: 'MWPAATN04CO001',
    category: '토트',
    colors: [
      swatch('cognac', 'Cognac', '#9A6546', 'MWPAATN04CO001'),
      swatch('black', 'Black', '#1A1A1A', 'MWPAATN04BK001'),
    ],
    price: 970000,
    officialUrl:
      'https://kr.mcmworldwide.com/ko_KR/%EC%97%AC%EC%84%B1/%ED%95%B8%EB%93%9C%EB%B0%B1/%EC%87%BC%ED%8D%BC-%ED%86%A0%ED%8A%B8%EB%B0%B1/toni-%EB%B9%84%EC%84%B8%ED%86%A0%EC%8A%A4-%EC%83%81%EB%8B%A8-%EC%A7%80%ED%8D%BC-%EC%87%BC%ED%8D%BC/MWPAATN04CO001.html',
    widthMm: 190,
    heightMm: 190,
    depthMm: 100,
    sizeLabel: 'Mini',
    wearStyles: ['tote', 'crossbody'],
    strapAdjustable: true,
    officialStorage: [],
    pockets: 3,
    material: '비세토스 모노그램 코티드 캔버스, 나파 가죽 트림',
    sceneTags: ['daily', 'meetup', 'culture'],
    mood: ['street', 'compact'],
    rewearTags: ['daily', 'meetup'],
  }),
  withLikelyStorage({
    id: 'liz-shopper-m',
    name: 'New Liz 비세토스 쇼퍼',
    sku: 'MWPGSLR02I8001',
    category: '토트',
    colors: [
      swatch('cream', 'Beige', '#E8D9C8', 'MWPGSLR02I8001'),
      swatch('cognac', 'Brown', '#9A6546', 'MWPGSLR02CO001'),
    ],
    price: 1090000,
    officialUrl:
      'https://kr.mcmworldwide.com/ko_KR/%EC%97%AC%EC%84%B1/%ED%95%B8%EB%93%9C%EB%B0%B1/%EC%87%BC%ED%8D%BC-%ED%86%A0%ED%8A%B8%EB%B0%B1/new-liz-%EB%B9%84%EC%84%B8%ED%86%A0%EC%8A%A4-%EC%87%BC%ED%8D%BC/MWPGSLR02I8001.html',
    widthMm: 300,
    heightMm: 350,
    depthMm: 170,
    sizeLabel: 'M',
    wearStyles: ['tote', 'shoulder'],
    strapAdjustable: false,
    officialStorage: ['pouch'],
    pockets: 1,
    material: '비세토스 모노그램 캔버스, 나파 가죽 트림',
    sceneTags: ['work', 'daily', 'culture', 'travel'],
    mood: ['day', 'soft'],
    rewearTags: ['work', 'daily', 'culture'],
  }),
  withLikelyStorage({
    id: 'aren-nova-tote',
    name: 'Aren 노바 모노그램 ECONYL® 토트',
    sku: 'MMTGATA01BK001',
    category: '토트',
    colors: [swatch('black', 'Black', '#1A1A1A', 'MMTGATA01BK001')],
    price: 1350000,
    officialUrl:
      'https://kr.mcmworldwide.com/ko_KR/%EB%82%A8%EC%84%B1/%EA%B0%80%EB%B0%A9/%ED%86%A0%ED%8A%B8%EB%B0%B1/aren-%EB%85%B8%EB%B0%94-%EB%AA%A8%EB%85%B8%EA%B7%B8%EB%9E%A8-econyl%C2%AE-%ED%86%A0%ED%8A%B8/MMTGATA01BK001.html',
    widthMm: 460,
    heightMm: 340,
    depthMm: 100,
    sizeLabel: 'XL',
    wearStyles: ['tote', 'shoulder'],
    strapAdjustable: true,
    officialStorage: [],
    pockets: 1,
    material: 'ECONYL® 재생 나일론, 비세토스 모노그램 모티프',
    sceneTags: ['work', 'travel', 'daily'],
    mood: ['structured', 'commute'],
    rewearTags: ['work', 'daily'],
  }),
  withLikelyStorage({
    id: 'stark-backpack-m',
    name: 'Stark 비세토스 백팩',
    sku: 'MMKFSVE05CO001',
    category: '백팩',
    colors: [swatch('cognac', 'Cognac', '#9A6546', 'MMKFSVE05CO001')],
    price: 1890000,
    officialUrl:
      'https://kr.mcmworldwide.com/ko_KR/%EB%82%A8%EC%84%B1/%EA%B0%80%EB%B0%A9/%EB%B0%B1%ED%8C%A9/%EB%B9%84%EC%84%B8%ED%86%A0%EC%8A%A4-%EC%8A%A4%ED%83%80%ED%81%AC-%EB%B0%B1%ED%8C%A9/MMKFSVE05CO001.html',
    widthMm: 320,
    heightMm: 440,
    depthMm: 150,
    sizeLabel: 'M',
    wearStyles: ['backpack'],
    strapAdjustable: true,
    officialStorage: ['laptop13', 'tablet'],
    pockets: 4,
    material: '비세토스 모노그램 캔버스, 천연 나파 가죽 트림',
    sceneTags: ['travel', 'work', 'daily'],
    mood: ['heritage', 'utilitarian'],
    rewearTags: ['work', 'travel', 'daily'],
  }),
  withLikelyStorage({
    id: 'stark-bebe-boo',
    name: 'Stark 비세토스 사이드 스터드 베베 부 백팩',
    sku: 'MMKEAVE17PZ001',
    category: '백팩',
    colors: [swatch('pink', 'Pink', '#E8A0B4', 'MMKEAVE17PZ001')],
    price: 1350000,
    officialUrl:
      'https://kr.mcmworldwide.com/ko_KR/pink-promotion-2026/stark-%EB%B9%84%EC%84%B8%ED%86%A0%EC%8A%A4-%EC%82%AC%EC%9D%B4%EB%93%9C-%EC%8A%A4%ED%84%B0%EB%93%9C--%EB%B2%A0%EB%B2%A0-%EB%B6%80--%EB%B0%B1%ED%8C%A9/MMKEAVE17PZ001.html',
    widthMm: 170,
    heightMm: 210,
    depthMm: 90,
    sizeLabel: 'Extra Mini',
    wearStyles: ['backpack', 'crossbody'],
    strapAdjustable: true,
    officialStorage: ['wallet'],
    pockets: 3,
    material: '비세토스 모노그램 캔버스, 천연 나파 가죽 트림',
    sceneTags: ['daily', 'meetup', 'travel'],
    mood: ['iconic', 'compact'],
    rewearTags: ['daily', 'meetup'],
  }),
  withLikelyStorage({
    id: 'ottomar-weekender-41',
    name: 'Ottomar 비세토스 위켄더 41cm',
    sku: 'MMVGATT01CO001',
    category: '위켄더',
    colors: [
      swatch('cognac', 'Cognac', '#9A6546', 'MMVGATT01CO001'),
      swatch('black', 'Black', '#1A1A1A', 'MMVGATT01BK001'),
    ],
    price: 1750000,
    officialUrl:
      'https://kr.mcmworldwide.com/ko_KR/%ED%8A%B8%EB%9E%98%EB%B8%94/%EB%9F%AC%EA%B8%B0%EC%A7%80-%EB%B0%B1/ottomar-%EB%B9%84%EC%84%B8%ED%86%A0%EC%8A%A4-%EC%9C%84%EC%BC%84%EB%8D%94/MMVGATT01CO001.html',
    widthMm: 410,
    heightMm: 260,
    depthMm: 170,
    sizeLabel: '41cm',
    wearStyles: ['tote', 'shoulder'],
    strapAdjustable: true,
    officialStorage: [],
    pockets: 2,
    material: '비세토스 모노그램 캔버스, 나파 가죽 트림',
    sceneTags: ['travel'],
    mood: ['heritage', 'nomad'],
    rewearTags: ['travel', 'daily'],
  }),
]

export function getProduct(id: string) {
  return PRODUCTS.find((product) => product.id === id)
}

export function getColor(product: Product, colorId: string) {
  return product.colors.find((color) => color.id === colorId) ?? product.colors[0]
}

/** 카드 안에서 다른 가방과 같은 기준으로 상대 크기를 맞춘다. */
export function bagCardScale(product: Product) {
  const largest = Math.max(...PRODUCTS.map((item) => Math.max(item.widthMm, item.heightMm)))
  return Math.max(0.58, Math.max(product.widthMm, product.heightMm) / largest)
}
