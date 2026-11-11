'use strict';

/**
 * LessonSpec 校验器（V1–V9）。
 *
 * 两种模式：
 *  - structure：第 1 步使用，只校验结构、数量、引用，不要求正文。
 *  - full：第 2 步之后使用，额外校验字数、课件页数、目标覆盖。
 */

const { MIN_MINUTES, SUPPORTED_DURATIONS, KINDS } = require('./timeline');
const { EXERCISE_LEVELS } = require('./spec');

const MIN_EXAMPLES = Object.freeze({ 45: 2, 60: 2, 90: 3 });
const MIN_INTERACTIONS = Object.freeze({ 45: 3, 60: 3, 90: 5 });
const MIN_EXERCISES = Object.freeze({ 45: 6, 60: 8, 90: 12 });
const MIN_DECK_PAGES = Object.freeze({ 45: 20, 60: 25, 90: 35 });
const WORDS_PER_MINUTE = 100;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function push(errors, code, path, message) {
  errors.push({ code, path, message });
}

function validateTimeline(spec, errors) {
  const timeline = spec.timeline;
  if (!Array.isArray(timeline) || timeline.length === 0) {
    push(errors, 'V1_TIMELINE_INVALID', 'timeline', '时间轴必须是非空数组。');
    return;
  }
  if (timeline.length !== KINDS.length) {
    push(errors, 'V1_TIMELINE_INVALID', 'timeline', `时间轴应有 ${KINDS.length} 个环节，当前 ${timeline.length} 个。`);
  }

  const ids = new Set();
  let expectedStart = 0;
  let sum = 0;

  timeline.forEach((slot, index) => {
    const path = `timeline[${index}]`;
    if (!slot || typeof slot !== 'object') {
      push(errors, 'V1_TIMELINE_INVALID', path, '环节必须是对象。');
      return;
    }
    if (!isNonEmptyString(slot.id)) push(errors, 'V1_TIMELINE_INVALID', `${path}.id`, '环节 id 不能为空。');
    if (ids.has(slot.id)) push(errors, 'V8_DUPLICATE_ID', `${path}.id`, `环节 id 重复：${slot.id}`);
    ids.add(slot.id);

    if (KINDS[index] && slot.kind !== KINDS[index].kind) {
      push(errors, 'V1_TIMELINE_INVALID', `${path}.kind`, `第 ${index + 1} 个环节应为 ${KINDS[index].kind}。`);
    }

    if (!Number.isInteger(slot.durationMinutes) || slot.durationMinutes < MIN_MINUTES) {
      push(errors, 'V1_TIMELINE_INVALID', `${path}.durationMinutes`, `环节时长必须是 ≥${MIN_MINUTES} 的整数。`);
    }
    if (slot.startMinute !== expectedStart) {
      push(errors, 'V1_TIMELINE_INVALID', `${path}.startMinute`, `环节必须首尾相接，期望从 ${expectedStart} 开始。`);
    }
    if (!Number.isInteger(slot.endMinute) || slot.endMinute - slot.startMinute !== slot.durationMinutes) {
      push(errors, 'V1_TIMELINE_INVALID', `${path}.endMinute`, '环节结束时间必须等于开始 + 时长。');
    }
    expectedStart = slot.endMinute;
    sum += Number.isInteger(slot.durationMinutes) ? slot.durationMinutes : 0;
  });

  const duration = spec.meta && spec.meta.durationMinutes;
  if (sum !== duration) {
    push(errors, 'V1_TIMELINE_SUM', 'timeline', `时间轴合计 ${sum} 分钟，与请求时长 ${duration} 不一致。`);
  }
}

