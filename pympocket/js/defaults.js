// Categorías predefinidas. Los nombres se traducen con la clave `key`
// (ver categories.* en js/i18n/es.js); si el usuario las renombra, se usa `name`.

const EXPENSE = [
  ['food', '🛒', '#16a34a', ['supermarket', 'grocery']],
  ['transport', '🚌', '#2563eb', ['fuel', 'public_transport', 'taxi']],
  ['housing', '🏠', '#9333ea', ['rent', 'building_fees', 'maintenance']],
  ['health', '💊', '#dc2626', ['pharmacy', 'health_insurance']],
  ['entertainment', '🎬', '#db2777', []],
  ['services', '💡', '#ea580c', ['electricity', 'gas', 'water', 'internet', 'phone']],
  ['going_out', '🍽️', '#ca8a04', ['restaurants', 'delivery']],
  ['education', '📚', '#0891b2', []],
  ['clothing', '👕', '#4f46e5', []],
  ['subscriptions', '📺', '#0d9488', []],
  ['pets', '🐾', '#a16207', []],
  ['gifts', '🎁', '#e11d48', []],
  ['taxes', '🧾', '#475569', []],
  ['other', '📦', '#64748b', []],
];

const INCOME = [
  ['salary', '💼', '#16a34a', []],
  ['freelance', '💻', '#0891b2', []],
  ['other_income', '💰', '#64748b', []],
];

/**
 * Id fijo de una categoría predefinida. Al ser el mismo en todos los
 * dispositivos, sincronizar dos celulares no duplica las categorías.
 */
export const builtinId = (key) => `b-${key}`;

export function defaultCategories() {
  const list = [];
  const add = (kind) => ([key, icon, color, children], order) => {
    const id = builtinId(key);
    list.push({ id, key, icon, color, kind, parentId: null, builtin: true, order, archived: false });
    children.forEach((childKey, i) =>
      list.push({ id: builtinId(childKey), key: childKey, icon: null, color, kind, parentId: id, builtin: true, order: i, archived: false }),
    );
  };
  EXPENSE.forEach(add('expense'));
  INCOME.forEach(add('income'));
  return list;
}

/** Colores para categorías nuevas, distintos de los de las predefinidas. */
// Combina tonos y luminosidades que no tienen las predefinidas, para que se distingan en los gráficos.
export const PALETTE = ['#0ea5e9', '#c026d3', '#84cc16', '#facc15', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf', '#78716c', '#1e40af', '#991b1b', '#4d7c0f'];

const hslToHex = (hue, s, l) => {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/**
 * Primer color de la paleta que no esté en uso. Si se agotan, genera tonos
 * repartidos con el ángulo áureo para que sigan siendo distinguibles.
 */
export function nextColor(used) {
  const taken = new Set([...used].map((c) => String(c).toLowerCase()));
  const free = PALETTE.find((c) => !taken.has(c));
  if (free) return free;
  for (let i = taken.size; ; i++) {
    const color = hslToHex((i * 137.508) % 360, 0.62, 0.45);
    if (!taken.has(color)) return color;
  }
}

export const PAYMENT_METHODS = ['cash', 'debit', 'credit', 'transfer', 'wallet'];
