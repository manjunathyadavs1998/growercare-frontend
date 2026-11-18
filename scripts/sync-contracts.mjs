// SPEC-FE-01 D5: copy each service's committed OpenAPI contract from its repository's main branch into
// packages/api-client/contracts. Internal (/internal/**) and dev (/dev/**) operations are dropped: the gateway never
// routes them, so the apps must not be able to call them.
import { writeFile, mkdir } from 'node:fs/promises';

const OWNER = 'manjunathyadavs1998';
const SERVICES = {
  iam: ['growercare-identity-access-service', 'identity-access-service'],
  case: ['growercare-case-service', 'case-service'],
  grower: ['growercare-grower-service', 'grower-service'],
  catalog: ['growercare-catalog-registry-service', 'catalog-registry-service'],
};
const ref = process.env.CONTRACTS_REF ?? 'main';
const dir = new URL('../packages/api-client/contracts/', import.meta.url);
await mkdir(dir, { recursive: true });

for (const [name, [repo, file]] of Object.entries(SERVICES)) {
  const url = `https://raw.githubusercontent.com/${OWNER}/${repo}/${ref}/contracts/${file}.openapi.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const api = await response.json();
  // what is written must be an OpenAPI 3 document (the file feeds code generation; review its diff like code)
  if (typeof api?.openapi !== 'string' || !api.openapi.startsWith('3.') || typeof api.paths !== 'object' || api.paths === null) {
    throw new Error(`${url}: not an OpenAPI 3 document`);
  }
  for (const path of Object.keys(api.paths)) {
    if (path.startsWith('/internal/') || path.startsWith('/dev/')) delete api.paths[path];
  }
  await writeFile(new URL(`${name}.openapi.json`, dir), JSON.stringify(api, null, 2) + '\n');
  console.log(`${name}: ${Object.keys(api.paths).length} paths from ${repo}@${ref}`);
}
