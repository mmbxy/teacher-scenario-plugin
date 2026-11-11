'use strict';

const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');

/**
 * 统一产物写入：字符串按 UTF-8，Buffer 按二进制。
 * 宿主侧的 writeFile 必须走这里，DOCX/PPTX 才能落盘。
 */
async function writeOutput(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  if (Buffer.isBuffer(content)) {
    await writeFile(target, content);
    return;
  }
  if (typeof content === 'string') {
    await writeFile(target, content, 'utf8');
    return;
  }
  throw new TypeError('产物内容必须是 string 或 Buffer。');
}

module.exports = { writeOutput };
