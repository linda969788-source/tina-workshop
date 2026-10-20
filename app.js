'use strict';
/* Tina小作坊 — 个人工作台。所有数据只存在本机浏览器（localStorage）。 */

/* ================= utils ================= */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
const todayStr = () => ymd(new Date());
const WEEK = ['一', '二', '三', '四', '五', '六', '日'];
const weekdayName = d => '周' + WEEK[(d.getDay() + 6) % 7];
const fmtMD = d => `${d.getMonth() + 1}月${d.getDate()}日`;
const fmtDate = s => { if (!s) return ''; const d = parseYmd(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekdayName(d)}`; };
const shortYmd = s => s ? s.replace(/-/g, '/') : '';
const fmtTime = ts => { const d = new Date(ts); return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const money = n => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '#';
const dash = '<span class="muted">—</span>';
const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99');
const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || 0) - (a.created || 0);
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ================= store ================= */
const STORE_KEY = 'tina-workshop-v1';
const NEWS_KEY = 'tina-news-v1';
const LISTS = ['plans', 'events', 'eamBanks', 'eamChannels', 'fundProjects', 'fundTodos', 'hrTodos', 'hrMeetings',
  'complianceTodos', 'partners', 'evTodos', 'evSummaries', 'fitness'];

function defaults() {
  const d = { settings: { firstUse: Date.now() } };
  LISTS.forEach(k => { d[k] = []; });
  return d;
}
function normalize(raw) {
  const d = defaults();
  if (raw && typeof raw === 'object') {
    LISTS.forEach(k => { if (Array.isArray(raw[k])) d[k] = raw[k]; });
    if (raw.settings && typeof raw.settings === 'object') d.settings = Object.assign(d.settings, raw.settings);
  }
  return d;
}
function load() {
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return normalize(JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
  return defaults();
}
let db = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (e) { toast('保存失败：这个浏览器不允许存储数据'); }
}
function commit(msg) { save(); render(false); if (msg) toast(msg); }

/* ================= module config ================= */
const STAGES = ['初步接触', '资料准备', 'KYC 审核', '开户中', '已签约', '暂停'];
const STAGE_CLS = { '初步接触': 's1', '资料准备': 's2', 'KYC 审核': 's3', '开户中': 's4', '已签约': 's5', '暂停': 's0' };
const stagePill = s => s ? `<span class="pill ${STAGE_CLS[s] || ''}">${esc(s)}</span>` : dash;
const txt = k => r => r[k] ? esc(r[k]) : dash;
const bold = k => r => `<b>${esc(r[k])}</b>`;
const clip = k => r => r[k] ? `<span class="clip">${esc(r[k])}</span>` : dash;
const dateCol = k => r => r[k] ? `<span class="nowrap">${shortYmd(r[k])}</span>` : dash;
const kids = r => r.clients || [];
const signedCol = r => {
  const k = kids(r);
  if (!k.length) return dash;
  const s = k.filter(c => c.stage === '已签约').length;
  return `<span class="mini"><span class="bar sm"><i style="width:${s / k.length * 100}%"></i></span>已签约 ${s}/${k.length}</span>`;
};
const periodCol = r => {
  if (!r.start && !r.end) return dash;
  const t = todayStr();
  let tag = '';
  if (r.end && r.end < t) tag = '<span class="tag bad">已到期</span>';
  else if (r.end && daysBetween(t, r.end) <= 30) tag = '<span class="tag warn">即将到期</span>';
  return `<span class="nowrap">${shortYmd(r.start) || '?'} ~ ${shortYmd(r.end) || '?'}</span>${tag}`;
};

const CLIENT_FIELDS = [
  { k: 'name', label: '客户名字', req: true },
  { k: 'stage', label: '签约进度', type: 'select', options: STAGES },
  { k: 'aum', label: '资产规模', ph: '例如 USD 5M' },
  { k: 'date', label: '推荐日期', type: 'date', def: 'today' },
  { k: 'note', label: '备注', type: 'textarea' },
];
const TODO_FIELDS = [
  { k: 'title', label: '待办主题', req: true },
  { k: 'detail', label: '具体事项', type: 'textarea', rows: 4 },
  { k: 'owner', label: '负责人员' },
  { k: 'due', label: '截止日期', type: 'date' },
  { k: 'progress', label: '事件进度', type: 'progress' },
];
const partnerOrg = (title, nameLabel, shareLabel, childTitle) => ({
  group: 'Prospera', title, kind: 'table', noun: nameLabel.replace('名字', ''), titleKey: 'name',
  fields: [
    { k: 'name', label: nameLabel, req: true },
    { k: 'share', label: shareLabel, ph: '例如 30%' },
    { k: 'contact', label: '对接人' },
    { k: 'note', label: '备注', type: 'textarea' },
  ],
  cols: [
    { label: nameLabel, get: bold('name') },
    { label: shareLabel, get: txt('share') },
    { label: '推荐客户数量', get: r => kids(r).length, cls: 'num' },
    { label: '签约进度', get: signedCol },
  ],
  child: { store: 'clients', noun: '客户', title: childTitle, fields: CLIENT_FIELDS },
});

const MODULES = {
  'eam-bank': { ...partnerOrg('EAM 合作银行和券商跟进以及管理', '金融机构名字', '机构分红', '推荐客户'), store: 'eamBanks', noun: '机构' },
  'eam-channel': { ...partnerOrg('EAM 渠道跟进以及管理', '渠道名字', '渠道分红', '渠道推荐的客户'), store: 'eamChannels', noun: '渠道' },
  'fund-project': {
    group: 'Prospera', title: '基金项目进度', kind: 'cards', store: 'fundProjects', noun: '基金项目', titleKey: 'project', progressLabel: '项目进度',
    fields: [
      { k: 'project', label: '基金项目名字', req: true },
      { k: 'fundName', label: 'Fund Name' },
      { k: 'mandate', label: 'Fund Mandate', type: 'textarea' },
      { k: 'custody', label: 'Custody Bank' },
      { k: 'admin', label: 'Fund Admin' },
      { k: 'size', label: 'Fund Size', ph: '例如 USD 50M' },
      { k: 'progress', label: '项目进度', type: 'progress' },
      { k: 'note', label: '备注', type: 'textarea' },
    ],
    cardMeta: x => [x.fundName && esc(x.fundName), x.custody && ('🏦 ' + esc(x.custody)), x.size && ('💰 ' + esc(x.size))].filter(Boolean).join('<br>'),
  },
  'fund-todo': {
    group: 'Prospera', title: '基金待办事件', kind: 'cards', store: 'fundTodos', noun: '待办', titleKey: 'title', completable: true, progressLabel: '进度',
    fields: [
      { k: 'title', label: '标题', req: true },
      { k: 'detail', label: '详细信息', type: 'textarea', rows: 4 },
      { k: 'owner', label: '负责人员' },
      { k: 'due', label: '截止日期', type: 'date' },
      { k: 'progress', label: '进度', type: 'progress' },
    ],
  },
  'hr': { group: 'Prospera', title: 'HR 会议记录以及待办事件', kind: 'combo', parts: ['hr-todo', 'hr-meeting'] },
  'hr-todo': { group: 'Prospera', page: 'hr', title: '待办事项', kind: 'cards', store: 'hrTodos', noun: '待办', titleKey: 'title', completable: true, fields: TODO_FIELDS },
  'hr-meeting': {
    group: 'Prospera', page: 'hr', title: '会议记录', kind: 'table', store: 'hrMeetings', noun: '会议记录', titleKey: 'topic', sort: byDateDesc,
    fields: [
      { k: 'date', label: '会议日期', type: 'date', def: 'today', req: true },
      { k: 'topic', label: '会议主题', req: true },
      { k: 'attendees', label: '参会人员' },
      { k: 'content', label: '会议内容', type: 'textarea', rows: 5 },
      { k: 'actions', label: '跟进事项', type: 'textarea' },
    ],
    cols: [
      { label: '日期', get: dateCol('date') },
      { label: '会议主题', get: bold('topic') },
      { label: '参会人员', get: txt('attendees') },
      { label: '跟进事项', get: clip('actions') },
    ],
  },
  'compliance': { group: 'Prospera', title: '公司合规待办事件', kind: 'cards', store: 'complianceTodos', noun: '合规待办', titleKey: 'title', completable: true, fields: TODO_FIELDS },
  'partners': {
    group: 'Prospera', title: '公司合作方以及负责人', kind: 'table', store: 'partners', noun: '合作方', titleKey: 'name',
    fields: [
      { k: 'name', label: '合作方名字', req: true },
      { k: 'matter', label: '负责事项', type: 'textarea' },
      { k: 'owner', label: '负责人' },
      { k: 'start', label: '签约开始日期', type: 'date' },
      { k: 'end', label: '签约结束日期', type: 'date' },
      { k: 'note', label: '备注', type: 'textarea' },
    ],
    cols: [
      { label: '合作方名字', get: bold('name') },
      { label: '负责事项', get: clip('matter') },
      { label: '负责人', get: txt('owner') },
      { label: '签约时间段', get: periodCol },
    ],
  },
  'ev-todo': { group: 'Evereach', title: '待办事件', kind: 'cards', store: 'evTodos', noun: '待办', titleKey: 'title', completable: true, fields: TODO_FIELDS },
  'ev-summary': {
    group: 'Evereach', title: '渠道总结', kind: 'table', store: 'evSummaries', noun: '总结', titleKey: 'channel', sort: byDateDesc,
    fields: [
      { k: 'date', label: '日期', type: 'date', def: 'today', req: true },
      { k: 'channel', label: '渠道名字', req: true },
      { k: 'summary', label: '总结', type: 'textarea', rows: 5 },
      { k: 'next', label: '下一步', type: 'textarea' },
    ],
    cols: [
      { label: '日期', get: dateCol('date') },
      { label: '渠道', get: bold('channel') },
      { label: '总结', get: clip('summary') },
      { label: '下一步', get: clip('next') },
    ],
  },
};
const listHref = mod => '#/m/' + (MODULES[mod].page || mod);
const findItem = (mod, id) => db[MODULES[mod].store].find(x => x.id === id);

const NAV = [
  { href: '#/home', label: '首页', icon: '🏠' },
  { href: '#/daily', label: '每日计划', icon: '📝' },
  { group: 'Evereach', items: [['#/m/ev-todo', '待办事件'], ['#/m/ev-summary', '渠道总结']] },
  {
    group: 'Prospera', items: [
      ['#/m/eam-bank', 'EAM 合作银行和券商'], ['#/m/eam-channel', 'EAM 渠道跟进'], ['#/m/fund-project', '基金项目进度'],
      ['#/m/fund-todo', '基金待办事件'], ['#/m/hr', 'HR 会议记录及待办'], ['#/m/compliance', '公司合规待办'], ['#/m/partners', '合作方以及负责人'],
    ],
  },
  { href: '#/fitness', label: '健身 Package', icon: '💪' },
  { href: '#/settings', label: '设置与备份', icon: '⚙️' },
];

/* ================= forms ================= */
function fieldHtml(f, v) {
  const id = 'f_' + f.k;
  if (v == null || v === '') v = f.def === 'today' ? todayStr() : (f.type === 'progress' ? 0 : '');
  const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : '';
  let input;
  switch (f.type) {
    case 'textarea': input = `<textarea id="${id}" name="${f.k}" rows="${f.rows || 3}"${ph}>${esc(v)}</textarea>`; break;
    case 'select': input = `<select id="${id}" name="${f.k}">${f.options.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`; break;
    case 'progress': input = `<div class="range-row"><input id="${id}" type="range" name="${f.k}" min="0" max="100" step="5" value="${Number(v) || 0}"><output>${Number(v) || 0}%</output></div>`; break;
    case 'date': input = `<input id="${id}" type="date" name="${f.k}" value="${esc(v)}">`; break;
    case 'time': input = `<input id="${id}" type="time" name="${f.k}" value="${esc(v)}">`; break;
    case 'number': input = `<input id="${id}" type="number" inputmode="decimal" min="0" step="any" name="${f.k}" value="${esc(v)}"${ph}>`; break;
    case 'pin': input = `<input id="${id}" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" name="${f.k}">`; break;
    default: input = `<input id="${id}" type="text" name="${f.k}" value="${esc(v)}"${ph}>`;
  }
  return `<div class="field${f.full ? ' full' : ''}"><label for="${id}">${esc(f.label)}${f.req ? ' <b>*</b>' : ''}</label>${input}</div>`;
}
function readFields(form, fields) {
  const out = {};
  for (const f of fields) {
    const el = form.elements[f.k];
    const raw = el ? el.value.trim() : '';
    out[f.k] = (f.type === 'progress' || f.type === 'number') ? (raw === '' ? '' : Number(raw)) : raw;
    if (f.req && out[f.k] === '') {
      el.classList.add('invalid'); el.focus();
      toast(`请填写「${f.label}」`);
      return null;
    }
  }
  return out;
}
function openForm({ title, fields, values = {}, submitLabel = '保存', onSave, onDelete }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<form class="modal" novalidate>
    <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="关闭">×</button></div>
    <div class="modal-body">${fields.map(f => fieldHtml(f, values[f.k])).join('')}</div>
    <div class="modal-foot">${onDelete ? '<button type="button" class="btn danger" data-delete>删除</button>' : ''}<span class="sp"></span>
      <button type="button" class="btn" data-close>取消</button><button type="submit" class="btn primary">${esc(submitLabel)}</button></div>
  </form>`;
  document.body.appendChild(wrap);
  document.body.classList.add('noscroll');
  const form = $('form', wrap);
  const close = () => { wrap.remove(); document.body.classList.remove('noscroll'); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', e => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
    else if (e.target.closest('[data-delete]') && confirm('确定删除吗？删除后无法恢复。')) { close(); onDelete(); }
  });
  form.addEventListener('input', e => {
    e.target.classList.remove('invalid');
    if (e.target.type === 'range') e.target.nextElementSibling.textContent = e.target.value + '%';
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = readFields(form, fields);
    if (!v) return;
    close();
    onSave(v);
  });
  if (matchMedia('(pointer: fine)').matches) {
    const first = form.querySelector('.modal-body input:not([type=range]), .modal-body textarea, .modal-body select');
    if (first) first.focus();
  }
}

/* ================= generic module views ================= */
const emptyHtml = (msg, ico = '🌸') => `<div class="empty"><span class="e-ico">${ico}</span>${esc(msg)}</div>`;
const cardTab = {};

function kvHtml(fields, x) {
  return fields.map(f => {
    let v = x[f.k];
    if (v === '' || v == null) v = dash;
    else if (f.type === 'date') v = esc(fmtDate(v));
    else if (f.type === 'select') v = stagePill(v);
    else if (f.type === 'textarea') v = `<div class="pre">${esc(v)}</div>`;
    else v = esc(v);
    return `<dt>${esc(f.label)}</dt><dd>${v}</dd>`;
  }).join('');
}
function addBtn(mod) {
  return `<button class="btn primary sm" data-act="add" data-mod="${mod}">＋ 新增${esc(MODULES[mod].noun)}</button>`;
}

function tableSection(mod, withHeading) {
  const M = MODULES[mod];
  const rows = [...db[M.store]];
  if (M.sort) rows.sort(M.sort);
  const head = `<div class="sec-head">${withHeading ? `<h2>${esc(M.title)}</h2>` : `<span class="muted small">共 ${rows.length} 条 · 点一行看详情</span>`}${addBtn(mod)}</div>`;
  if (!rows.length) return head + emptyHtml(`还没有${M.noun}，点「新增${M.noun}」开始记录`);
  return head + `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th class="idx">#</th>${M.cols.map(c => `<th class="${c.cls || ''}">${esc(c.label)}</th>`).join('')}<th class="act">删除</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr data-href="#/m/${mod}/${r.id}"><td class="idx">${i + 1}</td>${M.cols.map(c => `<td class="${c.cls || ''}">${c.get(r)}</td>`).join('')}
      <td class="act"><button class="icon-btn sm del" data-act="del" data-mod="${mod}" data-id="${r.id}" aria-label="删除">🗑</button></td></tr>`).join('')}</tbody>
  </table></div>`;
}

