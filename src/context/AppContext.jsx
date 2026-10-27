import { createContext, useContext, useReducer, useEffect, useMemo, useRef, useState } from 'react';
import { MEMBERS } from '../data/members';
import { firebaseStorage } from '../utils/firebaseStorage';
import { derivePerformances } from '../utils/performances';

const AppContext = createContext(null);

const SUPPORT_ACCOUNT = '토스뱅크 1001-7629-3105 강맥';

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

const normalizePerformanceBandMembers = value => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const normalizePerformanceSetlists = value => (
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
  performanceBandMembers: {},
  performanceSetlists: {},
  shows: [],
  songs: [],
  activities: [],
  lastUpdated: null,
  loading: true,
  loadError: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_FAILED':
      // Firestore 읽기 실패. 로컬 데이터로 덮어쓰지 않도록 동기화를 잠근다.
      return { ...state, loading: false, loadError: true };
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
        performanceBandMembers: normalizePerformanceBandMembers(action.performanceBandMembers),
        performanceSetlists: normalizePerformanceSetlists(action.performanceSetlists),
        shows: Array.isArray(action.shows) ? action.shows : [],
        songs: Array.isArray(action.songs) ? action.songs : [],
        activities: Array.isArray(action.activities) ? action.activities : [],
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
    case 'SET_SHOWS': {
      return {
        ...state,
        shows: Array.isArray(action.shows) ? action.shows : [],
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'SET_SONGS': {
      return {
        ...state,
        songs: Array.isArray(action.songs) ? action.songs : [],
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'SET_ACTIVITIES': {
      return {
        ...state,
        activities: Array.isArray(action.activities) ? action.activities : [],
        lastUpdated: new Date().toISOString(),
      };
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

      const performanceBandMembers = normalizePerformanceBandMembers(state.performanceBandMembers);
      const nextPerformanceBandMembers = Object.fromEntries(
        Object.entries(performanceBandMembers).map(([perfKey, ids]) => [
          perfKey,
          (Array.isArray(ids) ? ids : []).filter(id => id !== action.bandMemberId),
        ])
      );

      return {
        ...state,
        bandMembers,
        bandMemberAvailability,
        performanceBandMembers: nextPerformanceBandMembers,
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'TOGGLE_PERFORMANCE_BAND_MEMBER': {
      const { perfKey, bandMemberId } = action;
      if (!perfKey || !bandMemberId) return state;

      const performanceBandMembers = normalizePerformanceBandMembers(state.performanceBandMembers);
      const current = Array.isArray(performanceBandMembers[perfKey]) ? performanceBandMembers[perfKey] : [];
      const nextList = current.includes(bandMemberId)
        ? current.filter(id => id !== bandMemberId)
        : [...current, bandMemberId];

      return {
        ...state,
        performanceBandMembers: { ...performanceBandMembers, [perfKey]: nextList },
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'TOGGLE_PERFORMANCE_SETLIST_SONG': {
      const { perfKey, songId } = action;
      if (!perfKey || !songId) return state;

      const performanceSetlists = normalizePerformanceSetlists(state.performanceSetlists);
      const current = Array.isArray(performanceSetlists[perfKey]) ? performanceSetlists[perfKey] : [];
      const nextList = current.includes(songId)
        ? current.filter(id => id !== songId)
        : [...current, songId];

      return {
        ...state,
        performanceSetlists: { ...performanceSetlists, [perfKey]: nextList },
        lastUpdated: new Date().toISOString(),
      };
    }
    case 'REMOVE_SONG_FROM_SETLISTS': {
      const performanceSetlists = normalizePerformanceSetlists(state.performanceSetlists);
      const nextPerformanceSetlists = Object.fromEntries(
        Object.entries(performanceSetlists).map(([perfKey, ids]) => [
          perfKey,
          (Array.isArray(ids) ? ids : []).filter(id => id !== action.songId),
        ])
      );

      return {
        ...state,
        performanceSetlists: nextPerformanceSetlists,
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
      
      // undefined = 읽기 실패. 아래의 "문서 없음 → 초기 상태 생성" 분기로 절대 내려가면 안 된다.
      // (읽기 실패를 '비어 있음'으로 취급해 서버를 덮어쓴 것이 2026-10-24 공연 데이터 유실 원인)
      if (fbState === undefined) {
        console.error('Firestore 읽기에 실패했습니다. 로컬 데이터로 덮어쓰지 않고 동기화를 중단합니다.');
        dispatch({ type: 'LOAD_FAILED' });
        return;
      }

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

        // 공연 데이터 단일화: shows(공연 관리/티켓) 를 공연의 단일 소스로 삼는다.
        // 기존에 performances에만 있던(=매칭되는 show가 없는) 날짜는 1회성으로
        // 최소 정보만 채운 show를 만들어 backfill 한다 (기존 회비/참여 데이터 보존).
        let shows = fbState.shows || [];
        const existingShowDates = new Set(shows.map(s => s.date));
        const backfillShows = performances
          .filter(p => p.key && !existingShowDates.has(p.key))
          .map(p => ({
            id: `show-legacy-${p.key}`,
            title: p.label || p.key,
            date: p.key,
            time: '19:00',
            location: '정보 입력 필요',
            price: 5000,
            description: '',
            status: '종료',
            imageUrl: '',
            customSections: [],
            supportAccount: SUPPORT_ACCOUNT,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }));
        if (backfillShows.length > 0) {
          shows = [...shows, ...backfillShows];
          // 전체 목록 교체가 아니라 항목 단위 추가. 다른 기기가 방금 저장한 공연을 덮어쓰지 않도록.
          for (const s of backfillShows) await firebaseStorage.upsertShow(s);
        }

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

        // 공연 참여 여부 단일화: performanceParticipants[showId]가 아직 한 번도 지정되지
        // 않은 공연은, 과거 회원별 참여 플래그(member.performances)로 1회성 백필한다.
        // (공연 관리 쪽은 performanceParticipants만 보므로, 안 해주면 회원 관리에만
        // 보이고 공연 관리에는 안 보이는 불일치가 생긴다.)
        const performanceParticipants = { ...(fbState.performanceParticipants || {}) };
        derivePerformances(shows).forEach(p => {
          if (p.showId && !(p.showId in performanceParticipants)) {
            performanceParticipants[p.showId] = mergedMembers
              .filter(m => m.performances?.[p.key] === '참여')
              .map(m => m.id);
          }
        });

        dispatch({
          type: 'INIT',
          members: mergedMembers,
          transactions: transactions,
          performances: performances,
          performanceParticipants,
          memberAvailability: fbState.memberAvailability || {},
          bandMembers: fbState.bandMembers ?? {},
          bandMemberAvailability: fbState.bandMemberAvailability ?? {},
          practiceStatuses: fbState.practiceStatuses ?? {},
          confirmedRehearsals: fbState.confirmedRehearsals ?? {},
          performanceBandMembers: fbState.performanceBandMembers ?? {},
          performanceSetlists: fbState.performanceSetlists ?? {},
          shows,
          songs: fbState.songs ?? [],
          activities: fbState.activities ?? [],
          lastUpdated: (updatedCount > 0 || needsPerfUpdate || backfillShows.length > 0) ? new Date().toISOString() : (fbState.lastUpdated || new Date().toISOString())
        });
      } else {
        // 서버 문서가 아직 없는 완전히 새 환경. localStorage에서 가져오지 않고(로컬은 저장소가 아니다)
        // 코드에 정의된 기본 회원 목록만으로 빈 상태를 만들어 서버에 한 번 기록한다.
        const members = MEMBERS.map(m => ({
          ...m,
          status: m.status || 'active',
          performances: m.performances || {},
          type: m.type || '직장인',
          offset2025: m.offset2025 || 0,
        }));
        const initialState = {
          members,
          transactions: [],
          performances: [],
          performanceParticipants: {},
          memberAvailability: {},
          bandMembers: {},
          bandMemberAvailability: {},
          practiceStatuses: {},
          confirmedRehearsals: {},
          performanceBandMembers: {},
          performanceSetlists: {},
          shows: [],
          songs: [],
          activities: [],
          lastUpdated: new Date().toISOString(),
        };
        dispatch({ type: 'INIT', ...initialState });
        await firebaseStorage.saveData(initialState);
      }
    }
    loadInitialData();
  }, []);

  // 상태가 바뀔 때마다 Firestore에 저장 (단, 로딩이 끝난 후부터). 로컬 저장소에는 아무것도 남기지 않는다.
  // 저장 실패는 숨기지 않고 배너로 알리며, "다시 저장"으로 현재 상태를 재전송할 수 있다.
  const [saveFailed, setSaveFailed] = useState(false);
  const [saveRetryTick, setSaveRetryTick] = useState(0);
  const saveSeqRef = useRef(0);
  useEffect(() => {
    if (!state.loading && !state.loadError) {
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
        performanceBandMembers: state.performanceBandMembers,
        performanceSetlists: state.performanceSetlists,
        songs: state.songs,
        activities: state.activities,
        lastUpdated: state.lastUpdated
      };
      
      const seq = ++saveSeqRef.current;
      (async () => {
        let ok = false;
        try {
          ok = await firebaseStorage.saveData(JSON.parse(JSON.stringify(syncState)));
        } catch (e) {
          console.error("Firebase Sync Error:", e);
        }
        // 더 최신 저장이 이미 진행 중이면 이 결과는 무시한다.
        if (seq === saveSeqRef.current) setSaveFailed(!ok);
      })();
    }
  }, [state.members, state.transactions, state.performances, state.performanceParticipants, state.memberAvailability, state.bandMembers, state.bandMemberAvailability, state.practiceStatuses, state.confirmedRehearsals, state.performanceBandMembers, state.performanceSetlists, state.songs, state.activities, state.lastUpdated, state.loading, state.loadError, saveRetryTick]);

  const derivedPerformances = useMemo(() => derivePerformances(state.shows), [state.shows]);
  const providerState = useMemo(
    () => ({ ...state, performances: derivedPerformances }),
    [state, derivedPerformances]
  );

  return (
    <AppContext.Provider value={{ state: providerState, dispatch }}>
      {state.loadError && (
        <div style={{ background: '#b91c1c', color: '#fff', padding: '10px 16px', textAlign: 'center', fontWeight: 600 }}>
          서버(Firestore)에서 데이터를 불러오지 못했습니다. 데이터 보호를 위해 저장이 중단되었습니다. 네트워크를 확인한 뒤 페이지를 새로고침해 주세요.
        </div>
      )}
      {saveFailed && !state.loadError && (
        <div style={{ background: '#b45309', color: '#fff', padding: '10px 16px', textAlign: 'center', fontWeight: 600, display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>마지막 변경이 서버에 저장되지 않았습니다. 이 화면을 닫으면 변경 내용이 사라집니다. 네트워크를 확인한 뒤 다시 저장해 주세요.</span>
          <button type="button" onClick={() => setSaveRetryTick(t => t + 1)}
            style={{ background: '#fff', color: '#b45309', border: 0, borderRadius: 6, padding: '6px 12px', fontWeight: 700, cursor: 'pointer' }}>
            다시 저장
          </button>
        </div>
      )}
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
