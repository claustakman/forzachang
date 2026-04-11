// Fase 12: Kampens Spiller afstemning — med 60s timer og setup-fase
import { useState, useEffect, useRef, useCallback } from 'react';
import { api, Event, VoteSession, VotePlayer, VoteResult } from '../lib/api';
import { useAuth } from '../lib/auth';

// ── Hjælpere ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Avatar({ name, url, size = 40 }: { name: string; url?: string; size?: number }) {
  const colors = ['#1D9E75', '#0C447C', '#7A5800', '#B71C1C', '#6B21A8'];
  const color = colors[(name.charCodeAt(0) + (name.charCodeAt(1) || 0)) % colors.length];
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (url) {
    return (
      <img src={url} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color + '22',
      color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.38, flexShrink: 0, border: `1.5px solid ${color}44`,
    }}>
      {initials}
    </div>
  );
}

// ── Nedtællingscirkel ─────────────────────────────────────────────────────────

function Countdown({ endsAt }: { endsAt: string }) {
  const [secsLeft, setSecsLeft] = useState(() =>
    Math.max(0, Math.round((new Date(endsAt + 'Z').getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const iv = setInterval(() => {
      setSecsLeft(Math.max(0, Math.round((new Date(endsAt + 'Z').getTime() - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(iv);
  }, [endsAt]);

  const total = 60;
  const pct = secsLeft / total;
  const r = 48;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  const color = secsLeft > 20 ? '#1D9E75' : secsLeft > 10 ? '#7A5800' : '#B71C1C';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '20px 0' }}>
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        <svg width={120} height={120} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={60} cy={60} r={r} fill="none" stroke="#e0e0e0" strokeWidth={8} />
          <circle cx={60} cy={60} r={r} fill="none" stroke={color} strokeWidth={8}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.25s linear, stroke 0.3s' }} />
        </svg>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          fontFamily: 'Georgia, serif', fontSize: 38, fontWeight: 800, color, lineHeight: 1,
        }}>
          {secsLeft}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--cfc-text-muted)' }}>sekunder tilbage</div>
    </div>
  );
}

// ── PlayerToggleList ──────────────────────────────────────────────────────────
// Viser alle spillere (tilmeldte + ekstra) som toggle-liste.
// Ekstra spillere (ikke tilmeldte) tilføjes via en simpel liste uden søgefelt.

function PlayerToggleList({
  label, players, enabled, onToggle, allPlayers, onAdd,
}: {
  label: string;
  players: VotePlayer[];           // Alle der vises i listen (tilmeldte + tilføjede)
  enabled: Set<string>;
  onToggle: (id: string) => void;
  allPlayers: VotePlayer[];        // Alle aktive spillere (til "tilføj"-listen)
  onAdd: (p: VotePlayer) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const count = players.filter(p => enabled.has(p.id)).length;
  const addable = allPlayers.filter(p => !players.some(ep => ep.id === p.id));

  return (
    <div style={{ background: '#ffffff', borderRadius: 12, border: '0.5px solid #e0e0e0', overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '0.5px solid #f0f0ee' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--cfc-text-primary)' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1D9E75' }}>{count} valgt</span>
      </div>

      <div>
        {players.map(p => {
          const on = enabled.has(p.id);
          return (
            <button key={p.id} onClick={() => onToggle(p.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '10px 16px', background: 'none', border: 'none',
                borderBottom: '0.5px solid #f5f5f3', cursor: 'pointer',
                textAlign: 'left', minHeight: 52, opacity: on ? 1 : 0.42,
              }}>
              <Avatar name={p.name} url={p.avatar_url} size={36} />
              <span style={{ flex: 1, fontSize: 15, color: 'var(--cfc-text-primary)', fontWeight: on ? 500 : 400 }}>{p.name}</span>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: on ? '#1D9E75' : '#e0e0e0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s', flexShrink: 0,
              }}>
                {on && <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>✓</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Tilføj ekstra spillere — vis som simpel liste uden søgefelt */}
      {addable.length > 0 && (
        <div style={{ borderTop: '0.5px solid #f0f0ee', padding: '8px 16px' }}>
          {!showAdd ? (
            <button onClick={() => setShowAdd(true)}
              style={{ background: 'none', border: 'none', color: '#1D9E75', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '6px 0', minHeight: 44 }}>
              + Tilføj spiller
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)', marginBottom: 8, fontWeight: 600 }}>
                Vælg spiller at tilføje:
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {addable.map(p => (
                  <button key={p.id} onClick={() => { onAdd(p); setShowAdd(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '8px 12px', background: '#f5f5f3', border: '0.5px solid #e0e0e0',
                      borderRadius: 8, cursor: 'pointer', textAlign: 'left', minHeight: 48,
                    }}>
                    <Avatar name={p.name} url={p.avatar_url} size={32} />
                    <span style={{ fontSize: 14, color: 'var(--cfc-text-primary)', fontWeight: 500 }}>{p.name}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAdd(false)}
                style={{ fontSize: 13, color: 'var(--cfc-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', marginTop: 4 }}>
                Annuller
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Hoved-komponent ───────────────────────────────────────────────────────────

type PageState =
  | { kind: 'idle' }
  | { kind: 'setup'; event: Event | null; allPlayers: VotePlayer[] }   // event=null → ad-hoc
  | { kind: 'voting'; session: VoteSession }
  | { kind: 'results'; session: VoteSession; results: VoteResult[]; total: number; myVote: string | null };

const isTrainerRole = (role?: string) => role === 'trainer' || role === 'admin';

export default function Afstemning() {
  const { player } = useAuth();

  const [state, setState] = useState<PageState>({ kind: 'idle' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentMatches, setRecentMatches] = useState<Event[]>([]);

  // Setup state
  const [votersList, setVotersList] = useState<VotePlayer[]>([]);
  const [candidatesList, setCandidatesList] = useState<VotePlayer[]>([]);
  const [votersEnabled, setVotersEnabled] = useState<Set<string>>(new Set());
  const [candidatesEnabled, setCandidatesEnabled] = useState<Set<string>>(new Set());
  const [duration, setDuration] = useState(60); // sekunder
  const [adHocTitle, setAdHocTitle] = useState(''); // titel til ad-hoc afstemning

  // Voting state
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [voted, setVoted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  const doPoll = useCallback(async () => {
    try {
      const data = await api.getActiveVoteSession();
      if (!data.session) {
        setState(prev => prev.kind === 'voting' ? { kind: 'idle' } : prev);
        stopPoll();
        return;
      }
      const s = data.session;
      if (s.status === 'closed') {
        stopPoll();
        const res = await api.getVoteResults(s.id);
        setState({ kind: 'results', session: s, results: res.results, total: res.total_votes, myVote: res.my_vote });
      } else {
        setState(prev => prev.kind === 'voting' ? { kind: 'voting', session: s } : prev);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (state.kind === 'voting') {
      if (!pollRef.current) pollRef.current = setInterval(doPoll, 2000);
    } else {
      stopPoll();
    }
    return stopPoll;
  }, [state.kind, doPoll]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api.getActiveVoteSession();
        if (data.session) {
          const s = data.session;
          if (s.status === 'active') {
            setState({ kind: 'voting', session: s });
          } else {
            const res = await api.getVoteResults(s.id);
            setState({ kind: 'results', session: s, results: res.results, total: res.total_votes, myVote: res.my_vote });
          }
          setLoading(false);
          return;
        }
        // Hent kampe fra begge tabs: historik (seneste 7 dage) + kommende (i dag)
        const [hist, komm] = await Promise.all([
          api.getEvents({ tab: 'historik', type: 'kamp' }),
          api.getEvents({ tab: 'kommende', type: 'kamp' }),
        ]);
        const now = new Date();
        const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);
        const allKampe = [...hist, ...komm];
        const seen = new Set<string>();
        const matches = allKampe
          .filter(e => e.status === 'aktiv')
          .filter(e => { const d = new Date(e.start_time); return d >= cutoff && d <= endOfToday; })
          .filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
          .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
        setRecentMatches(matches);
        setState({ kind: 'idle' });
      } catch (e: any) {
        setError(e.message || 'Fejl ved indlæsning');
        setState({ kind: 'idle' });
      }
      setLoading(false);
    })();
  }, []);

  // ── Vælg kamp → setup ─────────────────────────────────────────────────────
  async function handleSelectMatch(event: Event | null) {
    setError(null);
    setLoading(true);
    try {
      const [detail, playersData] = await Promise.all([
        event ? api.getEvent(event.id) : Promise.resolve(null),
        api.getPlayers(),
      ]);

      const allPlayers: VotePlayer[] = playersData
        .filter(p => p.active && p.id !== 'admin')
        .map(p => ({ id: p.id, name: p.alias?.trim() || p.name, avatar_url: p.avatar_url }));

      if (event && detail) {
        const signups: VotePlayer[] = detail.signups
          .filter(s => s.status === 'tilmeldt' && s.player_id !== 'admin')
          .map(s => ({ id: s.player_id, name: s.name, avatar_url: s.avatar_url }));
        const ids = new Set(signups.map(p => p.id));
        setVotersList([...signups]);
        setCandidatesList([...signups]);
        setVotersEnabled(new Set(ids));
        setCandidatesEnabled(new Set(ids));
      } else {
        // Ad-hoc: start med tom liste
        setVotersList([]);
        setCandidatesList([]);
        setVotersEnabled(new Set());
        setCandidatesEnabled(new Set());
        setAdHocTitle('');
      }
      setState({ kind: 'setup', event, allPlayers });
    } catch (e: any) {
      setError(e.message || 'Fejl');
    }
    setLoading(false);
  }

  // ── Start afstemning ───────────────────────────────────────────────────────
  async function handleStart() {
    if (state.kind !== 'setup') return;
    const candidateIds = candidatesList.filter(p => candidatesEnabled.has(p.id)).map(p => p.id);
    const voterIds = votersList.filter(p => votersEnabled.has(p.id)).map(p => p.id);
    if (candidateIds.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      await api.createVoteSession(
        state.event?.id ?? null,
        candidateIds, voterIds, duration,
        state.event ? undefined : (adHocTitle.trim() || 'Ad-hoc afstemning')
      );
      const data = await api.getActiveVoteSession();
      if (data.session) setState({ kind: 'voting', session: data.session });
    } catch (e: any) {
      setError(e.message || 'Fejl ved opstart');
    }
    setSubmitting(false);
  }

  // ── Afgiv stemme ───────────────────────────────────────────────────────────
  async function handleVote() {
    if (state.kind !== 'voting' || !selectedCandidate) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.castVote(state.session.id, selectedCandidate);
      setVoted(true);
    } catch (e: any) {
      setError(e.message || 'Fejl ved stemmeafgivelse');
    }
    setSubmitting(false);
  }

  function handleBack() {
    stopPoll();
    setError(null);
    setSelectedCandidate(null);
    setVoted(false);
    setState({ kind: 'idle' });
  }

  async function handleDeleteSession(sessionId: string) {
    if (!confirm('Slet afstemning? Dette kan ikke fortrydes.')) return;
    try {
      await api.deleteVoteSession(sessionId);
      setState({ kind: 'idle' });
      // Genindlæs kamplisten
      const [hist2, komm2] = await Promise.all([
        api.getEvents({ tab: 'historik', type: 'kamp' }),
        api.getEvents({ tab: 'kommende', type: 'kamp' }),
      ]);
      const now2 = new Date();
      const cutoff2 = new Date(now2.getTime() - 7 * 24 * 60 * 60 * 1000);
      const endOfToday2 = new Date(now2); endOfToday2.setHours(23, 59, 59, 999);
      const seen2 = new Set<string>();
      setRecentMatches([...hist2, ...komm2]
        .filter(e => e.status === 'aktiv')
        .filter(e => { const d = new Date(e.start_time); return d >= cutoff2 && d <= endOfToday2; })
        .filter(e => { if (seen2.has(e.id)) return false; seen2.add(e.id); return true; })
        .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      );
    } catch (e: any) {
      setError(e.message || 'Fejl ved sletning');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 24px' }}>

      {error && (
        <div style={{ background: '#FDECEA', color: '#B71C1C', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14, border: '0.5px solid #FFCDD2' }}>
          {error}
        </div>
      )}

      {/* ── IDLE ──────────────────────────────────────────────────────────── */}
      {state.kind === 'idle' && (
        <div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, margin: '0 0 4px', color: 'var(--cfc-text-primary)' }}>
            🏆 Kampens Spiller
          </h2>
          <p style={{ color: 'var(--cfc-text-muted)', margin: '0 0 16px', fontSize: 14 }}>
            Vælg en kamp, eller start en ad-hoc afstemning.
          </p>

          {isTrainerRole(player?.role) && (
            <button onClick={() => handleSelectMatch(null)}
              style={{
                width: '100%', background: '#E1F5EE', border: '1px solid #A8DCC8', borderRadius: 12,
                padding: '14px 16px', cursor: 'pointer', textAlign: 'left', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 14, minHeight: 56,
              }}>
              <span style={{ fontSize: 20 }}>✨</span>
              <span style={{ fontWeight: 600, fontSize: 15, color: '#0F6E56' }}>Start ad-hoc afstemning</span>
            </button>
          )}

          {recentMatches.length === 0 ? (
            <div className="empty">Ingen kampe fra i dag eller de seneste 7 dage.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentMatches.map(ev => (
                <button key={ev.id} onClick={() => handleSelectMatch(ev)}
                  style={{
                    background: '#ffffff', border: '0.5px solid var(--cfc-border)', borderRadius: 12,
                    padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 14, minHeight: 64,
                  }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--cfc-text-primary)', fontFamily: 'Georgia, serif' }}>
                      {ev.title}
                    </div>
                    <div style={{ color: 'var(--cfc-text-muted)', fontSize: 13, marginTop: 3 }}>
                      {fmtDate(ev.start_time)}
                      {ev.result && <span style={{ marginLeft: 8, fontWeight: 600, color: 'var(--cfc-text-primary)' }}>{ev.result}</span>}
                    </div>
                  </div>
                  <span style={{ color: 'var(--cfc-text-subtle)', fontSize: 20 }}>›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SETUP ─────────────────────────────────────────────────────────── */}
      {state.kind === 'setup' && (
        <div>
          <button onClick={handleBack}
            style={{ background: 'none', border: 'none', color: 'var(--cfc-text-muted)', fontSize: 14, cursor: 'pointer', padding: '0 0 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
            ← Tilbage
          </button>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, margin: '0 0 2px', color: 'var(--cfc-text-primary)' }}>
            Opsæt afstemning
          </h2>
          <div style={{ fontSize: 14, color: 'var(--cfc-text-muted)', marginBottom: 16 }}>
            {state.event ? `${state.event.title} · ${fmtDate(state.event.start_time)}` : 'Ad-hoc afstemning'}
          </div>

          {state.event ? (
            <div style={{ background: '#E1F5EE', border: '0.5px solid #A8DCC8', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#0F6E56' }}>
              Pre-udfyldt fra tilmeldingslisten · Tilføj eller fjern spillere efter behov
            </div>
          ) : (
            <div style={{ background: '#ffffff', borderRadius: 12, border: '0.5px solid #e0e0e0', padding: '12px 16px', marginBottom: 16 }}>
              <label style={{ fontWeight: 700, fontSize: 14, color: 'var(--cfc-text-primary)', display: 'block', marginBottom: 8 }}>
                Titel (valgfri)
              </label>
              <input
                className="input"
                placeholder="fx 'Kampens spiller — træning'"
                value={adHocTitle}
                onChange={e => setAdHocTitle(e.target.value)}
              />
            </div>
          )}

          {/* Varighed */}
          <div style={{ background: '#ffffff', borderRadius: 12, border: '0.5px solid #e0e0e0', padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--cfc-text-primary)' }}>Varighed</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1D9E75' }}>{duration} sek</span>
            </div>
            <input
              type="range"
              min={15} max={180} step={15}
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#1D9E75', height: 4 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--cfc-text-subtle)', marginTop: 4 }}>
              <span>15 sek</span>
              <span>3 min</span>
            </div>
          </div>

          <PlayerToggleList
            label="Hvem kan stemme?"
            players={votersList}
            enabled={votersEnabled}
            onToggle={id => setVotersEnabled(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
            allPlayers={state.allPlayers}
            onAdd={p => { setVotersList(prev => [...prev, p]); setVotersEnabled(prev => new Set([...prev, p.id])); }}
          />

          <PlayerToggleList
            label="Hvem kan stemmes på?"
            players={candidatesList}
            enabled={candidatesEnabled}
            onToggle={id => setCandidatesEnabled(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
            allPlayers={state.allPlayers}
            onAdd={p => { setCandidatesList(prev => [...prev, p]); setCandidatesEnabled(prev => new Set([...prev, p.id])); }}
          />

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              onClick={handleStart}
              disabled={submitting || candidatesList.filter(p => candidatesEnabled.has(p.id)).length === 0}
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: 'center', fontSize: 15, minHeight: 52 }}
            >
              {submitting ? '...' : `🏆 Start afstemning (${duration} sek)`}
            </button>
            <button onClick={handleBack} className="btn btn-secondary" style={{ minHeight: 52 }}>
              Annuller
            </button>
          </div>
        </div>
      )}

      {/* ── VOTING ────────────────────────────────────────────────────────── */}
      {state.kind === 'voting' && (() => {
        const s = state.session;
        const isVoter = s.voters.some(v => v.id === player?.id);
        const endsAtMs = new Date(s.ends_at + (s.ends_at.includes('Z') ? '' : 'Z')).getTime();
        const isExpired = endsAtMs <= Date.now();

        return (
          <div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, margin: '0 0 2px', color: 'var(--cfc-text-primary)' }}>
              {voted ? '✓ Stemme registreret' : isExpired ? 'Afstemning udløbet' : 'Stem nu!'}
            </h2>
            <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginBottom: 4 }}>
              Startet af {s.started_by_name ?? '...'} · {s.vote_count ?? 0} stemme{(s.vote_count ?? 0) !== 1 ? 'r' : ''}
            </div>

            {!isExpired && <Countdown endsAt={s.ends_at} />}

            {!isVoter && (
              <div style={{ background: '#FFF8E1', border: '0.5px solid #FFE082', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: '#7A5800', textAlign: 'center' }}>
                Du er ikke med i denne afstemning
              </div>
            )}

            {voted && (
              <div style={{ background: '#E1F5EE', border: '0.5px solid #A8DCC8', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: '#0F6E56', textAlign: 'center' }}>
                ✓ Din stemme er registreret — venter på resultat…
              </div>
            )}

            {isVoter && !voted && !isExpired && (
              <>
                <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginBottom: 12 }}>
                  Vælg kampens bedste spiller:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {s.candidates.map(c => {
                    const sel = selectedCandidate === c.id;
                    return (
                      <button key={c.id} onClick={() => setSelectedCandidate(c.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                          background: sel ? '#E1F5EE' : '#ffffff',
                          border: `1.5px solid ${sel ? '#1D9E75' : '#e0e0e0'}`,
                          borderRadius: 12, cursor: 'pointer', textAlign: 'left', minHeight: 60,
                          transition: 'background 0.12s, border-color 0.12s',
                        }}>
                        <Avatar name={c.name} url={c.avatar_url} size={40} />
                        <span style={{ flex: 1, fontWeight: sel ? 700 : 500, fontSize: 16, color: 'var(--cfc-text-primary)' }}>
                          {c.name}
                        </span>
                        {sel && <span style={{ color: '#1D9E75', fontSize: 22, fontWeight: 700 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={handleVote}
                  disabled={!selectedCandidate || submitting}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', fontSize: 15, minHeight: 52 }}
                >
                  {submitting ? '...' : 'Afgiv stemme'}
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* ── RESULTS ───────────────────────────────────────────────────────── */}
      {state.kind === 'results' && (
        <ResultsView
          session={state.session}
          results={state.results}
          total={state.total}
          myVote={state.myVote}
          onBack={handleBack}
          canDelete={isTrainerRole(player?.role)}
          onDelete={() => handleDeleteSession(state.session.id)}
        />
      )}
    </div>
  );
}

// ── ResultsView ───────────────────────────────────────────────────────────────

function ResultsView({ session, results, total, myVote, onBack, canDelete, onDelete }: {
  session: VoteSession;
  results: VoteResult[];
  total: number;
  myVote: string | null;
  onBack: () => void;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  const isClosed = session.status === 'closed';
  const topVotes = results[0]?.votes ?? 0;
  const winners = topVotes > 0 ? results.filter(r => r.votes === topVotes) : [];
  const isShared = winners.length > 1;
  const barColors = ['#1D9E75', '#5DCAA5', '#9FE1CB', '#C5ECDD', '#E1F5EE'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <button onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--cfc-text-muted)', fontSize: 14, cursor: 'pointer', padding: '0 0 8px' }}>
          ← Tilbage
        </button>
        {canDelete && onDelete && (
          <button onClick={onDelete}
            style={{ background: 'none', border: 'none', color: '#B71C1C', fontSize: 13, cursor: 'pointer', padding: '0 0 8px', fontWeight: 600 }}>
            🗑 Slet afstemning
          </button>
        )}
      </div>

      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, margin: '0 0 2px', color: 'var(--cfc-text-primary)' }}>
        🏆 Resultat
      </h2>
      <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginBottom: 20 }}>
        {session.event_title} · {total} stemme{total !== 1 ? 'r' : ''} afgivet
        {isClosed
          ? <span style={{ marginLeft: 8, color: '#0F6E56', fontWeight: 600 }}>· Afsluttet</span>
          : <span style={{ marginLeft: 8, color: '#7A5800', fontWeight: 600 }}>· Pågår</span>}
      </div>

      {/* Vindercard */}
      {winners.length > 0 && (
        <div style={{
          background: '#E1F5EE', border: '1.5px solid #1D9E75', borderRadius: 14,
          padding: '18px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          {isShared ? (
            <div style={{ display: 'flex', gap: -8 }}>
              {winners.slice(0, 2).map(w => <Avatar key={w.id} name={w.name} url={w.avatar_url} size={48} />)}
            </div>
          ) : (
            <Avatar name={winners[0].name} url={winners[0].avatar_url} size={56} />
          )}
          <div style={{ flex: 1 }}>
            {isShared ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--cfc-text-primary)' }}>
                  {winners.map(w => w.name).join(' & ')}
                </div>
                <div style={{ fontSize: 13, color: '#1D9E75', marginTop: 4, fontWeight: 600 }}>
                  🥇 Uafgjort · {topVotes} stemme{topVotes !== 1 ? 'r' : ''} hver
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--cfc-text-primary)', fontFamily: 'Georgia, serif' }}>
                  {winners[0].name}
                </div>
                <div style={{ fontSize: 13, color: '#1D9E75', marginTop: 4, fontWeight: 600 }}>
                  🥇 Kampens spiller · {topVotes} stemme{topVotes !== 1 ? 'r' : ''}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Søjlediagram */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map((r, idx) => {
          const isWinner = r.votes === topVotes && topVotes > 0;
          const barPct = topVotes > 0 ? (r.votes / topVotes) * 100 : 0;
          const barColor = barColors[Math.min(idx, barColors.length - 1)];
          const isMyVote = myVote === r.id;

          return (
            <div key={r.id} style={{
              background: '#ffffff',
              border: `1px solid ${isWinner ? '#1D9E75' : '#e0e0e0'}`,
              borderRadius: 10, padding: '12px 16px',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${barPct}%`, background: barColor + '33',
                transition: 'width 0.5s ease',
              }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: isWinner ? '#1D9E75' : 'var(--cfc-text-subtle)', minWidth: 26, textAlign: 'center' }}>
                  {isWinner ? '🏆' : idx + 1}
                </div>
                <Avatar name={r.name} url={r.avatar_url} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: isWinner ? 700 : 500, fontSize: 15, color: 'var(--cfc-text-primary)' }}>
                    {r.name}
                    {isMyVote && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: '#0C447C', background: '#E6F1FB', padding: '1px 6px', borderRadius: 6, fontWeight: 600 }}>
                        din stemme
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 20, color: isWinner ? '#1D9E75' : 'var(--cfc-text-muted)', minWidth: 28, textAlign: 'right' }}>
                  {r.votes}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {results.length === 0 && (
        <div className="empty">Ingen stemmer afgivet endnu.</div>
      )}
    </div>
  );
}
