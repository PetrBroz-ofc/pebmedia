// api/content.js
// GET  -> vrátí aktuální obsah webu z data/content.json
// POST -> (vyžaduje platný token z api/auth.js) uloží nový obsah tak,
//         že commitne data/content.json do GitHub repozitáře přes GitHub API.
//         Vercel díky napojení na GitHub po commitu automaticky znovu nasadí web.
//
// Potřebné proměnné prostředí:
//   ADMIN_TOKEN_SECRET     - stejný secret jako v api/auth.js
//   GITHUB_TOKEN           - GitHub personal access token s právem "repo" (contents: write)
//   GITHUB_OWNER           - vlastník repozitáře, např. "petr-broz"
//   GITHUB_REPO            - název repozitáře, např. "pebmedia-web"
//   GITHUB_BRANCH          - větev pro commit, výchozí "main"
//   CONTENT_PATH           - cesta k souboru v repozitáři, výchozí "data/content.json"

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function verifyToken(token, secret) {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (expected.length !== sig.length) return false;
  const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  if (!valid) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const ageMs = Date.now() - decoded.iat;
    return ageMs >= 0 && ageMs < 1000 * 60 * 60 * 12; // token platný 12 hodin
  } catch (e) {
    return false;
  }
}

async function githubGetFileSha({ owner, repo, branch, filePath, ghToken }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.sha;
}

async function githubCommitFile({ owner, repo, branch, filePath, ghToken, content, sha }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: 'Aktualizace obsahu webu přes administraci PEBMedia',
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch,
      sha: sha || undefined
    })
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`GitHub API chyba: ${res.status} ${errBody}`);
  }
  return res.json();
}

module.exports = async function handler(req, res) {
  const CONTENT_PATH = process.env.CONTENT_PATH || 'data/content.json';

  if (req.method === 'GET') {
    try {
      const localPath = path.join(process.cwd(), CONTENT_PATH);
      const raw = fs.readFileSync(localPath, 'utf8');
      res.status(200).json(JSON.parse(raw));
    } catch (err) {
      res.status(500).json({ error: 'Obsah se nepodařilo načíst na serveru.' });
    }
    return;
  }

  if (req.method === 'POST') {
    const { ADMIN_TOKEN_SECRET, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH } = process.env;
    const branch = GITHUB_BRANCH || 'main';

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!ADMIN_TOKEN_SECRET || !verifyToken(token, ADMIN_TOKEN_SECRET)) {
      res.status(401).json({ error: 'Neplatné nebo vypršelé přihlášení. Přihlaste se prosím znovu.' });
      return;
    }

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      res.status(500).json({ error: 'Ukládání není nakonfigurováno (chybí GitHub proměnné prostředí na serveru).' });
      return;
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Neplatná data.' });
      return;
    }

    try {
      const sha = await githubGetFileSha({ owner: GITHUB_OWNER, repo: GITHUB_REPO, branch, filePath: CONTENT_PATH, ghToken: GITHUB_TOKEN });
      await githubCommitFile({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        branch,
        filePath: CONTENT_PATH,
        ghToken: GITHUB_TOKEN,
        content: JSON.stringify(body, null, 2),
        sha
      });
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Uložení se nezdařilo.' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
