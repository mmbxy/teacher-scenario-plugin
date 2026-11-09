'use strict';

/**
 * Host 侧核心生成逻辑（纯 Node，不依赖宿主 API）。
 *
 * 工具契约：需求说明 3.3；生成规则：3.4；默认演示配置：3.6。
 *
 * 依赖注入约定（deps）：
 *   now(): number                 必填，毫秒时间戳；用于 lessonId / generatedAt / 超时判定
 *   writeFile(path, content)      必填，写入 UTF-8 文件（由宿主适配层创建父目录）
 *   outputDir: string             必填，宿主提供的可写根目录（C12）
 *   generateContent(options)      可选，宿主文本生成能力；缺省时使用内置确定性模板（D1）
 *   capabilities.write: boolean    可选，false 表示写入能力不可用
 *   capabilities.text: boolean     可选，false 表示文本生成能力不可用
 *   templates: {lesson, handout, exercises}  可选，覆盖内置模板字符串
 *   timeoutMs: number             可选，宿主调用时限；超出则返回 TIMEOUT
 *   timeZone: string              可选，默认 Asia/Shanghai
 *
 * 所有时间、随机性均从 deps 注入；本实现不使用随机数，因此同一输入与同一 deps
 * 的输出逐字节一致（可确定性重放）。
 *
 * TODO(待宿主确认 C11)：Web / Manim / 配图 / 文档能力的真实名称与参数未知，
 *                       适配层只能在阶段 4 的 V2/V3 之后接入。
 * TODO(待宿主确认 C12)：可写产物目录由宿主提供，禁止硬编码绝对路径。
 */

const fs = require('fs');
const path = require('path');

const { validateInput } = require('./validate');

const RETRYABLE = Object.freeze({
  INVALID_INPUT: false,
  CAPABILITY_UNAVAILABLE: true,
  GENERATION_FAILED: true,
  OUTPUT_WRITE_FAILED: true,
  TIMEOUT: true,
  HOST_ERROR: false
});

const FAILURE_MESSAGES = Object.freeze({
  INVALID_INPUT: '入参不合法，请按提示修改后重试。',
  CAPABILITY_UNAVAILABLE: '生成或写入能力不可用，请确认插件已启用后重试。',
  GENERATION_FAILED: '生成失败，请缩短输入或减少题量后重试。',
  OUTPUT_WRITE_FAILED: '产物写入失败，请检查输出目录权限后重试。',
  TIMEOUT: '生成超时，请重试或减少习题数量。',
  HOST_ERROR: '生成过程中出现未预期错误，请重试；若持续失败请联系插件维护者。'
});

const TEMPLATE_DIR = path.join(__dirname, 'templates');

function codedError(code, message, detail) {
  const error = new Error(message);
  error.code = code;
  error.detail = detail;
  return error;
}

function countChars(text) {
  return Array.from(String(text)).length;
}

function shortText(text, max) {
  const value = String(text);
  if (countChars(value) <= max) return value;
  return Array.from(value).slice(0, max - 1).join('') + '…';
}

function hashString(text) {
  let hash = 2166136261;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const TOPIC_SLUGS = Object.freeze({
  函数求导: 'function-derivative',
  导数: 'derivative',
  导数的几何意义: 'derivative-geometry'
});

function slugForTopic(topic) {
  if (TOPIC_SLUGS[topic]) return TOPIC_SLUGS[topic];
  const ascii = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return ascii || `topic-${hashString(topic)}`;
}

function formatParts(ms, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = {};
  for (const part of formatter.formatToParts(new Date(ms))) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return parts;
}

function formatOffset(ms, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset'
  });
  const part = formatter.formatToParts(new Date(ms)).find((item) => item.type === 'timeZoneName');
  return (part ? part.value : 'GMT+00:00').replace('GMT', '') || '+00:00';
}

