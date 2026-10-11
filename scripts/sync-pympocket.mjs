// Copia la app PymPocket (carpeta hermana ../PymPocket) a ./pympocket para
// publicarla junto con el sitio en /pympocket/ como DEMO del portafolio:
// siempre con datos de ejemplo, sin login ni conexión con cuentas.
// PymPocket se sigue desarrollando en su carpeta; correr esto antes de publicar:
//   npm run sync:pympocket
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(site, '..', 'PymPocket');
const target = join(site, 'pympocket');

// Lo que no forma parte de la app publicada.
const EXCLUDE = new Set(['.claude', '.git', 'node_modules', 'README.md', 'SUPABASE.md', 'supabase', '_headers']);
const excluded = (path) => EXCLUDE.has(basename(path)) || path.endsWith('.docx');

if (!existsSync(join(source, 'index.html'))) {
  console.error(`No se encontró PymPocket en ${source}`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true, filter: (path) => !excluded(path) });

// Configuración de la copia: solo demo y sin datos de conexión con Supabase.
const configPath = join(target, 'js', 'config.js');
const original = readFileSync(configPath, 'utf8');
const demoConfig = original
  .replace(/export const SUPABASE_URL = .*;/, "export const SUPABASE_URL = '';")
  .replace(/export const SUPABASE_ANON_KEY = .*;/, "export const SUPABASE_ANON_KEY = '';")
  .replace(/export const DEMO_ONLY = .*;/, 'export const DEMO_ONLY = true;');
const ready =
  /export const DEMO_ONLY = true;/.test(demoConfig) &&
  /export const SUPABASE_URL = '';/.test(demoConfig) &&
  /export const SUPABASE_ANON_KEY = '';/.test(demoConfig);
if (!ready) {
  console.error('No se pudo preparar js/config.js de la demo. Revisá que tenga SUPABASE_URL, SUPABASE_ANON_KEY y DEMO_ONLY.');
  process.exit(1);
}
writeFileSync(configPath, demoConfig);

console.log(`PymPocket (demo) copiado en ${target}`);
