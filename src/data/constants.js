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
  PERFORMANCE: '공연수익',
  INTEREST: '이자/기타',
  // 지출
  PRACTICE_ROOM: '연습실대여',
  EQUIPMENT: '비품',
  SUPPLIES: '소모품',
  MEAL: '식대',
  HONORARIUM: '사례비',
  PARKING: '주차비',
};

export const INCOME_CATEGORIES = [
  CATEGORIES.DUES,
  CATEGORIES.PERFORMANCE,
  CATEGORIES.INTEREST,
];

export const EXPENSE_CATEGORIES = [
  CATEGORIES.PRACTICE_ROOM,
  CATEGORIES.EQUIPMENT,
  CATEGORIES.SUPPLIES,
  CATEGORIES.MEAL,
  CATEGORIES.HONORARIUM,
  CATEGORIES.PARKING,
];

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