function dueHtml(due, done) {
  if (!due) return '';
  const t = todayStr();
  if (!done && due < t) return `<span class="overdue">⏰ 已逾期 ${shortYmd(due).slice(5)}</span>`;
  if (!done && due === t) return `<span class="overdue">⏰ 今天截止</span>`;
  return `📅 ${shortYmd(due).slice(5)} 截止`;
}
function cardHtml(mod, x) {
  const M = MODULES[mod];
  const prog = Number(x.progress) || 0;
  const meta = M.cardMeta ? M.cardMeta(x) : [x.owner && ('👤 ' + esc(x.owner)), dueHtml(x.due, x.done)].filter(Boolean).join('<br>');
  const foot = x.done
    ? `<span class="badge good">✓ ${x.doneAt ? shortYmd(x.doneAt).slice(5) + ' ' : ''}已完成</span>`
    : `<div class="bar"><i style="width:${prog}%"></i></div><span class="pct">${prog}%</span>`;
  return `<a class="sq${x.done ? ' is-done' : ''}" href="#/m/${mod}/${x.id}"><div class="sq-title">${esc(x[M.titleKey])}</div><div class="sq-meta">${meta}</div><div class="sq-foot">${foot}</div></a>`;
}
function cardsSection(mod, withHeading) {
  const M = MODULES[mod];
  const all = db[M.store];
  let list = [...all];
  let tabs = '';
  if (M.completable) {
    const tab = cardTab[mod] || 'open';
    const open = all.filter(x => !x.done), done = all.filter(x => x.done);
    tabs = `<div class="tabs">
      <button class="${tab === 'open' ? 'on' : ''}" data-act="tab" data-mod="${mod}" data-tab="open">进行中 <b>${open.length}</b></button>
      <button class="${tab === 'done' ? 'on' : ''}" data-act="tab" data-mod="${mod}" data-tab="done">已完成 <b>${done.length}</b></button></div>`;
    list = tab === 'open'
      ? open.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.created - b.created)
      : done.sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    if (!list.length) return secHead(mod, withHeading) + tabs + emptyHtml(tab === 'open' ? '没有进行中的事项，真棒！' : '还没有完成的事项', tab === 'open' ? '✨' : '🌷');
  }
  if (!list.length) return secHead(mod, withHeading) + tabs + emptyHtml(`还没有${M.noun}，点「新增${M.noun}」开始记录`);
  return secHead(mod, withHeading) + tabs + `<div class="grid-sq">${list.map(x => cardHtml(mod, x)).join('')}</div>`;
}
function secHead(mod, withHeading) {
  return `<div class="sec-head">${withHeading ? `<h2>${esc(MODULES[mod].title)}</h2>` : '<span></span>'}${addBtn(mod)}</div>`;
}
const sectionFor = (mod, withHeading) => MODULES[mod].kind === 'table' ? tableSection(mod, withHeading) : cardsSection(mod, withHeading);

