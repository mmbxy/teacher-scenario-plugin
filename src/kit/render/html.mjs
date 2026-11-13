/**
 * 课时包 HTML 渲染器（ESM）：只读 LessonSpec，输出单文件 HTML。
 * 无外链、无 CDN；公式沿用 plainText 的 Unicode 文本。
 */

import textModule from './text.js';

const { plainText, isTeacherOnlyLine, isPlanningLine } = textModule;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function lines(content, audience) {
  return plainText(content)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^[-—|]+$/.test(line))
    .filter((line) => !/^\d+\s*[–-]\s*\d+\s*分钟/.test(line))
    .filter((line) => !/^\d+\s*[–-]\s*\d+\s+(导入|概念|推导|例题|互动|小结|作业)/.test(line))
    .filter((line) => !/^时间段\s+环节/.test(line))
    .filter((line) => !isPlanningLine(line))
    .filter((line) => audience !== 'student' || !isTeacherOnlyLine(line));
}

function paragraphs(content, audience) {
  return lines(content, audience)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('\n');
}

function sectionHtml(section, index, audience) {
  const keyPoints = (Array.isArray(section.keyPoints) ? section.keyPoints : [])
    .map((point) => `<li>${escapeHtml(plainText(point))}</li>`)
    .join('');
  const aiBadge = section.aiDraft
    ? ' <span style="font-size:12px;font-weight:400;color:#b45309;border:1px solid #f59e0b;border-radius:4px;padding:1px 5px">AI 草稿，需审校</span>'
    : '';
  const example = section.example && section.example.statement
    ? `<div class="keypoints"><h3>本节示例</h3><p>${escapeHtml(plainText(section.example.statement))}</p>${audience !== 'student' && section.example.answer ? `<p><strong>示例答案：</strong>${escapeHtml(plainText(section.example.answer))}</p>` : ''}</div>`
    : '';
  return `<section class="panel${index === 0 ? ' active' : ''}" id="panel-${index}" data-panel="${index}">
  <div class="panel-head">
    <span class="eyebrow">第 ${index + 1} 节</span>
    <h2>${escapeHtml(section.title)}${aiBadge}</h2>
  </div>
  <div class="prose">${paragraphs(section.content, audience) || '<p class="muted">内容待补充。</p>'}</div>
  ${keyPoints ? `<div class="keypoints"><h3>本节点</h3><ul>${keyPoints}</ul></div>` : ''}
  ${example}
</section>`;
}

function timelineHtml(timeline) {
  return (Array.isArray(timeline) ? timeline : [])
    .map((slot) => `<div class="slot"><strong>${escapeHtml(slot.title)}</strong><span>${slot.startMinute}–${slot.endMinute} 分钟</span></div>`)
    .join('');
}

function examplesHtml(examples) {
  return (Array.isArray(examples) ? examples : [])
    .map((item) => {
      const steps = (Array.isArray(item.steps) ? item.steps : [])
        .map((step) => `<li>${escapeHtml(plainText(step))}</li>`)
        .join('');
      const pitfalls = (Array.isArray(item.pitfalls) ? item.pitfalls : [])
        .map((pitfall) => `<li>${escapeHtml(plainText(pitfall))}</li>`)
        .join('');
      return `<details class="example">
  <summary><span>${escapeHtml(item.title || '例题')}</span><span class="tag">展开步骤</span></summary>
  <p class="problem">${escapeHtml(plainText(item.problem))}</p>
  ${steps ? `<ol>${steps}</ol>` : ''}
  ${pitfalls ? `<div class="pitfall"><strong>易错点</strong><ul>${pitfalls}</ul></div>` : ''}
</details>`;
    })
    .join('');
}

function exercisesHtml(exercises, audience) {
  const showAnswers = audience !== 'student';
  return (Array.isArray(exercises) ? exercises : [])
    .map((item, index) => {
      const answer = showAnswers
        ? `<details class="answer"><summary>查看答案</summary><p><strong>答案：</strong>${escapeHtml(plainText(item.answer))}</p><p><strong>解析：</strong>${escapeHtml(plainText(item.explanation))}</p></details>`
        : '<p class="muted">先独立完成，答案在教师版中核对。</p>';
      return `<article class="exercise">
  <div class="exercise-head"><span class="tag">${escapeHtml(item.level || '练习')}</span><span class="tag ghost">${escapeHtml(item.type || '')}</span></div>
  <p><strong>${index + 1}.</strong> ${escapeHtml(plainText(item.prompt))}</p>
  ${answer}
</article>`;
    })
    .join('');
}

function boardHtml(boardPlan) {
  const sentences = (Array.isArray(boardPlan && boardPlan.keySentences) ? boardPlan.keySentences : [])
    .map((sentence) => `<li>${escapeHtml(plainText(sentence))}</li>`)
    .join('');
  if (!sentences) return '';
  return `<section class="card board"><h2>板书要点</h2><ul>${sentences}</ul></section>`;
}

