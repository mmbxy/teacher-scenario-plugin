'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  allocateTimeline,
  createLessonSpec,
  validateLessonSpec,
  SUPPORTED_DURATIONS,
  MIN_MINUTES
} = require('../src/kit');

const FIXED_NOW = Date.parse('2026-11-10T02:00:00Z');
const fixturePath = path.join(__dirname, 'fixtures', 'function-derivative-60.spec.json');

function loadFixture() {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeSpec(overrides) {
  const result = createLessonSpec(
    {
      topic: '函数求导',
      durationMinutes: 60,
      exerciseCount: 8,
      ...(overrides || {})
    },
    { now: () => FIXED_NOW }
  );
  assert.equal(result.ok, true, result.message);
  return result.spec;
}

test('时间轴：45/60/90 合计精确，首尾相接，每节 ≥3 分钟', () => {
  for (const duration of SUPPORTED_DURATIONS) {
    const result = allocateTimeline({ durationMinutes: duration });
    assert.equal(result.ok, true);
    assert.equal(result.timeline.length, 7);
    assert.equal(result.timeline.reduce((sum, slot) => sum + slot.durationMinutes, 0), duration);

    let cursor = 0;
    for (const slot of result.timeline) {
      assert.equal(slot.startMinute, cursor);
      assert.equal(slot.endMinute, cursor + slot.durationMinutes);
      assert.ok(slot.durationMinutes >= MIN_MINUTES, `${duration} 分钟：${slot.id} 低于 3 分钟`);
      cursor = slot.endMinute;
    }
    assert.equal(cursor, duration);
  }
});

test('时间轴：重点加权后总时长不变，且命中环节被标记', () => {
  const base = allocateTimeline({ durationMinutes: 60 });
  const weighted = allocateTimeline({ durationMinutes: 60, keyPoints: ['概念', '例题'] });
  assert.equal(weighted.ok, true);
  assert.equal(weighted.timeline.reduce((sum, slot) => sum + slot.durationMinutes, 0), 60);

  const concept = weighted.timeline.find((slot) => slot.kind === 'concept');
  const example = weighted.timeline.find((slot) => slot.kind === 'example');
  assert.equal(concept.isKeyPoint, true);
  assert.equal(example.isKeyPoint, true);
  assert.ok(concept.durationMinutes >= base.timeline.find((slot) => slot.kind === 'concept').durationMinutes);
});

test('LessonSpec：45 分钟档生成至少 3 个互动（D23）', () => {
  const result = createLessonSpec({ topic: '函数求导', durationMinutes: 45 }, { now: () => FIXED_NOW });
  assert.equal(result.ok, true);
  assert.equal(result.spec.interactions.length, 3);
  assert.equal(validateLessonSpec(result.spec).ok, true);
});

test('时间轴：不支持的长度返回 INVALID_DURATION', () => {
  for (const duration of [30, 0, -45, 120, 59.5, '60']) {
    const result = allocateTimeline({ durationMinutes: duration });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_DURATION');
  }
});

test('LessonSpec：同一输入与同一时钟生成完全一致的结构', () => {
  const first = makeSpec();
  const second = makeSpec();
  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.meta.durationMinutes, 60);
  assert.equal(first.timeline.length, first.sections.length);
});

test('LessonSpec：结构模式通过内置校验', () => {
  const spec = makeSpec();
  const result = validateLessonSpec(spec);
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
});

test('fixture：函数求导 60 分钟结构通过校验', () => {
  const spec = loadFixture();
  const result = validateLessonSpec(spec);
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  assert.equal(spec.meta.durationMinutes, 60);
  assert.equal(spec.exercises.length >= 8, true);
});

test('V1：时间轴被篡改时报告 V1_TIMELINE_SUM', () => {
  const spec = clone(loadFixture());
  spec.timeline[0].durationMinutes += 1;
  spec.timeline[0].endMinute += 1;
  const result = validateLessonSpec(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'V1_TIMELINE_SUM'));
});

test('V4：例题不足时报告 V4_EXAMPLES_INSUFFICIENT', () => {
  const spec = clone(loadFixture());
  spec.examples = spec.examples.slice(0, 1);
  const result = validateLessonSpec(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'V4_EXAMPLES_INSUFFICIENT'));
});

test('V5：互动不足时报告 V5_INTERACTIONS_INSUFFICIENT', () => {
  const spec = clone(loadFixture());
  spec.interactions = spec.interactions.slice(0, 1);
  const result = validateLessonSpec(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'V5_INTERACTIONS_INSUFFICIENT'));
});

test('V6：习题不足时报告 V6_EXERCISES_INSUFFICIENT', () => {
  const spec = clone(loadFixture());
  spec.exercises = spec.exercises.slice(0, 5);
  const result = validateLessonSpec(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'V6_EXERCISES_INSUFFICIENT'));
});

test('V6：题量 ≥2 但只有一种题型时报告错误', () => {
  const spec = clone(loadFixture());
  spec.exercises = spec.exercises.map((item) => ({ ...item, type: '计算题' }));
  const result = validateLessonSpec(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'V6_EXERCISES_INVALID' && /2 种题型/.test(error.message)));
});

