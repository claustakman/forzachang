import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import logo from '../assets/logo.svg';
import PwaBanner from './PwaBanner';

// Faste 4 ikoner i bundnavigationen (mobil)
const BOTTOM_FIXED = [
  { to: '/kalender',     label: 'Kalender',   icon: '📅' },
  { to: '/opslagstavle', label: 'Tavle',       icon: '📋' },
  { to: '/afstemning',   label: 'Afstemning',  icon: '🏆' },
] as const;

// Desktop — alle sider
const DESKTOP_NAV = [
  { to: '/kalender',     label: 'Kalender'    },
  { to: '/opslagstavle', label: 'Opslagstavle' },
  { to: '/afstemning',   label: 'Afstemning'  },
  { to: '/historie',     label: 'Historie'    },
  { to: '/bødekasse',    label: 'Bødekasse'   },
];

export default function Layout() {
  const { player, logout, isAdmin, isTrainer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mereOpen, setMereOpen] = useState(false);
  const [boardUnread, setBoardUnread] = useState(false);
  const mereRef = useRef<HTMLDivElement>(null);

  // Check for new board posts
  useEffect(() => {
    if (!player) return;
    api.getBoardPosts(1).then(data => {
      const lastRead = localStorage.getItem('cfc_board_last_read');
      if (!lastRead) { setBoardUnread(data.posts.length > 0 || data.pinned.length > 0); return; }
      const allPosts = [...data.pinned, ...data.posts];
      setBoardUnread(allPosts.some(p => p.created_at > lastRead));
    }).catch(() => {});
  }, [location.pathname]);

  // Clear unread when visiting board
  useEffect(() => {
    if (location.pathname === '/opslagstavle') {
      localStorage.setItem('cfc_board_last_read', new Date().toISOString());
      setBoardUnread(false);
    }
  }, [location.pathname]);

  // Close Mere-panel on navigation
  useEffect(() => { setMereOpen(false); }, [location.pathname]);

  // Close Mere-panel on outside click
  useEffect(() => {
    if (!mereOpen) return;
    function onDown(e: MouseEvent) {
      if (mereRef.current && !mereRef.current.contains(e.target as Node)) setMereOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [mereOpen]);

  const canAdmin = isAdmin || isTrainer;

  // Mere-panel items
  const moreItems = [
    { to: '/historie',  label: 'Historie', icon: '📊' },
    { to: '/bødekasse', label: 'Bøder',    icon: '💰' },
    ...(canAdmin ? [{ to: '/admin', label: 'Admin', icon: '⚙️' }] : []),
    { to: '/profil',    label: 'Profil',   icon: '👤' },
  ];

  // Desktop nav
  const desktopItems = [
    ...DESKTOP_NAV,
    ...(canAdmin ? [{ to: '/admin', label: 'Admin' }] : []),
  ];

  // Is user on a "Mere" page? (highlight Mere button)
  const moreRoutes = moreItems.map(i => i.to);
  const isOnMorePage = moreRoutes.some(r => location.pathname === r || location.pathname.startsWith(r + '/'));

  function doLogout() {
    logout();
    navigate('/login');
    setMereOpen(false);
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--cfc-bg-secondary)' }}>

      {/* ── Desktop header ── */}
      <header className="cfc-header" style={{
        background: '#fff',
        borderBottom: '1px solid var(--cfc-border)',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px', height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logo} alt="CFC logo" style={{ height: 34, width: 34, objectFit: 'contain', flexShrink: 0 }} />
          <span style={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 17, color: 'var(--cfc-text-primary)', flexShrink: 0 }}>
            <span className="cfc-name-full">Copenhagen Forza Chang</span>
            <span className="cfc-name-short">CFC</span>
          </span>

          <nav className="cfc-nav-desktop" style={{ display: 'flex', gap: 2, marginLeft: 20 }}>
            {desktopItems.map(({ to, label }) => (
              <NavLink key={to} to={to} style={({ isActive }) => ({
                padding: '6px 12px', borderRadius: 6, fontSize: 14, fontWeight: 500,
                color: isActive ? 'var(--green)' : 'var(--cfc-text-muted)',
                background: isActive ? 'var(--green-light)' : 'transparent',
                transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: 4,
              })}>
                {label}
                {to === '/opslagstavle' && boardUnread && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                )}
              </NavLink>
            ))}
          </nav>

          <div style={{ flex: 1 }} />

          {/* Brugerpille */}
          <div className="cfc-user-pill" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--cfc-bg-hover)', border: '1px solid var(--cfc-border)',
            borderRadius: 20, padding: '4px 12px 4px 6px',
          }}>
            <div style={{
              width: 26, height: 26, background: 'var(--green-light)', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'var(--green)', flexShrink: 0,
            }}>
              {player?.name?.charAt(0).toUpperCase()}
            </div>
            <NavLink to="/profil" style={{ fontSize: 13, color: 'var(--cfc-text-primary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {player?.name}
            </NavLink>
            <button onClick={doLogout} style={{
              background: 'none', border: 'none', color: 'var(--cfc-text-muted)', fontSize: 12,
              padding: '2px 0 2px 8px', borderLeft: '1px solid var(--cfc-border)', cursor: 'pointer',
            }}>Log ud</button>
          </div>
        </div>
      </header>

      {/* Sideindhold — paddingBottom = nav-højde + safe-area */}
      <main style={{ flex: 1, paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
        <Outlet />
      </main>

      {/* ── Bundnavigation (mobil) ── */}
      <nav ref={mereRef} className="cfc-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff',
        borderTop: '1px solid var(--cfc-border)',
        display: 'flex',
        zIndex: 50,
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -1px 8px rgba(0,0,0,0.06)',
      }}>
        {/* 3 faste ikoner */}
        {BOTTOM_FIXED.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} style={({ isActive }) => ({
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            paddingTop: 12, paddingBottom: 8, minHeight: 72,
            fontSize: 11, fontWeight: 500, gap: 3, textDecoration: 'none',
            color: isActive ? 'var(--green)' : 'var(--cfc-text-muted)',
            position: 'relative',
          })}>
            <span style={{ fontSize: 22, lineHeight: 1, position: 'relative' }}>
              {icon}
              {to === '/opslagstavle' && boardUnread && (
                <span style={{ position: 'absolute', top: 0, right: -3, width: 7, height: 7, borderRadius: '50%', background: 'var(--green)' }} />
              )}
            </span>
            <span>{label}</span>
          </NavLink>
        ))}

        {/* Mere-knap */}
        <button onClick={() => setMereOpen(o => !o)} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 12, paddingBottom: 8, minHeight: 72,
          fontSize: 11, fontWeight: 500, gap: 3,
          color: (mereOpen || isOnMorePage) ? 'var(--green)' : 'var(--cfc-text-muted)',
          background: 'none', border: 'none', cursor: 'pointer',
        }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>☰</span>
          <span>Mere</span>
        </button>

        {/* Mere-panel (slide-up) */}
        {mereOpen && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0,
            background: '#fff',
            borderTop: '1px solid var(--cfc-border)',
            borderRadius: '16px 16px 0 0',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
            paddingTop: 8, paddingBottom: 4,
            zIndex: 60,
          }}>
            {/* Håndtag */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 8 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--cfc-border)' }} />
            </div>
            {moreItems.map(({ to, label, icon }) => (
              <NavLink key={to} to={to} onClick={() => setMereOpen(false)}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '13px 20px', fontSize: 16, fontWeight: 500,
                  color: isActive ? 'var(--green)' : 'var(--cfc-text-primary)',
                  background: isActive ? 'var(--green-light)' : 'transparent',
                  textDecoration: 'none', minHeight: 52,
                })}>
                <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{icon}</span>
                {label}
              </NavLink>
            ))}
            <div style={{ borderTop: '1px solid var(--cfc-border)', marginTop: 4 }}>
              <button onClick={doLogout} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '13px 20px', width: '100%', minHeight: 52,
                fontSize: 16, fontWeight: 500, color: 'var(--cfc-text-muted)',
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>🚪</span>
                Log ud
              </button>
            </div>
          </div>
        )}
      </nav>

      <PwaBanner />

      {/* Responsive CSS */}
      <style>{`
        .cfc-name-short  { display: none; }
        .cfc-name-full   { display: inline; }
        .cfc-nav-desktop { display: flex !important; }
        .cfc-user-pill   { display: flex !important; }
        .cfc-bottom-nav  { display: none !important; }

        @media (max-width: 767px) {
          .cfc-name-short  { display: inline; }
          .cfc-name-full   { display: none; }
          .cfc-nav-desktop { display: none !important; }
          .cfc-user-pill   { display: none !important; }
          .cfc-bottom-nav  { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
