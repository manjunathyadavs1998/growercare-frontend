// SPEC-PLAT-03 R42: the sticky PR comment (the 80 % gate itself is vitest's coverage threshold).
import { readFile, writeFile } from 'node:fs/promises';

const total = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8')).total;
const pct = (k) => `${total[k].pct.toFixed(1)}%`;
const md = `<!-- coverage-gate -->\n### Coverage gate (Vitest, all apps and packages)\n\n**Line ${pct('lines')}** (threshold 80%) · Branch ${pct('branches')} · Functions ${pct('functions')}\n`;
await writeFile('coverage/summary.md', md);
console.log(md);
