import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const getSavedPassword = () => localStorage.getItem('lumique_admin_pwd') || 'lumique2025';

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('lumique_is_admin') === 'true');
  const [showLoginModal, setShowLoginModal] = useState(false);

  const login = useCallback((password) => {
    if (password === getSavedPassword()) {
      setIsAdmin(true);
      localStorage.setItem('lumique_is_admin', 'true');
      setShowLoginModal(false);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setIsAdmin(false);
    localStorage.removeItem('lumique_is_admin');
  }, []);

  const requestLogin = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  const changePassword = useCallback((oldPassword, newPassword) => {
    if (oldPassword === getSavedPassword()) {
      localStorage.setItem('lumique_admin_pwd', newPassword);
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
