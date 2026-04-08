import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import logo from '../assets/logo.svg';
import PwaBanner from './PwaBanner';

const NAV_ITEMS = [
  { to: '/kalender',      label: 'Kalender',      icon: '📅', comingSoon: false },
  { to: '/opslagstavle',  label: 'Opslagstavle',  icon: '📋', comingSoon: false },
  { to: '/historie',      label: 'Historie',      icon: '📖', comingSoon: false },
  { to: '/bødekasse',     label: 'Bødekasse',     icon: '💰', comingSoon: false },
];

export default function Layout() {
  const { player, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [boardUnread, setBoardUnread] = useState(false);

  // Check for new board posts since last read
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

  const allItems: { to: string; label: string; icon: string; comingSoon: boolean }[] = [
    ...NAV_ITEMS,
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: '⚙️', comingSoon: false }] : []),
  ];

  function doLogout() {
    logout();
    navigate('/login');
    setMenuOpen(false);
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--cfc-bg-primary)' }}>
      {/* ── Header ── */}
      <header style={{
        background: 'var(--cfc-bg-card)',
        borderBottom: '0.5px solid var(--cfc-border)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 16px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          {/* Logo */}
          <img
            src={logo}
            alt="CFC logo"
            style={{ height: 36, width: 36, objectFit: 'contain', flexShrink: 0 }}
          />

          {/* Klubnavn */}
          <span style={{
            fontFamily: 'Georgia, serif',
            fontWeight: 700,
            fontSize: 17,
            color: 'var(--cfc-text-primary)',
            letterSpacing: '0.01em',
            flexShrink: 0,
          }}>
            <span className="cfc-name-full">Copenhagen Forza Chang</span>
            <span className="cfc-name-short">CFC</span>
          </span>

          {/* Desktop navigation */}
          <nav className="cfc-nav-desktop" style={{ display: 'flex', gap: 4, marginLeft: 24 }}>
            {allItems.map(({ to, label, comingSoon = false }) => (
              comingSoon ? (
                <span
                  key={to}
                  title="Coming soon"
                  style={{
                    position: 'relative',
                    padding: '6px 14px',
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--cfc-text-subtle)',
                    cursor: 'default',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {label}
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--cfc-text-subtle)',
                    border: '0.5px solid var(--cfc-border)',
                    borderRadius: 4,
                    padding: '1px 4px',
                    lineHeight: 1.4,
                  }}>snart</span>
                </span>
              ) : (
                <NavLink
                  key={to}
                  to={to}
                  style={({ isActive }) => ({
                    padding: '6px 14px',
                    borderRadius: 6,
                    fontSize: 14,
                    fontWeight: 500,
                    color: isActive ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
                    background: isActive ? 'var(--cfc-bg-hover)' : 'transparent',
                    transition: 'all 0.15s',
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  })}
                >
                  {label}
                  {to === '/opslagstavle' && boardUnread && (
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: '#5b8dd9', flexShrink: 0,
                    }} />
                  )}
                </NavLink>
              )
            ))}
          </nav>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Brugerpille (desktop) */}
          <div className="cfc-user-pill" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--cfc-bg-hover)',
            border: '0.5px solid var(--cfc-border)',
            borderRadius: 20,
            padding: '5px 12px 5px 8px',
          }}>
            <div style={{
              width: 26, height: 26,
              background: 'var(--cfc-border)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'var(--cfc-text-muted)',
              flexShrink: 0,
            }}>
              {player?.name?.charAt(0).toUpperCase()}
            </div>
            <NavLink to="/profil" style={{ fontSize: 13, color: 'var(--cfc-text-primary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {player?.name}
            </NavLink>
            <button
              onClick={doLogout}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--cfc-text-muted)',
                fontSize: 12,
                padding: '2px 0 2px 6px',
                borderLeft: '0.5px solid var(--cfc-border)',
                cursor: 'pointer',
              }}
            >
              Log ud
            </button>
          </div>

          {/* Hamburger (mobil) */}
          <button
            className="cfc-hamburger"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Åbn menu"
            style={{
              background: 'none',
              border: '0.5px solid var(--cfc-border)',
              borderRadius: 6,
              color: 'var(--cfc-text-primary)',
              width: 36, height: 36,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 5,
              cursor: 'pointer',
            }}
          >
            <span style={{ width: 18, height: 1.5, background: 'currentColor', borderRadius: 1, transition: 'transform 0.2s', transform: menuOpen ? 'rotate(45deg) translate(4px, 4px)' : 'none', display: 'block' }} />
            <span style={{ width: 18, height: 1.5, background: 'currentColor', borderRadius: 1, transition: 'opacity 0.2s', opacity: menuOpen ? 0 : 1, display: 'block' }} />
            <span style={{ width: 18, height: 1.5, background: 'currentColor', borderRadius: 1, transition: 'transform 0.2s', transform: menuOpen ? 'rotate(-45deg) translate(4px, -4px)' : 'none', display: 'block' }} />
          </button>
        </div>

        {/* Mobil dropdown-menu */}
        {menuOpen && (
          <div className="cfc-mobile-menu" style={{
            borderTop: '0.5px solid var(--cfc-border)',
            background: 'var(--cfc-bg-card)',
            padding: '8px 16px 16px',
          }}>
            {allItems.map(({ to, label, icon, comingSoon = false }) => (
              comingSoon ? (
                <div
                  key={to}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 8px',
                    borderBottom: '0.5px solid var(--cfc-border)',
                    fontSize: 15,
                    fontWeight: 500,
                    color: 'var(--cfc-text-subtle)',
                  }}
                >
                  <span style={{ fontSize: 20, opacity: 0.4 }}>{icon}</span>
                  {label}
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--cfc-text-subtle)',
                    border: '0.5px solid var(--cfc-border)',
                    borderRadius: 4,
                    padding: '1px 5px',
                    lineHeight: 1.4,
                    marginLeft: 'auto',
                  }}>snart</span>
                </div>
              ) : (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 8px',
                    borderBottom: '0.5px solid var(--cfc-border)',
                    fontSize: 15,
                    fontWeight: 500,
                    color: isActive ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
                  })}
                >
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  {label}
                  {to === '/opslagstavle' && boardUnread && (
                    <span style={{
                      marginLeft: 'auto',
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#5b8dd9', flexShrink: 0,
                    }} />
                  )}
                </NavLink>
              )
            ))}
            <div style={{ padding: '12px 8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <NavLink to="/profil" onClick={() => setMenuOpen(false)} style={{ fontSize: 13, color: 'var(--cfc-text-muted)' }}>
                {player?.name} · Min profil
              </NavLink>
              <button
                onClick={doLogout}
                style={{ background: 'none', border: '0.5px solid var(--cfc-border)', borderRadius: 6, color: 'var(--cfc-text-muted)', fontSize: 13, padding: '6px 12px', cursor: 'pointer' }}
              >
                Log ud
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Sideindhold */}
      <main style={{ flex: 1, paddingBottom: 80 }}>
        <Outlet />
      </main>

      {/* Bundnavigation (mobil) */}
      <nav className="cfc-bottom-nav" style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        background: 'var(--cfc-bg-card)',
        borderTop: '0.5px solid var(--cfc-border)',
        display: 'flex',
        zIndex: 50,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {allItems.map(({ to, label, icon, comingSoon }) => (
          comingSoon ? (
            <div
              key={to}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 4px',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--cfc-text-subtle)',
                gap: 2,
                borderTop: '2px solid transparent',
              }}
            >
              <span style={{ fontSize: 20, opacity: 0.3 }}>{icon}</span>
              <span>{label}</span>
              <span style={{ fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>snart</span>
            </div>
          ) : (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 4px',
              fontSize: 11,
              fontWeight: 500,
              color: isActive ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
              gap: 2,
              borderTop: isActive ? '2px solid var(--cfc-text-primary)' : '2px solid transparent',
              transition: 'color 0.1s',
              position: 'relative',
            })}
          >
            <span style={{ fontSize: 20, position: 'relative' }}>
              {icon}
              {to === '/opslagstavle' && boardUnread && (
                <span style={{
                  position: 'absolute', top: 0, right: -2,
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#5b8dd9',
                }} />
              )}
            </span>
            {label}
          </NavLink>
          )
        ))}
      </nav>

      <PwaBanner />

      {/* Responsive CSS */}
      <style>{`
        .cfc-name-short  { display: none; }
        .cfc-name-full   { display: inline; }
        .cfc-nav-desktop { display: flex !important; }
        .cfc-user-pill   { display: flex !important; }
        .cfc-hamburger   { display: none !important; }
        .cfc-mobile-menu { display: none !important; }
        .cfc-bottom-nav  { display: none !important; }

        @media (max-width: 767px) {
          .cfc-name-short  { display: inline; }
          .cfc-name-full   { display: none; }
          .cfc-nav-desktop { display: none !important; }
          .cfc-user-pill   { display: none !important; }
          .cfc-hamburger   { display: flex !important; }
          .cfc-mobile-menu { display: block !important; }
          .cfc-bottom-nav  { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
