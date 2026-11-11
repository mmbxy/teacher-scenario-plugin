/**
 * PPTX 渲染器骨架（ESM）：只读 LessonSpec，输出 Buffer。
 * pptxgenjs 4.x 的多行文本不接受纯字符串数组，这里逐行 addText。
 */

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** 从时间轴取本节时长；section 本身不存 durationMinutes。 */
export function sectionNote(section, timeline = []) {
  const slot = timeline.find((item) => item.id === section.timelineId);
  const minutes = slot && Number.isInteger(slot.durationMinutes) ? slot.durationMinutes : 0;
  const goal = clean(section.content).split(/\n+/).find((line) => line.length > 0) || '内容待填充';
  return `本节：${section.title}；建议时长 ${minutes} 分钟。要点：${goal.slice(0, 60)}`;
}

export async function renderPptx(spec, options = {}) {
  const imported = await import('pptxgenjs');
  const PptxGenJS = imported.default || imported;
  const meta = spec.meta || {};
  const objectives = Array.isArray(spec.objectives) ? spec.objectives : [];
  const sections = Array.isArray(spec.sections) ? spec.sections : [];

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
  cover.addNotes('开场：说明本节目标与时间分配。');

  sections.forEach((section) => {
    const slide = pptx.addSlide();
    slide.addText(section.title, {
      x: 0.6, y: 0.4, w: 12, h: 0.8, fontSize: 30, bold: true, color: '1F3A5F', fontFace: 'Microsoft YaHei'
    });
    const keyPoints = (Array.isArray(section.keyPoints) ? section.keyPoints : []).filter((item) => clean(item));
    const content = clean(section.content);
    const bullets = keyPoints.length > 0 ? keyPoints : content ? content.split(/\n+/).slice(0, 6) : ['（内容待填充）'];
    bullets.slice(0, 6).forEach((text, index) => {
      slide.addText(text, {
        x: 0.9, y: 1.5 + index * 0.75, w: 11.4, h: 0.65, fontSize: 20, color: '1E293B', fontFace: 'Microsoft YaHei'
      });
    });
    slide.addNotes(sectionNote(section, spec.timeline));
  });

  const summary = pptx.addSlide();
  summary.addText('小结与作业', {
    x: 0.6, y: 0.4, w: 12, h: 0.8, fontSize: 30, bold: true, color: '1F3A5F', fontFace: 'Microsoft YaHei'
  });
  objectives.slice(0, 4).forEach((item, index) => {
    summary.addText(item.text, {
      x: 0.9, y: 1.5 + index * 0.75, w: 11.4, h: 0.65, fontSize: 20, color: '1E293B', fontFace: 'Microsoft YaHei'
    });
  });
  summary.addNotes('总结目标达成情况，布置分层作业。');

  return pptx.write({ outputType: 'nodebuffer' });
}
