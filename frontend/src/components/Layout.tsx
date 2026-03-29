import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import logo from '../assets/logo.svg';

const NAV_ITEMS = [
  { to: '/kampe',     label: 'Kampe',     icon: '⚽' },
  { to: '/statistik', label: 'Statistik', icon: '📊' },
  { to: '/bødekasse', label: 'Bødekasse', icon: '💰' },
];

export default function Layout() {
  const { player, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const allItems = [
    ...NAV_ITEMS,
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: '⚙️' }] : []),
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
            {allItems.map(({ to, label }) => (
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
                })}
              >
                {label}
              </NavLink>
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
            <span style={{ fontSize: 13, color: 'var(--cfc-text-primary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {player?.name}
            </span>
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
            {allItems.map(({ to, label, icon }) => (
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
              </NavLink>
            ))}
            <div style={{ padding: '12px 8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--cfc-text-muted)' }}>{player?.name}</span>
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
        {allItems.map(({ to, label, icon }) => (
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
            })}
          >
            <span style={{ fontSize: 20 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

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
