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
              background: tab === t ? 'var(--green)' : '#fff',
              color: tab === t ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border)',
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
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    setPlayers(await api.getPlayers());
    setLoading(false);
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>;

  return (
    <>
      <button className="btn btn-primary" style={{ marginBottom: 12, width: '100%', justifyContent: 'center' }} onClick={() => setShowModal(true)}>
        + Tilføj spiller
      </button>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {players.map((p, i) => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px',
            borderBottom: i < players.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--green-light)', color: 'var(--green-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, flexShrink: 0,
            }}>
              {p.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.id} · {p.email || 'ingen email'}</div>
            </div>
            <span style={{
              fontSize: 11, padding: '2px 7px', borderRadius: 100,
              background: p.role === 'admin' ? 'var(--green-light)' : p.role === 'treasurer' ? '#fef9c3' : '#f3f4f6',
              color: p.role === 'admin' ? 'var(--green-dark)' : p.role === 'treasurer' ? '#854d0e' : 'var(--text-muted)',
            }}>
              {p.role === 'admin' ? 'Admin' : p.role === 'treasurer' ? 'Kasserer' : 'Spiller'}
            </span>
          </div>
        ))}
      </div>
      {showModal && <AddPlayerModal onClose={() => { setShowModal(false); load(); }} />}
    </>
  );
}

function AddPlayerModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ id: '', name: '', email: '', password: 'forzachang123', role: 'player' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.id || !form.name) { setError('Udfyld brugernavn og navn'); return; }
    setSaving(true);
    try {
      await api.createPlayer(form as any);
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
          { key: 'id', label: 'Brugernavn (login)', placeholder: 'fx anders' },
          { key: 'name', label: 'Fulde navn', placeholder: 'fx Anders Møller' },
          { key: 'email', label: 'Email (til reminders)', placeholder: 'anders@email.dk' },
          { key: 'password', label: 'Startadgangskode', placeholder: '' },
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
            <option value="treasurer">Kasserer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuller</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '...' : 'Opret'}</button>
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
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
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
        {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</p>}
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
                          style={{ width: 44, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 4px', fontSize: 13 }}
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
