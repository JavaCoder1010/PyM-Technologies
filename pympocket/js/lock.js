// Desbloqueo con huella, rostro o PIN del dispositivo (WebAuthn).
//
// Después del primer ingreso con contraseña, el usuario puede activar el
// desbloqueo biométrico: la app registra una credencial en el dispositivo
// (lector de huellas del celular, Face ID, Windows Hello, Touch ID) y la pide
// cada vez que se abre o se vuelve a ella después de un rato. La huella nunca
// sale del dispositivo; la app solo recibe la confirmación del sistema.
// Si no funciona, siempre se puede desbloquear con la contraseña.
import { currentUser } from './auth.js';

const RELOCK_AFTER_MS = 5 * 60 * 1000;
const keyFor = (uid) => `pympocket.lock.${uid}`;
const UNLOCKED_KEY = 'pympocket.unlockedAt';

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

/** ¿El dispositivo tiene huella, rostro o PIN del sistema disponibles? */
export async function biometricAvailable() {
  try {
    return Boolean(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
  } catch {
    return false;
  }
}

function config() {
  const user = currentUser();
  if (!user) return null;
  try {
    return JSON.parse(localStorage.getItem(keyFor(user.id)));
  } catch {
    return null;
  }
}

export const biometricEnabled = () => Boolean(config()?.credentialId);

/** Registra la huella/rostro de este dispositivo para la cuenta actual. */
export async function enableBiometric() {
  const user = currentUser();
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: 'PymPocket' },
      user: { id: new TextEncoder().encode(user.id), name: user.email, displayName: user.email },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000,
    },
  });
  localStorage.setItem(keyFor(user.id), JSON.stringify({ credentialId: toB64(credential.rawId), createdAt: new Date().toISOString() }));
  markUnlocked();
}

export function disableBiometric() {
  const user = currentUser();
  if (user) localStorage.removeItem(keyFor(user.id));
}

/** Pide la huella/rostro. Lanza un error si el usuario cancela o falla. */
export async function unlockWithBiometric() {
  const { credentialId } = config();
  await navigator.credentials.get({
    publicKey: {
      challenge: challenge(),
      allowCredentials: [{ type: 'public-key', id: fromB64(credentialId), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  markUnlocked();
}

export function markUnlocked() {
  try {
    sessionStorage.setItem(UNLOCKED_KEY, String(Date.now()));
  } catch {}
}

/**
 * ¿Hay que pedir desbloqueo? Al abrir la app (sesión nueva del navegador) o
 * al volver después de 5 minutos en segundo plano.
 */
export function needsUnlock() {
  if (!biometricEnabled()) return false;
  const at = Number(sessionStorage.getItem(UNLOCKED_KEY) || 0);
  return !at || Date.now() - at > RELOCK_AFTER_MS;
}

/** Mientras la app está abierta, se renueva el tiempo de desbloqueo. */
export function keepUnlocked() {
  if (biometricEnabled() && !needsUnlock()) markUnlocked();
}
