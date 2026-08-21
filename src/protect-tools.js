import { hashObject } from './index.js';
import { createTaskLeaseGuard } from './guard.js';

function authorityMappingError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertMapping(mapping, toolName = 'tool') {
  if (!mapping || typeof mapping !== 'object') throw new Error(`${toolName} authority mapping is required`);
  if (!mapping.service) throw new Error(`${toolName} mapping.service is required`);
  if (!mapping.action) throw new Error(`${toolName} mapping.action is required`);
  if (mapping.context !== undefined && typeof mapping.context !== 'function') {
    throw new Error(`${toolName} mapping.context must be a function`);
  }
  if (mapping.derive !== undefined && !Array.isArray(mapping.derive)) {
    throw new Error(`${toolName} mapping.derive must be an array`);
  }

  for (const [index, derivation] of (mapping.derive || []).entries()) {
    if (!derivation?.fact_id) throw new Error(`${toolName} mapping.derive[${index}].fact_id is required`);
    if (!Array.isArray(derivation?.from) || derivation.from.length === 0) {
      throw new Error(`${toolName} mapping.derive[${index}].from must contain at least one parent fact`);
    }
    if (typeof derivation?.selector !== 'string' || derivation.selector.trim() === '') {
      throw new Error(`${toolName} mapping.derive[${index}].selector is required`);
    }
    if (typeof derivation?.value !== 'function') {
      throw new Error(`${toolName} mapping.derive[${index}].value must be a function`);
    }
  }

  return mapping;
}

async function requestContext(mapping, input, executionOptions) {
  if (!mapping.context) return input && typeof input === 'object' ? input : {};
  const context = await mapping.context({ input, executionOptions });
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('authority context mapper must return an object');
  }
  return context;
}

function sameStringSet(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

function isSafeDerivationReplay(existing, derivation, value, receipt) {
  const provenance = existing?.provenance;
  if (!provenance || provenance.type !== 'derived') return false;
  if (hashObject(existing.value) !== hashObject(value)) return false;
  if (existing.kind !== (derivation.kind || 'opaque')) return false;
  if (!sameStringSet(provenance.from, derivation.from)) return false;
  if (provenance.selector !== derivation.selector.trim()) return false;
  if (provenance.source_service !== receipt.service) return false;
  if (provenance.source_action !== receipt.action) return false;
  if (provenance.task_lease_id !== receipt.task_lease_id) return false;
  return true;
}

async function applyDerivations({ lease, mapping, input, output, receipt, executionOptions }) {
  for (const derivation of mapping.derive || []) {
    const value = await derivation.value({ input, output, executionOptions });
    const existing = lease.fact(derivation.fact_id);

    // Agent loops commonly repeat safe reads. Re-deriving the exact same fact
    // from the same mapping is a no-op; a changed value or provenance is a hard
    // conflict so task authority cannot silently mutate underneath the agent.
    if (existing) {
      if (isSafeDerivationReplay(existing, derivation, value, receipt)) continue;
      throw authorityMappingError(
        'derived_fact_conflict',
        `derived authority fact ${derivation.fact_id} already exists with different value or provenance`
      );
    }

    lease.derive({
      fact_id: derivation.fact_id,
      kind: derivation.kind || 'opaque',
      value,
      from: derivation.from,
      receipt,
      selector: derivation.selector
    });
  }
}

/**
 * Protect one existing tool without changing its public shape.
 *
 * The returned object preserves the tool's schema/description/metadata and
 * replaces only execute(). The original execute callback cannot run unless the
 * Task Lease returns ALLOW for the mapped semantic action.
 *
 * Derived facts are intentionally explicit trusted-adapter mappings. The
 * selector is recorded as provenance, while the value() callback performs the
 * current trusted extraction from the provider/tool result.
 */
export function protectTool(tool, mappingInput, {
  lease,
  runtime,
  onDecision,
  onReceipt
} = {}) {
  if (!tool || typeof tool !== 'object') throw new Error('tool must be an object');
  if (typeof tool.execute !== 'function') throw new Error('tool.execute must be a function');
  if (!lease) throw new Error('Task Lease is required');
  if (!runtime) throw new Error('authority runtime is required');
  if (onReceipt !== undefined && typeof onReceipt !== 'function') throw new Error('onReceipt must be a function');

  const mapping = assertMapping(mappingInput);
  const guard = createTaskLeaseGuard({ lease, runtime, onDecision });
  const originalExecute = tool.execute;

  return {
    ...tool,
    async execute(input, executionOptions) {
      const context = await requestContext(mapping, input, executionOptions);
      const request = {
        service: mapping.service,
        action: mapping.action,
        context
      };

      const execution = await guard.run(request, () => originalExecute.call(tool, input, executionOptions));

      if (mapping.derive?.length) {
        await applyDerivations({
          lease,
          mapping,
          input,
          output: execution.output,
          receipt: execution.receipt,
          executionOptions
        });
      }

      if (onReceipt) await onReceipt(execution.receipt, { request, input, output: execution.output });
      return execution.output;
    }
  };
}

/**
 * Protect a dictionary of framework/tool objects.
 *
 * Default behavior is fail-closed at setup: every tool must have an authority
 * mapping. Set allowUnmapped=true only for tools that are intentionally outside
 * Agent Authority's enforcement boundary (for example pure local calculations).
 */
export function protectTools(tools, {
  lease,
  runtime,
  mappings = {},
  allowUnmapped = false,
  onDecision,
  onReceipt
} = {}) {
  if (!tools || typeof tools !== 'object' || Array.isArray(tools)) throw new Error('tools must be an object');

  const protectedTools = {};
  for (const [name, tool] of Object.entries(tools)) {
    const mapping = mappings[name];
    if (!mapping) {
      if (allowUnmapped) {
        protectedTools[name] = tool;
        continue;
      }
      throw new Error(`missing Agent Authority mapping for tool ${name}`);
    }

    protectedTools[name] = protectTool(tool, assertMapping(mapping, name), {
      lease,
      runtime,
      onDecision,
      onReceipt
    });
  }

  for (const name of Object.keys(mappings)) {
    if (!(name in tools)) throw new Error(`authority mapping references unknown tool ${name}`);
  }

  return protectedTools;
}
