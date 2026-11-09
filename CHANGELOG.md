# 变更记录

本项目遵循语义化版本：修复 → patch，行为变化 → minor，破坏性变更 → major。

## [未发布]

- 仓库与发布准备：包名从 `@local/teacher-scenario-plugin` 改为 `teacher-scenario-plugin`，移除 `private`，改用 MIT 许可证，补齐 `repository` / `homepage` / `bugs` 字段。
- 质量门重建：新增 `scripts/check.mjs`（16 项检查），替换与包结构失真的旧检查脚本；`npm run verify` 一次跑完测试与检查。
- 新增 GitHub Actions CI（Node 20/22：单测、质量门、打包内容核对）。
- 仓库地址已回填为 `github.com/mmbxy/teacher-scenario-plugin`。

## [0.1.2] - 2026-11-09

### 修复

- 通用备课骨架去掉自述式泛化句，定义改为「对象 / 条件 / 结论」三要素，习题小结与解析统一锚定知识点。
- 讲义去掉 `例 1：示例 1` 双重标签。
- 修正 `能否使用 矩阵的秩` 的多余空格。

## [0.1.1] - 2026-11-09

### 修复

- 题型标签不再出现双层括号（`几何应用题` / `物理应用题` / `变式计算题`）。
- 三个产物开关全部关闭时返回 `INVALID_INPUT`（`artifacts=none`），不再返回"成功 + 0 产物"。
- 通用模板重写为可执行的备课骨架（抄定义 → 列条件 → 正例 → 反例 → 判定流程）。

## [0.1.0] - 2026-11-09

### 新增

- Host 工具 `teacher_generate_lesson`：输入知识点，生成可交互讲解页（单文件 HTML）、讲义（Markdown）与基础练习题（Markdown）。
- Client 入口：输入区下方的「一键备课」条，可复制标准调用指令。
- 内置「函数求导」示范内容与通用教学骨架；7 个入参、6 类错误码、40 项单元测试。
