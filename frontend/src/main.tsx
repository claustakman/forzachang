import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Layout from './components/Layout';
import Matches from './pages/Matches';
import Stats from './pages/Stats';
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
            <Route path="kalender" element={<Matches />} />
            <Route path="statistik" element={<Stats />} />
            <Route path="bødekasse" element={<Fines />} />
            <Route path="admin" element={<Admin />} />
            <Route path="profil" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
