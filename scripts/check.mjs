#!/usr/bin/env node
/**
 * 发布质量门：不依赖任何第三方包，逐项 PASS/FAIL。
 *
 * 覆盖：
 *  - 清单（名称/许可/版本/入口/文件白名单）
 *  - bundle patch 与包名一致性
 *  - locale 元数据与键集
 *  - icon 与 client/index 入口约定
 *  - 渲染：默认知识点、通用骨架、开关与非法输入、确定性
 *
 * 退出码：0 = 全部通过；1 = 存在 FAIL。
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const exists = (p) => existsSync(join(root, p));

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail === undefined ? '' : String(detail) });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pkg = JSON.parse(read('package.json'));
const generateModule = await import(pathToFileURL(join(root, 'src/generate.js')).href);
const generateLesson = generateModule.default.generateLesson;
const validateModule = await import(pathToFileURL(join(root, 'src/validate.js')).href);
const validateInput = validateModule.default.validateInput;

async function render(input) {
  const files = {};
  const result = await generateLesson(input, {
    now: () => Date.parse('2026-11-09T06:00:00Z'),
    outputDir: '/tmp/teacher-scenario-check',
    writeFile: async (path, content) => {
      files[path] = content;
    },
  });
  return { result, files };
}
function artifactText(files, kind) {
  const entry = Object.entries(files).find(([path]) => path.includes(kind));
  assert(entry, `缺少产物：${kind}`);
  return entry[1];
}

/* ---------------------------------------------------------------- 清单 */

await check('manifest.json', () => {
  assert(pkg && typeof pkg === 'object', 'package.json 不是对象');
  return `name=${pkg.name} version=${pkg.version}`;
});

await check('manifest.name', () => {
  assert(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(pkg.name), `名称不合法：${pkg.name}`);
  assert(!pkg.name.startsWith('@local/'), '仍使用占位的 @local/ 作用域');
  return pkg.name;
});

await check('manifest.publishable', () => {
  assert(!('private' in pkg), '仍标记 private: true');
  assert(pkg.license && pkg.license !== 'UNLICENSED', '缺少可用许可证');
  assert(pkg.repository && pkg.repository.url, '缺少 repository');
  assert(pkg.author, '缺少 author');
  return `license=${pkg.license}`;
});

