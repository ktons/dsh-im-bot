// 飞书"任务过程"流式卡片的离线预览生成器。
//
// 直接 import 生产代码所用的同一套卡片 JSON 形态，生成定稿设计的各状态卡片，
// 产出自包含的 preview.html（内置迷你渲染器 + 近似飞书样式 + 动画帧轮播）。
// 用法见工作区 skill：dsh-im-card-preview。
//
//   node scripts/step-card-preview.mjs            # 生成 .preview/step-card-preview.html
//
// 2026-11-25 拍板的定稿设计（finalCard 在此模拟，实现进 stepStreamCard 后由
// 生产函数直接出这些 JSON，本文件的 finalCard 届时退役）：
//   - 无大标题外壳（去掉蓝色 template header，整卡简约）
//   - 同类过程块合并：整 turn 只有一个 🛠️ 工具摘要、一个 💭 思考过程，默认收起
//   - 运行态状态行动画 A："运行中 · / · · / · · ·" 点数渐增
//   - 完成态不重排（不再并入"过程详情"wrapper），只换状态行 + F3 usage footer
//   - F3 footer：独立代码行 `模型 X · 输入 N（缓存 M）· 输出 K`

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, '.preview');
const OUT_FILE = path.join(OUT_DIR, 'step-card-preview.html');

// ── 演示数据 ───────────────────────────────────────────────────────────────

const DEMO_USAGE = { model: 'glm-4.7', inputTokens: 12_345, outputTokens: 1_234, cacheReadTokens: 9_876 };

/** 覆盖渲染器全要素的过程块：面板、中间说明、表格、围栏代码、引用、列表。 */
function demoBlocks() {
  return [
    { kind: 'notes', lines: ['用户要本周群消息汇总，先查历史再整理要点'], omitted: 0 },
    { kind: 'tools', lines: ['✅ group_history — 检索 最近7天 消息', '✅ web_search — “季度 OKR 模板”'], omitted: 0 },
    { kind: 'message', text: '已拿到 **42** 条群消息，正在按主题归类…' },
    { kind: 'tools', lines: ['✅ file_write — 周报-draft.md'], omitted: 0 },
  ];
}

const ANSWER_MD = [
  '### 本周进展',
  '',
  '- **机器人接入**：微信/飞书双通道上线，覆盖 3 个群',
  '- **记忆管线**：自动审查延迟 P95 降至 `1.2s`',
  '',
  '| 指标 | 上周 | 本周 |',
  '|------|------|------|',
  '| 消息量 | 1,204 | 1,877 |',
  '| 失败率 | 0.8% | 0.3% |',
  '',
  '> 风险：token 用量统计尚缺，已列入下周计划。',
  '',
  '详情见附件，或回复 “继续” 展开全部明细。',
].join('\n');

// ── 定稿渲染（模拟实现进 stepStreamCard 后的产出） ─────────────────────────

const fmtK = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const fmtGroup = (n) => n.toLocaleString('en-US');

function collapsedPanel(title, lines) {
  return {
    tag: 'collapsible_panel',
    expanded: false,
    background_color: 'grey-50',
    border: { color: 'grey', corner_radius: '8px' },
    padding: '8px 8px 8px 8px',
    header: {
      title: { tag: 'plain_text', content: title },
      vertical_align: 'center',
      padding: '8px 8px 8px 8px',
      icon: { tag: 'standard_icon', token: 'down-small-ccm_outlined', color: 'grey', size: '16px 16px' },
      icon_position: 'right',
      icon_expanded_angle: -180,
    },
    elements: [{ tag: 'markdown', content: lines.join('\n') }],
  };
}

/**
 * 定稿卡片：无 header 外壳；answer 内容在上；同类过程块各合并成一个收起面板；
 * 状态行在最尾（运行态即动画 A 载体）；完成/停止态追加 F3 usage 代码行。
 * 与生产 stepStreamCard 的关键差异（实现时落地）：header 移除、跨块合并面板、
 * 完成态不再并入"过程详情"wrapper、usage 由 finishStepCard 传入。
 */
