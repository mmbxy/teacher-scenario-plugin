'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateInput } = require('../src/validate');

test('合法输入：只给 topic 时套用默认值', () => {
  const result = validateInput({ topic: '函数求导' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    topic: '函数求导',
    audience: '本科一年级',
    difficulty: '基础',
    exerciseCount: 6,
    withInteractive: true,
    withHandout: true,
    withExercises: true
  });
});

test('合法输入：topic 前后空白会被裁剪，允许覆盖全部参数', () => {
  const result = validateInput({
    topic: '  函数求导  ',
    audience: '高中',
    difficulty: '进阶',
    exerciseCount: 3,
    withInteractive: false,
    withHandout: true,
    withExercises: false
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.topic, '函数求导');
  assert.equal(result.value.audience, '高中');
  assert.equal(result.value.difficulty, '进阶');
  assert.equal(result.value.exerciseCount, 3);
  assert.equal(result.value.withInteractive, false);
  assert.equal(result.value.withExercises, false);
});

const invalidCases = [
  { name: 'topic 缺失', input: {}, field: 'topic', label: '知识点' },
  { name: 'topic 为空串', input: { topic: '' }, field: 'topic', label: '知识点' },
  { name: 'topic 纯空白', input: { topic: '   ' }, field: 'topic', label: '知识点' },
  { name: 'topic 非文本', input: { topic: 123 }, field: 'topic', label: '知识点' },
  { name: 'topic 超过 2000 字', input: { topic: '知'.repeat(2001) }, field: 'topic', label: '知识点' },
  { name: 'audience 为空串', input: { topic: '函数求导', audience: '' }, field: 'audience', label: '教学对象' },
  { name: 'audience 非文本', input: { topic: '函数求导', audience: 42 }, field: 'audience', label: '教学对象' },
  { name: 'difficulty 非法枚举', input: { topic: '函数求导', difficulty: '困难' }, field: 'difficulty', label: '难度' },
  { name: 'difficulty 非文本', input: { topic: '函数求导', difficulty: 1 }, field: 'difficulty', label: '难度' },
  { name: 'exerciseCount 为 0', input: { topic: '函数求导', exerciseCount: 0 }, field: 'exerciseCount', label: '习题数量' },
  { name: 'exerciseCount 为 21', input: { topic: '函数求导', exerciseCount: 21 }, field: 'exerciseCount', label: '习题数量' },
  { name: 'exerciseCount 为小数', input: { topic: '函数求导', exerciseCount: 1.5 }, field: 'exerciseCount', label: '习题数量' },
  { name: 'exerciseCount 为字符串', input: { topic: '函数求导', exerciseCount: '6' }, field: 'exerciseCount', label: '习题数量' },
  { name: 'withInteractive 非布尔', input: { topic: '函数求导', withInteractive: 'true' }, field: 'withInteractive', label: '是否生成讲解页' },
  { name: 'withHandout 非布尔', input: { topic: '函数求导', withHandout: 0 }, field: 'withHandout', label: '是否生成讲义' },
  { name: 'withExercises 非布尔', input: { topic: '函数求导', withExercises: 'false' }, field: 'withExercises', label: '是否生成练习题' }
];

for (const item of invalidCases) {
  test(`非法入参：${item.name}`, () => {
    const result = validateInput(item.input);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_INPUT');
    assert.equal(result.retryable, false);
    assert.match(result.message, new RegExp(item.label));
    assert.match(result.detail, new RegExp(`^${item.field}`));
  });
}

test('非法入参：整体不是对象', () => {
  for (const input of [null, undefined, '函数求导', 42, []]) {
    const result = validateInput(input);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_INPUT');
    assert.equal(result.detail.startsWith('input.type='), true);
  }
});

test('边界值：topic 2000 字、exerciseCount 1 与 20 均合法', () => {
  assert.equal(validateInput({ topic: '知'.repeat(2000) }).ok, true);
  assert.equal(validateInput({ topic: '函数求导', exerciseCount: 1 }).ok, true);
  assert.equal(validateInput({ topic: '函数求导', exerciseCount: 20 }).ok, true);
});
