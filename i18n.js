// ==========================================
// IDIOMA (ESPAÑOL / INGLÉS)
// ==========================================
// El español está escrito directamente en index.html. Los elementos traducibles
// llevan data-i18n="clave" (texto) y, para atributos, data-i18n-alt,
// data-i18n-placeholder, data-i18n-label (aria-label) o data-i18n-content.
// Al cargar se guarda el español original, así el cambio de idioma va y vuelve.
// Para traducir algo nuevo: marcarlo en el HTML y agregar la clave en EN.

const EN = {
    'meta.title': 'PyM Technologies - Automation and Systems',
    'meta.description': 'PyM Technologies - Automation solutions and intelligent systems',
    'lang.label': 'Language',
    'nav.menu': 'Open menu',
    'nav.services': 'Services',
    'nav.projects': 'Projects',
    'nav.about': 'About',
    'nav.contact': 'Contact',

    'hero.title': 'Automation and Intelligent Systems',
    'hero.text': 'We transform your business with cutting-edge technology',
    'hero.cta': 'Request a Demo',

    'services.title': 'Our Services',
    'services.industrial.title': 'Industrial Automation',
    'services.industrial.text': 'We optimize production processes with custom automation solutions.',
    'services.robotics.title': 'Robotic Systems',
    'services.robotics.text': 'We deploy collaborative robots to increase productivity and efficiency.',
    'services.cloud.title': 'Cloud Solutions',
    'services.cloud.text': 'We migrate and manage your systems on secure, scalable cloud platforms.',
    'services.data.title': 'Data Analytics',
    'services.data.text': 'We extract valuable insights from your data to support strategic decisions.',
    'services.security.title': 'Cybersecurity',
    'services.security.text': 'We protect your infrastructure with world-class security solutions.',
    'services.support.title': '24/7 Support',
    'services.support.text': 'A team of experts available to solve any technical issue.',

    'projects.title': 'Projects',
    'projects.subtitle': 'Products we design and build end to end.',
    'projects.tags': 'Technologies',
    'projects.demo': 'View demo',
    'tags.accessible': 'Accessible',

    'pympocket.tagline': 'Personal expense tracker',
    'pympocket.text': 'An app to log expenses in seconds and understand where your money goes, made for anyone and free of financial jargon. It handles pesos, dollars and euros with the official BCRA exchange rate.',
    'pympocket.f1': 'Log an expense in a few seconds',
    'pympocket.f2': 'Spending by category with monthly and yearly charts',
    'pympocket.f3': 'Multi-currency, with the official exchange rate updated automatically',
    'pympocket.f4': 'Budgets with alerts, recurring expenses and savings goals',
    'pympocket.f5': 'Installs on your phone and works offline',
    'pympocket.f6': 'Account synced across devices, with fingerprint or face sign-in',
    'pympocket.signup': 'Create account',
    'pympocket.note': 'The demo needs no account: it loads sample data only in your browser.',
    'pympocket.shotDesktop': 'PymPocket on desktop: monthly income and expenses chart and spending by category',
    'pympocket.shotPhone': 'PymPocket on a phone: monthly summary with expenses, income and balance',
    'pympocket.g1': 'Form to log an expense with amount, currency and category',
    'pympocket.g1Caption': 'Log it in seconds',
    'pympocket.g2': 'Monthly summary with balance and top categories',
    'pympocket.g2Caption': 'Monthly summary',
    'pympocket.g3': 'Donut chart of spending by category with percentages',
    'pympocket.g3Caption': 'Spending by category',

    'classshuffle.tagline': 'Classroom seating plans',
    'classshuffle.text': 'Seat a whole class in seconds. Teachers set their rules once and every shuffle follows them: randomized, never random.',
    'classshuffle.f1': 'Random arrangements that always follow the rules',
    'classshuffle.f2': 'Keep students apart or together, fixed or preferred seats, front or back',
    'classshuffle.f3': 'When rules contradict each other, it explains which ones and how to fix it',
    'classshuffle.f4': 'Drag-and-drop adjustments that never break a rule without warning',
    'classshuffle.f5': 'Editable classroom layout: rows, desks, aisles and seats',
    'classshuffle.f6': 'Print the seating chart and export it to CSV',
    'classshuffle.tag1': 'Constraint solver',
    'classshuffle.tag2': 'Automated tests',
    'classshuffle.tag3': 'No dependencies',
    'classshuffle.download': 'Download',
    'classshuffle.note': 'The demo opens a sample classroom with made-up students. Everything is saved only in your browser.',
    'classshuffle.shotDesktop': 'ClassShuffle on desktop: classroom floor plan with the students seated and the list of rules',
    'classshuffle.shotDetail': 'ClassShuffle warning: the move wasn’t made because two students who must sit apart would end up together',

    'about.title': 'About PyM Technologies',
    'about.p1': 'We are a company specialized in automation solutions and intelligent systems, with more than 15 years of experience in the technology sector.',
    'about.p2': 'Our team of engineers and specialists brings innovation to companies of every size, from small and medium businesses to large corporations.',
    'about.p3': 'We are committed to excellence, continuous innovation and the complete satisfaction of our clients.',

    'contact.title': 'Contact Us',
    'contact.subtitle': 'Ready to transform your business? Get in touch today.',
    'contact.name': 'Your name',
    'contact.email': 'Your email',
    'contact.message': 'Your message',
    'contact.send': 'Send Message',

    'footer.rights': '© 2024 PyM Technologies. All rights reserved.',
};

