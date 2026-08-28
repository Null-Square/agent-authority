import { directTrace } from './automatic-contracts.mjs';
import { clone, projectMutation, valueKey } from './projection.mjs';
import {
  compileStrictAutomaticContract as compileBaseContract,
  evaluateStrictAutomaticContract as evaluateBaseContract
} from './strict-automatic-contracts.mjs';

function parseExtremum(prompt) {
  const text = String(prompt || '').toLowerCase();
  if (/\b(smallest|fewest|least|lowest|minimum|minimal)\b/.test(text)) return 'min';
  if (/\b(most|largest|highest|maximum|maximal)\b/.test(text)) return 'max';
  return null;
}

function scalarRecordPaths(value, prefix = [], out = []) {
  if (value === null || value === undefined) return out;
  if (Array.isArray(value)) return out;
  if (typeof value !== 'object') {
    if (prefix.length) out.push({ path: prefix, value });
    return out;
  }
  for (const [key, item] of Object.entries(value)) {
    if (item === null || item === undefined || Array.isArray(item)) continue;
    if (typeof item === 'object') scalarRecordPaths(item, [...prefix, key], out);
    else out.push({ path: [...prefix, key], value: item });
  }
  return out;
}

function pathKey(path) {
  return path.join('.');
}

export function valueAtPath(value, path) {
  let current = value;
  for (const segment of path || []) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
}

function aggregateRows(trace, targetIndex, sourceAction, extractorPath) {
  const counts = new Map();
  let sourceEvents = 0;
  let records = 0;
  for (let index = 0; index < targetIndex; index += 1) {
    const event = trace[index];
    if (event.action !== sourceAction || event.error) continue;
    const result = event.result;
    if (!Array.isArray(result)) continue;
    const extracted = [];
    for (const record of result) {
      const value = valueAtPath(record, extractorPath);
      if (value === undefined || value === null || (typeof value !== 'string' && typeof value !== 'number')) continue;
      extracted.push(value);
    }
    if (!extracted.length) continue;
    sourceEvents += 1;
    records += extracted.length;
    for (const value of extracted) {
      const key = valueKey(value);
      const row = counts.get(key) || { value: clone(value), count: 0 };
      row.count += 1;
      counts.set(key, row);
    }
  }
  return { sourceEvents, records, rows: [...counts.values()] };
}

export function aggregateFrequencyWinner(trace, targetIndex, witness) {
  const { sourceEvents, records, rows } = aggregateRows(
    trace,
    targetIndex,
    witness.sourceAction,
    witness.extractorPath
  );
  if (sourceEvents < Number(witness.minSourceEvents || 2) || rows.length < 2) {
    return { winner: null, sourceEvents, records, rows, reason: 'insufficient_aggregate_evidence' };
  }
  const direction = witness.direction || 'max';
  const best = direction === 'min'
    ? Math.min(...rows.map((row) => row.count))
    : Math.max(...rows.map((row) => row.count));
  const winners = rows.filter((row) => row.count === best);
  return {
    winner: winners.length === 1 ? clone(winners[0].value) : null,
    sourceEvents,
    records,
    rows,
    reason: winners.length === 1 ? null : 'aggregate_tie'
  };
}

