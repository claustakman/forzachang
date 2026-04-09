import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, StatsRow, PlayerSeasonStats, Player, PlayerHonor, HonorsSummary } from '../lib/api';
import { useAuth } from '../lib/auth';

const THIS_YEAR = new Date().getFullYear();
const SEASONS = Array.from({ length: THIS_YEAR - 2006 }, (_, i) => THIS_YEAR - i);
const OLDBOYS_YEARS = Array.from({ length: 2025 - 2019 + 1 }, (_, i) => 2025 - i);
const SENIOR_YEARS  = Array.from({ length: 2018 - 2007 + 1 }, (_, i) => 2018 - i);

function fmtKr(kr: number) { return kr > 0 ? `${kr} kr.` : '–'; }

// ── Mini søjlediagram ─────────────────────────────────────────────────────────

function BarChart({ rows, label, color }: { rows: { name: string; value: number }[]; label: string; color: string }) {
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

// ── Spillerprofil-modal ───────────────────────────────────────────────────────

function PlayerProfileModal({ player, onClose }: { player: Player; onClose: () => void }) {
  const [seasons, setSeasons] = useState<PlayerSeasonStats[]>([]);
  const [honors, setHonors] = useState<PlayerHonor[]>([]);
  const [loading, setLoading] = useState(true);
  const [honorsOpen, setHonorsOpen] = useState(false);

  useEffect(() => {
    Promise.all([api.getPlayerStats(player.id), api.getHonors(player.id)])
      .then(([statsData, honorsData]) => {
        setSeasons(statsData as unknown as PlayerSeasonStats[]);
        setHonors(honorsData);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [player.id]);

  const autoHonors = honors.filter(h => h.honor_type === 'auto');
  const manualHonors = honors.filter(h => h.honor_type === 'manual');
  const manualByType = manualHonors.reduce((acc, h) => {
    if (!acc[h.honor_type_id]) acc[h.honor_type_id] = { name: h.honor_name, years: [] };
    acc[h.honor_type_id].years.push(h.season!);
    return acc;
  }, {} as Record<string, { name: string; years: number[] }>);

  const totals = seasons.reduce((acc, s) => ({
    matches: acc.matches + s.matches, goals: acc.goals + s.goals, mom: acc.mom + (s.mom || 0),
    yellow_cards: acc.yellow_cards + s.yellow_cards, red_cards: acc.red_cards + s.red_cards,
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
        {honors.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <button onClick={() => setHonorsOpen(o => !o)} style={{ width: '100%', textAlign: 'left', background: 'var(--cfc-bg-hover)', border: '0.5px solid var(--cfc-border)', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: 'var(--cfc-text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
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
                        <span key={h.id} style={{ fontSize: 12, padding: '2px 9px', borderRadius: 100, background: '#0f1a2e', color: '#5b8dd9', border: '0.5px solid #1a3a5c' }}>{h.honor_name}</span>
                      ))}
                    </div>
                  </div>
                )}
                {Object.values(manualByType).map(({ name, years }) => (
                  <div key={name} style={{ fontSize: 13, color: 'var(--cfc-text-muted)' }}>
                    <span style={{ color: '#c4a000', fontWeight: 600 }}>{name}</span>{' '}
                    {years.sort((a, b) => b - a).join(', ')}
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

// ── Hædersbevisninger ────────────────────────────────────────────────────────

function HaederTab() {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Automatiske milestones */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cfc-text-muted)', marginBottom: 12 }}>
          Præstationer
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {autoTypes.map(ht => {
            const recipients = summary.honors.filter(h => h.honor_type_id === ht.id);
            if (recipients.length === 0) return null;
            return (
              <div key={ht.id} style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cfc-text-muted)', marginBottom: 8 }}>
                  🏅 {ht.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[...recipients]
                    .sort((a, b) => (a.player_name || '').localeCompare(b.player_name || '', 'da'))
                    .map(h => (
                      <span key={h.id} style={{ fontSize: 13, padding: '3px 10px', borderRadius: 100, background: 'var(--cfc-bg-hover)', color: 'var(--cfc-text-primary)', border: '0.5px solid var(--cfc-border)' }}>
                        {h.player_name}
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manuelle kåringer */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cfc-text-muted)', marginBottom: 12 }}>
          Kåringer
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {manualTypes.map(ht => {
            const prizes = summary.honors.filter(h => h.honor_type_id === ht.id && h.season != null);
            if (prizes.length === 0) return null;
            const sorted = [...prizes].sort((a, b) => (b.season || 0) - (a.season || 0));
            return (
              <div key={ht.id} style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cfc-text-muted)', marginBottom: 8 }}>
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
        </div>
      </div>
    </div>
  );
}

// ── Spillerhistorik ───────────────────────────────────────────────────────────

type SpillerView = 'saeson' | 'spiller' | 'top10' | 'haeder';

function SpillerhistorikTab() {
  const [view, setView] = useState<SpillerView>('saeson');
  const [seasonSaeson, setSeasonSaeson] = useState<string>(String(THIS_YEAR));
  const [seasonTop10, setSeasonTop10] = useState<string>('');
  const [seasonSpiller, setSeasonSpiller] = useState<string>('');
  const season = view === 'saeson' ? seasonSaeson : view === 'top10' ? seasonTop10 : seasonSpiller;
  const setSeason = view === 'saeson' ? setSeasonSaeson : view === 'top10' ? setSeasonTop10 : setSeasonSpiller;
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

  const top10goals   = [...filtered].sort((a, b) => b.goals - a.goals).filter(r => r.goals > 0).slice(0, 10);
  const top10matches = [...filtered].sort((a, b) => b.matches - a.matches).filter(r => r.matches > 0).slice(0, 10);
  const top10mom     = [...filtered].sort((a, b) => (b.mom || 0) - (a.mom || 0)).filter(r => (r.mom || 0) > 0).slice(0, 10);
  const top10yellow  = [...filtered].sort((a, b) => b.yellow_cards - a.yellow_cards).filter(r => r.yellow_cards > 0).slice(0, 10);
  const top10red     = [...filtered].sort((a, b) => b.red_cards - a.red_cards).filter(r => r.red_cards > 0).slice(0, 10);
  const top10fines   = [...filtered].sort((a, b) => (b.fines_amount || 0) - (a.fines_amount || 0)).filter(r => (r.fines_amount || 0) > 0).slice(0, 10);
  const sorted = [...filtered].sort((a, b) => b.matches - a.matches || b.goals - a.goals);

  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 600;
  const showRotate = (view === 'saeson' || view === 'spiller') && isNarrow;

  return (
    <>
      {showRotate && (
        <div style={{ background: '#1a1200', border: '0.5px solid #c4a000', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#c4a000', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>↻</span><span>Vend skærmen for bedre visning</span>
        </div>
      )}
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {([['saeson', 'Sæsonoversigt'], ['spiller', 'Spillerstatistik'], ['top10', 'Top 10'], ['haeder', 'Hæder']] as [SpillerView, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} className="btn btn-sm" style={{
            background: view === v ? 'var(--cfc-bg-hover)' : 'transparent',
            color: view === v ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
            border: `0.5px solid ${view === v ? 'var(--cfc-border)' : 'transparent'}`,
          }}>{label}</button>
        ))}
      </div>
      {view !== 'haeder' && (
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
      {view === 'haeder' ? (
        <HaederTab />
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
      ) : (
        <>
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
          {view === 'saeson' && (
            <div style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, overflow: 'hidden' }}>
              {sorted.length === 0 ? <div className="empty">Ingen statistik for valgte filtre.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid var(--cfc-border)', background: 'var(--cfc-bg-hover)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>#</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>Spiller</th>
                      {['⚽','🎯','🏆','🟨','🟥','💸'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row, i) => (
                      <tr key={row.id} onClick={() => setSelectedPlayer(row as unknown as Player)}
                        style={{ borderBottom: '0.5px solid var(--cfc-border)', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--cfc-bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '8px 12px', color: 'var(--cfc-text-subtle)', fontSize: 11 }}>{i + 1}</td>
                        <td style={{ padding: '8px 12px', fontWeight: i < 3 ? 700 : 400, color: 'var(--cfc-text-primary)' }}>
                          {row.name}{!row.active && <span style={{ fontSize: 10, color: 'var(--cfc-text-subtle)', marginLeft: 6 }}>pensioneret</span>}
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
          {view === 'spiller' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {sorted.length === 0 && <div className="empty">Ingen spillere matcher.</div>}
              {sorted.map(row => (
                <button key={row.id} onClick={() => setSelectedPlayer(row as unknown as Player)}
                  style={{ width: '100%', textAlign: 'left', background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', color: 'var(--cfc-text-primary)', display: 'flex', alignItems: 'center', gap: 12 }}>
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
      )}
      {selectedPlayer && <PlayerProfileModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
    </>
  );
}

// ── Holdrekorder ──────────────────────────────────────────────────────────────

interface TeamRecord {
  id: string; team_type: string; record_key: string; label: string;
  value: string; context?: string; auto_update: number; sort_order: number; updated_at: string;
}

function HoldrekorderTab() {
  const { isAdmin } = useAuth();
  const [records, setRecords] = useState<{ oldboys: TeamRecord[]; senior: TeamRecord[] }>({ oldboys: [], senior: [] });
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editContext, setEditContext] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    try { setRecords(await api.getRecords()); } catch { /* ignore */ }
    setLoading(false);
  }

  function startEdit(r: TeamRecord) { setEditId(r.id); setEditValue(r.value); setEditContext(r.context || ''); }
  async function saveEdit() {
    if (!editId) return;
    setSaving(true);
    try {
      await api.updateRecord(editId, { value: editValue, context: editContext });
      setEditId(null);
      await load();
    } catch { /* ignore */ }
    setSaving(false);
  }

  function renderGroup(label: string, items: TeamRecord[]) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cfc-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
        <div style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, overflow: 'hidden' }}>
          {items.map((r, i) => (
            <div key={r.id} style={{ borderBottom: i < items.length - 1 ? '0.5px solid var(--cfc-border)' : 'none', padding: '10px 14px' }}>
              {editId === r.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cfc-text-primary)' }}>{r.label}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <input className="input" style={{ flex: 2, fontSize: 13 }} value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="Rekordværdi" />
                    <input className="input" style={{ flex: 1, fontSize: 13 }} value={editContext} onChange={e => setEditContext(e.target.value)} placeholder="Kontekst/årstal" />
                    <button className="btn btn-sm btn-primary" onClick={saveEdit} disabled={saving}>{saving ? '...' : 'Gem'}</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => setEditId(null)}>Annullér</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginBottom: 2 }}>
                      {r.label}
                      {r.auto_update === 1 && (
                        <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 100, background: '#0f1a2e', color: '#5b8dd9', border: '0.5px solid #1a3a5c' }}>auto</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--cfc-text-primary)', fontFamily: 'Georgia, serif' }}>{r.value}</span>
                      {r.context && <span style={{ fontSize: 12, color: 'var(--cfc-text-subtle)' }}>{r.context}</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <button className="btn btn-sm btn-secondary" onClick={() => startEdit(r)} style={{ flexShrink: 0 }}>Rediger</button>
                  )}
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && <div className="empty">Ingen rekorder registreret endnu.</div>}
        </div>
      </div>
    );
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>;

  return (
    <>
      {renderGroup('Oldboys', records.oldboys)}
      {renderGroup('Senior', records.senior)}
    </>
  );
}

// ── Tidligere sæsoner ─────────────────────────────────────────────────────────

interface SeasonStanding {
  id: string; team_type: string; season: number; position?: number; league?: string;
  played?: number; won?: number; drawn?: number; lost?: number;
  goals_for?: number; goals_against?: number; points?: number;
  imported_at: string;
}
interface SeasonMatch {
  id: string; team_type: string; season: number; match_date?: string; opponent: string;
  home_away?: string; goals_for?: number; goals_against?: number; result?: string;
}

function fmtResult(r: string) {
  if (r === 'sejr') return { label: 'S', bg: '#162416', color: '#5a9e5a' };
  if (r === 'uafgjort') return { label: 'U', bg: '#1a1500', color: '#c4a000' };
  return { label: 'N', bg: '#2a1010', color: '#e57373' };
}

function StandingCard({ standing }: { standing: SeasonStanding }) {
  return (
    <div style={{ background: 'var(--cfc-bg-hover)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cfc-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        Slutstilling{standing.league ? ` · ${standing.league}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))', gap: 6 }}>
        {[
          { label: 'Placering', value: standing.position != null ? `${standing.position}.` : '–', color: '#5b8dd9' },
          { label: 'Point', value: standing.points ?? '–', color: '#c4a000' },
          { label: 'Kampe', value: standing.played ?? '–', color: 'var(--cfc-text-primary)' },
          { label: 'Sejre', value: standing.won ?? '–', color: '#5a9e5a' },
          { label: 'Uafg.', value: standing.drawn ?? '–', color: '#c4a000' },
          { label: 'Neder.', value: standing.lost ?? '–', color: '#e57373' },
          { label: 'Mål', value: (standing.goals_for != null && standing.goals_against != null) ? `${standing.goals_for}:${standing.goals_against}` : '–', color: 'var(--cfc-text-muted)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--cfc-bg-card)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 9, color: 'var(--cfc-text-subtle)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchList({ matches }: { matches: SeasonMatch[] }) {
  if (matches.length === 0) return <div className="empty" style={{ padding: '12px 0' }}>Ingen kampdata.</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '0.5px solid var(--cfc-border)', background: 'var(--cfc-bg-hover)' }}>
          <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>Dato</th>
          <th style={{ padding: '6px 6px', textAlign: 'left', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>H/U</th>
          <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>Modstander</th>
          <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>Resultat</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((m, i) => {
          const res = m.result ? fmtResult(m.result) : null;
          return (
            <tr key={m.id} style={{ borderBottom: i < matches.length - 1 ? '0.5px solid var(--cfc-border)' : 'none' }}>
              <td style={{ padding: '7px 10px', color: 'var(--cfc-text-subtle)', fontSize: 12 }}>{m.match_date || '–'}</td>
              <td style={{ padding: '7px 6px', color: 'var(--cfc-text-subtle)', fontSize: 12 }}>{m.home_away === 'hjemme' ? 'H' : m.home_away === 'ude' ? 'U' : '–'}</td>
              <td style={{ padding: '7px 10px', color: 'var(--cfc-text-primary)' }}>{m.opponent}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                {m.goals_for != null && m.goals_against != null && (
                  <span style={{ marginRight: 6, fontSize: 13, fontWeight: 600 }}>{m.goals_for}–{m.goals_against}</span>
                )}
                {res && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 100, background: res.bg, color: res.color }}>{res.label}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SeasonSection({ standing, teamType }: { standing: SeasonStanding; teamType: 'oldboys' | 'senior' }) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<SeasonMatch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!open && !loaded) {
      setLoading(true);
      try {
        const data = await api.getStandingMatches({ team_type: teamType, season: standing.season });
        setMatches(data);
        setLoaded(true);
      } catch { /* ignore */ }
      setLoading(false);
    }
    setOpen(o => !o);
  }

  return (
    <div style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <button onClick={toggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--cfc-text-primary)',
      }}>
        <span style={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 16 }}>{standing.season}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {standing.position != null && (
            <span style={{ fontSize: 13, color: '#5b8dd9', fontWeight: 600 }}>{standing.position}. plads</span>
          )}
          {standing.points != null && (
            <span style={{ fontSize: 13, color: 'var(--cfc-text-muted)' }}>{standing.points} point</span>
          )}
          {loading
            ? <span style={{ fontSize: 13, color: 'var(--cfc-text-subtle)' }}>...</span>
            : <span style={{ fontSize: 13, color: 'var(--cfc-text-subtle)' }}>{open ? '▲' : '▼'}</span>
          }
        </div>
      </button>
      {open && (
        <div style={{ borderTop: '0.5px solid var(--cfc-border)', padding: '14px 16px' }}>
          <StandingCard standing={standing} />
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cfc-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Sæsonprogram
          </div>
          <div style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 8, overflow: 'hidden' }}>
            <MatchList matches={matches} />
          </div>
        </div>
      )}
    </div>
  );
}

function TidligereSaesoner() {
  const [subView, setSubView] = useState<'soeg' | 'oldboys' | 'senior'>('oldboys');
  const [obStandings, setObStandings] = useState<SeasonStanding[]>([]);
  const [senStandings, setSenStandings] = useState<SeasonStanding[]>([]);
  const [loadedOb, setLoadedOb] = useState(false);
  const [loadedSen, setLoadedSen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<SeasonMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (subView === 'oldboys' && !loadedOb) {
      api.getStandings({ team_type: 'oldboys' }).then(data => {
        setObStandings(data);
        setLoadedOb(true);
      }).catch(() => setLoadedOb(true));
    }
    if (subView === 'senior' && !loadedSen) {
      api.getStandings({ team_type: 'senior' }).then(data => {
        setSenStandings(data);
        setLoadedSen(true);
      }).catch(() => setLoadedSen(true));
    }
  }, [subView]);

  async function doSearch() {
    if (!searchQ.trim()) return;
    setSearching(true);
    setSearched(false);
    try {
      const data = await api.getStandingMatches({ opponent: searchQ });
      setSearchResults(data);
    } catch { setSearchResults([]); }
    setSearching(false);
    setSearched(true);
  }

  const standings = subView === 'oldboys' ? obStandings : subView === 'senior' ? senStandings : [];
  const loaded = subView === 'oldboys' ? loadedOb : subView === 'senior' ? loadedSen : true;

  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {([['soeg', 'Søg'], ['oldboys', 'Oldboys'], ['senior', 'Senior']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setSubView(v)} className="btn btn-sm" style={{
            background: subView === v ? 'var(--cfc-bg-hover)' : 'transparent',
            color: subView === v ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
            border: `0.5px solid ${subView === v ? 'var(--cfc-border)' : 'transparent'}`,
          }}>{label}</button>
        ))}
      </div>

      {subView === 'soeg' && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <input
              className="input" style={{ flex: 1, fontSize: 13 }}
              placeholder="Søg på modstander, fx Lokomotiv..."
              value={searchQ} onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
            />
            <button className="btn btn-primary btn-sm" onClick={doSearch} disabled={searching}>
              {searching ? '...' : 'Søg'}
            </button>
          </div>
          {searched && searchResults.length === 0 && (
            <div className="empty">Ingen resultater for "{searchQ}".</div>
          )}
          {searchResults.length > 0 && (
            <div style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--cfc-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 14px', borderBottom: '0.5px solid var(--cfc-border)' }}>
                {searchResults.length} kamp{searchResults.length !== 1 ? 'e' : ''} mod "{searchQ}"
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid var(--cfc-border)', background: 'var(--cfc-bg-hover)' }}>
                    {['Sæson', 'Hold', 'Dato', 'H/U', 'Modstander', 'Resultat'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--cfc-text-muted)', fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((m, i) => {
                    const res = m.result ? fmtResult(m.result) : null;
                    return (
                      <tr key={m.id} style={{ borderBottom: i < searchResults.length - 1 ? '0.5px solid var(--cfc-border)' : 'none' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--cfc-text-muted)' }}>{m.season}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--cfc-text-subtle)', fontSize: 11 }}>{m.team_type}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--cfc-text-subtle)', fontSize: 12 }}>{m.match_date || '–'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--cfc-text-subtle)', fontSize: 12 }}>{m.home_away === 'hjemme' ? 'H' : 'U'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--cfc-text-primary)' }}>{m.opponent}</td>
                        <td style={{ padding: '6px 10px' }}>
                          {m.goals_for != null && m.goals_against != null && (
                            <span style={{ marginRight: 4, fontWeight: 600 }}>{m.goals_for}–{m.goals_against}</span>
                          )}
                          {res && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 100, background: res.bg, color: res.color }}>{res.label}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {(subView === 'oldboys' || subView === 'senior') && (
        !loaded ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
        ) : standings.length === 0 ? (
          <div className="empty">Ingen historik tilgængelig endnu.</div>
        ) : (
          <div>
            {standings.map(s => (
              <SeasonSection key={s.id} standing={s} teamType={subView as 'oldboys' | 'senior'} />
            ))}
          </div>
        )
      )}
    </>
  );
}

// ── Holdhistorik (wrapper med sub-tabs: Holdrekorder + Tidligere sæsoner) ────

type HoldTab = 'rekorder' | 'saesoner';

function HoldhistorikTab() {
  const [holdTab, setHoldTab] = useState<HoldTab>('saesoner');

  return (
    <>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {([['saesoner', 'Tidligere sæsoner'], ['rekorder', 'Holdrekorder']] as [HoldTab, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setHoldTab(v)} className="btn btn-sm" style={{
            background: holdTab === v ? 'var(--cfc-bg-hover)' : 'transparent',
            color: holdTab === v ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
            border: `0.5px solid ${holdTab === v ? 'var(--cfc-border)' : 'transparent'}`,
          }}>{label}</button>
        ))}
      </div>
      {holdTab === 'rekorder' && <HoldrekorderTab />}
      {holdTab === 'saesoner' && <TidligereSaesoner />}
    </>
  );
}

// ── Hoved-komponent ───────────────────────────────────────────────────────────

type MainTab = 'spillere' | 'hold';

export default function Historie() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  // Bagudkompatibilitet: gamle tabs redirectes
  const tab: MainTab = (rawTab === 'rekorder' || rawTab === 'historik' || rawTab === 'hold') ? 'hold'
    : 'spillere';

  function setTab(t: MainTab) { setSearchParams({ tab: t }); }

  return (
    <div className="page" style={{ color: 'var(--cfc-text-primary)' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {([
          ['spillere', 'Spillerhistorik'],
          ['hold',     'Holdhistorik'],
        ] as [MainTab, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)} className="btn btn-sm" style={{
            background: tab === v ? 'var(--cfc-bg-hover)' : 'transparent',
            color: tab === v ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
            border: `0.5px solid ${tab === v ? 'var(--cfc-border)' : 'transparent'}`,
            fontSize: 15, padding: '7px 16px',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'spillere' && <SpillerhistorikTab />}
      {tab === 'hold'     && <HoldhistorikTab />}
    </div>
  );
}
