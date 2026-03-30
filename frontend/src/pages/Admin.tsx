import { useState, useEffect } from 'react';
import { api, Player, Match } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useNavigate } from 'react-router-dom';

export default function Admin() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin) navigate('/kampe');
  }, [isAdmin]);

  const [tab, setTab] = useState<'players' | 'matches' | 'stats'>('players');

  return (
    <div className="page">
      <div className="section-label" style={{ marginBottom: 10 }}>Admin panel</div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['players', 'matches', 'stats'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="btn btn-sm"
            style={{
              background: tab === t ? 'var(--cfc-bg-hover)' : 'transparent',
              color: tab === t ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
              border: `0.5px solid ${tab === t ? 'var(--cfc-border)' : 'transparent'}`,
            }}
          >
            {{ players: 'Spillere', matches: 'Kampe', stats: 'Statistik' }[t]}
          </button>
        ))}
      </div>

      {tab === 'players' && <AdminPlayers />}
      {tab === 'matches' && <AdminMatches />}
      {tab === 'stats' && <AdminStats />}
    </div>
  );
}

// ── Players ───────────────────────────────────────────────────────────────────

function AdminPlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
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
            {t === 'active' ? `Aktive (${active.length})` : `Passive (${inactive.length})`}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {shown.length === 0 && (
          <div className="empty">
            Ingen {subTab === 'active' ? 'aktive' : 'passive'} spillere
          </div>
        )}
        {shown.map((p, i) => (
          <div
            key={p.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px',
              borderBottom: i < shown.length - 1 ? '0.5px solid var(--cfc-border)' : 'none',
            }}
          >
            {/* Trøjenummer */}
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--cfc-bg-hover)',
              color: p.shirt_number != null ? 'var(--cfc-text-primary)' : 'var(--cfc-text-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, flexShrink: 0,
              opacity: p.active === 0 ? 0.5 : 1,
            }}>
              {p.shirt_number ?? '—'}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0, opacity: p.active === 0 ? 0.6 : 1 }}>
              <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)' }}>
                {p.id} · {p.email || 'ingen email'}
              </div>
            </div>

            {/* Rolle-badge */}
            <RoleBadge role={p.role} />

            {/* Handlinger */}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {p.active === 1 ? (
                <>
                  <button className="btn btn-sm btn-secondary" onClick={() => setEditPlayer(p)}>Rediger</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deactivate(p.id)}>Deaktiver</button>
                </>
              ) : (
                <>
                  <button className="btn btn-sm btn-secondary" onClick={() => reactivate(p.id)}>Genaktiver</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deletePermanently(p.id, p.name)}>Slet</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAdd && <AddPlayerModal onClose={() => { setShowAdd(false); load(); }} />}
      {editPlayer && <EditPlayerModal player={editPlayer} onClose={() => { setEditPlayer(null); load(); }} />}
    </>
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
    email:          player.email || '',
    role:           player.role,
    password:       '',
    birth_date:     player.birth_date || '',
    shirt_number:   player.shirt_number?.toString() || '',
    license_number: player.license_number || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.name) { setError('Navn må ikke være tomt'); return; }
    setSaving(true);
    try {
      const update: any = {
        name: form.name, email: form.email, role: form.role,
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
        {[
          { key: 'name',           label: 'Navn',             placeholder: '' },
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

// ── Matches ───────────────────────────────────────────────────────────────────

function AdminMatches() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    setMatches(await api.getMatches());
    setLoading(false);
  }

  async function del(id: string) {
    if (!confirm('Slet kamp?')) return;
    await api.deleteMatch(id);
    load();
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>;

  return (
    <>
      <button className="btn btn-primary" style={{ marginBottom: 12, width: '100%', justifyContent: 'center' }} onClick={() => setShowModal(true)}>
        + Tilføj kamp
      </button>
      {matches.map(m => (
        <div key={m.id} className="card" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{m.opponent}</div>
            <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)' }}>
              {m.date} {m.time} · {m.venue === 'home' ? 'Hjemme' : 'Ude'}
            </div>
          </div>
          <button className="btn btn-sm btn-danger" onClick={() => del(m.id)}>Slet</button>
        </div>
      ))}
      {matches.length === 0 && <div className="empty">Ingen kampe. Tilføj den første.</div>}
      {showModal && <AddMatchModal onClose={() => { setShowModal(false); load(); }} />}
    </>
  );
}

function AddMatchModal({ onClose }: { onClose: () => void }) {
  const year = new Date().getFullYear().toString();
  const [form, setForm] = useState({ date: '', time: '14:00', opponent: '', venue: 'home', address: '', season: year });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.date || !form.opponent) { setError('Udfyld dato og modstander'); return; }
    setSaving(true);
    try { await api.createMatch(form); onClose(); }
    catch (e: any) { setError(e.message); setSaving(false); }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Tilføj kamp</h2>
        <div className="form-row"><label className="form-label">Dato</label><input type="date" className="input" value={form.date} onChange={e => set('date', e.target.value)} /></div>
        <div className="form-row"><label className="form-label">Tid</label><input type="time" className="input" value={form.time} onChange={e => set('time', e.target.value)} /></div>
        <div className="form-row"><label className="form-label">Modstander</label><input className="input" value={form.opponent} onChange={e => set('opponent', e.target.value)} placeholder="fx Kolding B" /></div>
        <div className="form-row">
          <label className="form-label">Hjemme/ude</label>
          <select className="input" value={form.venue} onChange={e => set('venue', e.target.value)}>
            <option value="home">Hjemmebane</option>
            <option value="away">Udebane</option>
          </select>
        </div>
        <div className="form-row"><label className="form-label">Adresse</label><input className="input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="fx CFC Banen, Christiansfeld" /></div>
        <div className="form-row"><label className="form-label">Sæson</label><input className="input" value={form.season} onChange={e => set('season', e.target.value)} /></div>
        {error && <p style={{ color: '#e57373', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuller</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '...' : 'Tilføj'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Stats entry ───────────────────────────────────────────────────────────────

function AdminStats() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchId, setMatchId] = useState('');
  const [rows, setRows] = useState<Record<string, { goals: number; yellow: number; red: number; played: number }>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([api.getPlayers(), api.getMatches()]).then(([ps, ms]) => {
      setPlayers(ps);
      setMatches(ms.filter(m => m.date <= new Date().toISOString().slice(0, 10)));
      const init: typeof rows = {};
      ps.forEach(p => { init[p.id] = { goals: 0, yellow: 0, red: 0, played: 1 }; });
      setRows(init);
    });
  }, []);

  function setRow(pid: string, key: string, val: number) {
    setRows(r => ({ ...r, [pid]: { ...r[pid], [key]: val } }));
  }

  async function save() {
    if (!matchId) return;
    setSaving(true);
    await Promise.all(
      players.map(p => api.saveStats({
        match_id: matchId,
        player_id: p.id,
        goals: rows[p.id]?.goals || 0,
        yellow_cards: rows[p.id]?.yellow || 0,
        red_cards: rows[p.id]?.red || 0,
        played: rows[p.id]?.played ?? 1,
      }))
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <div className="form-row">
        <label className="form-label">Vælg kamp</label>
        <select className="input" value={matchId} onChange={e => setMatchId(e.target.value)}>
          <option value="">Vælg kamp...</option>
          {matches.map(m => (
            <option key={m.id} value={m.id}>{m.date} — {m.opponent}</option>
          ))}
        </select>
      </div>

      {matchId && (
        <>
          <div className="card" style={{ padding: 0, overflow: 'auto', marginBottom: 12 }}>
            <table className="table" style={{ minWidth: 420 }}>
              <thead>
                <tr>
                  <th>Spiller</th>
                  <th className="num">Spillede</th>
                  <th className="num">Mål</th>
                  <th className="num">Gule</th>
                  <th className="num">Røde</th>
                </tr>
              </thead>
              <tbody>
                {players.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</td>
                    <td className="num">
                      <input type="checkbox" checked={rows[p.id]?.played === 1} onChange={e => setRow(p.id, 'played', e.target.checked ? 1 : 0)} />
                    </td>
                    {(['goals', 'yellow', 'red'] as const).map(k => (
                      <td key={k} className="num">
                        <input
                          type="number" min={0} max={20}
                          value={rows[p.id]?.[k] || 0}
                          onChange={e => setRow(p.id, k, parseInt(e.target.value) || 0)}
                          style={{ width: 44, textAlign: 'center', background: 'var(--cfc-bg-hover)', border: '0.5px solid var(--cfc-border)', borderRadius: 4, padding: '3px 4px', fontSize: 13, color: 'var(--cfc-text-primary)' }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={save} disabled={saving}>
            {saving ? 'Gemmer...' : saved ? '✓ Gemt!' : 'Gem statistik'}
          </button>
        </>
      )}
    </>
  );
}