function finalCard(blocks, { status = 'running', frame = 0, usage = null } = {}) {
  const elements = [];
  const toolLines = [];
  const noteLines = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const lines = (Array.isArray(block?.lines) ? block.lines : []).filter((line) => typeof line === 'string' && line.trim());
    if (block?.kind === 'tools') toolLines.push(...lines);
    else if (block?.kind === 'notes') noteLines.push(...lines);
    else {
      const text = typeof block?.text === 'string' ? block.text.trim() : '';
      if (text) elements.push({ tag: 'markdown', content: text });
    }
  }
  const omitted = Number(blocks?.omitted) || 0;
  if (toolLines.length) elements.push(collapsedPanel(`🛠️ 工具摘要（${toolLines.length}）`, toolLines));
  if (noteLines.length) elements.push(collapsedPanel(`💭 思考过程（${noteLines.length}）`, noteLines));
  if (elements.length === 0 && status === 'running') {
    // 空内容占位：真机渲染空 markdown 会塌掉，塞一个空白行保住卡片高度。
    elements.push({ tag: 'markdown', content: ' ' });
  }
  if (status === 'running') {
    elements.push({ tag: 'markdown', content: `_运行中 ${['·', '· ·', '· · ·'][frame % 3]}_` });
  } else {
    elements.push({ tag: 'markdown', content: status === 'completed' ? '_已完成_' : '_已停止_' });
    if (usage) {
      elements.push({ tag: 'markdown', content: `\`模型 ${usage.model} · 输入 ${fmtGroup(usage.inputTokens)}（缓存 ${fmtGroup(usage.cacheReadTokens)}）· 输出 ${fmtGroup(usage.outputTokens)}\`` });
    }
  }
  // 定稿：无 header；schema 2.0 允许省略 header，飞书按无标题卡渲染。
  return JSON.stringify({ schema: '2.0', body: { elements } });
}

// ── 页面数据组装 ───────────────────────────────────────────────────────────

const fullTurnBlocks = [...demoBlocks(), { kind: 'message', text: ANSWER_MD }];

const design = {
  fresh: Array.from({ length: 3 }, (_, frame) => finalCard([], { status: 'running', frame })),
  running: Array.from({ length: 3 }, (_, frame) => finalCard(demoBlocks(), { status: 'running', frame })),
  completed: finalCard(fullTurnBlocks, { status: 'completed', usage: DEMO_USAGE }),
  stopped: finalCard(fullTurnBlocks, { status: 'stopped' }),
};

// ── 迷你渲染器 + 页面模板 ──────────────────────────────────────────────────
// 渲染器覆盖卡片实际会产出的子集：markdown（表格/围栏/列表/引用/标题/行内格式）
// + collapsible_panel + hr。仅用于预览，最终效果以飞书客户端为准。

