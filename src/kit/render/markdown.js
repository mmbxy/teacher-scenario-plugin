'use strict';

/**
 * Markdown 渲染器骨架：只读 LessonSpec，不生成内容。
 * 返回 [{ name, content }]，由上层决定落盘位置与文件名。
 */

function line(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function listOrEmpty(items) {
  return Array.isArray(items) ? items.filter((item) => line(item).length > 0) : [];
}

function renderLecturePlan(spec) {
  const meta = spec.meta || {};
  const timeline = Array.isArray(spec.timeline) ? spec.timeline : [];
  const objectives = Array.isArray(spec.objectives) ? spec.objectives : [];
  const sections = Array.isArray(spec.sections) ? spec.sections : [];
  const examples = Array.isArray(spec.examples) ? spec.examples : [];
  const interactions = Array.isArray(spec.interactions) ? spec.interactions : [];
  const board = spec.boardPlan || {};

  const parts = [];
  parts.push(`# ${meta.topic || '课时'} · 教案`);
  parts.push('');
  parts.push(`> 时长：${meta.durationMinutes || 0} 分钟　｜　模式：${meta.teachingMode || '讲授'}　｜　学情：${meta.courseLevel || '本科基础'}`);
  parts.push('');
  parts.push('## 学习目标');
  objectives.forEach((item) => parts.push(`- ${item.text}`));
  parts.push('');
  parts.push('## 时间轴');
  parts.push('| 环节 | 起止 | 时长 |');
  parts.push('|---|---|---|');
  timeline.forEach((slot) => {
    parts.push(`| ${slot.title} | ${slot.startMinute}–${slot.endMinute} 分钟 | ${slot.durationMinutes} 分钟 |`);
  });
  parts.push('');
  parts.push('## 分节内容');
  sections.forEach((section) => {
    parts.push(`### ${section.title}`);
    const keyPoints = listOrEmpty(section.keyPoints);
    if (keyPoints.length > 0) keyPoints.forEach((point) => parts.push(`- ${point}`));
    if (line(section.content)) parts.push('', section.content);
    parts.push('');
  });
  parts.push('## 例题');
  examples.forEach((item, index) => {
    parts.push(`### 例 ${index + 1}：${item.title || ''}`);
    parts.push(item.problem || '');
    listOrEmpty(item.steps).forEach((step, stepIndex) => parts.push(`${stepIndex + 1}. ${step}`));
    listOrEmpty(item.pitfalls).forEach((pitfall) => parts.push(`- 易错点：${pitfall}`));
    if (line(item.variant)) parts.push(`- 变式：${item.variant}`);
    parts.push('');
  });
  parts.push('## 互动');
  interactions.forEach((item, index) => {
    parts.push(`### 互动 ${index + 1}`);
    parts.push(`- 问题：${item.prompt || ''}`);
    listOrEmpty(item.expectedWrong).forEach((wrong) => parts.push(`- 预设错误：${wrong}`));
    parts.push(`- 纠正：${item.correction || ''}`);
    parts.push('');
  });
  parts.push('## 板书');
  listOrEmpty(board.keySentences).forEach((sentence) => parts.push(`- ${sentence}`));
  parts.push('');
  return parts.join('\n');
}

function renderHandout(spec) {
  const meta = spec.meta || {};
  const objectives = Array.isArray(spec.objectives) ? spec.objectives : [];
  const sections = Array.isArray(spec.sections) ? spec.sections : [];
  const parts = [];
  parts.push(`# ${meta.topic || '课时'} · 学生讲义`);
  parts.push('');
  parts.push('## 学习目标');
  objectives.forEach((item) => parts.push(`- ${item.text}`));
  parts.push('');
  sections.forEach((section) => {
    parts.push(`## ${section.title}`);
    if (line(section.content)) parts.push('', section.content);
    parts.push('');
  });
  return parts.join('\n');
}

function renderExercises(spec, options = {}) {
  const meta = spec.meta || {};
  const exercises = Array.isArray(spec.exercises) ? spec.exercises : [];
  const showAnswers = options.audience !== 'student';
  const parts = [];
  parts.push(`# ${meta.topic || '课时'} · 分层作业`);
  parts.push('');
  exercises.forEach((item, index) => {
    parts.push(`### 第 ${index + 1} 题（${item.level || ''} / ${item.type || ''}）`);
    parts.push(item.prompt || '');
    if (showAnswers) {
      parts.push('', `**答案**：${item.answer || ''}`, '', `**解析**：${item.explanation || ''}`);
    }
    parts.push('');
  });
  return parts.join('\n');
}

function renderBoard(spec) {
  const board = spec.boardPlan || {};
  const parts = [`# ${spec.meta && spec.meta.topic ? spec.meta.topic : '课时'} · 板书设计`, ''];
  listOrEmpty(board.zones).forEach((zone) => parts.push(`- 分区：${zone}`));
  listOrEmpty(board.keySentences).forEach((sentence) => parts.push(`- 关键句：${sentence}`));
  if (line(board.eraseStrategy)) parts.push('', `擦除策略：${board.eraseStrategy}`);
  return parts.join('\n');
}

function renderInteraction(spec) {
  const interactions = Array.isArray(spec.interactions) ? spec.interactions : [];
  const parts = [`# ${spec.meta && spec.meta.topic ? spec.meta.topic : '课时'} · 互动脚本`, ''];
  interactions.forEach((item, index) => {
    parts.push(`## 互动 ${index + 1}`);
    parts.push(`- 问题：${item.prompt || ''}`);
    listOrEmpty(item.expectedWrong).forEach((wrong) => parts.push(`- 预设错误：${wrong}`));
    parts.push(`- 纠正：${item.correction || ''}`);
    parts.push('');
  });
  return parts.join('\n');
}

function renderMarkdown(spec, options = {}) {
  const audience = options.audience === 'student' ? 'student' : 'teacher';
  const files = [
    { name: 'lecture-plan.md', content: renderLecturePlan(spec) },
    { name: 'handout.md', content: renderHandout(spec) },
    { name: 'exercises.md', content: renderExercises(spec, { audience }) },
    { name: 'board.md', content: renderBoard(spec) },
    { name: 'interaction.md', content: renderInteraction(spec) }
  ];
  return files;
}

module.exports = {
  renderMarkdown,
  renderLecturePlan,
  renderHandout,
  renderExercises,
  renderBoard,
  renderInteraction
};
