import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { subscribeToPush, unsubscribeFromPush, isPushSupported, getPushPermission } from '../lib/push';

export default function Profile() {
  const { player, updatePlayer } = useAuth();

  const [form, setForm] = useState({
    name:     player?.name || '',
    alias:    player?.alias || '',
    email:    player?.email || '',
    phone:    player?.phone || '',
  });
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  const [notifyEmail, setNotifyEmail] = useState(player?.notify_email !== undefined ? !!player.notify_email : true);
  const [notifyPush, setNotifyPush] = useState(player?.notify_push !== undefined ? !!player.notify_push : true);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(getPushPermission());
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState('');

  const [avatarPreview, setAvatarPreview] = useState<string | null>(player?.avatar_url || null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarMsg('');
  }

  async function uploadAvatar() {
    if (!avatarFile) return;
    setAvatarSaving(true); setAvatarMsg('');
    try {
      const res = await api.uploadAvatar(player!.id, avatarFile);
      updatePlayer({ avatar_url: res.avatar_url });
      setAvatarMsg('Billede gemt');
      setAvatarFile(null);
    } catch (e: any) { setAvatarMsg(e.message); }
    setAvatarSaving(false);
  }

  async function saveProfile() {
    setSaving(true); setMsg('');
    try {
      await api.updatePlayer(player!.id, { name: form.name, alias: form.alias, email: form.email, phone: form.phone } as any);
      updatePlayer({ name: form.name, alias: form.alias, email: form.email, phone: form.phone } as any);
      setMsg('Gemt');
    } catch (e: any) { setMsg(e.message); }
    setSaving(false);
  }

  async function saveNotificationPrefs() {
    setNotifySaving(true); setNotifyMsg('');
    try {
      await api.updatePlayer(player!.id, { notify_email: notifyEmail ? 1 : 0, notify_push: notifyPush ? 1 : 0 } as any);
      updatePlayer({ notify_email: notifyEmail ? 1 : 0, notify_push: notifyPush ? 1 : 0 } as any);
      if (notifyPush && isPushSupported()) {
        const perm = await Notification.requestPermission();
        setPushPermission(perm);
        if (perm === 'granted') {
          await subscribeToPush(localStorage.getItem('fc_token') || '');
        }
      } else {
        await unsubscribeFromPush(localStorage.getItem('fc_token') || '');
      }
      setNotifyMsg('Gemt');
    } catch (e: any) {
      setNotifyMsg(e.message || 'Fejl');
    }
    setNotifySaving(false);
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

      {/* Avatar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Profilbillede</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'var(--cfc-bg-hover)',
              border: '0.5px solid var(--cfc-border)',
              overflow: 'hidden',
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28,
              color: 'var(--cfc-text-subtle)',
            }}
          >
            {avatarPreview
              ? <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : '👤'}
          </div>
          <div>
            <button className="btn btn-sm btn-secondary" onClick={() => fileInputRef.current?.click()}>
              Vælg billede
            </button>
            <p style={{ fontSize: 12, color: 'var(--cfc-text-muted)', marginTop: 4, marginBottom: 0 }}>
              JPG, PNG eller WebP · Maks. 5 MB
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={onFileChange}
          />
        </div>
        {avatarMsg && (
          <p style={{ fontSize: 13, color: avatarMsg === 'Billede gemt' ? 'var(--green)' : '#e57373', marginBottom: 8 }}>
            {avatarMsg}
          </p>
        )}
        {avatarFile && (
          <button className="btn btn-primary" onClick={uploadAvatar} disabled={avatarSaving} style={{ width: '100%', justifyContent: 'center' }}>
            {avatarSaving ? '...' : 'Upload billede'}
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Oplysninger</h2>
        {[
          { key: 'name',  label: 'Navn',    placeholder: '' },
          { key: 'alias', label: 'Alias',   placeholder: 'Fx "Klatten" — vises i stedet for fornavn' },
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

      <div className="card" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Notifikationer</h2>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--cfc-text-primary)' }}>Email-påmindelser</label>
          <input
            type="checkbox"
            checked={notifyEmail}
            onChange={e => setNotifyEmail(e.target.checked)}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--cfc-text-primary)' }}>Push-notifikationer</div>
            {!isPushSupported() && (
              <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', marginTop: 2 }}>Ikke understøttet i denne browser</div>
            )}
            {isPushSupported() && pushPermission === 'denied' && (
              <div style={{ fontSize: 11, color: '#e57373', marginTop: 2 }}>Blokeret i browser-indstillinger</div>
            )}
          </div>
          <input
            type="checkbox"
            checked={notifyPush}
            onChange={e => setNotifyPush(e.target.checked)}
            disabled={!isPushSupported() || pushPermission === 'denied'}
            style={{ width: 18, height: 18, cursor: isPushSupported() && pushPermission !== 'denied' ? 'pointer' : 'not-allowed', marginTop: 2 }}
          />
        </div>

        {notifyMsg && (
          <p style={{ fontSize: 13, color: notifyMsg === 'Gemt' ? 'var(--green)' : '#e57373', marginBottom: 8 }}>{notifyMsg}</p>
        )}
        <button className="btn btn-primary" onClick={saveNotificationPrefs} disabled={notifySaving} style={{ width: '100%', justifyContent: 'center' }}>
          {notifySaving ? '...' : 'Gem notifikationsindstillinger'}
        </button>
      </div>
    </div>
  );
}
