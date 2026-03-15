import { useState, useEffect } from 'react';
import { api, StatRow } from '../lib/api';

const SEASONS = Array.from({ length: 20 }, (_, i) => (2025 - i).toString());

export default function Stats() {
  const [season, setSeason] = useState('2025');
  const [stats, setStats] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'goals' | 'matches' | 'yellow_cards' | 'red_cards'>('goals');

  useEffect(() => { load(); }, [season]);

  async function load() {
    setLoading(true);
    try {
      const rows = await api.getStats(season === 'all' ? undefined : season);
      setStats(rows);
    } finally {
      setLoading(false);
    }
  }

  const sorted = [...stats].sort((a, b) => b[sortBy] - a[sortBy]);

  const totals = {
    matches: stats.reduce((s, r) => s + r.matches, 0),
    goals: stats.reduce((s, r) => s + r.goals, 0),
    yellow: stats.reduce((s, r) => s + r.yellow_cards, 0),
    red: stats.reduce((s, r) => s + r.red_cards, 0),
  };

  return (
    <div className="page">
      {/* Season picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>Sæson</label>
        <select
          className="input"
          style={{ width: 'auto' }}
          value={season}
          onChange={e => setSeason(e.target.value)}
        >
          <option value="all">Alle sæsoner</option>
          {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Kampe', value: totals.matches, icon: '⚽' },
          { label: 'Mål', value: totals.goals, icon: '🎯' },
          { label: 'Gule', value: totals.yellow, icon: '🟨' },
          { label: 'Røde', value: totals.red, icon: '🟥' },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 8px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 18 }}>{icon}</div>
            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Sort tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {([
          ['goals', '🎯 Mål'],
          ['matches', '⚽ Kampe'],
          ['yellow_cards', '🟨 Gule'],
          ['red_cards', '🟥 Røde'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className="btn btn-sm"
            style={{
              background: sortBy === key ? 'var(--green)' : '#fff',
              color: sortBy === key ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Spiller</th>
                <th className="num">⚽</th>
                <th className="num">🎯</th>
                <th className="num">🟨</th>
                <th className="num">🟥</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr key={row.id}>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', width: 28 }}>{i + 1}</td>
                  <td style={{ fontWeight: i < 3 ? 600 : 400 }}>{row.name}</td>
                  <td className="num">{row.matches}</td>
                  <td className="num" style={{ fontWeight: row.goals > 0 ? 600 : 400, color: row.goals > 0 ? 'var(--green-dark)' : undefined }}>
                    {row.goals || '–'}
                  </td>
                  <td className="num" style={{ color: row.yellow_cards > 0 ? '#b45309' : undefined }}>
                    {row.yellow_cards || '–'}
                  </td>
                  <td className="num" style={{ color: row.red_cards > 0 ? '#dc2626' : undefined }}>
                    {row.red_cards || '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div className="empty">Ingen statistik for {season === 'all' ? 'alle sæsoner' : `sæson ${season}`} endnu.</div>
          )}
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
        Statistik registreres af admin efter hver kamp
      </p>
    </div>
  );
}
