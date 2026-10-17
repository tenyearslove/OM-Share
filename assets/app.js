import { GitHubClient, detectConfig, detectType, extractTitle, MANIFEST_PATH } from './core.js';

const $ = (id) => document.getElementById(id);
const STORE = 'om-share:settings';
const TOKEN = 'om-share:token';

let fileName = '';
let lastUrl = '';

// ---- settings ---------------------------------------------------------------

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
  const auto = detectConfig(location.href);
  return {
    apiBase: saved.apiBase || auto.apiBase,
    owner: saved.owner || auto.owner,
    repo: saved.repo || auto.repo,
    branch: saved.branch || '',
    token: sessionStorage.getItem(TOKEN) || localStorage.getItem(TOKEN) || '',
    remember: saved.remember !== false,
  };
}

function fillSettings(s) {
  for (const k of ['apiBase', 'owner', 'repo', 'branch', 'token']) $(k).value = s[k];
  $('remember').checked = s.remember;
  const root = s.apiBase.includes('api.github.com') ? 'https://github.com' : s.apiBase.replace(/\/api\/v3\/?$/, '');
  $('tokenLink').href = `${root || 'https://github.com'}/settings/tokens/new?scopes=public_repo&description=OM-Share`;
}

function readSettings() {
  return {
    apiBase: $('apiBase').value.trim().replace(/\/+$/, ''),
    owner: $('owner').value.trim(),
    repo: $('repo').value.trim(),
    branch: $('branch').value.trim(),
    token: $('token').value.trim(),
    remember: $('remember').checked,
  };
}

function saveSettings(s) {
  const { token, ...rest } = s;
  localStorage.setItem(STORE, JSON.stringify(rest));
  sessionStorage.setItem(TOKEN, token);
  if (s.remember) localStorage.setItem(TOKEN, token);
  else localStorage.removeItem(TOKEN);
}

function client(s = readSettings()) {
  return new GitHubClient(s);
}

async function checkConnection() {
  const s = readSettings();
  if (!s.token) { $('conn').textContent = '토큰을 입력하세요'; return null; }
  $('conn').textContent = '확인 중…';
  try {
    const gh = client(s);
    const [user, repo] = await Promise.all([gh.getUser(), gh.getRepo()]);
    if (!s.branch) { s.branch = repo.default_branch; $('branch').value = s.branch; }
    saveSettings(s);
    const canPush = repo.permissions ? repo.permissions.push : true;
    $('conn').textContent = canPush ? `${user.login} 으로 연결됨` : `${user.login}: 이 리포에 쓰기 권한이 없습니다`;
    $('who').textContent = user.login;
    return { user, repo, s };
  } catch (e) {
    $('conn').textContent = `연결 실패: ${e.message}`;
    return null;
  }
}

// ---- input ------------------------------------------------------------------

function setText(text, name = '') {
  $('text').value = text;
  fileName = name;
  updateKind();
}

function updateKind() {
  const text = $('text').value;
  if (!text.trim()) { $('kind').textContent = ''; return; }
  const type = detectType(text, fileName);
  $('kind').textContent = `${type === 'html' ? 'HTML' : 'Markdown'} · ${extractTitle(text, type, fileName)}`;
}

async function readFile(file) {
  if (file) setText(await file.text(), file.name);
}

function showMsg(text, isErr = false) {
  $('msg').hidden = !text;
  $('msg').textContent = text;
  $('msg').className = `msg${isErr ? ' err' : ''}`;
}

// ---- publish ----------------------------------------------------------------

