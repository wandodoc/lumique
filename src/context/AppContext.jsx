import { createContext, useContext, useReducer, useEffect } from 'react';
import { MEMBERS } from '../data/members';
import { SAMPLE_TRANSACTIONS } from '../data/transactions';
import { storage } from '../utils/storage';
import { firebaseStorage } from '../utils/firebaseStorage';

const AppContext = createContext(null);

// 기본 공연 목록 (YYYY-MM-DD 형식)
const DEFAULT_PERFORMANCES = [
  { key: '2025-07-20', label: '2025년 7월 20일' },
  { key: '2025-12-28', label: '2025년 12월 28일' },
  { key: '2026-07-11', label: '2026년 7월 11일' },
];

const initialState = {
  members: [],
  transactions: [],
  performances: DEFAULT_PERFORMANCES, // 공연 목록 (동적 관리)
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

        let performances = fbState.performances || DEFAULT_PERFORMANCES;
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
          lastUpdated: (updatedCount > 0 || needsPerfUpdate) ? new Date().toISOString() : (fbState.lastUpdated || new Date().toISOString())
        });
      } else {
        // Firebase가 비어있다면 localStorage에서 마이그레이션 (1회성)
        const savedTxs = storage.getTransactions();
        const savedMembers = storage.getMembers();
        const savedPerformances = storage.getPerformances();
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
          performances: savedPerformances || DEFAULT_PERFORMANCES,
          lastUpdated: savedLastUpdated || new Date().toISOString(),
        };

        dispatch({ type: 'INIT', ...migState });
        
        // Firebase에 첫 동기화
        await firebaseStorage.saveData(migState);
      }
    }
    loadInitialData();
  }, []);

  // 상태가 바뀔 때마다 Firebase에 동기화 (단, 로딩이 끝난 후부터)
  useEffect(() => {
    if (!state.loading) {
      const syncState = {
        members: state.members,
        transactions: state.transactions,
        performances: state.performances,
        lastUpdated: state.lastUpdated
      };
      firebaseStorage.saveData(syncState);
    }
  }, [state.members, state.transactions, state.performances, state.lastUpdated, state.loading]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
