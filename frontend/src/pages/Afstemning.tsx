// Fase 12: Kampens Spiller afstemning
import { useState, useEffect, useCallback } from 'react';
import { api, Event, VoteSession, VoteCandidate, VoteResult, VoteResults } from '../lib/api';
import { useAuth } from '../lib/auth';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Avatar({ name, url, size = 40 }: { name: string; url?: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#1a3a5c',
      color: '#5b8dd9', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

type PageState =
  | { kind: 'idle'; recentMatches: Event[] }
  | { kind: 'confirming'; event: Event }
  | { kind: 'voting'; event: Event; session: VoteSession; candidates: VoteCandidate[] }
  | { kind: 'results'; results: VoteResults };

export default function Afstemning() {
  const { player, isTrainer, isAdmin } = useAuth();
  const canManage = isTrainer || isAdmin;

  const [state, setState] = useState<PageState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [votingFor, setVotingFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Hent nylige kampe (seneste 30 dage + næste 7 dage)
      const eventsData = await api.getEvents();
      const now = new Date();
      const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const recentMatches = eventsData
        .filter(e => e.type === 'kamp' && e.status === 'aktiv')
        .filter(e => {
          const d = new Date(e.start_time);
          return d >= cutoff && d <= future;
        })
        .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

      setState({ kind: 'idle', recentMatches });
    } catch (e: any) {
      setError(e.message || 'Fejl ved indlæsning');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  async function handleSelectEvent(event: Event) {
    setError(null);
    setLoading(true);
    try {
      const data = await api.getVoteSession(event.id);
      if (data.session) {
        if (!data.session.closed_at && data.session.my_vote === null && !canManage) {
          // Spiller kan stemme
          // Hent kandidater — vi har dem ikke fra getVoteSession, brug results
          const results = await api.getVoteResults(data.session.id);
          const candidates = results.results.map(r => ({ id: r.id, name: r.name, avatar_url: r.avatar_url }));
          setState({ kind: 'voting', event, session: data.session, candidates });
        } else if (!data.session.closed_at && canManage) {
          // Trainer ser resultater (åben session)
          const results = await api.getVoteResults(data.session.id);
          setState({ kind: 'results', results });
        } else {
          // Lukket — alle ser resultater
          const results = await api.getVoteResults(data.session.id);
          setState({ kind: 'results', results });
        }
      } else if (canManage) {
        setState({ kind: 'confirming', event });
      } else {
        setError('Der er endnu ingen aktiv afstemning for denne kamp.');
        setState({ kind: 'idle', recentMatches: (state as any)?.recentMatches ?? [] });
      }
    } catch (e: any) {
      setError(e.message || 'Fejl');
    } finally {
      setLoading(false);
    }
  }

  async function handleStartSession() {
    if (state?.kind !== 'confirming') return;
    setSaving(true);
    setError(null);
    try {
      const data = await api.createVoteSession(state.event.id);
      const session = await api.getVoteSession(state.event.id);
      setState({
        kind: 'voting',
        event: state.event,
        session: session.session!,
        candidates: data.candidates,
      });
    } catch (e: any) {
      setError(e.message || 'Fejl ved oprettelse');
    } finally {
      setSaving(false);
    }
  }

  async function handleVote(candidateId: string) {
    if (state?.kind !== 'voting') return;
    setSaving(true);
    setError(null);
    try {
      await api.castVote(state.session.id, candidateId);
      // Opdater session (my_vote er nu sat)
      const results = await api.getVoteResults(state.session.id);
      setState({ kind: 'results', results });
    } catch (e: any) {
      setError(e.message || 'Fejl ved stemmeafgivelse');
      setSaving(false);
    }
  }

  async function handleClose() {
    if (state?.kind !== 'results') return;
    setSaving(true);
    setError(null);
    try {
      await api.closeVoteSession(state.results.session.id);
      const results = await api.getVoteResults(state.results.session.id);
      setState({ kind: 'results', results });
    } catch (e: any) {
      setError(e.message || 'Fejl ved lukning');
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    loadInitial();
    setVotingFor(null);
    setError(null);
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px' }}>
      <h2 style={{ fontFamily: 'Georgia, serif', color: 'var(--cfc-text-primary)', margin: '0 0 4px' }}>
        🏆 Kampens Spiller
      </h2>
      <p style={{ color: 'var(--cfc-text-muted)', margin: '0 0 20px', fontSize: 14 }}>
        Stem på kampens bedste spiller
      </p>

      {error && (
        <div style={{ background: '#2a1010', color: '#e57373', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* ── IDLE: Vælg kamp ─────────────────────────────────────── */}
      {state?.kind === 'idle' && (
        <div>
          <p style={{ color: 'var(--cfc-text-muted)', fontSize: 14, marginBottom: 12 }}>
            Vælg en kamp for at se eller starte en afstemning:
          </p>
          {state.recentMatches.length === 0 && (
            <p style={{ color: 'var(--cfc-text-subtle)', fontSize: 14 }}>
              Ingen kampe i de seneste 30 dage.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {state.recentMatches.map(event => (
              <button
                key={event.id}
                onClick={() => handleSelectEvent(event)}
                style={{
                  background: 'var(--cfc-bg-card)',
                  border: '0.5px solid var(--cfc-border)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  color: 'var(--cfc-text-primary)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{event.title}</div>
                  <div style={{ color: 'var(--cfc-text-muted)', fontSize: 13, marginTop: 2 }}>
                    {fmtDate(event.start_time)}
                    {event.result && (
                      <span style={{ marginLeft: 8, color: '#5b8dd9' }}>{event.result}</span>
                    )}
                  </div>
                </div>
                <span style={{ color: 'var(--cfc-text-muted)', fontSize: 20 }}>›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── CONFIRMING: Trainer starter afstemning ──────────────── */}
      {state?.kind === 'confirming' && (
        <div style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, padding: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, color: 'var(--cfc-text-muted)', marginBottom: 4 }}>Kamp</div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{state.event.title}</div>
            <div style={{ color: 'var(--cfc-text-muted)', fontSize: 14, marginTop: 4 }}>
              {fmtDate(state.event.start_time)}
            </div>
          </div>
          <p style={{ color: 'var(--cfc-text-muted)', fontSize: 14, margin: '0 0 20px' }}>
            Start en afstemning om kampens bedste spiller. Tilmeldte spillere kan stemme på én af deres holdkammerater.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleStartSession}
              disabled={saving}
              style={{
                background: '#5b8dd9', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 20px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Starter…' : '🏆 Start afstemning'}
            </button>
            <button
              onClick={handleBack}
              style={{ background: 'none', color: 'var(--cfc-text-muted)', border: '0.5px solid var(--cfc-border)', borderRadius: 8, padding: '10px 16px', cursor: 'pointer' }}
            >
              Tilbage
            </button>
          </div>
        </div>
      )}

      {/* ── VOTING: Afgiv stemme ─────────────────────────────────── */}
      {state?.kind === 'voting' && (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{state.event.title}</div>
              <div style={{ color: 'var(--cfc-text-muted)', fontSize: 13 }}>
                {fmtDate(state.event.start_time)} · {state.session.vote_count ?? 0} stemme{(state.session.vote_count ?? 0) !== 1 ? 'r' : ''} afgivet
              </div>
            </div>
            <button
              onClick={handleBack}
              style={{ background: 'none', color: 'var(--cfc-text-muted)', border: 'none', cursor: 'pointer', fontSize: 14 }}
            >
              ← Tilbage
            </button>
          </div>

          <p style={{ color: 'var(--cfc-text-primary)', fontSize: 14, marginBottom: 16 }}>
            Vælg kampens bedste spiller. Du kan kun stemme én gang.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {state.candidates.map(c => (
              <button
                key={c.id}
                onClick={() => { setVotingFor(c.id); handleVote(c.id); }}
                disabled={saving}
                style={{
                  background: votingFor === c.id ? '#1a3a5c' : 'var(--cfc-bg-card)',
                  border: `0.5px solid ${votingFor === c.id ? '#5b8dd9' : 'var(--cfc-border)'}`,
                  borderRadius: 10,
                  padding: '12px 16px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  color: 'var(--cfc-text-primary)',
                  opacity: saving && votingFor !== c.id ? 0.5 : 1,
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <Avatar name={c.name} url={c.avatar_url} size={40} />
                <span style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</span>
                {votingFor === c.id && saving && (
                  <span style={{ marginLeft: 'auto', color: '#5b8dd9', fontSize: 13 }}>Stemmer…</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── RESULTS: Vis resultater ──────────────────────────────── */}
      {state?.kind === 'results' && <ResultsView results={state.results} canManage={canManage} onClose={handleClose} onBack={handleBack} saving={saving} />}
    </div>
  );
}

function ResultsView({
  results,
  canManage,
  onClose,
  onBack,
  saving,
}: {
  results: VoteResults;
  canManage: boolean;
  onClose: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  const { session, results: candidates, total_votes, my_vote } = results;
  const isClosed = !!session.closed_at;
  const topVotes = candidates[0]?.votes ?? 0;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{session.event_title}</div>
          <div style={{ color: 'var(--cfc-text-muted)', fontSize: 13 }}>
            {total_votes} stemme{total_votes !== 1 ? 'r' : ''} afgivet
            {isClosed && <span style={{ marginLeft: 8, color: '#5a9e5a' }}>· Afsluttet</span>}
            {!isClosed && <span style={{ marginLeft: 8, color: '#c4a000' }}>· Pågår</span>}
          </div>
        </div>
        <button
          onClick={onBack}
          style={{ background: 'none', color: 'var(--cfc-text-muted)', border: 'none', cursor: 'pointer', fontSize: 14 }}
        >
          ← Tilbage
        </button>
      </div>

      {my_vote && (
        <div style={{ background: '#162416', border: '0.5px solid #2a4a2a', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 13, color: '#5a9e5a' }}>
          ✓ Du har afgivet din stemme
        </div>
      )}
      {!my_vote && !isClosed && !canManage && (
        <div style={{ background: '#1a1200', border: '0.5px solid #3a2800', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 13, color: '#c4a000' }}>
          Du har ikke stemt endnu
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {candidates.map((c, idx) => {
          const isWinner = isClosed && c.votes === topVotes && c.votes > 0;
          const barPct = topVotes > 0 ? (c.votes / topVotes) * 100 : 0;
          const isMyVote = my_vote === c.id;

          return (
            <div
              key={c.id}
              style={{
                background: isWinner ? '#1a2a10' : 'var(--cfc-bg-card)',
                border: `0.5px solid ${isWinner ? '#4a7a2a' : isMyVote ? '#5b8dd9' : 'var(--cfc-border)'}`,
                borderRadius: 10,
                padding: '12px 16px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Stemmebar */}
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${barPct}%`, background: isWinner ? 'rgba(90,158,90,0.1)' : 'rgba(91,141,217,0.07)',
                transition: 'width 0.4s ease',
              }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 18, minWidth: 28, textAlign: 'center', color: idx === 0 && c.votes > 0 && isClosed ? '#ffd700' : 'var(--cfc-text-subtle)' }}>
                  {idx === 0 && c.votes > 0 && isClosed ? '🏆' : `${idx + 1}`}
                </div>
                <Avatar name={c.name} url={c.avatar_url} size={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: isWinner ? 700 : 500, fontSize: 15, color: 'var(--cfc-text-primary)' }}>
                    {c.name}
                    {isMyVote && <span style={{ marginLeft: 8, fontSize: 12, color: '#5b8dd9' }}>din stemme</span>}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 18, color: isWinner ? '#5a9e5a' : 'var(--cfc-text-muted)', minWidth: 32, textAlign: 'right' }}>
                  {c.votes}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {canManage && !isClosed && (
        <button
          onClick={onClose}
          disabled={saving}
          style={{
            background: 'var(--cfc-bg-card)',
            border: '0.5px solid var(--cfc-border)',
            borderRadius: 8,
            padding: '10px 18px',
            color: 'var(--cfc-text-muted)',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 14,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Lukker…' : '🔒 Afslut afstemning'}
        </button>
      )}
    </div>
  );
}
