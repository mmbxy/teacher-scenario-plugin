'use strict';

/**
 * 课时时间轴（纯函数，无依赖）。
 *
 * 契约（PRD 第 4.3 节）：
 *  - 只支持 45 / 60 / 90 分钟；
 *  - 七个环节权重固定，合计精确等于时长；
 *  - 每个环节至少 3 分钟；
 *  - keyPoints 命中的环节权重 +20%，其余等比例压缩，总时长不变；
 *  - 分配失败时回退到基准权重，并写入 warnings。
 */

const SUPPORTED_DURATIONS = Object.freeze([45, 60, 90]);
const MIN_MINUTES = 3;

const KINDS = Object.freeze([
  { kind: 'intro', title: '导入', weights: { 45: 5, 60: 5, 90: 8 } },
  { kind: 'concept', title: '概念', weights: { 45: 10, 60: 13, 90: 18 } },
  { kind: 'derivation', title: '推导', weights: { 45: 12, 60: 17, 90: 25 } },
  { kind: 'example', title: '例题', weights: { 45: 7, 60: 10, 90: 15 } },
  { kind: 'interaction', title: '互动', weights: { 45: 4, 60: 8, 90: 12 } },
  { kind: 'summary', title: '小结', weights: { 45: 4, 60: 4, 90: 6 } },
  { kind: 'homework', title: '作业', weights: { 45: 3, 60: 3, 90: 6 } }
]);

/** 知识点关键词 → 环节。支持 kind 与中文标题。 */
const ALIASES = Object.freeze({
  intro: 'intro',
  导入: 'intro',
  concept: 'concept',
  概念: 'concept',
  derivation: 'derivation',
  推导: 'derivation',
  example: 'example',
  例题: 'example',
  interaction: 'interaction',
  互动: 'interaction',
  summary: 'summary',
  小结: 'summary',
  homework: 'homework',
  作业: 'homework'
});

function baseWeights(durationMinutes) {
  return KINDS.map((item) => item.weights[durationMinutes]);
}

function resolveKind(value) {
  if (typeof value !== 'string') return null;
  return ALIASES[value.trim()] || null;
}

/**
 * 把小数分钟取整并满足下限。
 * 正差额加给“目标值小数部分最大”的环节；负差额从“当前分钟数最大且可减”的环节扣。
 */
function rebalance(minutes, targets, total) {
  const result = minutes.slice();
  let diff = total - result.reduce((sum, value) => sum + value, 0);
  let guard = 0;

  while (diff !== 0 && guard < 1000) {
    guard += 1;

    if (diff > 0) {
      let index = 0;
      for (let i = 1; i < result.length; i += 1) {
        const left = targets[i] - result[i];
        const right = targets[index] - result[index];
        if (left > right) index = i;
      }
      result[index] += 1;
      diff -= 1;
      continue;
    }

    let index = -1;
    for (let i = 0; i < result.length; i += 1) {
      if (result[i] <= MIN_MINUTES) continue;
      if (index === -1 || result[i] > result[index]) index = i;
    }
    if (index === -1) return null;
    result[index] -= 1;
    diff += 1;
  }

  return diff === 0 ? result : null;
}

/**
 * @param {{durationMinutes:number, keyPoints?:string[]}} input
 * @returns {{ok:true, timeline:object[], warnings:string[]} | {ok:false, code:string, message:string, detail:string}}
 */
function allocateTimeline(input) {
  const rawDuration = input && input.durationMinutes;
  const durationMinutes = rawDuration;
  if (typeof rawDuration !== 'number' || !Number.isInteger(rawDuration) || !SUPPORTED_DURATIONS.includes(rawDuration)) {
    return {
      ok: false,
      code: 'INVALID_DURATION',
      message: `课时长度只支持 ${SUPPORTED_DURATIONS.join(' / ')} 分钟，当前为 ${JSON.stringify(
        input && input.durationMinutes
      )}。`,
      detail: `durationMinutes=${JSON.stringify(input && input.durationMinutes)}`
    };
  }

  const keyPoints = Array.isArray(input && input.keyPoints) ? input.keyPoints : [];
  const keyKinds = new Set();
  const warnings = [];

  for (const point of keyPoints) {
    const kind = resolveKind(point);
    if (kind) keyKinds.add(kind);
    else warnings.push(`重点「${String(point)}」没有匹配到环节，已忽略。`);
  }

  const base = baseWeights(durationMinutes);
  const weighted = base.map((weight, index) =>
    keyKinds.has(KINDS[index].kind) ? weight * 1.2 : weight
  );
  const weightTotal = weighted.reduce((sum, value) => sum + value, 0);
  const targets = weighted.map((weight) => (weight / weightTotal) * durationMinutes);

  const floored = targets.map((value) => Math.floor(value));
  const withMin = floored.map((value) => Math.max(MIN_MINUTES, value));
  const balanced = rebalance(withMin, targets, durationMinutes);

  let minutes = balanced;
  if (!minutes) {
    minutes = base.slice();
    warnings.push('重点加权后无法在保证每节 ≥3 分钟的前提下重分配，已回退基准权重。');
  }

  let cursor = 0;
  const timeline = KINDS.map((item, index) => {
    const startMinute = cursor;
    const endMinute = cursor + minutes[index];
    cursor = endMinute;
    return {
      id: item.kind,
      kind: item.kind,
      title: item.title,
      startMinute,
      endMinute,
      durationMinutes: minutes[index],
      isKeyPoint: keyKinds.has(item.kind)
    };
  });

  return { ok: true, timeline, warnings };
}

module.exports = {
  SUPPORTED_DURATIONS,
  MIN_MINUTES,
  KINDS,
  allocateTimeline
};
