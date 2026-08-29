import { AUTHORITY_SCHEMAS } from './authority-schemas.mjs';

export const clone = (value) => structuredClone(value);

export function valueKey(value) {
  if (value === undefined) return 'undefined';
  return JSON.stringify(value, Object.keys(value && typeof value === 'object' && !Array.isArray(value) ? value : {}).sort());
}

export function projectMutation(event) {
  if (event?.forceMutation && !AUTHORITY_SCHEMAS[event.action]) {
    return { action: event.action, fields: {} };
  }
  const schema = AUTHORITY_SCHEMAS[event?.action];
  if (!schema?.mutation) return null;
  const fields = {};
  for (const [field, spec] of Object.entries(schema.fields || {})) {
    const value = typeof spec.derive === 'function' ? spec.derive(event.args || {}) : event.args?.[field];
    if (value !== undefined) fields[field] = clone(value);
  }
  return { action: event.action, fields };
}
