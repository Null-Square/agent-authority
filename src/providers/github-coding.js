function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function safeBranch(value, name = 'branch') {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) {
    throw providerError('trusted_extractor_output_invalid', `${name} must be a non-empty Git branch name`);
  }
  const segments = value.split('/');
  const invalidCharacter = [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 32 || code === 127 || '~^:?*[\\'.includes(char);
  });
  if (
    value === '@' ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.startsWith('.') ||
    value.endsWith('.') ||
    value.includes('//') ||
    value.includes('..') ||
    value.includes('@{') ||
    invalidCharacter ||
    segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.endsWith('.lock'))
  ) {
    throw providerError('trusted_extractor_output_invalid', `${name} is not a safe Git branch name`);
  }
  return value;
}

function safePath(value, name = 'path') {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('/') || value.endsWith('/') || value.includes('\\')) {
    throw providerError('trusted_extractor_output_invalid', `${name} must be a relative repository path`);
  }
  const segments = value.split('/');
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    [...value].some((char) => {
      const code = char.charCodeAt(0);
      return code === 0 || code === 127;
    })
  ) {
    throw providerError('trusted_extractor_output_invalid', `${name} contains an unsafe path segment`);
  }
  return value;
}

function gitSha(value, name = 'sha') {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) {
    throw providerError('trusted_extractor_output_invalid', `${name} must be a 40-character Git SHA`);
  }
  return value.toLowerCase();
}

/**
 * Establish downstream task authority for the exact branch GitHub confirms was
 * created by an already-authorized git.ref.create operation.
 */
export function githubGitRefCreateBranchAuthorityExtractor({ receipt, output } = {}) {
  if (receipt?.service !== 'github' || receipt?.action !== 'git.ref.create') {
    throw providerError(
      'trusted_extractor_operation_mismatch',
      'GitHub created-branch extractor only accepts github:git.ref.create receipts'
    );
  }
  if (output?.provider !== 'github') {
    throw providerError('trusted_extractor_output_invalid', 'normalized GitHub ref output is required');
  }
  const branch = safeBranch(output.branch, 'normalized GitHub branch');
  if (output.ref !== `refs/heads/${branch}`) {
    throw providerError('trusted_extractor_output_invalid', 'normalized GitHub ref does not match its branch');
  }
  gitSha(output.sha, 'normalized GitHub ref sha');
  return {
    extractor_id: 'github.git.ref.create.branch.v1',
    selector: 'output.branch'
  };
}

/**
 * Establish downstream task authority for the exact repository path GitHub
 * reports as changed by an already-authorized repo.contents.write operation.
 */
export function githubContentsWritePathAuthorityExtractor({ receipt, output } = {}) {
  if (receipt?.service !== 'github' || receipt?.action !== 'repo.contents.write') {
    throw providerError(
      'trusted_extractor_operation_mismatch',
      'GitHub changed-path extractor only accepts github:repo.contents.write receipts'
    );
  }
  if (output?.provider !== 'github' || !output?.body?.content) {
    throw providerError('trusted_extractor_output_invalid', 'GitHub contents-write output is required');
  }
  safePath(output.body.content.path, 'GitHub changed path');
  return {
    extractor_id: 'github.repo.contents.write.path.v1',
    selector: 'output.body.content.path'
  };
}
