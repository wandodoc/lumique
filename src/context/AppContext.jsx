import { createContext, useContext, useReducer, useEffect } from 'react';
import { MEMBERS } from '../data/members';
import { SAMPLE_TRANSACTIONS } from '../data/transactions';
import { storage } from '../utils/storage';
import { firebaseStorage } from '../utils/firebaseStorage';

const AppContext = createContext(null);

// 기본 공연 목록: 하드코딩 데이터 없음. 항상 빈 배열로 시작.
const DEFAULT_PERFORMANCES = [];

const normalizeMemberAvailability = value => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const normalizeBandMembers = value => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const normalizePracticeStatuses = value => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const normalizeConfirmedRehearsals = value => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const initialState = {
  members: [],
  transactions: [],
  performances: DEFAULT_PERFORMANCES, // 공연 목록 (동적 관리)
  performanceParticipants: {},
  memberAvailability: {},
  bandMembers: {},
  bandMemberAvailability: {},
  practiceStatuses: {},
  confirmedRehearsals: {},
  lastUpdated: null,
  loading: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'INIT':
      return {
        ...state,
        members: action.members,
        transactions: action.transactions,
        performances: action.performances,
        performanceParticipants: action.performanceParticipants || {},
        memberAvailability: normalizeMemberAvailability(action.memberAvailability),
        bandMembers: normalizeBandMembers(action.bandMembers),
        bandMemberAvailability: normalizeMemberAvailability(action.bandMemberAvailability),
        practiceStatuses: normalizePracticeStatuses(action.practiceStatuses),
        confirmedRehearsals: normalizeConfirmedRehearsals(action.confirmedRehearsals),
        lastUpdated: action.lastUpdated,
        loading: false,
      };
    case 'ADD_TRANSACTION': {
      const txs = [action.tx, ...state.transactions].sort(
        (a, b) => new Date(b.datetime) - new Date(a.datetime)
      );
      return { ...state, transactions: txs, lastUpdated: new Date().toISOString() };
    }
    case 'DELETE_TRANSACTION': {
      const txs = state.transactions.filter(t => t.id !== action.id);
      return { ...state, transactions: txs, lastUpdated: new Date().toISOString() };
    }
    case 'UPDATE_TRANSACTION': {
      const txs = state.transactions.map(t => t.id === action.tx.id ? action.tx : t);
      return { ...state, transactions: txs, lastUpdated: new Date().toISOString() };
    }
    case 'BATCH_UPDATE_TRANSACTIONS': {
      const updatesMap = new Map(action.updates.map(u => [u.id, u]));
      const txs = state.transactions.map(t => {
        if (updatesMap.has(t.id)) {
          const update = updatesMap.get(t.id);
          const updatedTx = { ...t, ...update };
          if (updatedTx.splitItems && updatedTx.splitItems.length > 0) {
            updatedTx.splitItems = updatedTx.splitItems.map(item => {
              const newItem = { ...item };
              if (update.category) newItem.category = update.category;
              if (update.part) newItem.part = update.part;
              return newItem;
            });
          }
          return updatedTx;
        }
        return t;
      });
      return { ...state, transactions: txs, lastUpdated: new Date().toISOString() };
    }
    case 'ADD_MEMBER': {
      const members = [...state.members, action.member];
      return { ...state, members, lastUpdated: new Date().toISOString() };
    }
    case 'UPDATE_MEMBER': {
      const members = state.members.map(m => m.id === action.member.id ? action.member : m);
      return { ...state, members, lastUpdated: new Date().toISOString() };
    }
    case 'ADD_PERFORMANCE': {
      const performances = [...state.performances, action.perf];
      return { ...state, performances, lastUpdated: new Date().toISOString() };
    }
    case 'DELETE_PERFORMANCE': {
      const performances = state.performances.filter(p => p.key !== action.key);
      return { ...state, performances, lastUpdated: new Date().toISOString() };
    }
    case 'SET_PERFORMANCE_PARTICIPANTS':
      return {
        ...state,
        performanceParticipants: action.performanceParticipants || {},
        lastUpdated: new Date().toISOString(),
      };
    case 'DELETE_PERFORMANCE_PARTICIPANTS': {
      const performanceParticipants = { ...state.performanceParticipants };
      delete performanceParticipants[action.showId];
      return { ...state, performanceParticipants, lastUpdated: new Date().toISOString() };
    }
    case 'ADD_BAND_MEMBER': {
      const bandMember = action.bandMember;
      if (!bandMember?.id) return state;

      return {
        ...state,
        bandMembers: {
          ...normalizeBandMembers(state.bandMembers),
          [bandMember.id]: bandMember,
        },
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'UPDATE_BAND_MEMBER': {
      const bandMember = action.bandMember;
      if (!bandMember?.id) return state;

      const bandMembers = normalizeBandMembers(state.bandMembers);
      if (!bandMembers[bandMember.id]) return state;

      return {
        ...state,
        bandMembers: { ...bandMembers, [bandMember.id]: bandMember },
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'DELETE_BAND_MEMBER': {
      const bandMembers = { ...normalizeBandMembers(state.bandMembers) };
      delete bandMembers[action.bandMemberId];

      const bandMemberAvailability = { ...normalizeMemberAvailability(state.bandMemberAvailability) };
      delete bandMemberAvailability[action.bandMemberId];

      return {
        ...state,
        bandMembers,
        bandMemberAvailability,
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'UPDATE_BAND_MEMBER_AVAILABILITY': {
      const { bandMemberId, date, status } = action;
      const validStatuses = ['available', 'unavailable', 'undecided'];

      if (!bandMemberId || !date || !validStatuses.includes(status)) return state;

      const bandMemberAvailability = normalizeMemberAvailability(state.bandMemberAvailability);
      return {
        ...state,
        bandMemberAvailability: {
          ...bandMemberAvailability,
          [bandMemberId]: {
            ...(bandMemberAvailability[bandMemberId] || {}),
            [date]: status,
          },
        },
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'UPDATE_PRACTICE_STATUS': {
      const { date, songId, status } = action.payload || action;
      const validStatuses = ['possible', 'impossible', 'hold', 'undecided'];

      if (!date || !songId || !validStatuses.includes(status)) return state;

      const practiceStatuses = normalizePracticeStatuses(state.practiceStatuses);
      return {
        ...state,
        practiceStatuses: {
          ...practiceStatuses,
          [date]: {
            ...(practiceStatuses[date] || {}),
            [songId]: status,
          },
        },
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'ADD_CONFIRMED_REHEARSAL': {
      const rehearsal = action.payload;
      if (!rehearsal?.id) return state;

      return {
        ...state,
        confirmedRehearsals: {
          ...normalizeConfirmedRehearsals(state.confirmedRehearsals),
          [rehearsal.id]: rehearsal,
        },
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'UPDATE_CONFIRMED_REHEARSAL': {
      const rehearsal = action.payload;
      if (!rehearsal?.id) return state;

      const confirmedRehearsals = normalizeConfirmedRehearsals(state.confirmedRehearsals);
      if (!confirmedRehearsals[rehearsal.id]) return state;

      return {
        ...state,
        confirmedRehearsals: {
          ...confirmedRehearsals,
          [rehearsal.id]: rehearsal,
        },
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'DELETE_CONFIRMED_REHEARSAL': {
      const confirmedRehearsals = { ...normalizeConfirmedRehearsals(state.confirmedRehearsals) };
      delete confirmedRehearsals[action.payload?.id || action.id];

      return {
        ...state,
        confirmedRehearsals,
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'UPDATE_MEMBER_AVAILABILITY': {
      const { memberId, date, status } = action;
      const validStatuses = ['available', 'unavailable', 'undecided'];

      if (!memberId || !date || !validStatuses.includes(status)) return state;

      const memberAvailability = normalizeMemberAvailability(state.memberAvailability);
      return {
        ...state,
        memberAvailability: {
          ...memberAvailability,
          [memberId]: {
            ...(memberAvailability[memberId] || {}),
            [date]: status,
          },
        },
        lastUpdated: new Date().toISOString(),
      };
    }
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    async function loadInitialData() {
      // 1. Firebase에서 최신 상태 불러오기
      const fbState = await firebaseStorage.loadData();
      
      if (fbState) {
        let transactions = fbState.transactions || [];
        let updatedCount = 0;
        transactions = transactions.map(t => {
          const desc = t.description || '';
          const category = t.category || '';
          if ((desc.includes('이자') || category === '이자/기타') && t.type === 'expense') {
            updatedCount++;
            return {
              ...t,
              type: 'income',
              category: '이자/기타',
            };
          }
          return t;
        });

        // 공연 키 마이그레이션 (2025-07 -> 2025-07-20 등)
        const KEY_MAP = {
          '2025-07': '2025-07-20',
          '2025-12': '2025-12-28',
          '2026-07': '2026-07-11'
        };

        let performances = fbState.performances || [];
        let needsPerfUpdate = false;
        
        const mappedPerformances = performances.map(p => {
          if (KEY_MAP[p.key]) {
            needsPerfUpdate = true;
            return { ...p, key: KEY_MAP[p.key] };
          }
          return p;
        });
        
        // 중복 제거 (이미 사용자가 수동으로 2025-07-20을 추가했을 수도 있으므로)
        const uniquePerformances = [];
        const seenKeys = new Set();
        mappedPerformances.forEach(p => {
          if (!seenKeys.has(p.key)) {
            seenKeys.add(p.key);
            uniquePerformances.push(p);
          }
        });
        performances = uniquePerformances;

        // members.js에 하드코딩된 학생/직장인 및 2025 보정액을 파이어베이스 데이터에 병합
        const mergedMembers = (fbState.members || []).map(fbMember => {
          const codeMember = MEMBERS.find(m => m.id === fbMember.id);
          let newPerfs = { ...(fbMember.performances || {}) };
          
          if (needsPerfUpdate) {
            Object.keys(KEY_MAP).forEach(oldKey => {
              if (newPerfs[oldKey]) {
                newPerfs[KEY_MAP[oldKey]] = newPerfs[oldKey];
                delete newPerfs[oldKey];
              }
            });
          }

          let updatedMember = { ...fbMember, performances: newPerfs };

          if (codeMember) {
            return { 
              ...updatedMember, 
              type: codeMember.type || '직장인', 
              offset2025: codeMember.offset2025 || 0 
            };
          }
          return updatedMember;
        });

        dispatch({
          type: 'INIT',
          members: mergedMembers,
          transactions: transactions,
          performances: performances,
          performanceParticipants: fbState.performanceParticipants || {},
          memberAvailability: fbState.memberAvailability || {},
          bandMembers: fbState.bandMembers ?? storage.getBandMembers() ?? {},
          bandMemberAvailability: fbState.bandMemberAvailability ?? storage.getBandMemberAvailability() ?? {},
          practiceStatuses: fbState.practiceStatuses ?? storage.getPracticeStatuses() ?? {},
          confirmedRehearsals: fbState.confirmedRehearsals ?? storage.getConfirmedRehearsals() ?? {},
          lastUpdated: (updatedCount > 0 || needsPerfUpdate) ? new Date().toISOString() : (fbState.lastUpdated || new Date().toISOString())
        });
      } else {
        // Firebase가 비어있다면 localStorage에서 마이그레이션 (1회성)
        const savedTxs = storage.getTransactions();
        const savedMembers = storage.getMembers();
        const savedPerformances = storage.getPerformances();
        const savedPerformanceParticipants = storage.getPerformanceParticipants();
        const savedMemberAvailability = storage.getMemberAvailability();
        const savedBandMembers = storage.getBandMembers();
        const savedBandMemberAvailability = storage.getBandMemberAvailability();
        const savedPracticeStatuses = storage.getPracticeStatuses();
        const savedConfirmedRehearsals = storage.getConfirmedRehearsals();
        const savedLastUpdated = storage.getLastUpdated();

        const members = (savedMembers || MEMBERS).map(m => {
          const codeMember = MEMBERS.find(cm => cm.id === m.id);
          return {
            ...m, 
            status: m.status || 'active', 
            performances: m.performances || {},
            type: (codeMember ? codeMember.type : m.type) || '직장인',
            offset2025: (codeMember ? codeMember.offset2025 : m.offset2025) || 0
          };
        });
        
        const migState = {
          members,
          transactions: savedTxs || SAMPLE_TRANSACTIONS,
          performances: savedPerformances || [],
          performanceParticipants: savedPerformanceParticipants || {},
          memberAvailability: savedMemberAvailability || {},
          bandMembers: savedBandMembers || {},
          bandMemberAvailability: savedBandMemberAvailability || {},
          practiceStatuses: savedPracticeStatuses || {},
          confirmedRehearsals: savedConfirmedRehearsals || {},
          lastUpdated: savedLastUpdated || new Date().toISOString(),
        };

        dispatch({ type: 'INIT', ...migState });
        
        // Firebase에 첫 동기화
        await firebaseStorage.saveData(migState);
      }
    }
    loadInitialData();
  }, []);

  // 상태가 바뀔 때마다 Firebase 및 LocalStorage에 동기화 (단, 로딩이 끝난 후부터)
  useEffect(() => {
    if (!state.loading) {
      const syncState = {
        members: state.members,
        transactions: state.transactions,
        performances: state.performances,
        performanceParticipants: state.performanceParticipants,
        memberAvailability: state.memberAvailability,
        bandMembers: state.bandMembers,
        bandMemberAvailability: state.bandMemberAvailability,
        practiceStatuses: state.practiceStatuses,
        confirmedRehearsals: state.confirmedRehearsals,
        lastUpdated: state.lastUpdated
      };
      
      // 1. Firebase 동기화 (안전하게 직렬화하여 undefined 필드 제거)
      try {
        const sanitized = JSON.parse(JSON.stringify(syncState));
        firebaseStorage.saveData(sanitized);
      } catch (e) {
        console.error("Firebase Sync Error:", e);
      }

      // 2. LocalStorage 동기화 (항상 최신 로컬 백업 상태 유지)
      try {
        storage.setTransactions(state.transactions);
        storage.setMembers(state.members);
        storage.setPerformances(state.performances);
        storage.setPerformanceParticipants(state.performanceParticipants);
        storage.setMemberAvailability(state.memberAvailability);
        storage.setBandMembers(state.bandMembers);
        storage.setBandMemberAvailability(state.bandMemberAvailability);
        storage.setPracticeStatuses(state.practiceStatuses);
        storage.setConfirmedRehearsals(state.confirmedRehearsals);
        storage.setLastUpdated(state.lastUpdated);
        
        // 사용자가 명시한 키 'transactions'도 추가 동기화 보장
        localStorage.setItem('transactions', JSON.stringify(state.transactions));
      } catch (e) {
        console.error("LocalStorage Sync Error:", e);
      }
    }
  }, [state.members, state.transactions, state.performances, state.performanceParticipants, state.memberAvailability, state.bandMembers, state.bandMemberAvailability, state.practiceStatuses, state.confirmedRehearsals, state.lastUpdated, state.loading]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
