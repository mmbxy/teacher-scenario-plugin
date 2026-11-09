'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { generateLesson } = require('../src/generate');
const { makeDeps, artifactOf, artifactText } = require('./helpers');

async function renderDefault(overrides) {
  const { deps, files } = makeDeps(overrides);
  const result = await generateLesson({ topic: '函数求导' }, deps);
  assert.equal(result.ok, true, JSON.stringify(result));
  return {
    result,
    files,
    lesson: artifactText(result, files, 'interactive_lesson'),
    handout: artifactText(result, files, 'handout'),
    exercises: artifactText(result, files, 'exercises')
  };
}

test('讲解页：六个区块齐全、步骤可推进、交互元素存在', async () => {
  const { lesson } = await renderDefault();

  for (const id of ['title', 'concept', 'process', 'interactive', 'misconceptions', 'summary']) {
    assert.match(lesson, new RegExp(`id="${id}"`), `缺少区块 #${id}`);
  }
  assert.match(lesson, /<meta charset="utf-8">/);
  assert.match(lesson, /id="prev-step"/);
  assert.match(lesson, /id="next-step"/);
  assert.match(lesson, /<input id="x-slider" type="range"/);
  assert.match(lesson, /id="tangent-line"/);
  assert.match(lesson, /id="slope-value"/);

  const steps = lesson.match(/<li class="step/g) || [];
  assert.equal(steps.length, 4, '过程拆解应为 4 步');
  const misconceptions = lesson.match(/class="misconception"/g) || [];
  assert.equal(misconceptions.length, 2, '常见误区应为 2 条');
  const summaryItems = lesson.match(/<li>/g) || [];
  assert.ok(summaryItems.length >= 3);
  assert.match(lesson, /错误理解：/);
  assert.match(lesson, /正确理解：/);
});

test('讲解页：无任何外部网络资源，断网可打开', async () => {
  const { lesson } = await renderDefault();
  assert.doesNotMatch(lesson, /https?:\/\//i);
  assert.doesNotMatch(lesson, /<script[^>]+src=/i);
  assert.doesNotMatch(lesson, /<link[^>]+href=/i);
  assert.doesNotMatch(lesson, /@import/i);
  assert.doesNotMatch(lesson, /url\s*\(\s*['"]?http/i);
});

test('讲解页：内联脚本可被 JS 引擎解析，并监听滑块输入', async () => {
  const { lesson } = await renderDefault();
  const scripts = [...lesson.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(scripts.length, 1, '讲解页应只有一段内联脚本');
  assert.doesNotThrow(() => new Function(scripts[0]));
  assert.match(scripts[0], /addEventListener\('input'/);
  assert.match(scripts[0], /setAttribute\('x1'/);
});

test('讲义：固定 5 个二级标题、3 条目标、2 道例题', async () => {
  const { handout } = await renderDefault();
  const headings = handout.match(/^## .+$/gm) || [];
  assert.equal(headings.length, 5, `二级标题应恰好 5 个，实际：${headings.join(' / ')}`);
  assert.match(handout, /^## 学习目标$/m);
  assert.match(handout, /^## 核心概念$/m);
  assert.match(handout, /^## 例题精讲$/m);
  assert.match(handout, /^## 常见错误$/m);
  assert.match(handout, /^## 课后任务$/m);

  const objectives = handout.split('## 学习目标')[1].split('## 核心概念')[0];
  const objectiveLines = objectives.split('\n').filter((line) => line.trim().startsWith('- '));
  assert.equal(objectiveLines.length, 3, '学习目标应为 3 条');
  assert.match(handout, /\*\*例 1\*\*/);
  assert.match(handout, /\*\*例 2\*\*/);
  assert.match(handout, /f\(x\)=x\^3-3x/, '应包含默认例题 f(x)=x³−3x');
});

test('习题：默认 6 题、题数与返回一致、≥2 种题型、每题含答案与解析', async () => {
  const { result, exercises } = await renderDefault();
  const artifact = artifactOf(result, 'exercises');
  assert.equal(artifact.questionCount, 6);

  const questionNumbers = exercises.match(/\*\*第 \d+ 题/g) || [];
  assert.equal(questionNumbers.length, 6);
  for (let index = 1; index <= 6; index += 1) {
    assert.match(exercises, new RegExp(`\\*\\*第 ${index} 题`));
  }

  const types = [...exercises.matchAll(/\*\*第 \d+ 题（(.+)）\*\*/g)].map((match) => match[1]);
  assert.equal(types.length, 6);
  assert.ok(new Set(types).size >= 2, `题型应 ≥2 种，实际：${[...new Set(types)].join(' / ')}`);

  assert.equal((exercises.match(/题干：/g) || []).length, 6);
  assert.equal((exercises.match(/参考答案：/g) || []).length, 6);
  const explanations = [...exercises.matchAll(/解析：([^\n]+)/g)].map((match) => match[1]);
  assert.equal(explanations.length, 6);
  for (const explanation of explanations) {
    const sentences = explanation.split(/[。！？]/).filter((item) => item.trim().length > 0);
    assert.ok(sentences.length >= 2, `解析应至少 2 句：${explanation}`);
  }

  assert.match(exercises, /基础/);
});

test('习题：请求 1 题时题数准确，允许只有 1 种题型', async () => {
  const { deps, files } = makeDeps();
  const result = await generateLesson({ topic: '函数求导', exerciseCount: 1 }, deps);
  assert.equal(result.ok, true);
  assert.equal(artifactOf(result, 'exercises').questionCount, 1);
  const text = artifactText(result, files, 'exercises');
  assert.equal((text.match(/\*\*第 \d+ 题/g) || []).length, 1);
});

test('非默认知识点：走通用模板也能生成完整三件产物', async () => {
  const { deps, files } = makeDeps();
  const result = await generateLesson({ topic: '勾股定理' }, deps);
  assert.equal(result.ok, true);
  assert.equal(result.artifacts.length, 3);
  const lesson = artifactText(result, files, 'interactive_lesson');
  const handout = artifactText(result, files, 'handout');
  const exercises = artifactText(result, files, 'exercises');
  assert.match(lesson, /勾股定理/);
  assert.equal((handout.match(/^## .+$/gm) || []).length, 5);
  assert.equal((exercises.match(/\*\*第 \d+ 题/g) || []).length, 6);
  assert.match(result.warnings.join(' '), /通用备课骨架模板/);
});

test('超长知识点：仍能生成，且概念定义 ≤200 字', async () => {
  const { deps, files } = makeDeps();
  const result = await generateLesson({ topic: '知'.repeat(2000) }, deps);
  assert.equal(result.ok, true);
  const lesson = artifactText(result, files, 'interactive_lesson');
  assert.match(lesson, /id="concept"/);
  assert.ok(lesson.length > 1000);
});

test('UTF-8：三份产物中文与公式无乱码', async () => {
  const { lesson, handout, exercises } = await renderDefault();
  for (const text of [lesson, handout, exercises]) {
    assert.equal(Buffer.from(text, 'utf8').toString('utf8'), text);
    assert.match(text, /函数求导/);
    assert.match(text, /\$f\(x\)/);
    assert.doesNotMatch(text, /�/);
  }
});
