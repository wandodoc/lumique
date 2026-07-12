// ============================================================
// 상수 정의 — 나중에 Firestore 설정으로 이동 가능
// ============================================================

export const PARTS = {
  VOIX: 'VOIX',
  DANCE: 'DANCE',
  SESSION: 'SESSION',
  COMMON: '공통',
};

export const PART_LABELS = {
  VOIX: 'VOIX',
  DANCE: 'DANCE',
  SESSION: 'SESSION',
  공통: '공통',
};

// 계정과목
export const CATEGORIES = {
  // 수입
  DUES: '회비',
  PERFORMANCE: '공연 수입',
  INTEREST: '이자/기타',
  // 지출
  PRACTICE_ROOM: '연습실 대여',
  EQUIPMENT: '비품',
  SUPPLIES: '소모품',
  MEAL: '식대',
  HONORARIUM: '사례비',
  PARKING: '주차비',
};

export const INCOME_CATEGORIES = [
  '회비수익',
  '사업수익',
  '기타수익',
];

export const EXPENSE_CATEGORIES = [
  '임차료',
  '비품',
  '외주비',
  '소모품비',
  '복리후생비',
];

export const CATEGORY_ICONS = {
  // 새로운 표준 8개
  '회비수익': '💰',
  '사업수익': '🎭',
  '기타수익': '📈',
  '임차료': '🎵',
  '비품': '🛒',
  '외주비': '🤝',
  '소모품비': '📦',
  '복리후생비': '🍽️',
  
  // 구버전 호환용
  '회비': '💰', '공연 수입': '🎭', '이자/기타': '📈',
  '연습실 대여': '🎵', '소모품': '📦',
  '식대': '🍽️', '사례비': '🤝', '주차비': '🚗',
  '기타지출': '💸', '기타수입': '💵'
};

// 회비 기준
export const MONTHLY_DUES = 10000; // 월 만원

// 가입일 기준: 이 날짜(일) 이후 가입 시 익월부터 납부
export const DUES_START_DAY_THRESHOLD = 15;

// 회원 상태
export const MEMBER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

// 파트별 색상 (CSS 변수와 연동)
export const PART_COLORS = {
  VOIX: '#2b74e2',
  DANCE: '#e2596b',
  SESSION: '#7c3aed',
  공통: '#059669',
};

export const PART_BG_COLORS = {
  VOIX: '#e6effa',
  DANCE: '#fce8eb',
  SESSION: '#ede9fe',
  공통: '#d1fae5',
};