const RENDERER_JS = String.raw`
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function inlineMd(src) {
  const codeSpans = [];
  let text = src.replace(/(\x60+)([\s\S]*?)\1/g, (_, ticks, code) => {
    codeSpans.push('<code>' + esc(code) + '</code>');
    return '\x00' + (codeSpans.length - 1) + '\x00';
  });
  text = esc(text);
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_\w])_([^_\n]+)_(?![\w])/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  text = text.replace(/\x00(\d+)\x00/g, (_, i) => codeSpans[Number(i)]);
  return text;
}

function isTableSeparator(line) { return /^\s*\|?\s*:?-{2,}[\s:|-]*\|?\s*$/.test(line) && line.includes('-'); }
function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function renderMarkdownTable(lines) {
  const header = splitRow(lines[0]);
  const rows = lines.slice(2).map(splitRow);
  let html = '<table><thead><tr>' + header.map((c) => '<th>' + inlineMd(c) + '</th>').join('') + '</tr></thead><tbody>';
  for (const row of rows) html += '<tr>' + header.map((_, i) => '<td>' + inlineMd(row[i] ?? '') + '</td>').join('') + '</tr>';
  return html + '</tbody></table>';
}

function renderMarkdown(src) {
  const lines = String(src ?? '').split('\n');
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s{0,3}(\x60{3,}|~{3,})\s*(\S*)/);
    if (fence) {
      const body = [];
      i += 1;
      while (i < lines.length && !new RegExp('^\\s{0,3}' + fence[1][0] + '{' + fence[1].length + ',}\\s*$').test(lines[i])) body.push(lines[i++]);
      i += 1;
      html += '<pre><code>' + esc(body.join('\n')) + '</code></pre>';
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) { html += '<h' + heading[1].length + '>' + inlineMd(heading[2]) + '</h' + heading[1].length + '>'; i += 1; continue; }
    if (/^\s{0,3}([-*_])\s*\1\s*\1[\s-*_]*$/.test(line)) { html += '<hr>'; i += 1; continue; }
    const quote = line.match(/^\s{0,3}>\s?(.*)$/);
    if (quote) {
      const body = [quote[1]];
      i += 1;
      while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) body.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
      html += '<blockquote>' + inlineMd(body.join(' ')) + '</blockquote>';
      continue;
    }
    if (i + 1 < lines.length && line.includes('|') && isTableSeparator(lines[i + 1])) {
      const table = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) table.push(lines[i++]);
      html += renderMarkdownTable(table);
      continue;
    }
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m || /\d/.test(m[2]) !== ordered) break;
        items.push({ indent: m[1].length, text: m[3] });
        i += 1;
      }
      const renderItems = (level) => {
        let out = ordered && level === 0 ? '<ol>' : '<ul>';
        for (const item of items.filter((it) => Math.min(it.indent, 2) / 2 === level)) {
          out += '<li>' + inlineMd(item.text);
          if (items.some((it) => Math.min(it.indent, 2) / 2 === level + 1)) out += renderItems(level + 1);
          out += '</li>';
        }
        return out + (ordered && level === 0 ? '</ol>' : '</ul>');
      };
      html += renderItems(0);
      continue;
    }
    if (!line.trim()) { i += 1; continue; }
    const para = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^\s{0,3}(#{1,6}\s|>|\x60{3}|[-*+]\s|\d+[.)]\s)/.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))) para.push(lines[i++]);
    html += '<p>' + para.map(inlineMd).join('<br>') + '</p>';
  }
  return html;
}

function renderPanel(el) {
  const title = el.header?.title?.content ?? '';
  return '<details class="fx-panel"' + (el.expanded ? ' open' : '') + '>'
    + '<summary>' + esc(title) + '<span class="fx-arrow">▾</span></summary>'
    + '<div class="fx-panel-body">' + (el.elements ?? []).map((child) => child.tag === 'markdown' ? renderMarkdown(child.content) : '').join('') + '</div>'
    + '</details>';
}

function renderCard(json) {
  let card;
  try { card = JSON.parse(json); } catch { return '<div class="fx-card fx-broken">JSON 解析失败</div>'; }
  const title = card.header?.title?.content ?? '';
  let html = '<div class="fx-card">';
  if (title) html += '<div class="fx-header">' + esc(title) + '</div>';
  html += '<div class="fx-body">';
  for (const el of card.body?.elements ?? []) {
    if (el.tag === 'markdown') html += renderMarkdown(el.content);
    else if (el.tag === 'collapsible_panel') html += renderPanel(el);
    else if (el.tag === 'hr') html += '<hr>';
  }
  return html + '</div></div>';
}
`;

const PAGE_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0 auto; padding: 24px 16px 64px; max-width: 1080px; background: #f2f4f7; color: #1f2329;
  font: 14px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
