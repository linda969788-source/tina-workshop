'use strict';
/* Microsoft 365 连接（只读）：把 Outlook / Teams 日历显示在月历上。
   浏览器里直接用 OAuth 2.0 授权码 + PKCE 登录，token 和会议资料只留在这台设备，不经过任何第三方服务器。
   这个文件只定义函数，由 app.js 在启动后调用（会用到 app.js 里的 db、save、toast、ymd 等）。 */
const MS_TOKEN_KEY = 'tina-ms-token-v1';
const MS_CACHE_KEY = 'tina-ms-cache-v1';
const MS_PKCE_KEY = 'tina-ms-pkce';
const MS_SCOPES = 'openid profile offline_access User.Read Calendars.Read';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const msRedirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');
const msCfg = () => db.settings.ms || {};
const msAuthority = () => `https://login.microsoftonline.com/${encodeURIComponent(msCfg().tenantId || 'organizations')}/oauth2/v2.0`;
function msReadToken() { try { return JSON.parse(localStorage.getItem(MS_TOKEN_KEY)) || null; } catch (e) { return null; } }
function msWriteToken(t) { try { if (t) localStorage.setItem(MS_TOKEN_KEY, JSON.stringify(t)); else localStorage.removeItem(MS_TOKEN_KEY); } catch (e) { /* ignore */ } }
/** 'off' 还没填应用 ID · 'idle' 填了但没登录 · 'expired' 登录过期 · 'ok' 已连接 */
function msStatus() {
  if (!msCfg().clientId) return 'off';
  const t = msReadToken();
  if (!t) return 'idle';
  return t.refresh || (t.access && Date.now() < t.exp) ? 'ok' : 'expired';
}
function msSetError(msg) {
  db.settings.ms = Object.assign({}, msCfg(), { lastError: msg || '' });
  save();
}
function msErrText(raw) {
  const s = String(raw || '');
  const code = (s.match(/AADSTS\d+/) || [''])[0];
  const hints = {
    AADSTS65001: '公司要求管理员批准这个 App 读取日历，请把应用 ID 发给公司 IT，请他们在 Azure 里点「授予管理员同意」。',
    AADSTS90094: '公司要求管理员批准这个 App，请把应用 ID 发给公司 IT，请他们授予管理员同意。',
    AADSTS90008: '公司要求管理员批准这个 App，请联系公司 IT。',
    AADSTS50011: `重定向网址不对：请在 Azure 的「身份验证」里把重定向 URI 设成 ${msRedirectUri()}`,
    AADSTS9002326: '平台类型不对：请在 Azure 的「身份验证」里，把这个网址加在「单页应用程序 (SPA)」下面，而不是「Web」。',
    AADSTS700016: '找不到这个应用 ID：请检查应用（客户端）ID 和目录（租户）ID 有没有填对。',
    AADSTS90002: '找不到这个租户 ID：请检查目录（租户）ID。',
    AADSTS53003: '公司的安全策略不允许在这台设备上登录（条件访问），请联系公司 IT。',
    AADSTS700084: '登录已过期，请重新连接。',
  };
  if (hints[code]) return `${hints[code]}（${code}）`;
  if (/access_denied|consent/i.test(s)) return '没有完成授权，或公司需要管理员批准。' + (code ? `（${code}）` : '');
  return s.split(/\r?\n/)[0].slice(0, 200);
}

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function randStr(n = 48) { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }

