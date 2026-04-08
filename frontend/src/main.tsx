import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Layout from './components/Layout';
import Matches from './pages/Matches';
import Board from './pages/Board';
import Histoire from './pages/Historie';
import Fines from './pages/Fines';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import './index.css';

function Protected({ children }: { children: React.ReactNode }) {
  const { player } = useAuth();
  if (!player) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/" element={<Protected><Layout /></Protected>}>
            <Route index element={<Navigate to="/kalender" replace />} />
            <Route path="kampe" element={<Navigate to="/kalender" replace />} />
            <Route path="kalender" element={<Matches />} />
            <Route path="opslagstavle" element={<Board />} />
            <Route path="historie" element={<Histoire />} />
            {/* Redirects fra gamle ruter */}
            <Route path="statistik" element={<Navigate to="/historie" replace />} />
            <Route path="hæder" element={<Navigate to="/historie?tab=haeder" replace />} />
            <Route path="bødekasse" element={<Fines />} />
            <Route path="admin" element={<Admin />} />
            <Route path="profil" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);

// Register service worker (Phase 9: PWA + push)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(err => console.error('SW registration failed:', err));
  });
}
