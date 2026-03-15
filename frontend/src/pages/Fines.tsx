import { useState, useEffect } from 'react';
import { api, Fine, FineType, FinesResponse } from '../lib/api';
import { useAuth } from '../lib/auth';

function fmt(øre: number) {
  return (øre / 100).toLocaleString('da-DK', { style: 'currency', currency: 'DKK', minimumFractionDigits: 0 });
}

export default function Fines() {
  const { player, isTreasurer } = useAuth();
  const [data, setData] = useState<FinesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<'list' | 'totals'>('list');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [finesData, playersData] = await Promise.all([
        api.getFines(),
        api.getPlayers(),
      ]);
      setData(finesData);
      setPlayers(playersData);
    } finally {
      setLoading(false);
    }
  }

  async function pay(id: string) {
    await api.payFine(id);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Slet denne bøde?')) return;
    await api.deleteFine(id);
    load();
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  );

  const fines = data?.fines || [];
  const totals = data?.totals || [];
  const totalUnpaid = fines.filter(f => !f.paid).reduce((s, f) => s + f.amount, 0);

  return (
    <div className="page">
      {/* Header card */}
      <div className="card" style={{ marginBottom: 14, background: 'var(--green)', border: 'none', color: '#fff' }}>
        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 2 }}>Udestående bøder</div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{fmt(totalUnpaid)}</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{fines.filter(f => !f.paid).length} ubetalte bøder</div>
      </div>

      {/* Actions */}
      {isTreasurer && (
        <button
          className="btn btn-primary"
          style={{ marginBottom: 14, width: '100%', justifyContent: 'center' }}
          onClick={() => setShowAddModal(true)}
        >
          + Giv bøde
        </button>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {(['list', 'totals'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '9px', border: 'none', fontSize: 13, fontWeight: 500,
              background: tab === t ? 'var(--green)' : '#fff',
              color: tab === t ? '#fff' : 'var(--text-muted)',
            }}
          >
            {t === 'list' ? 'Bødeliste' : 'Samlet oversigt'}
          </button>
        ))}
      </div>

      {tab === 'totals' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Spiller</th>
                <th className="num">Total</th>
                <th className="num">Betalt</th>
                <th className="num">Udestående</th>
              </tr>
            </thead>
            <tbody>
              {totals.map(t => (
                <tr key={t.player_id}>
                  <td style={{ fontWeight: t.player_id === player!.id ? 600 : 400 }}>
                    {t.name}{t.player_id === player!.id ? ' (dig)' : ''}
                  </td>
                  <td className="num">{fmt(t.total)}</td>
                  <td className="num" style={{ color: 'var(--green-dark)' }}>{fmt(t.paid)}</td>
                  <td className="num" style={{ color: t.total - t.paid > 0 ? '#dc2626' : undefined, fontWeight: t.total - t.paid > 0 ? 600 : 400 }}>
                    {fmt(t.total - t.paid)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totals.length === 0 && <div className="empty">Ingen bøder endnu 🎉</div>}
        </div>
      )}

      {tab === 'list' && (
        <>
          {fines.length === 0 && <div className="empty">Ingen bøder endnu 🎉</div>}
          {fines.map(f => (
            <div key={f.id} className="card" style={{ marginBottom: 8, borderLeft: `3px solid ${f.paid ? '#16a34a' : '#dc2626'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{f.player_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 1 }}>{f.fine_type_name}</div>
                  {f.reason && <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>{f.reason}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Givet af {f.issued_by_name} · {new Date(f.created_at).toLocaleDateString('da-DK')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{fmt(f.amount)}</div>
                  <span className={`badge badge-${f.paid ? 'paid' : 'unpaid'}`} style={{ marginTop: 4, display: 'block' }}>
                    {f.paid ? 'Betalt' : 'Ubetalt'}
                  </span>
                </div>
              </div>
              {isTreasurer && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {!f.paid && (
                    <button className="btn btn-sm btn-primary" onClick={() => pay(f.id)}>
                      Marker betalt
                    </button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => remove(f.id)}>
                    Slet
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {showAddModal && data && (
        <AddFineModal
          players={players}
          types={data.types}
          onClose={() => { setShowAddModal(false); load(); }}
        />
      )}
    </div>
  );
}

function AddFineModal({
  players, types, onClose
}: {
  players: { id: string; name: string }[];
  types: FineType[];
  onClose: () => void;
}) {
  const [playerId, setPlayerId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!playerId || !typeId) { setError('Vælg spiller og bødetype'); return; }
    setSaving(true);
    try {
      await api.addFine({ player_id: playerId, fine_type_id: typeId, reason });
      onClose();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Giv bøde</h2>

        <div className="form-row">
          <label className="form-label">Spiller</label>
          <select className="input" value={playerId} onChange={e => setPlayerId(e.target.value)}>
            <option value="">Vælg spiller...</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="form-row">
          <label className="form-label">Bødetype</label>
          <select className="input" value={typeId} onChange={e => setTypeId(e.target.value)}>
            <option value="">Vælg bødetype...</option>
            {types.map(t => (
              <option key={t.id} value={t.id}>
                {t.name} — {(t.amount / 100).toLocaleString('da-DK', { style: 'currency', currency: 'DKK', minimumFractionDigits: 0 })}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label className="form-label">Bemærkning (valgfri)</label>
          <input
            className="input"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="fx 'semifinale mod Kolding'"
          />
        </div>

        {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</p>}

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuller</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Gemmer...' : 'Giv bøde'}
          </button>
        </div>
      </div>
    </div>
  );
}
