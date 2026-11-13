'use strict';

/**
 * T5.5 整包模型接入：替换全部 7 节，然后跑 full 校验。
 *
 * 关键约束：
 * - 60 分钟 full 校验要求 ≥6000 字，所以每节目标长度按总字数反推；
 * - 任何一节失败，整包回退到模板，避免半成品；
 * - full 校验失败也整包回退；
 * - 成功时所有节带 aiDraft。
 */

const { createModelProvider } = require('./providers/model');
const { validateLessonSpec } = require('./validate-spec');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function applyModelLesson(spec, options = {}) {
  if (!spec || !Array.isArray(spec.sections) || spec.sections.length === 0) {
    return { ok: false, degraded: true, aiDraft: true, reason: 'LessonSpec 没有分节' };
  }
  let modelProvider = options.modelProvider;
  if (!modelProvider) {
    if (!options.llm) {
      return { ok: false, degraded: true, aiDraft: true, reason: '缺少 modelProvider 或 llm' };
    }
    modelProvider = createModelProvider({
      llm: options.llm,
      provider: options.provider,
      model: options.model,
      timeoutMs: options.timeoutMs || 60000,
      maxTokens: options.maxTokens || 2600
    });
  }

  const original = clone(spec);
  const fallback = (reason, detail = {}) => ({
    ok: true,
    degraded: true,
    aiDraft: false,
    fallback: 'template',
    reason,
    ...detail,
    spec: clone(original)
  });

  const sections = spec.sections;
  const duration = (spec.meta && spec.meta.durationMinutes) || 60;
  const targetChars = Math.max(600, Math.ceil((duration * 100) / sections.length * 1.15));
  const updated = clone(spec);
  const topic = (spec.meta && spec.meta.topic) || '';
  const objectiveKeywords = Array.from(new Set((Array.isArray(spec.objectives) ? spec.objectives : [])
    .flatMap((objective) => (Array.isArray(objective.keywords) ? objective.keywords : []))
    .filter((keyword) => typeof keyword === 'string' && keyword.trim().length > 0)));
  const keywordHint = objectiveKeywords.length > 0
    ? `本节讲解中请自然出现这些关键词：${objectiveKeywords.join('、')}。`
    : '';

  for (let index = 0; index < updated.sections.length; index += 1) {
    const section = updated.sections[index];
    const context = [
      `课程：${topic}`,
      `本节：${section.title}`,
      `本节类型：${section.kind}`,
      `前一节：${(updated.sections[index - 1] || {}).title || '无'}`,
      keywordHint,
      '这是整包生成的一节，请只写本节，不写其他节。'
    ].filter(Boolean).join('；');
    const generated = await modelProvider.generateSection({
      topic,
      section: section.title,
      context,
      targetChars
    });
    if (!generated || !generated.ok || !generated.section) {
      return fallback((generated && generated.reason) || '模型生成失败', {
        failedSection: section.id,
        failedSectionTitle: section.title,
        attempts: generated ? generated.attempts : 0,
        targetChars,
        raw: generated && generated.raw ? String(generated.raw).slice(0, 1000) : ''
      });
    }
    section.title = generated.section.title || section.title;
    section.keyPoints = generated.section.keyPoints.slice();
    section.content = generated.section.content;
    section.example = generated.section.example;
    section.wordCount = Array.from(generated.section.content).length;
    section.aiDraft = true;
    section.contentSource = 'model';
    section.modelSource = generated.section.source || generated.source || null;
  }

  updated.meta = updated.meta || {};
  updated.meta.contentSource = 'model';
  updated.meta.aiDraftSections = updated.sections.map((section) => section.id);

  const validation = validateLessonSpec(updated, { mode: 'full' });
  if (!validation.ok) {
    const first = validation.errors[0] || { code: 'VALIDATION_FAILED', message: 'full 校验失败' };
    return fallback(`full 校验失败：${first.message}`, {
      failedSection: first.path || '',
      targetChars,
      errors: validation.errors.slice(0, 5)
    });
  }

  const words = updated.sections.reduce((sum, section) => sum + (section.wordCount || 0), 0);
  return {
    ok: true,
    degraded: false,
    aiDraft: true,
    fallback: null,
    spec: updated,
    words,
    targetChars,
    sections: updated.sections.map((section) => ({
      id: section.id,
      title: section.title,
      wordCount: section.wordCount
    }))
  };
}

module.exports = { applyModelLesson };