async function publish() {
  const text = $('text').value;
  if (!text.trim()) { showMsg('올릴 내용이 없습니다.', true); return; }
  if (!readSettings().token) {
    $('settings').open = true;
    $('token').focus();
    showMsg('먼저 설정에서 토큰을 입력하세요.', true);
    return;
  }
  $('publishBtn').disabled = true;
  showMsg('올리는 중…');
  try {
    const conn = await checkConnection();
    if (!conn) throw new Error($('conn').textContent);
    const { user, s } = conn;
    const gh = client(s);
    const type = detectType(text, fileName);
    const title = $('title').value.trim() || extractTitle(text, type, fileName);
    const entry = await gh.publish({ text, type, title, author: user.login, branch: s.branch });
    const pagesBase = (await gh.getPagesUrl()) || new URL('./', location.href).href;
    lastUrl = new URL(entry.path, pagesBase).href;
    showResult(lastUrl);
    showMsg('');
    setText('');
    $('title').value = '';
    renderDocs([entry, ...docs]);
    waitForDeploy(lastUrl);
  } catch (e) {
    showMsg(`실패: ${e.message}`, true);
  } finally {
    $('publishBtn').disabled = false;
  }
}

function showResult(url) {
  $('result').hidden = false;
  $('link').href = url;
  $('link').textContent = url;
  $('shareBtn').hidden = !navigator.share;
  copyLink();
  $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function copyLink() {
  try { await navigator.clipboard.writeText(lastUrl); $('copyBtn').textContent = '복사됨'; }
  catch { $('copyBtn').textContent = '링크 복사'; return; }
  setTimeout(() => { $('copyBtn').textContent = '링크 복사'; }, 1500);
}

// Pages redeploys after each commit; poll until the new page answers.
async function waitForDeploy(url) {
  $('deploy').textContent = 'Pages 반영 중… (보통 1분 안팎)';
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    if (url !== lastUrl) return;
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (res.ok) { $('deploy').textContent = '반영됨 ✓'; return; }
    } catch { /* cross-origin or offline: keep waiting */ }
  }
  $('deploy').textContent = '반영 확인 시간 초과. 링크는 곧 열립니다.';
}

// ---- list -------------------------------------------------------------------

let docs = [];

function renderDocs(list) {
  docs = list;
  const q = $('filter').value.trim().toLowerCase();
  const ul = $('docs');
  ul.textContent = '';
  const shown = docs.filter((d) => !q || `${d.title} ${d.author}`.toLowerCase().includes(q));
  if (!shown.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = docs.length ? '검색 결과가 없습니다' : '아직 올린 문서가 없습니다';
    ul.append(li);
    return;
  }
  for (const d of shown) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = d.path;
    a.textContent = d.title;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${d.author || ''} · ${new Date(d.created).toLocaleDateString()}`;
    li.append(a, meta);
    ul.append(li);
  }
}

async function loadDocs() {
  try {
    const res = await fetch(MANIFEST_PATH, { cache: 'no-cache' });
    renderDocs(res.ok ? await res.json() : []);
  } catch { renderDocs([]); }
}

// ---- wiring -----------------------------------------------------------------

fillSettings(loadSettings());
loadDocs();
if (readSettings().token) checkConnection();

$('text').addEventListener('paste', () => { fileName = ''; });
$('text').addEventListener('input', updateKind);
$('pasteBtn').onclick = async () => {
  try { setText(await navigator.clipboard.readText()); }
  catch { $('text').focus(); showMsg('클립보드를 읽을 수 없습니다. 입력창을 길게 눌러 붙여넣으세요.', true); }
};
$('file').onchange = (e) => readFile(e.target.files[0]);
$('text').addEventListener('dragover', (e) => { e.preventDefault(); $('text').classList.add('drag'); });
$('text').addEventListener('dragleave', () => $('text').classList.remove('drag'));
$('text').addEventListener('drop', (e) => {
  e.preventDefault();
  $('text').classList.remove('drag');
  readFile(e.dataTransfer.files[0]);
});
$('publishBtn').onclick = publish;
$('copyBtn').onclick = copyLink;
$('shareBtn').onclick = () => navigator.share({ url: lastUrl, title: document.title }).catch(() => {});
$('filter').addEventListener('input', () => renderDocs(docs));
$('saveBtn').onclick = checkConnection;
$('resetBtn').onclick = () => {
  localStorage.removeItem(STORE);
  fillSettings({ ...loadSettings(), token: $('token').value, branch: '' });
};
