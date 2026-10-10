# 参与 CG Claude

先阅读 [项目结构与扩展指南](docs/architecture.md)、[资料核对记录](docs/research.md) 和 [实际验证记录](docs/validation.md)。这些文档分别说明实现位置、规则依据和验证边界。

## 本地开发

```sh
npm ci
npm run dev
```

前端在 5173，浏览器本机服务默认在 4318。Electron 运行使用 `npm run desktop`；演示使用 `npm run demo` 或 `npm run desktop:demo`。运行修复或还原前使用隔离目录，避免把开发验证写到日常配置。

## 提交前

```sh
npm run check
npm run format:check
npm run build
```

按变更运行相关验证。配置事务需要成功、冲突和失败回退测试；读取规则需要未知值、不可读文件和脱敏边界测试；样式和文案优先验证真实页面及键盘操作。不要为简单样式写只复述实现的测试。

使用 Vue 3 Composition API 和带类型的接口。页面不直接读写配置，新增规则有稳定 ID 与来源，新增字段兼容旧记录。修复不执行 shell 展开、Hooks 或 apiKeyHelper。公网上的社区经验先与可信原文核对，再决定加入检测或保留人工复核。

## 描述变更

说明用户会看到什么变化、为什么需要、如何验证以及仍未覆盖的部分。引用实际检查结果，区分 CI 打包与真实桌面操作；Windows/Linux 尚未实机验证的行为不能写成已通过。提交中排除真实数据、截图里的本机标识、密钥、备份和快照。
