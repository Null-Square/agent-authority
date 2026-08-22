import { hashObject } from './index.js';

const FORBIDDEN_SELECTOR_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function evidenceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireReceipt(receipt) {
  if (!receipt?.receipt_id) throw evidenceError('evidence_receipt_required', 'execution evidence requires a receipt');
  if (!receipt?.receipt_hash) throw evidenceError('evidence_receipt_hash_required', 'execution evidence requires a receipt hash');
  if (receipt.decision !== 'allow') {
    throw evidenceError('evidence_receipt_not_authorized', 'execution evidence can only be created for an ALLOW receipt');
  }
  return receipt;
}

function unsignedEvidence(evidence = {}) {
  const { evidence_hash: _evidenceHash, ...unsigned } = evidence;
  return unsigned;
}

/**
 * Bind the exact output returned by an authorized effect to its decision receipt.
 *
 * This is integrity evidence, not remote attestation. It prevents downstream code
 * from silently swapping the output object while still claiming the original
 * Agent Authority receipt as provenance.
 */
export function createExecutionEvidence({ receipt, output } = {}) {
  requireReceipt(receipt);
  const evidence = {
    version: '0.1',
    type: 'execution-output',
    receipt_id: receipt.receipt_id,
    receipt_hash: receipt.receipt_hash,
    mission_id: receipt.mission_id,
    task_lease_id: receipt.task_lease_id || null,
    service: receipt.service,
    action: receipt.action,
    request_hash: receipt.request_hash,
    output_hash: hashObject(output)
  };
  return { ...evidence, evidence_hash: hashObject(evidence) };
}

export function verifyExecutionEvidence({ receipt, output, evidence } = {}) {
  requireReceipt(receipt);
  if (!evidence || typeof evidence !== 'object') {
    throw evidenceError('execution_evidence_required', 'derived authority requires execution evidence');
  }
  if (evidence.type !== 'execution-output' || evidence.version !== '0.1') {
    throw evidenceError('execution_evidence_invalid', 'unsupported execution evidence format');
  }
  if (hashObject(unsignedEvidence(evidence)) !== evidence.evidence_hash) {
    throw evidenceError('execution_evidence_tampered', 'execution evidence hash does not match its contents');
  }
  if (evidence.receipt_id !== receipt.receipt_id || evidence.receipt_hash !== receipt.receipt_hash) {
    throw evidenceError('evidence_receipt_mismatch', 'execution evidence belongs to another receipt');
  }
  if (evidence.mission_id !== receipt.mission_id) {
    throw evidenceError('evidence_mission_mismatch', 'execution evidence belongs to another mission');
  }
  if ((evidence.task_lease_id || null) !== (receipt.task_lease_id || null)) {
    throw evidenceError('evidence_lease_mismatch', 'execution evidence belongs to another task lease');
  }
  if (evidence.service !== receipt.service || evidence.action !== receipt.action) {
    throw evidenceError('evidence_operation_mismatch', 'execution evidence operation does not match its receipt');
  }
  if (evidence.request_hash !== receipt.request_hash) {
    throw evidenceError('evidence_request_mismatch', 'execution evidence request does not match its receipt');
  }
  if (hashObject(output) !== evidence.output_hash) {
    throw evidenceError('evidence_output_mismatch', 'provider output no longer matches the authorized execution evidence');
  }
  return evidence;
}

export function resolveEvidenceSelector(output, selector) {
  if (typeof selector !== 'string' || selector.trim() === '') {
    throw evidenceError('selector_required', 'trusted extractor must provide a selector');
  }

  let normalized = selector.trim();
  if (normalized === 'output') return output;
  if (normalized.startsWith('output.')) normalized = normalized.slice('output.'.length);

  const segments = normalized.split('.');
  if (segments.length === 0 || segments.some((segment) => !segment || FORBIDDEN_SELECTOR_SEGMENTS.has(segment))) {
    throw evidenceError('selector_invalid', 'trusted extractor selector contains an invalid path segment');
  }

  let current = output;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      throw evidenceError('selector_unresolved', `trusted extractor selector ${selector} does not resolve against provider output`);
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      throw evidenceError('selector_unresolved', `trusted extractor selector ${selector} does not resolve against provider output`);
    }
    current = current[segment];
  }

  if (current === undefined) {
    throw evidenceError('selector_unresolved', `trusted extractor selector ${selector} resolved to undefined`);
  }
  return current;
}

/**
 * Execute the small trusted-adapter extraction contract.
 *
 * Extractors choose which already-normalized output field is authority-relevant;
 * they do not supply the value. TaskLease resolves the selector itself so the
 * caller cannot substitute a different value while keeping the same evidence.
 */
export function runAuthorityExtractor({ extractor, receipt, output } = {}) {
  if (typeof extractor !== 'function') {
    throw evidenceError('trusted_extractor_required', 'deriveFromEvidence requires a trusted adapter extractor');
  }

  const descriptor = extractor({ receipt, output: structuredClone(output) });
  if (!descriptor || typeof descriptor !== 'object') {
    throw evidenceError('trusted_extractor_invalid', 'trusted adapter extractor must return a descriptor');
  }
  if (typeof descriptor.extractor_id !== 'string' || descriptor.extractor_id.trim() === '') {
    throw evidenceError('trusted_extractor_id_required', 'trusted adapter extractor must provide extractor_id');
  }
  if (typeof descriptor.selector !== 'string' || descriptor.selector.trim() === '') {
    throw evidenceError('selector_required', 'trusted adapter extractor must provide selector');
  }

  return {
    extractor_id: descriptor.extractor_id.trim(),
    selector: descriptor.selector.trim()
  };
}
