#!/usr/bin/env node
/**
 * Agente local da Produtiva Gestão (Windows, macOS ou Linux).
 *
 * Fica no computador/servidor do escritório onde roda o Domínio ou o Alterdata.
 * A cada execução: busca na API as exportações de XML ainda não entregues, baixa o ZIP,
 * grava os XMLs na pasta de importação do sistema contábil e avisa a API que entregou.
 *
 *   node agente.mjs              → roda uma vez (ideal para o Agendador de Tarefas do Windows)
 *   node agente.mjs --loop 15    → fica rodando, verificando a cada 15 minutos
 *   node agente.mjs --teste      → só testa a conexão e a pasta, não baixa nada
 *
 * Configuração: agente.config.json ao lado deste arquivo (ver agente.config.exemplo.json).
 * Segurança: o token fica só neste computador; o caminho de cada XML é reconstruído aqui
 * (CNPJ só com dígitos + nome do arquivo), nunca confiando no caminho que vem dentro do ZIP.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const VERSION = '1.0.0';
const isExe = /agente(\.exe)?$/i.test(path.basename(process.execPath)) && !/node(\.exe)?$/i.test(path.basename(process.execPath));
const here = path.dirname(isExe ? process.execPath : fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argValue = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

// ---------------------------------------------------------------------------
// Configuração e log
// ---------------------------------------------------------------------------
function loadConfig() {
  const file = argValue('--config') ?? path.join(here, 'agente.config.json');
  if (!fs.existsSync(file)) throw new Error(`Arquivo de configuração não encontrado: ${file}. Copie agente.config.exemplo.json para agente.config.json e preencha.`);
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cfg = {
    apiUrl: String(process.env.PRODUTIVA_API_URL ?? c.apiUrl ?? '').replace(/\/$/, ''),
    token: String(process.env.PRODUTIVA_AGENT_TOKEN ?? c.token ?? ''),
    pasta: String(c.pasta ?? ''),
    layout: c.layout ?? 'por-cnpj', // por-cnpj | plana | completa
    sobrescrever: !!c.sobrescrever,
    logArquivo: c.logArquivo ?? path.join(here, 'agente.log'),
  };
  if (!/^https?:\/\//.test(cfg.apiUrl)) throw new Error('apiUrl inválida na configuração.');
  if (!cfg.token.startsWith('pga_')) throw new Error('token inválido: gere um em Configurações → Agente local, no painel.');
  if (!cfg.pasta) throw new Error('Informe "pasta": a pasta de importação de XML do Domínio/Alterdata.');
  if (!['por-cnpj', 'plana', 'completa'].includes(cfg.layout)) throw new Error('layout deve ser "por-cnpj", "plana" ou "completa".');
  return cfg;
}

let LOG_FILE = path.join(here, 'agente.log');
function log(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}`;
  (level === 'ERRO' ? console.error : console.log)(line);
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 5 * 1024 * 1024) fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    fs.appendFileSync(LOG_FILE, line + os.EOL);
  } catch { /* log em disco é melhor esforço */ }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function api(cfg, method, p, body) {
  const r = await fetch(`${cfg.apiUrl}${p}`, {
    method,
    headers: { Authorization: `Agent ${cfg.token}`, 'X-Agent-Version': VERSION, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message ?? text; } catch { /* texto puro */ }
    throw new Error(`${method} ${p} → ${r.status}: ${msg}`);
  }
  return text ? JSON.parse(text) : null;
}

async function download(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!r.ok) throw new Error(`Download falhou: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Gravação segura dos XMLs
// ---------------------------------------------------------------------------
const SAFE_NAME = /^[A-Za-z0-9._-]{1,120}\.xml$/;

/** Monta o destino SEM confiar no caminho do ZIP (proteção contra "zip slip"). */
export function destination(pasta, layout, entryPath) {
  const parts = entryPath.split(/[\\/]+/).filter(Boolean);
  const file = parts[parts.length - 1] ?? '';
  if (!SAFE_NAME.test(file)) return null;
  const cnpj = (parts[0] ?? '').replace(/\D/g, '');
  const safeSeg = (s) => String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30);
  if (layout === 'plana' || !cnpj) return path.join(pasta, file);
  if (layout === 'por-cnpj') return path.join(pasta, cnpj, file);
  return path.join(pasta, cnpj, ...parts.slice(1, -1).map(safeSeg).filter(Boolean), file); // completa: CNPJ/TIPO/direção
}

function writeAtomic(dest, data) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.parcial`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, dest); // o Domínio nunca vê arquivo pela metade
}

function checkFolder(pasta) {
  fs.mkdirSync(pasta, { recursive: true });
  const probe = path.join(pasta, `.produtiva-teste-${process.pid}`);
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
}

export function extract(zipBytes, cfg) {
  const entries = unzipSync(zipBytes);
  let files = 0, skipped = 0;
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    const dest = destination(cfg.pasta, cfg.layout, name);
    if (!dest) { skipped++; continue; }
    if (!cfg.sobrescrever && fs.existsSync(dest) && fs.statSync(dest).size === data.length) { skipped++; continue; }
    writeAtomic(dest, data);
    files++;
  }
  return { files, skipped };
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------
async function runOnce(cfg) {
  const hello = await api(cfg, 'GET', '/agent/hello');
  log('INFO', `Conectado: ${hello.escritorio} · agente "${hello.name}" · destino ${hello.target}`);
  checkFolder(cfg.pasta);
  if (has('--teste')) { log('INFO', `Pasta OK: ${cfg.pasta}. Teste concluído.`); return 0; }

  const pending = await api(cfg, 'GET', '/agent/exports/pending');
  if (!pending.length) { log('INFO', 'Nenhuma exportação pendente.'); return 0; }
  let failures = 0;
  for (const exp of pending) {
    try {
      log('INFO', `Baixando exportação de ${exp.runAt.slice(0, 10)} (${exp.docsCount} notas)…`);
      const { files, skipped } = extract(await download(exp.url), cfg);
      await api(cfg, 'POST', `/agent/exports/${exp.id}/delivered`, { folder: cfg.pasta, files, skipped });
      log('INFO', `Entregue: ${files} XML(s) gravado(s) em ${cfg.pasta}${skipped ? `, ${skipped} já existiam/ignorados` : ''}.`);
    } catch (e) {
      failures++;
      log('ERRO', `Exportação ${exp.id}: ${e.message}`);
      await api(cfg, 'POST', '/agent/error', { message: e.message, exportId: exp.id }).catch(() => undefined);
    }
  }
  return failures ? 1 : 0;
}

async function main() {
  let cfg;
  try {
    cfg = loadConfig();
    LOG_FILE = cfg.logArquivo;
  } catch (e) {
    log('ERRO', e.message);
    return 2;
  }
  const loop = Number(argValue('--loop') ?? 0);
  if (!loop) return runOnce(cfg).catch((e) => { log('ERRO', e.message); return 1; });
  log('INFO', `Modo contínuo: verificando a cada ${loop} minuto(s). Ctrl+C para sair.`);
  for (;;) {
    await runOnce(cfg).catch((e) => log('ERRO', e.message));
    await new Promise((r) => setTimeout(r, loop * 60_000));
  }
}

const isMain = isExe || (process.argv[1] && /agente\.(mjs|cjs)$/.test(process.argv[1]));
if (isMain) {
  main().then((code) => process.exit(code ?? 0));
}
