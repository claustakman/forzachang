import { useState, FormEvent, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import logo from '../assets/logo.svg';
import {
  isPlatformAuthenticatorAvailable,
  authenticateWithPasskey,
  getLastEmail,
  saveLastEmail,
  isPasskeyEnrolledOnDevice,
  markPasskeyEnrolled,
  isPasskeyPromptDismissedForever,
  signalPasskeyPrompt,
} from '../lib/webauthn';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState(getLastEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setBiometricAvailable);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const trimmed = username.trim();
      saveLastEmail(trimmed);

      // Signal the post-login prompt if conditions are met (checked inside Layout)
      const shouldPrompt =
        biometricAvailable &&
        !isPasskeyEnrolledOnDevice() &&
        !isPasskeyPromptDismissedForever();
      if (shouldPrompt) signalPasskeyPrompt();

      await login(trimmed, password);
      navigate('/kalender');
    } catch (err: any) {
      setError(err.message || 'Fejl ved login');
    } finally {
      setLoading(false);
    }
  }

  async function loginWithBiometric() {
    const trimmed = username.trim();
    if (!trimmed) {
      setError('Indtast dit brugernavn eller email først');
      return;
    }
    setError('');
    setBiometricLoading(true);
    try {
      const { token, player } = await authenticateWithPasskey(trimmed);
      saveLastEmail(trimmed);
      markPasskeyEnrolled();
      // Store token + player the same way the auth context does
      localStorage.setItem('fc_token', token);
      localStorage.setItem('fc_player', JSON.stringify(player));
      // Reload so AuthProvider picks up the new state from localStorage
      window.location.href = '/kalender';
    } catch (err: any) {
      setError(err.message || 'Biometri fejlede');
    } finally {
      setBiometricLoading(false);
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
            <label className="form-label">Brugernavn eller email</label>
            <input
              className="input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="dit.brugernavn eller email"
              autoFocus={!username}
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
              border: '1px solid var(--cfc-border)', borderRadius: 6,
              fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              minHeight: 44,
            }}
            disabled={loading}
          >
            {loading ? 'Logger ind...' : 'Log ind'}
          </button>

          {biometricAvailable && (
            <button
              type="button"
              onClick={loginWithBiometric}
              disabled={biometricLoading}
              style={{
                width: '100%', marginTop: 10,
                padding: '10px 16px',
                background: 'var(--cfc-bg-hover)', color: 'var(--cfc-text-primary)',
                border: '1px solid var(--cfc-border)', borderRadius: 6,
                fontSize: 14, fontWeight: 500,
                cursor: biometricLoading ? 'not-allowed' : 'pointer',
                opacity: biometricLoading ? 0.7 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                minHeight: 44,
              }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>🔑</span>
              {biometricLoading ? 'Venter på biometri...' : 'Log ind med Face ID / Touch ID'}
            </button>
          )}

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