function timestampInfo(ms, timeZone) {
  const parts = formatParts(ms, timeZone);
  const date = `${parts.year}${parts.month}${parts.day}`;
  const time = `${parts.hour}${parts.minute}${parts.second}`;
  return {
    lessonStamp: `${date}-${time}`,
    generatedAt: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${formatOffset(ms, timeZone)}`
  };
}

// ---------------------------------------------------------------- 内容构造

function derivativeContent(input) {
  const topic = input.topic;
  const definition =
    '导数刻画函数在某一点处的瞬时变化率。对函数 $f(x)$，在点 $x_0$ 处的导数定义为 ' +
    "$f'(x_0)=\\lim_{h\\to 0}\\frac{f(x_0+h)-f(x_0)}{h}$；" +
    '它既是平均变化率在 $h\\to 0$ 时的极限，也是曲线在该点切线的斜率。';

  const lesson = {
    title: topic,
    goal: '理解导数的定义，掌握幂函数与多项式的求导法则，并能用切线斜率解释导数的几何意义。',
    definition,
    steps: [
      {
        title: '从平均变化率出发',
        detail: '在 $x_0$ 附近取增量 $h$，差商 $\\frac{f(x_0+h)-f(x_0)}{h}$ 表示区间上的平均变化率。'
      },
      {
        title: '令增量趋于零',
        detail: '让 $h\\to 0$，若差商的极限存在，就把它定义为 $f\'(x_0)$，即该点的瞬时变化率。'
      },
      {
        title: '用求导法则计算',
        detail: '幂函数满足 $(x^n)\'=n x^{n-1}$；多项式可以逐项求导，再把各项结果相加。'
      },
      {
        title: '回到几何意义',
        detail: '导数 $f\'(x_0)$ 等于曲线 $y=f(x)$ 在点 $(x_0,f(x_0))$ 处切线的斜率；导数为 0 时切线水平。'
      }
    ],
    interactive: {
      kind: 'tangent',
      min: -2,
      max: 2,
      step: 0.1,
      initialX: 0,
      readout: '拖动滑块，观察切点位置、切线方向与斜率数值如何同步变化。'
    },
    misconceptions: [
      {
        wrong: '导数就是函数在某点的函数值。',
        right: '导数是函数值的变化率，不是函数值本身；函数值描述「在哪里」，导数描述「变化得多快」。'
      },
      {
        wrong: '导数为 0 的点一定是极值点。',
        right: '导数为 0 只是极值的必要条件；还要看导数在该点两侧是否变号，例如 $f(x)=x^3$ 在 $x=0$ 处导数为 0 但不是极值点。'
      }
    ],
    summary: [
      '导数 = 瞬时变化率 = 曲线在该点切线的斜率。',
      '幂函数求导用 $(x^n)\'=n x^{n-1}$，多项式逐项求导后相加。',
      '导数为 0 只是极值的必要条件，必须再判断两侧是否变号。'
    ]
  };

  const handout = {
    objectives: [
      '能写出导数定义式，并说明 $h\\to 0$ 的含义。',
      '能用幂函数法则与逐项求导计算多项式函数的导数。',
      '能求 $f(x)=x^3-3x$ 在指定点的切线方程。'
    ],
    coreConcept:
      '导数是平均变化率的极限，表示函数在一点附近的瞬时变化速度。' +
      '计算上，幂函数用 $(x^n)\'=n x^{n-1}$，多项式逐项求导；几何上，导数就是切线的斜率。',
    examples: [
      {
        question: '求 $f(x)=x^3-3x$ 的导数。',
        steps: [
          '逐项求导：$(x^3)\'=3x^2$，$(-3x)\'=-3$。',
          '把各项结果相加，得到 $f\'(x)=3x^2-3$。'
        ],
        answer: "$f'(x)=3x^2-3$"
      },
      {
        question: '求曲线 $f(x)=x^3-3x$ 在 $x=1$ 处的切线方程。',
        steps: [
          '先求切点纵坐标：$f(1)=1-3=-2$。',
          '再求切线斜率：$f\'(1)=3-3=0$。',
          '斜率为 0 说明切线水平，因此切线方程为 $y=-2$。'
        ],
        answer: '$y=-2$'
      }
    ],
    commonErrors: [
      '把 $(x^3)\'$ 写成 $3x$，正确结果是 $3x^2$：指数先降一次，再乘原指数。',
      '求切线方程时只算斜率、忘记先求切点纵坐标，导致直线位置错误。'
    ],
    homework: [
      '求 $f(x)=2x^3+5x-1$ 的导数，并写出每一步。',
      '求曲线 $f(x)=x^2$ 在 $x=2$ 处的切线方程。',
      '用自己的话解释「导数为什么等于切线斜率」，并举一个例子。'
    ]
  };

  const exercises = {
    items: [
      {
        type: '计算题',
        stem: '用导数定义求 $f(x)=x^2$ 的导数。',
        answer: "$f'(x)=2x$。",
        explanation:
          '先写出差商 $\\frac{(x+h)^2-x^2}{h}$，化简得到 $2x+h$。再令 $h\\to 0$，得到 $f\'(x)=2x$。'
      },
      {
        type: '计算题',
        stem: '求 $f(x)=x^3-3x$ 的导数。',
        answer: "$f'(x)=3x^2-3$。",
        explanation:
          '对 $x^3$ 用幂函数法则得到 $3x^2$，对 $-3x$ 求导得到 $-3$。把两项相加即可得到 $f\'(x)=3x^2-3$。'
      },
      {
        type: '计算题',
        stem: '求 $f(x)=2x^3+5x-1$ 的导数。',
        answer: "$f'(x)=6x^2+5$。",
        explanation:
          '逐项求导：$2x^3$ 的导数是 $6x^2$，$5x$ 的导数是 $5$。常数 $-1$ 的导数为 0，所以结果是 $6x^2+5$。'
      },
      {
        type: '几何应用题',
        stem: '求曲线 $f(x)=x^3-3x$ 在 $x=1$ 处的切线方程。',
        answer: '$y=-2$。',
        explanation:
          '先算切点纵坐标 $f(1)=1-3=-2$，再算斜率 $f\'(1)=3-3=0$。斜率为 0 说明切线水平，因此切线方程为 $y=-2$。'
      },
      {
        type: '判断题',
        stem: '判断：函数在某点导数为 0，该点就一定是极值点。',
        answer: '错误。',
        explanation:
          '导数为 0 只是极值的必要条件，不是充分条件。例如 $f(x)=x^3$ 在 $x=0$ 处导数为 0，但函数在两侧都递增，因此不是极值点。'
      },
      {
        type: '物理应用题',
        stem: '物体位移 $s(t)=t^2+2t$（单位：米，秒），求 $t=3$ 时的瞬时速度。',
        answer: '$v(3)=8$ 米/秒。',
        explanation:
          '位移的导数是速度，$s\'(t)=2t+2$。代入 $t=3$ 得 $v(3)=2\\times 3+2=8$ 米/秒。'
      }
    ],
    summary: '本题组覆盖导数定义、求导法则、切线几何意义与简单物理应用。'
  };

  return { lesson, handout, exercises };
}

function genericContent(input) {
  const short = shortText(input.topic, 40);
  const definition =
    `「${short}」需要同时掌握三件事：对象（它研究什么）、条件（何时能用）、结论（能推出什么）。` +
    '与相近概念的区别，通常就落在某一条条件上；用正例和反例各检验一次，比背结论更可靠。';

  const lesson = {
    title: short,
    goal: `能准确抄录「${short}」的定义原句，列出至少 2 条成立条件，并用一个正例和一个反例说明它的适用边界。`,
    definition,
    steps: [
      {
        title: '抄录定义原句',
        detail: `把教材或课件里「${short}」的定义原句完整抄一遍，圈出 2–3 个关键词，并说明每个关键词的作用。`
      },
      {
        title: '列出成立条件',
        detail: `写下使用「${short}」时必须满足的条件（至少 2 条），每条后面补一句「缺少它会出现什么错误」。`
      },
      {
        title: '写一个最小正例',
        detail: `为「${short}」选参数最少、计算最简的例子，按「条件 → 过程 → 结论」写全三步，确保每一步都能被别人核对。`
      },
      {
        title: '写一个反例',
        detail: `故意去掉「${short}」的一条条件，观察结论如何失效；反例要指认缺的是哪条条件，而不是只说「错了」。`
      },
      {
        title: '归纳判定步骤',
        detail: `用自己的话写出判断「能否使用${short}」的三步流程。`
      }
    ],
    interactive: { kind: 'steps', readout: '拖动滑块或点击按钮，逐步查看讲解内容。' },
    misconceptions: [
      {
        wrong: `只要记住「${short}」的结论，就能直接套用。`,
        right: `「${short}」的结论有前提条件；先核对条件，再套结论，否则容易在相似题上出错。`
      },
      {
        wrong: `把「${short}」和相近概念当成一回事。`,
        right: `写出「${short}」与相近概念的定义差异和各自适用条件；能举出只有其中一个成立的例子，才算区分清楚。`
      }
    ],
    summary: [
      `「${short}」的定义关键词：对象、条件、结论，三者缺一不可。`,
      `用「${short}」的最小正例与反例各一个，检验是否真正理解条件。`,
      `能写出「能否使用${short}」的三步判定流程。`
    ]
  };

  const handout = {
    objectives: [
      `能准确抄录「${short}」的定义原句，并标出 2–3 个关键词。`,
      `能列出「${short}」的至少 2 条成立条件，并各配一个反例。`,
      `能用一个正例和一个反例，说明「${short}」的适用边界。`
    ],
    coreConcept: definition,
    examples: [
      {
        question: `为「${short}」做一张定义卡片（定义原句 + 3 个关键词 + 1 条成立条件）。`,
        steps: [
          '忠实抄录教材中的定义原句，不改写。',
          '圈出 3 个关键词，分别标注它对应对象、条件还是结论。',
          '补一条成立条件，并写明缺少它会出现的错误。'
        ],
        answer: '卡片应包含可核对的定义原句，关键词与条件一一对应。'
      },
      {
        question: `给「${short}」各写一个正例与反例，并指出差别对应的条件。`,
        steps: [
          '正例：写出满足全部条件的最小例子。',
          '反例：去掉其中一条条件，写出结论如何失效。',
          '指认差别：明确说出反例缺的是哪一条条件。'
        ],
        answer: '正例满足全部条件；反例至少缺一条，差别应能对应到具体条件。'
      }
    ],
    commonErrors: [
      `把「${short}」的定义背成口号，说不出关键词与成立条件。`,
      `为「${short}」举例时只写结论，不写条件检查过程，导致无法判断对错。`
    ],
    homework: [
      `整理「${short}」的定义卡片，并标注 3 个关键词。`,
      `为「${short}」各准备一个正例与反例，注明差别对应的条件。`,
      `用三步判定流程，判断一道新题能否使用「${short}」。`
    ]
  };

  const exercises = {
    items: [
      {
        type: '概念复述题',
        stem: `抄录「${short}」的定义原句，并标出其中 2–3 个关键词。`,
        answer: '应包含定义原句与关键词；关键词要能对应到对象、条件或结论。',
        explanation:
          `先忠实抄录「${short}」的定义原句，再做标注。标注要说明该词为什么关键，例如它限定了对象、给定了条件，或给出了结论形式。`
      },
      {
        type: '判断题',
        stem: `判断：只要记住「${short}」的结论，就能在所有题目里直接套用。`,
        answer: '错误。',
        explanation:
          `「${short}」的结论只在满足条件时成立，换一个情境就可能失效。理解条件的意义，才能判断什么时候可以用。`
      },
      {
        type: '应用题',
        stem: `为「${short}」写一个最小正例，按「条件 → 过程 → 结论」写出三步。`,
        answer: '正例应满足全部条件，且三步齐全、每一步都能被核对。',
        explanation:
          `最小正例指参数最少、计算最简的例子，「${short}」也一样。先核对条件，再写推理，最后给结论；三步缺一不可。`
      },
      {
        type: '简答题',
        stem: `列出「${short}」的 2 条成立条件，并各写一个缺失后的反例。`,
        answer: '两条条件 + 两个反例；反例要指认缺失的是哪条条件、结论如何失效。',
        explanation:
          `「${short}」的条件要写成能被检查的句子，而不是笼统的形容词。每条条件配一个反例，才能说明它的必要性。`
      },
      {
        type: '应用题',
        stem: `给出「${short}」的一个反例，说明它缺少哪条条件、结论如何失效。`,
        answer: '反例应明确缺少的条件，并指出由此导致的错误结论。',
        explanation:
          `反例的价值在于给「${short}」定位边界。先说明它满足了哪些条件，再指出缺的那一条，最后说明结论为何不成立。`
      },
      {
        type: '综合题',
        stem: `用自己的话写出「能否使用${short}」的三步判定流程，并各用一句话说明。`,
        answer: '第一步核对对象，第二步核对条件，第三步用小例子验证。',
        explanation:
          `「${short}」的判定流程要能直接照着做：每步给出可检查的动作，而不是抽象口号。最后一步用最小例子验证最有效。`
      }
    ],
    summary: `本题组围绕「${short}」：定义复述、条件判断、正例与反例、三步判定。`
  };

  return { lesson, handout, exercises };
}

function buildBuiltinContent(input) {
  const isDerivative = /函数求导|导数|求导/.test(input.topic);
  const content = isDerivative ? derivativeContent(input) : genericContent(input);
  content.exercises.items = extendExercises(
    content.exercises.items,
    input.exerciseCount || 6,
    input.topic
  );
  return content;
}

function extendExercises(items, count, topic) {
  const result = items.slice(0, count);
  const short = shortText(topic || '', 40);
  const derivativeStyle = Boolean(items[0] && String(items[0].type).includes('计算题'));

  for (let index = items.length; index < count; index += 1) {
    if (derivativeStyle) {
      const power = 2 + ((index - 6) % 5);
      result.push({
        type: '变式计算题',
        stem: `求 $f(x)=x^{${power}}$ 的导数。`,
        answer: `$f'(x)=${power}x^{${power - 1}}$。`,
        explanation:
          `幂函数法则给出 $(x^n)'=n x^{n-1}$。把指数 ${power} 代入，得到 ${power}x^{${power - 1}}。`
      });
    } else {
      result.push({
        type: '拓展题',
        stem: `围绕「${short}」再写一个具体例子，并说明它满足哪些条件。`,
        answer: '例子应能对应知识点，并清楚列出它满足的关键条件。',
        explanation:
          '先选择一个简单情境，再逐条对照关键条件。最后说明结论，避免只给例子而不说明理由。'
      });
    }
  }

  // 题量较小时（例如 1–3 题）前几题可能是同一题型；只要题量 ≥ 2，
  // 就从完整题池里换入一道不同类型的题，保证「至少 2 种题型」。
  const trimmed = result.slice(0, count);
  if (trimmed.length >= 2 && new Set(trimmed.map((item) => item.type)).size < 2) {
    const usedTypes = new Set(trimmed.map((item) => item.type));
    const replacement = items.find((item) => !usedTypes.has(item.type));
    if (replacement) trimmed[trimmed.length - 1] = replacement;
  }
  return trimmed;
}

