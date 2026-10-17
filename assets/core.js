// OM-Share core: talks to the GitHub REST API (github.com or GitHub Enterprise Server).
// Pure ES module with no DOM access, so it runs in the browser and in Node (for tests).

export const MANIFEST_PATH = 'docs/index.json';

// Work out API base / owner / repo from the URL the tool page is served from.
//   GHES:       https://pages.<host>/<owner>/<repo>/        -> https://<host>/api/v3
//   GHES (alt): https://<host>/pages/<owner>/<repo>/        -> https://<host>/api/v3
//   github.com: https://<owner>.github.io/<repo>/           -> https://api.github.com
export function detectConfig(href) {
  const url = new URL(href);
  const host = url.hostname;
  const seg = url.pathname.split('/').filter(Boolean);
  if (host.endsWith('.github.io')) {
    const owner = host.slice(0, -'.github.io'.length);
    // A user/org site (<owner>.github.io repo) has no repo segment in the path.
    const repo = seg.length && !seg[0].includes('.') ? seg[0] : host;
    return { apiBase: 'https://api.github.com', owner, repo };
  }
  if (host.startsWith('pages.') && seg.length >= 2) {
    return { apiBase: `https://${host.slice('pages.'.length)}/api/v3`, owner: seg[0], repo: seg[1] };
  }
  if (seg[0] === 'pages' && seg.length >= 3) {
    return { apiBase: `https://${host}/api/v3`, owner: seg[1], repo: seg[2] };
  }
  return { apiBase: '', owner: '', repo: '' };
}

export function detectType(text, fileName = '') {
  if (/\.html?$/i.test(fileName)) return 'html';
  if (/\.(md|markdown|txt)$/i.test(fileName)) return 'md';
  return /^\s*(<!doctype html|<html[\s>])/i.test(text) ? 'html' : 'md';
}

export function extractTitle(text, type, fileName = '') {
  let m;
  if (type === 'html') m = text.match(/<title[^>]*>([^<]*)<\/title>/i) || text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  else m = text.match(/^\s{0,3}#\s+(.+?)\s*#*\s*$/m);
  let title = m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
  if (type === 'html') {
    title = title.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]));
  }
  if (!title && fileName) title = fileName.replace(/\.[^.]+$/, '');
  if (!title) {
    const line = text.split('\n').map((l) => l.trim()).find(Boolean) || '';
    title = line.replace(/^[#>*\-\s]+/, '').slice(0, 60);
  }
  return title || 'untitled';
}

// ASCII slug from the title; non-ASCII titles (e.g. Korean) fall back to a short random id
// so shared links stay readable instead of turning into long %-encoded strings.
export function slugify(title) {
  const s = title.normalize('NFKD').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
  return s.length >= 3 ? s : Math.random().toString(36).slice(2, 8);
}

function pad(n) { return String(n).padStart(2, '0'); }

export function baseName(title, date = new Date()) {
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${stamp}-${slugify(title)}`;
}

export function uniqueName(base, takenPaths) {
  let name = base;
  for (let i = 2; takenPaths.has(`docs/${name}.html`); i++) name = `${base}-${i}`;
  return name;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Small page that renders the sibling .md file in the browser (no Jekyll involved).
export function mdWrapperHtml(name, title) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="../assets/view.css">
</head>
<body>
<main id="doc" class="markdown-body" data-src="${name}.md"><p class="loading">불러오는 중…</p></main>
<script src="../assets/vendor/marked.umd.js"></script>
<script src="../assets/vendor/purify.min.js"></script>
<script src="../assets/view.js"></script>
</body>
</html>
`;
}

// UTF-8 safe base64 decode (atob alone mangles Korean text).
function b64decodeUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export class GitHubClient {
  constructor({ apiBase, token, owner, repo }) {
    this.apiBase = apiBase.replace(/\/+$/, '');
    this.token = token;
    this.owner = owner;
    this.repo = repo;
  }

  async api(method, path, body) {
    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).message || ''; } catch { /* non-JSON error body */ }
      const err = new Error(`${method} ${path} → ${res.status} ${msg}`.trim());
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  repoPath(p) { return `/repos/${this.owner}/${this.repo}${p}`; }

  getUser() { return this.api('GET', '/user'); }

  async getRepo() { return this.api('GET', this.repoPath('')); }

  async getPagesUrl() {
    try {
      const p = await this.api('GET', this.repoPath('/pages'));
      return p.html_url.endsWith('/') ? p.html_url : `${p.html_url}/`;
    } catch { return ''; }
  }

  async readManifest(ref) {
    try {
      const f = await this.api('GET', this.repoPath(`/contents/${MANIFEST_PATH}?ref=${ref}`));
      const list = JSON.parse(b64decodeUtf8(f.content));
      return Array.isArray(list) ? list : [];
    } catch (e) {
      if (e.status === 404) return [];
      throw e;
    }
  }

  // Publish one document as a single commit: the source file, (for md) its viewer page,
  // and the updated manifest. Retries when someone else pushed in between.
  async publish({ text, type, title, author, branch, date = new Date() }) {
    const base = baseName(title, date);
    for (let attempt = 1; ; attempt++) {
      const ref = await this.api('GET', this.repoPath(`/git/ref/heads/${branch}`));
      const headSha = ref.object.sha;
      const head = await this.api('GET', this.repoPath(`/git/commits/${headSha}`));
      const manifest = await this.readManifest(headSha);
      const name = uniqueName(base, new Set(manifest.map((d) => d.path)));
      const pagePath = `docs/${name}.html`;

      const files = type === 'html'
        ? [[pagePath, text]]
        : [[`docs/${name}.md`, text], [pagePath, mdWrapperHtml(name, title)]];
      const entry = { path: pagePath, title, type, author, created: date.toISOString() };
      if (type === 'md') entry.source = `docs/${name}.md`;
      files.push([MANIFEST_PATH, `${JSON.stringify([entry, ...manifest], null, 1)}\n`]);

      const tree = await this.api('POST', this.repoPath('/git/trees'), {
        base_tree: head.tree.sha,
        tree: files.map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })),
      });
      const commit = await this.api('POST', this.repoPath('/git/commits'), {
        message: `Share: ${title}`,
        tree: tree.sha,
        parents: [headSha],
      });
      try {
        await this.api('PATCH', this.repoPath(`/git/refs/heads/${branch}`), { sha: commit.sha, force: false });
        return { ...entry, commit: commit.sha };
      } catch (e) {
        // 422 = not a fast-forward: another upload landed first. Rebuild on the new head.
        if (e.status !== 422 || attempt >= 4) throw e;
      }
    }
  }
}