function validateObjectives(spec, errors) {
  const objectives = spec.objectives;
  if (!Array.isArray(objectives) || objectives.length < 3 || objectives.length > 5) {
    push(errors, 'V7_OBJECTIVES_INVALID', 'objectives', '学习目标数量必须是 3–5 条。');
    return;
  }
  const ids = new Set();
  objectives.forEach((item, index) => {
    const path = `objectives[${index}]`;
    if (!item || typeof item !== 'object') {
      push(errors, 'V7_OBJECTIVES_INVALID', path, '目标必须是对象。');
      return;
    }
    if (!isNonEmptyString(item.id)) push(errors, 'V7_OBJECTIVES_INVALID', `${path}.id`, '目标 id 不能为空。');
    if (ids.has(item.id)) push(errors, 'V8_DUPLICATE_ID', `${path}.id`, `目标 id 重复：${item.id}`);
    ids.add(item.id);
    if (!isNonEmptyString(item.text)) push(errors, 'V7_OBJECTIVES_INVALID', `${path}.text`, '目标文本不能为空。');
    if (!Array.isArray(item.keywords) || item.keywords.length === 0) {
      push(errors, 'V7_OBJECTIVES_INVALID', `${path}.keywords`, '目标必须带至少 1 个关键词。');
    }
  });
}

function validateSections(spec, errors) {
  const sections = spec.sections;
  const timeline = Array.isArray(spec.timeline) ? spec.timeline : [];
  if (!Array.isArray(sections) || sections.length !== timeline.length) {
    push(errors, 'V8_SECTION_TIMELINE_MISMATCH', 'sections', '分节数量必须与时间轴环节数量一致。');
    return;
  }
  const ids = new Set();
  const slotIds = new Set(timeline.map((slot) => slot.id));

  sections.forEach((section, index) => {
    const path = `sections[${index}]`;
    if (!section || typeof section !== 'object') {
      push(errors, 'V8_SECTION_INVALID', path, '分节必须是对象。');
      return;
    }
    if (!isNonEmptyString(section.id)) push(errors, 'V8_SECTION_INVALID', `${path}.id`, '分节 id 不能为空。');
    if (ids.has(section.id)) push(errors, 'V8_DUPLICATE_ID', `${path}.id`, `分节 id 重复：${section.id}`);
    ids.add(section.id);
    if (!slotIds.has(section.timelineId)) {
      push(errors, 'V8_SECTION_INVALID', `${path}.timelineId`, `分节引用了不存在的时间轴环节：${section.timelineId}`);
    } else {
      const slot = timeline.find((item) => item.id === section.timelineId);
      if (slot && slot.kind !== section.kind) {
        push(errors, 'V8_SECTION_INVALID', `${path}.kind`, '分节 kind 必须与时间轴环节一致。');
      }
    }
    if (!isNonEmptyString(section.title)) push(errors, 'V8_SECTION_INVALID', `${path}.title`, '分节标题不能为空。');
  });
}

function validateExamples(spec, errors) {
  const duration = (spec.meta && spec.meta.durationMinutes) || 0;
  const minimum = MIN_EXAMPLES[duration] || 2;
  if (!Array.isArray(spec.examples) || spec.examples.length < minimum) {
    push(errors, 'V4_EXAMPLES_INSUFFICIENT', 'examples', `例题至少 ${minimum} 道。`);
    return;
  }
  spec.examples.forEach((item, index) => {
    const path = `examples[${index}]`;
    if (!isNonEmptyString(item.problem)) push(errors, 'V4_EXAMPLES_INVALID', `${path}.problem`, '例题题干不能为空。');
    if (!Array.isArray(item.steps) || item.steps.length < 2) {
      push(errors, 'V4_EXAMPLES_INVALID', `${path}.steps`, '例题至少需要 2 个步骤。');
    }
    if (!Array.isArray(item.pitfalls) || item.pitfalls.length === 0) {
      push(errors, 'V4_EXAMPLES_INVALID', `${path}.pitfalls`, '例题至少需要 1 个易错点。');
    }
  });
}

