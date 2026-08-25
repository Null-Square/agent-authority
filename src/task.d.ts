export type AuthorityRelation = 'exact' | 'oneOf' | 'max';

export interface TaskPermissionPolicy {
  allow: string[];
  deny?: string[];
  constraints?: Record<string, unknown>;
}

export interface TaskBinding {
  service: string;
  action: string;
  field?: string;
  context_field?: string;
  authority?: string;
  fact_id?: string;
  relation?: AuthorityRelation;
}

export interface AuthorityDefinition<T = unknown> {
  value: T;
  kind?: string;
  source?: string;
}

export type TaskAuthority = Record<string, unknown | AuthorityDefinition>;

export interface SemanticRequest {
  service: string;
  action: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AuthorityFact<T = unknown> {
  fact_id: string;
  kind: string;
  value: T;
  provenance: Record<string, unknown>;
  created_at: string;
}

export interface AuthorityResult {
  decision: 'allow' | 'deny' | 'require_approval';
  code?: string | null;
  reason?: string;
  authority_delta?: {
    service?: string;
    action?: string;
    context_field?: string;
    relation?: AuthorityRelation;
    requested_value?: unknown;
    current_fact_id?: string;
  };
  [key: string]: unknown;
}

export interface TaskExecution<T = unknown> {
  output: T;
  receipt: Record<string, unknown> & { decision?: AuthorityResult['decision'] };
  evidence: Record<string, unknown>;
  result?: AuthorityResult;
  [key: string]: unknown;
}

export interface AuthorityExtractorResult {
  extractor_id: string;
  selector: string;
}

export type AuthorityExtractor<T = unknown> = (input: {
  receipt: TaskExecution<T>['receipt'];
  output: T;
}) => AuthorityExtractorResult;

export interface AuthorityFromOptions<T = unknown> {
  name?: string;
  fact_id?: string;
  kind?: string;
  from?: string | string[];
  extractor: AuthorityExtractor<T>;
}

export interface CreateTaskOptions {
  mission?: Record<string, unknown> | null;
  principal?: string | ({ id: string } & Record<string, unknown>) | null;
  agent?: string | ({ id: string } & Record<string, unknown>) | null;
  request: string;
  objective?: string | null;
  permissions?: Record<string, TaskPermissionPolicy> | null;
  constraints?: Record<string, unknown>;
  approvals?: unknown[];
  mission_id?: string | null;
  authority?: TaskAuthority;
  bindings?: TaskBinding[];
  expires_at?: string | null;
  runtime?: unknown;
  store?: unknown;
}

export interface AuthorityExplanation {
  decision: string;
  code: string | null;
  summary: string;
  service?: string;
  action?: string;
  field?: string;
  relation?: AuthorityRelation;
  established_authority?: AuthorityFact | null;
  requested_value?: unknown;
}

export class AgentTask {
  constructor(options?: { lease: unknown; runtime?: unknown });

  readonly id: string;
  readonly status: string;
  readonly mission: Record<string, unknown>;
  readonly runtime: unknown;
  readonly guard: unknown;

  run<T = unknown>(request: SemanticRequest, effect: () => T | Promise<T>): Promise<TaskExecution<T>>;
  execute<T = unknown>(request: SemanticRequest): Promise<TaskExecution<T>>;
  authorityFrom<T = unknown>(execution: TaskExecution<T>, options: AuthorityFromOptions<T>): AuthorityFact;
  bind(binding: TaskBinding): {
    service: string;
    action: string;
    context_field: string;
    fact_id: string;
    relation: AuthorityRelation;
  };
  authority<T = unknown>(name: string): AuthorityFact<T> | null;
  authorities(): AuthorityFact[];
  complete(reason?: string): Record<string, unknown>;
  explain(value: unknown): AuthorityExplanation;
}

export function createTask(options: CreateTaskOptions): AgentTask;
