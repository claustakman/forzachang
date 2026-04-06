import { useState, useEffect } from 'react';
import { api, HonorsSummary } from '../lib/api';

// ── Præstationer (automatiske milestones) ─────────────────────────────────────

function PraestationerTab({ summary }: { summary: HonorsSummary }) {
  const autoTypes = summary.types.filter(t => t.type === 'auto');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {autoTypes.map(ht => {
        const recipients = summary.honors.filter(h => h.honor_type_id === ht.id);
        if (recipients.length === 0) return null;
        return (
          <div key={ht.id} style={{ background: 'var(--cfc-bg-card)', border: '0.5px solid var(--cfc-border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cfc-text-muted)', marginBottom: 10 }}>
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
      {autoTypes.every(ht => summary.honors.filter(h => h.honor_type_id === ht.id).length === 0) && (
        <div className="empty">Ingen præstationer registreret endnu.</div>
      )}
    </div>
  );
}

// ── Kåringer (manuelle årspriser) ─────────────────────────────────────────────

function KaaringerTab({ summary }: { summary: HonorsSummary }) {
  const manualTypes = summary.types.filter(t => t.type === 'manual');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
      {manualTypes.every(ht => summary.honors.filter(h => h.honor_type_id === ht.id && h.season != null).length === 0) && (
        <div className="empty">Ingen kåringer registreret endnu.</div>
      )}
    </div>
  );
}

// ── Hoved-komponent ───────────────────────────────────────────────────────────

type SubTab = 'praestationer' | 'kaaringer';

export default function Haeder() {
  const [tab, setTab] = useState<SubTab>('praestationer');
  const [summary, setSummary] = useState<HonorsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getHonorsSummary().then(data => {
      setSummary(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="page" style={{ color: 'var(--cfc-text-primary)' }}>
      {/* Underfaner */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {([
          ['praestationer', 'Præstationer'],
          ['kaaringer',     'Kåringer'],
        ] as [SubTab, string][]).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className="btn btn-sm"
            style={{
              background: tab === v ? 'var(--cfc-bg-hover)' : 'transparent',
              color: tab === v ? 'var(--cfc-text-primary)' : 'var(--cfc-text-muted)',
              border: `0.5px solid ${tab === v ? 'var(--cfc-border)' : 'transparent'}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
      ) : !summary ? (
        <div className="empty">Kunne ikke hente hædersbevisninger.</div>
      ) : tab === 'praestationer' ? (
        <PraestationerTab summary={summary} />
      ) : (
        <KaaringerTab summary={summary} />
      )}
    </div>
  );
}
