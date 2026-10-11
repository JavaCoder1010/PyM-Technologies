// Plan gratuito vs. funciones de pago (sección 9 de los requisitos).
// La versión gratuita permite registrar, entender y exportar; Pro suma
// automatizar, proyectar y planificar. El cobro aún no está integrado:
// el plan se guarda como ajuste y puede activarse como demostración.
import { state } from './store.js';
import { addMonths, currentMonth, monthRange } from './format.js';

export const FREE_HISTORY_MONTHS = 3;

export const PRO_FEATURES = {
  budgets: 'budgets',
  recurring: 'recurring',
  goals: 'goals',
  longHistory: 'longHistory',
  comparisons: 'comparisons',
  annual: 'annual',
  insights: 'insights',
  pdf: 'pdf',
  csvImport: 'csvImport',
};

export const isPro = () => state.settings.plan === 'pro';
export const can = (feature) => isPro() || !(feature in PRO_FEATURES);

/** Mes más antiguo visible en reportes y búsquedas (null = sin límite). */
export const minMonth = () => (isPro() ? null : addMonths(currentMonth(), -(FREE_HISTORY_MONTHS - 1)));
export const minDate = () => (isPro() ? null : monthRange(minMonth())[0]);
