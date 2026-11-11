'use strict';

/** LessonSpec 模块入口：第 1 步对外只暴露这三件事。 */

const { createLessonSpec, SCHEMA_VERSION, EXERCISE_TYPES, EXERCISE_LEVELS } = require('./spec');
const { allocateTimeline, SUPPORTED_DURATIONS, MIN_MINUTES, KINDS } = require('./timeline');
const { validateLessonSpec } = require('./validate-spec');

module.exports = {
  SCHEMA_VERSION,
  EXERCISE_TYPES,
  EXERCISE_LEVELS,
  SUPPORTED_DURATIONS,
  MIN_MINUTES,
  KINDS,
  createLessonSpec,
  allocateTimeline,
  validateLessonSpec
};
