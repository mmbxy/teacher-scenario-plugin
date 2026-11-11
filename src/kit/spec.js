'use strict';

/**
 * LessonSpec 构建器（纯函数）。
 *
 * 第 1 步只负责“结构”：目标、时间轴、分节、例题/互动/作业的占位、
 * 板书与质量标记。正文内容由第 2 步的模板 Provider 填充。
 */

const { allocateTimeline, SUPPORTED_DURATIONS } = require('./timeline');

const SCHEMA_VERSION = 1;
const TOPIC_MAX_LENGTH = 2000;
const EXERCISE_MIN = 1;
const EXERCISE_MAX = 20;
const TEACHING_MODES = Object.freeze(['讲授', '研讨', '翻转']);
const COURSE_LEVELS = Object.freeze(['本科基础', '专业核心', '研究生']);

const DEFAULT_META = Object.freeze({
  teachingMode: '讲授',
  courseLevel: '本科基础',
  audience: '本科一年级',
  contentSource: 'template',
  locale: 'zh-CN'
});

const EXERCISE_TYPES = Object.freeze(['计算题', '概念题', '应用题', '判断题', '综合题']);
const EXERCISE_LEVELS = Object.freeze(['基础', '提高', '拓展']);

function slugForTopic(topic) {
  const cleaned = Array.from(topic)
    .slice(0, 16)
    .join('')
    .replace(/[\\/:*?"<>|\s，。！？、；：（）【】《》]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'lesson';
}

function lessonStamp(now) {
  return new Date(now).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function defaultObjectives(topic) {
  return [
    { id: 'O1', text: `能复述「${topic}」的定义，并标出至少 2 个关键词。`, keywords: [topic, '定义'] },
    { id: 'O2', text: `能列出「${topic}」的成立条件，并说明缺少条件时的反例。`, keywords: [topic, '条件'] },
    { id: 'O3', text: `能完成「${topic}」的基础计算或判断。`, keywords: [topic, '计算'] },
    { id: 'O4', text: `能识别「${topic}」的常见错误。`, keywords: [topic, '错误'] }
  ];
}

function buildExamples(durationMinutes) {
  const count = durationMinutes === 90 ? 3 : 2;
  return Array.from({ length: count }, (_, index) => ({
    id: `EX${index + 1}`,
    title: `例 ${index + 1}`,
    problem: `（待内容生成）第 ${index + 1} 道例题题干。`,
    steps: ['步骤 1（待内容生成）', '步骤 2（待内容生成）'],
    pitfalls: ['（待内容生成）常见错误'],
    variant: '（待内容生成）变式题'
  }));
}

function buildInteractions(durationMinutes) {
  const count = durationMinutes === 90 ? 5 : durationMinutes === 60 ? 3 : 2;
  return Array.from({ length: count }, (_, index) => ({
    id: `IN${index + 1}`,
    prompt: `（待内容生成）互动问题 ${index + 1}`,
    expectedWrong: ['（待内容生成）预设错误回答'],
    correction: '（待内容生成）纠正话术',
    minutes: 4
  }));
}

function buildExercises(durationMinutes, requestedCount) {
  const minimum = durationMinutes === 90 ? 12 : durationMinutes === 60 ? 8 : 6;
  const count = Math.max(minimum, requestedCount);
  const basic = Math.ceil(count * 0.5);
  const medium = Math.ceil(count * 0.3);

  return Array.from({ length: count }, (_, index) => {
    const level =
      index < basic ? EXERCISE_LEVELS[0] : index < basic + medium ? EXERCISE_LEVELS[1] : EXERCISE_LEVELS[2];
    return {
      id: `Q${index + 1}`,
      level,
      type: EXERCISE_TYPES[index % EXERCISE_TYPES.length],
      prompt: `（待内容生成）第 ${index + 1} 题题干。`,
      answer: '（待内容生成）答案',
      explanation: '（待内容生成）解析'
    };
  });
}

/**
 * @param {{topic:string, durationMinutes?:number, teachingMode?:string, courseLevel?:string,
 *          audience?:string, textbook?:string, keyPoints?:string[], exerciseCount?:number}} input
 * @param {{now?:()=>number, objectives?:object[]}} [deps]
 */
function createLessonSpec(input, deps = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const topic = typeof source.topic === 'string' ? source.topic.trim() : '';
  if (topic.length === 0) {
    return {
      ok: false,
      code: 'INVALID_TOPIC',
      message: '知识点（topic）不能为空。',
      detail: 'topic.length=0'
    };
  }
  if (Array.from(topic).length > TOPIC_MAX_LENGTH) {
    return {
      ok: false,
      code: 'INVALID_TOPIC',
      message: `知识点最多 ${TOPIC_MAX_LENGTH} 字。`,
      detail: `topic.length=${Array.from(topic).length}`
    };
  }

  if (source.teachingMode !== undefined && !TEACHING_MODES.includes(source.teachingMode)) {
    return {
      ok: false,
      code: 'INVALID_TEACHING_MODE',
      message: `教学模式只能是：${TEACHING_MODES.join(' / ')}。`,
      detail: `teachingMode=${JSON.stringify(source.teachingMode)}`
    };
  }
  if (source.courseLevel !== undefined && !COURSE_LEVELS.includes(source.courseLevel)) {
    return {
      ok: false,
      code: 'INVALID_COURSE_LEVEL',
      message: `学情层次只能是：${COURSE_LEVELS.join(' / ')}。`,
      detail: `courseLevel=${JSON.stringify(source.courseLevel)}`
    };
  }

  const durationMinutes = source.durationMinutes === undefined ? 45 : source.durationMinutes;
  if (!SUPPORTED_DURATIONS.includes(durationMinutes)) {
    return {
      ok: false,
      code: 'INVALID_DURATION',
      message: `课时长度只支持 ${SUPPORTED_DURATIONS.join(' / ')} 分钟，当前为 ${JSON.stringify(durationMinutes)}。`,
      detail: `durationMinutes=${JSON.stringify(durationMinutes)}`
    };
  }

  const exerciseCount = source.exerciseCount === undefined ? 8 : source.exerciseCount;
  if (
    typeof exerciseCount !== 'number' ||
    !Number.isInteger(exerciseCount) ||
    exerciseCount < EXERCISE_MIN ||
    exerciseCount > EXERCISE_MAX
  ) {
    return {
      ok: false,
      code: 'INVALID_EXERCISE_COUNT',
      message: `习题数量必须是 ${EXERCISE_MIN}–${EXERCISE_MAX} 的整数。`,
      detail: `exerciseCount=${JSON.stringify(source.exerciseCount)}`
    };
  }

  const timelineResult = allocateTimeline({ durationMinutes, keyPoints: source.keyPoints || [] });
  if (!timelineResult.ok) return timelineResult;

  const now = typeof deps.now === 'function' ? deps.now() : Date.now();
  const objectives = Array.isArray(deps.objectives) && deps.objectives.length > 0
    ? deps.objectives
    : defaultObjectives(topic);
  const warnings = timelineResult.warnings.slice();

  const sections = timelineResult.timeline.map((slot, index) => ({
    id: `S${index + 1}`,
    timelineId: slot.id,
    kind: slot.kind,
    title: slot.title,
    keyPoints: [],
    content: '',
    wordCount: 0
  }));

  const spec = {
    schemaVersion: SCHEMA_VERSION,
    lessonId: `${slugForTopic(topic)}-${lessonStamp(now)}`,
    meta: {
      topic,
      durationMinutes,
      teachingMode: source.teachingMode || DEFAULT_META.teachingMode,
      courseLevel: source.courseLevel || DEFAULT_META.courseLevel,
      audience: source.audience || DEFAULT_META.audience,
      textbook: typeof source.textbook === 'string' ? source.textbook : '',
      keyPoints: Array.isArray(source.keyPoints) ? source.keyPoints.slice() : [],
      generatedAt: new Date(now).toISOString(),
      contentSource: DEFAULT_META.contentSource,
      locale: DEFAULT_META.locale
    },
    objectives,
    timeline: timelineResult.timeline,
    sections,
    examples: buildExamples(durationMinutes),
    interactions: buildInteractions(durationMinutes),
    exercises: buildExercises(durationMinutes, exerciseCount),
    boardPlan: {
      zones: ['定义区', '例题区', '易错清单'],
      keySentences: ['（待内容生成）关键板书句'],
      eraseStrategy: '定义与法则保留到下课；导入推导讲完可擦。'
    },
    deckPages: 0,
    quality: {
      warnings,
      degraded: false,
      sources: [],
      checks: {}
    }
  };

  return { ok: true, spec, warnings };
}

module.exports = {
  SCHEMA_VERSION,
  TOPIC_MAX_LENGTH,
  EXERCISE_MIN,
  EXERCISE_MAX,
  TEACHING_MODES,
  COURSE_LEVELS,
  EXERCISE_TYPES,
  EXERCISE_LEVELS,
  createLessonSpec
};