function viewModule(mod) {
  const M = MODULES[mod];
  pageTitle = M.title;
  const body = M.kind === 'combo'
    ? M.parts.map(p => `<section class="block">${sectionFor(p, true)}</section>`).join('')
    : sectionFor(mod, false);
  return `<div class="page-head"><div class="eyebrow">${esc(M.group)}</div><h1>${esc(M.title)}</h1></div>${body}`;
}

function crumbs(mod) {
  const parent = MODULES[MODULES[mod].page || mod];
  return `<div class="crumbs"><a href="${listHref(mod)}">‹ ${esc(parent.title)}</a></div>`;
}
function viewDetail(mod, id) {
  const M = MODULES[mod];
  const x = findItem(mod, id);
  pageTitle = M.title;
  if (!x) return crumbs(mod) + emptyHtml('找不到这条记录，可能已经删除了', '🔍');
  const ids = `data-mod="${mod}" data-id="${x.id}"`;
  const rest = M.fields.filter(f => f.k !== M.titleKey && f.type !== 'progress');

  if (M.kind === 'cards') {
    const prog = Number(x.progress) || 0;
    const status = M.completable ? (x.done ? `<span class="badge good">✓ 已完成${x.doneAt ? ' · ' + shortYmd(x.doneAt) : ''}</span>` : '<span class="badge">进行中</span>') : '';
    return `${crumbs(mod)}
      <div class="detail-head"><div><h1>${esc(x[M.titleKey])}</h1>${status}</div></div>
      <section class="card prog-big">
        <div class="prog-label"><span>${esc(M.progressLabel || '事件进度')}</span><b data-prog-out>${prog}%</b></div>
        <div class="bar big"><i data-prog-bar style="width:${prog}%"></i></div>
        ${x.done ? '' : `<input type="range" min="0" max="100" step="5" value="${prog}" data-prog ${ids} aria-label="调整进度">`}
      </section>
      <section class="card"><dl class="kv">${kvHtml(rest, x)}</dl></section>
      <div class="detail-actions">
        ${M.completable ? (x.done ? `<button class="btn" data-act="undo" ${ids}>↺ 恢复为进行中</button>` : `<button class="btn primary" data-act="done" ${ids}>✓ 标记完成</button>`) : ''}
        <button class="btn" data-act="edit" ${ids}>✎ 编辑</button>
        <button class="btn danger" data-act="del" ${ids}>删除</button>
      </div>`;
  }

  let child = '';
  if (M.child) {
    const C = M.child;
    const list = x[C.store] || [];
    const counts = STAGES.map(s => [s, list.filter(c => c.stage === s).length]).filter(([, n]) => n);
    child = `<section class="block">
      <div class="sec-head"><h2>${esc(C.title)}（${list.length}）</h2><button class="btn primary sm" data-act="child-add" ${ids}>＋ 新增${esc(C.noun)}</button></div>
      ${counts.length ? `<div class="stage-sum">${counts.map(([s, n]) => `<span class="pill ${STAGE_CLS[s]}">${esc(s)} ${n}</span>`).join('')}</div>` : ''}
      ${list.length ? `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th class="idx">#</th><th>客户名字</th><th>签约进度</th><th>资产规模</th><th>推荐日期</th><th>备注</th><th class="act">删除</th></tr></thead>
        <tbody>${list.map((c, i) => `<tr data-act="child-edit" ${ids} data-cid="${c.id}"><td class="idx">${i + 1}</td><td><b>${esc(c.name)}</b></td><td>${stagePill(c.stage)}</td>
          <td>${c.aum ? esc(c.aum) : dash}</td><td>${dateCol('date')(c)}</td><td>${clip('note')(c)}</td>
          <td class="act"><button class="icon-btn sm del" data-act="child-del" ${ids} data-cid="${c.id}" aria-label="删除">🗑</button></td></tr>`).join('')}</tbody>
      </table></div>` : emptyHtml(`还没有${C.noun}，点「新增${C.noun}」添加`)}
    </section>`;
  }
  return `${crumbs(mod)}
    <div class="detail-head"><h1>${esc(x[M.titleKey])}</h1>
      <div class="detail-actions"><button class="btn sm" data-act="edit" ${ids}>✎ 编辑</button><button class="btn danger sm" data-act="del" ${ids}>删除</button></div></div>
    <section class="card"><dl class="kv">${kvHtml(rest, x)}</dl></section>
    ${child}`;
}

