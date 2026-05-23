import { useState, useEffect } from 'react';
import { api } from '../lib/api';

type LeagueRow = {
  position: number; team: string;
  played: number; won: number; drawn: number; lost: number;
  goals_for: number; goals_against: number; points: number;
  is_cfc: boolean; separator: boolean;
};

type LeagueTable = {
  league_name: string;
  rows: LeagueRow[];
  fetched_at: string;
};

export default function Stilling() {
  const [table, setTable] = useState<LeagueTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noUrl, setNoUrl] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getLeagueTable()
      .then(data => { setTable(data); setLoading(false); })
      .catch(e => {
        if (e.message?.includes('konfigureret')) setNoUrl(true);
        else setError('Stillingen kunne ikke hentes. Prøv igen senere.');
        setLoading(false);
      });
  }, []);

  function refresh() {
    setError(null); setLoading(true);
    api.getLeagueTable()
      .then(data => { setTable(data); setLoading(false); })
      .catch(() => { setError('Stillingen kunne ikke hentes. Prøv igen senere.'); setLoading(false); });
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 20, margin: 0, color: 'var(--cfc-text-primary)' }}>
          Stilling
        </h1>
        {table && (
          <button onClick={refresh} className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>
            ↻ Opdater
          </button>
        )}
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" />
        </div>
      )}

      {noUrl && !loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--cfc-text-muted)', fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          Ingen stilling-URL konfigureret endnu.<br />
          <span style={{ fontSize: 13, color: 'var(--cfc-text-subtle)' }}>Admin kan tilføje den under Indstillinger.</span>
        </div>
      )}

      {error && !loading && (
        <div style={{ background: '#FDECEA', color: '#B71C1C', padding: '12px 16px', borderRadius: 8, fontSize: 14 }}>
          {error}
        </div>
      )}

      {table && !loading && (
        <>
          {/* Rækkens navn */}
          {table.league_name && (
            <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginBottom: 12, fontStyle: 'italic' }}>
              {table.league_name}
            </div>
          )}

          {/* Tabelheader */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '28px 1fr 32px 32px 32px 32px 52px 36px',
            gap: 4,
            padding: '6px 10px',
            borderBottom: '1.5px solid var(--cfc-border)',
            marginBottom: 4,
          }}>
            {['#', 'Hold', 'K', 'V', 'U', 'T', 'Mål', 'P'].map((h, i) => (
              <div key={i} style={{
                fontSize: 11, fontWeight: 700, color: 'var(--cfc-text-muted)',
                textAlign: i === 1 ? 'left' : 'center',
                letterSpacing: '0.05em',
              }}>{h}</div>
            ))}
          </div>

          {/* Rækker */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {table.rows.map((row, i) => (
              <div key={i}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr 32px 32px 32px 32px 52px 36px',
                  gap: 4,
                  padding: '9px 10px',
                  background: row.is_cfc ? '#0d2e1a' : 'transparent',
                  borderBottom: row.separator ? '2px solid var(--cfc-border)' : '0.5px solid var(--cfc-border)',
                  alignItems: 'center',
                }}>
                  {/* Position */}
                  <div style={{
                    fontSize: 13, fontWeight: row.is_cfc ? 700 : 400,
                    color: row.is_cfc ? '#5a9e5a' : 'var(--cfc-text-muted)',
                    textAlign: 'center',
                  }}>
                    {row.position}
                  </div>
                  {/* Hold */}
                  <div style={{
                    fontSize: 13, fontWeight: row.is_cfc ? 700 : 500,
                    color: row.is_cfc ? '#a8d5a8' : 'var(--cfc-text-primary)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {row.is_cfc && (
                      <span style={{
                        fontSize: 9, background: '#1D9E75', color: '#fff',
                        borderRadius: 3, padding: '1px 4px', fontWeight: 700,
                        flexShrink: 0, letterSpacing: '0.05em',
                      }}>CFC</span>
                    )}
                    {row.team}
                  </div>
                  {/* Tal-kolonner */}
                  {[row.played, row.won, row.drawn, row.lost].map((v, j) => (
                    <div key={j} style={{
                      fontSize: 13, textAlign: 'center',
                      color: row.is_cfc ? '#a8d5a8' : 'var(--cfc-text-muted)',
                    }}>{v}</div>
                  ))}
                  {/* Mål */}
                  <div style={{
                    fontSize: 12, textAlign: 'center',
                    color: row.is_cfc ? '#a8d5a8' : 'var(--cfc-text-muted)',
                  }}>
                    {row.goals_for}–{row.goals_against}
                  </div>
                  {/* Point */}
                  <div style={{
                    fontSize: 13, fontWeight: 700, textAlign: 'center',
                    color: row.is_cfc ? '#5a9e5a' : 'var(--cfc-text-primary)',
                  }}>{row.points}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Tidsstempel */}
          <div style={{ fontSize: 11, color: 'var(--cfc-text-subtle)', marginTop: 10, textAlign: 'right' }}>
            Hentet {new Date(table.fetched_at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </>
      )}
    </div>
  );
}