function validateInteractions(spec, errors) {
  const duration = (spec.meta && spec.meta.durationMinutes) || 0;
  const minimum = MIN_INTERACTIONS[duration] || 2;
  if (!Array.isArray(spec.interactions) || spec.interactions.length < minimum) {
    push(errors, 'V5_INTERACTIONS_INSUFFICIENT', 'interactions', `互动点至少 ${minimum} 个。`);
    return;
  }
  spec.interactions.forEach((item, index) => {
    const path = `interactions[${index}]`;
    if (!isNonEmptyString(item.prompt)) push(errors, 'V5_INTERACTIONS_INVALID', `${path}.prompt`, '互动问题不能为空。');
    if (!Array.isArray(item.expectedWrong) || item.expectedWrong.length === 0) {
      push(errors, 'V5_INTERACTIONS_INVALID', `${path}.expectedWrong`, '互动必须包含预设错误回答。');
    }
    if (!isNonEmptyString(item.correction)) {
      push(errors, 'V5_INTERACTIONS_INVALID', `${path}.correction`, '互动必须包含纠正话术。');
    }
  });
}

function validateExercises(spec, errors) {
  const duration = (spec.meta && spec.meta.durationMinutes) || 0;
  const minimum = MIN_EXERCISES[duration] || 6;
  if (!Array.isArray(spec.exercises) || spec.exercises.length < minimum) {
    push(errors, 'V6_EXERCISES_INSUFFICIENT', 'exercises', `习题至少 ${minimum} 道。`);
    return;
  }

  const levels = new Set();
  const types = new Set();
  const ids = new Set();

  spec.exercises.forEach((item, index) => {
    const path = `exercises[${index}]`;
    if (!isNonEmptyString(item.id)) push(errors, 'V6_EXERCISES_INVALID', `${path}.id`, '习题 id 不能为空。');
    if (ids.has(item.id)) push(errors, 'V8_DUPLICATE_ID', `${path}.id`, `习题 id 重复：${item.id}`);
    ids.add(item.id);

    if (!EXERCISE_LEVELS.includes(item.level)) {
      push(errors, 'V6_EXERCISES_INVALID', `${path}.level`, `习题层级必须是：${EXERCISE_LEVELS.join(' / ')}。`);
    } else {
      levels.add(item.level);
    }
    if (!isNonEmptyString(item.type)) push(errors, 'V6_EXERCISES_INVALID', `${path}.type`, '习题类型不能为空。');
    else types.add(item.type);
    if (!isNonEmptyString(item.prompt)) push(errors, 'V6_EXERCISES_INVALID', `${path}.prompt`, '习题题干不能为空。');
    if (!isNonEmptyString(item.answer)) push(errors, 'V6_EXERCISES_INVALID', `${path}.answer`, '习题答案不能为空。');
    if (!isNonEmptyString(item.explanation)) {
      push(errors, 'V6_EXERCISES_INVALID', `${path}.explanation`, '习题解析不能为空。');
    }
  });

  if (spec.exercises.length >= 3 && levels.size < 3) {
    push(errors, 'V6_EXERCISES_INVALID', 'exercises', '习题必须覆盖基础 / 提高 / 拓展三层。');
  }
  if (spec.exercises.length >= 2 && types.size < 2) {
    push(errors, 'V6_EXERCISES_INVALID', 'exercises', '题量 ≥2 时至少需要 2 种题型。');
  }
}

function validateQuality(spec, errors) {
  if (!spec.quality || typeof spec.quality !== 'object') {
    push(errors, 'V9_QUALITY_INVALID', 'quality', 'quality 必须是对象。');
    return;
  }
  if (spec.quality.degraded === true && (!Array.isArray(spec.quality.warnings) || spec.quality.warnings.length === 0)) {
    push(errors, 'V9_DEGRADED_WITHOUT_WARNING', 'quality.warnings', '降级状态必须附带 warnings。');
  }
}

