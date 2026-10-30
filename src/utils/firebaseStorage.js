import { doc, getDoc, runTransaction, setDoc } from "firebase/firestore";
import { db } from "../firebase";

const DOC_REF = doc(db, "club_ledger", "main_state");
const SETTINGS_REF = doc(db, "club_ledger", "settings");

// ─────────────────────────────────────────────────────────────────────────────
// 저장 원칙 (2026-10-24 공연 데이터 유실 사고 이후)
//  1. Firestore가 유일한 저장소다. localStorage는 데이터 저장소로 쓰지 않는다.
//  2. 읽기 실패("undefined"/"null")와 문서 없음("null"/"[]")을 구분한다. 읽기 실패를 "비어 있음"으로
//     취급해 로컬 상태로 덮어쓰면 서버 데이터가 통째로 사라진다.
//  3. 목록(shows, orders)은 화면이 들고 있던 배열을 그대로 쓰지 않는다. 반드시 서버의 최신 목록을
//     읽어 와서 항목 단위로 병합(upsert/patch/remove)한 뒤 쓴다. 오래 열어 둔 탭의 옛 목록이
//     다른 기기에서 저장한 내용을 덮어쓰는 사고(2026-10-27)를 막기 위해서다.
//  4. 서버에 데이터가 있는 목록 필드를 빈 배열로 덮어쓰는 쓰기는 저장 계층에서 한 번 더 막는다.
//
// 읽기 반환값
//  - loadData   : object | null(문서 없음) | undefined(읽기 실패)
//  - loadConcerts / loadOrders : array([] = 비어 있음) | null(읽기 실패)
//  - loadSettings : object({} = 문서 없음) | undefined(읽기 실패)
// ─────────────────────────────────────────────────────────────────────────────

async function readMainDoc() {
  const snap = await getDoc(DOC_REF);
  return snap.exists() ? snap.data() : null;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

// 서버에 이미 데이터가 있는 컬렉션 필드를 빈 배열로 덮어쓰려는 시도를 차단한다.
const PROTECTED_LIST_FIELDS = ['shows', 'orders', 'transactions', 'members'];
async function stripEmptyOverwrites(payload, current) {
  const emptyFields = PROTECTED_LIST_FIELDS.filter(k => Array.isArray(payload[k]) && payload[k].length === 0);
  if (emptyFields.length === 0) return payload;
  const server = current === undefined ? await readMainDoc() : current; // 실패 시 throw → 호출자에서 저장 실패로 처리
  const next = { ...payload };
  for (const k of emptyFields) {
    if (Array.isArray(server?.[k]) && server[k].length > 0) {
      console.error(`[firebaseStorage] '${k}' 필드를 빈 배열로 덮어쓰려는 시도를 차단했습니다 (서버에 ${server[k].length}건 존재).`);
      delete next[k];
    }
  }
  return next;
}

// 서버 최신 목록을 읽어 updater로 변환한 뒤 저장한다. 성공 시 저장된 목록, 실패 시 null.
// updater가 'missing'을 반환하면 저장하지 않고 'missing'을 돌려준다.
async function readModifyWriteList(field, updater, { allowEmpty = false } = {}) {
  try {
    return await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(DOC_REF);
      const current = snapshot.exists() ? snapshot.data() : null;
      const list = Array.isArray(current?.[field]) ? current[field] : [];
      const result = updater(list);
      if (result === 'missing') return 'missing';
      if (!Array.isArray(result)) return null;
      const next = clone(result);
      if (next.length === 0 && !allowEmpty && list.length > 0) {
        console.error(`[firebaseStorage] '${field}' 목록을 비우는 쓰기를 차단했습니다 (서버에 ${list.length}건 존재).`);
        return null;
      }
      transaction.set(DOC_REF, { [field]: next }, { merge: true });
      return next;
    });
  } catch (e) {
    console.error(`Firebase ${field} write error:`, e);
    return null;
  }
}

