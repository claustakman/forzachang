import { useState, useEffect } from 'react';
import { api, Fine, FineType, FinePayment, PlayerFinesSummary, Event, displayName } from '../lib/api';
import { useAuth } from '../lib/auth';

function fmtKr(kr: number) {
  return kr.toLocaleString('da-DK', { style: 'currency', currency: 'DKK', minimumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Fines() {
  const { player, isTrainer } = useAuth();
  const [summary, setSummary] = useState<PlayerFinesSummary[]>([]);
  const [fineTypes, setFineTypes] = useState<FineType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerFinesSummary | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [summaryData, typesData] = await Promise.all([
        api.getFineSummary(),
        api.getFineTypes(),
      ]);
      setSummary(summaryData);
      setFineTypes(typesData.filter(t => t.active));
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  );

  const totalFines = summary.reduce((s, p) => s + p.total_fines, 0);
  const totalPayments = summary.reduce((s, p) => s + p.total_payments, 0);
  const totalBalance = totalFines - totalPayments;
  const shownPlayers = showAllPlayers ? summary : summary.filter(p => p.active === 1);
  const activeFineTypes = fineTypes.filter(t => t.active);

  return (
    <div className="page">
      {/* ── Holdoversigt ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Holdets skyldig
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: totalBalance > 0 ? '#e57373' : '#5a9e5a' }}>
            {fmtKr(totalBalance)}
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Total bøder
          </div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>
            {fmtKr(totalFines)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', marginTop: 2 }}>
            {fmtKr(totalPayments)} indbetalt
          </div>
        </div>
      </div>

      {/* ── Spilleroversigt ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="section-label">Spilleroversigt</div>
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => setShowAllPlayers(v => !v)}
          style={{ fontSize: 11 }}
        >
          {showAllPlayers ? 'Kun aktive' : 'Vis alle'}
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--cfc-border)' }}>
              <th style={{ textAlign: 'left', padding: '8px 14px', color: 'var(--cfc-text-muted)', fontWeight: 500, fontSize: 11 }}>Spiller</th>
              <th style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--cfc-text-muted)', fontWeight: 500, fontSize: 11 }}>Bøder</th>
              <th style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--cfc-text-muted)', fontWeight: 500, fontSize: 11 }}>Indbetalt</th>
              <th style={{ textAlign: 'right', padding: '8px 14px', color: 'var(--cfc-text-muted)', fontWeight: 500, fontSize: 11 }}>Skyldig</th>
            </tr>
          </thead>
          <tbody>
            {shownPlayers.map((p, i) => (
              <tr
                key={p.player_id}
                onClick={() => setSelectedPlayer(p)}
                style={{
                  borderBottom: i < shownPlayers.length - 1 ? '0.5px solid var(--cfc-border)' : 'none',
                  cursor: 'pointer',
                  background: p.player_id === player?.id ? 'var(--cfc-bg-hover)' : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--cfc-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = p.player_id === player?.id ? 'var(--cfc-bg-hover)' : 'transparent')}
              >
                <td style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar url={p.avatar_url} name={p.name} size={28} />
                  <span style={{ fontWeight: p.player_id === player?.id ? 600 : 400 }}>
                    {p.name}
                    {p.player_id === player?.id && <span style={{ color: 'var(--cfc-text-muted)', fontSize: 11, marginLeft: 4 }}>(dig)</span>}
                  </span>
                </td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: 'var(--cfc-text-muted)' }}>{fmtKr(p.total_fines)}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: '#5a9e5a' }}>{fmtKr(p.total_payments)}</td>
                <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: p.balance > 0 ? 600 : 400, color: p.balance > 0 ? '#e57373' : 'var(--cfc-text-muted)' }}>
                  {fmtKr(p.balance)}
                </td>
              </tr>
            ))}
            {shownPlayers.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: 'var(--cfc-text-muted)' }}>Ingen bøder endnu</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Spiller-detaljemodal ──────────────────────────────────────── */}
      {selectedPlayer && (
        <PlayerFinesModal
          playerSummary={selectedPlayer}
          fineTypes={activeFineTypes}
          isTrainer={!!isTrainer}
          onClose={() => { setSelectedPlayer(null); load(); }}
        />
      )}
    </div>
  );
}

// ── PlayerFinesModal ──────────────────────────────────────────────────────────

function PlayerFinesModal({
  playerSummary, fineTypes, isTrainer, onClose,
}: {
  playerSummary: PlayerFinesSummary;
  fineTypes: FineType[];
  isTrainer: boolean;
  onClose: () => void;
}) {
  const [fines, setFines] = useState<Fine[]>([]);
  const [payments, setPayments] = useState<FinePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'fines' | 'payments'>('fines');
  const [showAddFine, setShowAddFine] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);

  useEffect(() => { loadDetail(); }, [playerSummary.player_id]);

  async function loadDetail() {
    setLoading(true);
    try {
      const [finesData, paymentsData] = await Promise.all([
        api.getFines(playerSummary.player_id),
        api.getFinePayments(playerSummary.player_id),
      ]);
      setFines(finesData);
      setPayments(paymentsData);
    } finally {
      setLoading(false);
    }
  }

  async function removeFine(id: string) {
    if (!confirm('Slet denne bøde?')) return;
    await api.deleteFine(id);
    loadDetail();
  }

  async function removePayment(id: string) {
    if (!confirm('Slet denne indbetaling?')) return;
    await api.deleteFinePayment(id);
    loadDetail();
  }

  const totalFines = fines.reduce((s, f) => s + f.amount, 0);
  const totalPayments = payments.reduce((s, p) => s + p.amount, 0);
  const balance = totalFines - totalPayments;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Avatar url={playerSummary.avatar_url} name={playerSummary.name} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{playerSummary.full_name || playerSummary.name}</div>
            {playerSummary.alias && (
              <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)' }}>"{playerSummary.alias}"</div>
            )}
            <div style={{ fontSize: 13, marginTop: 2, color: balance > 0 ? '#e57373' : '#5a9e5a', fontWeight: 600 }}>
              Skyldig: {fmtKr(balance)}
            </div>
          </div>
        </div>

        {/* Summary row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Total bøder', value: fmtKr(totalFines) },
            { label: 'Indbetalt', value: fmtKr(totalPayments), color: '#5a9e5a' },
            { label: 'Skyldig', value: fmtKr(balance), color: balance > 0 ? '#e57373' : '#5a9e5a' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--cfc-text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: color || 'var(--cfc-text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {(['fines', 'payments'] as const).map(t => (
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
              {t === 'fines' ? `Bøder (${fines.length})` : `Indbetalinger (${payments.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
        ) : (
          <>
            {tab === 'fines' && (
              <div>
                {isTrainer && (
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ marginBottom: 10, width: '100%', justifyContent: 'center' }}
                    onClick={() => setShowAddFine(true)}
                  >
                    + Tildel bøde
                  </button>
                )}
                {fines.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--cfc-text-muted)', padding: '1.5rem', fontSize: 13 }}>Ingen bøder</div>
                )}
                {fines.map(f => (
                  <div key={f.id} style={{ borderBottom: '0.5px solid var(--cfc-border)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{f.fine_type_name}</div>
                      {f.event_title && (
                        <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', marginTop: 1 }}>
                          Kamp: {f.event_title}
                        </div>
                      )}
                      {f.note && (
                        <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', fontStyle: 'italic', marginTop: 1 }}>{f.note}</div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--cfc-text-subtle)', marginTop: 2 }}>
                        {fmtDate(f.created_at)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{fmtKr(f.amount)}</div>
                      {isTrainer && (
                        <button
                          className="btn btn-sm btn-danger"
                          style={{ marginTop: 4, fontSize: 10, padding: '2px 8px' }}
                          onClick={() => removeFine(f.id)}
                        >
                          Slet
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'payments' && (
              <div>
                {isTrainer && (
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ marginBottom: 10, width: '100%', justifyContent: 'center' }}
                    onClick={() => setShowAddPayment(true)}
                  >
                    + Registrer indbetaling
                  </button>
                )}
                {payments.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--cfc-text-muted)', padding: '1.5rem', fontSize: 13 }}>Ingen indbetalinger</div>
                )}
                {payments.map(p => (
                  <div key={p.id} style={{ borderBottom: '0.5px solid var(--cfc-border)', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: '#5a9e5a' }}>Indbetaling</div>
                      {p.note && (
                        <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', fontStyle: 'italic', marginTop: 1 }}>{p.note}</div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--cfc-text-subtle)', marginTop: 2 }}>
                        {fmtDate(p.created_at)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#5a9e5a' }}>+ {fmtKr(p.amount)}</div>
                      {isTrainer && (
                        <button
                          className="btn btn-sm btn-danger"
                          style={{ marginTop: 4, fontSize: 10, padding: '2px 8px' }}
                          onClick={() => removePayment(p.id)}
                        >
                          Slet
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="modal-footer" style={{ marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose}>Luk</button>
        </div>

        {/* Sub-modaler */}
        {showAddFine && (
          <AddFineModal
            playerId={playerSummary.player_id}
            playerName={playerSummary.name}
            fineTypes={fineTypes}
            onClose={() => { setShowAddFine(false); loadDetail(); }}
          />
        )}
        {showAddPayment && (
          <AddPaymentModal
            playerId={playerSummary.player_id}
            playerName={playerSummary.name}
            onClose={() => { setShowAddPayment(false); loadDetail(); }}
          />
        )}
      </div>
    </div>
  );
}