test('V8：分节 id 重复时报告 V8_DUPLICATE_ID', () => {
  const spec = clone(loadFixture());
  spec.sections[1].id = spec.sections[0].id;
  const result = validateLessonSpec(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'V8_DUPLICATE_ID'));
});

test('V9：降级但无 warning 时报告错误', () => {
  const spec = clone(loadFixture());
  spec.quality.degraded = true;
  spec.quality.warnings = [];
  const result = validateLessonSpec(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'V9_DEGRADED_WITHOUT_WARNING'));
});

test('schemaVersion 不是 1 时报告 SPEC_VERSION_INVALID', () => {
  const spec = clone(loadFixture());
  spec.schemaVersion = 2;
  const result = validateLessonSpec(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'SPEC_VERSION_INVALID'));
});

test('目标数量少于 3 时报告 V7_OBJECTIVES_INVALID', () => {
  const spec = clone(loadFixture());
  spec.objectives = spec.objectives.slice(0, 2);
  const result = validateLessonSpec(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'V7_OBJECTIVES_INVALID'));
});

test('full 模式：字数/页数/覆盖满足时通过', () => {
  const spec = clone(loadFixture());
  spec.sections = spec.sections.map((section) => ({
    ...section,
    wordCount: 1000,
    content: `本节讲${spec.objectives.map((item) => item.keywords.join(' ')).join(' ')}。`
  }));
  spec.deckPages = 28;
  spec.exercises = spec.exercises.map((item) => ({
    ...item,
    explanation: `${item.explanation} 涉及 ${spec.objectives.map((objective) => objective.keywords.join(' ')).join(' ')}。`
  }));
  const result = validateLessonSpec(spec, { mode: 'full' });
  assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
});

test('full 模式：字数不足报告 V2_WORD_COUNT_LOW', () => {
  const spec = clone(loadFixture());
  spec.sections = spec.sections.map((section) => ({ ...section, wordCount: 0 }));
  spec.deckPages = 28;
  const result = validateLessonSpec(spec, { mode: 'full' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'V2_WORD_COUNT_LOW'));
});

test('full 模式：课件页数不足报告 V3_DECK_PAGES_LOW', () => {
  const spec = clone(loadFixture());
  spec.sections = spec.sections.map((section) => ({ ...section, wordCount: 1000 }));
  spec.deckPages = 10;
  const result = validateLessonSpec(spec, { mode: 'full' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'V3_DECK_PAGES_LOW'));
});

test('full 模式：目标关键词未覆盖时报告 V7_COVERAGE_MISSING', () => {
  const spec = clone(loadFixture());
  spec.sections = spec.sections.map((section) => ({ ...section, wordCount: 1000, content: '无关键词正文' }));
  spec.deckPages = 28;
  spec.objectives[0].keywords = ['不存在的关键词'];
  const result = validateLessonSpec(spec, { mode: 'full' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'V7_COVERAGE_MISSING'));
});

test('参数契约：exerciseCount 越界/非整数返回 INVALID_EXERCISE_COUNT', () => {
  for (const value of [0, 21, 3.5, '6', null]) {
    const result = createLessonSpec({ topic: '函数求导', durationMinutes: 60, exerciseCount: value }, { now: () => FIXED_NOW });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_EXERCISE_COUNT');
  }
});

test('参数契约：教学模式与学情层次只接受枚举', () => {
  const mode = createLessonSpec({ topic: '函数求导', durationMinutes: 60, teachingMode: '讨论' }, { now: () => FIXED_NOW });
  assert.equal(mode.ok, false);
  assert.equal(mode.code, 'INVALID_TEACHING_MODE');

  const level = createLessonSpec({ topic: '函数求导', durationMinutes: 60, courseLevel: '小学' }, { now: () => FIXED_NOW });
  assert.equal(level.ok, false);
  assert.equal(level.code, 'INVALID_COURSE_LEVEL');
});

test('参数契约：知识点超过 2000 字返回 INVALID_TOPIC', () => {
  const result = createLessonSpec({ topic: '导'.repeat(2001), durationMinutes: 60 }, { now: () => FIXED_NOW });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_TOPIC');
});

test('参数契约：durationMinutes 为字符串时返回 INVALID_DURATION', () => {
  const result = createLessonSpec({ topic: '函数求导', durationMinutes: '60' }, { now: () => FIXED_NOW });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_DURATION');
});

test('时间轴：环节 kind 顺序错误时报告 V1', () => {
  const spec = clone(loadFixture());
  spec.timeline[0].kind = 'concept';
  const result = validateLessonSpec(spec);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === 'V1_TIMELINE_INVALID'));
});

test('时间轴：未匹配的 keyPoint 产生 warning，不阻断生成', () => {
  const result = allocateTimeline({ durationMinutes: 60, keyPoints: ['不存在的环节'] });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /没有匹配/);
});
