# 一线教师·场景化备课插件（teacher-scenario-plugin）

一个可安装到 OFdesk / DeepSeek Harness profile 的 **bundle**：输入一个知识点，产出「可交互讲解页 + 讲义 + 练习题」三件套。

- Host 侧：工具 `teacher_generate_lesson`
- Client 侧：输入区下方的「一键备课」条
- 零运行时依赖，产物落在会话工作目录，单文件离线可看

> 状态：0.1.2。安装（tarball 通道）、工具注册、端到端生成已验证；GitHub git 通道、GUI 入口渲染、讲解页视觉与交互仍待验证，详见「验证状态」。

## 功能

| 能力 | 说明 |
|---|---|
| 可交互讲解页 | 单文件 HTML：学习目标、概念、分步讲解、互动控件、常见误区、小结；无外部链接，断网可用 |
| 讲义 | Markdown，固定 5 章：学习目标 / 核心概念 / 例题精讲 / 常见错误 / 课后任务 |
| 练习题 | Markdown，1–20 题，每题含题干、参考答案、≥2 句解析；题量 ≥2 时保证 ≥2 种题型 |

参数：`topic`（必填）、`audience`、`difficulty`、`exerciseCount`、`withInteractive` / `withHandout` / `withExercises`。

## 安装

前置条件：

- OFdesk / DeepSeek Harness，运行时满足 `engines.dsh`（当前实测：DSH `0.2.1-rc.2`）；
- 宿主具备插件管理能力（Web 侧栏「插件」页，或创造模式的 `plugin_manager` 工具）；
- 宿主进程能找到 `pnpm`（插件管理器用它安装依赖）。

### 方式一：从 npm 安装（推荐，已验证）

`install_bundle` 的 `target` 指向精确版本：

```
teacher-scenario-plugin@0.1.2
```

优点：只依赖 npm registry，不依赖 GitHub 连通性；升级时改版本号重装即可。

### 方式二：从 Release 安装（离线备选，已验证）

1. 打开 [Releases](https://github.com/mmbxy/teacher-scenario-plugin/releases)，下载 `teacher-scenario-plugin-<version>.tgz`；
2. 在创造模式会话中让 agent 调用 `plugin_manager` 的 `install_bundle`，`target` 指向该文件的**绝对路径**；
3. 或使用 Web 侧栏「插件 → 添加插件」选择本地文件。

优点：安装过程不访问 GitHub，也不访问 registry，适合完全离线的环境。

### 方式三：从 GitHub 安装（需要稳定的 GitHub 连通性）

`install_bundle` 的 `target` 指向 tag 或 commit：

```
git+https://github.com/mmbxy/teacher-scenario-plugin#v0.1.2
```

> 请使用 tag 或 commit，不要用浮动分支。若报 `Connection was reset` 或 `timed out after 5000ms`，请改用方式一或二。

### 方式四：通过 Web 插件页

侧栏「插件 → 添加插件」可安装随附/本地/远程包；具体输入形式取决于宿主版本。

安装返回 `application: applied` 且无 `error` 才算成功；`restart-required` 表示需要重启宿主。装完用只读的 `cordis_inspect_query` 查 `Tool` 确认 `teacher_generate_lesson` 已注册。

## 使用

在对话里说：

> 用 teacher_generate_lesson 生成《函数求导》的讲解页、讲义和 6 道练习题。

产物在 `<会话工作目录>/teacher-artifacts/<lessonId>/`。也可以用输入区下方的「一键备课」条复制标准调用指令。

## 验证状态

| 项 | 状态 | 说明 |
|---|---|---|
| npm 安装 | ✅ 已验证 | profile 依赖为 `teacher-scenario-plugin: 0.1.2`，`install_bundle` 返回 `applied` |
| tarball 安装 | ✅ 已验证 | 安装返回 `applied`，版本 0.1.2 |
| 工具注册与端到端生成 | ✅ 已验证 | 3 件产物、6 题、讲义 5 章、无外链 |
| GitHub git 安装 | ⚠️ 未验证 | 本机网络对 github.com 不稳定；隔离环境 `pnpm add git+ssh` 成功 |
| GUI 入口渲染 | ⚠️ 未验证 | `client.js` 已随包安装，未在界面确认 |
| 讲解页视觉与交互 | ⚠️ 未验证 | 仅做了静态结构与脚本语法检查 |
| 干净环境（非 exFAT） | ⚠️ 未验证 | 本机 profile 位于 exFAT，需保留 hoisted 补丁 |

## 兼容性

| 宿主 / 环境 | 状态 |
|---|---|
| DSH `0.2.1-rc.2` ＋ OFdesk `6.0.0-alpha.1`（Web，Windows） | 已实测：安装、注册、生成 |
| 其他 DSH 版本 | 未验证；`engines.dsh` 会做基础拦截 |
| profile 位于 exFAT 卷 | 需要 hoisted 安装策略与本地 `@ofdesk/bundle` 覆盖；详见「本机排障」 |

## 已知限制

- 只有「函数求导」是手写示范内容；**其它知识点走通用备课骨架**，给出可执行的教学步骤（抄定义、列条件、写正反例、归纳判定），**不会自动生成学科内容**；
- 讲解页视觉与滑块交互未在浏览器验收；
- 「一键备课」条的 GUI 渲染尚未确认；
- 界面与产物目前为中文。

## 路线图

后续功能规划见 [ROADMAP.md](ROADMAP.md)：v0.2（面板/批量/导出/历史/专用模板）、v0.3（模型生成/教材对齐/组卷）、v0.4（课程包/课程建设材料）。

## 本机排障（仅 exFAT 卷需要，普通用户忽略）

若 profile 位于 exFAT 卷，pnpm 无法创建符号链接，需要：`nodeLinker: hoisted`、把 `@ofdesk/bundle` 覆盖为本地副本、用 tarball（而非目录）作为安装 target。否则会报 `ERR_PNPM_PACKAGE_MANAGER_SYMLINK_FAILED`。

## 常见问题

见 [FAQ.md](FAQ.md)：pnpm 缺失、连接重置、5 秒预检、版本不兼容、重启后不生效、产物位置、升级与卸载等。

## 开发

```
npm test        # 40 项单元测试
npm run check   # 发布质量门（清单 / patch / locale / 入口 / 渲染 / 确定性 / 文档链接）
npm run verify  # 两者一起跑
```

CI（GitHub Actions）在 Node 20 与 22 上执行同一套检查，并核对打包内容。

`tests/`、`scripts/`、`.github/` 为开发期资产，不随包发布（见 `files` 白名单）。

## 安全

插件在宿主进程内运行。当前版本不发起网络请求、不读取用户文件、不使用动态代码、不采集遥测；Client 侧只用剪贴板写入复制指令。详见 [SECURITY.md](SECURITY.md)。

## 许可证

[MIT](LICENSE)。图标与模板文案为原创；生成内容由使用者自行校对。

## 变更记录

见 [CHANGELOG.md](CHANGELOG.md)。
