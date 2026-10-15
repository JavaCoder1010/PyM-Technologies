// Instalar la app en el celular, sin tiendas.
// Android: descarga el APK publicado junto a la web (descargas/PymPocket.apk,
// se genera en ../pymPocket-android). iPhone: explica "Agregar a inicio" de
// Safari, la única forma de instalar sin el App Store. Computadora: ofrece la
// instalación del navegador si está disponible.
// Dentro de la app instalada no se muestra nada.
import { t, tRaw } from './i18n.js';
import { h } from './util.js';
import { DEMO_ONLY } from './config.js';
import { onClick, openDialog, toast } from './ui.js';

export const APK_URL = 'descargas/PymPocket.apk';
const DISMISS_KEY = 'pympocket.installDismissed';
const IN_APP_KEY = 'pympocket.inApp';

const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// La app de Android abre la web con un "referrer" propio; se recuerda para toda la sesión.
try {
  if (document.referrer.startsWith('android-app://')) sessionStorage.setItem(IN_APP_KEY, '1');
} catch {}

/** ¿Se está usando la app instalada (APK, ícono de inicio o app del navegador)? */
export function isInstalled() {
  try {
    if (sessionStorage.getItem(IN_APP_KEY)) return true;
  } catch {}
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

/** 'android', 'ios' u 'other' (computadora). */
export function platform() {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'other';
}

// Instalación del navegador en la computadora (Chrome/Edge), si la ofrece.
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
});

/** ¿Hay algo para ofrecer en este dispositivo? */
export function canOfferInstall() {
  if (DEMO_ONLY || isInstalled()) return false;
  return platform() !== 'other' || Boolean(deferredPrompt);
}

/** Botón para instalar (vacío si no corresponde). */
export function installButton({ className = 'btn btn-primary' } = {}) {
  if (!canOfferInstall()) return '';
  const p = platform();
  return `<button type="button" class="${className}" data-action="install-app">${icon(p === 'android' ? 'download' : 'plus')} ${h(t(`install.button.${p}`))}</button>`;
}

/** Tarjeta para Más. */
export function installCard() {
  if (!canOfferInstall()) return '';
  return `<section class="card card-accent" id="instalar" aria-labelledby="more-install">
    <h2 id="more-install">${h(t('install.title'))}</h2>
    <p>${h(t(`install.text.${platform()}`))}</p>
    ${installButton()}
  </section>`;
}

/** Aviso en Inicio, en el celular, hasta que el usuario lo cierre. */
export function installBanner() {
  if (platform() === 'other' || !canOfferInstall()) return '';
  try {
    if (localStorage.getItem(DISMISS_KEY)) return '';
  } catch {}
  return `<div class="banner" role="status">
    ${icon('download')}<p>${h(t('install.banner'))}</p>
    ${installButton({ className: 'btn btn-small btn-primary' })}
    <button type="button" class="btn-icon" data-action="dismiss-install" aria-label="${h(t('common.close'))}">${icon('close')}</button>
  </div>`;
}

const steps = (key) => `<ol class="install-steps">${tRaw(key).map((s) => `<li>${h(s)}</li>`).join('')}</ol>`;

function showSteps(p) {
  openDialog(`<div class="sheet sheet-small">
    <header class="sheet-header"><h2>${h(t(`install.stepsTitle.${p}`))}</h2>
      <button type="button" class="btn-icon" data-action="close-dialog" aria-label="${h(t('common.close'))}">${icon('close')}</button></header>
    ${steps(`install.steps.${p}`)}
    ${p === 'android' ? `<p class="muted small">${h(t('install.androidNote'))} <a class="link" href="${APK_URL}" download>${h(t('install.downloadAgain'))}</a></p>` : ''}
    <div class="sheet-actions"><button type="button" class="btn btn-primary btn-wide" data-action="close-dialog">${h(t('install.understood'))}</button></div>
  </div>`);
}

onClick({
  'install-app': async () => {
    const p = platform();
    if (p === 'android') {
      const a = Object.assign(document.createElement('a'), { href: APK_URL, download: 'PymPocket.apk' });
      document.body.append(a);
      a.click();
      a.remove();
      return showSteps('android');
    }
    if (p === 'ios') return showSteps('ios');
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') toast(t('install.installed'), { tone: 'success' });
  },
  'dismiss-install': (el) => {
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {}
    el.closest('.banner')?.remove();
  },
});
