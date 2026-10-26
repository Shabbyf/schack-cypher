// Bygger webbappen till www/: buntar JavaScript med esbuild och kopierar
// stilmall, Stockfish, data och pjäser. Körs lokalt och i GitHub Actions.
//   node tools/build.mjs [version]
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const version = process.argv[2] || process.env.APP_VERSION || 'dev';

let esbuild;
try { esbuild = await import('esbuild'); }
catch { esbuild = await import('/opt/npm-tools/node_modules/esbuild/lib/main.js'); }
esbuild = esbuild.default || esbuild;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = { bundle: true, minify: true, target: ['chrome80'], format: 'iife', legalComments: 'none', logLevel: 'warning', define: { __VERSION__: JSON.stringify(version) } };
await esbuild.build({ ...common, entryPoints: [join(root, 'src/js/main.js')], outfile: join(out, 'app.js') });
await esbuild.build({ ...common, entryPoints: [join(root, 'src/js/variant-worker.js')], outfile: join(out, 'variant-worker.js') });

const sub = (s) => s.replaceAll('__VERSION__', version);
writeFileSync(join(out, 'index.html'), sub(readFileSync(join(root, 'src/index.html'), 'utf8')));
writeFileSync(join(out, 'styles.css'), readFileSync(join(root, 'src/styles.css'), 'utf8'));
// Versionsnumret i update.js står som sträng; byt ut i den buntade filen.
writeFileSync(join(out, 'app.js'), sub(readFileSync(join(out, 'app.js'), 'utf8')));

cpSync(join(root, 'vendor/stockfish/stockfish.js'), join(out, 'stockfish.js'));
cpSync(join(root, 'vendor/stockfish/stockfish.wasm'), join(out, 'stockfish.wasm'));
cpSync(join(root, 'data'), join(out, 'data'), { recursive: true });
cpSync(join(root, 'assets/pieces'), join(out, 'pieces'), { recursive: true });
console.log('www/ byggd, version', version);
