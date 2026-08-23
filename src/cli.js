#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { stdin as input } from 'node:process';
import { assertMission, evaluateMissionPolicy } from './index.js';
import { createAgentToken, parseTtl } from './agent-auth.js';
import { createRuntimeEnvironment } from './runtime-env.js';
import { authorityHome, ensureAuthorityHome, loadConfig, saveConfig } from './storage.js';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

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
  console.log(`Agent Authority ${VERSION}

Usage:
  agent-authority setup [--principal user:id] [--home PATH]
  agent-authority status [--home PATH]
  agent-authority doctor [--home PATH]
  agent-authority config show [--home PATH]
  agent-authority serve [--host HOST] [--port PORT] [--home PATH]

MCP gateway (read-only first milestone):
  agent-authority mcp proxy --upstream URL --mission FILE [--service mcp:NAME] [--port 8790]

Connections:
  agent-authority connections [--home PATH]
  agent-authority connect github --token-stdin [--account ID] [--no-verify]
  agent-authority disconnect github [--account ID]

Agent instances:
  agent-authority agent token --agent AGENT_ID [--mission MISSION_ID] [--ttl 1h]
  agent-authority agent token --agent AGENT_ID --admin [--ttl 15m]

Human approvals:
  agent-authority approvals list [--status pending]
  agent-authority approvals approve APPROVAL_ID
  agent-authority approvals deny APPROVAL_ID

Missions:
  agent-authority mission validate FILE
  agent-authority mission evaluate FILE --service NAME --action NAME [--repository OWNER/REPO] [--context JSON]

Security:
  Provider credentials are never accepted as command-line values.
  Daemon /v1 APIs require short-lived signed agent-instance bearer tokens.
  Human approvals are one-time and bound to the exact mission + request.
  MCP proxy binds loopback only and exposes only tools explicitly declared read-only.

Environment:
  AGENT_AUTHORITY_HOME   Override ~/.agent-authority
  AGENT_AUTHORITY_HOST   Override serve host
  AGENT_AUTHORITY_PORT   Override serve port`);
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
  const env = createRuntimeEnvironment({ home });
  env.secrets.key();
  console.log(`✓ Agent Authority initialized at ${home}`);
  console.log(`Principal: ${principal}`);
  console.log('Next: agent-authority doctor');
  console.log('Then connect a provider and issue a short-lived token to an agent harness.');
}

function safeConnection(c) {
  const { credential_ref, ...safe } = c;
  return safe;
}

async function status(args) {
  const home = homeFrom(args);
  const env = createRuntimeEnvironment({ home });
  const connections = env.broker.listConnections(env.config.principal_id);
  const pendingApprovals = env.approvals.list({ principal_id: env.config.principal_id, status: 'pending' }).length;
  json({
    version: VERSION,
    home,
    principal_id: env.config.principal_id,
    server: env.config.server,
    connections,
    pending_approvals: pendingApprovals,
    api_authentication: 'agent-instance-bearer-token'
  });
}

