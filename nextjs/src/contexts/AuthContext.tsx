'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, setOnUnauthorized } from '@/lib/api';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isSessionActiveRef = React.useRef<boolean>(false);

  const initAuth = async () => {
    const sessionId = typeof window !== 'undefined'
      ? localStorage.getItem('relay_session_id')
      : null;
    if (!sessionId) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await authApi.getMe();
      if (res?.user) {
        isSessionActiveRef.current = true;
        setUser(res.user);
      } else {
        setUser(null);
      }
    } catch {
      isSessionActiveRef.current = false;
      setUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('relay_session_id');
        localStorage.removeItem('relay_user');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOnUnauthorized(() => {
      // Only set session expired if user was genuinely in an active session
      if (isSessionActiveRef.current) {
        isSessionActiveRef.current = false;
        setUser(null);
        setError('Session expired. Please sign in again.');
      } else {
        setUser(null);
      }
    });
    initAuth();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.login(username, password);
      isSessionActiveRef.current = true;
      setUser(res.user);
      return true;
    } catch (err: any) {
      isSessionActiveRef.current = false;
      setError(err.response?.data?.detail || err.message || 'Authentication failed. Please check your credentials.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    isSessionActiveRef.current = false;
    setError(null);
    setLoading(true);
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        isAuthenticated: !!user,
        login,
        logout,
        clearError: () => setError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};


export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
