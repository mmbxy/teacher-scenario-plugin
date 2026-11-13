'use strict';

/**
 * T5.3 单节接入：把 ModelProvider 生成的一节合并回 LessonSpec。
 *
 * 约束：
 * - 只替换一个 section，不改其他节、例题、互动、习题；
 * - 模型失败时返回 degraded，不修改原 spec；
 * - 合并后只做 structure 校验，不做 full 校验（整包内容尚未全部生成）；
 * - 结果保留 aiDraft 与来源，供 UI/产物标记。
 */

const { createModelProvider } = require('./providers/model');
const { validateLessonSpec } = require('./validate-spec');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {object} spec - 已完成模板填充的 LessonSpec。
 * @param {object} options - { sectionId?, modelProvider?, provider?, model?, llm?, timeoutMs? }
 * @returns {Promise<object>} { ok, spec?, section?, degraded, aiDraft, attempts, reason? }
 */
async function applyModelSection(spec, options = {}) {
  if (!spec || !Array.isArray(spec.sections) || spec.sections.length === 0) {
    return { ok: false, degraded: true, aiDraft: true, reason: 'LessonSpec 没有分节' };
  }

  const sectionId = options.sectionId || spec.sections[0].id;
  const target = spec.sections.find((section) => section.id === sectionId);
  if (!target) {
    return { ok: false, degraded: true, aiDraft: true, reason: `找不到分节 ${sectionId}` };
  }

  const fallback = (reason, attempts = 0) => ({
    ok: true,
    degraded: true,
    aiDraft: false,
    fallback: 'template',
    attempts,
    reason,
    section: clone(target),
    spec: clone(spec)
  });

  if (options.forceFailure === true) {
    return fallback('测试强制模型失败', 1);
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
      timeoutMs: options.timeoutMs
    });
  }

  const topic = (spec.meta && spec.meta.topic) || '';
  const context = [
    `课程：${topic}`,
    `本节：${target.title}`,
    `本节类型：${target.kind}`,
    `前一节：${(spec.sections[spec.sections.indexOf(target) - 1] || {}).title || '无'}`
  ].join('；');

  const generated = await modelProvider.generateSection({
    topic,
    section: target.title,
    context
  });
  if (!generated || !generated.ok || !generated.section) {
    const reason = (generated && generated.reason) || '模型生成失败';
    if (options.fallbackToTemplate === false) {
      return {
        ok: false,
        degraded: true,
        aiDraft: true,
        attempts: generated ? generated.attempts : 0,
        reason
      };
    }
    return fallback(reason, generated ? generated.attempts : 0);
  }

  const updated = clone(spec);
  const nextSection = updated.sections.find((section) => section.id === sectionId);
  nextSection.title = generated.section.title || nextSection.title;
  nextSection.keyPoints = generated.section.keyPoints.slice();
  nextSection.content = generated.section.content;
  nextSection.example = generated.section.example;
  nextSection.wordCount = Array.from(generated.section.content).length;
  nextSection.aiDraft = true;
  nextSection.contentSource = 'model';
  nextSection.modelSource = generated.section.source || generated.source || null;

  updated.meta = updated.meta || {};
  updated.meta.contentSource = 'model';
  updated.meta.aiDraftSections = Array.from(new Set([
    ...(Array.isArray(updated.meta.aiDraftSections) ? updated.meta.aiDraftSections : []),
    sectionId
  ]));

  const validation = validateLessonSpec(updated, { mode: 'structure' });
  if (!validation.ok) {
    return {
      ok: false,
      degraded: true,
      aiDraft: true,
      attempts: generated.attempts,
      reason: '合并后 structure 校验失败：' + (validation.errors[0] ? validation.errors[0].message : '未知错误'),
      errors: validation.errors
    };
  }

  return {
    ok: true,
    degraded: false,
    aiDraft: true,
    attempts: generated.attempts,
    elapsedMs: generated.elapsedMs,
    tokens: generated.tokens,
    section: nextSection,
    spec: updated
  };
}

module.exports = { applyModelSection };
