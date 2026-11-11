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

test('工具：60 分钟课时包产出教师+学生 16 件', async () => {
  const { deps, files } = makeDeps();
  const result = await generateLectureKit({ topic: '函数求导', durationMinutes: 60, exerciseCount: 8 }, deps);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.durationMinutes, 60);
  assert.equal(result.words, 6031);
  assert.equal(result.artifacts.length, 16);
  assert.equal(files.size, 16);
  assert.ok(result.artifacts.every((item) => item.path.includes(result.lessonId)));
  assert.deepEqual(
    result.artifacts.filter((item) => item.edition === 'teacher').map((item) => item.type),
    ['lecture-plan', 'handout', 'exercises', 'board', 'interaction', 'lecture-kit-docx', 'lecture-kit-pptx', 'lecture-kit-html']
  );
  assert.deepEqual(
    result.artifacts.filter((item) => item.edition === 'student').map((item) => item.type),
    ['lecture-plan', 'handout', 'exercises', 'board', 'interaction', 'lecture-kit-docx', 'lecture-kit-pptx', 'lecture-kit-html']
  );
});

test('工具：45/90 分钟均可生成', async () => {
  for (const durationMinutes of [45, 90]) {
    const { deps } = makeDeps();
    const result = await generateLectureKit({ topic: '函数求导', durationMinutes, exerciseCount: durationMinutes === 90 ? 12 : 6 }, deps);
    assert.equal(result.ok, true, result.message);
    assert.equal(result.durationMinutes, durationMinutes);
    assert.equal(result.artifacts.length, 16);
  }
});

test('工具：只出 Markdown 时只生成 5 个文件', async () => {
  const { deps } = makeDeps();
  const result = await generateLectureKit({ topic: '函数求导', durationMinutes: 45, edition: 'teacher', withDocx: false, withPptx: false, withHtml: false }, deps);
  assert.equal(result.ok, true, result.message);
  assert.equal(result.artifacts.length, 5);
  assert.ok(result.artifacts.every((item) => item.format === 'markdown'));
});

test('工具：学生版习题与 HTML 不含答案', async () => {
  const { deps, files } = makeDeps();
  const result = await generateLectureKit({ topic: '函数求导', durationMinutes: 45, edition: 'both' }, deps);
  assert.equal(result.ok, true, result.message);
  const teacherExercises = [...files.entries()].find(([target]) => target.includes('/teacher/exercises.md'))[1];
  const studentExercises = [...files.entries()].find(([target]) => target.includes('/student/exercises.md'))[1];
  const teacherHtml = [...files.entries()].find(([target]) => target.includes('/teacher/lecture-kit.html'))[1];
  const studentHtml = [...files.entries()].find(([target]) => target.includes('/student/lecture-kit.html'))[1];
  assert.match(teacherExercises, /答案/);
  assert.doesNotMatch(studentExercises, /答案：/);
  assert.match(teacherHtml, /查看答案/);
  assert.doesNotMatch(studentHtml, /查看答案/);
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


