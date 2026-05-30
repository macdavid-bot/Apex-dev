import { useState, useCallback } from 'react';

const TOKEN_KEY = 'apex_token';

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);

  const checkAuth = useCallback(async () => {
    const token = getStoredToken();
    if (!token) { setChecked(true); setUser(null); return; }

    try {
      const res = await fetch('/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      }
    } catch {
      // API down — keep token but mark as unchecked
      setUser(null);
    }
    setChecked(true);
  }, []);

  const login = useCallback((data) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser({ username: data.username, role: data.role });
  }, []);

  const logout = useCallback(async () => {
    const token = getStoredToken();
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch {}
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  return { user, checked, checkAuth, login, logout };
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
