// Authentication context - provides auth state and actions to the entire app
import React, { createContext, useState, useEffect } from 'react';
import apiClient from '../services/api';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // On first mount, if a token exists in localStorage, validate it and fetch the user
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      apiClient
        .get('/auth/me')
        .then((res) => {
          // Backend shape: { success, message, data: { user } }
          const userData = res.data?.data?.user ?? res.data?.user ?? null;
          setUser(userData);
          setToken(storedToken);
        })
        .catch(() => {
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  const login = (newToken, userData) => {
    // Write to localStorage FIRST so the axios interceptor picks it up
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const isSuperAdmin = user?.role === 'Super_Admin';
  const isOrgAdmin = user?.role === 'Org_Admin';
  // Fallback for legacy admin logic
  const isAdmin = isSuperAdmin || isOrgAdmin || user?.role === 'Admin';

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isSuperAdmin, isOrgAdmin, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};
