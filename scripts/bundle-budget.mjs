// SPEC-FE-01 D9 / PRD §7: grower-web's initial JavaScript (entry script + modulepreloads) <= 170 KB gzip.
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const LIMIT = 170 * 1024;
const dist = 'apps/grower-web/dist';
const html = await readFile(`${dist}/index.html`, 'utf8');
const files = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let total = 0;
for (const file of new Set(files)) {
  const size = gzipSync(await readFile(`${dist}${file}`)).length;
  total += size;
  console.log(`${file}: ${(size / 1024).toFixed(1)} KB gzip`);
}
console.log(`grower-web initial JS: ${(total / 1024).toFixed(1)} KB gzip (budget ${LIMIT / 1024} KB)`);
process.exit(total <= LIMIT ? 0 : 1);
