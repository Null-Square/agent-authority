#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { stdin as input } from 'node:process';
import { assertMission, evaluateMissionPolicy } from './index.js';
import { createRuntimeEnvironment } from './runtime-env.js';
import { authorityHome, ensureAuthorityHome, loadConfig, saveConfig } from './storage.js';

const VERSION = '0.2.0';

function fail(message, code = 1) {
  console.error(`error: ${message}`);
  process.exitCode = code;
}

function json(value) { console.log(JSON.stringify(value, null, 2)); }
function flag(args, name, fallback = undefined) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}
function has(args, name) { return args.includes(name); }
function homeFrom(args) { return flag(args, '--home', process.env.AGENT_AUTHORITY_HOME || authorityHome()); }

async function readStdinSecret() {
  if (process.stdin.isTTY) throw new Error('credential input must be piped on stdin; use `printf %s "$TOKEN" | agent-authority connect github --token-stdin`');
  let value = '';
  for await (const chunk of input) value += chunk;
  value = value.trim();
  if (!value) throw new Error('no credential received on stdin');
  return value;
}

function help() {
  console.log(`Agent Authority ${VERSION}\n\nUsage:\n  agent-authority setup [--principal user:id] [--home PATH]\n  agent-authority status [--home PATH]\n  agent-authority doctor [--home PATH]\n  agent-authority serve [--host HOST] [--port PORT] [--home PATH]\n  agent-authority connections [--home PATH]\n  agent-authority connect github --token-stdin [--account ID] [--no-verify]\n  agent-authority disconnect github [--account ID]\n  agent-authority mission validate FILE\n  agent-authority mission evaluate FILE --service NAME --action NAME [--repository OWNER/REPO] [--context JSON]\n\nSecurity:\n  Credentials are never accepted as command-line values. Use stdin or future browser OAuth flows.\n\nEnvironment:\n  AGENT_AUTHORITY_HOME   Override ~/.agent-authority\n  AGENT_AUTHORITY_HOST   Override serve host\n  AGENT_AUTHORITY_PORT   Override serve port`);
}

async function setup(args) {
  const home = homeFrom(args);
  const principal = flag(args, '--principal', 'user:local');
  ensureAuthorityHome({ home, principal_id: principal });
  const config = loadConfig({ home });
  if (config.principal_id !== principal) {
    config.principal_id = principal;
    saveConfig(config, { home });
  }
  console.log(`Agent Authority initialized at ${home}`);
  console.log(`Principal: ${principal}`);
  console.log('Next: agent-authority doctor');
  console.log('Then: connect a provider, e.g. GitHub.');
}

function safeConnection(c) {
  const { credential_ref, ...safe } = c;
  return safe;
}

async function status(args) {
  const home = homeFrom(args);
  const env = createRuntimeEnvironment({ home });
  const connections = env.broker.listConnections(env.config.principal_id);
  json({ version: VERSION, home, principal_id: env.config.principal_id, server: env.config.server, connections });
}

async function doctor(args) {
  const home = homeFrom(args);
  const checks = [];
  try {
    const env = createRuntimeEnvironment({ home });
    checks.push({ check: 'config', ok: true, path: `${home}/config.json` });
    env.secrets.key();
    checks.push({ check: 'encrypted-vault', ok: true, path: env.config.paths.secrets });
    checks.push({ check: 'connections-store', ok: true, count: env.broker.listConnections(env.config.principal_id).length });
    checks.push({ check: 'loopback-default', ok: env.config.server.host === '127.0.0.1' || env.config.server.host === '::1', host: env.config.server.host });
  } catch (error) {
    checks.push({ check: 'runtime', ok: false, error: error.message });
  }
  for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.check}${c.error ? `: ${c.error}` : ''}`);
  if (checks.some((c) => !c.ok)) process.exitCode = 2;
}

async function connectGitHub(args) {
  if (!has(args, '--token-stdin')) throw new Error('GitHub currently requires --token-stdin; browser OAuth is the next provider-onboarding milestone');
  const home = homeFrom(args);
  const env = createRuntimeEnvironment({ home });
  const token = await readStdinSecret();
  let accountId = flag(args, '--account');
  let metadata = {};
  let scopes = [];

  if (!has(args, '--no-verify')) {
    const response = await fetch('https://api.github.com/user', {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'agent-authority-cli' }
    });
    if (!response.ok) throw new Error(`GitHub credential verification failed (${response.status})`);
    const profile = await response.json();
    accountId ||= profile.login;
    metadata = { login: profile.login, id: profile.id, html_url: profile.html_url };
    const scopeHeader = response.headers.get('x-oauth-scopes');
    if (scopeHeader) scopes = scopeHeader.split(',').map((s) => s.trim()).filter(Boolean);
  }

  accountId ||= 'default';
  const connection = env.broker.connect({
    principal_id: env.config.principal_id,
    service: 'github',
    account_id: accountId,
    auth_kind: 'github-token',
    credential: { access_token: token },
    scopes,
    metadata
  });
  console.log(`✓ GitHub connected as ${metadata.login || accountId}`);
  json(safeConnection(connection));
}

async function disconnectGitHub(args) {
  const home = homeFrom(args);
  const env = createRuntimeEnvironment({ home });
  const accountId = flag(args, '--account', 'default');
  const result = env.broker.disconnect({ principal_id: env.config.principal_id, service: 'github', account_id: accountId });
  if (!result) throw new Error(`GitHub account ${accountId} is not connected`);
  console.log(`✓ GitHub ${accountId} disconnected and local credential removed`);
}

function loadMission(path) {
  if (!path) throw new Error('mission file is required');
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function missionCommand(args) {
  const sub = args[0];
  const file = args[1];
  if (sub === 'validate') {
    const mission = assertMission(loadMission(file));
    json({ ok: true, mission_id: mission.mission_id });
    return;
  }
  if (sub === 'evaluate') {
    const mission = loadMission(file);
    const service = flag(args, '--service');
    const action = flag(args, '--action');
    const repository = flag(args, '--repository');
    const rawContext = flag(args, '--context');
    const context = rawContext ? JSON.parse(rawContext) : {};
    if (repository) context.repository = repository;
    const result = evaluateMissionPolicy(mission, { service, action, context });
    json(result);
    if (result.decision === 'deny') process.exitCode = 3;
    return;
  }
  throw new Error('mission command must be `validate` or `evaluate`');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || command === 'help' || command === '--help' || command === '-h') return help();
  if (command === '--version' || command === 'version') return console.log(VERSION);
  if (command === 'setup' || command === 'init') return setup(args);
  if (command === 'status') return status(args);
  if (command === 'doctor') return doctor(args);
  if (command === 'connections') return status(args);
  if (command === 'mission') return missionCommand(args);
  if (command === 'connect') {
    if (args.shift() !== 'github') throw new Error('only the GitHub native connection is implemented today');
    return connectGitHub(args);
  }
  if (command === 'disconnect') {
    if (args.shift() !== 'github') throw new Error('only the GitHub native connection is implemented today');
    return disconnectGitHub(args);
  }
  if (command === 'serve' || command === 'start') {
    const { startServer } = await import('./server.js');
    return startServer({ home: homeFrom(args), host: flag(args, '--host'), port: flag(args, '--port') ? Number(flag(args, '--port')) : undefined });
  }
  throw new Error(`unknown command: ${command}`);
}

main().catch((error) => fail(error.message));
