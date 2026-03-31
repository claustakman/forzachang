import { useState, useEffect, useCallback } from 'react';
import { api, Event, EventDetail } from '../lib/api';
import { useAuth } from '../lib/auth';

// ── Hjælpefunktioner ──────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })
    + ' kl. ' + d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
}

function currentYear() { return new Date().getFullYear(); }

// ── Statusbadge ───────────────────────────────────────────────────────────────

function SignupBadge({ status }: { status?: 'tilmeldt' | 'afmeldt' | null }) {
  if (status === 'tilmeldt') return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: '#162416', color: '#5a9e5a', fontWeight: 600 }}>Tilmeldt</span>
  );
  if (status === 'afmeldt') return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: '#2a1010', color: '#e57373', fontWeight: 600 }}>Afmeldt</span>
  );
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'var(--cfc-bg-hover)', color: 'var(--cfc-text-subtle)' }}>Ikke meldt ud</span>
  );
}

function TypeBadge({ type }: { type: 'kamp' | 'event' }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 100, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
      background: type === 'kamp' ? '#0f1a2e' : '#1a1200',
      color: type === 'kamp' ? '#5b8dd9' : '#c4a000',
    }}>{type}</span>
  );
}

// ── Detailview modal ──────────────────────────────────────────────────────────

function EventDetailModal({ event, onClose, onRefresh, isTrainer }: {
  event: Event;
  onClose: () => void;
  onRefresh: () => void;
  isTrainer: boolean;
}) {
  const { player } = useAuth();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [signing, setSigning] = useState(false);
  const [message, setMessage] = useState('');
  const [showMsg, setShowMsg] = useState(false);

  useEffect(() => { loadDetail(); }, [event.id]);

  async function loadDetail() {
    try { setDetail(await api.getEvent(event.id)); } catch {}
  }

  async function signup(status: 'tilmeldt' | 'afmeldt') {
    setSigning(true);
    try {
      await api.setEventSignup(event.id, status, message || undefined);
      await loadDetail();
      onRefresh();
      setShowMsg(false);
      setMessage('');
    } catch (e: any) { alert(e.message); }
    setSigning(false);
  }

  const mySignup = detail?.signups.find(s => s.player_id === player!.id);
  const tilmeldte = detail?.signups.filter(s => s.status === 'tilmeldt') || [];
  const afmeldte  = detail?.signups.filter(s => s.status === 'afmeldt') || [];

  const isAfterDeadline = event.signup_deadline
    ? new Date() > new Date(event.signup_deadline)
    : false;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <TypeBadge type={event.type} />
            {event.status === 'aflyst' && (
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 100, background: '#2a1010', color: '#e57373', fontWeight: 600 }}>AFLYST</span>
            )}
          </div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{event.title}</h2>
          <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)' }}>{fmtDateTime(event.start_time)}</div>
          {event.end_time && event.end_time !== event.start_time && (
            <div style={{ fontSize: 12, color: 'var(--cfc-text-subtle)' }}>til {fmtDateTime(event.end_time)}</div>
          )}
          {event.meeting_time && (
            <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)', marginTop: 2 }}>
              Mødetid: {fmtDateTime(event.meeting_time)}
            </div>
          )}
          {event.location && (
            <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginTop: 4 }}>📍 {event.location}</div>
          )}
          {event.result && (
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cfc-text-primary)', marginTop: 6 }}>
              Resultat: {event.result}
            </div>
          )}
          {event.description && (
            <p style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{event.description}</p>
          )}
          {event.signup_deadline && (
            <div style={{ fontSize: 12, color: isAfterDeadline ? '#e57373' : 'var(--cfc-text-subtle)', marginTop: 4 }}>
              Tilmeldingsfrist: {fmtDateShort(event.signup_deadline)}{isAfterDeadline ? ' (udløbet)' : ''}
            </div>
          )}
        </div>

        {/* Tilmeldingsknapper */}
        {event.status === 'aktiv' && !isAfterDeadline && (
          <div style={{ marginBottom: 16 }}>
            {showMsg ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  className="input"
                  placeholder="Valgfri besked (fx 'kommer 30 min for sent')"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => signup('tilmeldt')} disabled={signing}>
                    {signing ? '...' : 'Tilmeld'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => { setShowMsg(false); setMessage(''); }}>
                    Annuller
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                {mySignup?.status !== 'tilmeldt' && (
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowMsg(true)} disabled={signing}>
                    Tilmeld mig
                  </button>
                )}
                {mySignup?.status !== 'afmeldt' && (
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => signup('afmeldt')} disabled={signing}>
                    Afmeld mig
                  </button>
                )}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <SignupBadge status={mySignup?.status} />
              {mySignup?.message && (
                <span style={{ fontSize: 12, color: 'var(--cfc-text-muted)', marginLeft: 8 }}>"{mySignup.message}"</span>
              )}
            </div>
          </div>
        )}

        {/* Tilmeldte */}
        {!detail ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><div className="spinner" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SignupGroup label={`Tilmeldte (${tilmeldte.length})`} signups={tilmeldte} color="#5a9e5a" />
            <SignupGroup label={`Afmeldte (${afmeldte.length})`} signups={afmeldte} color="#e57373" />
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose}>Luk</button>
        </div>
      </div>
    </div>
  );
}

