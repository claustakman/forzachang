// Post-login bottom-sheet: offer to enable Face ID / Touch ID.
// Mounted inside the authenticated app shell (Layout) so it survives login navigation.
// Reads a sessionStorage signal set by Login.tsx before calling login().

import { useState, useEffect } from 'react';
import {
  consumePasskeyPromptSignal,
  registerPasskey,
  markPasskeyEnrolled,
  dismissPasskeyPromptForever,
} from '../lib/webauthn';

export default function PasskeyPrompt() {
  const [visible, setVisible] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (consumePasskeyPromptSignal()) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  async function enable() {
    setError('');
    setEnrolling(true);
    try {
      const deviceName = await registerPasskey();
      markPasskeyEnrolled();
      setDone(true);
      setTimeout(() => setVisible(false), 2000);
      void deviceName;
    } catch (e: any) {
      setError(e.message || 'Noget gik galt');
    } finally {
      setEnrolling(false);
    }
  }

  function notNow() {
    setVisible(false);
  }

  function never() {
    dismissPasskeyPromptForever();
    setVisible(false);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={notNow}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 200,
        }}
      />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--cfc-bg-card)',
        borderRadius: '20px 20px 0 0',
        padding: '24px 24px calc(24px + env(safe-area-inset-bottom))',
        zIndex: 201,
        boxShadow: '0 -4px 32px rgba(0,0,0,0.12)',
        animation: 'slideUp 0.25s ease-out',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--cfc-border)' }} />
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
            <p style={{ fontWeight: 600, color: 'var(--cfc-text-primary)' }}>Face ID / Touch ID aktiveret!</p>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>🔑</div>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--cfc-text-primary)' }}>
                Log ind med Face ID / Touch ID?
              </h2>
              <p style={{ fontSize: 14, color: 'var(--cfc-text-muted)', lineHeight: 1.5 }}>
                Du slipper for at taste kodeord næste gang du logger ind.
              </p>
            </div>

            {error && (
              <p style={{ fontSize: 13, color: '#e57373', marginBottom: 12, textAlign: 'center' }}>{error}</p>
            )}

            <button
              onClick={enable}
              disabled={enrolling}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginBottom: 10, fontSize: 15 }}
            >
              {enrolling ? 'Aktiverer...' : 'Aktiver Face ID / Touch ID'}
            </button>

            <button
              onClick={notNow}
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
            >
              Ikke nu
            </button>

            <button
              onClick={never}
              style={{
                display: 'block', width: '100%', background: 'none', border: 'none',
                color: 'var(--cfc-text-muted)', fontSize: 13, cursor: 'pointer',
                padding: '8px 0', textAlign: 'center',
              }}
            >
              Spørg mig ikke igen
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
