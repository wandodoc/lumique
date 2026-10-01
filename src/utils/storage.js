// LocalStorage 기반 저장소 — 나중에 Firestore로 교체 가능
const KEYS = {
  TRANSACTIONS: 'lumique_transactions',
  MEMBERS: 'lumique_members',
  PERFORMANCES: 'lumique_performances',
  PERFORMANCE_PARTICIPANTS: 'lumique_performance_participants',
  MEMBER_AVAILABILITY: 'lumique_member_availability',
  BAND_MEMBERS: 'lumique_band_members',
  BAND_MEMBER_AVAILABILITY: 'lumique_band_member_availability',
  PRACTICE_STATUSES: 'lumique_practice_statuses',
  CONFIRMED_REHEARSALS: 'lumique_confirmed_rehearsals',
  LAST_UPDATED: 'lumique_last_updated',
};

export const storage = {
  getTransactions: () => {
    try {
      const raw = localStorage.getItem(KEYS.TRANSACTIONS);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  setTransactions: (data) => {
    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(data));
  },
  getMembers: () => {
    try {
      const raw = localStorage.getItem(KEYS.MEMBERS);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  setMembers: (data) => {
    localStorage.setItem(KEYS.MEMBERS, JSON.stringify(data));
  },
  getPerformances: () => {
    try {
      const raw = localStorage.getItem(KEYS.PERFORMANCES);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  setPerformances: (data) => {
    localStorage.setItem(KEYS.PERFORMANCES, JSON.stringify(data));
  },
  getPerformanceParticipants: () => {
    try {
      const raw = localStorage.getItem(KEYS.PERFORMANCE_PARTICIPANTS);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  setPerformanceParticipants: (data) => {
    localStorage.setItem(KEYS.PERFORMANCE_PARTICIPANTS, JSON.stringify(data));
  },
  getMemberAvailability: () => {
    try {
      const raw = localStorage.getItem(KEYS.MEMBER_AVAILABILITY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  setMemberAvailability: (data) => {
    localStorage.setItem(KEYS.MEMBER_AVAILABILITY, JSON.stringify(data));
  },
  getBandMembers: () => {
    try {
      const raw = localStorage.getItem(KEYS.BAND_MEMBERS);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  setBandMembers: (data) => {
    localStorage.setItem(KEYS.BAND_MEMBERS, JSON.stringify(data));
  },
  getBandMemberAvailability: () => {
    try {
      const raw = localStorage.getItem(KEYS.BAND_MEMBER_AVAILABILITY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  setBandMemberAvailability: (data) => {
    localStorage.setItem(KEYS.BAND_MEMBER_AVAILABILITY, JSON.stringify(data));
  },
  getPracticeStatuses: () => {
    try {
      const raw = localStorage.getItem(KEYS.PRACTICE_STATUSES);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  setPracticeStatuses: (data) => {
    localStorage.setItem(KEYS.PRACTICE_STATUSES, JSON.stringify(data));
  },
  getConfirmedRehearsals: () => {
    try {
      const raw = localStorage.getItem(KEYS.CONFIRMED_REHEARSALS);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  setConfirmedRehearsals: (data) => {
    localStorage.setItem(KEYS.CONFIRMED_REHEARSALS, JSON.stringify(data));
  },
  getLastUpdated: () => {
    try {
      return localStorage.getItem(KEYS.LAST_UPDATED) || null;
    } catch { return null; }
  },
  setLastUpdated: (isoString) => {
    localStorage.setItem(KEYS.LAST_UPDATED, isoString);
  },
  clear: () => {
    localStorage.removeItem(KEYS.TRANSACTIONS);
    localStorage.removeItem(KEYS.MEMBERS);
    localStorage.removeItem(KEYS.PERFORMANCES);
    localStorage.removeItem(KEYS.PERFORMANCE_PARTICIPANTS);
    localStorage.removeItem(KEYS.MEMBER_AVAILABILITY);
    localStorage.removeItem(KEYS.BAND_MEMBERS);
    localStorage.removeItem(KEYS.BAND_MEMBER_AVAILABILITY);
    localStorage.removeItem(KEYS.PRACTICE_STATUSES);
    localStorage.removeItem(KEYS.CONFIRMED_REHEARSALS);
    localStorage.removeItem(KEYS.LAST_UPDATED);
  },
};
