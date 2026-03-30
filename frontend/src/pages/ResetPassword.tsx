import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import logo from '../assets/logo.svg';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function requestReset() {
    if (!email) { setErr('Indtast din email'); return; }
    setLoading(true); setErr('');
    try {
      await api.requestPasswordReset(email);
      setMsg('Tjek din email — vi har sendt et link til at nulstille dit kodeord.');
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  async function doReset() {
    if (password.length < 6) { setErr('Kodeord skal være mindst 6 tegn'); return; }
    if (password !== confirm) { setErr('Kodeordene er ikke ens'); return; }
    setLoading(true); setErr('');
    try {
      await api.resetPassword(token!, password);
      setMsg('Kodeord nulstillet — du kan nu logge ind.');
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', background: 'var(--cfc-bg-primary)',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src={logo} alt="CFC" style={{ width: 64, height: 64, objectFit: 'contain', marginBottom: 12 }} />
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Nulstil kodeord</h1>
        </div>
        <div className="card" style={{ padding: '1.5rem' }}>
          {msg ? (
            <>
              <p style={{ color: 'var(--green)', fontSize: 14, marginBottom: 16 }}>{msg}</p>
              <Link to="/login" style={{ fontSize: 13, color: 'var(--cfc-text-muted)' }}>← Tilbage til login</Link>
            </>
          ) : token ? (
            <>
              <div className="form-row">
                <label className="form-label">Nyt kodeord</label>
                <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 tegn" />
              </div>
              <div className="form-row">
                <label className="form-label">Gentag kodeord</label>
                <input className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••" />
              </div>
              {err && <p style={{ color: '#e57373', fontSize: 13, marginBottom: 8 }}>{err}</p>}
              <button onClick={doReset} disabled={loading} style={{ width: '100%', padding: '10px 16px', background: '#fff', color: '#000', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {loading ? '...' : 'Gem nyt kodeord'}
              </button>
            </>
          ) : (
            <>
              <div className="form-row">
                <label className="form-label">Din email</label>
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="din@email.dk" autoFocus />
              </div>
              {err && <p style={{ color: '#e57373', fontSize: 13, marginBottom: 8 }}>{err}</p>}
              <button onClick={requestReset} disabled={loading} style={{ width: '100%', padding: '10px 16px', background: '#fff', color: '#000', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {loading ? '...' : 'Send nulstillingslink'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <Link to="/login" style={{ fontSize: 13, color: 'var(--cfc-text-muted)' }}>← Tilbage til login</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
