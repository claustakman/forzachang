import { useState, useEffect, useCallback } from 'react';
import { api, Event, EventDetail, EventGuest, EventStatsResponse, MatchStatRow, Player, displayName } from '../lib/api';
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

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
}

function fmtWeekday(iso: string) {
  return new Date(iso).toLocaleDateString('da-DK', { weekday: 'short' }).toUpperCase();
}

function fmtDay(iso: string) {
  return new Date(iso).getDate().toString();
}

function fmtMonthShort(iso: string) {
  return new Date(iso).toLocaleDateString('da-DK', { month: 'short' }).toUpperCase();
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addMinutes(localDT: string, mins: number): string {
  const d = new Date(localDT);
  d.setMinutes(d.getMinutes() + mins);
  return toLocalInput(d.toISOString());
}

function addDays(localDT: string, days: number): string {
  const d = new Date(localDT);
  d.setDate(d.getDate() + days);
  return toLocalInput(d.toISOString());
}

function currentYear() { return new Date().getFullYear(); }

// ── Badges ────────────────────────────────────────────────────────────────────

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
      fontSize: 10, padding: '2px 7px', borderRadius: 100, fontWeight: 600,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      background: type === 'kamp' ? '#0f1a2e' : '#1a1200',
      color: type === 'kamp' ? '#5b8dd9' : '#c4a000',
    }}>{type}</span>
  );
}

// ── Detaljemodal ──────────────────────────────────────────────────────────────