export function renderHtml(spec, options = {}) {
  const audience = options.audience === 'student' ? 'student' : 'teacher';
  const meta = spec.meta || {};
  const objectives = (Array.isArray(spec.objectives) ? spec.objectives : [])
    .map((item) => `<li>${escapeHtml(plainText(item.text))}</li>`)
    .join('');
  const sections = Array.isArray(spec.sections) ? spec.sections : [];
  const timeline = Array.isArray(spec.timeline) ? spec.timeline : [];
  const nav = sections
    .map((section, index) => `<button type="button" class="nav-item${index === 0 ? ' active' : ''}" data-target="${index}">${escapeHtml(section.title)}</button>`)
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.topic || '课时')} · ${meta.durationMinutes || 0} 分钟</title>
<style>
:root{--ink:#172033;--muted:#5b677a;--line:#dbe2ec;--bg:#f5f7fa;--card:#ffffff;--brand:#1f3a5f;--accent:#2e6fb7;--soft:#eaf2fb}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.75 "Microsoft YaHei","PingFang SC",system-ui,sans-serif}
a{color:var(--accent)}
.hero{padding:36px 6vw 22px;background:linear-gradient(135deg,#1f3a5f,#2e6fb7);color:#fff}
.hero h1{margin:0 0 8px;font-size:clamp(26px,4vw,42px)}
.hero p{margin:0;opacity:.9}
.badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.badge{border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:3px 10px;font-size:13px}
.timeline{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:18px}
.slot{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:8px 10px;font-size:12px}
.slot strong{display:block;font-size:13px}
.layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:22px;max-width:1180px;margin:24px auto;padding:0 20px 60px}
.toc{position:sticky;top:18px;align-self:start;display:flex;flex-direction:column;gap:6px}
.nav-item{border:1px solid transparent;background:transparent;text-align:left;padding:9px 10px;border-radius:8px;color:var(--muted);cursor:pointer;font:inherit;font-size:14px}
.nav-item:hover{background:#e9eef5}
.nav-item.active{background:var(--soft);border-color:#c9dcf2;color:var(--brand);font-weight:700}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin-bottom:16px;box-shadow:0 1px 2px rgba(23,32,51,.04)}
.panel{display:none;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px 26px;margin-bottom:16px}
.panel.active{display:block}
.eyebrow{color:var(--accent);font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.panel h2{margin:2px 0 14px;color:var(--brand);font-size:28px}
.prose p{margin:0 0 10px}
.keypoints{margin-top:18px;background:#f8fafc;border-left:4px solid var(--accent);border-radius:0 10px 10px 0;padding:12px 16px}
.keypoints h3{margin:0 0 6px;font-size:15px;color:var(--brand)}
.keypoints ul{margin:0;padding-left:20px}
.muted{color:var(--muted)}
.lab{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(220px,1fr);gap:18px;align-items:center}
canvas{width:100%;height:auto;border:1px solid var(--line);border-radius:10px;background:#fbfdff}
.controls label{display:block;margin:10px 0 4px;font-size:13px;color:var(--muted)}
.controls input[type=range]{width:100%}
.readout{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.readout div{background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px}
.readout strong{display:block;font-size:18px;color:var(--brand)}
.example{border:1px solid var(--line);border-radius:10px;padding:0 14px;margin:10px 0;background:#fff}
.example summary{cursor:pointer;display:flex;justify-content:space-between;gap:10px;padding:12px 0;font-weight:700;color:var(--brand)}
.example .problem{margin:0 0 8px}
.example ol{margin:0 0 10px;padding-left:22px}
.pitfall{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px 12px;margin:8px 0 12px}
.exercise{border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:10px 0;background:#fff}
.exercise-head{display:flex;gap:6px;margin-bottom:6px}
.tag{display:inline-block;background:var(--soft);color:var(--brand);border-radius:999px;padding:1px 9px;font-size:12px}
.tag.ghost{background:#f1f5f9;color:var(--muted)}
.answer{margin-top:8px;border-top:1px dashed var(--line);padding-top:8px}
.answer summary{cursor:pointer;color:var(--accent);font-weight:700}
.board ul{margin:0;padding-left:20px}
@media (max-width:780px){.layout{grid-template-columns:1fr}.toc{position:static;flex-direction:row;overflow:auto;padding-bottom:4px}.nav-item{white-space:nowrap}.lab{grid-template-columns:1fr}}
</style>
</head>
<body>
<header class="hero">
  <h1>${escapeHtml(meta.topic || '课时')}</h1>
  <p>${escapeHtml(meta.teachingMode || '讲授')} · ${meta.durationMinutes || 0} 分钟 · ${escapeHtml(meta.courseLevel || '本科基础')} · ${escapeHtml(meta.audience || '本科一年级')}</p>
  <div class="badges"><span class="badge">${audience === 'student' ? '学生版' : '教师版'}</span><span class="badge">单文件 · 无外链</span></div>
  <div class="timeline">${timelineHtml(timeline)}</div>
</header>
<div class="layout">
  <nav class="toc" aria-label="章节导航">${nav}</nav>
  <main>
    ${sections.map((section, index) => sectionHtml(section, index, audience)).join('\n')}
    <section class="card">
      <h2>导数实验室</h2>
      <p class="muted">拖动切点与增量，观察割线如何趋近切线。</p>
      <div class="lab">
        <canvas id="plot" width="720" height="420" aria-label="割线与切线演示"></canvas>
        <div class="controls">
          <label>切点 x₀：<span id="x0-value">1.00</span></label>
          <input id="x0" type="range" min="-2.2" max="2.2" step="0.05" value="1">
          <label>增量 h：<span id="h-value">0.80</span></label>
          <input id="h" type="range" min="0.02" max="1.20" step="0.01" value="0.8">
          <div class="readout">
            <div>割线斜率<strong id="secant">—</strong></div>
            <div>切线斜率<strong id="tangent">—</strong></div>
          </div>
        </div>
      </div>
    </section>
    ${examplesHtml(spec.examples) ? `<section class="card"><h2>例题</h2>${examplesHtml(spec.examples)}</section>` : ''}
    <section class="card"><h2>练习</h2>${exercisesHtml(spec.exercises, audience)}</section>
    ${boardHtml(spec.boardPlan)}
    ${objectives ? `<section class="card"><h2>学习目标</h2><ul>${objectives}</ul></section>` : ''}
  </main>
</div>
<script>
(function () {
  var nav = document.querySelectorAll('.nav-item');
  var panels = document.querySelectorAll('.panel');
  nav.forEach(function (button) {
    button.addEventListener('click', function () {
      var target = button.getAttribute('data-target');
      nav.forEach(function (item) { item.classList.toggle('active', item === button); });
      panels.forEach(function (panel) { panel.classList.toggle('active', panel.getAttribute('data-panel') === target); });
    });
  });

  var canvas = document.getElementById('plot');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var x0Input = document.getElementById('x0');
  var hInput = document.getElementById('h');
  var x0Value = document.getElementById('x0-value');
  var hValue = document.getElementById('h-value');
  var secantOut = document.getElementById('secant');
  var tangentOut = document.getElementById('tangent');
  var xMin = -2.5, xMax = 2.5, yMin = -8, yMax = 8;
  function f(x) { return x * x * x - 3 * x; }
  function df(x) { return 3 * x * x - 3; }
  function sx(x) { return 40 + (x - xMin) / (xMax - xMin) * (canvas.width - 80); }
  function sy(y) { return canvas.height - 40 - (y - yMin) / (yMax - yMin) * (canvas.height - 80); }
  function line(a, b, color, width) {
    ctx.beginPath(); ctx.moveTo(sx(a[0]), sy(a[1])); ctx.lineTo(sx(b[0]), sy(b[1]));
    ctx.strokeStyle = color; ctx.lineWidth = width || 2; ctx.stroke();
  }
  function draw() {
    var x0 = Number(x0Input.value), h = Number(hInput.value);
    var y0 = f(x0), y1 = f(x0 + h);
    var secant = (y1 - y0) / h;
    var tangent = df(x0);
    x0Value.textContent = x0.toFixed(2);
    hValue.textContent = h.toFixed(2);
    secantOut.textContent = secant.toFixed(2);
    tangentOut.textContent = tangent.toFixed(2);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    for (var gx = -2; gx <= 2; gx++) line([gx, yMin], [gx, yMax], '#eef2f7', 1);
    for (var gy = -6; gy <= 6; gy += 2) line([xMin, gy], [xMax, gy], '#eef2f7', 1);
    line([xMin, 0], [xMax, 0], '#94a3b8', 1.5);
    line([0, yMin], [0, yMax], '#94a3b8', 1.5);
    ctx.beginPath();
    for (var i = 0; i <= 240; i++) {
      var x = xMin + (xMax - xMin) * i / 240;
      var px = sx(x), py = sy(f(x));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = '#1f3a5f'; ctx.lineWidth = 2.5; ctx.stroke();
    line([x0 - 1.2, y0 - 1.2 * secant], [x0 + h + 1.2, y1 + 1.2 * secant], '#d97706', 2);
    line([x0 - 1.2, y0 - 1.2 * tangent], [x0 + 1.2, y0 + 1.2 * tangent], '#2e6fb7', 2);
    ctx.fillStyle = '#d97706'; ctx.beginPath(); ctx.arc(sx(x0), sy(y0), 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2e6fb7'; ctx.beginPath(); ctx.arc(sx(x0 + h), sy(y1), 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#334155'; ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText('P', sx(x0) + 8, sy(y0) - 8);
    ctx.fillText('Q', sx(x0 + h) + 8, sy(y1) - 8);
  }
  x0Input.addEventListener('input', draw);
  hInput.addEventListener('input', draw);
  draw();
})();
</script>
</body>
</html>`;
}

export default renderHtml;
