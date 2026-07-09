import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDONFr_RWBAFXa7XzuKNMDoaOMPB0h3rok",
  authDomain: "lumique-3a380.firebaseapp.com",
  projectId: "lumique-3a380",
  storageBucket: "lumique-3a380.firebasestorage.app",
  messagingSenderId: "853952641864",
  appId: "1:853952641864:web:4cade3cf0b16b0bd5e917d",
  measurementId: "G-X641SK8Y8M"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
