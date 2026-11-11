import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderHtml } from '../src/kit/render/html.mjs';
import template from '../src/kit/providers/template.js';

const raw = JSON.parse(readFileSync(new URL('./fixtures/function-derivative-60.spec.json', import.meta.url), 'utf8'));
const filled = template.createTemplateProvider().fill(raw);
if (!filled.ok) throw new Error(filled.message);
const spec = filled.spec;

test('HTML：单文件、无外链、含交互画布', () => {
  const html = renderHtml(spec, { audience: 'teacher' });
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<canvas id="plot"/);
  assert.match(html, /type="range"/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+href=/i);
});

test('HTML：教师版含答案，学生版不输出答案节点', () => {
  const teacher = renderHtml(spec, { audience: 'teacher' });
  const student = renderHtml(spec, { audience: 'student' });
  assert.match(teacher, /查看答案/);
  assert.doesNotMatch(student, /查看答案/);
  assert.doesNotMatch(student, /class="answer"/);
  assert.match(teacher, /class="answer"/);
});

test('HTML：7 节内容都进入页面', () => {
  const html = renderHtml(spec, { audience: 'teacher' });
  const panels = (html.match(/data-panel="/g) || []).length;
  assert.equal(panels, spec.sections.length);
  for (const section of spec.sections) {
    assert.ok(html.includes(section.title.replace(/&/g, '&amp;')), section.title);
  }
});