const sameId = (a, b) => String(a) === String(b);

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
      const sanitized = await stripEmptyOverwrites(clone(state));
      if (Object.keys(sanitized).length === 0) return false;
      await setDoc(DOC_REF, sanitized, { merge: true });
      return true;
    } catch (e) {
      console.error("Firebase Save Error:", e);
      return false;
    }
  },

  // ── 공연(shows) ──────────────────────────────────────────────────────────
  loadConcerts: async () => {
    try {
      const data = await readMainDoc();
      return Array.isArray(data?.shows) ? data.shows : [];
    } catch (e) {
      console.error("Firebase Load Concerts Error:", e);
      return null;
    }
  },
  // 공연 1건 추가/수정. 화면의 목록이 아니라 서버 최신 목록에 병합한다.
  upsertShow: (show) => readModifyWriteList('shows', list => (
    list.some(s => sameId(s.id, show.id)) ? list.map(s => (sameId(s.id, show.id) ? show : s)) : [...list, show]
  )),
  // 공연 1건에 부분 변경(좌석 배치, 가격 구간, 후원금 등)을 병합한다. 서버에 없으면 'missing'.
  patchShow: (id, patch) => readModifyWriteList('shows', list => {
    if (!list.some(s => sameId(s.id, id))) return 'missing';
    const updatedAt = new Date().toISOString();
    return list.map(s => (sameId(s.id, id) ? { ...s, ...patch, updatedAt } : s));
  }),
  // 공연 1건 영구 삭제 (마지막 공연을 지우는 것은 명시적 의도이므로 허용).
  removeShow: (id) => readModifyWriteList('shows', list => list.filter(s => !sameId(s.id, id)), { allowEmpty: true }),
  // Merge-only compatibility API; remove shows through removeShow so omitted entries are never dropped.
  saveConcerts: async (shows) => {
    if (!Array.isArray(shows)) return false;
    const result = await readModifyWriteList('shows', current => {
      const byId = new Map(current.map(show => [String(show.id), show]));
      shows.forEach(show => {
        if (show?.id != null) byId.set(String(show.id), show);
      });
      return [...byId.values()];
    });
    return Array.isArray(result);
  },

  // ── 예매(orders) ─────────────────────────────────────────────────────────
  loadOrders: async () => {
    try {
      const data = await readMainDoc();
      return Array.isArray(data?.orders) ? data.orders : [];
    } catch (e) {
      console.error("Firebase Load Orders Error:", e);
      return null;
    }
  },
  // 서버 최신 예매 목록에 updater(list => nextList)를 적용해 저장한다. 관리자가 페이지를 열어 둔 사이
  // 들어온 새 예매가 관리자의 저장으로 사라지지 않도록, 화면의 목록을 그대로 쓰지 않는다.
  patchOrders: (updater, options) => readModifyWriteList('orders', updater, options),
  appendOrder: (order) => readModifyWriteList('orders', list => [...list, order]),
  // 전체 목록 교체. 복구 도구 전용.
  saveOrders: async (orders) => {
    try {
      if (!Array.isArray(orders)) return false;
      const sanitized = await stripEmptyOverwrites(clone({ orders }));
      if (!('orders' in sanitized)) return false;
      await setDoc(DOC_REF, sanitized, { merge: true });
      return true;
    } catch (e) {
      console.error("Firebase Save Orders Error:", e);
      return false;
    }
  },

  // ── 설정(settings): 관리자 비밀번호 해시, 화면 컬럼 설정 등 기기와 무관하게 유지돼야 하는 값 ──
  loadSettings: async () => {
    try {
      const snap = await getDoc(SETTINGS_REF);
      return snap.exists() ? snap.data() : {};
    } catch (e) {
      console.error("Firebase Load Settings Error:", e);
      return undefined;
    }
  },
  saveSettings: async (patch) => {
    try {
      await setDoc(SETTINGS_REF, { ...clone(patch), updatedAt: new Date().toISOString() }, { merge: true });
      return true;
    } catch (e) {
      console.error("Firebase Save Settings Error:", e);
      return false;
    }
  },
};
