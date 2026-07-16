import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

const DOC_REF = doc(db, "club_ledger", "main_state");
const CONCERTS_REF = doc(db, "club_ledger", "concerts_state");
const ORDERS_REF = doc(db, "club_ledger", "orders_state");

export const firebaseStorage = {
  loadData: async () => {
    try {
      const snap = await getDoc(DOC_REF);
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (e) {
      console.error("Firebase Load Error:", e);
      return null;
    }
  },
  saveData: async (state) => {
    try {
      // JSON 직렬화를 통해 undefined 필드를 제거하여 Firestore의 직렬화 오류를 완벽 방지합니다.
      const sanitized = JSON.parse(JSON.stringify(state));
      await setDoc(DOC_REF, sanitized);
    } catch (e) {
      console.error("Firebase Save Error:", e);
    }
  },
  loadConcerts: async () => {
    try {
      const snap = await getDoc(CONCERTS_REF);
      if (snap.exists()) return snap.data().shows || [];
      return [];
    } catch (e) {
      console.error("Firebase Load Concerts Error:", e);
      return [];
    }
  },
  saveConcerts: async (shows) => {
    try {
      const sanitized = JSON.parse(JSON.stringify({ shows }));
      await setDoc(CONCERTS_REF, sanitized);
    } catch (e) {
      console.error("Firebase Save Concerts Error:", e);
    }
  },
  loadOrders: async () => {
    try {
      const snap = await getDoc(ORDERS_REF);
      if (snap.exists()) return snap.data().orders || [];
      return [];
    } catch (e) {
      console.error("Firebase Load Orders Error:", e);
      return [];
    }
  },
  saveOrders: async (orders) => {
    try {
      const sanitized = JSON.parse(JSON.stringify({ orders }));
      await setDoc(ORDERS_REF, sanitized);
    } catch (e) {
      console.error("Firebase Save Orders Error:", e);
    }
  }
};
