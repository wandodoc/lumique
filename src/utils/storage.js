// LocalStorage 기반 저장소 — 나중에 Firestore로 교체 가능
const KEYS = {
  TRANSACTIONS: 'lumique_transactions',
  MEMBERS: 'lumique_members',
  PERFORMANCES: 'lumique_performances',
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
    localStorage.removeItem(KEYS.LAST_UPDATED);
  },
};
