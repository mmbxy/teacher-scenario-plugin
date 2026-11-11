'use strict';

/**
 * 课时包工具编排层（纯逻辑，可测试）。
 *
 * 流程：createLessonSpec → TemplateProvider.fill → full 校验 → renderKit → 写盘。
 * 不依赖 OFdesk/Dsh 运行时；index.mjs 只负责注册与依赖注入。
 */

const { createLessonSpec, validateLessonSpec } = require('./index');
const template = require('./providers/template');

const FORMATS = Object.freeze(['markdown', 'docx', 'pptx', 'html']);
const FILE_TYPE = Object.freeze({
  'lecture-plan.md': 'lecture-plan',
  'handout.md': 'handout',
  'exercises.md': 'exercises',
  'board.md': 'board',
  'interaction.md': 'interaction',
  'lecture-kit.docx': 'lecture-kit-docx',
  'lecture-kit.pptx': 'lecture-kit-pptx',
  'lecture-kit.html': 'lecture-kit-html'
});

function failure(code, message, detail, retryable = false) {
  return { ok: false, code, message, detail, retryable };
}

function byteLength(content) {
  return Buffer.isBuffer(content) ? content.length : Buffer.byteLength(String(content), 'utf8');
}

function normalizeFormats(input) {
  const formats = ['markdown'];
  if (input.withDocx !== false) formats.push('docx');
  if (input.withPptx !== false) formats.push('pptx');
  if (input.withHtml !== false) formats.push('html');
  return formats.filter((item) => FORMATS.includes(item));
}

function normalizeEditions(input) {
  if (input.edition === 'teacher' || input.edition === 'student') return [input.edition];
  return ['teacher', 'student'];
}

/**
 * @param {{topic:string, durationMinutes?:number|string, exerciseCount?:number,
 *          teachingMode?:string, courseLevel?:string, audience?:string,
 *          edition?:'teacher'|'student'|'both',
 *          withDocx?:boolean, withPptx?:boolean, withHtml?:boolean}} input
 * @param {{now:()=>number, outputDir:string, writeFile:(path:string, content:string|Buffer)=>Promise<void>,
 *          provider?:object}} deps
 */
async function generateLectureKit(input, deps) {
  const options = deps && typeof deps === 'object' ? deps : {};
  if (typeof options.now !== 'function') return failure('HOST_ERROR', '宿主未注入时间依赖。', 'deps.now=missing');
  if (typeof options.outputDir !== 'string' || options.outputDir.trim().length === 0) {
    return failure('CAPABILITY_UNAVAILABLE', '宿主未提供可写产物目录。', 'outputDir=missing');
  }
  if (typeof options.writeFile !== 'function') {
    return failure('CAPABILITY_UNAVAILABLE', '宿主未提供写入能力。', 'writeFile=missing');
  }

  const durationRaw = input.durationMinutes === undefined ? 60 : input.durationMinutes;
  const durationMinutes = typeof durationRaw === 'string' ? Number(durationRaw) : durationRaw;
  const built = createLessonSpec(
    {
      topic: input.topic,
      durationMinutes,
      teachingMode: input.teachingMode,
      courseLevel: input.courseLevel,
      audience: input.audience,
      exerciseCount: input.exerciseCount,
      keyPoints: input.keyPoints
    },
    { now: options.now }
  );
  if (!built.ok) return failure(built.code || 'INVALID_INPUT', built.message, built.detail);

  const provider = options.provider || template.createTemplateProvider();
  const filled = provider.fill(built.spec);
  if (!filled.ok) return failure(filled.code, filled.message, filled.detail);

  const validation = validateLessonSpec(filled.spec, { mode: 'full' });
  if (!validation.ok) {
    const first = validation.errors[0] || { code: 'VALIDATION_FAILED', path: '', message: '校验失败' };
    return failure(
      'VALIDATION_FAILED',
      `课时包未通过 full 校验：${first.message}`,
      `${first.code}@${first.path};errors=${validation.errors.length}`
    );
  }

  const formats = normalizeFormats(input);
  const editions = normalizeEditions(input);
  const renderer = await import('./render/index.mjs');
  const outputRoot = `${options.outputDir.replace(/[\\/]+$/, '')}/${filled.spec.lessonId}`;
  const artifacts = [];

  for (const edition of editions) {
    let files;
    try {
      files = await renderer.renderKit(filled.spec, { formats, audience: edition });
    } catch (error) {
      return failure('RENDER_FAILED', `渲染失败：${error.message}`, `render=throw;edition=${edition}`);
    }

    for (const file of files) {
      const target = `${outputRoot}/${edition}/${file.name}`;
      try {
        await options.writeFile(target, file.content);
      } catch (error) {
        return failure('OUTPUT_WRITE_FAILED', `产物写入失败：${edition}/${file.name}`, `write=${error && error.code ? error.code : 'failed'}`);
      }
      artifacts.push({
        type: FILE_TYPE[file.name] || file.name.replace(/\.[^.]+$/, ''),
        format: file.name.endsWith('.md') ? 'markdown'
          : file.name.endsWith('.docx') ? 'docx'
            : file.name.endsWith('.pptx') ? 'pptx' : 'html',
        edition,
        path: target,
        bytes: byteLength(file.content)
      });
    }
  }

  return {
    ok: true,
    lessonId: filled.spec.lessonId,
    topic: filled.spec.meta.topic,
    durationMinutes: filled.spec.meta.durationMinutes,
    artifacts,
    words: filled.spec.sections.reduce((sum, section) => sum + section.wordCount, 0),
    deckPages: filled.spec.deckPages,
    warnings: filled.warnings || []
  };
}

module.exports = {
  generateLectureKit,
  FORMATS,
  FILE_TYPE
};
