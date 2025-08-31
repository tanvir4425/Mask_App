// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) setUser(JSON.parse(storedUser));
    } catch (err) {
      console.error('Auth load error:', err);
      localStorage.removeItem('user');
    }
  }, []);

  // login: either called with a user object (from login page)
  const login = (userObj) => {
    if (!userObj) return;
    // store token if present
    if (userObj.token) {
      localStorage.setItem('authToken', userObj.token);
    }
    // store user object
    const u = {
      _id: userObj._id || userObj.id || userObj._id,
      pseudonym: userObj.pseudonym || userObj.name || '',
      avatarURL: userObj.avatarURL || userObj.avatar || '',
      token: userObj.token || null
    };
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
  };

  const updateProfile = (updates) => {
    setUser(prev => {
      const updated = { ...prev, ...updates };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
