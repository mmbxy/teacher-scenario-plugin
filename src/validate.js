'use strict';

/**
 * 入参校验（纯函数，仅依赖普通 JS）。
 * 契约来源：需求说明 3.3 的入参表。
 *
 * 返回：
 *   { ok: true, value: NormalizedInput }
 *   { ok: false, code: 'INVALID_INPUT', message, retryable: false, detail }
 *
 * detail 使用 `字段=值` 形式，便于日志与测试定位到具体参数。
 */

const DEFAULT_AUDIENCE = '本科一年级';
const DEFAULT_DIFFICULTY = '基础';
const DEFAULT_EXERCISE_COUNT = 6;

const DIFFICULTIES = Object.freeze(['基础', '进阶', '挑战']);
const TOPIC_MAX_LENGTH = 2000;
const EXERCISE_MIN = 1;
const EXERCISE_MAX = 20;

const FIELD_LABELS = Object.freeze({
  topic: '知识点',
  audience: '教学对象',
  difficulty: '难度',
  exerciseCount: '习题数量',
  withInteractive: '是否生成讲解页',
  withHandout: '是否生成讲义',
  withExercises: '是否生成练习题'
});

function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function invalid(field, message, detail) {
  return {
    ok: false,
    code: 'INVALID_INPUT',
    message,
    retryable: false,
    detail
  };
}

function countChars(text) {
  return Array.from(text).length;
}

function validateTopic(raw) {
  if (raw === undefined || raw === null) {
    return invalid('topic', '知识点（topic）为必填项，请输入 1–2000 字的文本。', 'topic=undefined');
  }
  if (typeof raw !== 'string') {
    return invalid(
      'topic',
      `知识点（topic）必须是文本，当前类型为 ${describeType(raw)}。`,
      `topic.type=${describeType(raw)}`
    );
  }
  const topic = raw.trim();
  if (topic.length === 0) {
    return invalid('topic', '知识点不能为空，请输入 1–2000 字的文本。', 'topic.length=0');
  }
  const length = countChars(topic);
  if (length > TOPIC_MAX_LENGTH) {
    return invalid(
      'topic',
      `知识点最多 ${TOPIC_MAX_LENGTH} 字，当前 ${length} 字，请精简后重试。`,
      `topic.length=${length}`
    );
  }
  return { ok: true, value: topic };
}

function validateAudience(raw) {
  if (raw === undefined || raw === null) {
    return { ok: true, value: DEFAULT_AUDIENCE };
  }
  if (typeof raw !== 'string') {
    return invalid(
      'audience',
      `教学对象（audience）必须是文本，例如「本科一年级」，当前类型为 ${describeType(raw)}。`,
      `audience.type=${describeType(raw)}`
    );
  }
  const audience = raw.trim();
  if (audience.length === 0) {
    return invalid('audience', '教学对象（audience）不能为空，可省略以使用默认值「本科一年级」。', 'audience.length=0');
  }
  return { ok: true, value: audience };
}

function validateDifficulty(raw) {
  if (raw === undefined || raw === null) {
    return { ok: true, value: DEFAULT_DIFFICULTY };
  }
  if (typeof raw !== 'string' || !DIFFICULTIES.includes(raw)) {
    return invalid(
      'difficulty',
      `难度（difficulty）只能是「${DIFFICULTIES.join('」「')}」之一，当前为 ${JSON.stringify(raw)}。`,
      `difficulty=${JSON.stringify(raw)}`
    );
  }
  return { ok: true, value: raw };
}

function validateExerciseCount(raw) {
  if (raw === undefined || raw === null) {
    return { ok: true, value: DEFAULT_EXERCISE_COUNT };
  }
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return invalid(
      'exerciseCount',
      `习题数量（exerciseCount）必须是 ${EXERCISE_MIN}–${EXERCISE_MAX} 的整数，当前为 ${JSON.stringify(raw)}。`,
      `exerciseCount=${JSON.stringify(raw)}`
    );
  }
  if (raw < EXERCISE_MIN || raw > EXERCISE_MAX) {
    return invalid(
      'exerciseCount',
      `习题数量（exerciseCount）必须在 ${EXERCISE_MIN}–${EXERCISE_MAX} 之间，当前为 ${raw}。`,
      `exerciseCount=${raw}`
    );
  }
  return { ok: true, value: raw };
}

function validateBoolean(field, raw) {
  if (raw === undefined || raw === null) return { ok: true, value: true };
  if (typeof raw !== 'boolean') {
    return invalid(
      field,
      `${FIELD_LABELS[field]}（${field}）必须是布尔值 true 或 false，当前为 ${JSON.stringify(raw)}。`,
      `${field}=${JSON.stringify(raw)}`
    );
  }
  return { ok: true, value: raw };
}

/**
 * @param {unknown} input
 * @returns {{ok: boolean, value?: object, code?: string, message?: string, retryable?: boolean, detail?: string}}
 */
function validateInput(input) {
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return invalid(
      'input',
      '入参必须是一个对象，至少包含 topic 字段。',
      `input.type=${describeType(input)}`
    );
  }

  const checks = [
    validateTopic(input.topic),
    validateAudience(input.audience),
    validateDifficulty(input.difficulty),
    validateExerciseCount(input.exerciseCount),
    validateBoolean('withInteractive', input.withInteractive),
    validateBoolean('withHandout', input.withHandout),
    validateBoolean('withExercises', input.withExercises)
  ];

  const failed = checks.find((check) => !check.ok);
  if (failed) return failed;

  const withInteractive = checks[4].value;
  const withHandout = checks[5].value;
  const withExercises = checks[6].value;
  if (!withInteractive && !withHandout && !withExercises) {
    return invalid(
      'input',
      '讲解页、讲义、练习题至少要选择一种（withInteractive、withHandout、withExercises 不能同时为 false）。',
      'artifacts=none'
    );
  }

  return {
    ok: true,
    value: {
      topic: checks[0].value,
      audience: checks[1].value,
      difficulty: checks[2].value,
      exerciseCount: checks[3].value,
      withInteractive,
      withHandout,
      withExercises
    }
  };
}

module.exports = {
  validateInput,
  DEFAULT_AUDIENCE,
  DEFAULT_DIFFICULTY,
  DEFAULT_EXERCISE_COUNT,
  DIFFICULTIES,
  TOPIC_MAX_LENGTH,
  EXERCISE_MIN,
  EXERCISE_MAX
};
