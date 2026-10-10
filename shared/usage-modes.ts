/** Adding a service updates validation, preferences, the wizard and report labels together. */
export const usageModeIds = [
  'official',
  'custom',
  'bedrock',
  'vertex',
  'foundry',
  'anthropic-aws',
] as const
export type UsageMode = (typeof usageModeIds)[number]
const usageDetails = {
  official: {
    title: '官方默认 API',
    description: '使用 Claude 官方服务；可以在修改范围中主动选择清理旧 API 地址。',
  },
  custom: {
    title: '自定义 API / 网关',
    description: '保留 ANTHROPIC_BASE_URL 和已有认证配置。',
  },
  bedrock: {
    title: 'Amazon Bedrock',
    description: '保留 AWS、Bedrock 与认证配置。',
  },
  vertex: {
    title: 'Google Cloud / Vertex',
    description: '保留 Google Cloud、Vertex 与认证配置。',
  },
  foundry: {
    title: 'Microsoft Foundry',
    description: '保留 Azure 资源、Foundry 与认证配置。',
  },
  'anthropic-aws': {
    title: 'Claude Platform on AWS',
    description: '保留 Anthropic AWS 工作区与认证配置；与 Amazon Bedrock 分别核对。',
  },
} satisfies Record<UsageMode, { title: string; description: string }>
export const usageModeOptions = usageModeIds.map((value) => ({ value, ...usageDetails[value] }))
export function usageModeLabel(value: string): string {
  return usageModeOptions.find((option) => option.value === value)?.title ?? '未识别的服务方式'
}
