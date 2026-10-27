import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { firebaseStorage } from '../utils/firebaseStorage';

const AuthContext = createContext(null);

// 관리자 비밀번호는 서버(club_ledger/settings.adminPasswordHash)에 SHA-256 해시로 저장한다.
// 예전에는 기기별 localStorage('lumique_pwd')에 저장돼 기기마다 비밀번호가 달랐고,
// 브라우저 데이터를 지우면 기본값으로 되돌아갔다. 로그인 세션 플래그만 이 기기에 남긴다.
const DEFAULT_PASSWORD = 'lumique2026';
const LEGACY_LS_PWD = 'lumique_pwd';
const SESSION_FLAG = 'isAdminAuthenticated';

async function sha256(text) {
  if (!globalThis.crypto?.subtle) throw new Error('이 브라우저에서는 보안 해시를 지원하지 않습니다. (HTTPS 필요)');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(() => {
    try { return localStorage.getItem(SESSION_FLAG) === 'true'; } catch { return false; }
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  // 서버 해시를 한 번 읽어 두되, 로그인 시점에 항상 최신값을 다시 읽는다.
  const hashRef = useRef(undefined);

  // 서버에 저장된 해시를 돌려준다.
  //  - 서버에 없으면: 이 기기에 남은 예전 비밀번호(없으면 기본값)의 해시를 서버에 심는다.
  //  - 서버가 기본값 해시인데 이 기기에 기본값과 다른 예전 비밀번호가 남아 있으면: 관리자가 바꿔 둔 비밀번호가
  //    우선이므로 그 해시로 서버를 갱신한다. (배포 직후 일반 방문자가 먼저 기본값을 심는 경우를 보정)
  const loadServerHash = useCallback(async () => {
    const settings = await firebaseStorage.loadSettings();
    if (settings === undefined) return undefined; // 읽기 실패
    let legacy = null;
    try { legacy = localStorage.getItem(LEGACY_LS_PWD); } catch { /* ignore */ }
    const serverHash = settings.adminPasswordHash || null;
    const defaultHash = await sha256(DEFAULT_PASSWORD);
    const needsSeed = !serverHash;
    const legacyOverrides = Boolean(serverHash) && serverHash === defaultHash && legacy && legacy !== DEFAULT_PASSWORD;
    if (needsSeed || legacyOverrides) {
      const hash = await sha256(legacy || DEFAULT_PASSWORD);
      const ok = await firebaseStorage.saveSettings({ adminPasswordHash: hash });
      if (!ok) return undefined;
      hashRef.current = hash;
      return hash;
    }
    hashRef.current = serverHash;
    return serverHash;
  }, []);

  useEffect(() => {
    loadServerHash().then(hash => {
      if (hash) { try { localStorage.removeItem(LEGACY_LS_PWD); } catch { /* ignore */ } }
    });
  }, [loadServerHash]);

  const verify = useCallback(async (password) => {
    const serverHash = await loadServerHash();
    if (!serverHash) throw new Error('서버에서 비밀번호 정보를 읽지 못했습니다. 네트워크를 확인해 주세요.');
    return (await sha256(password)) === serverHash;
  }, [loadServerHash]);

  // Promise<boolean>. 서버에 접근할 수 없으면 throw.
  const login = useCallback(async (password) => {
    const ok = await verify(password);
    if (!ok) return false;
    setIsAdmin(true);
    try { localStorage.setItem(SESSION_FLAG, 'true'); } catch { /* ignore */ }
    setShowLoginModal(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
    return true;
  }, [pendingAction, verify]);

  const logout = useCallback(() => {
    setIsAdmin(false);
    try { localStorage.removeItem(SESSION_FLAG); } catch { /* ignore */ }
  }, []);

  const runWithAdmin = useCallback((action) => {
    let authed = false;
    try { authed = localStorage.getItem(SESSION_FLAG) === 'true'; } catch { /* ignore */ }
    if (authed) {
      setIsAdmin(true); // 동기화 보장
      action();
    } else {
      setPendingAction(() => action);
      setShowLoginModal(true);
    }
  }, []);

  // Promise<boolean>. 모든 기기에 즉시 적용된다 (서버 저장).
  const changePassword = useCallback(async (oldPassword, newPassword) => {
    const ok = await verify(oldPassword);
    if (!ok) return false;
    const saved = await firebaseStorage.saveSettings({ adminPasswordHash: await sha256(newPassword) });
    if (!saved) throw new Error('서버에 새 비밀번호를 저장하지 못했습니다. 네트워크를 확인해 주세요.');
    hashRef.current = undefined;
    return true;
  }, [verify]);

  const closeLoginModal = useCallback(() => {
    setShowLoginModal(false);
    setPendingAction(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      isAdmin,
      login,
      logout,
      runWithAdmin,
      showLoginModal,
      setShowLoginModal: closeLoginModal,
      changePassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
