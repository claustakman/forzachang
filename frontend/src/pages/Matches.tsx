import { useState, useEffect } from 'react';
import { api, Match, Signup } from '../lib/api';
import { useAuth } from '../lib/auth';

function fmtDate(date: string, time: string) {
  const d = new Date(date + 'T12:00:00');
  const dayStr = d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${dayStr} kl. ${time}`;
}

function getCurrentSeason() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear().toString() : (now.getFullYear()).toString();
}

export default function Matches() {
  const { player } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [signups, setSignups] = useState<Record<string, Signup[]>>({});
  const [mySignups, setMySignups] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | 'mine'>('all');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const ms = await api.getMatches(getCurrentSeason());
      setMatches(ms);

      // Load signups for each match
      const sigMap: Record<string, Signup[]> = {};
      const mySet = new Set<string>();
      await Promise.all(ms.map(async (m) => {
        const sigs = await api.getMatchSignups(m.id);
        sigMap[m.id] = sigs;
        if (sigs.some(s => s.player_id === player!.id)) mySet.add(m.id);
      }));
      setSignups(sigMap);
      setMySignups(mySet);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggle(matchId: string) {
    setSaving(matchId);
    const isSignedUp = mySignups.has(matchId);
    try {
      await api.setSignup(matchId, isSignedUp ? 'no' : 'yes');
      const newSet = new Set(mySignups);
      if (isSignedUp) newSet.delete(matchId);
      else newSet.add(matchId);
      setMySignups(newSet);

      // Refresh signups for this match
      const sigs = await api.getMatchSignups(matchId);
      setSignups(prev => ({ ...prev, [matchId]: sigs }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  }

  const now = new Date().toISOString().slice(0, 10);
  const upcoming = matches.filter(m => m.date >= now);
  const past = matches.filter(m => m.date < now);
  const unanswered = upcoming.filter(m => !mySignups.has(m.id));

  const displayMatches = tab === 'mine'
    ? upcoming.filter(m => mySignups.has(m.id))
    : upcoming;

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div className="page">
      {/* Reminder banner */}
      {unanswered.length > 0 && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fcd34d',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 14,
          fontSize: 13,
          color: '#92400e',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          Du mangler at tilmelde dig {unanswered.length} kamp{unanswered.length > 1 ? 'e' : ''}.
        </div>
      )}

      {error && (
        <div style={{ background: '#fee2e2', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#991b1b' }}>
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {(['all', 'mine'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '9px', border: 'none', fontSize: 13, fontWeight: 500,
              background: tab === t ? 'var(--green)' : '#fff',
              color: tab === t ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            {t === 'all' ? `Alle kommende (${upcoming.length})` : `Mine (${mySignups.size})`}
          </button>
        ))}
      </div>

      {/* Match cards */}
      {displayMatches.length === 0 && (
        <div className="empty">
          {tab === 'mine' ? 'Du er ikke tilmeldt nogen kampe endnu.' : 'Ingen kommende kampe i denne sæson.'}
        </div>
      )}

      {displayMatches.map(m => {
        const sigs = signups[m.id] || [];
        const isSignedUp = mySignups.has(m.id);
        const isSaving = saving === m.id;
        return (
          <div key={m.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                  {fmtDate(m.date, m.time)}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{m.opponent}</div>
                {m.address && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 1 }}>{m.address}</div>}
              </div>
              <span className={`badge badge-${m.venue}`}>
                {m.venue === 'home' ? 'Hjemme' : 'Ude'}
              </span>
            </div>

            {/* Player chips */}
            {sigs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '8px 0' }}>
                {sigs.map(s => (
                  <span
                    key={s.player_id}
                    style={{
                      fontSize: 12,
                      padding: '3px 8px',
                      borderRadius: 100,
                      background: s.player_id === player!.id ? 'var(--green-light)' : '#f3f4f6',
                      color: s.player_id === player!.id ? 'var(--green-dark)' : 'var(--text-muted)',
                      fontWeight: s.player_id === player!.id ? 600 : 400,
                    }}
                  >
                    {s.player_name.split(' ')[0]}
                  </span>
                ))}
              </div>
            )}
            {sigs.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0' }}>
                Ingen tilmeldte endnu
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
                {sigs.length} tilmeldt{sigs.length !== 1 ? 'e' : ''}
              </span>
              <button
                className={`btn btn-sm ${isSignedUp ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => toggle(m.id)}
                disabled={isSaving}
                style={{ minWidth: 100 }}
              >
                {isSaving ? '...' : isSignedUp ? 'Afmeld mig' : 'Tilmeld mig'}
              </button>
            </div>
          </div>
        );
      })}

      {/* Past matches */}
      {tab === 'all' && past.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 20 }}>Afspillede kampe</div>
          {past.slice().reverse().map(m => (
            <div key={m.id} className="card" style={{ marginBottom: 8, opacity: 0.65 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(m.date, m.time)}</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{m.opponent}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {(signups[m.id] || []).length} spillede
                  </span>
                  <span className={`badge badge-${m.venue}`}>
                    {m.venue === 'home' ? 'Hjemme' : 'Ude'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
