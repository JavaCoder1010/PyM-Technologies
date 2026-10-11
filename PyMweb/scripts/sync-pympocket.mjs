// Copia la app PymPocket (carpeta hermana ../PymPocket) a ./pympocket para
// publicarla junto con el sitio en /pympocket/.
// PymPocket se sigue desarrollando en su carpeta; correr esto antes de publicar:
//   npm run sync:pympocket
import { cpSync, existsSync, rmSync } from 'node:fs';
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
console.log(`PymPocket copiado en ${target}`);
