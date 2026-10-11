// Copia la app ClassShuffle (carpeta hermana ../PymClassShuffle) a ./classshuffle
// para publicarla junto con el sitio en /classshuffle/ como demo del portafolio.
// ClassShuffle no tiene cuentas ni servidor: todo queda en el navegador del
// visitante, así que se copia tal cual (sin tests ni archivos de desarrollo).
// ClassShuffle se sigue desarrollando en su carpeta; correr esto antes de publicar:
//   npm run sync:classshuffle
import { cpSync, existsSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(site, '..', 'PymClassShuffle');
const target = join(site, 'classshuffle');

// Lo que no forma parte de la app publicada.
const EXCLUDE = new Set(['.claude', '.git', '.gitignore', 'node_modules', 'tests', 'README.md', 'package.json', 'jsconfig.json']);
const excluded = (path) => EXCLUDE.has(basename(path)) || path.endsWith('.docx');

if (!existsSync(join(source, 'index.html'))) {
  console.error(`No se encontró ClassShuffle en ${source}`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true, filter: (path) => path === source || !excluded(path) });

console.log(`ClassShuffle copiado en ${target}`);
