import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function Stilling() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then(s => setUrl(s.standings_url || ''));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 16px 12px',
        borderBottom: '0.5px solid var(--cfc-border)',
        flexShrink: 0,
      }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 20, margin: 0, color: 'var(--cfc-text-primary)' }}>
          📈 Stilling
        </h1>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: 'var(--green)', textDecoration: 'none' }}
          >
            Åbn i ny fane ↗
          </a>
        )}
      </div>

      {/* Indhold */}
      <div style={{ flex: 1, padding: '12px 16px 16px', minHeight: 0 }}>
        {url === null && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner" />
          </div>
        )}

        {url === '' && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 8,
            color: 'var(--cfc-text-muted)', fontSize: 14, textAlign: 'center',
          }}>
            <span style={{ fontSize: 32 }}>📋</span>
            <div>Ingen stilling-URL konfigureret endnu.</div>
            <div style={{ fontSize: 13, color: 'var(--cfc-text-subtle)' }}>
              Admin kan tilføje den under Indstillinger.
            </div>
          </div>
        )}

        {url && (
          <iframe
            src={url}
            style={{
              width: '100%',
              height: '100%',
              minHeight: 'calc(100dvh - 130px)',
              border: 'none',
              borderRadius: 10,
              background: '#fff',
            }}
            title="Aktuel stilling"
          />
        )}
      </div>
    </div>
  );
}
