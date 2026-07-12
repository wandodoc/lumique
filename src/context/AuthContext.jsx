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

  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('lumique_authenticated') === 'true');
  const [showLoginModal, setShowLoginModal] = useState(false);

  const login = useCallback((password) => {
    if (password === getSavedPassword()) {
      setIsAdmin(true);
      localStorage.setItem('lumique_authenticated', 'true');
      setShowLoginModal(false);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setIsAdmin(false);
    localStorage.removeItem('lumique_authenticated');
  }, []);

  const requestLogin = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  const changePassword = useCallback((oldPassword, newPassword) => {
    if (oldPassword === getSavedPassword()) {
      localStorage.setItem('lumique_pwd', newPassword);
      return true;
    }
    return false;
  }, []);

  return (
    <AuthContext.Provider value={{ isAdmin, login, logout, requestLogin, showLoginModal, setShowLoginModal, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
