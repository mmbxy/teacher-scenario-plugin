'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { generateLectureKit } = require('../src/kit/tool');

const FIXED_NOW = Date.parse('2026-11-11T02:00:00Z');

function makeDeps(overrides = {}) {
  const files = new Map();
  return {
    files,
    deps: {
      now: () => FIXED_NOW,
      outputDir: path.join(__dirname, '..', '.tmp-kit'),
      writeFile: async (target, content) => {
        files.set(target, content);
      },
      ...overrides
    }
  };
}

test('工具：60 分钟课时包产出 7 件套', async () => {
  const { deps, files } = makeDeps();
  const result = await generateLectureKit({ topic: '函数求导', durationMinutes: 60, exerciseCount: 8 }, deps);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.durationMinutes, 60);
  assert.equal(result.words, 6110);
  assert.equal(result.artifacts.length, 7);
  assert.equal(files.size, 7);
  assert.ok(result.artifacts.every((item) => item.path.includes(result.lessonId)));
  assert.deepEqual(
    result.artifacts.map((item) => item.type),
    ['lecture-plan', 'handout', 'exercises', 'board', 'interaction', 'lecture-kit-docx', 'lecture-kit-pptx']
  );
});

test('工具：45/90 分钟均可生成', async () => {
  for (const durationMinutes of [45, 90]) {
    const { deps } = makeDeps();
    const result = await generateLectureKit({ topic: '函数求导', durationMinutes, exerciseCount: durationMinutes === 90 ? 12 : 6 }, deps);
    assert.equal(result.ok, true, result.message);
    assert.equal(result.durationMinutes, durationMinutes);
    assert.equal(result.artifacts.length, 7);
  }
});

test('工具：只出 Markdown 时不加载二进制渲染', async () => {
  const { deps } = makeDeps();
  const result = await generateLectureKit({ topic: '函数求导', durationMinutes: 45, withDocx: false, withPptx: false }, deps);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.artifacts.length, 5);
  assert.ok(result.artifacts.every((item) => item.format === 'markdown'));
});

test('工具：非法时长返回 INVALID_DURATION', async () => {
  const { deps } = makeDeps();
  const result = await generateLectureKit({ topic: '函数求导', durationMinutes: '30' }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_DURATION');
});

test('工具：未知知识点返回 TEMPLATE_MISSING', async () => {
  const { deps } = makeDeps();
  const result = await generateLectureKit({ topic: '矩阵的秩', durationMinutes: 60 }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'TEMPLATE_MISSING');
});

test('工具：写入失败返回 OUTPUT_WRITE_FAILED', async () => {
  const { deps } = makeDeps({
    writeFile: async () => {
      const error = new Error('denied');
      error.code = 'EACCES';
      throw error;
    }
  });
  const result = await generateLectureKit({ topic: '函数求导', durationMinutes: 60 }, deps);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'OUTPUT_WRITE_FAILED');
  assert.match(result.detail, /EACCES/);
});

test('工具：校验失败返回 VALIDATION_FAILED', async () => {
  const { deps } = makeDeps();
  const brokenProvider = {
    fill(spec) {
      const broken = JSON.parse(JSON.stringify(spec));
      broken.examples = [];
      return { ok: true, spec: broken, warnings: [] };
    }
  };
  const result = await generateLectureKit({ topic: '函数求导', durationMinutes: 60 }, { ...deps, provider: brokenProvider });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'VALIDATION_FAILED');
  assert.match(result.detail, /V4_EXAMPLES_INSUFFICIENT/);
});
