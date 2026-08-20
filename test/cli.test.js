import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(home, ...args) {
  return spawnSync(process.execPath, ['src/cli.js', ...args, '--home', home], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, AGENT_AUTHORITY_HOME: home }
  });
}

test('CLI setup, doctor and status work on a clean home', () => {
  const home = mkdtempSync(join(tmpdir(), 'agent-authority-cli-'));

  const setup = run(home, 'setup', '--principal', 'user:cli-test');
  assert.equal(setup.status, 0, setup.stderr);
  assert.match(setup.stdout, /initialized/);

  const doctor = run(home, 'doctor');
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /encrypted-vault/);

  const status = run(home, 'status');
  assert.equal(status.status, 0, status.stderr);
  const parsed = JSON.parse(status.stdout);
  assert.equal(parsed.principal_id, 'user:cli-test');
  assert.deepEqual(parsed.connections, []);
});
