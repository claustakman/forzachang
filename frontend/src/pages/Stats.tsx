import { useState, useEffect } from 'react';
import { api, StatsRow, PlayerSeasonStats, Player, HonorsSummary, PlayerHonor } from '../lib/api';

const THIS_YEAR = new Date().getFullYear();
const SEASONS = Array.from({ length: THIS_YEAR - 2006 }, (_, i) => THIS_YEAR - i);

function fmtKr(kr: number) {
  return kr > 0 ? `${kr} kr.` : '–';
}

// ── Mini søjlediagram ─────────────────────────────────────────────────────────

function BarChart({ rows, label, color }: {
  rows: { name: string; value: number }[];
  label: string;
  color: string;
}) {
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <div style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cfc-text-muted)', marginBottom: 12 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 22, fontSize: 11, color: 'var(--cfc-text-subtle)', textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--cfc-text-primary)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
              <div style={{ height: 6, background: 'var(--cfc-bg-hover)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(r.value / max) * 100}%`, background: color, borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            </div>
            <div style={{ width: 36, fontSize: 13, fontWeight: 700, color, textAlign: 'right', flexShrink: 0 }}>{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hædersbevisninger-fane ────────────────────────────────────────────────────

function HedersbevisningerTab() {
  const [summary, setSummary] = useState<HonorsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getHonorsSummary().then(data => {
      setSummary(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>;
  if (!summary) return <div className="empty">Kunne ikke hente hædersbevisninger.</div>;

  const autoTypes = summary.types.filter(t => t.type === 'auto');
  const manualTypes = summary.types.filter(t => t.type === 'manual');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Automatiske milestones */}
      {autoTypes.map(ht => {
        const recipients = summary.honors.filter(h => h.honor_type_id === ht.id);
        if (recipients.length === 0) return null;
        return (
          <div key={ht.id} style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cfc-text-muted)', marginBottom: 10 }}>
              🏅 {ht.name}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[...recipients].sort((a, b) => (a.player_name || '').localeCompare(b.player_name || '', 'da')).map(h => (
                <span key={h.id} style={{ fontSize: 13, padding: '3px 10px', borderRadius: 100, background: 'var(--cfc-bg-hover)', color: 'var(--cfc-text-primary)', border: '0.5px solid var(--cfc-border)' }}>
                  {h.player_name}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {/* Manuelle priser */}
      {manualTypes.map(ht => {
        const prizes = summary.honors.filter(h => h.honor_type_id === ht.id && h.season != null);
        if (prizes.length === 0) return null;
        const sorted = [...prizes].sort((a, b) => (b.season || 0) - (a.season || 0));
        return (
          <div key={ht.id} style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cfc-text-muted)', marginBottom: 10 }}>
              🏆 {ht.name}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--cfc-border)' }}>
                  <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>Årstal</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>Spiller</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(h => (
                  <tr key={h.id} style={{ borderBottom: '0.5px solid var(--cfc-border)' }}>
                    <td style={{ padding: '6px 8px', color: 'var(--cfc-text-muted)' }}>{h.season}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--cfc-text-primary)', fontWeight: 500 }}>{h.player_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {summary.honors.length === 0 && <div className="empty">Ingen hædersbevisninger registreret endnu.</div>}
    </div>
  );
}

// ── Spillerprofil-modal ───────────────────────────────────────────────────────

function PlayerProfileModal({ player, onClose }: { player: Player; onClose: () => void }) {
  const [seasons, setSeasons] = useState<PlayerSeasonStats[]>([]);
  const [honors, setHonors] = useState<PlayerHonor[]>([]);
  const [loading, setLoading] = useState(true);
  const [honorsOpen, setHonorsOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getPlayerStats(player.id),
      api.getHonors(player.id),
    ]).then(([statsData, honorsData]) => {
      setSeasons(statsData as unknown as PlayerSeasonStats[]);
      setHonors(honorsData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [player.id]);

  const autoHonors = honors.filter(h => h.honor_type === 'auto');
  const manualHonors = honors.filter(h => h.honor_type === 'manual');
  // Gruppér manuelle per honor_type_id
  const manualByType = manualHonors.reduce((acc, h) => {
    if (!acc[h.honor_type_id]) acc[h.honor_type_id] = { name: h.honor_name, years: [] };
    acc[h.honor_type_id].years.push(h.season!);
    return acc;
  }, {} as Record<string, { name: string; years: number[] }>);

  const totals = seasons.reduce((acc, s) => ({
    matches: acc.matches + s.matches,
    goals: acc.goals + s.goals,
    mom: acc.mom + (s.mom || 0),
    yellow_cards: acc.yellow_cards + s.yellow_cards,
    red_cards: acc.red_cards + s.red_cards,
    fines_amount: acc.fines_amount + (s.fines_amount || 0),
  }), { matches: 0, goals: 0, mom: 0, yellow_cards: 0, red_cards: 0, fines_amount: 0 });

  const hasFines = totals.fines_amount > 0 || seasons.some(s => (s.fines_amount || 0) > 0);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--cfc-border)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            {(player as any).avatar_url
              ? <img src={(player as any).avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : ((player as any).alias?.trim() || (player as any).full_name || player.name).charAt(0)}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--cfc-text-primary)', fontFamily: 'Georgia, serif' }}>
              {(player as any).alias?.trim() || (player as any).full_name || player.name}
            </div>
            {player.shirt_number && <div style={{ fontSize: 12, color: 'var(--cfc-text-muted)' }}>#{player.shirt_number}</div>}
          </div>
        </div>

        {/* Totaler */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${hasFines ? 6 : 5}, 1fr)`, gap: 6, marginBottom: 16 }}>
          {[
            { label: 'Kampe', value: totals.matches, color: '#5b8dd9' },
            { label: 'Mål', value: totals.goals, color: '#5a9e5a' },
            { label: 'MoM', value: totals.mom, color: '#c4a000' },
            { label: 'Gule', value: totals.yellow_cards, color: '#b45309' },
            { label: 'Røde', value: totals.red_cards, color: '#e57373' },
            ...(hasFines ? [{ label: 'Bøder', value: totals.fines_amount, color: '#9b59b6', suffix: ' kr' }] : []),
          ].map(({ label, value, color, suffix }: any) => (
            <div key={label} style={{ background: 'var(--cfc-bg-hover)', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: hasFines ? 15 : 18, fontWeight: 800, color, lineHeight: 1 }}>{value}{suffix || ''}</div>
              <div style={{ fontSize: 10, color: 'var(--cfc-text-subtle)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Hædersbevisninger — kollapsbar */}
        {honors.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <button
              onClick={() => setHonorsOpen(o => !o)}
              style={{ width: '100%', textAlign: 'left', background: 'var(--cfc-bg-hover)', border: '0.5px solid var(--cfc-border)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: 'var(--cfc-text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}
            >
              <span>🏅 Hædersbevisninger ({honors.length})</span>
              <span style={{ color: 'var(--cfc-text-subtle)' }}>{honorsOpen ? '▲' : '▼'}</span>
            </button>
            {honorsOpen && (
              <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {autoHonors.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--cfc-text-subtle)', marginBottom: 5 }}>Milestones</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {autoHonors.map(h => (
                        <span key={h.id} style={{ fontSize: 12, padding: '2px 9px', borderRadius: 100, background: '#0f1a2e', color: '#5b8dd9', border: '0.5px solid #1a3a5c' }}>
                          {h.honor_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {Object.values(manualByType).map(({ name, years }) => (
                  <div key={name} style={{ fontSize: 13, color: 'var(--cfc-text-muted)' }}>
                    <span style={{ color: '#c4a000', fontWeight: 600 }}>{name}</span>
                    {' '}{years.sort((a, b) => b - a).join(', ')}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
        ) : seasons.length === 0 ? (
          <div className="empty">Ingen statistik registreret endnu.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--cfc-border)' }}>
                {['Sæson', 'Kampe', 'Mål', 'MoM', '🟨', '🟥', ...(hasFines ? ['Bøder'] : [])].map(h => (
                  <th key={h} style={{ padding: '4px 6px', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11, textAlign: h === 'Sæson' ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seasons.map(s => (
                <tr key={s.season} style={{ borderBottom: '0.5px solid var(--cfc-border)' }}>
                  <td style={{ padding: '6px 6px', color: 'var(--cfc-text-primary)', fontWeight: 600 }}>{s.season}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: 'var(--cfc-text-muted)' }}>{s.matches}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: s.goals > 0 ? '#5a9e5a' : 'var(--cfc-text-subtle)', fontWeight: s.goals > 0 ? 700 : 400 }}>{s.goals || '–'}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: (s.mom || 0) > 0 ? '#c4a000' : 'var(--cfc-text-subtle)' }}>{s.mom || '–'}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: s.yellow_cards > 0 ? '#b45309' : 'var(--cfc-text-subtle)' }}>{s.yellow_cards || '–'}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: s.red_cards > 0 ? '#e57373' : 'var(--cfc-text-subtle)' }}>{s.red_cards || '–'}</td>
                  {hasFines && (
                    <td style={{ padding: '6px 6px', textAlign: 'right', color: (s.fines_amount || 0) > 0 ? '#9b59b6' : 'var(--cfc-text-subtle)' }}>
                      {(s.fines_amount || 0) > 0 ? `${s.fines_amount} kr` : '–'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="modal-footer" style={{ marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose}>Luk</button>
        </div>
      </div>
    </div>
  );
}

// ── Hoved-komponent ───────────────────────────────────────────────────────────

type View = 'top10' | 'saeson' | 'spiller' | 'haedersbevisninger';

export default function Stats() {
  const [view, setView] = useState<View>('top10');
  const [season, setSeason] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [stats, setStats] = useState<StatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    setLoading(true);
    api.getStats(season || undefined).then(rows => {
      setStats(rows as unknown as StatsRow[]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [season]);

  const filtered = stats.filter(r => {
    if (activeFilter === 'active' && !r.active) return false;
    if (activeFilter === 'inactive' && r.active) return false;
    if (q && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  // Top 10 lister
  const top10goals   = [...filtered].sort((a, b) => b.goals - a.goals).filter(r => r.goals > 0).slice(0, 10);
  const top10matches = [...filtered].sort((a, b) => b.matches - a.matches).filter(r => r.matches > 0).slice(0, 10);
  const top10mom     = [...filtered].sort((a, b) => (b.mom || 0) - (a.mom || 0)).filter(r => (r.mom || 0) > 0).slice(0, 10);
  const top10yellow  = [...filtered].sort((a, b) => b.yellow_cards - a.yellow_cards).filter(r => r.yellow_cards > 0).slice(0, 10);
  const top10red     = [...filtered].sort((a, b) => b.red_cards - a.red_cards).filter(r => r.red_cards > 0).slice(0, 10);
  const top10fines   = [...filtered].sort((a, b) => (b.fines_amount || 0) - (a.fines_amount || 0)).filter(r => (r.fines_amount || 0) > 0).slice(0, 10);

  const sortedBySeason = [...filtered].sort((a, b) => b.matches - a.matches || b.goals - a.goals);

  const isNarrowScreen = typeof window !== 'undefined' && window.innerWidth < 600;
  const showRotateBanner = (view === 'saeson' || view === 'spiller') && isNarrowScreen;

  return (
    <div className="page" style={{ color: 'var(--cfc-text-primary)' }}>

      {/* Rotér-banner til mobil */}
      {showRotateBanner && (
        <div style={{
          background: '#1a1200', border: '0.5px solid #c4a000', borderRadius: 8,
          padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#c4a000',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>↻</span>
          <span>Vend skærmen for bedre visning</span>
        </div>
      )}

      {/* Visningsskift */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {([
          ['top10',                'Top 10'],
          ['saeson',              'Sæsonoversigt'],
          ['spiller',             'Spillerprofil'],
          ['haedersbevisninger',  'Hædersbevisninger'],
        ] as [View, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} className="btn btn-sm" style={{
            background: view === v ? 'var(--cfc-bg-hover)' : 'transparent',
            color: view === v ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
            border: `0.5px solid ${view === v ? 'var(--cfc-border)' : 'transparent'}`,
          }}>{label}</button>
        ))}
      </div>

      {/* Filtre — skjules på hædersbevisninger-fane */}
      {view !== 'haedersbevisninger' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="input" style={{ width: 110, fontSize: 13 }} value={season} onChange={e => setSeason(e.target.value)}>
            <option value="">Alle sæsoner</option>
            {SEASONS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="input" style={{ width: 120, fontSize: 13 }} value={activeFilter} onChange={e => setActiveFilter(e.target.value as any)}>
            <option value="all">Alle spillere</option>
            <option value="active">Kun aktive</option>
            <option value="inactive">Pensionerede</option>
          </select>
          {view !== 'top10' && (
            <input className="input" style={{ flex: 1, minWidth: 120, fontSize: 13 }} placeholder="Søg spiller..." value={q} onChange={e => setQ(e.target.value)} />
          )}
        </div>
      )}

      {/* ── Hædersbevisninger ── */}
      {view === 'haedersbevisninger' && <HedersbevisningerTab />}

      {view !== 'haedersbevisninger' && loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
      ) : view !== 'haedersbevisninger' ? (
        <>
          {/* ── Top 10 diagrammer ── */}
          {view === 'top10' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <BarChart label="⚽ Flest kampe" rows={top10matches.map(r => ({ name: r.name, value: r.matches }))} color="#5b8dd9" />
                <BarChart label="🎯 Flest mål" rows={top10goals.map(r => ({ name: r.name, value: r.goals }))} color="#5a9e5a" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <BarChart label="🏆 Flest Man of the Match" rows={top10mom.map(r => ({ name: r.name, value: r.mom || 0 }))} color="#c4a000" />
                <BarChart label="🟨 Flest gule kort" rows={top10yellow.map(r => ({ name: r.name, value: r.yellow_cards }))} color="#b45309" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <BarChart label="🟥 Flest røde kort" rows={top10red.map(r => ({ name: r.name, value: r.red_cards }))} color="#e57373" />
                <BarChart label="💸 Flest bøder (kr.)" rows={top10fines.map(r => ({ name: r.name, value: r.fines_amount || 0 }))} color="#9b59b6" />
              </div>
              {filtered.length === 0 && <div className="empty">Ingen statistik for valgte filtre.</div>}
            </div>
          )}

          {/* ── Sæsonoversigt ── */}
          {view === 'saeson' && (
            <div style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, overflow: 'hidden' }}>
              {sortedBySeason.length === 0 ? (
                <div className="empty">Ingen statistik for valgte filtre.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid var(--cfc-border)', background: 'var(--cfc-bg-hover)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>#</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>Spiller</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>⚽</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>🎯</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>🏆</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>🟨</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>🟥</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>💸</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBySeason.map((row, i) => (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedPlayer(row as unknown as Player)}
                        style={{ borderBottom: '0.5px solid var(--cfc-border)', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--cfc-bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '8px 12px', color: 'var(--cfc-text-subtle)', fontSize: 11 }}>{i + 1}</td>
                        <td style={{ padding: '8px 12px', fontWeight: i < 3 ? 700 : 400, color: 'var(--cfc-text-primary)' }}>
                          {row.name}
                          {!row.active && <span style={{ fontSize: 10, color: 'var(--cfc-text-subtle)', marginLeft: 6 }}>pensioneret</span>}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--cfc-text-muted)' }}>{row.matches || '–'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: row.goals > 0 ? '#5a9e5a' : 'var(--cfc-text-subtle)', fontWeight: row.goals > 0 ? 700 : 400 }}>{row.goals || '–'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: (row.mom || 0) > 0 ? '#c4a000' : 'var(--cfc-text-subtle)' }}>{row.mom || '–'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: row.yellow_cards > 0 ? '#b45309' : 'var(--cfc-text-subtle)' }}>{row.yellow_cards || '–'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: row.red_cards > 0 ? '#e57373' : 'var(--cfc-text-subtle)' }}>{row.red_cards || '–'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: (row.fines_amount || 0) > 0 ? '#9b59b6' : 'var(--cfc-text-subtle)' }}>
                          {(row.fines_amount || 0) > 0 ? fmtKr(row.fines_amount) : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Spillerprofil-liste ── */}
          {view === 'spiller' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sortedBySeason.length === 0 && <div className="empty">Ingen spillere matcher.</div>}
              {sortedBySeason.map(row => (
                <button
                  key={row.id}
                  onClick={() => setSelectedPlayer(row as unknown as Player)}
                  style={{
                    width: '100%', textAlign: 'left', background: 'var(--cfc-bg-card)',
                    border: '0.5px solid var(--cfc-border)', borderRadius: 10,
                    padding: '10px 14px', cursor: 'pointer', color: 'var(--cfc-text-primary)',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontFamily: 'Georgia, serif' }}>{row.name}</span>
                    {!row.active && <span style={{ fontSize: 11, color: 'var(--cfc-text-subtle)', marginLeft: 8 }}>pensioneret</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--cfc-text-muted)' }}>
                    <span><strong style={{ color: '#5b8dd9' }}>{row.matches}</strong> kampe</span>
                    <span><strong style={{ color: '#5a9e5a' }}>{row.goals}</strong> mål</span>
                    {(row.mom || 0) > 0 && <span><strong style={{ color: '#c4a000' }}>{row.mom}</strong> MoM</span>}
                    {(row.fines_amount || 0) > 0 && <span><strong style={{ color: '#9b59b6' }}>{row.fines_amount} kr</strong></span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : null}

      {selectedPlayer && (
        <PlayerProfileModal
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
