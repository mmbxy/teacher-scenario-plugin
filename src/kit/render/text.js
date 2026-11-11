'use strict';

/**
 * 渲染前的纯文本化：去掉 Markdown 标记，把常见 LaTeX 片段转成 Unicode。
 * 只服务 DOCX/PPTX 这类富文本；Markdown 渲染器保留原格式。
 */

const SUPERSCRIPT = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '-': '⁻', n: 'ⁿ'
};
const SUBSCRIPT = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };

function mathToText(input) {
  let text = String(input || '');
  text = text.replace(/\$\$/g, '').replace(/\$/g, '');
  text = text.replace(/\\\\/g, '\\');
  text = text.replace(/\\left\.?/g, '').replace(/\\right\|?/g, '');
  text = text.replace(/\\lim_\{\\Delta x\\to0\}/g, 'lim(Δx→0)');
  const fraction = /\\frac\{([^{}]*)\}\{([^{}]*)\}/;
  while (fraction.test(text)) text = text.replace(fraction, '($1)/($2)');
  const map = {
    '\\Delta': 'Δ', '\\delta': 'δ', '\\to': '→', '\\lim': 'lim', '\\cdot': '·',
    '\\pm': '±', '\\infty': '∞', '\\le': '≤', '\\ge': '≥', '\\lvert': '|', '\\rvert': '|',
    '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan'
  };
  for (const [key, value] of Object.entries(map)) text = text.split(key).join(value);
  text = text.replace(/Δ\s+/g, 'Δ').replace(/δ\s+/g, 'δ').replace(/±\s+/g, '±');
  text = text.replace(/\^\{([^{}]*)\}/g, (_, body) =>
    /^[0-9+\-n]+$/.test(body) ? body.split('').map((ch) => SUPERSCRIPT[ch] || ch).join('') : '^' + body
  );
  text = text.replace(/\^([0-9n])/g, (_, ch) => SUPERSCRIPT[ch] || ch);
  text = text.replace(/_\{([0-9]+)\}/g, (_, body) => body.split('').map((ch) => SUBSCRIPT[ch] || ch).join(''));
  text = text.replace(/_([0-9])/g, (_, ch) => SUBSCRIPT[ch] || ch);
  return text.trim();
}

function stripMarkdown(input) {
  const withoutTableSyntax = String(input || '')
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*\|(.*)\|\s*$/);
      if (!match) return line;
      const inner = match[1].replace(/\|/g, ' ').trim();
      if (/^[\s:-]+$/.test(inner)) return '';
      return inner;
    })
    .join('\n');
  return withoutTableSyntax
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .replace(/^\s*---+\s*$/gm, '')
    .trim();
}

function plainText(input) {
  return mathToText(stripMarkdown(input));
}

/** 学生版应剔除的教师支架行（答案/解析/纠正/预设错误）。 */
function isTeacherOnlyLine(input) {
  return /^(?:[-*]\s*)?(?:\*\*)?(答案|参考答案|解析|纠正|预设错误)(?:话术)?(?:\*\*)?[：:]/.test(String(input || '').trim());
}

/** 内容包前导/规划行：学习目标复述、合计字数、时间表。 */
function isPlanningLine(input) {
  const text = String(input || '').trim();
  if (/^合计约/.test(text)) return true;
  if (/^\d+\.\s*(能|会|理解|掌握)/.test(text)) return true;
  if (/^时间段\s+环节/.test(text)) return true;
  return false;
}

module.exports = { plainText, stripMarkdown, mathToText, isTeacherOnlyLine, isPlanningLine };