function aggregateCandidates(trace, targetIndex, targetValue, prompt) {
  const direction = parseExtremum(prompt);
  if (!direction || (typeof targetValue !== 'string' && typeof targetValue !== 'number')) return [];

  const byAction = new Map();
  for (let index = 0; index < targetIndex; index += 1) {
    const event = trace[index];
    if (event.error || !Array.isArray(event.result) || !event.result.some((item) => item && typeof item === 'object' && !Array.isArray(item))) continue;
    const rows = byAction.get(event.action) || [];
    rows.push({ index, result: event.result });
    byAction.set(event.action, rows);
  }

  const candidates = [];
  for (const [sourceAction, events] of byAction) {
    if (events.length < 2) continue;
    const paths = new Map();
    for (const event of events) {
      for (const record of event.result) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
        for (const item of scalarRecordPaths(record)) paths.set(pathKey(item.path), item.path);
      }
    }
    for (const extractorPath of paths.values()) {
      const witness = {
        kind: 'aggregate-frequency',
        direction,
        sourceAction,
        extractorPath: clone(extractorPath),
        minSourceEvents: 2
      };
      const aggregate = aggregateFrequencyWinner(trace, targetIndex, witness);
      if (aggregate.winner === null || valueKey(aggregate.winner) !== valueKey(targetValue)) continue;
      const targetRow = aggregate.rows.find((row) => valueKey(row.value) === valueKey(targetValue));
      candidates.push({
        witness,
        support: targetRow?.count || 0,
        sourceEvents: aggregate.sourceEvents,
        records: aggregate.records
      });
    }
  }

  candidates.sort((a, b) =>
    b.sourceEvents - a.sourceEvents ||
    b.support - a.support ||
    b.records - a.records ||
    pathKey(a.witness.extractorPath).localeCompare(pathKey(b.witness.extractorPath))
  );
  return candidates;
}

function actionOccurrenceAt(trace, targetIndex, action) {
  let occurrence = 0;
  for (let index = 0; index <= targetIndex; index += 1) {
    const projected = projectMutation(trace[index]);
    if (projected?.action === action) occurrence += 1;
  }
  return occurrence;
}

export function compileStrictAutomaticContract(source) {
  const contract = compileBaseContract(source);
  const trace = directTrace(source);
  const constraints = [];
  const seen = new Set();

  for (const binding of contract.metadata.bindings || []) {
    const candidates = aggregateCandidates(trace, binding.targetIndex, binding.value, source.prompt);
    const candidate = candidates[0];
    if (!candidate) continue;
    const occurrence = actionOccurrenceAt(trace, binding.targetIndex, binding.action);
    const key = `${binding.action}\0${binding.field}\0${occurrence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    constraints.push({
      action: binding.action,
      field: binding.field,
      actionOccurrence: occurrence,
      match: `selector-${candidate.witness.direction}-aggregate-frequency`,
      witness: candidate.witness,
      referenceValue: clone(binding.value),
      referenceTargetIndex: binding.targetIndex
    });
  }

  contract.aggregateConstraints = constraints;
  contract.metadata.aggregateBindings = constraints.map((item) => clone(item));
  return contract;
}

export function evaluateAggregateConstraints(contract, trace) {
  const constraints = contract.aggregateConstraints || [];
  if (!constraints.length) return { allowed: true, reasons: [] };
  const occurrences = new Map();

  for (let index = 0; index < trace.length; index += 1) {
    const projected = projectMutation(trace[index]);
    if (!projected) continue;
    const occurrence = (occurrences.get(projected.action) || 0) + 1;
    occurrences.set(projected.action, occurrence);

    for (const constraint of constraints) {
      if (constraint.action !== projected.action || Number(constraint.actionOccurrence) !== occurrence) continue;
      const target = projected.fields[constraint.field];
      if (target === undefined) {
        return { allowed: false, reasons: [{ index, code: 'aggregate_target_missing', action: projected.action, field: constraint.field }] };
      }
      const aggregate = aggregateFrequencyWinner(trace, index, constraint.witness);
      if (aggregate.winner === null || valueKey(aggregate.winner) !== valueKey(target)) {
        return {
          allowed: false,
          reasons: [{
            index,
            code: 'aggregate_selection_witness_mismatch',
            action: projected.action,
            field: constraint.field,
            expected: aggregate.winner,
            actual: clone(target),
            detail: aggregate.reason
          }]
        };
      }
    }
  }
  return { allowed: true, reasons: [] };
}

export function evaluateStrictAutomaticContract(contract, trace) {
  const base = evaluateBaseContract(contract, trace);
  if (!base.allowed) return base;
  return evaluateAggregateConstraints(contract, trace);
}
