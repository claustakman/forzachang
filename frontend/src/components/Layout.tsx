import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Layout() {
  const { player, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  function doLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Top header */}
      <header style={{
        background: 'var(--green)',
        color: '#fff',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div style={{
          width: 32, height: 32,
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>CFC</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>Forza Chang FC</div>
          <div style={{ fontSize: 12, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {player?.name}
          </div>
        </div>
        <button
          onClick={doLogout}
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          Log ud
        </button>
      </header>

      {/* Page content */}
      <main style={{ flex: 1, paddingBottom: 72 }}>
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        background: '#fff',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        zIndex: 50,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {[
          { to: '/kampe', label: 'Kampe', icon: '⚽' },
          { to: '/statistik', label: 'Statistik', icon: '📊' },
          { to: '/bødekasse', label: 'Bødekasse', icon: '💰' },
          ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: '⚙️' }] : []),
        ].map(({ to, label, icon }) => (
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
              color: isActive ? 'var(--green)' : 'var(--text-muted)',
              gap: 2,
              borderTop: isActive ? '2px solid var(--green)' : '2px solid transparent',
              transition: 'color 0.1s',
            })}
          >
            <span style={{ fontSize: 20 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
