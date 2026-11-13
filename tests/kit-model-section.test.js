'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLessonSpec } = require('../src/kit');
const template = require('../src/kit/providers/template');
const { applyModelSection } = require('../src/kit/model-section');

function buildFilledSpec() {
  const built = createLessonSpec({ topic: '函数求导', durationMinutes: 60 });
  assert.equal(built.ok, true);
  const filled = template.createTemplateProvider().fill(built.spec);
  assert.equal(filled.ok, true);
  return filled.spec;
}

function fakeModel(section, overrides = {}) {
  return {
    calls: 0,
    async generateSection() {
      this.calls += 1;
      if (overrides.fail) return { ok: false, degraded: true, attempts: 2, reason: '模型失败' };
      return {
        ok: true,
        degraded: false,
        aiDraft: true,
        attempts: 1,
        elapsedMs: 100,
        tokens: 200,
        source: { provider: 'p', model: 'm' },
        section: { ...section, aiDraft: true, source: { provider: 'p', model: 'm' } }
      };
    }
  };
}

const modelSection = {
  title: '函数求导的概念',
  keyPoints: ['导数是差商极限', '导数是切线斜率', '可导必连续'],
  content: '函数在一点处的导数是差商极限，表示曲线在该点切线的斜率。它刻画函数变化的快慢，是求导公式与运算法则的基础。',
  example: { statement: '求 f(x)=x^2 的导数。', answer: "f'(x)=2x。" }
};

test('单节接入：成功替换目标节并标记 aiDraft', async () => {
  const spec = buildFilledSpec();
  const result = await applyModelSection(spec, { sectionId: 'S2', modelProvider: fakeModel(modelSection) });
  assert.equal(result.ok, true);
  assert.equal(result.degraded, false);
  assert.equal(result.aiDraft, true);
  assert.equal(result.section.id, 'S2');
  assert.equal(result.section.content, modelSection.content);
  assert.equal(result.section.aiDraft, true);
  assert.equal(result.spec.meta.aiDraftSections.includes('S2'), true);
});

test('单节接入：模型失败时不修改原 spec', async () => {
  const spec = buildFilledSpec();
  const before = JSON.stringify(spec);
  const result = await applyModelSection(spec, { provider: 'p', model: 'm', modelProvider: fakeModel(modelSection, { fail: true }) });
  assert.equal(result.ok, false);
  assert.equal(result.degraded, true);
  assert.equal(JSON.stringify(spec), before);
});

test('单节接入：找不到分节返回降级', async () => {
  const spec = buildFilledSpec();
  const result = await applyModelSection(spec, { sectionId: 'S99', modelProvider: fakeModel(modelSection) });
  assert.equal(result.ok, false);
  assert.match(result.reason, /S99/);
});

test('单节接入：缺少 provider 与 modelProvider 返回降级', async () => {
  const spec = buildFilledSpec();
  const result = await applyModelSection(spec, {});
  assert.equal(result.ok, false);
  assert.match(result.reason, /modelProvider|llm/);
});

test('单节接入：只替换目标节，其他节保持模板内容', async () => {
  const spec = buildFilledSpec();
  const beforeOther = spec.sections.find((section) => section.id === 'S3').content;
  const result = await applyModelSection(spec, { sectionId: 'S2', modelProvider: fakeModel(modelSection) });
  assert.equal(result.ok, true);
  assert.equal(result.spec.sections.find((section) => section.id === 'S3').content, beforeOther);
});
