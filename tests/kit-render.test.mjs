import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import markdownModule from '../src/kit/render/markdown.js';
import { renderKit } from '../src/kit/render/index.mjs';
import { sectionNote } from '../src/kit/render/pptx.mjs';
import io from '../src/kit/io.js';

const { renderMarkdown } = markdownModule;
const { writeOutput } = io;
const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  await readFile(path.join(here, 'fixtures', 'function-derivative-60.spec.json'), 'utf8')
);

function isZip(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

test('Markdown 渲染器：产出 5 个文件，包含主题与时间轴', () => {
  const files = renderMarkdown(fixture, { audience: 'teacher' });
  const names = files.map((file) => file.name);
  assert.deepEqual(names, ['lecture-plan.md', 'handout.md', 'exercises.md', 'board.md', 'interaction.md']);
  const plan = files.find((file) => file.name === 'lecture-plan.md').content;
  assert.match(plan, /函数求导/);
  assert.match(plan, /时间轴/);
  assert.match(plan, /0–5 分钟|0-5 分钟/);
});

test('Markdown 渲染器：学生版习题不含答案，教师版含答案', () => {
  const teacher = renderMarkdown(fixture, { audience: 'teacher' }).find((file) => file.name === 'exercises.md').content;
  const student = renderMarkdown(fixture, { audience: 'student' }).find((file) => file.name === 'exercises.md').content;
  assert.match(teacher, /\*\*答案\*\*/);
  assert.doesNotMatch(student, /\*\*答案\*\*/);
});

test('renderKit：Markdown + DOCX + PPTX 一次产出 7 个文件', async () => {
  const files = await renderKit(fixture, { formats: ['markdown', 'docx', 'pptx'] });
  assert.equal(files.length, 7);
  const docx = files.find((file) => file.name === 'lecture-kit.docx');
  const pptx = files.find((file) => file.name === 'lecture-kit.pptx');
  assert.ok(docx && pptx);
  assert.ok(isZip(docx.content), 'DOCX 应以 PK 开头');
  assert.ok(isZip(pptx.content), 'PPTX 应以 PK 开头');
  assert.ok(docx.content.length > 5000, 'DOCX 体积过小');
  assert.ok(pptx.content.length > 10000, 'PPTX 体积过小');
});

test('renderKit：只渲染 Markdown 时不加载二进制库', async () => {
  const files = await renderKit(fixture, { formats: ['markdown'] });
  assert.equal(files.length, 5);
  assert.equal(files.some((file) => Buffer.isBuffer(file.content)), false);
});

test('二进制写入：Buffer 原样落盘，字符串按 UTF-8', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kit-write-'));
  try {
    const binPath = path.join(dir, 'nested', 'probe.pptx');
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
    await writeOutput(binPath, bytes);
    assert.deepEqual(await readFile(binPath), bytes);

    const textPath = path.join(dir, 'nested', 'probe.md');
    await writeOutput(textPath, '函数求导 · 中文');
    assert.equal(await readFile(textPath, 'utf8'), '函数求导 · 中文');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('二进制写入：非法内容类型抛出 TypeError', async () => {
  await assert.rejects(() => writeOutput(path.join(tmpdir(), 'bad.docx'), 123), /string 或 Buffer/);
});

test('PPTX 备注：时长从时间轴读取，不出现 0 分钟', () => {
  const section = fixture.sections.find((item) => item.timelineId === 'intro');
  const note = sectionNote(section, fixture.timeline);
  assert.match(note, /建议时长 5 分钟/);
  assert.doesNotMatch(note, /建议时长 0 分钟/);
});
