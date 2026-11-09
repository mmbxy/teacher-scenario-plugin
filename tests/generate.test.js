'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { generateLesson, buildBuiltinContent } = require('../src/generate');
const { makeDeps, artifactOf } = require('./helpers');

const ALL_CODES = [
  'INVALID_INPUT',
  'CAPABILITY_UNAVAILABLE',
  'GENERATION_FAILED',
  'OUTPUT_WRITE_FAILED',
  'TIMEOUT',
  'HOST_ERROR'
];

test('成功路径：默认配置生成 3 个产物，题数为 6', async () => {
  const { deps } = makeDeps();
  const result = await generateLesson({ topic: '函数求导' }, deps);

  assert.equal(result.ok, true);
  assert.equal(result.topic, '函数求导');
  assert.match(result.lessonId, /^function-derivative-\d{8}-\d{6}$/);
  assert.equal(result.meta.audience, '本科一年级');
  assert.equal(result.meta.difficulty, '基础');
  assert.match(result.meta.generatedAt, /^2026-11-04T10:15:00\+08:00$/);
  assert.equal(result.artifacts.length, 3);

  const types = result.artifacts.map((item) => item.type);
  assert.deepEqual(types, ['interactive_lesson', 'handout', 'exercises']);
  assert.equal(artifactOf(result, 'exercises').questionCount, 6);
  assert.equal(artifactOf(result, 'interactive_lesson').format, 'html');
  assert.equal(artifactOf(result, 'handout').format, 'md');
  assert.equal(artifactOf(result, 'exercises').format, 'md');
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings.length >= 1, '内置模板应记录降级原因');
});

test('产物开关：只生成被请求的类型', async () => {
  const { deps } = makeDeps();
  const onlyHandout = await generateLesson(
    { topic: '函数求导', withInteractive: false, withExercises: false },
    deps
  );
  assert.equal(onlyHandout.ok, true);
  assert.deepEqual(onlyHandout.artifacts.map((item) => item.type), ['handout']);

  const none = await generateLesson(
    { topic: '函数求导', withInteractive: false, withHandout: false, withExercises: false },
    deps
  );
  assert.equal(none.ok, false);
  assert.equal(none.code, 'INVALID_INPUT');
  assert.match(none.message, /至少要选择一种/);
  assert.equal(none.detail, 'artifacts=none');
});

test('习题数量：1 与 20 都能准确落盘', async () => {
  for (const count of [1, 20]) {
    const { deps } = makeDeps();
    const result = await generateLesson({ topic: '函数求导', exerciseCount: count }, deps);
    assert.equal(result.ok, true);
    assert.equal(artifactOf(result, 'exercises').questionCount, count);
  }
});

test('可复现：同一输入连续 3 次，返回结构与文件内容完全一致', async () => {
  const snapshots = [];
  for (let run = 0; run < 3; run += 1) {
    const { deps, files } = makeDeps();
    const result = await generateLesson({ topic: '函数求导' }, deps);
    const fileDump = [...files.entries()].sort(([a], [b]) => a.localeCompare(b));
    snapshots.push(JSON.stringify({ result, files: fileDump }));
  }

  assert.equal(new Set(snapshots).size, 1, '三次输出应逐字节一致');
  const parsed = JSON.parse(snapshots[0]);
  assert.equal(parsed.result.ok, true);
  assert.equal(parsed.files.length, 3);
});

test('失败路径：INVALID_INPUT 指向 topic，且中文提示无堆栈', async () => {
  const { deps } = makeDeps();
  const result = await generateLesson({ topic: '' }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_INPUT');
  assert.equal(result.retryable, false);
  assert.match(result.message, /知识点/);
  assert.match(result.detail, /^topic/);
  assert.equal(/stack|Error:|\.js:\d+/i.test(result.message), false);
});

test('失败路径：CAPABILITY_UNAVAILABLE（缺 writeFile / 缺 outputDir / write=false）', async () => {
  const cases = [
    makeDeps({ writeFile: undefined }).deps,
    makeDeps({ outputDir: '' }).deps,
    makeDeps({ capabilities: { write: false } }).deps
  ];
  for (const deps of cases) {
    const result = await generateLesson({ topic: '函数求导' }, deps);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'CAPABILITY_UNAVAILABLE');
    assert.equal(result.retryable, true);
    assert.match(result.message, /不可用/);
  }
});

