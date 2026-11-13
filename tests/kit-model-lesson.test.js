'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLessonSpec } = require('../src/kit');
const template = require('../src/kit/providers/template');
const { applyModelLesson } = require('../src/kit/model-lesson');

function buildFilledSpec() {
  const built = createLessonSpec({ topic: '函数求导', durationMinutes: 60 });
  assert.equal(built.ok, true);
  const filled = template.createTemplateProvider().fill(built.spec);
  assert.equal(filled.ok, true);
  return filled.spec;
}

function fakeLessonModel({ failSection = '', short = false } = {}) {
  return {
    calls: 0,
    async generateSection(input) {
      this.calls += 1;
      if (input.section === failSection) {
        return { ok: false, degraded: true, attempts: 2, reason: '模拟模型失败' };
      }
      const base = short
        ? '这一节内容太短，不能通过整包字数校验。'
        : `${input.section}的内容。幂函数、定义、条件、计算、错误都是本节要覆盖的关键词；导数是差商极限，表示切线斜率，也是函数变化快慢的度量。`.repeat(30);
      return {
        ok: true,
        degraded: false,
        aiDraft: true,
        attempts: 1,
        source: { provider: 'p', model: 'm' },
        section: {
          title: input.section,
          keyPoints: ['导数是极限', '导数是切线斜率', '可导必连续'],
          content: base,
          example: { statement: '求 f(x)=x^2 的导数。', answer: "f'(x)=2x。" },
          aiDraft: true,
          source: { provider: 'p', model: 'm' }
        }
      };
    }
  };
}

test('整包模型：7 节全部成功并通过 full 校验', async () => {
  const spec = buildFilledSpec();
  const model = fakeLessonModel();
  const result = await applyModelLesson(spec, { modelProvider: model });
  assert.equal(result.ok, true);
  assert.equal(result.degraded, false, result.reason);
  assert.equal(result.aiDraft, true);
  assert.equal(model.calls, 7);
  assert.equal(result.spec.sections.length, 7);
  assert.ok(result.words >= 6000);
  assert.equal(result.spec.meta.aiDraftSections.length, 7);
});

test('整包模型：任何一节失败则整包回退模板', async () => {
  const spec = buildFilledSpec();
  const before = JSON.stringify(spec);
  const result = await applyModelLesson(spec, { modelProvider: fakeLessonModel({ failSection: '推导' }) });
  assert.equal(result.ok, true);
  assert.equal(result.degraded, true);
  assert.equal(result.fallback, 'template');
  assert.equal(result.aiDraft, false);
  assert.equal(JSON.stringify(spec), before);
});

test('整包模型：full 校验失败也回退模板', async () => {
  const spec = buildFilledSpec();
  const result = await applyModelLesson(spec, { modelProvider: fakeLessonModel({ short: true }) });
  assert.equal(result.ok, true);
  assert.equal(result.degraded, true);
  assert.equal(result.fallback, 'template');
  assert.match(result.reason, /full 校验失败/);
});
