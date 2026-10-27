import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

const DOC_REF = doc(db, "club_ledger", "main_state");

// 읽기 결과 구분 규칙 (2026-10-24 공연 데이터 유실 사고 이후 도입):
//  - object  : 정상 데이터
//  - null    : 문서가 아직 존재하지 않음 (진짜 비어 있음)
//  - undefined (loadData) / null (loadConcerts, loadOrders) : 읽기 실패 (네트워크·권한·할당량 초과 등)
// 읽기 실패를 "비어 있음"으로 취급해 로컬 상태로 Firestore를 덮어쓰면 서버 데이터가 통째로 사라진다.
// 호출자는 반드시 실패를 별도로 처리해야 하며, 아래 저장 함수들도 빈 배열 덮어쓰기를 한 번 더 막는다.

async function readMainDoc() {
  const snap = await getDoc(DOC_REF);
  return snap.exists() ? snap.data() : null;
}

// 서버에 이미 데이터가 있는 컬렉션 필드를 빈 배열로 덮어쓰려는 시도를 차단한다.
// (정상적인 "마지막 항목 삭제"는 UI에서 일어나지 않고, 유실 사고의 공통 패턴이 바로 이 쓰기였다)
const PROTECTED_LIST_FIELDS = ['shows', 'orders', 'transactions', 'members'];
async function stripEmptyOverwrites(payload) {
  const emptyFields = PROTECTED_LIST_FIELDS.filter(k => Array.isArray(payload[k]) && payload[k].length === 0);
  if (emptyFields.length === 0) return payload;
  const current = await readMainDoc(); // 실패 시 throw → 호출자에서 저장 실패로 처리
  const next = { ...payload };
  for (const k of emptyFields) {
    if (Array.isArray(current?.[k]) && current[k].length > 0) {
      console.error(`[firebaseStorage] '${k}' 필드를 빈 배열로 덮어쓰려는 시도를 차단했습니다 (서버에 ${current[k].length}건 존재).`);
      delete next[k];
    }
  }
  return next;
}

export const firebaseStorage = {
  loadData: async () => {
    try {
      return await readMainDoc();
    } catch (e) {
      console.error("Firebase Load Error:", e);
      return undefined;
    }
  },
  saveData: async (state) => {
    try {
      const sanitized = await stripEmptyOverwrites(JSON.parse(JSON.stringify(state)));
      if (Object.keys(sanitized).length === 0) return false;
      await setDoc(DOC_REF, sanitized, { merge: true });
      return true;
    } catch (e) {
      console.error("Firebase Save Error:", e);
      return false;
    }
  },
  loadConcerts: async () => {
    try {
      const data = await readMainDoc();
      return Array.isArray(data?.shows) ? data.shows : [];
    } catch (e) {
      console.error("Firebase Load Concerts Error:", e);
      return null;
    }
  },
  saveConcerts: async (shows) => {
    try {
      if (!Array.isArray(shows)) return false;
      const sanitized = await stripEmptyOverwrites(JSON.parse(JSON.stringify({ shows })));
      if (!('shows' in sanitized)) return false;
      await setDoc(DOC_REF, sanitized, { merge: true });
      return true;
    } catch (e) {
      console.error("Firebase Save Concerts Error:", e);
      return false;
    }
  },
  loadOrders: async () => {
    try {
      const data = await readMainDoc();
      return Array.isArray(data?.orders) ? data.orders : [];
    } catch (e) {
      console.error("Firebase Load Orders Error:", e);
      return null;
    }
  },
  saveOrders: async (orders) => {
    try {
      if (!Array.isArray(orders)) return false;
      const sanitized = await stripEmptyOverwrites(JSON.parse(JSON.stringify({ orders })));
      if (!('orders' in sanitized)) return false;
      await setDoc(DOC_REF, sanitized, { merge: true });
      return true;
    } catch (e) {
      console.error("Firebase Save Orders Error:", e);
      return false;
    }
  }
};
