import fs from 'node:fs';
import { AdapterRegistry, AuthorityRuntime, descriptorAdapter } from '../src/index.js';

const mission = JSON.parse(fs.readFileSync(new URL('./mission.json', import.meta.url)));
const adapters = new AdapterRegistry()
  .register(descriptorAdapter('oauth', ['github', 'google']))
  .register(descriptorAdapter('api-key', ['cloudflare']));
const runtime = new AuthorityRuntime({ adapters });

for (const request of [
  { service: 'github', action: 'repo.write' },
  { service: 'github', action: 'repo.delete' },
  { service: 'google', action: 'gmail.send' },
  { service: 'cloudflare', action: 'workers.deploy' },
  { service: 'stripe', action: 'payment.create' }
]) {
  const output = await runtime.prepare(mission, request);
  console.log(`${request.service}:${request.action} -> ${output.result.decision}`);
}