function EventDetailModal({ event, onClose, onRefresh, isTrainer, isAdmin }: {
  event: Event;
  onClose: () => void;
  onRefresh: () => void;
  isTrainer: boolean;
  isAdmin: boolean;
}) {
  const { player } = useAuth();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [signing, setSigning] = useState<string | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [showRemind, setShowRemind] = useState(false);
  const [remindPlayers, setRemindPlayers] = useState<Player[]>([]);
  const [remindSelected, setRemindSelected] = useState<Set<string>>(new Set());
  const [reminding, setReminding] = useState(false);
  const [remindDone, setRemindDone] = useState<number | null>(null);

  useEffect(() => { loadDetail(); }, [event.id]);

  async function loadDetail() {
    try { setDetail(await api.getEvent(event.id)); } catch {}
  }

  async function doSignup(playerId: string, status: 'tilmeldt' | 'afmeldt', message?: string) {
    setSigning(playerId);
    try {
      await api.setEventSignup(event.id, status, message, playerId !== player!.id ? playerId : undefined);
      await loadDetail();
      onRefresh();
      setShowComment(false);
      setComment('');
    } catch (e: any) { alert(e.message); }
    setSigning(null);
  }

  async function doDelete(playerId: string) {
    setSigning(playerId);
    try {
      await api.deleteEventSignup(event.id, playerId !== player!.id ? playerId : undefined);
      await loadDetail();
      onRefresh();
    } catch (e: any) { alert(e.message); }
    setSigning(null);
  }

  async function doAddGuest() {
    if (!guestName.trim()) return;
    setAddingGuest(true);
    try {
      await api.addEventGuest(event.id, guestName.trim());
      setGuestName('');
      setShowGuestInput(false);
      await loadDetail();
      onRefresh();
    } catch (e: any) { alert(e.message); }
    setAddingGuest(false);
  }

  async function openRemind() {
    setShowRemind(true);
    setRemindDone(null);
    if (!detail) return;
    const ps = allPlayers.length > 0 ? allPlayers : await api.getPlayers().catch(() => [] as Player[]);
    if (allPlayers.length === 0) setAllPlayers(ps);
    const signedIds = new Set(detail.signups.map(s => s.player_id));
    const unsigned = ps.filter(p => p.active && !signedIds.has(p.id));
    setRemindPlayers(unsigned);
    setRemindSelected(new Set(unsigned.map(p => p.id)));
  }

  async function doRemind() {
    if (remindSelected.size === 0) return;
    setReminding(true);
    try {
      const res = await api.sendReminders(event.id, Array.from(remindSelected));
      setRemindDone(res.sent);
    } catch (e: any) { alert(e.message); }
    setReminding(false);
  }

  async function doDeleteGuest(guest: EventGuest) {
    try {
      await api.deleteEventGuest(event.id, guest.id);
      await loadDetail();
      onRefresh();
    } catch (e: any) { alert(e.message); }
  }

  const mySignup = detail?.signups.find(s => s.player_id === player!.id);
  const tilmeldte = detail?.signups.filter(s => s.status === 'tilmeldt') || [];
  const afmeldte  = detail?.signups.filter(s => s.status === 'afmeldt') || [];
  const guests    = detail?.guests || [];

  const isAfterDeadline = event.signup_deadline
    ? new Date() > new Date(event.signup_deadline)
    : false;

  const isKamp = event.type === 'kamp';

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
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--cfc-text-primary)', fontFamily: 'Georgia, serif' }}>
            {event.title}
          </h2>
          {/* Mødetid ved titel for kamp */}
          {event.meeting_time && (
            <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)', marginBottom: 4 }}>
              Mødetid: {fmtTime(event.meeting_time)} · Kamp: {fmtTime(event.start_time)}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)' }}>{fmtDateTime(event.start_time)}</div>
          {event.end_time && event.end_time !== event.start_time && (
            <div style={{ fontSize: 12, color: 'var(--cfc-text-subtle)' }}>til {fmtDateTime(event.end_time)}</div>
          )}
          {event.location && (
            <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginTop: 4 }}>📍 {event.location}</div>
          )}
          {event.result && (
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cfc-text-primary)', marginTop: 6 }}>
              Resultat: {event.result}
            </div>
          )}
          {/* Beskrivelse kun for events (ikke kamp) */}
          {!isKamp && event.description && (
            <p style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{event.description}</p>
          )}
          {event.signup_deadline && (
            <div style={{ fontSize: 12, color: isAfterDeadline ? '#e57373' : 'var(--cfc-text-subtle)', marginTop: 4 }}>
              Tilmeldingsfrist: {fmtDateShort(event.signup_deadline)}{isAfterDeadline ? ' (udløbet)' : ''}
            </div>
          )}
        </div>

        {/* Mine tilmeldingsknapper */}
        {event.status === 'aktiv' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, opacity: mySignup?.status === 'tilmeldt' ? 0.5 : 1 }}
                onClick={() => doSignup(player!.id, 'tilmeldt')}
                disabled={signing !== null || mySignup?.status === 'tilmeldt'}
              >
                {signing === player!.id ? '...' : '✓ Tilmeld mig'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, opacity: mySignup?.status === 'afmeldt' ? 0.5 : 1 }}
                onClick={() => doSignup(player!.id, 'afmeldt')}
                disabled={signing !== null || mySignup?.status === 'afmeldt'}
              >
                {signing === player!.id ? '...' : '✕ Afmeld mig'}
              </button>
              {mySignup && (
                <button
                  className="btn btn-secondary"
                  title="Annuller tilmelding"
                  onClick={() => doDelete(player!.id)}
                  disabled={signing !== null}
                  style={{ padding: '0 12px' }}
                >
                  ↩
                </button>
              )}
            </div>
            {/* Min status + kommentar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <SignupBadge status={mySignup?.status} />
              {mySignup?.message && (
                <span style={{
                  fontSize: 12,
                  color: '#c4a000',
                  background: '#1a1200',
                  border: '0.5px solid #3d2e00',
                  borderRadius: 6,
                  padding: '2px 8px',
                }}>"{mySignup.message}"</span>
              )}
              {mySignup?.status === 'tilmeldt' && (
                <button
                  onClick={() => setShowComment(c => !c)}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: '#5b8dd9', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                >
                  {showComment ? 'Luk' : '+ kommentar'}
                </button>
              )}
            </div>
            {showComment && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1, fontSize: 13 }}
                  placeholder="Fx 'kommer 30 min for sent'"
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSignup(player!.id, 'tilmeldt', comment)}
                />
                <button className="btn btn-sm btn-primary" onClick={() => doSignup(player!.id, 'tilmeldt', comment)}>
                  Gem
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tilmeldte/afmeldte/gæster */}
        {!detail ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><div className="spinner" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Tilmeldte inkl. gæster */}
            {(tilmeldte.length > 0 || guests.length > 0) && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5a9e5a', marginBottom: 6 }}>
                  Tilmeldte ({tilmeldte.length + guests.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {tilmeldte.map(s => (
                    <PlayerRow key={s.player_id} name={s.name} avatarUrl={s.avatar_url} message={s.message} />
                  ))}
                  {guests.map(g => (
                    <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cfc-bg-hover)', borderRadius: 20, padding: '3px 10px 3px 4px' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#1a1200', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#c4a000' }}>G</div>
                      <span style={{ fontSize: 13, color: 'var(--cfc-text-primary)' }}>{g.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--cfc-text-subtle)' }}>gæst</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Afmeldte */}
            {afmeldte.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#e57373', marginBottom: 6 }}>
                  Afmeldte ({afmeldte.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {afmeldte.map(s => (
                    <PlayerRow key={s.player_id} name={s.name} avatarUrl={s.avatar_url} />
                  ))}
                </div>
              </div>
            )}

            {/* Arrangører — kun for event-type */}
            {!isKamp && detail.organizers.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cfc-text-muted)', marginBottom: 6 }}>
                  Arrangører
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {detail.organizers.map(o => (
                    <span key={o.player_id} style={{ fontSize: 12, padding: '2px 8px', background: 'var(--cfc-bg-hover)', borderRadius: 100, color: 'var(--cfc-text-muted)' }}>
                      {o.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Admin-panel */}
        {isAdmin && (
          <div style={{ marginTop: 14, borderTop: '0.5px solid var(--cfc-border)', paddingTop: 12 }}>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                const next = !showAdmin;
                setShowAdmin(next);
                if (next && allPlayers.length === 0) {
                  api.getPlayers().then(setAllPlayers).catch(() => {});
                }
              }}
              style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
            >
              {showAdmin ? '▲ Luk administrer tilmeldinger' : '⚙ Administrer tilmeldinger'}
            </button>

            {showAdmin && detail && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Tilmeld/afmeld på vegne — alle aktive spillere */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cfc-text-muted)', marginBottom: 8 }}>
                    Tilmeld / afmeld spillere
                  </div>
                  {allPlayers.length === 0 ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px' }}><div className="spinner" /></div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {allPlayers.filter(p => p.active).map(p => {
                        const signup = detail.signups.find(s => s.player_id === p.id);
                        return (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ flex: 1, fontSize: 13, color: 'var(--cfc-text-primary)' }}>{displayName(p)}</span>
                            <SignupBadge status={signup?.status ?? null} />
                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                              <button
                                className="btn btn-sm"
                                style={{ padding: '2px 8px', fontSize: 11, opacity: signup?.status === 'tilmeldt' ? 0.4 : 1 }}
                                disabled={signing !== null || signup?.status === 'tilmeldt'}
                                onClick={() => doSignup(p.id, 'tilmeldt')}
                              >
                                Tilmeld
                              </button>
                              <button
                                className="btn btn-sm"
                                style={{ padding: '2px 8px', fontSize: 11, opacity: signup?.status === 'afmeldt' ? 0.4 : 1 }}
                                disabled={signing !== null || signup?.status === 'afmeldt'}
                                onClick={() => doSignup(p.id, 'afmeldt')}
                              >
                                Afmeld
                              </button>
                              {signup && (
                                <button className="btn btn-sm" style={{ padding: '2px 6px', fontSize: 11 }} disabled={signing !== null} onClick={() => doDelete(p.id)} title="Fjern tilmelding">
                                  ↩
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Tilføj gæst */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cfc-text-muted)', marginBottom: 8 }}>
                    Gæster ({guests.length})
                  </div>
                  {guests.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                      {guests.map(g => (
                        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--cfc-text-primary)' }}>{g.name}</span>
                          <button className="btn btn-sm" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => doDeleteGuest(g)}>
                            Fjern
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!showGuestInput ? (
                    <button className="btn btn-sm btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowGuestInput(true)}>
                      + Tilføj gæst
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        className="input"
                        style={{ flex: 1, fontSize: 13 }}
                        placeholder="Gæstens navn"
                        value={guestName}
                        onChange={e => setGuestName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && doAddGuest()}
                        autoFocus
                      />
                      <button className="btn btn-sm btn-primary" onClick={doAddGuest} disabled={addingGuest || !guestName.trim()}>
                        {addingGuest ? '...' : 'Tilføj'}
                      </button>
                      <button className="btn btn-sm btn-secondary" onClick={() => { setShowGuestInput(false); setGuestName(''); }}>
                        Annuller
                      </button>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}

        {/* Påmind-panel */}
        {isTrainer && showRemind && detail && (
          <div style={{ marginTop: 14, borderTop: '0.5px solid var(--cfc-border)', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c4a000', marginBottom: 8 }}>
              Send påmindelse
            </div>
            {remindDone !== null ? (
              <div style={{ color: '#5a9e5a', fontSize: 13, marginBottom: 8 }}>
                ✓ Påmindelse sendt til {remindDone} {remindDone === 1 ? 'spiller' : 'spillere'}
              </div>
            ) : remindPlayers.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)' }}>Alle spillere har allerede meldt ud.</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8, maxHeight: 160, overflowY: 'auto' }}>
                  {remindPlayers.map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={remindSelected.has(p.id)}
                        onChange={e => {
                          const next = new Set(remindSelected);
                          if (e.target.checked) next.add(p.id); else next.delete(p.id);
                          setRemindSelected(next);
                        }}
                      />
                      <span style={{ color: 'var(--cfc-text-primary)' }}>{displayName(p)}</span>
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={reminding || remindSelected.size === 0}
                    onClick={doRemind}
                    style={{ fontSize: 12 }}
                  >
                    {reminding ? '...' : `Send til ${remindSelected.size}`}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => setShowRemind(false)} style={{ fontSize: 12 }}>
                    Luk
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: 16 }}>
          {isTrainer && event.status === 'aktiv' && (
            <button
              className="btn btn-secondary"
              onClick={() => { if (!showRemind) { openRemind(); } else { setShowRemind(false); } }}
            >
              🔔 Påmind
            </button>
          )}
          {isTrainer && isKamp && new Date(event.start_time) < new Date() && (
            <button className="btn btn-secondary" onClick={() => setShowStats(true)}>
              📊 Statistik
            </button>
          )}
          {isTrainer && (
            <button className="btn btn-secondary" onClick={() => setEditing(true)}>Rediger</button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Luk</button>
        </div>
      </div>

      {editing && (
        <EventModal
          event={event}
          onClose={() => { setEditing(false); loadDetail(); onRefresh(); }}
          onDeleted={() => { onRefresh(); onClose(); }}
        />
      )}
      {showStats && (
        <MatchStatsModal
          event={event}
          onClose={() => setShowStats(false)}
        />
      )}
    </div>
  );
}

function PlayerRow({ name, avatarUrl, message }: { name: string; avatarUrl?: string; message?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--cfc-bg-hover)', borderRadius: 20, padding: '3px 10px 3px 4px' }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--cfc-border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
        {avatarUrl
          ? <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : name.charAt(0)}
      </div>
      <span style={{ fontSize: 13, color: 'var(--cfc-text-primary)' }}>{name}</span>
      {message && (
        <span style={{ fontSize: 11, color: '#c4a000', background: '#1a1200', border: '0.5px solid #3d2e00', borderRadius: 4, padding: '1px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
          {message}
        </span>
      )}
    </div>
  );
}

// ── Kampstatistik-modal ───────────────────────────────────────────────────────

function MatchStatsModal({ event, onClose }: { event: Event; onClose: () => void }) {
  const [data, setData] = useState<EventStatsResponse | null>(null);
  const [rows, setRows] = useState<Record<string, MatchStatRow>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getEventStats(event.id).then(d => {
      setData(d);
      // Pre-udfyld: eksisterende stats vinder, ellers brug auto_stats fra server
      const init: Record<string, MatchStatRow> = {};
      for (const s of d.signups) {
        const existing = d.stats.find(x => x.player_id === s.id);
        const auto = d.auto_stats?.find(x => x.player_id === s.id);
        init[s.id] = existing
          ? { player_id: s.id, goals: existing.goals, yellow_cards: existing.yellow_cards, red_cards: existing.red_cards, mom: existing.mom, played: existing.played, late_signup: existing.late_signup ?? 0, absence: existing.absence ?? 0 }
          : auto
          ? { ...auto }
          : { player_id: s.id, goals: 0, yellow_cards: 0, red_cards: 0, mom: 0, played: s.status === 'tilmeldt' ? 1 : 0, late_signup: 0, absence: s.status === 'afmeldt' ? 1 : 0 };
      }
      setRows(init);
    }).catch(() => {});
  }, [event.id]);

  function setField(playerId: string, field: keyof MatchStatRow, value: number) {
    setRows(r => ({ ...r, [playerId]: { ...r[playerId], [field]: value } }));
  }

  function setMom(playerId: string) {
    setRows(r => {
      const next = { ...r };
      for (const id of Object.keys(next)) {
        next[id] = { ...next[id], mom: id === playerId ? 1 : 0 };
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api.saveEventStats(event.id, Object.values(rows));
      setSaved(true);
      setTimeout(onClose, 1200);
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  const tilmeldte = data?.signups.filter(s => s.status === 'tilmeldt') || [];
  const afmeldte  = data?.signups.filter(s => s.status === 'afmeldt') || [];

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ color: 'var(--cfc-text-primary)', margin: '0 0 4px', fontFamily: 'Georgia, serif' }}>Kampstatistik</h2>
        <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginBottom: 16 }}>{event.title}</div>

        {!data ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
        ) : (
          <>
            {/* Tabel-header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 48px 48px 48px 52px 44px', gap: 4, alignItems: 'center', marginBottom: 6, paddingBottom: 6, borderBottom: '0.5px solid var(--cfc-border)' }}>
              <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', fontWeight: 600 }}>Spiller</div>
              <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', textAlign: 'center' }}>Mål</div>
              <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', textAlign: 'center' }}>🟨</div>
              <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', textAlign: 'center' }}>🟥</div>
              <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', textAlign: 'center' }}>MoM</div>
              <div style={{ fontSize: 11, color: 'var(--cfc-text-muted)', textAlign: 'center' }}>Spillet</div>
            </div>

            {/* Tilmeldte */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
              {tilmeldte.map(s => {
                const r = rows[s.id] || { player_id: s.id, goals: 0, yellow_cards: 0, red_cards: 0, mom: 0, played: 1 };
                return (
                  <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 48px 48px 48px 52px 44px', gap: 4, alignItems: 'center' }}>
                    <div style={{ fontSize: 13, color: 'var(--cfc-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                    {(['goals', 'yellow_cards', 'red_cards'] as const).map(field => (
                      <input key={field} type="number" min={0} max={20} value={r[field]} onChange={e => setField(s.id, field, Number(e.target.value))}
                        className="input" style={{ padding: '4px 6px', textAlign: 'center', fontSize: 13 }} />
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <input type="radio" name="mom" checked={r.mom === 1} onChange={() => setMom(s.id)}
                        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#c4a000' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <input type="checkbox" checked={r.played === 1} onChange={e => setField(s.id, 'played', e.target.checked ? 1 : 0)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Afmeldte (vises grå, played=0) */}
            {afmeldte.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '0.5px solid var(--cfc-border)' }}>
                <div style={{ fontSize: 11, color: 'var(--cfc-text-subtle)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Afbud ({afmeldte.length})
                </div>
                {afmeldte.map(s => (
                  <div key={s.id} style={{ fontSize: 12, color: 'var(--cfc-text-subtle)', padding: '2px 0' }}>{s.name}</div>
                ))}
              </div>
            )}
          </>
        )}

        <div className="modal-footer" style={{ marginTop: 16 }}>
          {saved && <span style={{ fontSize: 13, color: '#5a9e5a' }}>✓ Gemt!</span>}
          <button className="btn btn-secondary" onClick={onClose}>Annuller</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !data}>
            {saving ? '...' : 'Gem statistik'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hoved-komponent ───────────────────────────────────────────────────────────

type QuickFilter = '' | 'frist14' | 'manglende';

export default function Matches() {
  const { player } = useAuth();
  const isTrainer = player?.role === 'trainer' || player?.role === 'admin';
  const isAdmin   = player?.role === 'admin';
  const [tab, setTab] = useState<'kommende' | 'historik'>('kommende');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('');
  const [typeFilter, setTypeFilter] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('');
  const [q, setQ] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Event | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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

  const now = new Date();
  const in14days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const urgentUnanswered = events.filter(e =>
    e.my_status == null &&
    e.status === 'aktiv' &&
    e.signup_deadline &&
    new Date(e.signup_deadline) >= now &&
    new Date(e.signup_deadline) <= in14days
  );

  const displayed = events.filter(ev => {
    if (quickFilter === '') return true;
    if (quickFilter === 'frist14') {
      if (!ev.signup_deadline) return false;
      const dl = new Date(ev.signup_deadline);
      return dl >= now && dl <= in14days;
    }
    if (quickFilter === 'manglende') return ev.my_status == null && ev.status === 'aktiv';
    return true;
  });

  const quickFilters: { key: QuickFilter; label: string }[] = [
    { key: '',           label: 'Alle' },
    { key: 'frist14',    label: 'Frist inden 14 dage' },
    { key: 'manglende',  label: 'Manglende tilmelding' },
  ];

  return (
    <div className="page" style={{ color: 'var(--cfc-text-primary)' }}>
      {/* Reminder-banner */}
      {tab === 'kommende' && urgentUnanswered.length > 0 && (
        <div style={{
          background: '#1a1200', border: '0.5px solid #c4a000', borderRadius: 8,
          padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#c4a000',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span>⚠️</span>
          Du mangler at tilmelde dig {urgentUnanswered.length} {urgentUnanswered.length === 1 ? 'event' : 'events'} med tilmeldingsfrist inden for de næste 2 uger.
        </div>
      )}

      {/* Opret-knap */}
      {isTrainer && (
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }} onClick={() => setShowCreate(true)}>
          + Opret event / kamp
        </button>
      )}

      {/* Hoved-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {(['kommende', 'historik'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setQuickFilter(''); }} className="btn btn-sm" style={{
            background: tab === t ? 'var(--cfc-bg-hover)' : 'transparent',
            color: tab === t ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
            border: `0.5px solid ${tab === t ? 'var(--cfc-border)' : 'transparent'}`,
            textTransform: 'capitalize',
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Hurtigfiltre */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {quickFilters.map(({ key, label }) => (
          <button key={key} onClick={() => setQuickFilter(key)} className="btn btn-sm" style={{
            background: quickFilter === key ? 'var(--cfc-bg-hover)' : 'transparent',
            color: quickFilter === key ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
            border: `0.5px solid ${quickFilter === key ? 'var(--cfc-border)' : 'transparent'}`,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Søg + filtre */}
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
      ) : displayed.length === 0 ? (
        <div className="empty">Ingen events matcher filteret.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayed.map(ev => (
            <EventRow
              key={ev.id}
              event={ev}
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
          isTrainer={isTrainer}
          isAdmin={isAdmin}
        />
      )}

      {showCreate && (
        <EventModal onClose={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}

// ── EventRow ──────────────────────────────────────────────────────────────────

function EventRow({ event: ev, onClick }: {
  event: Event;
  onClick: () => void;
}) {
  const now = new Date();
  const in8days = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
  const isUrgent = ev.my_status == null && ev.status === 'aktiv' &&
    new Date(ev.start_time) > now && new Date(ev.start_time) <= in8days;

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left',
        background: isUrgent ? '#1a1200' : 'var(--cfc-bg-card)',
        border: `0.5px solid ${isUrgent ? '#c4a000' : 'var(--cfc-border)'}`,
        borderRadius: 10, cursor: 'pointer', padding: '12px 14px',
        display: 'flex', alignItems: 'stretch', gap: 14,
        opacity: ev.status === 'aflyst' ? 0.5 : 1,
        color: 'var(--cfc-text-primary)',
      }}
    >
      {/* Dato-kolonne */}
      <div style={{
        width: 48, flexShrink: 0, textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        borderRight: '0.5px solid var(--cfc-border)', paddingRight: 12,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--cfc-text-muted)', letterSpacing: '0.08em', marginBottom: 2 }}>
          {fmtWeekday(ev.start_time)}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: 'var(--cfc-text-primary)', fontFamily: 'Georgia, serif' }}>
          {fmtDay(ev.start_time)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--cfc-text-muted)', letterSpacing: '0.06em', marginTop: 2 }}>
          {fmtMonthShort(ev.start_time)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--cfc-text-primary)', marginTop: 4 }}>
          {fmtTime(ev.start_time)}
        </div>
      </div>

      {/* Indhold */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <TypeBadge type={ev.type} />
          {ev.status === 'aflyst' && <span style={{ fontSize: 10, color: '#e57373', fontWeight: 700 }}>AFLYST</span>}
        </div>
        <div style={{ fontWeight: isUrgent ? 800 : 700, fontSize: 15, color: isUrgent ? '#c4a000' : 'var(--cfc-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Georgia, serif' }}>
          {ev.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)', display: 'flex', flexWrap: 'wrap', gap: '0 6px' }}>
          {ev.meeting_time && (
            <span>Mødetid {fmtTime(ev.meeting_time)}</span>
          )}
          {ev.location && <span>📍 {ev.location}</span>}
          {ev.result && <strong style={{ color: 'var(--cfc-text-primary)' }}>{ev.result}</strong>}
        </div>
      </div>

      {/* Højre kolonne: status + tilmeldte */}
      <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 6 }}>
        <SignupBadge status={ev.my_status} />
        {ev.signup_count != null && ev.signup_count > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#162416', border: '0.5px solid #2a4a2a',
            borderRadius: 20, padding: '3px 10px',
          }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#5a9e5a', lineHeight: 1 }}>{ev.signup_count}</span>
            <span style={{ fontSize: 10, color: '#5a9e5a', fontWeight: 600 }}>med</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ── EventModal (opret / rediger) ──────────────────────────────────────────────

function EventModal({ event, onClose, onDeleted }: { event?: Event; onClose: () => void; onDeleted?: () => void }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [form, setForm] = useState({
    type:            event?.type || 'kamp',
    title:           event?.title || '',
    description:     event?.description || '',
    location:        event?.location || '',
    start_time:      event?.start_time ? toLocalInput(event.start_time) : '',
    end_time:        event?.end_time ? toLocalInput(event.end_time) : '',
    meeting_time:    event?.meeting_time ? toLocalInput(event.meeting_time) : '',
    signup_deadline: event?.signup_deadline ? toLocalInput(event.signup_deadline) : '',
    season:          event?.season?.toString() || new Date().getFullYear().toString(),
    status:          event?.status || 'aktiv',
    result:          event?.result || '',
  });
  const [organizerIds, setOrganizerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPlayers().then(setPlayers).catch(() => {});
  }, []);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function onStartTimeChange(v: string) {
    const updated: Partial<typeof form> = { start_time: v };
    if (!form.end_time || form.end_time === form.start_time) updated.end_time = v;
    updated.meeting_time = v ? addMinutes(v, -40) : '';
    updated.signup_deadline = v ? addDays(v, -7) : '';
    setForm(f => ({ ...f, ...updated }));
  }

  function toggleOrganizer(id: string) {
    setOrganizerIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  }

  async function submit() {
    if (!form.title || !form.start_time) { setError('Titel og starttidspunkt er påkrævet'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        season: Number(form.season),
        end_time: form.end_time || undefined,
        meeting_time: form.meeting_time || undefined,
        signup_deadline: form.signup_deadline || undefined,
        result: form.result || undefined,
        organizer_ids: organizerIds,
      };
      if (event) {
        await api.updateEvent(event.id, payload);
      } else {
        await api.createEvent(payload);
      }
      onClose();
    } catch (e: any) { setError(e.message); setSaving(false); }
  }

  const isKamp = form.type === 'kamp';

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ color: 'var(--cfc-text-primary)' }}>{event ? 'Rediger event' : 'Opret event / kamp'}</h2>

        <div className="form-row">
          <label className="form-label">Type</label>
          <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
            <option value="kamp">Kamp</option>
            <option value="event">Event</option>
          </select>
        </div>

        <div className="form-row">
          <label className="form-label">Titel</label>
          <input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder={isKamp ? 'fx AGF' : 'fx Julefrokost'} />
        </div>
        <div className="form-row">
          <label className="form-label">Sted</label>
          <input className="input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="fx Bislett Stadion" />
        </div>

        {/* Beskrivelse kun for events */}
        {!isKamp && (
          <div className="form-row">
            <label className="form-label">Beskrivelse</label>
            <textarea className="input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} style={{ resize: 'vertical' }} />
          </div>
        )}

        <div className="form-row">
          <label className="form-label">Resultat</label>
          <input className="input" value={form.result} onChange={e => set('result', e.target.value)} placeholder="fx 3-1" />
        </div>

        {/* Starttidspunkt */}
        <div className="form-row">
          <label className="form-label">Starttidspunkt</label>
          <input type="datetime-local" className="input" value={form.start_time} onChange={e => onStartTimeChange(e.target.value)} />
        </div>

        {[
          { key: 'end_time',        label: 'Sluttidspunkt' },
          { key: 'meeting_time',    label: 'Mødetid' },
          { key: 'signup_deadline', label: 'Tilmeldingsfrist' },
        ].map(({ key, label }) => (
          <div key={key} className="form-row">
            <label className="form-label">{label}</label>
            <input type="datetime-local" className="input" value={(form as any)[key]} onChange={e => set(key, e.target.value)} />
          </div>
        ))}

        <div className="form-row">
          <label className="form-label">Sæson</label>
          <input className="input" value={form.season} onChange={e => set('season', e.target.value)} />
        </div>

        {event && (
          <div className="form-row">
            <label className="form-label">Status</label>
            <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="aktiv">Aktiv</option>
              <option value="aflyst">Aflyst</option>
            </select>
          </div>
        )}

        {/* Arrangører kun for events */}
        {!isKamp && players.length > 0 && (
          <div className="form-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <label className="form-label" style={{ marginBottom: 6 }}>Arrangører</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {players.map(p => (
                <button key={p.id} type="button" onClick={() => toggleOrganizer(p.id)} style={{
                  fontSize: 12, padding: '3px 10px', borderRadius: 100, cursor: 'pointer',
                  background: organizerIds.includes(p.id) ? '#162416' : 'var(--cfc-bg-hover)',
                  color: organizerIds.includes(p.id) ? '#5a9e5a' : 'var(--cfc-text-muted)',
                  border: `0.5px solid ${organizerIds.includes(p.id) ? '#5a9e5a' : 'var(--cfc-border)'}`,
                }}>
                  {displayName(p)}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p style={{ color: '#e57373', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        <div className="modal-footer">
          {event && (
            <button
              className="btn btn-secondary"
              style={{ marginRight: 'auto', color: '#e57373', borderColor: '#e57373' }}
              onClick={async () => {
                if (!confirm(`Slet "${event.title}"? Dette kan ikke fortrydes.`)) return;
                try {
                  await api.deleteEvent(event.id);
                  onDeleted ? onDeleted() : onClose();
                } catch (e: any) { setError(e.message); }
              }}
            >
              🗑️ Slet
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Annuller</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '...' : event ? 'Gem' : 'Opret'}</button>
        </div>
      </div>
    </div>
  );
}