test('失败路径：GENERATION_FAILED（题数不一致 / 讲解页结构缺失）', async () => {
  const base = buildBuiltinContent({
    topic: '函数求导',
    audience: '本科一年级',
    difficulty: '基础',
    exerciseCount: 6,
    withInteractive: true,
    withHandout: true,
    withExercises: true
  });

  const shortExercises = JSON.parse(JSON.stringify(base));
  shortExercises.exercises.items = shortExercises.exercises.items.slice(0, 5);
  const shortResult = await generateLesson({ topic: '函数求导' }, makeDeps({
    generateContent: () => shortExercises
  }).deps);
  assert.equal(shortResult.ok, false);
  assert.equal(shortResult.code, 'GENERATION_FAILED');
  assert.match(shortResult.detail, /exercises\.count=5/);

  const noSteps = JSON.parse(JSON.stringify(base));
  noSteps.lesson.steps = noSteps.lesson.steps.slice(0, 2);
  const stepsResult = await generateLesson({ topic: '函数求导' }, makeDeps({
    generateContent: () => noSteps
  }).deps);
  assert.equal(stepsResult.ok, false);
  assert.equal(stepsResult.code, 'GENERATION_FAILED');
  assert.match(stepsResult.detail, /lesson\.steps=2/);
});

test('失败路径：OUTPUT_WRITE_FAILED（写入抛 EACCES）', async () => {
  const { deps } = makeDeps({
    writeFile: () => {
      const error = new Error('permission denied');
      error.code = 'EACCES';
      throw error;
    }
  });
  const result = await generateLesson({ topic: '函数求导' }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'OUTPUT_WRITE_FAILED');
  assert.equal(result.retryable, true);
  assert.match(result.message, /写入失败/);
  assert.match(result.detail, /write\.lesson\.html=EACCES/);
});

test('失败路径：TIMEOUT（生成能力抛出 TIMEOUT）', async () => {
  const { deps } = makeDeps({
    generateContent: () => {
      const error = new Error('host timeout');
      error.code = 'TIMEOUT';
      throw error;
    }
  });
  const result = await generateLesson({ topic: '函数求导' }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'TIMEOUT');
  assert.equal(result.retryable, true);
  assert.match(result.message, /超时/);
});

test('失败路径：HOST_ERROR（未预期异常，不暴露堆栈）', async () => {
  const { deps } = makeDeps({
    generateContent: () => {
      throw new Error('unexpected host crash at C:\\secret\\host.js:12');
    }
  });
  const result = await generateLesson({ topic: '函数求导' }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'HOST_ERROR');
  assert.equal(result.retryable, false);
  assert.equal(result.message, '生成过程中出现未预期错误，请重试；若持续失败请联系插件维护者。');
  assert.doesNotMatch(result.message, /secret|stack|\.js/);
  assert.equal(result.detail, 'unexpected_error');
});

test('6 个错误码全部可命中且集合完整', async () => {
  const codes = new Set();
  codes.add((await generateLesson({ topic: '' }, makeDeps().deps)).code);
  codes.add((await generateLesson({ topic: '函数求导' }, makeDeps({ writeFile: undefined }).deps)).code);
  const shortContent = buildBuiltinContent({
    topic: '函数求导',
    audience: '本科一年级',
    difficulty: '基础',
    exerciseCount: 6,
    withInteractive: true,
    withHandout: true,
    withExercises: true
  });
  shortContent.exercises.items = shortContent.exercises.items.slice(0, 5);
  codes.add((await generateLesson({ topic: '函数求导' }, makeDeps({ generateContent: () => shortContent }).deps)).code);
  codes.add((await generateLesson({ topic: '函数求导' }, makeDeps({
    writeFile: () => {
      const error = new Error('disk full');
      error.code = 'ENOSPC';
      throw error;
    }
  }).deps)).code);
  codes.add((await generateLesson({ topic: '函数求导' }, makeDeps({
    generateContent: () => {
      const error = new Error('timeout');
      error.code = 'TIMEOUT';
      throw error;
    }
  }).deps)).code);
  codes.add((await generateLesson({ topic: '函数求导' }, makeDeps({
    generateContent: () => { throw new Error('boom'); }
  }).deps)).code);

  assert.deepEqual([...codes].sort(), ALL_CODES.slice().sort());
});
