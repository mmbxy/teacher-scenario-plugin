'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createLessonSpec, validateLessonSpec } = require('../src/kit');
const { createTemplateProvider } = require('../src/kit/providers/template');

const FIXED_NOW = Date.parse('2026-11-11T02:00:00Z');

function makeSpec(topic = '函数求导', durationMinutes = 60) {
  const result = createLessonSpec(
    { topic, durationMinutes, keyPoints: ['概念', '例题'], exerciseCount: 8 },
    { now: () => FIXED_NOW }
  );
  assert.equal(result.ok, true, result.message);
  return result.spec;
}

test('TemplateProvider：填充 60 分钟后通过 full 校验', () => {
  const provider = createTemplateProvider();
  const spec = makeSpec();
  const result = provider.fill(spec);
  assert.equal(result.ok, true, result.message);
  const filled = result.spec;

  assert.equal(filled.meta.contentSource, 'template');
  assert.ok(filled.sections.every((section) => section.content.length > 0));
  assert.ok(filled.sections.every((section) => section.wordCount > 0));
  assert.ok(filled.sections.reduce((sum, section) => sum + section.wordCount, 0) >= 6000);
  assert.ok(filled.deckPages >= 25);

  const validation = validateLessonSpec(filled, { mode: 'full' });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
});

test('TemplateProvider：保留时间轴与分节结构，不改 id/kind', () => {
  const provider = createTemplateProvider();
  const spec = makeSpec();
  const filled = provider.fill(spec).spec;

  assert.deepEqual(
    filled.timeline.map((slot) => ({ id: slot.id, kind: slot.kind, duration: slot.durationMinutes })),
    spec.timeline.map((slot) => ({ id: slot.id, kind: slot.kind, duration: slot.durationMinutes }))
  );
  assert.deepEqual(
    filled.sections.map((section) => ({ id: section.id, timelineId: section.timelineId, kind: section.kind })),
    spec.sections.map((section) => ({ id: section.id, timelineId: section.timelineId, kind: section.kind }))
  );
});

test('TemplateProvider：同一输入两次填充结果一致', () => {
  const provider = createTemplateProvider();
  const spec = makeSpec();
  const first = JSON.stringify(provider.fill(spec).spec);
  const second = JSON.stringify(provider.fill(spec).spec);
  assert.equal(first, second);
});

test('TemplateProvider：填充 45 分钟后通过 full 校验', () => {
  const provider = createTemplateProvider();
  const spec = makeSpec('函数求导', 45);
  const result = provider.fill(spec);
  assert.equal(result.ok, true, result.message);
  const filled = result.spec;
  assert.equal(filled.interactions.length, 3);
  assert.equal(filled.exercises.length, 6);
  assert.ok(filled.sections.reduce((sum, section) => sum + section.wordCount, 0) >= 4500);
  const validation = validateLessonSpec(filled, { mode: 'full' });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
});

test('TemplateProvider：填充 90 分钟后通过 full 校验', () => {
  const provider = createTemplateProvider();
  const spec = makeSpec('函数求导', 90);
  const result = provider.fill(spec);
  assert.equal(result.ok, true, result.message);
  const filled = result.spec;
  assert.equal(filled.examples.length, 3);
  assert.equal(filled.interactions.length, 5);
  assert.equal(filled.exercises.length, 12);
  assert.ok(filled.sections.reduce((sum, section) => sum + section.wordCount, 0) >= 9000);
  const validation = validateLessonSpec(filled, { mode: 'full' });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
});

test('TemplateProvider：缺少内容包时返回 TEMPLATE_MISSING', () => {
  const provider = createTemplateProvider();
  const spec = makeSpec('矩阵的秩', 60);
  const result = provider.fill(spec);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'TEMPLATE_MISSING');
});

test('TemplateProvider：内容包缺节时返回 TEMPLATE_INCOMPLETE', () => {
  const provider = createTemplateProvider({
    packs: [
      {
        id: 'broken',
        topic: '函数求导',
        durationMinutes: 60,
        sections: {},
        examples: [],
        interactions: [],
        exercises: []
      }
    ]
  });
  const spec = makeSpec();
  const result = provider.fill(spec);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'TEMPLATE_INCOMPLETE');
});

test('TemplateProvider：list 报告可用内容包', () => {
  const list = createTemplateProvider().list();
  assert.ok(list.some((item) => item.topic === '函数求导' && item.durationMinutes === 60));
});