/* ================= home: calendar + news + tiles ================= */
let calStart = mondayOf(new Date());
let calAnim = '';

function calHtml() {
  const t = todayStr();
  const end = addDays(calStart, 27);
  let cells = '';
  for (let i = 0; i < 28; i++) {
    const d = addDays(calStart, i), ds = ymd(d);
    const evs = db.events.filter(e => e.date === ds).sort(byTime);
    const pls = db.plans.filter(p => p.date === ds && !p.done);
    const items = [
      ...evs.map(e => ({ c: 'ev', time: e.time, t: e.title })),
      ...pls.map(p => ({ c: 'pl', t: p.text })),
    ];
    const first = d.getDate() === 1 || i === 0;
    const cls = ['cell', ds === t && 'today', ds < t && 'past', i % 7 >= 5 && 'wkend', d.getDate() === 1 && 'month-start'].filter(Boolean).join(' ');
    cells += `<a class="${cls}" href="#/daily/${ds}" aria-label="${fmtDate(ds)}，${items.length} 项">
      <span class="dnum">${first ? `${d.getMonth() + 1}/${d.getDate()}` : d.getDate()}</span>
      ${items.slice(0, 3).map(x => `<span class="chip ${x.c}">${x.time ? `<span class="ct">${esc(x.time)} </span>` : ''}${esc(x.t)}</span>`).join('')}
      ${items.length > 3 ? `<span class="more">+${items.length - 3}</span>` : ''}</a>`;
  }
  const isCurrent = ymd(calStart) === ymd(mondayOf(new Date()));
  return `<div class="cal-head">
      <div><div class="cal-range">${calStart.getFullYear()}年 ${fmtMD(calStart)} – ${fmtMD(end)}</div>
      <div class="cal-sub">${isCurrent ? '本周起的未来四周 · 左右滑动看前后' : '← 左右滑动看前后 →'}</div></div>
      <div class="cal-nav"><button class="icon-btn" data-act="cal-prev" aria-label="往前四周">‹</button>
      ${isCurrent ? '' : '<button class="btn sm" data-act="cal-today">回到本周</button>'}
      <button class="icon-btn" data-act="cal-next" aria-label="往后四周">›</button></div>
    </div>
    <div class="cal-week">${WEEK.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="cal-grid ${calAnim}">${cells}</div>
    <div class="cal-legend"><span><i class="dot ev"></i>事件提醒</span><span><i class="dot pl"></i>未完成的每日计划</span><span>点日期可以新增</span></div>`;
}
function redrawCal() { const el = $('#cal'); if (el) el.innerHTML = calHtml(); calAnim = ''; }
function shiftCal(days) { calStart = addDays(calStart, days); calAnim = days > 0 ? 'slide-l' : 'slide-r'; redrawCal(); }
function bindCalSwipe() {
  const el = $('#cal');
  if (!el) return;
  let sx = null, sy = null;
  el.addEventListener('touchstart', e => {
    const p = e.touches[0];
    if (p.clientX < 28) { sx = null; return; } // 左边缘留给导航手势
    sx = p.clientX; sy = p.clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (sx == null) return;
    const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftCal(dx < 0 ? 28 : -28);
  }, { passive: true });
  let wheelLock = 0;
  el.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) < 30 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (Date.now() < wheelLock) return;
    wheelLock = Date.now() + 600;
    shiftCal(e.deltaX > 0 ? 28 : -28);
  }, { passive: false });
}