// ── AddFineModal ──────────────────────────────────────────────────────────────

function AddFineModal({
  playerId, playerName, fineTypes, onClose,
}: {
  playerId: string;
  playerName: string;
  fineTypes: FineType[];
  onClose: () => void;
}) {
  const [typeId, setTypeId] = useState('');
  const [note, setNote] = useState('');
  const [eventId, setEventId] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getEvents({ type: 'kamp' }).then(setEvents).catch(() => {});
  }, []);

  async function submit() {
    if (!typeId) { setError('Vælg bødetype'); return; }
    setSaving(true);
    try {
      await api.createFine({ player_id: playerId, fine_type_id: typeId, event_id: eventId || undefined, note: note || undefined });
      onClose();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-bg" style={{ zIndex: 1100 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Tildel bøde — {playerName}</h2>
        <div className="form-row">
          <label className="form-label">Bødetype</label>
          <select className="input" value={typeId} onChange={e => setTypeId(e.target.value)}>
            <option value="">Vælg bødetype...</option>
            {fineTypes.map(t => (
              <option key={t.id} value={t.id}>{t.name} — {fmtKr(t.amount)}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label className="form-label">Kamp / event (valgfri)</label>
          <select className="input" value={eventId} onChange={e => setEventId(e.target.value)}>
            <option value="">Ingen tilknytning</option>
            {events.slice(0, 30).map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.title} ({new Date(ev.start_time).toLocaleDateString('da-DK')})
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label className="form-label">Note (valgfri)</label>
          <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Fx 'semifinale mod Kolding'" />
        </div>
        {error && <p style={{ color: '#e57373', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuller</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '...' : 'Tildel'}</button>
        </div>
      </div>
    </div>
  );
}

// ── AddPaymentModal ───────────────────────────────────────────────────────────

function AddPaymentModal({
  playerId, playerName, onClose,
}: {
  playerId: string;
  playerName: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Angiv et beløb'); return; }
    setSaving(true);
    try {
      await api.createFinePayment({ player_id: playerId, amount: amt, note: note || undefined });
      onClose();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div className="modal-bg" style={{ zIndex: 1100 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Registrer indbetaling — {playerName}</h2>
        <div className="form-row">
          <label className="form-label">Beløb (kr.)</label>
          <input className="input" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="fx 75" />
        </div>
        <div className="form-row">
          <label className="form-label">Note (valgfri)</label>
          <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Fx 'MobilePay #1234'" />
        </div>
        {error && <p style={{ color: '#e57373', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuller</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '...' : 'Registrer'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Avatar helper ─────────────────────────────────────────────────────────────

function Avatar({ url, name, size = 36 }: { url?: string; name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--cfc-bg-hover)',
      border: '0.5px solid var(--cfc-border)',
      overflow: 'hidden', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 600, color: 'var(--cfc-text-muted)',
    }}>
      {url
        ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : name.charAt(0).toUpperCase()}
    </div>
  );
}
