'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

test('客户端入口：复制指令覆盖课时包工具', () => {
  assert.match(source, /teacher_generate_lecture_kit/);
  assert.match(source, /课时包/);
  assert.match(source, /45 分钟/);
  assert.match(source, /90 分钟/);
});

test('客户端入口：保留旧三件套入口', () => {
  assert.match(source, /teacher_generate_lesson/);
  assert.match(source, /三件套/);
});

test('客户端入口：时长只提供 45/60/90', () => {
  const matches = [...source.matchAll(/value: '(45|60|90)'/g)].map((item) => item[1]);
  assert.deepEqual(matches.sort(), ['45', '60', '90']);
});
