import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import logo from '../assets/logo.svg';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
      navigate('/kampe');
    } catch (err: any) {
      setError(err.message || 'Fejl ved login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      background: 'var(--cfc-bg-primary)',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src={logo} alt="CFC" style={{ width: 80, height: 80, objectFit: 'contain', marginBottom: 14 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif' }}>Copenhagen Forza Chang</h1>
          <p style={{ color: 'var(--cfc-text-muted)', fontSize: 14, marginTop: 4 }}>Log ind for at se kampprogram</p>
        </div>

        <form onSubmit={submit} className="card" style={{ padding: '1.5rem' }}>
          <div className="form-row">
            <label className="form-label">Brugernavn</label>
            <input
              className="input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="dit.brugernavn"
              autoFocus
            />
          </div>
          <div className="form-row">
            <label className="form-label">Kodeord</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••"
            />
          </div>
          {error && (
            <p style={{ color: '#e57373', fontSize: 13, marginBottom: 10 }}>{error}</p>
          )}
          <button
            type="submit"
            style={{
              width: '100%', marginTop: 8,
              padding: '10px 16px',
              background: '#ffffff', color: '#000000',
              border: 'none', borderRadius: 6,
              fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
            disabled={loading}
          >
            {loading ? 'Logger ind...' : 'Log ind'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <Link to="/reset" style={{ fontSize: 13, color: 'var(--cfc-text-muted)' }}>
              Glemt kodeord?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
