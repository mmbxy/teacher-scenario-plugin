/**
 * PPTX 渲染器骨架（ESM）：只读 LessonSpec，输出 Buffer。
 * pptxgenjs 4.x 的多行文本不接受纯字符串数组，这里逐行 addText。
 */

import textModule from './text.js';

const { plainText, isTeacherOnlyLine, isPlanningLine } = textModule;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function sectionTitle(section) {
  return `${section.title}${section.aiDraft ? '（AI 草稿，需审校）' : ''}`;
}

function sectionLines(section, audience) {
  const keyPoints = (Array.isArray(section.keyPoints) ? section.keyPoints : [])
    .map((item) => plainText(item))
    .filter((item) => item.length > 0);
  const contentLines = plainText(section.content)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 4 && !/^[-—|]+$/.test(line))
    .filter((line) => !/^\d+\s*[–-]\s*\d+\s*分钟/.test(line))
    .filter((line) => !/^\d+\s*[–-]\s*\d+\s+(导入|概念|推导|例题|互动|小结|作业)/.test(line))
    .filter((line) => !/^时间段\s+环节/.test(line))
    .filter((line) => !isPlanningLine(line))
    .filter((line) => line !== section.title)
    .filter((line) => audience !== 'student' || !isTeacherOnlyLine(line));
  const exampleLines = [];
  if (section.example && plainText(section.example.statement)) {
    exampleLines.push(`本节示例：${plainText(section.example.statement)}`);
    if (audience !== 'student' && plainText(section.example.answer)) {
      exampleLines.push(`示例答案：${plainText(section.example.answer)}`);
    }
  }
  return Array.from(new Set([...keyPoints, ...contentLines, ...exampleLines]));
}
export function sectionNote(section, timeline = []) {
  const slot = timeline.find((item) => item.id === section.timelineId);
  const minutes = slot && Number.isInteger(slot.durationMinutes) ? slot.durationMinutes : 0;
  const goal = plainText(section.content).split(/\n+/).find((line) => line.length > 0) || '内容待填充';
  const prefix = section.aiDraft ? 'AI 草稿，需教师审校。' : '';
  return `${prefix}本节：${section.title}；建议时长 ${minutes} 分钟。要点：${goal.slice(0, 80)}`;
}

export async function renderPptx(spec, options = {}) {
  const imported = await import('pptxgenjs');
  const PptxGenJS = imported.default || imported;
  const meta = spec.meta || {};
  const objectives = Array.isArray(spec.objectives) ? spec.objectives : [];
  const sections = Array.isArray(spec.sections) ? spec.sections : [];
  const showNotes = options.audience !== 'student';

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'teacher-scenario-plugin';
  pptx.subject = `${meta.topic || '课时'} · ${meta.durationMinutes || 0} 分钟`;
  pptx.title = `${meta.topic || '课时'} · 课时包`;

  const cover = pptx.addSlide();
  cover.addText(meta.topic || '课时', {
    x: 0.8, y: 1.6, w: 11.8, h: 1.2, fontSize: 44, bold: true, color: '1F3A5F', fontFace: 'Microsoft YaHei'
  });
  cover.addText(`${meta.teachingMode || '讲授'} · ${meta.durationMinutes || 0} 分钟 · ${meta.courseLevel || '本科基础'}`, {
    x: 0.8, y: 2.9, w: 11.8, h: 0.6, fontSize: 22, color: '2E6FB7', fontFace: 'Microsoft YaHei'
  });
  if (showNotes) cover.addNotes('开场：说明本节目标与时间分配。');

  sections.forEach((section) => {
    const maxPages = meta.durationMinutes === 90 ? 6 : 4;
    const lines = sectionLines(section, options.audience).slice(0, maxPages * 4);
    const groups = lines.length > 0 ? chunk(lines, 4) : [['（内容待填充）']];
    groups.forEach((group, pageIndex) => {
      const slide = pptx.addSlide();
      slide.addText(pageIndex === 0 ? sectionTitle(section) : `${sectionTitle(section)}（续 ${pageIndex}）`, {
        x: 0.6, y: 0.4, w: 12, h: 0.8, fontSize: 30, bold: true, color: '1F3A5F', fontFace: 'Microsoft YaHei'
      });
      group.forEach((text, index) => {
        slide.addText(text, {
          x: 0.9, y: 1.5 + index * 0.9, w: 11.4, h: 0.75, fontSize: 20, color: '1E293B', fontFace: 'Microsoft YaHei'
        });
      });
      if (showNotes) slide.addNotes(sectionNote(section, spec.timeline));
    });
  });

  const summary = pptx.addSlide();
  summary.addText('小结与作业', {
    x: 0.6, y: 0.4, w: 12, h: 0.8, fontSize: 30, bold: true, color: '1F3A5F', fontFace: 'Microsoft YaHei'
  });
  objectives.slice(0, 4).forEach((item, index) => {
    summary.addText(plainText(item.text), {
      x: 0.9, y: 1.5 + index * 0.75, w: 11.4, h: 0.65, fontSize: 20, color: '1E293B', fontFace: 'Microsoft YaHei'
    });
  });
  if (showNotes) summary.addNotes('总结目标达成情况，布置分层作业。');

  return pptx.write({ outputType: 'nodebuffer' });
}
