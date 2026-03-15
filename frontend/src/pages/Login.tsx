import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

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
      background: 'var(--bg)'
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: 72, height: 72,
            background: 'var(--green)',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 12,
          }}>CFC</div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Forza Chang FC</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>Log ind for at se kampprogram</p>
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
              placeholder="dit brugernavn"
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
            <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</p>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            disabled={loading}
          >
            {loading ? 'Logger ind...' : 'Log ind'}
          </button>
        </form>
      </div>
    </div>
  );
}