function SignupGroup({ label, signups, color }: {
  label: string;
  signups: { player_id: string; name: string; avatar_url?: string; message?: string }[];
  color: string;
}) {
  if (signups.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {signups.map(s => (
          <div key={s.player_id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cfc-bg-hover)', borderRadius: 20, padding: '3px 10px 3px 4px' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--cfc-border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
              {s.avatar_url
                ? <img src={s.avatar_url} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : s.name.charAt(0)}
            </div>
            <span style={{ fontSize: 13 }}>{s.name.split(' ')[0]}</span>
            {s.message && <span style={{ fontSize: 11, color: 'var(--cfc-text-subtle)' }}>· {s.message}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hoved-komponent ───────────────────────────────────────────────────────────

export default function Matches() {
  const { player } = useAuth();
  const [tab, setTab] = useState<'kommende' | 'historik'>('kommende');
  const [typeFilter, setTypeFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [q, setQ] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Event | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { tab };
      if (typeFilter) params.type = typeFilter;
      if (seasonFilter) params.season = seasonFilter;
      if (q) params.q = q;
      setEvents(await api.getEvents(params));
    } catch {}
    setLoading(false);
  }, [tab, typeFilter, seasonFilter, q]);

  useEffect(() => { load(); }, [load]);

  const unanswered = events.filter(e => e.my_status == null && e.status === 'aktiv');

  return (
    <div className="page">
      {/* Reminder-banner */}
      {tab === 'kommende' && unanswered.length > 0 && (
        <div style={{
          background: '#1a1200', border: '0.5px solid #c4a000', borderRadius: 8,
          padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#c4a000',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⚠️</span>
          Du mangler at tilmelde dig {unanswered.length} {unanswered.length === 1 ? 'event' : 'events'}.
        </div>
      )}

      {/* Hoved-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {(['kommende', 'historik'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="btn btn-sm" style={{
            background: tab === t ? 'var(--cfc-bg-hover)' : 'transparent',
            color: tab === t ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
            border: `0.5px solid ${tab === t ? 'var(--cfc-border)' : 'transparent'}`,
            textTransform: 'capitalize',
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Filtre */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: 1, minWidth: 120, fontSize: 13 }}
          placeholder="Søg..."
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <select className="input" style={{ width: 110, fontSize: 13 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">Alle typer</option>
          <option value="kamp">Kampe</option>
          <option value="event">Events</option>
        </select>
        <select className="input" style={{ width: 90, fontSize: 13 }} value={seasonFilter} onChange={e => setSeasonFilter(e.target.value)}>
          <option value="">Alle sæsoner</option>
          {[currentYear(), currentYear() - 1, currentYear() - 2].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
      ) : events.length === 0 ? (
        <div className="empty">Ingen {tab === 'kommende' ? 'kommende' : 'tidligere'} events.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {events.map((ev, i) => (
            <EventRow
              key={ev.id}
              event={ev}
              isLast={i === events.length - 1}
              onClick={() => setSelected(ev)}
            />
          ))}
        </div>
      )}

      {selected && (
        <EventDetailModal
          event={selected}
          onClose={() => setSelected(null)}
          onRefresh={load}
          isTrainer={player?.role === 'trainer' || player?.role === 'admin'}
        />
      )}
    </div>
  );
}

function EventRow({ event: ev, isLast, onClick }: {
  event: Event;
  isLast: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
        borderBottom: isLast ? 'none' : '0.5px solid var(--cfc-border)',
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        opacity: ev.status === 'aflyst' ? 0.5 : 1,
      }}
    >
      {/* Dato-kolonne */}
      <div style={{ width: 44, flexShrink: 0, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: 'var(--cfc-text-primary)' }}>
          {new Date(ev.start_time).getDate()}
        </div>
        <div style={{ fontSize: 10, color: 'var(--cfc-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {new Date(ev.start_time).toLocaleDateString('da-DK', { month: 'short' })}
        </div>
      </div>

      {/* Indhold */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <TypeBadge type={ev.type} />
          {ev.status === 'aflyst' && <span style={{ fontSize: 10, color: '#e57373' }}>AFLYST</span>}
        </div>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {ev.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)' }}>
          {new Date(ev.start_time).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}
          {ev.location && <> · {ev.location}</>}
          {ev.result && <> · <strong>{ev.result}</strong></>}
        </div>
      </div>

      {/* Højre: tilmeldingsstatus + antal */}
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <SignupBadge status={ev.my_status} />
        {ev.signup_count != null && (
          <div style={{ fontSize: 11, color: 'var(--cfc-text-subtle)', marginTop: 3 }}>
            {ev.signup_count} tilmeldt{ev.signup_count !== 1 ? 'e' : ''}
          </div>
        )}
      </div>
    </button>
  );
}
