import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

const DOC_REF = doc(db, "club_ledger", "main_state");

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
      // state should contain members, transactions, performances, lastUpdated
      await setDoc(DOC_REF, state, { merge: true });
    } catch (e) {
      console.error("Firebase Save Error:", e);
    }
  }
};
