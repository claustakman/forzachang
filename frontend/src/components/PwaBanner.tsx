import { useState, useEffect } from 'react';

type Platform = 'ios' | 'android' | 'other';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

function isInStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
}

export default function PwaBanner() {
  const [show, setShow] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [platform] = useState<Platform>(detectPlatform);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (localStorage.getItem('pwa_prompt_dismissed')) return;
    if (isInStandaloneMode()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const timer = setTimeout(() => setShow(true), 3000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    localStorage.setItem('pwa_prompt_dismissed', '1');
    setShow(false);
    setShowModal(false);
  }

  async function handleInstallClick() {
    if (platform === 'android' && deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') { dismiss(); return; }
    }
    setShowModal(true);
  }

  if (!show) return null;

  return (
    <>
      <div style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 68px)',
        left: 16, right: 16,
        background: 'var(--cfc-bg-card)',
        border: '0.5px solid var(--cfc-border)',
        borderRadius: 12,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 100,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>⚽</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--cfc-text-primary)', margin: 0 }}>
            Installér CFC-appen på din telefon
          </p>
          <p style={{ fontSize: 11, color: 'var(--cfc-text-muted)', margin: '2px 0 0' }}>
            Hurtigere adgang og push-notifikationer
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={handleInstallClick}
            style={{
              background: '#5b8dd9', color: '#fff', border: 'none', borderRadius: 8,
              padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Installér
          </button>
          <button
            onClick={dismiss}
            style={{
              background: 'transparent', color: 'var(--cfc-text-muted)', border: 'none',
              padding: '7px 8px', fontSize: 18, cursor: 'pointer', lineHeight: 1,
            }}
            aria-label="Luk"
          >
            ×
          </button>
        </div>
      </div>

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 200,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--cfc-bg-card)',
              borderRadius: '16px 16px 0 0',
              padding: '24px 24px 40px',
              width: '100%',
              maxWidth: 480,
              border: '0.5px solid var(--cfc-border)',
            }}
          >
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16, color: 'var(--cfc-text-primary)', margin: '0 0 16px' }}>
              Installér CFC-appen
            </h3>

            {platform === 'ios' && (
              <div style={{ fontSize: 14, color: 'var(--cfc-text-muted)', lineHeight: 1.7 }}>
                <p style={{ margin: '0 0 12px' }}>På iPhone/iPad med Safari:</p>
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  <li>Tryk på <strong style={{ color: 'var(--cfc-text-primary)' }}>Del-ikonet ⎙</strong> i bunden af skærmen</li>
                  <li>Vælg <strong style={{ color: 'var(--cfc-text-primary)' }}>"Føj til hjemmeskærm"</strong></li>
                  <li>Tryk <strong style={{ color: 'var(--cfc-text-primary)' }}>"Tilføj"</strong></li>
                </ol>
              </div>
            )}

            {platform === 'android' && (
              <div style={{ fontSize: 14, color: 'var(--cfc-text-muted)', lineHeight: 1.7 }}>
                <p style={{ margin: '0 0 12px' }}>På Android med Chrome:</p>
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  <li>Tryk på menu-ikonet <strong style={{ color: 'var(--cfc-text-primary)' }}>⋮</strong> øverst til højre</li>
                  <li>Vælg <strong style={{ color: 'var(--cfc-text-primary)' }}>"Tilføj til startskærm"</strong></li>
                  <li>Tryk <strong style={{ color: 'var(--cfc-text-primary)' }}>"Tilføj"</strong></li>
                </ol>
              </div>
            )}

            {platform === 'other' && (
              <p style={{ fontSize: 14, color: 'var(--cfc-text-muted)', lineHeight: 1.6 }}>
                Åbn siden i Chrome eller Safari på din telefon for at installere appen.
              </p>
            )}

            <button
              onClick={dismiss}
              style={{
                width: '100%', textAlign: 'center', background: 'var(--cfc-bg-hover)',
                border: '0.5px solid var(--cfc-border)', borderRadius: 8, color: 'var(--cfc-text-muted)',
                padding: '11px', fontSize: 13, cursor: 'pointer', marginTop: 20,
              }}
            >
              Luk og vis ikke igen
            </button>
          </div>
        </div>
      )}
    </>
  );
}