// ---------------------------------------------------------------- 产物自检

function sentenceCount(text) {
  return String(text)
    .split(/[。！？!?]/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function assertContent(content, input) {
  const problems = [];

  if (input.withInteractive) {
    const lesson = content.lesson || {};
    if (!lesson.title) problems.push('lesson.title 缺失');
    if (!lesson.goal) problems.push('lesson.goal 缺失');
    if (!lesson.definition) problems.push('lesson.definition 缺失');
    if (countChars(lesson.definition || '') > 200) problems.push(`lesson.definition.length=${countChars(lesson.definition || '')}`);
    if (!Array.isArray(lesson.steps) || lesson.steps.length < 3) problems.push(`lesson.steps=${(lesson.steps || []).length}`);
    if (!lesson.interactive || !lesson.interactive.kind) problems.push('lesson.interactive 缺失');
    if (!Array.isArray(lesson.misconceptions) || lesson.misconceptions.length !== 2) {
      problems.push(`lesson.misconceptions=${(lesson.misconceptions || []).length}`);
    } else if (lesson.misconceptions.some((item) => !item.wrong || !item.right)) {
      problems.push('lesson.misconceptions 存在空项');
    }
    if (!Array.isArray(lesson.summary) || lesson.summary.length !== 3) {
      problems.push(`lesson.summary=${(lesson.summary || []).length}`);
    }
  }

  if (input.withHandout) {
    const handout = content.handout || {};
    if (!Array.isArray(handout.objectives) || handout.objectives.length !== 3) {
      problems.push(`handout.objectives=${(handout.objectives || []).length}`);
    }
    if (!handout.coreConcept) problems.push('handout.coreConcept 缺失');
    if (!Array.isArray(handout.examples) || handout.examples.length < 2) {
      problems.push(`handout.examples=${(handout.examples || []).length}`);
    } else if (handout.examples.some((item) => !item.question || !Array.isArray(item.steps) || item.steps.length < 2)) {
      problems.push('handout.examples 结构不完整');
    }
    if (!Array.isArray(handout.commonErrors) || handout.commonErrors.length < 1) {
      problems.push('handout.commonErrors 缺失');
    }
    if (!Array.isArray(handout.homework) || handout.homework.length < 1) {
      problems.push('handout.homework 缺失');
    }
  }

  if (input.withExercises) {
    const exercises = content.exercises || {};
    const items = Array.isArray(exercises.items) ? exercises.items : [];
    if (items.length !== input.exerciseCount) {
      problems.push(`exercises.count=${items.length}(期望 ${input.exerciseCount})`);
    }
    if (items.some((item) => !item.type || !item.stem || !item.answer || !item.explanation)) {
      problems.push('exercises.item 结构不完整');
    }
    if (items.some((item) => sentenceCount(item.explanation) < 2)) {
      problems.push('exercises.explanation.sentences<2');
    }
    const types = new Set(items.map((item) => item.type));
    if (items.length >= 2 && types.size < 2) problems.push(`exercises.types=${types.size}`);
  }

  if (problems.length) {
    throw codedError(
      'GENERATION_FAILED',
      `生成结果结构不完整：${problems.join('；')}。请缩短输入或减少题量后重试。`,
      problems.join(';')
    );
  }
}

// ---------------------------------------------------------------- 模板渲染

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mdText(value) {
  return String(value).replace(/\r?\n/g, ' ').replace(/\{\{/g, '{ {').trim();
}

function renderTemplate(source, values, name) {
  const missing = new Set();
  const rendered = String(source).replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      missing.add(key);
      return match;
    }
    return String(values[key]);
  });
  if (missing.size) {
    throw codedError(
      'GENERATION_FAILED',
      `模板 ${name} 存在未定义的占位符：${[...missing].join(', ')}。`,
      `template.${name}.missing=${[...missing].join(',')}`
    );
  }
  if (/\{\{[A-Z0-9_]+\}\}/.test(rendered)) {
    throw codedError('GENERATION_FAILED', `模板 ${name} 渲染后仍有未替换的占位符。`, `template.${name}.unresolved`);
  }
  return rendered;
}

const SVG = Object.freeze({ width: 360, height: 200, pad: 20, xMin: -2, xMax: 2, yMin: -2, yMax: 2 });

function mapX(x) {
  return SVG.pad + ((x - SVG.xMin) / (SVG.xMax - SVG.xMin)) * (SVG.width - SVG.pad * 2);
}

function mapY(y) {
  return SVG.height - SVG.pad - ((y - SVG.yMin) / (SVG.yMax - SVG.yMin)) * (SVG.height - SVG.pad * 2);
}

function curvePath() {
  const points = [];
  for (let x = SVG.xMin; x <= SVG.xMax + 0.0001; x += 0.1) {
    const value = x * x * x - 3 * x;
    points.push(`${points.length ? 'L' : 'M'}${mapX(x).toFixed(2)},${mapY(value).toFixed(2)}`);
  }
  return points.join(' ');
}

function buildStepsHtml(steps) {
  return steps
    .map((step, index) => {
      const active = index === 0 ? ' is-active' : '';
      return (
        `<li class="step${active}" data-step="${index + 1}">` +
        `<h3>步骤 ${index + 1}：${escapeHtml(step.title)}</h3>` +
        `<p>${escapeHtml(step.detail)}</p></li>`
      );
    })
    .join('\n      ');
}

function buildMisconceptionsHtml(items) {
  return items
    .map(
      (item, index) =>
        `<div class="misconception"><h3>误区 ${index + 1}</h3>` +
        `<p class="wrong">错误理解：${escapeHtml(item.wrong)}</p>` +
        `<p class="right">正确理解：${escapeHtml(item.right)}</p></div>`
    )
    .join('\n      ');
}

function buildSummaryHtml(items) {
  return `<ol class="summary-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
}

function buildInteractiveHtml(interactive, stepCount) {
  if (interactive.kind === 'tangent') {
    const curve = curvePath();
    return (
      '<div class="interactive-panel">' +
      '<label for="x-slider">拖动切点横坐标 $x_0$：<output id="x-value">0</output></label>' +
      '<input id="x-slider" type="range" min="-2" max="2" step="0.1" value="0">' +
      '<div class="canvas-wrap"><svg id="tangent-svg" viewBox="0 0 360 200" role="img" aria-label="切线斜率演示">' +
      `<rect x="0" y="0" width="${SVG.width}" height="${SVG.height}" fill="#f8fafc"/>` +
      `<line x1="${mapX(SVG.xMin)}" y1="${mapY(0)}" x2="${mapX(SVG.xMax)}" y2="${mapY(0)}" stroke="#94a3b8" stroke-width="1"/>` +
      `<line x1="${mapX(0)}" y1="${mapY(SVG.yMin)}" x2="${mapX(0)}" y2="${mapY(SVG.yMax)}" stroke="#94a3b8" stroke-width="1"/>` +
      `<path d="${curve}" fill="none" stroke="#2563eb" stroke-width="2"/>` +
      `<line id="tangent-line" x1="${mapX(-0.5).toFixed(2)}" y1="${mapY(1.5).toFixed(2)}" x2="${mapX(0.5).toFixed(2)}" y2="${mapY(-1.5).toFixed(2)}" stroke="#dc2626" stroke-width="2"/>` +
      `<circle id="tangent-point" cx="${mapX(0).toFixed(2)}" cy="${mapY(0).toFixed(2)}" r="4" fill="#dc2626"/>` +
      '</svg></div>' +
      '<p>当前切线斜率 $f\'(x_0)$：<output id="slope-value">-3</output></p>' +
      `<p class="hint">${escapeHtml(interactive.readout)}</p>` +
      '</div>'
    );
  }
  return (
    '<div class="interactive-panel">' +
    `<label for="step-range">拖动查看讲解进度：<output id="step-range-value">1</output> / ${stepCount}</label>` +
    `<input id="step-range" type="range" min="1" max="${stepCount}" step="1" value="1">` +
    `<p class="hint">${escapeHtml(interactive.readout)}</p>` +
    '</div>'
  );
}

function buildExamplesMarkdown(examples) {
  return examples
    .map((example, index) => {
      const steps = example.steps.map((step, stepIndex) => `${stepIndex + 1}. ${mdText(step)}`).join('\n');
      const answer = example.answer ? `\n\n**参考答案：** ${mdText(example.answer)}` : '';
      return `**例 ${index + 1}**：${mdText(example.question)}\n\n${steps}${answer}`;
    })
    .join('\n\n');
}

function buildQuestionsMarkdown(items) {
  return items
    .map(
      (item, index) =>
        `**第 ${index + 1} 题（${mdText(item.type)}）**\n\n` +
        `题干：${mdText(item.stem)}\n\n` +
        `参考答案：${mdText(item.answer)}\n\n` +
        `解析：${mdText(item.explanation)}`
    )
    .join('\n\n');
}

function loadTemplates(override) {
  if (override && override.lesson && override.handout && override.exercises) {
    return { source: 'deps.templates', ...override };
  }
  const read = (name) => fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8');
  return {
    source: 'src/templates',
    lesson: read('lesson.html'),
    handout: read('handout.md'),
    exercises: read('exercises.md')
  };
}

function renderArtifacts(content, input, lessonId, generatedAt, templates) {
  const lesson = content.lesson;
  const handout = content.handout;
  const exercises = content.exercises;
  const htmlCommon = {
    TITLE: escapeHtml(lesson.title),
    TOPIC: escapeHtml(input.topic),
    AUDIENCE: escapeHtml(input.audience),
    DIFFICULTY: escapeHtml(input.difficulty),
    LESSON_ID: escapeHtml(lessonId),
    GENERATED_AT: escapeHtml(generatedAt)
  };
  const mdCommon = {
    TITLE: mdText(lesson.title),
    TOPIC: mdText(input.topic),
    AUDIENCE: mdText(input.audience),
    DIFFICULTY: mdText(input.difficulty),
    LESSON_ID: mdText(lessonId),
    GENERATED_AT: mdText(generatedAt)
  };

  const rendered = [];

  if (input.withInteractive) {
    rendered.push({
      type: 'interactive_lesson',
      format: 'html',
      fileName: 'lesson.html',
      content: renderTemplate(templates.lesson, {
        ...htmlCommon,
        GOAL: escapeHtml(lesson.goal),
        DEFINITION: escapeHtml(lesson.definition),
        STEP_COUNT: String(lesson.steps.length),
        STEPS: buildStepsHtml(lesson.steps),
        INTERACTIVE: buildInteractiveHtml(lesson.interactive, lesson.steps.length),
        MISCONCEPTIONS: buildMisconceptionsHtml(lesson.misconceptions),
        SUMMARY: buildSummaryHtml(lesson.summary)
      }, 'lesson.html')
    });
  }

  if (input.withHandout) {
    rendered.push({
      type: 'handout',
      format: 'md',
      fileName: 'handout.md',
      content: renderTemplate(templates.handout, {
        ...mdCommon,
        OBJECTIVES: handout.objectives.map((item) => `- ${mdText(item)}`).join('\n'),
        CORE_CONCEPT: mdText(handout.coreConcept),
        EXAMPLES: buildExamplesMarkdown(handout.examples),
        COMMON_ERRORS: handout.commonErrors.map((item) => `- ${mdText(item)}`).join('\n'),
        HOMEWORK: handout.homework.map((item) => `- ${mdText(item)}`).join('\n')
      }, 'handout.md')
    });
  }

  if (input.withExercises) {
    rendered.push({
      type: 'exercises',
      format: 'md',
      fileName: 'exercises.md',
      questionCount: exercises.items.length,
      content: renderTemplate(templates.exercises, {
        ...mdCommon,
        QUESTION_COUNT: String(exercises.items.length),
        SUMMARY: mdText(exercises.summary || ''),
        QUESTIONS: buildQuestionsMarkdown(exercises.items)
      }, 'exercises.md')
    });
  }

  return rendered;
}

// ---------------------------------------------------------------- 主流程

function failResult(code, message, detail) {
  return {
    ok: false,
    code,
    message: message || FAILURE_MESSAGES[code] || FAILURE_MESSAGES.HOST_ERROR,
    retryable: Boolean(RETRYABLE[code]),
    detail: detail || ''
  };
}

function toFailure(error) {
  const code = error && RETRYABLE[error.code] !== undefined ? error.code : 'HOST_ERROR';
  if (code === 'HOST_ERROR') {
    return failResult('HOST_ERROR', FAILURE_MESSAGES.HOST_ERROR, 'unexpected_error');
  }
  const fallback = FAILURE_MESSAGES[code];
  const message =
    error && typeof error.message === 'string' && /[\u4e00-\u9fa5]/.test(error.message)
      ? error.message
      : fallback;
  return failResult(code, message, error.detail || '');
}

function assertTimeout(deps, startedAt) {
  if (typeof deps.timeoutMs !== 'number' || !Number.isFinite(deps.timeoutMs)) return;
  const elapsed = deps.now() - startedAt;
  if (elapsed > deps.timeoutMs) {
    throw codedError('TIMEOUT', FAILURE_MESSAGES.TIMEOUT, `elapsed=${elapsed}>timeoutMs=${deps.timeoutMs}`);
  }
}

/**
 * @param {object} input 见需求 3.3
 * @param {object} deps  见文件头依赖注入约定
 * @returns {Promise<object>} LessonResult
 */
async function generateLesson(input, deps) {
  const options = deps && typeof deps === 'object' ? deps : {};

  try {
    const validation = validateInput(input);
    if (!validation.ok) return validation;
    const params = validation.value;

    if (typeof options.now !== 'function') {
      throw codedError('HOST_ERROR', '宿主未注入时间依赖（deps.now）。', 'deps.now=missing');
    }
    const startedAt = options.now();

    if (typeof options.outputDir !== 'string' || options.outputDir.trim().length === 0) {
      throw codedError(
        'CAPABILITY_UNAVAILABLE',
        '宿主未提供可写产物目录（deps.outputDir），写入能力不可用，请确认插件已启用后重试。',
        'outputDir=missing'
      );
    }
    if (options.capabilities && options.capabilities.write === false) {
      throw codedError('CAPABILITY_UNAVAILABLE', FAILURE_MESSAGES.CAPABILITY_UNAVAILABLE, 'capability.write=false');
    }
    if (typeof options.writeFile !== 'function') {
      throw codedError('CAPABILITY_UNAVAILABLE', FAILURE_MESSAGES.CAPABILITY_UNAVAILABLE, 'capability.write=missing');
    }

    const timeZone = options.timeZone || 'Asia/Shanghai';
    const slug = slugForTopic(params.topic);
    const stamp = timestampInfo(startedAt, timeZone);
    const lessonId = `${slug}-${stamp.lessonStamp}`;
    const warnings = [];

    let content;
    const textCapability = !options.capabilities || options.capabilities.text !== false;
    if (typeof options.generateContent === 'function' && textCapability) {
      content = await options.generateContent({
        ...params,
        lessonId,
        generatedAt: stamp.generatedAt
      });
    } else {
      content = buildBuiltinContent(params);
      if (!textCapability) {
        warnings.push('宿主文本生成能力不可用，已使用内置确定性模板（D1 降级）。');
      } else {
        warnings.push('未注入宿主文本生成能力（deps.generateContent），已使用内置确定性模板（D1 降级）。');
      }
      if (params.difficulty !== '基础') {
        warnings.push(`P0 仅保证「基础」难度质量，当前按「${params.difficulty}」生成通用深度。`);
      }
      if (!/函数求导|导数|求导/.test(params.topic)) {
        warnings.push('非默认演示知识点，已使用通用备课骨架模板（D1 降级）：定义原句与正反例需结合教材补全。');
      }
    }

    assertContent(content, params);
    assertTimeout(options, startedAt);

    const templates = loadTemplates(options.templates);
    const rendered = renderArtifacts(content, params, lessonId, stamp.generatedAt, templates);
    assertTimeout(options, startedAt);

    if (!rendered.length) warnings.push('三个产物开关均为 false，本次未生成任何产物。');

    const outputRoot = path.join(options.outputDir, slug);
    const artifacts = [];

    for (const artifact of rendered) {
      const targetPath = path.join(outputRoot, artifact.fileName);
      try {
        await options.writeFile(targetPath, artifact.content);
      } catch (error) {
        throw codedError(
          'OUTPUT_WRITE_FAILED',
          `产物写入失败：${artifact.fileName}，请检查输出目录权限后重试。`,
          `write.${artifact.fileName}=${error && error.code ? error.code : 'failed'}`
        );
      }
      const record = {
        type: artifact.type,
        format: artifact.format,
        path: targetPath
      };
      if (artifact.type === 'exercises') record.questionCount = artifact.questionCount;
      artifacts.push(record);
    }

    return {
      ok: true,
      lessonId,
      topic: params.topic,
      artifacts,
      meta: {
        audience: params.audience,
        difficulty: params.difficulty,
        generatedAt: stamp.generatedAt
      },
      warnings
    };
  } catch (error) {
    return toFailure(error);
  }
}

module.exports = {
  generateLesson,
  buildBuiltinContent,
  renderTemplate,
  slugForTopic,
  FAILURE_MESSAGES,
  RETRYABLE
};
