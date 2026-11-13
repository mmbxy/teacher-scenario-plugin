/**
 * DOCX 渲染器骨架（ESM）：只读 LessonSpec，输出 Buffer。
 * docx 是 ESM，因此在函数内动态 import，避免 CommonJS 入口加载失败。
 */

import textModule from './text.js';

const { plainText, isTeacherOnlyLine, isPlanningLine } = textModule;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function lines(value) {
  return clean(value).split(/\n+/).filter((item) => item.length > 0);
}

function sectionTitle(section) {
  return `${section.title}${section.aiDraft ? '（AI 草稿，需审校）' : ''}`;
}

export async function renderDocx(spec, options = {}) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const meta = spec.meta || {};
  const objectives = Array.isArray(spec.objectives) ? spec.objectives : [];
  const sections = Array.isArray(spec.sections) ? spec.sections : [];
  const examples = Array.isArray(spec.examples) ? spec.examples : [];
  const exercises = Array.isArray(spec.exercises) ? spec.exercises : [];
  const showAnswers = options.audience !== 'student';

  const children = [
    new Paragraph({ text: `${meta.topic || '课时'} · 教案`, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text: `时长：${meta.durationMinutes || 0} 分钟　｜　模式：${meta.teachingMode || '讲授'}　｜　学情：${meta.courseLevel || '本科基础'}`,
          size: 22,
          color: '555F6D'
        })
      ]
    }),
    new Paragraph({ text: '学习目标', heading: HeadingLevel.HEADING_1 })
  ];

  objectives.forEach((item) => {
    children.push(new Paragraph({ text: `• ${item.text}`, indent: { left: 360 } }));
  });

  children.push(new Paragraph({ text: '时间轴', heading: HeadingLevel.HEADING_1 }));
  (Array.isArray(spec.timeline) ? spec.timeline : []).forEach((slot) => {
    children.push(new Paragraph({ text: `${slot.title}：${slot.startMinute}–${slot.endMinute} 分钟（${slot.durationMinutes} 分钟）` }));
  });

  children.push(new Paragraph({ text: '分节内容', heading: HeadingLevel.HEADING_1 }));
  sections.forEach((section) => {
    children.push(new Paragraph({ text: sectionTitle(section), heading: HeadingLevel.HEADING_2 }));
    lines(section.content)
      .filter((text) => !isPlanningLine(text))
      .filter((text) => showAnswers || !isTeacherOnlyLine(text))
      .forEach((text) => children.push(new Paragraph({ text: plainText(text) })));
    (Array.isArray(section.keyPoints) ? section.keyPoints : []).forEach((point) => {
      children.push(new Paragraph({ text: `• ${plainText(point)}`, indent: { left: 360 } }));
    });
    if (section.example && clean(section.example.statement)) {
      children.push(new Paragraph({ text: `本节示例：${plainText(section.example.statement)}`, indent: { left: 360 } }));
      if (showAnswers && clean(section.example.answer)) {
        children.push(new Paragraph({ text: `示例答案：${plainText(section.example.answer)}`, indent: { left: 360 } }));
      }
    }
  });

  children.push(new Paragraph({ text: '例题', heading: HeadingLevel.HEADING_1 }));
  examples.forEach((item, index) => {
    children.push(new Paragraph({ text: `例 ${index + 1}：${item.title || ''}`, heading: HeadingLevel.HEADING_2 }));
    if (clean(item.problem)) children.push(new Paragraph({ text: plainText(item.problem) }));
    (Array.isArray(item.steps) ? item.steps : []).forEach((step, stepIndex) => {
      children.push(new Paragraph({ text: `${stepIndex + 1}. ${plainText(step)}` }));
    });
    (Array.isArray(item.pitfalls) ? item.pitfalls : []).forEach((pitfall) => {
      children.push(new Paragraph({ text: `易错点：${plainText(pitfall)}` }));
    });
  });

  children.push(new Paragraph({ text: '作业', heading: HeadingLevel.HEADING_1 }));
  exercises.forEach((item, index) => {
    children.push(new Paragraph({ text: `第 ${index + 1} 题（${item.level || ''} / ${item.type || ''}）` }));
    children.push(new Paragraph({ text: plainText(item.prompt) }));
    if (showAnswers) {
      children.push(new Paragraph({ text: `答案：${plainText(item.answer)}` }));
      children.push(new Paragraph({ text: `解析：${plainText(item.explanation)}` }));
    }
  });

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Microsoft YaHei', size: 22 } }
      }
    },
    sections: [{ children }]
  });

  return Packer.toBuffer(doc);
}
