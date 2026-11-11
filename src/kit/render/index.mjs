/**
 * 渲染器入口（ESM）：把 LessonSpec 渲染成文件列表。
 * 渲染器只读 spec，不生成内容、不写盘。
 */

import markdownModule from './markdown.js';
import { renderDocx } from './docx.mjs';
import { renderPptx } from './pptx.mjs';

const { renderMarkdown } = markdownModule;

const FORMATS = Object.freeze(['markdown', 'docx', 'pptx']);

/**
 * @param {object} spec
 * @param {{formats?:string[], audience?:'teacher'|'student'}} [options]
 * @returns {Promise<Array<{name:string, content:string|Buffer}>>}
 */
export async function renderKit(spec, options = {}) {
  const formats = Array.isArray(options.formats) && options.formats.length > 0 ? options.formats : FORMATS;
  const audience = options.audience === 'student' ? 'student' : 'teacher';
  const files = [];

  if (formats.includes('markdown')) {
    files.push(...renderMarkdown(spec, { audience }));
  }
  if (formats.includes('docx')) {
    files.push({ name: 'lecture-kit.docx', content: await renderDocx(spec, { audience }) });
  }
  if (formats.includes('pptx')) {
    files.push({ name: 'lecture-kit.pptx', content: await renderPptx(spec, { audience }) });
  }

  return files;
}

export { FORMATS, renderMarkdown, renderDocx, renderPptx };