await check('manifest.entries', () => {
  const paths = [pkg.main, pkg.exports?.['.'], pkg.exports?.['./client'], pkg.exports?.['./icon'], pkg.dsh?.bundle?.patch];
  for (const p of paths) {
    assert(typeof p === 'string', '入口字段缺失');
    assert(exists(p), `入口文件不存在：${p}`);
  }
  assert(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform 不是 web');
  return paths.join(', ');
});

await check('manifest.files', () => {
  const required = ['index.mjs', 'client.js', 'cordis.patch.yml', 'icon.svg', 'src'];
  for (const entry of required) {
    assert(pkg.files.includes(entry), `files 缺少 ${entry}`);
  }
  assert(pkg.files.includes('locale/*.json'), 'files 缺少 locale');
  const forbidden = pkg.files.filter((entry) => /^(tests|scripts|dist)\b/.test(entry));
  assert(forbidden.length === 0, `files 混入开发资产：${forbidden.join(', ')}`);
  return pkg.files.length + ' 项';
});

await check('engines.dsh', () => {
  const range = pkg.engines?.dsh;
  assert(typeof range === 'string' && range.length > 0, '缺少 engines.dsh');
  assert(!/TODO|OWNER/.test(range), `engines.dsh 含占位：${range}`);
  return range;
});

/* ---------------------------------------------------------------- patch */

await check('patch.entries', () => {
  const text = read(pkg.dsh.bundle.patch);
  assert(/-\s*insert:/.test(text), 'patch 不是 insert 形式');
  const id = (text.match(/^\s*-\s*id:\s*(\S+)/m) || [])[1];
  const name = (text.match(/^\s*name:\s*['"]?([^'"\n]+)['"]?/m) || [])[1];
  assert(id, 'patch 缺少 id');
  assert(name === pkg.name, `patch 行名与包名不一致：${name} != ${pkg.name}`);
  assert(/timeoutMs:\s*\d+/.test(text), 'patch 缺少 timeoutMs');
  return `${id} -> ${name}`;
});

/* ---------------------------------------------------------------- 资源 */

await check('locale.meta', () => {
  for (const file of ['locale/en.json', 'locale/zh.json']) {
    const data = JSON.parse(read(file));
    assert(data.meta?.title, `${file} 缺少 meta.title`);
    assert(data.meta?.description, `${file} 缺少 meta.description`);
  }
  return 'en / zh';
});

await check('locale.keys', () => {
  const en = JSON.parse(read('locale/en.json'));
  const zh = JSON.parse(read('locale/zh.json'));
  const enKeys = Object.keys(en).sort().join('|');
  const zhKeys = Object.keys(zh).sort().join('|');
  assert(enKeys === zhKeys, 'en 与 zh 键集不一致');
  return Object.keys(en).length + ' 个键';
});

await check('icon', () => {
  const svg = read(pkg.exports['./icon']);
  assert(/^<svg[\s>]/.test(svg.trim()), '不是 SVG');
  assert(/viewBox=/.test(svg), '缺少 viewBox');
  assert(!/https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(svg), '包含外部引用');
  assert(!/<script/i.test(svg), '包含脚本');
  return '24x24 矢量';
});

await check('client.entry', () => {
  const text = read(pkg.exports['./client']);
  assert(/__ModuleLoader__\.load/.test(text), '未使用 __ModuleLoader__');
  assert(new RegExp(`id:\\s*'${pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(text), 'client 模块 id 与包名不一致');
  assert(/ctx\.slots\.register/.test(text), '未注册 slot');
  return 'module id 一致';
});

await check('index.entry', () => {
  const text = read(pkg.main);
  assert(/defineTool/.test(text), '未使用 defineTool');
  assert(/ctx\.tools\.register/.test(text), '未注册工具');
  assert(/teacher_generate_lesson/.test(text), '工具名缺失');
  return 'teacher_generate_lesson';
});

/* ---------------------------------------------------------------- 渲染 */

await check('render.default', async () => {
  const { result, files } = await render({ topic: '函数求导', exerciseCount: 6 });
  assert(result.ok, result.message);
  assert(result.artifacts.length === 3, '产物数量不是 3');
  const lesson = artifactText(files, 'lesson.html');
  const handout = artifactText(files, 'handout');
  const exercises = artifactText(files, 'exercises');
  assert(!/https?:\/\//.test(lesson), '讲解页含外部链接');
  assert((handout.match(/^## /gm) || []).length === 5, '讲义不是 5 章');
  assert((exercises.match(/\*\*第 \d+ 题/g) || []).length === 6, '习题不是 6 题');
  assert(!/））/.test(exercises), '题型出现双层括号');
  return '3 产物 / 5 章 / 6 题';
});

await check('render.generic', async () => {
  const { result, files } = await render({ topic: '矩阵的秩', exerciseCount: 6 });
  assert(result.ok, result.message);
  const all = Object.values(files).join('\n');
  for (const phrase of ['该知识点', '情境应符合', '本课', '核心知识点', '示例 ', '本页是一份']) {
    assert(!all.includes(phrase), `通用模板仍含泛化句：${phrase}`);
  }
  const handout = artifactText(files, 'handout');
  const exercises = artifactText(files, 'exercises');
  assert(/本题组围绕「矩阵的秩」/.test(exercises), '习题小结未锚定知识点');
  assert(!/例 \d+：示例/.test(handout), '出现双重例题标签');
  assert(!/能否使用 /.test(all), '出现多余空格');
  return '5 步 / 6 题 / 无泛化句';
});

await check('validation.edge', () => {
  const none = validateInput({ topic: '矩阵', withInteractive: false, withHandout: false, withExercises: false });
  assert(none.ok === false && none.code === 'INVALID_INPUT' && none.detail === 'artifacts=none', '全关开关未被拒绝');
  const empty = validateInput({ topic: '   ' });
  assert(empty.ok === false && empty.detail === 'topic.length=0', '空知识点未被拒绝');
  const tooMany = validateInput({ topic: '矩阵', exerciseCount: 21 });
  assert(tooMany.ok === false, '越界题量未被拒绝');
  return 'INVALID_INPUT x3';
});

await check('render.deterministic', async () => {
  const first = await render({ topic: '矩阵的秩', exerciseCount: 3 });
  const second = await render({ topic: '矩阵的秩', exerciseCount: 3 });
  assert(JSON.stringify(first.files) === JSON.stringify(second.files), '同输入两次输出不一致');
  return '逐字节一致';
});

/* ---------------------------------------------------------------- 汇总 */

let failed = 0;
for (const item of results) {
  if (!item.ok) failed += 1;
  console.log(`[${item.ok ? 'PASS' : 'FAIL'}] ${item.name}${item.detail ? ' - ' + item.detail : ''}`);
}
console.log(`\n汇总: PASS ${results.length - failed} / FAIL ${failed}`);
process.exitCode = failed > 0 ? 1 : 0;
