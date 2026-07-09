import { createContext, useContext, useReducer, useEffect } from 'react';
import { MEMBERS } from '../data/members';
import { SAMPLE_TRANSACTIONS } from '../data/transactions';
import { storage } from '../utils/storage';
import { firebaseStorage } from '../utils/firebaseStorage';

const AppContext = createContext(null);

// 기본 공연 목록 (YYYY-MM 형식)
const DEFAULT_PERFORMANCES = [
  { key: '2025-07', label: '2025년 7월' },
  { key: '2025-12', label: '2025년 12월' },
  { key: '2026-07', label: '2026년 7월' },
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
        if (updatesMap.has(t.id)) return { ...t, ...updatesMap.get(t.id) };
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
        dispatch({
          type: 'INIT',
          members: fbState.members || [],
          transactions: fbState.transactions || [],
          performances: fbState.performances || DEFAULT_PERFORMANCES,
          lastUpdated: fbState.lastUpdated || new Date().toISOString()
        });
      } else {
        // Firebase가 비어있다면 localStorage에서 마이그레이션 (1회성)
        const savedTxs = storage.getTransactions();
        const savedMembers = storage.getMembers();
        const savedPerformances = storage.getPerformances();
        const savedLastUpdated = storage.getLastUpdated();

        const members = (savedMembers || MEMBERS).map(m => ({
          ...m, status: m.status || 'active', performances: m.performances || {},
        }));
        
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
