import { matchPattern } from './index.js';

function anyMatch(patterns = [], value) {
  return patterns.some((pattern) => matchPattern(pattern, value));
}

export function mcpToolAction(toolName) {
  if (!toolName) throw new Error('tool name is required');
  return `tool.${toolName}`;
}

export function contextFromToolArguments(toolName, args = {}) {
  const context = { tool_name: toolName };
  if (!args || typeof args !== 'object' || Array.isArray(args)) return context;

  for (const [key, value] of Object.entries(args)) {
    if (['string', 'number', 'boolean'].includes(typeof value)) context[key] = value;
  }
  return context;
}

export function toolPotentiallyVisible(mission, service, toolName) {
  const action = mcpToolAction(toolName);
  const resources = (mission?.resources || []).filter((resource) => matchPattern(resource.service, service));
  if (!resources.length) return false;
  if (resources.some((resource) => anyMatch(resource.deny || [], action))) return false;
  return resources.some((resource) => anyMatch(resource.allow || [], action));
}

export function isDeclaredReadOnlyTool(tool) {
  return tool?.annotations?.readOnlyHint === true;
}

function authorityMeta(evaluation = {}) {
  return {
    'io.nullsquare.agent-authority/decision': evaluation.result?.decision || 'deny',
    'io.nullsquare.agent-authority/code': evaluation.result?.code || null,
    'io.nullsquare.agent-authority/receipt_hash': evaluation.receipt?.receipt_hash || null,
    'io.nullsquare.agent-authority/task_lease_id': evaluation.receipt?.task_lease_id || null
  };
}

function deniedToolResult(result, extra = {}) {
  return {
    content: [{
      type: 'text',
      text: `Agent Authority blocked this tool call: ${result.reason || result.code || 'not authorized'}`
    }],
    isError: true,
    _meta: {
      'io.nullsquare.agent-authority/decision': result.decision || 'deny',
      'io.nullsquare.agent-authority/code': result.code || 'not_authorized',
      ...extra
    }
  };
}

/**
 * Small policy gateway for MCP tools.
 *
 * The upstream object only needs two methods:
 *   listTools(params?) -> { tools: [...] }
 *   callTool(params)   -> MCP CallToolResult
 *
 * The gateway accepts either a Mission or a Task Lease. When a Task Lease is
 * supplied, every MCP tool call is evaluated through that exact lease before
 * the upstream callback can run. This keeps transport changes from bypassing
 * task-level narrowing.
 *
 * The gateway still defaults to read-only enforcement. A tool is considered
 * read-only only when its MCP annotations explicitly set readOnlyHint=true.
 * Write support must be enabled deliberately; it is never inferred from names.
 */
export class MissionMcpGateway {
  constructor({
    mission,
    lease,
    runtime,
    upstream,
    service = 'mcp:upstream',
    readOnly = true,
    contextMapper = contextFromToolArguments
  } = {}) {
    if ((mission && lease) || (!mission && !lease)) {
      throw new Error('provide exactly one of mission or lease');
    }
    if (lease && (typeof lease.evaluate !== 'function' || !lease.mission)) {
      throw new Error('lease must provide mission and evaluate(runtime, request)');
    }
    if (!runtime || typeof runtime.evaluate !== 'function') throw new Error('authority runtime is required');
    if (!upstream || typeof upstream.listTools !== 'function' || typeof upstream.callTool !== 'function') {
      throw new Error('upstream MCP client must implement listTools() and callTool()');
    }
    this.mission = mission || lease.mission;
    this.lease = lease || null;
    this.runtime = runtime;
    this.upstream = upstream;
    this.service = service;
    this.readOnly = readOnly;
    this.contextMapper = contextMapper;
    this.tools = new Map();
  }

  evaluate(request) {
    return this.lease
      ? this.lease.evaluate(this.runtime, request)
      : this.runtime.evaluate(this.mission, request);
  }

  async refreshTools(params = undefined) {
    const listed = await this.upstream.listTools(params);
    for (const tool of listed.tools || []) this.tools.set(tool.name, tool);
    return listed;
  }

  async listTools(params = undefined) {
    const listed = await this.refreshTools(params);
    const tools = (listed.tools || []).filter((tool) => {
      if (!toolPotentiallyVisible(this.mission, this.service, tool.name)) return false;
      if (this.readOnly && !isDeclaredReadOnlyTool(tool)) return false;
      return true;
    });
    return { ...listed, tools };
  }

  async toolDefinition(toolName) {
    if (!this.tools.has(toolName)) await this.refreshTools();
    return this.tools.get(toolName) || null;
  }

  async callTool(params = {}) {
    const toolName = params.name;
    if (!toolName) return deniedToolResult({ decision: 'deny', code: 'invalid_request', reason: 'tool name is required' });

    const tool = await this.toolDefinition(toolName);
    if (!tool) return deniedToolResult({ decision: 'deny', code: 'tool_not_found', reason: `upstream tool ${toolName} was not found` });
    if (this.readOnly && !isDeclaredReadOnlyTool(tool)) {
      return deniedToolResult({
        decision: 'deny',
        code: 'mcp_write_disabled',
        reason: `${toolName} is not explicitly declared read-only by the upstream MCP server`
      });
    }

    const context = this.contextMapper(toolName, params.arguments || {});
    const request = {
      service: this.service,
      action: mcpToolAction(toolName),
      context
    };
    const evaluation = this.evaluate(request);
    if (evaluation.result.decision !== 'allow') {
      return deniedToolResult(evaluation.result, authorityMeta(evaluation));
    }

    const output = await this.upstream.callTool(params);
    return {
      ...output,
      _meta: {
        ...(output?._meta || {}),
        ...authorityMeta(evaluation)
      }
    };
  }
}