/* ---- news: 先直接读 NYT RSS，连不上再经 rss2json 读 BBC；每天 09:00 更新 ---- */
const NEWS_API = 'https://api.rss2json.com/v1/api.json?rss_url=';
const FEEDS = [
  { id: 'asia', label: '亚洲', flag: '🌏', sources: [
    { name: 'NYT', rss: 'https://rss.nytimes.com/services/xml/rss/nyt/AsiaPacific.xml' },
    { name: 'BBC', json: 'http://feeds.bbci.co.uk/news/world/asia/rss.xml' }] },
  { id: 'us', label: '美国', flag: '🗽', sources: [
    { name: 'NYT', rss: 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml' },
    { name: 'BBC', json: 'http://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml' }] },
];
let newsTab = 'asia', newsLoading = false, newsError = '', newsTimer = null;
function readNews() { try { return JSON.parse(localStorage.getItem(NEWS_KEY)) || null; } catch (e) { return null; } }
function lastNine(now = new Date()) { const b = new Date(now); b.setHours(9, 0, 0, 0); if (now < b) b.setDate(b.getDate() - 1); return b; }
function nextNine(now = new Date()) { const b = new Date(now); b.setHours(9, 0, 0, 0); if (now >= b) b.setDate(b.getDate() + 1); return b; }
async function fetchSource(s) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    let items;
    if (s.rss) {
      const r = await fetch(s.rss, { signal: ctrl.signal });
      const xml = new DOMParser().parseFromString(await r.text(), 'text/xml');
      items = [...xml.querySelectorAll('item')].map(it => ({
        title: it.querySelector('title')?.textContent.trim(),
        link: it.querySelector('link')?.textContent.trim(),
      }));
    } else {
      const j = await (await fetch(NEWS_API + encodeURIComponent(s.json), { signal: ctrl.signal })).json();
      if (j.status !== 'ok' || !Array.isArray(j.items)) throw new Error(j.message || 'feed error');
      items = j.items.map(it => ({ title: it.title, link: it.link }));
    }
    items = items.filter(it => it.title).slice(0, 10);
    if (!items.length) throw new Error('empty feed');
    return { source: s.name, items };
  } finally { clearTimeout(timer); }
}
async function fetchFeed(f) {
  let lastErr;
  for (const s of f.sources) {
    try { return await fetchSource(s); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
async function loadNews(force) {
  const cache = readNews();
  if (!force && cache && cache.fetchedAt >= lastNine().getTime()) return;
  if (newsLoading) return;
  newsLoading = true; newsError = ''; redrawNews();
  try {
    const lists = await Promise.all(FEEDS.map(fetchFeed));
    const data = { fetchedAt: Date.now(), feeds: {}, sources: {} };
    FEEDS.forEach((f, i) => { data.feeds[f.id] = lists[i].items; data.sources[f.id] = lists[i].source; });
    try { localStorage.setItem(NEWS_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
  } catch (e) {
    newsError = cache ? '暂时连不上新闻源，先显示上次的新闻' : '暂时连不上新闻源，稍后会再试';
  }
  newsLoading = false;
  redrawNews();
}
function scheduleNews() {
  clearTimeout(newsTimer);
  newsTimer = setTimeout(() => { loadNews(false); scheduleNews(); }, Math.min(nextNine() - Date.now() + 2000, 2 ** 31 - 1));
}
function newsHtml() {
  const c = readNews();
  const col = f => {
    const items = c && c.feeds && c.feeds[f.id] || [];
    return `<div class="news-col ${f.id}"><h3>${f.flag} ${f.label}前 10 大新闻</h3>${items.length
      ? `<ol>${items.map(it => `<li><a href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener noreferrer">${esc(it.title)}</a></li>`).join('')}</ol>`
      : `<p class="muted">${newsLoading ? '正在获取新闻…' : '暂时没有新闻'}</p>`}</div>`;
  };
  return `<div class="sec-head"><h2>📰 亚洲 & 美国 前 10 大新闻</h2>
      <div class="news-tabs">${FEEDS.map(f => `<button class="${newsTab === f.id ? 'on' : ''}" data-act="news-tab" data-tab="${f.id}">${f.flag} ${f.label}</button>`).join('')}</div></div>
    <div class="news-cols show-${newsTab}">${FEEDS.map(col).join('')}</div>
    <div class="news-foot"><span>${newsError ? '⚠️ ' + esc(newsError) + ' · ' : ''}${newsLoading ? '更新中… · ' : ''}来源 ${c && c.sources ? [...new Set(Object.values(c.sources))].join(' / ') : 'NYT / BBC'} · ${c ? '更新于 ' + fmtTime(c.fetchedAt) : '尚未更新'} · 每天早上 9:00 自动更新</span>
      <button class="icon-btn sm" data-act="news-refresh" aria-label="立即刷新新闻" title="立即刷新">↻</button></div>`;
}
function redrawNews() { const el = $('#news'); if (el) el.innerHTML = newsHtml(); }

function tilesHtml() {
  const t = todayStr();
  const open = s => db[s].filter(x => !x.done).length;
  const clients = s => db[s].reduce((a, x) => a + kids(x).length, 0);
  const fitLeft = db.fitness.reduce((a, p) => a + Math.max(0, (Number(p.total) || 0) - (p.checkins || []).length), 0);
  const tiles = [
    ['#/daily', '📝', '每日计划', `今天未完成 ${db.plans.filter(p => p.date === t && !p.done).length} 项`],
    ['#/m/ev-todo', '🌱', 'Evereach 待办', `进行中 ${open('evTodos')} 项`],
    ['#/m/ev-summary', '📒', 'Evereach 渠道总结', `${db.evSummaries.length} 条`],
    ['#/m/eam-bank', '🏦', 'EAM 银行/券商', `${db.eamBanks.length} 家 · 客户 ${clients('eamBanks')}`],
    ['#/m/eam-channel', '🤝', 'EAM 渠道', `${db.eamChannels.length} 个 · 客户 ${clients('eamChannels')}`],
    ['#/m/fund-project', '📈', '基金项目进度', `${db.fundProjects.length} 个项目`],
    ['#/m/fund-todo', '🗂️', '基金待办', `进行中 ${open('fundTodos')} 项`],
    ['#/m/hr', '👥', 'HR', `待办 ${open('hrTodos')} · 会议 ${db.hrMeetings.length}`],
    ['#/m/compliance', '🛡️', '合规待办', `进行中 ${open('complianceTodos')} 项`],
    ['#/m/partners', '📇', '合作方', `${db.partners.length} 家`],
    ['#/fitness', '💪', '健身 Package', `剩余 ${fitLeft} 次`],
  ];
  return tiles.map(([h, i, n, s]) => `<a class="tile" href="${h}"><span class="t-ico">${i}</span><span class="t-name">${n}</span><span class="t-stat">${s}</span></a>`).join('');
}
function backupNotice() {
  const has = LISTS.some(k => db[k].length);
  const base = db.settings.lastBackup || db.settings.firstUse || Date.now();
  const days = Math.floor((Date.now() - base) / 86400000);
  if (!has || days < 14) return '';
  return `<div class="notice"><span>💾 已经 ${days} 天没有备份了，换手机或清缓存会丢数据哦</span><a class="btn sm" href="#/settings">去备份</a></div>`;
}
function viewHome() {
  pageTitle = '';
  after = () => { bindCalSwipe(); loadNews(false); };
  return `${backupNotice()}
    <section class="card cal-card" id="cal">${calHtml()}</section>
    <section class="card" id="news">${newsHtml()}</section>
    <h2 class="sec-title">💜 我的模块</h2>
    <div class="tiles">${tilesHtml()}</div>`;
}

/* ================= daily plan / events ================= */
const EVENT_FIELDS = [
  { k: 'title', label: '事件 / 约会', req: true, ph: '例如 和 XX 银行开会' },
  { k: 'date', label: '日期', type: 'date', def: 'today', req: true },
  { k: 'time', label: '时间（可不填）', type: 'time' },
  { k: 'note', label: '备注', type: 'textarea' },
];
function relLabel(ds) {
  const n = daysBetween(todayStr(), ds);
  if (n === 0) return '今天';
  if (n === 1) return '明天';
  if (n === -1) return '昨天';
  return n > 0 ? `${n} 天后` : `${-n} 天前`;
}
function viewDaily(ds) {
  if (!ds || !/^\d{4}-\d{2}-\d{2}$/.test(ds)) ds = todayStr();
  pageTitle = '每日计划';
  const t = todayStr(), d = parseYmd(ds);
  const plans = db.plans.filter(p => p.date === ds).sort((a, b) => (a.done - b.done) || (a.created - b.created));
  const evs = db.events.filter(e => e.date === ds).sort(byTime);
  const overdue = ds === t ? db.plans.filter(p => p.date < t && !p.done).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const planLi = (p, showFrom) => `<li class="${p.done ? 'done' : ''}">
      <label><input type="checkbox" data-plan-toggle="${p.id}"${p.done ? ' checked' : ''}><span>${esc(p.text)}</span></label>
      ${showFrom ? `<span class="from">${shortYmd(p.date).slice(5)}</span><button class="btn sm" data-act="plan-today" data-id="${p.id}">移到今天</button>` : ''}
      <button class="icon-btn sm del" data-act="plan-del" data-id="${p.id}" aria-label="删除">×</button></li>`;
  return `<div class="page-head"><h1>每日计划</h1></div>
    <div class="card day-head">
      <button class="icon-btn" data-act="day-shift" data-n="-1" data-date="${ds}" aria-label="前一天">‹</button>
      <div class="day-title"><div class="big">${d.getMonth() + 1}月${d.getDate()}日 ${weekdayName(d)}</div><div class="sub">${relLabel(ds)}</div></div>
      <button class="icon-btn" data-act="day-shift" data-n="1" data-date="${ds}" aria-label="后一天">›</button>
    </div>
    <div class="day-tools"><input type="date" value="${ds}" data-day-pick aria-label="选择日期">${ds !== t ? '<a class="btn sm" href="#/daily">回到今天</a>' : ''}</div>
    <section class="card">
      <div class="sec-head"><h2>📝 每日计划</h2><span class="muted small">完成 ${plans.filter(p => p.done).length}/${plans.length}</span></div>
      <form class="add-row" data-add-plan="${ds}"><input name="text" placeholder="加一条计划，按回车保存" autocomplete="off"><button class="btn primary" type="submit">添加</button></form>
      ${plans.length ? `<ul class="checklist">${plans.map(p => planLi(p, false)).join('')}</ul>` : '<p class="muted small">这天还没有计划</p>'}
    </section>
    <section class="card">
      <div class="sec-head"><h2>⏰ 事件提醒 / Appt</h2><button class="btn primary sm" data-act="ev-add" data-date="${ds}">＋ 新增</button></div>
      ${evs.length ? `<ul class="ev-list">${evs.map(e => `<li data-act="ev-edit" data-id="${e.id}"><span class="ev-time">${e.time ? esc(e.time) : '全天'}</span>
        <div class="ev-body"><b>${esc(e.title)}</b>${e.note ? `<div class="muted small pre">${esc(e.note)}</div>` : ''}</div></li>`).join('')}</ul>` : '<p class="muted small">这天没有事件，点「新增」记一个约会或提醒</p>'}
    </section>
    ${overdue.length ? `<section class="card"><div class="sec-head"><h2>🌧️ 之前没做完的（${overdue.length}）</h2></div><ul class="checklist">${overdue.map(p => planLi(p, true)).join('')}</ul></section>` : ''}`;
}

/* ================= fitness ================= */
const FIT_FIELDS = [
  { k: 'name', label: 'Package 名字', req: true, ph: '例如 私教课 20 节' },
  { k: 'total', label: '总共次数', type: 'number', req: true },
  { k: 'cost', label: '总共费用', type: 'number' },
  { k: 'start', label: '购买日期', type: 'date', def: 'today' },
  { k: 'note', label: '备注', type: 'textarea', full: true },
];
function fitStats(p) {
  const total = Number(p.total) || 0, used = (p.checkins || []).length, cost = Number(p.cost) || 0;
  const unit = total ? cost / total : 0;
  return { total, used, left: Math.max(0, total - used), cost, unit };
}
function viewFitness() {
  pageTitle = '健身 Package';
  const list = db.fitness;
  return `<div class="page-head"><h1>健身 Package</h1></div>
    <div class="sec-head"><span class="muted small">一个 package 一个页面，点进去打卡</span><button class="btn primary sm" data-act="fit-add">＋ 新增 Package</button></div>
    ${list.length ? `<div class="grid-sq">${list.map(p => {
      const s = fitStats(p);
      return `<a class="sq" href="#/fitness/${p.id}"><div class="sq-title">💪 ${esc(p.name)}</div>
        <div class="sq-meta">剩余 <b style="font-size:20px">${s.left}</b> / ${s.total} 次<br>已打卡 ${s.used} 次${s.cost ? `<br>总费用 ${money(s.cost)}` : ''}</div>
        <div class="sq-foot"><div class="bar"><i style="width:${s.total ? s.used / s.total * 100 : 0}%"></i></div><span class="pct">${s.total ? Math.round(s.used / s.total * 100) : 0}%</span></div></a>`;
    }).join('')}</div>` : emptyHtml('还没有健身 package，点「新增 Package」开始', '💪')}`;
}
function viewFitnessDetail(id) {
  const p = db.fitness.find(x => x.id === id);
  pageTitle = '健身 Package';
  const back = '<div class="crumbs"><a href="#/fitness">‹ 健身 Package</a></div>';
  if (!p) return back + emptyHtml('找不到这个 package，可能已经删除了', '🔍');
  const s = fitStats(p);
  const ins = [...(p.checkins || [])].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const stat = (label, val, hl) => `<div class="stat${hl ? ' hl' : ''}"><div class="s-label">${label}</div><div class="s-val">${val}</div></div>`;
  return `${back}
    <div class="detail-head"><h1>💪 ${esc(p.name)}</h1></div>
    <div class="stats">
      ${stat('剩下次数', s.left, true)}${stat('总共次数', s.total)}${stat('已打卡', s.used + ' 次')}
      ${stat('总共费用', money(s.cost))}${stat('每次费用', money(s.unit))}${stat('剩余价值', money(s.unit * s.left))}
    </div>
    <section class="card">
      <div class="sec-head"><h2>打卡</h2><span class="muted small">已用 ${s.total ? Math.round(s.used / s.total * 100) : 0}%</span></div>
      <div class="bar big" style="margin-bottom:14px"><i style="width:${s.total ? Math.min(100, s.used / s.total * 100) : 0}%"></i></div>
      <div class="add-row"><input type="date" id="fitDate" value="${todayStr()}" aria-label="打卡日期"><button class="btn primary" data-act="fit-checkin" data-id="${p.id}">💪 打卡</button></div>
      ${ins.length ? `<ul class="checkins">${ins.map((c, i) => ({ c, n: i + 1 })).reverse().map(({ c, n }) => `<li><span class="no">第 ${n} 次</span><span class="d">${esc(fmtDate(c.date))}</span>
        <button class="icon-btn sm del" data-act="fit-uncheck" data-id="${p.id}" data-cid="${c.id}" aria-label="删除这次打卡">×</button></li>`).join('')}</ul>` : '<p class="muted small">还没有打卡记录</p>'}
    </section>
    <section class="card">
      <div class="sec-head"><h2>Package 资料</h2></div>
      <form data-fit-form="${p.id}" novalidate>
        <div class="form-grid">${FIT_FIELDS.map(f => fieldHtml(f, p[f.k])).join('')}</div>
        <div class="detail-actions"><button class="btn primary" type="submit">保存</button><button type="button" class="btn danger" data-act="fit-del" data-id="${p.id}">删除这个 Package</button></div>
      </form>
    </section>`;
}

/* ================= settings / backup / PIN ================= */
async function hashPin(pin) {
  const s = 'tina-workshop:' + pin;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (const ch of s) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return 'x' + h.toString(16);
}
function viewSettings() {
  pageTitle = '设置与备份';
  const st = db.settings;
  const count = LISTS.reduce((a, k) => a + db[k].length, 0);
  return `<div class="page-head"><h1>设置与备份</h1></div>
    <section class="card"><div class="settings-row"><div><h2>💾 备份数据</h2>
      <p class="muted small">所有资料只存在这台设备的浏览器里（目前 ${count} 条）。建议每两周备份一次；换手机、在电脑和手机之间同步，都是用「导出」再「导入」。</p>
      <p class="small">${st.lastBackup ? '上次备份：' + fmtTime(st.lastBackup) : '还没有备份过'}</p></div>
      <div class="detail-actions"><button class="btn primary" data-act="export">导出备份</button><button class="btn" data-act="import">导入备份</button></div></div></section>
    <section class="card"><div class="settings-row"><div><h2>🔒 PIN 锁</h2>
      <p class="muted small">打开 app 时要先输入 PIN，离开超过 5 分钟会自动上锁。PIN 只用来防别人随手打开，忘了的话只能清除浏览器数据（资料也会一起清掉），所以记得先备份。</p></div>
      <div class="detail-actions">${st.pinHash ? '<button class="btn" data-act="pin-set">修改 PIN</button><button class="btn danger" data-act="pin-off">关闭 PIN</button>' : '<button class="btn primary" data-act="pin-set">设置 PIN</button>'}</div></div></section>
    <section class="card"><h2>📰 新闻</h2><p class="muted small">来源 New York Times（Asia Pacific、U.S. 版块），连不上时改用 BBC News。每天早上 9:00 之后第一次打开时自动更新，开着 app 过 9 点也会自动刷新。在中国内地可能连不上，香港可以正常使用。</p></section>
    <p class="muted small" style="text-align:center">Tina小作坊 · v1 · 做给 Tina 的小工作台 ♥</p>`;
}
async function exportData() {
  const payload = JSON.stringify({ app: 'tina-workshop', version: 1, exportedAt: new Date().toISOString(), data: db }, null, 2);
  const name = `Tina小作坊备份-${todayStr()}.json`;
  const file = new File([payload], name, { type: 'application/json' });
  const coarse = matchMedia('(pointer: coarse)').matches;
  try {
    if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast('导出失败，请再试一次'); return;
  }
  db.settings.lastBackup = Date.now();
  commit('备份文件已生成');
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const j = JSON.parse(reader.result);
      const data = j && j.data ? j.data : j;
      if (!data || !LISTS.some(k => Array.isArray(data[k]))) throw new Error('bad');
      if (!confirm('导入会用备份文件替换这台设备上现在的所有资料，确定吗？')) return;
      const pin = db.settings.pinHash;
      db = normalize(data);
      if (!db.settings.pinHash && pin) db.settings.pinHash = pin;
      db.settings.lastBackup = Date.now();
      commit('导入成功');
    } catch (e) { toast('这不是 Tina小作坊 的备份文件'); }
  };
  reader.readAsText(file);
}

/* ---- lock screen ---- */
let hiddenAt = 0;
function showLock() {
  $('#main').innerHTML = '';
  $('#lock').hidden = false;
  $('#lockPin').value = '';
  $('#lockMsg').textContent = '';
  setTimeout(() => $('#lockPin').focus(), 50);
}
$('#lockForm').addEventListener('submit', async e => {
  e.preventDefault();
  const h = await hashPin($('#lockPin').value);
  if (h === db.settings.pinHash) { $('#lock').hidden = true; render(); }
  else { $('#lockMsg').textContent = 'PIN 不对，再试一次'; $('#lockPin').value = ''; }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (db.settings.pinHash && hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) showLock();
  else if (currentRoute() === 'home') loadNews(false);
});

/* ================= actions ================= */
const ACTIONS = {
  'menu': () => ($('#drawer').classList.contains('open') ? closeDrawer() : openDrawer()),
  'close-drawer': () => closeDrawer(),

  'add': ({ mod }) => {
    const M = MODULES[mod];
    openForm({
      title: `新增${M.noun}`, fields: M.fields, submitLabel: '创建',
      onSave: v => {
        const item = { id: uid(), created: Date.now(), ...v };
        if (M.child) item[M.child.store] = [];
        if (M.completable) item.done = false;
        db[M.store].push(item);
        if (M.completable) cardTab[mod] = 'open';
        commit('已创建');
      },
    });
  },
  'edit': ({ mod, id }) => {
    const M = MODULES[mod], x = findItem(mod, id);
    if (!x) return;
    openForm({
      title: `编辑${M.noun}`, fields: M.fields, values: x,
      onSave: v => { Object.assign(x, v); commit('已保存'); },
      onDelete: () => removeItem(mod, id),
    });
  },
  'del': ({ mod, id }) => { if (confirm('确定删除吗？删除后无法恢复。')) removeItem(mod, id); },
  'done': ({ mod, id }) => {
    const x = findItem(mod, id);
    if (!x) return;
    Object.assign(x, { done: true, doneAt: todayStr(), progress: 100 });
    save();
    cardTab[mod] = 'open';
    location.hash = listHref(mod);
    toast('完成啦！已移到「已完成」');
  },
  'undo': ({ mod, id }) => { const x = findItem(mod, id); if (x) { x.done = false; x.doneAt = ''; commit('已恢复为进行中'); } },
  'tab': ({ mod, tab }) => { cardTab[mod] = tab; render(false); },

  'child-add': ({ mod, id }) => {
    const C = MODULES[mod].child, x = findItem(mod, id);
    openForm({
      title: `新增${C.noun}`, fields: C.fields, submitLabel: '添加',
      onSave: v => { (x[C.store] = x[C.store] || []).push({ id: uid(), created: Date.now(), ...v }); commit('已添加'); },
    });
  },
  'child-edit': ({ mod, id, cid }) => {
    const C = MODULES[mod].child, x = findItem(mod, id);
    const c = (x[C.store] || []).find(k => k.id === cid);
    if (!c) return;
    openForm({
      title: `编辑${C.noun}`, fields: C.fields, values: c,
      onSave: v => { Object.assign(c, v); commit('已保存'); },
      onDelete: () => { x[C.store] = x[C.store].filter(k => k.id !== cid); commit('已删除'); },
    });
  },
  'child-del': ({ mod, id, cid }) => {
    const C = MODULES[mod].child, x = findItem(mod, id);
    if (confirm('确定删除这位客户吗？')) { x[C.store] = x[C.store].filter(k => k.id !== cid); commit('已删除'); }
  },

  'cal-prev': () => shiftCal(-28),
  'cal-next': () => shiftCal(28),
  'cal-today': () => { calStart = mondayOf(new Date()); calAnim = 'slide-r'; redrawCal(); },
  'news-refresh': () => loadNews(true),
  'news-tab': ({ tab }) => { newsTab = tab; redrawNews(); },

  'day-shift': ({ n, date }) => { location.hash = '#/daily/' + ymd(addDays(parseYmd(date), Number(n))); },
  'plan-del': ({ id }) => { db.plans = db.plans.filter(p => p.id !== id); commit('已删除'); },
  'plan-today': ({ id }) => { const p = db.plans.find(x => x.id === id); if (p) { p.date = todayStr(); commit('已移到今天'); } },
  'ev-add': ({ date }) => openForm({
    title: '新增事件提醒', fields: EVENT_FIELDS, values: { date }, submitLabel: '创建',
    onSave: v => { db.events.push({ id: uid(), created: Date.now(), ...v }); commit('已创建'); },
  }),
  'ev-edit': ({ id }) => {
    const ev = db.events.find(e => e.id === id);
    if (!ev) return;
    openForm({
      title: '编辑事件提醒', fields: EVENT_FIELDS, values: ev,
      onSave: v => { Object.assign(ev, v); commit('已保存'); },
      onDelete: () => { db.events = db.events.filter(e => e.id !== id); commit('已删除'); },
    });
  },

  'fit-add': () => openForm({
    title: '新增健身 Package', fields: FIT_FIELDS, submitLabel: '创建',
    onSave: v => { const p = { id: uid(), created: Date.now(), ...v, checkins: [] }; db.fitness.push(p); save(); location.hash = '#/fitness/' + p.id; toast('已创建'); },
  }),
  'fit-checkin': ({ id }) => {
    const p = db.fitness.find(x => x.id === id);
    const date = $('#fitDate').value || todayStr();
    const s = fitStats(p);
    if (s.total && s.left <= 0 && !confirm('这个 package 已经用完了，还要继续打卡吗？')) return;
    (p.checkins = p.checkins || []).push({ id: uid(), date });
    commit(`打卡成功！还剩 ${Math.max(0, s.left - 1)} 次`);
  },
  'fit-uncheck': ({ id, cid }) => {
    const p = db.fitness.find(x => x.id === id);
    if (confirm('删除这次打卡记录？')) { p.checkins = p.checkins.filter(c => c.id !== cid); commit('已删除'); }
  },
  'fit-del': ({ id }) => {
    if (!confirm('确定删除这个 package 和它的所有打卡记录吗？')) return;
    db.fitness = db.fitness.filter(x => x.id !== id);
    save(); location.hash = '#/fitness'; toast('已删除');
  },

  'export': () => exportData(),
  'import': () => $('#importFile').click(),
  'pin-set': () => openForm({
    title: db.settings.pinHash ? '修改 PIN' : '设置 PIN',
    fields: [{ k: 'p1', label: '新 PIN（4-8 位数字）', type: 'pin', req: true }, { k: 'p2', label: '再输入一次', type: 'pin', req: true }],
    onSave: async v => {
      if (!/^\d{4,8}$/.test(v.p1)) return toast('PIN 要 4-8 位数字');
      if (v.p1 !== v.p2) return toast('两次输入的 PIN 不一样');
      db.settings.pinHash = await hashPin(v.p1);
      commit('PIN 已设置');
    },
  }),
  'pin-off': () => { if (confirm('确定关闭 PIN 锁吗？')) { delete db.settings.pinHash; commit('PIN 已关闭'); } },
};
function removeItem(mod, id) {
  const M = MODULES[mod];
  db[M.store] = db[M.store].filter(x => x.id !== id);
  save();
  if (location.hash.includes('/' + id)) location.hash = listHref(mod);
  else render(false);
  toast('已删除');
}

document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a && !e.target.closest('input[type=checkbox], label')) {
    const fn = ACTIONS[a.dataset.act];
    if (fn) { e.preventDefault(); fn({ ...a.dataset }, a); }
    return;
  }
  const r = e.target.closest('[data-href]');
  if (r) location.hash = r.dataset.href;
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-plan-toggle]')) {
    const p = db.plans.find(x => x.id === t.dataset.planToggle);
    if (p) { p.done = t.checked; commit(p.done ? '完成一项 ✓' : ''); }
  } else if (t.matches('[data-day-pick]') && t.value) {
    location.hash = '#/daily/' + t.value;
  } else if (t.matches('[data-prog]')) {
    const x = findItem(t.dataset.mod, t.dataset.id);
    if (x) { x.progress = Number(t.value); save(); toast('进度已更新'); }
  } else if (t.id === 'importFile' && t.files[0]) {
    importData(t.files[0]); t.value = '';
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('[data-prog]')) {
    $('[data-prog-out]').textContent = t.value + '%';
    $('[data-prog-bar]').style.width = t.value + '%';
  } else if (t.classList) t.classList.remove('invalid');
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.matches('[data-add-plan]')) {
    e.preventDefault();
    const text = f.elements.text.value.trim();
    if (!text) return;
    db.plans.push({ id: uid(), created: Date.now(), date: f.dataset.addPlan, text, done: false });
    commit('已添加');
    const input = $('[data-add-plan] input');
    if (input) input.focus();
  } else if (f.matches('[data-fit-form]')) {
    e.preventDefault();
    const p = db.fitness.find(x => x.id === f.dataset.fitForm);
    const v = readFields(f, FIT_FIELDS);
    if (p && v) { Object.assign(p, v); commit('已保存并更新'); }
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#drawer').classList.contains('open')) closeDrawer();
  if (e.key === 'Enter' && e.target.matches('tr[data-href], .ev-list li')) e.target.click();
});

