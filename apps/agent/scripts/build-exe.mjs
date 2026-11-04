/**
 * Gera agente.exe (Windows) como Single Executable Application do Node — não precisa instalar Node no cliente.
 * Rodar NUM WINDOWS com Node 22: npm install && npm run build:exe
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { build } from 'esbuild';

await build({ entryPoints: ['agente.mjs'], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: 'dist/agente.cjs',
  define: { 'import.meta.url': 'require("url").pathToFileURL(__filename).href' } });
fs.writeFileSync('dist/sea-config.json', JSON.stringify({ main: 'dist/agente.cjs', output: 'dist/sea-prep.blob', disableExperimentalSEAWarning: true }));
execFileSync(process.execPath, ['--experimental-sea-config', 'dist/sea-config.json'], { stdio: 'inherit' });
fs.copyFileSync(process.execPath, 'dist/agente.exe');
execFileSync('npx', ['postject', 'dist/agente.exe', 'NODE_SEA_BLOB', 'dist/sea-prep.blob', '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], { stdio: 'inherit', shell: true });
console.log('Pronto: dist/agente.exe (copie junto com agente.config.json e instalar.ps1).');