async function doctor(args) {
  const home = homeFrom(args);
  const checks = [];
  try {
    const env = createRuntimeEnvironment({ home });
    checks.push({ check: 'config', ok: true, path: `${home}/config.json` });
    env.secrets.key();
    checks.push({ check: 'encrypted-vault', ok: true, path: env.config.paths.secrets });
    checks.push({ check: 'agent-signing-key', ok: env.agentAuthKey.length === 32, path: env.agentAuthKeyPath });
    checks.push({ check: 'connections-store', ok: true, count: env.broker.listConnections(env.config.principal_id).length });
    checks.push({ check: 'approval-store', ok: true, pending: env.approvals.list({ principal_id: env.config.principal_id, status: 'pending' }).length });
    checks.push({ check: 'loopback-default', ok: env.config.server.host === '127.0.0.1' || env.config.server.host === '::1', host: env.config.server.host });
  } catch (error) {
    checks.push({ check: 'runtime', ok: false, error: error.message });
  }
  for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.check}${c.error ? `: ${c.error}` : ''}`);
  if (checks.some((c) => !c.ok)) process.exitCode = 2;
}

async function configCommand(args) {
  const sub = args.shift();
  if (sub !== 'show') throw new Error('config command currently supports `show`');
  const home = homeFrom(args);
  json({ home, ...loadConfig({ home }) });
}

async function connectionsCommand(args) {
  const home = homeFrom(args);
  const env = createRuntimeEnvironment({ home });
  json({ connections: env.broker.listConnections(env.config.principal_id) });
}

async function connectGitHub(args) {
  if (!has(args, '--token-stdin')) throw new Error('GitHub local onboarding currently requires --token-stdin');
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
  console.log(`✓ GitHub ${result.account_id} disconnected and local credential removed`);
}

async function agentCommand(args) {
  const sub = args.shift();
  if (sub !== 'token') throw new Error('agent command currently supports `token`');
  const home = homeFrom(args);
  const env = createRuntimeEnvironment({ home });
  const agentId = flag(args, '--agent');
  if (!agentId) throw new Error('--agent AGENT_ID is required');
  const missionId = flag(args, '--mission', null);
  const ttl = parseTtl(flag(args, '--ttl', has(args, '--admin') ? '15m' : '1h'));
  const capabilities = has(args, '--admin')
    ? ['*']
    : (flag(args, '--capabilities')
      ? flag(args, '--capabilities').split(',').map((v) => v.trim()).filter(Boolean)
      : ['evaluate', 'prepare', 'execute', 'approval.read']);
  const token = createAgentToken({
    key: env.agentAuthKey,
    principal_id: env.config.principal_id,
    agent_id: agentId,
    mission_id: missionId,
    capabilities,
    ttl_seconds: ttl
  });
  if (has(args, '--json')) {
    json({ token, agent_id: agentId, mission_id: missionId, ttl_seconds: ttl, capabilities });
  } else {
    console.log(token);
  }
}

async function approvalsCommand(args) {
  const sub = args.shift();
  const home = homeFrom(args);
  const env = createRuntimeEnvironment({ home });
  if (sub === 'list') {
    const statusFilter = flag(args, '--status');
    return json({ approvals: env.approvals.list({ principal_id: env.config.principal_id, status: statusFilter }) });
  }
  const approvalId = args.shift();
  if (!approvalId) throw new Error('approval id is required');
  if (sub === 'approve') {
    const result = env.approvals.approve(approvalId, { principal_id: env.config.principal_id });
    console.log(`✓ approved ${approvalId}`);
    return json(result);
  }
  if (sub === 'deny') {
    const result = env.approvals.deny(approvalId, { principal_id: env.config.principal_id });
    console.log(`✓ denied ${approvalId}`);
    return json(result);
  }
  throw new Error('approvals command must be `list`, `approve`, or `deny`');
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

async function mcpCommand(args) {
  const sub = args.shift();
  if (sub !== 'proxy') throw new Error('mcp command currently supports `proxy`');
  const upstreamUrl = flag(args, '--upstream');
  const missionPath = flag(args, '--mission');
  if (!upstreamUrl) throw new Error('--upstream URL is required');
  if (!missionPath) throw new Error('--mission FILE is required');

  const home = homeFrom(args);
  const env = createRuntimeEnvironment({ home });
  const mission = assertMission(loadMission(missionPath));
  if (mission.principal.id !== env.config.principal_id) {
    throw new Error(`mission principal ${mission.principal.id} does not match local principal ${env.config.principal_id}`);
  }

  const host = flag(args, '--host', '127.0.0.1');
  const port = Number(flag(args, '--port', '8790'));
  const service = flag(args, '--service', 'mcp:upstream');
  const { startMcpProxyServer } = await import('./mcp-server.js');
  const instance = await startMcpProxyServer({
    mission,
    runtime: env.runtime,
    upstreamUrl,
    service,
    host,
    port
  });
  console.log(`✓ Agent Authority MCP gateway listening on http://${instance.host}:${instance.port}/mcp`);
  console.log(`Mission: ${mission.mission_id}`);
  console.log(`Service: ${service}`);
  console.log(`Upstream: ${upstreamUrl}`);
  console.log('Mode: read-only (write tools are not advertised or callable)');
  return instance;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (!command || command === 'help' || command === '--help' || command === '-h') return help();
  if (command === '--version' || command === 'version') return console.log(VERSION);
  if (command === 'setup' || command === 'init') return setup(args);
  if (command === 'status') return status(args);
  if (command === 'doctor') return doctor(args);
  if (command === 'config') return configCommand(args);
  if (command === 'connections') return connectionsCommand(args);
  if (command === 'agent') return agentCommand(args);
  if (command === 'approvals') return approvalsCommand(args);
  if (command === 'mission') return missionCommand(args);
  if (command === 'mcp') return mcpCommand(args);
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