async function msLogin() {
  const cfg = msCfg();
  if (!cfg.clientId) { location.hash = '#/settings'; toast('请先填写应用 ID'); return; }
  if (!(window.crypto && crypto.subtle)) { toast('这个浏览器不支持安全登录，请换 Safari / Chrome / Edge'); return; }
  const verifier = randStr(48), state = randStr(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  try { localStorage.setItem(MS_PKCE_KEY, JSON.stringify({ verifier, state, back: location.hash || '#/home' })); } catch (e) { toast('浏览器不允许存储，无法登录'); return; }
  const p = new URLSearchParams({
    client_id: cfg.clientId, response_type: 'code', redirect_uri: msRedirectUri(), response_mode: 'query',
    scope: MS_SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  if (cfg.me && cfg.me.email) p.set('login_hint', cfg.me.email);
  location.assign(`${msAuthority()}/authorize?${p}`);
}
async function msTokenRequest(params) {
  const body = new URLSearchParams({ client_id: msCfg().clientId, scope: MS_SCOPES, ...params });
  const r = await fetch(`${msAuthority()}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(msErrText(j.error_description || j.error || 'HTTP ' + r.status));
  const t = { access: j.access_token, refresh: j.refresh_token || null, exp: Date.now() + ((j.expires_in || 3600) - 60) * 1000 };
  msWriteToken(t);
  return t;
}
/** 登录回来时网址上会带 ?code=...，在第一次画页面前调用。返回 Promise（换 token），或 null。 */
function msHandleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return null;
  let pk = null;
  try { pk = JSON.parse(localStorage.getItem(MS_PKCE_KEY)); localStorage.removeItem(MS_PKCE_KEY); } catch (e) { /* ignore */ }
  history.replaceState(null, '', location.pathname + ((pk && pk.back) || '#/settings'));
  return (async () => {
    if (q.has('error')) { msSetError(msErrText(q.get('error_description') || q.get('error'))); toast('没有连接成功，详情见「设置与备份」'); return; }
    if (!pk || pk.state !== q.get('state')) { msSetError('登录状态对不上，请再点一次「连接」'); return; }
    try {
      await msTokenRequest({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: msRedirectUri(), code_verifier: pk.verifier });
      msSetError('');
      await msFetchMe().catch(() => {});
      toast('已连接 Microsoft 365 ♥');
    } catch (e) { msSetError(e.message); toast('没有连接成功，详情见「设置与备份」'); }
  })();
}
let msRefreshing = null;
async function msAccessToken() {
  const t = msReadToken();
  if (!t) throw new Error('还没有连接 Microsoft 365');
  if (t.access && Date.now() < t.exp) return t.access;
  if (!t.refresh) throw new Error('登录已过期，请重新连接');
  msRefreshing = msRefreshing || msTokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh })
    .catch(e => { msWriteToken({ access: null, refresh: null, exp: 0 }); throw new Error('登录已过期，请重新连接'); })
    .finally(() => { msRefreshing = null; });
  return (await msRefreshing).access;
}
async function graph(path) {
  const tok = await msAccessToken();
  const r = await fetch(path.startsWith('http') ? path : GRAPH + path, { headers: { Authorization: 'Bearer ' + tok, Prefer: 'outlook.timezone="UTC"' } });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { msWriteToken({ access: null, refresh: (msReadToken() || {}).refresh, exp: 0 }); }
  if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
  return j;
}
async function graphAll(path, max = 500) {
  let url = path;
  const out = [];
  while (url && out.length < max) {
    const j = await graph(url);
    out.push(...(j.value || []));
    url = j['@odata.nextLink'];
  }
  return out;
}
async function msFetchMe() {
  const me = await graph('/me?$select=displayName,mail,userPrincipalName');
  db.settings.ms = Object.assign({}, msCfg(), { me: { name: me.displayName || '', email: (me.mail || me.userPrincipalName || '').toLowerCase() } });
  save();
}
function msDisconnect() {
  msWriteToken(null);
  try { localStorage.removeItem(MS_CACHE_KEY); } catch (e) { /* ignore */ }
  msCache = { events: {}, fetched: {} };
  const cfg = Object.assign({}, msCfg());
  delete cfg.me; delete cfg.lastError;
  db.settings.ms = cfg;
}
const isoZ = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/* ---------------- 日历（只读） ---------------- */
let msCache = (() => { try { return JSON.parse(localStorage.getItem(MS_CACHE_KEY)) || { events: {}, fetched: {} }; } catch (e) { return { events: {}, fetched: {} }; } })();
let msCalError = '';
function msSaveCache() { try { localStorage.setItem(MS_CACHE_KEY, JSON.stringify(msCache)); } catch (e) { /* ignore */ } }
const msEventsOn = ds => msStatus() === 'off' ? [] : (msCache.events[ds] || []);
const utcDate = s => new Date(String(s).replace(/\.\d+$/, '') + 'Z');
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** 读取 start 起 days 天的 Outlook 日历（含 Teams 会议），10 分钟内不重复读。有变化返回 true。 */
async function msSyncCalendar(start, days = 28, force = false) {
  if (msStatus() !== 'ok') return false;
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const key = `${ymd(s)}:${days}`;
  if (!force && msCache.fetched[key] && Date.now() - msCache.fetched[key] < 10 * 60 * 1000) return false;
  const e = addDays(s, days);
  let items;
  try {
    items = await graphAll(`/me/calendarView?startDateTime=${isoZ(s)}&endDateTime=${isoZ(e)}`
      + '&$select=subject,start,end,isAllDay,location,isOnlineMeeting,onlineMeeting,webLink,isCancelled,showAs&$orderby=start/dateTime&$top=200');
    msCalError = '';
  } catch (err) { msCalError = err.message; return true; }
  const inRange = new Set();
  for (let i = 0; i < days; i++) { const ds = ymd(addDays(s, i)); inRange.add(ds); msCache.events[ds] = []; }
  for (const it of items) {
    if (it.isCancelled) continue;
    const base = {
      id: it.id, title: it.subject || '（无主题）', allDay: !!it.isAllDay,
      location: (it.location && it.location.displayName) || '',
      join: (it.onlineMeeting && it.onlineMeeting.joinUrl) || '', link: it.webLink || '', teams: !!it.isOnlineMeeting,
    };
    let first, last;
    if (it.isAllDay) { // 全天事件的日期不用换时区，结束日期是“不含”
      first = parseYmd(it.start.dateTime.slice(0, 10));
      last = addDays(parseYmd(it.end.dateTime.slice(0, 10)), -1);
      if (last < first) last = first;
    } else {
      const st = utcDate(it.start.dateTime), en = utcDate(it.end.dateTime);
      base.time = hhmm(st); base.endTime = hhmm(en);
      first = new Date(st.getFullYear(), st.getMonth(), st.getDate());
      const e1 = new Date(en.getTime() - 1);
      last = new Date(e1.getFullYear(), e1.getMonth(), e1.getDate());
      if (last < first) last = first;
    }
    for (let d = first; d <= last; d = addDays(d, 1)) {
      const ds = ymd(d);
      if (inRange.has(ds)) msCache.events[ds].push(base);
    }
  }
  msCache.fetched[key] = Date.now();
  msSaveCache();
  return true;
}
