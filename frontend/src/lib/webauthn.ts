// Browser-side WebAuthn helpers — uses navigator.credentials natively.

import { api } from './api';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from './api';

// base64url helpers
function b64uEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64uDecode(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export function isPlatformAuthenticatorSupported(): boolean {
  return !!window.PublicKeyCredential;
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// Register a new platform authenticator for the currently logged-in user.
// Returns the device name assigned by the server, or throws on error.
export async function registerPasskey(): Promise<string> {
  const opts = await api.webauthnRegisterOptions();

  const createOpts: CredentialCreationOptions = {
    publicKey: {
      rp: opts.rp,
      user: {
        id: b64uDecode(opts.user.id),
        name: opts.user.name,
        displayName: opts.user.displayName,
      },
      challenge: b64uDecode(opts.challenge),
      pubKeyCredParams: opts.pubKeyCredParams as PublicKeyCredentialParameters[],
      timeout: opts.timeout,
      authenticatorSelection: opts.authenticatorSelection as AuthenticatorSelectionCriteria,
      attestation: (opts.attestation as AttestationConveyancePreference) || 'none',
    },
  };

  const cred = await navigator.credentials.create(createOpts) as PublicKeyCredential;
  if (!cred) throw new Error('Enhed afviste registrering');

  const resp = cred.response as AuthenticatorAttestationResponse;
  const payload: RegistrationResponseJSON = {
    id: cred.id,
    rawId: b64uEncode(cred.rawId),
    response: {
      clientDataJSON: b64uEncode(resp.clientDataJSON),
      attestationObject: b64uEncode(resp.attestationObject),
      transports: resp.getTransports?.() ?? [],
    },
    type: cred.type,
  };

  const result = await api.webauthnRegisterVerify(payload);
  return result.device_name;
}

// Authenticate with a registered passkey for the given username.
// Returns { token, player } on success, or throws on failure.
export async function authenticateWithPasskey(username: string) {
  const opts = await api.webauthnLoginOptions(username);

  const getOpts: CredentialRequestOptions = {
    publicKey: {
      challenge: b64uDecode(opts.challenge),
      timeout: opts.timeout,
      rpId: opts.rpId,
      allowCredentials: opts.allowCredentials.map(c => ({
        type: c.type as PublicKeyCredentialType,
        id: b64uDecode(c.id),
        transports: (c.transports as AuthenticatorTransport[]) || [],
      })),
      userVerification: (opts.userVerification as UserVerificationRequirement) || 'required',
    },
  };

  const cred = await navigator.credentials.get(getOpts) as PublicKeyCredential;
  if (!cred) throw new Error('Biometri annulleret');

  const resp = cred.response as AuthenticatorAssertionResponse;
  const payload: AuthenticationResponseJSON = {
    id: cred.id,
    rawId: b64uEncode(cred.rawId),
    response: {
      clientDataJSON: b64uEncode(resp.clientDataJSON),
      authenticatorData: b64uEncode(resp.authenticatorData),
      signature: b64uEncode(resp.signature),
      userHandle: resp.userHandle ? b64uEncode(resp.userHandle) : undefined,
    },
    type: cred.type,
  };

  return api.webauthnLoginVerify(payload);
}

// LocalStorage keys
const LS_EMAIL = 'cfc_last_email';
const LS_PASSKEY_ENROLLED = 'cfc_passkey_enrolled';
const LS_PASSKEY_NEVER = 'cfc_passkey_never';

export function getLastEmail(): string {
  return localStorage.getItem(LS_EMAIL) || '';
}

export function saveLastEmail(email: string) {
  localStorage.setItem(LS_EMAIL, email);
}

export function isPasskeyEnrolledOnDevice(): boolean {
  return localStorage.getItem(LS_PASSKEY_ENROLLED) === '1';
}

export function markPasskeyEnrolled() {
  localStorage.setItem(LS_PASSKEY_ENROLLED, '1');
}

export function isPasskeyPromptDismissedForever(): boolean {
  return localStorage.getItem(LS_PASSKEY_NEVER) === '1';
}

export function dismissPasskeyPromptForever() {
  localStorage.setItem(LS_PASSKEY_NEVER, '1');
}

// SessionStorage signal: set before calling auth.login() so the prompt component
// inside the authenticated shell can pick it up on mount.
const SS_SHOW_PASSKEY_PROMPT = 'cfc_show_passkey_prompt';

export function signalPasskeyPrompt() {
  sessionStorage.setItem(SS_SHOW_PASSKEY_PROMPT, '1');
}

export function consumePasskeyPromptSignal(): boolean {
  const val = sessionStorage.getItem(SS_SHOW_PASSKEY_PROMPT) === '1';
  sessionStorage.removeItem(SS_SHOW_PASSKEY_PROMPT);
  return val;
}
