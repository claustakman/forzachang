import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Profile() {
  const { player, updatePlayer } = useAuth();

  const [form, setForm] = useState({
    name:     player?.name || '',
    email:    player?.email || '',
    phone:    player?.phone || '',
  });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function saveProfile() {
    setSaving(true); setMsg('');
    try {
      await api.updatePlayer(player!.id, { name: form.name, email: form.email, phone: form.phone } as any);
      updatePlayer({ name: form.name, email: form.email, phone: form.phone } as any);
      setMsg('Gemt');
    } catch (e: any) { setMsg(e.message); }
    setSaving(false);
  }

  async function changePassword() {
    setPwErr(''); setPwMsg('');
    if (!pw.current) { setPwErr('Indtast nuværende kodeord'); return; }
    if (pw.next.length < 6) { setPwErr('Nyt kodeord skal være mindst 6 tegn'); return; }
    if (pw.next !== pw.confirm) { setPwErr('Kodeordene er ikke ens'); return; }
    setPwSaving(true);
    try {
      await api.changePassword(player!.id, pw.current, pw.next);
      setPwMsg('Kodeord ændret');
      setPw({ current: '', next: '', confirm: '' });
    } catch (e: any) { setPwErr(e.message); }
    setPwSaving(false);
  }

  return (
    <div className="page">
      <div className="section-label" style={{ marginBottom: 16 }}>Min profil</div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Oplysninger</h2>
        {[
          { key: 'name',  label: 'Navn',    placeholder: '' },
          { key: 'email', label: 'Email',   placeholder: 'din@email.dk' },
          { key: 'phone', label: 'Telefon', placeholder: '+45 ...' },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="form-row">
            <label className="form-label">{label}</label>
            <input className="input" value={(form as any)[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
          </div>
        ))}
        {msg && <p style={{ fontSize: 13, color: msg === 'Gemt' ? 'var(--green)' : '#e57373', marginBottom: 8 }}>{msg}</p>}
        <button className="btn btn-primary" onClick={saveProfile} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
          {saving ? '...' : 'Gem ændringer'}
        </button>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Skift kodeord</h2>
        {[
          { key: 'current', label: 'Nuværende kodeord', placeholder: '' },
          { key: 'next',    label: 'Nyt kodeord',       placeholder: 'Min. 6 tegn' },
          { key: 'confirm', label: 'Gentag nyt kodeord', placeholder: '' },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="form-row">
            <label className="form-label">{label}</label>
            <input className="input" type="password" value={(pw as any)[key]} onChange={e => setPw(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} />
          </div>
        ))}
        {pwErr && <p style={{ fontSize: 13, color: '#e57373', marginBottom: 8 }}>{pwErr}</p>}
        {pwMsg && <p style={{ fontSize: 13, color: 'var(--green)', marginBottom: 8 }}>{pwMsg}</p>}
        <button className="btn btn-primary" onClick={changePassword} disabled={pwSaving} style={{ width: '100%', justifyContent: 'center' }}>
          {pwSaving ? '...' : 'Skift kodeord'}
        </button>
      </div>
    </div>
  );
}
