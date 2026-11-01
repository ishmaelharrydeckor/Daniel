// Thin wrapper over the GitHub Contents API. No DOM here, so it can be tested in Node too.
// The admin saves by committing files to the repository; a GitHub Action then rebuilds the site.

const API = 'https://api.github.com';

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

export function createGitHub({ repo, branch = 'main', token }) {
  async function call(path, init = {}) {
    const res = await fetch(API + path, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      let message = res.statusText;
      try { message = (await res.json()).message || message; } catch { /* no body */ }
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  const put = (file, contentBase64, message, sha) =>
    call(`/repos/${repo}/contents/${file}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: contentBase64, branch, ...(sha ? { sha } : {}) }),
    });

  return {
    repo,
    branch,
    async check() {
      const r = await call(`/repos/${repo}`);
      if (!r.permissions?.push) throw new Error('This key can read the site but is not allowed to change it.');
      return r;
    },
    async readJson(file, fallback) {
      try {
        const r = await call(`/repos/${repo}/contents/${file}?ref=${encodeURIComponent(branch)}`);
        return { data: JSON.parse(fromBase64(r.content)), sha: r.sha };
      } catch (err) {
        if (err.status === 404) return { data: fallback, sha: null };
        throw err;
      }
    },
    async writeJson(file, data, sha, message) {
      const r = await put(file, toBase64(JSON.stringify(data, null, 2) + '\n'), message, sha);
      return r.content.sha;
    },
    // base64: file contents already base64-encoded
    async uploadFile(file, base64, message) {
      const r = await put(file, base64, message);
      return r.content.sha;
    },
    async latestRun() {
      const r = await call(`/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`);
      return r.workflow_runs?.[0] || null;
    },
  };
}
