// Datos de ejemplo para el modo demo (el link ?demo=1 del portafolio).
// La demo usa una base aparte (pympocket-demo), sin cuenta ni sincronización,
// y se borra entera al salir de la demo.
import { state, saveMany, setSetting } from './store.js';
import { addMonths, currentMonth, daysInMonth, todayISO } from './format.js';
import { round2 } from './util.js';
import { t, tRaw } from './i18n.js';

export const isDemo = () => Boolean(state.settings.demo);

/** Generador pseudoaleatorio con semilla: los datos de ejemplo salen siempre iguales. */
function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export async function loadDemo() {
  const rand = seeded();
  const between = (min, max) => round2(min + rand() * (max - min));
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const cat = Object.fromEntries(state.categories.filter((c) => c.builtin).map((c) => [c.key, c.id]));
  const today = todayISO();
  const movements = [];
  // Descripciones de ejemplo en el idioma de la app.
  const s = (key) => t(`demo.samples.${key}`);
  const any = (key) => pick(tRaw(`demo.samples.${key}`));

  for (let back = 5; back >= 0; back--) {
    const key = addMonths(currentMonth(), -back);
    const lastDay = back === 0 ? Number(today.slice(8)) : daysInMonth(key);
    const growth = 1 + (5 - back) * 0.025; // los precios suben un poco cada mes
    const add = (day, key2, amount, description, extra = {}) => {
      if (day > lastDay) return;
      movements.push({
        type: 'expense',
        currency: 'ARS',
        paymentMethod: null,
        ...extra,
        amount: round2(amount),
        categoryId: cat[key2],
        date: `${key}-${String(day).padStart(2, '0')}`,
        description,
        demo: true,
      });
    };
    add(1, 'salary', 1650000 * growth, s('salary'), { type: 'income', paymentMethod: 'transfer' });
    if (back % 2 === 0) add(18, 'freelance', between(250, 450), s('webProject'), { type: 'income', currency: 'USD', paymentMethod: 'transfer' });
    add(2, 'rent', 480000 * growth, s('rent'), { paymentMethod: 'transfer' });
    add(4, 'building_fees', 95000 * growth, s('buildingFees'), { paymentMethod: 'transfer' });
    add(6, 'electricity', between(28000, 45000) * growth, s('electricity'), { paymentMethod: 'debit' });
    add(7, 'gas', between(15000, 32000) * growth, s('gas'), { paymentMethod: 'debit' });
    add(8, 'internet', 27000 * growth, s('internet'), { paymentMethod: 'debit' });
    add(9, 'phone', 18500 * growth, s('phone'), { paymentMethod: 'debit' });
    add(12, 'health_insurance', 120000 * growth, s('healthInsurance'), { paymentMethod: 'debit' });
    for (let d = 1; d <= 28; d += 3) add(d, 'supermarket', between(22000, 58000) * growth, any('supermarket'), { paymentMethod: pick(['debit', 'credit']) });
    for (let d = 2; d <= 28; d += 5) add(d, 'grocery', between(6000, 15000) * growth, any('grocery'), { paymentMethod: 'cash' });
    for (let d = 3; d <= 28; d += 7) add(d, 'restaurants', between(14000, 42000) * growth, any('restaurants'), { paymentMethod: 'credit' });
    for (let d = 5; d <= 28; d += 9) add(d, 'delivery', between(9000, 19000) * growth, any('delivery'), { paymentMethod: 'wallet' });
    for (let d = 1; d <= 28; d += 7) add(d, 'public_transport', 12000 * growth, s('publicTransport'), { paymentMethod: 'wallet' });
    add(14, 'fuel', between(45000, 65000) * growth, s('fuel'), { paymentMethod: 'credit' });
    add(20, 'taxi', between(8000, 16000), s('taxi'), { paymentMethod: 'wallet' });
    add(15, 'pharmacy', between(9000, 26000), s('pharmacy'), { paymentMethod: 'debit' });
    add(10, 'subscriptions', 12.99, s('streaming'), { currency: 'USD', paymentMethod: 'credit' });
    add(11, 'subscriptions', 10.99, s('music'), { currency: 'USD', paymentMethod: 'credit' });
    add(22, 'entertainment', between(12000, 25000), any('entertainment'), { paymentMethod: 'credit' });
    if (back % 3 === 1) add(16, 'clothing', between(60000, 120000), any('clothing'), { paymentMethod: 'credit' });
    if (back === 2) add(24, 'gifts', 60, s('gift'), { currency: 'EUR', paymentMethod: 'cash' });
    if (back === 4) add(19, 'education', 85000, s('course'), { paymentMethod: 'credit' });
  }

  const nextMonth = addMonths(currentMonth(), 1);
  const budgets = [
    { categoryId: null, currency: 'ARS', amount: 1900000, month: null, fromMonth: addMonths(currentMonth(), -5), demo: true },
    { categoryId: cat.food, currency: 'ARS', amount: 420000, month: null, fromMonth: addMonths(currentMonth(), -5), demo: true },
    { categoryId: cat.going_out, currency: 'ARS', amount: 150000, month: null, fromMonth: addMonths(currentMonth(), -5), demo: true },
  ];
  const recurring = [
    { type: 'expense', description: s('rent'), amount: 480000, currency: 'ARS', categoryId: cat.rent, frequency: 'monthly', nextDate: `${nextMonth}-02`, day: 2, mode: 'confirm', paymentMethod: 'transfer', active: true, demo: true },
    { type: 'expense', description: s('healthInsurance'), amount: 132000, currency: 'ARS', categoryId: cat.health_insurance, frequency: 'monthly', nextDate: `${nextMonth}-12`, day: 12, mode: 'auto', paymentMethod: 'debit', active: true, demo: true },
    { type: 'income', description: s('salary'), amount: 1800000, currency: 'ARS', categoryId: cat.salary, frequency: 'monthly', nextDate: `${nextMonth}-01`, day: 1, mode: 'confirm', paymentMethod: 'transfer', active: true, demo: true },
  ];
  const goals = [
    { name: s('vacation'), target: 2500, currency: 'USD', deadline: `${addMonths(currentMonth(), 8)}-28`, contributions: [{ date: today, amount: 900 }], demo: true },
    { name: s('emergencyFund'), target: 3000000, currency: 'ARS', deadline: `${addMonths(currentMonth(), 12)}-28`, contributions: [{ date: today, amount: 750000 }], demo: true },
  ];

  await saveMany('movements', movements);
  await saveMany('budgets', budgets);
  await saveMany('recurring', recurring);
  await saveMany('goals', goals);
  // En la demo se muestran también las funciones Pro.
  await setSetting('plan', 'pro');
  await setSetting('demo', true);
  return movements.length;
}
