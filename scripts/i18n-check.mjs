// SPEC-FE-01 D7: every message exists in every language, and no catalogue has keys English does not.
import { readFile, readdir } from 'node:fs/promises';

const LANGUAGES = ['en', 'hi', 'mr'];
const roots = ['packages/ui-kit/src/i18n', ...(await readdir('apps')).map((a) => `apps/${a}/src/i18n`)];
let problems = 0;
for (const dir of roots) {
  const catalogs = Object.fromEntries(await Promise.all(LANGUAGES.map(async (l) => [l, JSON.parse(await readFile(`${dir}/${l}.json`, 'utf8'))])));
  const english = new Set(Object.keys(catalogs.en));
  for (const language of LANGUAGES.slice(1)) {
    const keys = new Set(Object.keys(catalogs[language]));
    for (const key of english) if (!keys.has(key) || !String(catalogs[language][key]).trim()) { console.error(`${dir}/${language}.json: missing ${key}`); problems++; }
    for (const key of keys) if (!english.has(key)) { console.error(`${dir}/${language}.json: ${key} is not in en.json`); problems++; }
  }
  console.log(`${dir}: ${english.size} messages × ${LANGUAGES.length} languages`);
}
process.exit(problems > 0 ? 1 : 0);
