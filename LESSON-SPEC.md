# LessonSpec 契约（v1）

> 第 1 步交付物 D1.1。实现：`src/kit/`；基准样例：`tests/fixtures/function-derivative-60.spec.json`。
> 本文只描述结构；正文内容由第 2 步的模板 Provider 填充。

## 1. 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `schemaVersion` | number | 是 | 固定为 `1`；变更必须迁移 |
| `lessonId` | string | 是 | 知识点 slug + 时间戳 |
| `meta` | object | 是 | 见 1.1 |
| `objectives` | array | 是 | 3–5 条，每条含 `id/text/keywords` |
| `timeline` | array | 是 | 7 个环节，首尾相接，合计 = 时长 |
| `sections` | array | 是 | 与 timeline 一一对应；含 `timelineId/kind/title/keyPoints/content/wordCount` |
| `examples` | array | 是 | 45/60 分钟 ≥2，90 分钟 ≥3；含步骤与易错点 |
| `interactions` | array | 是 | 45/60/90 分钟分别 ≥3/3/5；含预设错误回答 |
| `exercises` | array | 是 | 45/60/90 分钟分别 ≥6/8/12；三层齐全 |
| `boardPlan` | object | 是 | 分区、关键句、擦除策略 |
| `deckPages` | number | 是 | 结构模式下可为 0；full 模式校验下限 |
| `quality` | object | 是 | `warnings/degraded/sources/checks` |

### 1.1 meta

| 字段 | 说明 |
|---|---|
| `topic` | 知识点，1–2000 字 |
| `durationMinutes` | 45 / 60 / 90，只接受整数 |
| `teachingMode` | 讲授 / 研讨 / 翻转 |
| `courseLevel` | 本科基础 / 专业核心 / 研究生 |
| `audience` | 教学对象 |
| `textbook` | 教材与章节，可为空 |
| `keyPoints` | 重点数组；命中环节权重 +20% |
| `generatedAt` | ISO 时间 |
| `contentSource` | template / model / skeleton |
| `locale` | 预留，默认 zh-CN |

## 2. 时间轴

| 环节 | 45 | 60 | 90 |
|---|---|---|---|
| 导入 intro | 5 | 5 | 8 |
| 概念 concept | 10 | 13 | 18 |
| 推导 derivation | 12 | 17 | 25 |
| 例题 example | 7 | 10 | 15 |
| 互动 interaction | 4 | 8 | 12 |
| 小结 summary | 4 | 4 | 6 |
| 作业 homework | 3 | 3 | 6 |
| **合计** | **45** | **60** | **90** |

不变量：

1. 合计精确等于 `durationMinutes`；
2. 每节 ≥3 分钟；
3. 首尾相接（`startMinute` 从 0 开始，下一节从上一节 `endMinute` 开始）；
4. 重点加权后总时长不变；无法满足时回退基准权重并写 warning；
5. 未匹配的 `keyPoints` 只产生 warning，不阻断。

## 3. 校验模式

| 模式 | 用途 | 检查 |
|---|---|---|
| `structure` | 第 1 步 / 模板填充前 | V1、V4–V9；字数、页数、覆盖不检查 |
| `full` | 第 2 步之后 | 全部 V1–V9，含字数、页数、目标覆盖 |

### V1–V9

| 编号 | 检查 | 失败码 |
|---|---|---|
| V1 | 时间轴合计、连续、每节 ≥3、kind 顺序 | `V1_TIMELINE_SUM` / `V1_TIMELINE_INVALID` |
| V2 | 讲稿字数 ≥ 时长 × 100 | `V2_WORD_COUNT_LOW` |
| V3 | 课件页数 ≥ 20/25/35 | `V3_DECK_PAGES_LOW` |
| V4 | 例题数量与结构 | `V4_EXAMPLES_INSUFFICIENT` / `V4_EXAMPLES_INVALID` |
| V5 | 互动数量与预设错误 | `V5_INTERACTIONS_INSUFFICIENT` / `V5_INTERACTIONS_INVALID` |
| V6 | 习题数量、三层、题型、答案 | `V6_EXERCISES_INSUFFICIENT` / `V6_EXERCISES_INVALID` |
| V7 | 目标覆盖（弱校验：关键词出现） | `V7_OBJECTIVES_INVALID` / `V7_COVERAGE_MISSING` |
| V8 | 引用完整性、id 唯一 | `V8_SECTION_*` / `V8_DUPLICATE_ID` |
| V9 | 降级必须带 warning | `V9_DEGRADED_WITHOUT_WARNING` |

> V7 是**弱校验**：只检查关键词在分节与习题文本中出现，不判断语义是否真覆盖。

## 4. 构建器错误码

| 码 | 触发 |
|---|---|
| `INVALID_TOPIC` | 空 / 超过 2000 字 |
| `INVALID_DURATION` | 非 45/60/90，或非数字 |
| `INVALID_TEACHING_MODE` | 非枚举值 |
| `INVALID_COURSE_LEVEL` | 非枚举值 |
| `INVALID_EXERCISE_COUNT` | 非 1–20 整数 |

## 5. 确定性

- 不依赖随机数；
- 同一输入 + 同一 `now()`（注入）→ 完全相同的 spec；
- `lessonId` 由 topic slug + `now` 生成，用于区分版本。

## 6. 扩展规则

1. 新增字段必须可选，或提升 `schemaVersion` 并提供迁移；
2. 新增环节会破坏“7 节”约束，需同时更新时间轴、校验与渲染；
3. 任何校验规则变更都要补正例/反例测试；
4. 渲染器只读 LessonSpec，不得反向写入。

## 7. 样例

`tests/fixtures/function-derivative-60.spec.json`：

- 60 分钟、7 节、重点为概念/例题；
- 2 道例题、3 个互动、8 道习题（基础 4 / 提高 3 / 拓展 1）；
- 结构模式校验通过；正文为占位，等待第 2 步填充。
