/** Names only. Values stay in the backend and all credential evidence is masked. */
export const credentialKeys = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AWS_API_KEY',
  'ANTHROPIC_FOUNDRY_API_KEY',
  'ANTHROPIC_FOUNDRY_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_PROFILE',
] as const
export const cloudKeys = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_ANTHROPIC_AWS',
] as const
export const authenticationContextKeys = [
  'ANTHROPIC_FOUNDRY_RESOURCE',
  'ANTHROPIC_FOUNDRY_BASE_URL',
  'ANTHROPIC_AWS_WORKSPACE_ID',
  'ANTHROPIC_AWS_BASE_URL',
  'CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST',
] as const
export const authenticationEnvironmentKeys = [
  ...credentialKeys,
  ...cloudKeys,
  ...authenticationContextKeys,
  'ANTHROPIC_FEDERATION_RULE_ID',
  'ANTHROPIC_ORGANIZATION_ID',
  'CLAUDE_CODE_OAUTH_REFRESH_TOKEN',
  'CLAUDE_CODE_OAUTH_SCOPES',
] as const