/* ================= drawer ================= */
function buildNav() {
  $('#drawer').innerHTML = `<div class="drawer-brand"><img src="icons/icon-192.png" alt=""><div><b>Tina小作坊</b><div class="muted small">我的小工作台</div></div></div>
    ${NAV.map(n => n.group
      ? `<div class="nav-group">${esc(n.group)}</div>${n.items.map(([h, l]) => `<a class="nav-link sub" href="${h}">${esc(l)}</a>`).join('')}`
      : `<a class="nav-link" href="${n.href}"><span class="nav-ico">${n.icon}</span>${esc(n.label)}</a>`).join('')}
    <div class="nav-foot">♥ 资料只存在这台设备里<br>记得定期到「设置与备份」导出</div>`;
}
function openDrawer() { $('#drawer').classList.add('open'); $('#scrim').classList.add('show'); $('#handle').classList.add('hide'); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#scrim').classList.remove('show'); $('#handle').classList.remove('hide'); }
(function drawerGestures() {
  let sx = null, sy = null, edge = false;
  document.addEventListener('touchstart', e => {
    const p = e.touches[0];
    sx = p.clientX; sy = p.clientY; edge = sx < 28;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (sx == null) return;
    const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
    const open = $('#drawer').classList.contains('open');
    if (Math.abs(dx) > 50 && Math.abs(dy) < 60) {
      if (dx > 0 && edge && !open) openDrawer();
      else if (dx < 0 && open) closeDrawer();
    }
    sx = null;
  }, { passive: true });
  // 桌面：按住小标志往右拖也能打开
  const h = $('#handle');
  let px = null;
  h.addEventListener('pointerdown', e => { px = e.clientX; });
  window.addEventListener('pointerup', e => { if (px != null && e.clientX - px > 30) openDrawer(); px = null; });
})();

/* ================= router ================= */
let pageTitle = '', after = null;
const currentRoute = () => (location.hash.replace(/^#\/?/, '') || 'home').split('/')[0];
function navKey() {
  const [p0, p1] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  if (p0 === 'm' && MODULES[p1]) return '#/m/' + (MODULES[p1].page || p1);
  return '#/' + p0;
}
function render(scrollTop = true) {
  if (!$('#lock').hidden) return;
  const [p0, p1, p2] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  after = null;
  let html;
  try {
    if (p0 === 'home') html = viewHome();
    else if (p0 === 'daily') html = viewDaily(p1);
    else if (p0 === 'm' && MODULES[p1]) html = p2 ? viewDetail(p1, p2) : viewModule(p1);
    else if (p0 === 'fitness') html = p1 ? viewFitnessDetail(p1) : viewFitness();
    else if (p0 === 'settings') html = viewSettings();
    else { location.replace('#/home'); return; }
  } catch (err) {
    console.error(err);
    html = `<div class="card">页面出错了：${esc(err.message)}</div>`;
  }
  $('#main').innerHTML = html;
  $('#topTitle').textContent = pageTitle;
  const key = navKey();
  document.querySelectorAll('.nav-link').forEach(a => a.classList.toggle('active', a.getAttribute('href') === key));
  $$rows();
  if (after) after();
  if (scrollTop) { closeDrawer(); window.scrollTo(0, 0); }
}
function $$rows() { document.querySelectorAll('tr[data-href], tr[data-act], .ev-list li').forEach(r => { r.tabIndex = 0; }); }
window.addEventListener('hashchange', () => render(true));

/* ================= boot ================= */
buildNav();
if (db.settings.pinHash) showLock(); else render();
scheduleNews();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