h1 { font-size: 20px; } h2 { font-size: 16px; margin: 40px 0 6px; }
p.note { margin: 0 0 16px; color: #6b7280; font-size: 12.5px; }
.row { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-start; }
.col { flex: 0 1 440px; min-width: 320px; }
.col h3 { font-size: 13px; color: #374151; margin: 0 0 8px; }
.controls { display: flex; align-items: center; gap: 12px; margin: 12px 0; font-size: 13px; }
.controls select, .controls button { font: inherit; padding: 3px 10px; border: 1px solid #cbd2dc; border-radius: 6px; background: #fff; }
.controls button.playing { background: #3370ff; color: #fff; border-color: #3370ff; }
/* 近似飞书卡片样式（真实渲染以飞书客户端为准） */
.fx-card { background: #fff; border: 1px solid #e2e6ee; border-radius: 10px; overflow: hidden;
  box-shadow: 0 1px 3px rgba(31, 35, 41, .08); }
.fx-header { padding: 10px 16px; background: #eff4ff; color: #3370ff; font-weight: 600; font-size: 14px; }
.fx-body { padding: 12px 16px 14px; }
.fx-body > :first-child { margin-top: 0; } .fx-body > :last-child { margin-bottom: 0; }
.fx-body p { margin: 6px 0; }
.fx-body h1, .fx-body h2, .fx-body h3, .fx-body h4 { margin: 10px 0 4px; line-height: 1.4; }
.fx-body h3 { font-size: 15px; } .fx-body h2 { font-size: 16px; } .fx-body h1 { font-size: 17px; }
.fx-body blockquote { margin: 6px 0; padding: 2px 12px; border-left: 3px solid #b8c7e6; color: #57606a; background: #f7f9fc; }
.fx-body pre { background: #f5f6f7; border-radius: 6px; padding: 10px 12px; overflow: auto; font-size: 12.5px; }
.fx-body code { background: #f2f3f5; border-radius: 4px; padding: 1px 5px; font: 12.5px/1.5 Consolas, monospace; }
.fx-body pre code { background: none; padding: 0; }
.fx-body table { border-collapse: collapse; margin: 8px 0; width: 100%; font-size: 13px; }
.fx-body th, .fx-body td { border: 1px solid #e2e6ee; padding: 4px 10px; text-align: left; }
.fx-body th { background: #f7f9fc; }
.fx-panel { background: #f5f6f7; border: 1px solid #dee0e3; border-radius: 8px; margin: 8px 0; }
.fx-panel summary { cursor: pointer; padding: 8px 12px; font-weight: 600; font-size: 13px; color: #374151; list-style: none;
  display: flex; justify-content: space-between; align-items: center; }
.fx-panel summary::-webkit-details-marker { display: none; }
.fx-panel[open] .fx-arrow { transform: rotate(180deg); }
.fx-arrow { transition: transform .15s; color: #8a919c; }
.fx-panel-body { padding: 2px 12px 10px; }
.fx-json-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.fx-json-bar details { font-size: 12px; color: #6b7280; }
.fx-json-bar pre { max-height: 220px; overflow: auto; background: #fff; border: 1px solid #e2e6ee; border-radius: 6px; padding: 8px; }
.fx-json-bar button { font: inherit; font-size: 12px; padding: 2px 10px; border: 1px solid #cbd2dc; border-radius: 6px; background: #fff; cursor: pointer; }
`;

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cardBlockHtml(id, json) {
  return `<div class="fx-mount" id="${id}"></div>
  <div class="fx-json-bar"><details><summary>卡片 JSON</summary><pre id="${id}-json">${escapeHtml(json)}</pre></details>
  <button data-copy="${id}-json">复制 JSON（可粘进飞书卡片搭建工具）</button></div>`;
}

function jsonEmbed(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>飞书任务过程卡 · 定稿预览</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<h1>飞书“任务过程”流式卡片 · 定稿预览</h1>
<p class="note">2026-11-25 拍板：动画 A（状态行点数渐增）· usage F3（代码行 + 缓存桶）· 面板默认收起 · 同类面板合并 · 去掉大标题外壳 · 完成态不再重排。数据形态为定稿设计（实现进生产 stepStreamCard 后即此输出）。渲染为近似样式，最终以飞书客户端为准。</p>

<h2>四个状态（运行中的两张卡随播放器轮播帧）</h2>
<div class="controls">
  <button id="play" class="playing">暂停</button>
  <label>帧间隔 <select id="interval">
    <option value="500">500ms（仅本地脑补，真机达不到）</option>
    <option value="1000" selected>1000ms（线上节流值）</option>
    <option value="2000">2000ms（降配额方案）</option>
  </select></label>
  <span id="tick-display" style="color:#6b7280"></span>
</div>
<div class="row">
  <div class="col"><h3>刚开卡 · 空内容（对应 eager-open 提案）</h3>
    <div class="fx-mount" id="st-fresh"></div>
    <div class="fx-json-bar"><details><summary>逐帧 JSON</summary>
      ${design.fresh.map((frame, index) => `<details><summary>帧 ${index}</summary><pre>${escapeHtml(frame)}</pre></details>`).join('')}
    </details></div>
  </div>
  <div class="col"><h3>运行中（动画 A）</h3>
    <div class="fx-mount" id="st-running"></div>
    <div class="fx-json-bar"><details><summary>逐帧 JSON</summary>
      ${design.running.map((frame, index) => `<details><summary>帧 ${index}</summary><pre>${escapeHtml(frame)}</pre></details>`).join('')}
    </details></div>
  </div>
</div>
<div class="row">
  <div class="col"><h3>已完成（+ F3 usage footer）</h3>${cardBlockHtml('st-completed', design.completed)}</div>
  <div class="col"><h3>已停止</h3>${cardBlockHtml('st-stopped', design.stopped)}</div>
</div>

<script>${RENDERER_JS}</script>
<script>
const FRAMES = ${jsonEmbed({ fresh: design.fresh, running: design.running })};

let tick = 0;
let timer = null;
function renderAnimated() {
  document.getElementById('st-fresh').innerHTML = renderCard(FRAMES.fresh[tick % FRAMES.fresh.length]);
  document.getElementById('st-running').innerHTML = renderCard(FRAMES.running[tick % FRAMES.running.length]);
  document.getElementById('tick-display').textContent = '帧 ' + (tick % 3) + '（tick ' + tick + '）';
}
document.getElementById('st-completed').innerHTML = renderCard(${jsonEmbed(design.completed)});
document.getElementById('st-stopped').innerHTML = renderCard(${jsonEmbed(design.stopped)});
function startTimer() {
  const interval = Number(document.getElementById('interval').value);
  timer = setInterval(() => { tick += 1; renderAnimated(); }, interval);
}
document.getElementById('interval').addEventListener('change', () => {
  clearInterval(timer); if (document.getElementById('play').classList.contains('playing')) startTimer();
});
document.getElementById('play').addEventListener('click', (event) => {
  const button = event.target;
  if (button.classList.contains('playing')) { clearInterval(timer); button.classList.remove('playing'); button.textContent = '播放'; }
  else { startTimer(); button.classList.add('playing'); button.textContent = '暂停'; }
});
renderAnimated();
startTimer();

document.addEventListener('click', (event) => {
  const id = event.target?.dataset?.copy;
  if (!id) return;
  navigator.clipboard.writeText(document.getElementById(id).textContent)
    .then(() => { event.target.textContent = '已复制'; setTimeout(() => { event.target.textContent = '复制 JSON（可粘进飞书卡片搭建工具）'; }, 1500); });
});
</script>
</body>
</html>`;

await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT_FILE, html, 'utf8');
console.log(`preview written: ${OUT_FILE}`);
