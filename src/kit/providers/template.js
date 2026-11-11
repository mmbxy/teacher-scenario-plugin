'use strict';

/**
 * TemplateProvider：把内容包填入 LessonSpec。
 *
 * 约束：
 *  - 只读 spec 的结构（timeline/sections 的 id 与顺序），只写内容字段；
 *  - 纯函数：不读写文件、不访问网络、不依赖时间/随机；
 *  - 找不到内容包时返回 TEMPLATE_MISSING，由上层降级。
 */

const defaultPacks = [require('./content/function-derivative-60.json')];

const CONTENT_SOURCE = 'template';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function countChinese(text) {
  const matches = String(text || '').match(/[\u4e00-\u9fa5]/g);
  return matches ? matches.length : 0;
}

function estimateDeckPages(wordCount) {
  // 经验值：约 250 字/页，再加封面/议程/小结等固定页。
  return Math.max(25, Math.ceil(wordCount / 250) + 5);
}

function packMatches(pack, spec) {
  const meta = spec.meta || {};
  return pack.topic === meta.topic && pack.durationMinutes === meta.durationMinutes;
}

function createTemplateProvider(options = {}) {
  const packs = Array.isArray(options.packs) && options.packs.length > 0 ? options.packs : defaultPacks;

  return {
    id: 'template',
    list() {
      return packs.map((pack) => ({ id: pack.id, topic: pack.topic, durationMinutes: pack.durationMinutes }));
    },
    supports(spec) {
      return packs.some((pack) => packMatches(pack, spec));
    },
    fill(spec) {
      const pack = packs.find((item) => packMatches(item, spec));
      if (!pack) {
        return {
          ok: false,
          code: 'TEMPLATE_MISSING',
          message: `没有「${(spec.meta && spec.meta.topic) || '当前知识点'}」${(spec.meta && spec.meta.durationMinutes) || ''} 分钟的内容包。`,
          detail: `topic=${(spec.meta && spec.meta.topic) || ''};duration=${(spec.meta && spec.meta.durationMinutes) || ''}`
        };
      }

      const filled = clone(spec);
      const timeline = Array.isArray(filled.timeline) ? filled.timeline : [];
      const sections = Array.isArray(filled.sections) ? filled.sections : [];
      let totalWords = 0;

      for (const section of sections) {
        const content = pack.sections && pack.sections[section.timelineId];
        if (!content || typeof content.content !== 'string' || content.content.trim().length === 0) {
          return {
            ok: false,
            code: 'TEMPLATE_INCOMPLETE',
            message: `内容包缺少「${section.title}」一节。`,
            detail: `section=${section.id};timelineId=${section.timelineId}`
          };
        }
        section.content = content.content;
        section.keyPoints = Array.isArray(content.keyPoints) ? content.keyPoints.slice() : [];
        section.wordCount = Number.isInteger(content.wordCount) ? content.wordCount : countChinese(content.content);
        totalWords += section.wordCount;
      }

      if (!Array.isArray(pack.examples) || pack.examples.length === 0) {
        return { ok: false, code: 'TEMPLATE_INCOMPLETE', message: '内容包缺少例题。', detail: 'examples=empty' };
      }
      if (!Array.isArray(pack.interactions) || pack.interactions.length === 0) {
        return { ok: false, code: 'TEMPLATE_INCOMPLETE', message: '内容包缺少互动。', detail: 'interactions=empty' };
      }
      if (!Array.isArray(pack.exercises) || pack.exercises.length === 0) {
        return { ok: false, code: 'TEMPLATE_INCOMPLETE', message: '内容包缺少习题。', detail: 'exercises=empty' };
      }

      filled.examples = clone(pack.examples);
      filled.interactions = clone(pack.interactions);
      filled.exercises = clone(pack.exercises);
      filled.objectives = Array.isArray(pack.objectives) && pack.objectives.length > 0
        ? clone(pack.objectives)
        : filled.objectives;
      filled.boardPlan = clone(pack.boardPlan || { zones: [], keySentences: [], eraseStrategy: '' });
      filled.deckPages = Math.max(Number.isInteger(filled.deckPages) ? filled.deckPages : 0, estimateDeckPages(totalWords));
      filled.meta.contentSource = CONTENT_SOURCE;
      filled.quality = filled.quality || { warnings: [], degraded: false, sources: [], checks: {} };
      filled.quality.warnings = Array.isArray(filled.quality.warnings) ? filled.quality.warnings : [];
      filled.quality.checks = {
        ...(filled.quality.checks || {}),
        templateId: pack.id,
        totalWords
      };

      return { ok: true, spec: filled, warnings: [] };
    }
  };
}

module.exports = {
  createTemplateProvider,
  defaultPacks,
  countChinese,
  estimateDeckPages
};