function validateFullContent(spec, errors) {
  const duration = (spec.meta && spec.meta.durationMinutes) || 0;
  const sections = Array.isArray(spec.sections) ? spec.sections : [];
  const words = sections.reduce((sum, section) => sum + (Number.isInteger(section.wordCount) ? section.wordCount : 0), 0);
  const minWords = duration * WORDS_PER_MINUTE;
  if (words < minWords) {
    push(errors, 'V2_WORD_COUNT_LOW', 'sections', `讲稿字数 ${words}，低于 ${minWords}（${WORDS_PER_MINUTE} 字/分钟）。`);
  }

  const minPages = MIN_DECK_PAGES[duration] || 25;
  if (!Number.isInteger(spec.deckPages) || spec.deckPages < minPages) {
    push(errors, 'V3_DECK_PAGES_LOW', 'deckPages', `课件页数 ${spec.deckPages}，低于 ${minPages}。`);
  }

  const exercisesText = (Array.isArray(spec.exercises) ? spec.exercises : [])
    .map((item) => `${item.prompt || ''} ${item.answer || ''} ${item.explanation || ''}`)
    .join(' ');

  (Array.isArray(spec.objectives) ? spec.objectives : []).forEach((objective, index) => {
    const wordsToFind = Array.isArray(objective.keywords) ? objective.keywords : [];
    const sectionText = sections
      .map((section) => `${section.title || ''} ${(section.keyPoints || []).join(' ')} ${section.content || ''}`)
      .join(' ');
    wordsToFind.forEach((keyword) => {
      if (!sectionText.includes(keyword)) {
        push(errors, 'V7_COVERAGE_MISSING', `objectives[${index}]`, `关键词「${keyword}」没有出现在任何分节中。`);
      }
      if (!exercisesText.includes(keyword)) {
        push(errors, 'V7_COVERAGE_MISSING', `objectives[${index}]`, `关键词「${keyword}」没有出现在任何习题中。`);
      }
    });
  });
}

/**
 * @param {object} spec
 * @param {{mode?:'structure'|'full'}} [options]
 * @returns {{ok:boolean, mode:string, errors:object[]}}
 */
function validateLessonSpec(spec, options = {}) {
  const mode = options.mode === 'full' ? 'full' : 'structure';
  const errors = [];

  if (!spec || typeof spec !== 'object') {
    return { ok: false, mode, errors: [{ code: 'SPEC_INVALID', path: '', message: 'LessonSpec 必须是对象。' }] };
  }
  if (spec.schemaVersion !== 1) {
    push(errors, 'SPEC_VERSION_INVALID', 'schemaVersion', 'schemaVersion 必须为 1。');
  }
  if (!spec.meta || typeof spec.meta !== 'object') {
    push(errors, 'SPEC_META_INVALID', 'meta', 'meta 必须是对象。');
  } else {
    if (!isNonEmptyString(spec.meta.topic)) push(errors, 'SPEC_META_INVALID', 'meta.topic', 'meta.topic 不能为空。');
    if (!SUPPORTED_DURATIONS.includes(spec.meta.durationMinutes)) {
      push(errors, 'SPEC_META_INVALID', 'meta.durationMinutes', 'meta.durationMinutes 必须是 45 / 60 / 90。');
    }
    if (!isNonEmptyString(spec.meta.generatedAt)) {
      push(errors, 'SPEC_META_INVALID', 'meta.generatedAt', 'meta.generatedAt 不能为空。');
    }
  }

  validateObjectives(spec, errors);
  validateTimeline(spec, errors);
  validateSections(spec, errors);
  validateExamples(spec, errors);
  validateInteractions(spec, errors);
  validateExercises(spec, errors);
  validateQuality(spec, errors);

  if (mode === 'full') validateFullContent(spec, errors);

  return { ok: errors.length === 0, mode, errors };
}

module.exports = {
  validateLessonSpec,
  MIN_EXAMPLES,
  MIN_INTERACTIONS,
  MIN_EXERCISES,
  MIN_DECK_PAGES,
  WORDS_PER_MINUTE
};