// Mensajes que solo existen en JavaScript (no están en el HTML).
const MESSAGES = {
    es: {
        'form.missing': 'Por favor, completa todos los campos.',
        'form.email': 'Por favor, ingresa un email válido.',
        'form.thanks': '¡Gracias, {name}! Tu mensaje ha sido recibido. Nos pondremos en contacto pronto.',
    },
    en: {
        'form.missing': 'Please fill in all the fields.',
        'form.email': 'Please enter a valid email address.',
        'form.thanks': 'Thank you, {name}! Your message has been received. We will be in touch soon.',
    },
};

const LANG_KEY = 'pym.lang';
const ATTRIBUTES = { alt: 'alt', placeholder: 'placeholder', label: 'aria-label', content: 'content' };
const spanish = new Map(); // elemento → { text, attrs } en español, guardado una sola vez
let currentLang = 'es';

function rememberSpanish() {
    document.querySelectorAll('[data-i18n], [data-i18n-alt], [data-i18n-placeholder], [data-i18n-label], [data-i18n-content]').forEach((el) => {
        const attrs = {};
        for (const [data, attr] of Object.entries(ATTRIBUTES)) {
            if (el.hasAttribute(`data-i18n-${data}`)) attrs[attr] = el.getAttribute(attr);
        }
        spanish.set(el, { text: el.hasAttribute('data-i18n') ? el.textContent : null, attrs });
    });
}

function setLanguage(lang) {
    currentLang = lang === 'en' ? 'en' : 'es';
    const english = currentLang === 'en';
    spanish.forEach((original, el) => {
        if (original.text !== null) el.textContent = english ? EN[el.dataset.i18n] ?? original.text : original.text;
        for (const [data, attr] of Object.entries(ATTRIBUTES)) {
            const key = el.getAttribute(`data-i18n-${data}`);
            if (key) el.setAttribute(attr, english ? EN[key] ?? original.attrs[attr] : original.attrs[attr]);
        }
    });
    document.documentElement.lang = currentLang;
    document.querySelectorAll('.lang-option').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.lang === currentLang));
    });
    try {
        localStorage.setItem(LANG_KEY, currentLang);
    } catch {}
}

/** Mensaje en el idioma actual, con {param} reemplazados. */
function translate(key, params = {}) {
    const text = MESSAGES[currentLang][key] ?? MESSAGES.es[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? '');
}

/** Idioma guardado; si no hay, el del navegador (español si es español, si no inglés). */
function initialLanguage() {
    try {
        const saved = localStorage.getItem(LANG_KEY);
        if (saved === 'es' || saved === 'en') return saved;
    } catch {}
    const browser = (navigator.languages?.[0] ?? navigator.language ?? 'es').toLowerCase();
    return browser.startsWith('es') ? 'es' : 'en';
}

rememberSpanish();
setLanguage(initialLanguage());
document.querySelectorAll('.lang-option').forEach((button) => {
    button.addEventListener('click', () => setLanguage(button.dataset.lang));
});
