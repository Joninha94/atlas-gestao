import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { destination, extract } from '../agente.mjs';

const base = path.join(os.tmpdir(), 'agente-teste');

test('monta destino por CNPJ, plano e completo', () => {
  assert.equal(destination(base, 'por-cnpj', '12345678000199/NFE/entrada/3526.xml'), path.join(base, '12345678000199', '3526.xml'));
  assert.equal(destination(base, 'plana', '12345678000199/NFE/entrada/3526.xml'), path.join(base, '3526.xml'));
  assert.equal(destination(base, 'completa', '12345678000199/NFE/entrada/3526.xml'), path.join(base, '12345678000199', 'NFE', 'entrada', '3526.xml'));
});

test('bloqueia zip slip e arquivos que não são XML', () => {
  assert.equal(destination(base, 'completa', '../../Windows/evil.xml').startsWith(base), true);
  assert.equal(destination(base, 'por-cnpj', '123/../../x.exe'), null);
  assert.equal(destination(base, 'por-cnpj', '123/nome com espaço.xml'), null);
});

test('extrai, é idempotente e grava de forma atômica', () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'agente-'));
  const zip = zipSync({ '11222333000181/NFE/entrada/a.xml': strToU8('<a/>'), '11222333000181/NFSE/prestado/b.xml': strToU8('<b/>'), 'lixo.txt': strToU8('x') });
  const cfg = { pasta, layout: 'por-cnpj', sobrescrever: false };
  assert.deepEqual(extract(zip, cfg), { files: 2, skipped: 1 });
  assert.equal(fs.readFileSync(path.join(pasta, '11222333000181', 'a.xml'), 'utf8'), '<a/>');
  assert.deepEqual(extract(zip, cfg), { files: 0, skipped: 3 });
  assert.equal(fs.readdirSync(path.join(pasta, '11222333000181')).some((f) => f.endsWith('.parcial')), false);
});
