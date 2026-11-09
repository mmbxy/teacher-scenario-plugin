# 常见问题（FAQ）

## 安装

### Q：报 `'pnpm' 不是内部或外部命令` 怎么办？

宿主的插件管理器用 `pnpm` 安装依赖，但宿主进程的 PATH 里找不到它。

- 安装 pnpm（Node 自带的 npm 即可：`npm install -g pnpm`）；
- 建议装到**不随应用升级清理**的目录，并把该目录加入用户 PATH；
- 改完 PATH 通常要**重启一次应用**，宿主的子进程才会继承新路径。

### Q：可以从 npm 安装吗？

可以，这是推荐方式：`install_bundle` 的 `target` 填 `teacher-scenario-plugin@0.1.2`。它只依赖 npm registry，不需要访问 GitHub。

### Q：报 `already-installed` 怎么办？

profile 里已经有同版本（可能来自 tarball 或别的源）。若要换成另一个源，先 `remove_bundle`，再 `install_bundle`。

### Q：报 `ERR_PNPM_GIT_RESOLVE_FAILED` / `Connection was reset`？

这是本机到 `github.com:443` 的网络问题，不是插件或仓库的问题。

- 改用 **Release tarball** 安装（见下方「安装」章节的推荐方式）；
- 或在网络稳定的环境重试。

### Q：报 `dsh: connection to github.com timed out after 5000ms`？

宿主在真正安装前会做一次 5 秒的 GitHub 连通性预检（`githubConnectionTimeoutMs`）。网络慢时即使 git 本身能通，也会先失败在这一步。

- 改用 Release tarball；
- 或等网络恢复后重试。

### Q：报 `ERR_PNPM_PACKAGE_MANAGER_SYMLINK_FAILED`？

profile 所在磁盘不支持符号链接（例如 exFAT 移动硬盘）。pnpm 安装目录依赖时需要建链接。

- 把 profile 迁移到 NTFS 盘（根治）；
- 或改用 tarball 安装，并让 profile 使用 hoisted 安装策略（进阶，需改 profile 配置）。

### Q：报 `incompatible-version`？

宿主版本不满足插件的 `engines.dsh` 要求（当前要求 DSH `>=0.2.1-rc.2`）。

- 升级宿主；或使用与该宿主版本匹配的插件版本；
- 版本豁免（`compatibility.json`）属于宿主侧策略，普通用户不建议自行绕过。

### Q：返回 `restart-required` 是什么意思？

变更已写入配置，但需要重启宿主才会加载。

- 重启应用后再确认工具是否出现；
- 它**不代表安装失败**，也不代表已经生效。

### Q：装完在工具列表里找不到 `teacher_generate_lesson`？

- 看安装返回的 `application`：必须是 `applied`；
- 如果是 `restart-required`，先重启；
- 用 `cordis_inspect_query` 查 `Tool` 确认，而不是只看界面；
- 仍没有就卸载重装，并把安装返回的 `error.diagnostic` 留下来。

## 使用

### Q：产物在哪里？

会话工作目录下的 `teacher-artifacts/<lessonId>/`：

- `lesson.html`：单文件讲解页，断网可打开；
- `handout.md`：讲义；
- `exercises.md`：练习题。

### Q：为什么内容看起来像“教学脚手架”，不像真正的学科讲解？

当前版本对「函数求导」有手写示范内容；**其它知识点走通用备课骨架**（抄定义原句、列条件、写正反例、归纳判定）。它给出的是可执行的教学步骤，不是自动生成的学科知识。

要得到真正的学科讲解，需要接入宿主的文本生成能力（`deps.generateContent`），或为该知识点补专用模板。这属于后续版本。

### Q：可以生成英文内容吗？

界面与产物目前是中文；`audience` 参数只影响措辞深度，不切换语言。

### Q：能一次生成多个知识点吗？

一次调用一个 `topic`；批量请多次调用。

### Q：生成会不会联网？

不会。生成逻辑全部本地执行，不发起网络请求。

## 维护

### Q：怎么升级？

- tarball 安装：下载新版本 `.tgz`，用 `install_bundle` 覆盖安装；
- git 安装：把 `target` 换成新 tag 重装；
- 升级后重启宿主并重跑一次生成验证。

### Q：怎么卸载？

`plugin_manager` 的 `remove_bundle`，`target` 为包名 `teacher-scenario-plugin`；或 Web 侧栏「插件」页移除。已生成的 `teacher-artifacts/` 不会被删除。

### Q：插件能访问我的什么数据？

它在宿主进程内运行，理论上拥有与宿主相同的权限。当前版本：不联网、不读取用户文件、不使用动态代码、不采集遥测；Client 侧只写入剪贴板（复制调用指令）。详见 [SECURITY.md](SECURITY.md)。

### Q：视觉/交互效果有截图吗？

暂无。讲解页通过了静态结构与脚本语法检查，但**尚未在浏览器中做视觉与交互验收**；使用前建议自己打开 `lesson.html` 点一遍。
