import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

// 초기 비밀번호 세팅 및 조회
const getSavedPassword = () => {
  let pwd = localStorage.getItem('lumique_pwd');
  if (!pwd) {
    pwd = 'lumique2026';
    localStorage.setItem('lumique_pwd', pwd);
  }
  return pwd;
};

export function AuthProvider({ children }) {
  // 앱 구동 시 초기 비밀번호 설정 보장
  getSavedPassword();

  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('isAdminAuthenticated') === 'true');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const login = useCallback((password) => {
    if (password === getSavedPassword()) {
      setIsAdmin(true);
      localStorage.setItem('isAdminAuthenticated', 'true');
      setShowLoginModal(false);
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
      return true;
    }
    return false;
  }, [pendingAction]);

  const logout = useCallback(() => {
    setIsAdmin(false);
    localStorage.removeItem('isAdminAuthenticated');
  }, []);

  const runWithAdmin = useCallback((action) => {
    if (localStorage.getItem('isAdminAuthenticated') === 'true') {
      setIsAdmin(true); // 동기화 보장
      action();
    } else {
      setPendingAction(() => action);
      setShowLoginModal(true);
    }
  }, []);

  const changePassword = useCallback((oldPassword, newPassword) => {
    if (oldPassword === getSavedPassword()) {
      localStorage.setItem('lumique_pwd', newPassword);
      return true;
    }
    return false;
  }, []);

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
