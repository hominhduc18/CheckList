import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);
const TOKEN_KEY = 'cl_token';
const USER_KEY = 'cl_user';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  }, [user]);

  const value = useMemo(
    () => ({
      token,
      user,
      isAdmin: user?.role === 'admin',
      isLoggedIn: !!token && !!user,
      loginSuccess(data) {
        setToken(data.token);
        setUser(data.user);
      },
      logout() {
        setToken('');
        setUser(null);
      },
    }),
    [token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
