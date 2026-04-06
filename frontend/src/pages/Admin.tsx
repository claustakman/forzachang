import { useState, useEffect, useRef } from 'react';
import { api, Player, LoginEntry, FineType, HonorType, PlayerHonor } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useNavigate } from 'react-router-dom';

export default function Admin() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) navigate('/kalender');
  }, [isAdmin]);

  const [tab, setTab] = useState<'players' | 'settings' | 'fines'>('players');

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'players',  label: 'Spillere' },
    { key: 'settings', label: 'Indstillinger' },
    { key: 'fines',    label: 'Bødekatalog' },
  ];

  return (
    <div className="page">
      <div className="section-label" style={{ marginBottom: 10 }}>Admin panel</div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="btn btn-sm"
            style={{
              background: tab === key ? 'var(--cfc-bg-hover)' : 'transparent',
              color: tab === key ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
              border: `0.5px solid ${tab === key ? 'var(--cfc-border)' : 'transparent'}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'players'  && <AdminPlayers />}
      {tab === 'settings' && <AdminSettings />}
      {tab === 'fines'    && <AdminFineTypes />}
    </div>
  );
}

// ── Players ───────────────────────────────────────────────────────────────────

function AdminPlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [loginPlayer, setLoginPlayer] = useState<Player | null>(null);
  const [subTab, setSubTab] = useState<'active' | 'inactive'>('active');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setPlayers(await api.getPlayers(true));
    } catch (e: any) {
      alert('Fejl ved hentning af spillere: ' + e.message);
    }
    setLoading(false);
  }

  const active = players.filter(p => p.active === 1);
  const inactive = players.filter(p => p.active === 0);
  const shown = subTab === 'active' ? active : inactive;

  async function deactivate(id: string) {
    if (!confirm('Deaktiver spiller? De kan ikke længere logge ind.')) return;
    await api.deletePlayer(id);
    load();
  }

  async function reactivate(id: string) {
    await api.updatePlayer(id, { active: 1 } as any);
    load();
  }

  async function sendInvite(id: string, name: string) {
    try {
      await api.sendInvite(id);
      alert(`Velkomst-email sendt til ${name}`);
    } catch (e: any) {
      alert('Fejl: ' + e.message);
    }
  }

  async function deletePermanently(id: string, name: string) {
    if (!confirm(`Slet ${name} permanent? Dette kan ikke fortrydes.`)) return;
    await api.deletePlayerPermanently(id);
    load();
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>;

  return (
    <>
      <button
        className="btn btn-primary"
        style={{ marginBottom: 12, width: '100%', justifyContent: 'center' }}
        onClick={() => setShowAdd(true)}
      >
        + Tilføj spiller
      </button>

      {/* Sub-tabs: Aktive / Passive */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['active', 'inactive'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className="btn btn-sm"
            style={{
              background: subTab === t ? 'var(--cfc-bg-hover)' : 'transparent',
              color: subTab === t ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
              border: `0.5px solid ${subTab === t ? 'var(--cfc-border)' : 'transparent'}`,
            }}
          >
            {t === 'active' ? `Aktive (${active.length})` : `Pensionerede (${inactive.length})`}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {shown.length === 0 && (
          <div className="empty">
            Ingen {subTab === 'active' ? 'aktive' : 'pensionerede'} spillere
          </div>
        )}
        {shown.map((p, i) => (
          <PlayerRow
            key={p.id}
            player={p}
            isLast={i === shown.length - 1}
            onEdit={() => setEditPlayer(p)}
            onInvite={() => sendInvite(p.id, p.name)}
            onDeactivate={() => deactivate(p.id)}
            onReactivate={() => reactivate(p.id)}
            onDelete={() => deletePermanently(p.id, p.name)}
            onShowLogins={() => setLoginPlayer(p)}
          />
        ))}
      </div>

      {showAdd && <AddPlayerModal onClose={() => { setShowAdd(false); load(); }} />}
      {editPlayer && <EditPlayerModal player={editPlayer} onClose={() => { setEditPlayer(null); load(); }} />}
      {loginPlayer && <LoginLogModal player={loginPlayer} onClose={() => setLoginPlayer(null)} />}
    </>
  );
}

function PlayerRow({ player: p, isLast, onEdit, onInvite, onDeactivate, onReactivate, onDelete, onShowLogins }: {
  player: Player;
  isLast: boolean;
  onEdit: () => void;
  onInvite: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDelete: () => void;
  onShowLogins: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [honors, setHonors] = useState<PlayerHonor[]>([]);
  const [honorTypes, setHonorTypes] = useState<HonorType[]>([]);
  const [showAddHonor, setShowAddHonor] = useState(false);
  const [addHonorTypeId, setAddHonorTypeId] = useState('');
  const [addHonorYear, setAddHonorYear] = useState(String(new Date().getFullYear()));
  const [savingHonor, setSavingHonor] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.getHonors(p.id).then(setHonors).catch(() => {});
    if (honorTypes.length === 0) {
      api.getHonorsSummary().then(s => setHonorTypes(s.types)).catch(() => {});
    }
  }, [open]);

  const manualTypes = honorTypes.filter(t => t.type === 'manual');

  async function saveHonor() {
    if (!addHonorTypeId || !addHonorYear) return;
    setSavingHonor(true);
    try {
      await api.createHonor({ player_id: p.id, honor_type_id: addHonorTypeId, season: Number(addHonorYear) });
      setHonors(await api.getHonors(p.id));
      setShowAddHonor(false);
      setAddHonorTypeId('');
    } catch (e: any) {
      alert('Fejl: ' + e.message);
    }
    setSavingHonor(false);
  }

  async function deleteHonor(id: string) {
    if (!confirm('Slet hædersbevisning?')) return;
    await api.deleteHonor(id);
    setHonors(await api.getHonors(p.id));
  }

  return (
    <div style={{ borderBottom: isLast ? 'none' : '0.5px solid var(--cfc-border)', opacity: p.active === 0 ? 0.7 : 1 }}>
      {/* Hovedrække */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--cfc-bg-hover)',
          border: '0.5px solid var(--cfc-border)',
          overflow: 'hidden', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 600,
          color: p.shirt_number != null ? 'var(--cfc-text-primary)' : 'var(--cfc-text-subtle)',
        }}>
          {p.avatar_url
            ? <img src={p.avatar_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (p.shirt_number ?? '—')}
        </div>
        {/* Nummer + navn + alias */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.name}
            {p.alias && (
              <span style={{ fontSize: 12, color: 'var(--cfc-text-muted)', fontWeight: 400, marginLeft: 6 }}>"{p.alias}"</span>
            )}
          </div>
          {p.shirt_number != null && (
            <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)' }}>#{p.shirt_number}</div>
          )}
        </div>
        <button className="btn btn-sm btn-secondary" onClick={onEdit}>Rediger</button>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', color: 'var(--cfc-text-subtle)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
          aria-label="Vis detaljer"
        >
          {open ? '▲' : '▼'}
        </button>
      </div>
      {/* Detaljer */}
      {open && (
        <div style={{ padding: '0 14px 12px 56px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <RoleBadge role={p.role} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)' }}>
            <span style={{ color: 'var(--cfc-text-subtle)' }}>Brugernavn</span> {p.id}
          </div>
          <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)' }}>
            <span style={{ color: 'var(--cfc-text-subtle)' }}>Email</span> {p.email || '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)' }}>
            <span style={{ color: 'var(--cfc-text-subtle)' }}>Sidst aktiv</span>{' '}
            {p.last_seen
              ? new Date(p.last_seen).toLocaleString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : '—'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-secondary" onClick={onShowLogins}>🕐 Aktivitet</button>
            {p.active === 1
              ? <>
                  <button className="btn btn-sm btn-secondary" onClick={onInvite}>Send velkomst-email</button>
                  <button className="btn btn-sm btn-danger" onClick={onDeactivate}>Deaktiver</button>
                </>
              : <>
                  <button className="btn btn-sm btn-secondary" onClick={onReactivate}>Genaktiver</button>
                  <button className="btn btn-sm btn-danger" onClick={onDelete}>Slet permanent</button>
                </>
            }
          </div>

          {/* Hædersbevisninger */}
          <div style={{ marginTop: 10, borderTop: '0.5px solid var(--cfc-border)', paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cfc-text-muted)', marginBottom: 6 }}>
              Hædersbevisninger
            </div>
            {honors.length === 0 && <div style={{ fontSize: 12, color: 'var(--cfc-text-subtle)', marginBottom: 6 }}>Ingen endnu</div>}
            {honors.map(h => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 12 }}>
                <span style={{ padding: '2px 8px', borderRadius: 100, background: h.honor_type === 'auto' ? '#0f1a2e' : '#1a1200', color: h.honor_type === 'auto' ? '#5b8dd9' : '#c4a000', border: `0.5px solid ${h.honor_type === 'auto' ? '#1a3a5c' : '#3a2a00'}` }}>
                  {h.honor_name}{h.season ? ` ${h.season}` : ''}
                </span>
                {h.honor_type === 'manual' && (
                  <button onClick={() => deleteHonor(h.id)} style={{ background: 'none', border: 'none', color: 'var(--cfc-text-subtle)', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }} title="Slet">✕</button>
                )}
              </div>
            ))}
            {!showAddHonor ? (
              <button className="btn btn-sm btn-secondary" onClick={() => setShowAddHonor(true)} style={{ marginTop: 4, fontSize: 12 }}>+ Tildel hædersbevisning</button>
            ) : (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="input" style={{ fontSize: 12, width: 160 }} value={addHonorTypeId} onChange={e => setAddHonorTypeId(e.target.value)}>
                  <option value="">Vælg type...</option>
                  {manualTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input className="input" style={{ fontSize: 12, width: 70 }} type="number" value={addHonorYear} onChange={e => setAddHonorYear(e.target.value)} placeholder="Årstal" />
                <button className="btn btn-sm btn-primary" disabled={savingHonor || !addHonorTypeId} onClick={saveHonor}>Gem</button>
                <button className="btn btn-sm btn-secondary" onClick={() => setShowAddHonor(false)}>Annullér</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    admin:   { bg: '#162416', color: '#5a9e5a', label: 'Admin' },
    trainer: { bg: '#1a1500', color: '#c4a000', label: 'Træner' },
    player:  { bg: 'var(--cfc-bg-hover)', color: 'var(--cfc-text-muted)', label: 'Spiller' },
  };
  const s = styles[role] ?? styles.player;
  return (
    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 100, background: s.bg, color: s.color, flexShrink: 0 }}>
      {s.label}
    </span>
  );
}

function AddPlayerModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ id: '', name: '', email: '', password: 'forzachang123', role: 'player', birth_date: '', shirt_number: '', license_number: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.id || !form.name) { setError('Udfyld brugernavn og navn'); return; }
    setSaving(true);
    try {
      await api.createPlayer({ ...form, shirt_number: form.shirt_number ? Number(form.shirt_number) : undefined } as any);
      onClose();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Tilføj spiller</h2>
        {[
          { key: 'id',             label: 'Brugernavn (login)',    placeholder: 'fx anders' },
          { key: 'name',           label: 'Fulde navn',            placeholder: 'fx Anders Møller' },
          { key: 'email',          label: 'Email',                 placeholder: 'anders@email.dk' },
          { key: 'birth_date',     label: 'Fødselsdato',           placeholder: 'YYYY-MM-DD' },
          { key: 'shirt_number',   label: 'Trøjenummer',           placeholder: 'fx 10' },
          { key: 'license_number', label: 'DBU-licensnummer',      placeholder: '' },
          { key: 'password',       label: 'Startadgangskode',      placeholder: '' },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="form-row">
            <label className="form-label">{label}</label>
            <input className="input" value={(form as any)[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
          </div>
        ))}
        <div className="form-row">
          <label className="form-label">Rolle</label>
          <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
            <option value="player">Spiller</option>
            <option value="trainer">Træner</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {error && <p style={{ color: '#e57373', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuller</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '...' : 'Opret'}</button>
        </div>
      </div>
    </div>
  );
}

function EditPlayerModal({ player, onClose }: { player: Player; onClose: () => void }) {
  const [form, setForm] = useState({
    name:           player.name,
    alias:          player.alias || '',
    email:          player.email || '',
    role:           player.role,
    password:       '',
    birth_date:     player.birth_date || '',
    shirt_number:   player.shirt_number?.toString() || '',
    license_number: player.license_number || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [avatarPreview, setAvatarPreview] = useState<string | null>(player.avatar_url || null);
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
      await api.uploadAvatar(player.id, avatarFile);
      setAvatarMsg('Billede gemt');
      setAvatarFile(null);
    } catch (e: any) { setAvatarMsg(e.message); }
    setAvatarSaving(false);
  }

  async function submit() {
    if (!form.name) { setError('Navn må ikke være tomt'); return; }
    setSaving(true);
    try {
      const update: any = {
        name: form.name, alias: form.alias || null, email: form.email, role: form.role,
        birth_date: form.birth_date || null,
        shirt_number: form.shirt_number ? Number(form.shirt_number) : null,
        license_number: form.license_number || null,
      };
      if (form.password) update.password = form.password;
      await api.updatePlayer(player.id, update);
      onClose();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Rediger {player.name}</h2>

        {/* Avatar */}
        <div className="form-row" style={{ alignItems: 'center' }}>
          <label className="form-label">Profilbillede</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'var(--cfc-bg-hover)',
                border: '0.5px solid var(--cfc-border)',
                overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, color: 'var(--cfc-text-subtle)',
              }}
            >
              {avatarPreview
                ? <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : '👤'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button className="btn btn-sm btn-secondary" onClick={() => fileInputRef.current?.click()}>
                Vælg billede
              </button>
              {avatarFile && (
                <button className="btn btn-sm btn-primary" onClick={uploadAvatar} disabled={avatarSaving}>
                  {avatarSaving ? '...' : 'Upload'}
                </button>
              )}
            </div>
            {avatarMsg && (
              <span style={{ fontSize: 12, color: avatarMsg === 'Billede gemt' ? 'var(--green)' : '#e57373' }}>
                {avatarMsg}
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={onFileChange}
            />
          </div>
        </div>

        {[
          { key: 'name',           label: 'Navn',             placeholder: '' },
          { key: 'alias',          label: 'Alias',            placeholder: 'Fx "Klatten" — vises i stedet for fornavn' },
          { key: 'email',          label: 'Email',            placeholder: 'anders@email.dk' },
          { key: 'birth_date',     label: 'Fødselsdato',      placeholder: 'YYYY-MM-DD' },
          { key: 'shirt_number',   label: 'Trøjenummer',      placeholder: 'fx 10' },
          { key: 'license_number', label: 'DBU-licensnummer', placeholder: '' },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="form-row">
            <label className="form-label">{label}</label>
            <input className="input" value={(form as any)[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
          </div>
        ))}
        <div className="form-row">
          <label className="form-label">Rolle</label>
          <select className="input" value={form.role} onChange={e => set('role', e.target.value)}>
            <option value="player">Spiller</option>
            <option value="trainer">Træner</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="form-row">
          <label className="form-label">Nyt kodeord (lad stå tomt for uændret)</label>
          <input className="input" type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Lad stå tomt" />
        </div>
        {error && <p style={{ color: '#e57373', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuller</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '...' : 'Gem'}</button>
        </div>
      </div>
    </div>
  );
}

// ── LoginLogModal ─────────────────────────────────────────────────────────────

function LoginLogModal({ player, onClose }: { player: Player; onClose: () => void }) {
  const [logs, setLogs] = useState<LoginEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPlayerLogins(player.id)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [player.id]);

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('da-DK', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ color: 'var(--cfc-text-primary)', marginBottom: 4 }}>Aktivitet</h2>
        <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginBottom: 16 }}>
          {player.name}{player.alias ? ` · "${player.alias}"` : ''} · seneste 50 logins
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <div className="spinner" />
          </div>
        ) : logs.length === 0 ? (
          <div className="empty">Ingen logins registreret endnu.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {logs.map((log, i) => (
              <div key={log.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 10px',
                background: i % 2 === 0 ? 'var(--cfc-bg-hover)' : 'transparent',
                borderRadius: 6,
              }}>
                <span style={{ fontSize: 13, color: 'var(--cfc-text-primary)' }}>
                  {fmtDate(log.created_at)}
                </span>
                {log.ip && (
                  <span style={{ fontSize: 11, color: 'var(--cfc-text-subtle)', fontFamily: 'monospace' }}>
                    {log.ip}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose}>Luk</button>
        </div>
      </div>
    </div>
  );
}

// ── AdminFineTypes ────────────────────────────────────────────────────────────

function AdminFineTypes() {
  const [types, setTypes] = useState<FineType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editType, setEditType] = useState<FineType | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setTypes(await api.getFineTypes());
    } catch (e: any) {
      alert('Fejl: ' + e.message);
    }
    setLoading(false);
  }

  async function archive(id: string, name: string) {
    if (!confirm(`Arkivér bødetype "${name}"? Den vises ikke længere ved tildeling af bøder.`)) return;
    await api.deleteFineType(id);
    load();
  }

  async function restore(id: string) {
    await api.updateFineType(id, { active: 1 } as any);
    load();
  }

  const active = types.filter(t => t.active);
  const archived = types.filter(t => !t.active);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>;

  function autoAssignLabel(v?: string) {
    if (v === 'absence')    return { label: 'Auto: afbud',          bg: '#2a1010', color: '#e57373' };
    if (v === 'late_signup') return { label: 'Auto: sen tilmelding', bg: '#1a1200', color: '#c4a000' };
    return null;
  }

  return (
    <>
      <button
        className="btn btn-primary"
        style={{ marginBottom: 12, width: '100%', justifyContent: 'center' }}
        onClick={() => setShowAdd(true)}
      >
        + Ny bødetype
      </button>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
        {active.length === 0 && <div className="empty">Ingen aktive bødetyper</div>}
        {active.map((t, i) => {
          const badge = autoAssignLabel(t.auto_assign);
          return (
            <div key={t.id} style={{ borderBottom: i < active.length - 1 ? '0.5px solid var(--cfc-border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>
                    {t.name}
                    {badge && (
                      <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 100, background: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)', marginTop: 1 }}>
                    {t.amount} kr.
                  </div>
                </div>
                <button className="btn btn-sm btn-secondary" onClick={() => setEditType(t)}>Rediger</button>
                <button className="btn btn-sm btn-danger" onClick={() => archive(t.id, t.name)}>Arkivér</button>
              </div>
            </div>
          );
        })}
      </div>

      {archived.length > 0 && (
        <>
          <div className="section-label" style={{ marginBottom: 6 }}>Arkiverede</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {archived.map((t, i) => (
              <div key={t.id} style={{ borderBottom: i < archived.length - 1 ? '0.5px solid var(--cfc-border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', opacity: 0.6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 400, fontSize: 14 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)', marginTop: 1 }}>{t.amount} kr.</div>
                  </div>
                  <button className="btn btn-sm btn-secondary" onClick={() => restore(t.id)}>Genaktivér</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showAdd && <FineTypeModal onClose={() => { setShowAdd(false); load(); }} />}
      {editType && <FineTypeModal fineType={editType} onClose={() => { setEditType(null); load(); }} />}
    </>
  );
}

function FineTypeModal({ fineType, onClose }: { fineType?: FineType; onClose: () => void }) {
  const [form, setForm] = useState({
    name: fineType?.name || '',
    amount: fineType?.amount?.toString() || '',
    auto_assign: fineType?.auto_assign || '',
    sort_order: fineType?.sort_order?.toString() || '0',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.name || !form.amount) { setError('Navn og beløb kræves'); return; }
    setSaving(true);
    try {
      const data = {
        name: form.name,
        amount: Number(form.amount),
        auto_assign: form.auto_assign || null,
        sort_order: Number(form.sort_order) || 0,
      };
      if (fineType) {
        await api.updateFineType(fineType.id, data as any);
      } else {
        await api.createFineType(data as any);
      }
      onClose();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{fineType ? 'Rediger bødetype' : 'Ny bødetype'}</h2>
        <div className="form-row">
          <label className="form-label">Navn</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="fx Gult kort" />
        </div>
        <div className="form-row">
          <label className="form-label">Beløb (kr.)</label>
          <input className="input" type="number" min="1" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="fx 25" />
        </div>
        <div className="form-row">
          <label className="form-label">Auto-tildeling</label>
          <select className="input" value={form.auto_assign} onChange={e => set('auto_assign', e.target.value)}>
            <option value="">Ingen (manuelt)</option>
            <option value="absence">Ved afbud (absence)</option>
            <option value="late_signup">Ved sen tilmelding (late_signup)</option>
          </select>
        </div>
        <div className="form-row">
          <label className="form-label">Sorteringsorden</label>
          <input className="input" type="number" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} placeholder="0" />
        </div>
        {error && <p style={{ color: '#e57373', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuller</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '...' : (fineType ? 'Gem' : 'Opret')}</button>
        </div>
      </div>
    </div>
  );
}

// ── AdminSettings ─────────────────────────────────────────────────────────────

function AdminSettings() {
  const [webcalUrl, setWebcalUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSettings().then(s => {
      setWebcalUrl(s.webcal_url || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setMsg('');
    try {
      await api.updateSettings({ webcal_url: webcalUrl });
      setMsg('Gemt');
    } catch (e: any) { setMsg(e.message); }
    setSaving(false);
  }

  async function sync() {
    setSyncing(true); setSyncMsg('');
    try {
      await api.syncWebcal();
      setSyncMsg('Sync gennemført');
    } catch (e: any) { setSyncMsg(e.message); }
    setSyncing(false);
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>;

  return (
    <div className="card">
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Webcal-sync</h2>
      <p style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginBottom: 12 }}>
        Angiv webcal-URL fra holdets kalender. Synkroniseres automatisk én gang i døgnet.
      </p>
      <div className="form-row">
        <label className="form-label">Webcal-URL</label>
        <input
          className="input"
          value={webcalUrl}
          onChange={e => setWebcalUrl(e.target.value)}
          placeholder="webcal://... eller https://..."
        />
      </div>
      {msg && <p style={{ fontSize: 13, color: msg === 'Gemt' ? 'var(--green)' : '#e57373', marginBottom: 8 }}>{msg}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
          {saving ? '...' : 'Gem'}
        </button>
        <button className="btn btn-secondary" onClick={sync} disabled={syncing || !webcalUrl} style={{ flex: 1, justifyContent: 'center' }}>
          {syncing ? 'Synkroniserer...' : 'Synkroniser nu'}
        </button>
      </div>
      {syncMsg && <p style={{ fontSize: 13, color: syncMsg === 'Sync gennemført' ? 'var(--green)' : '#e57373', marginTop: 8 }}>{syncMsg}</p>}
    </div>
  );
}
