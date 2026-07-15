// Copies data/*.json into public/data/ so the app can fetch them at runtime.
// Runs as predev/prebuild. Missing files are skipped (pipeline may not have run yet).
import { mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'data');
const dst = join(root, 'public', 'data');

mkdirSync(dst, { recursive: true });
if (!existsSync(src)) {
  console.warn('[sync-data] data/ missing — run `npm run pipeline` first');
  process.exit(0);
}
let n = 0;
for (const f of readdirSync(src)) {
  if (f.endsWith('.json')) {
    copyFileSync(join(src, f), join(dst, f));
    n++;
  }
}
console.log(`[sync-data] copied ${n} file(s) to public/data/`);
