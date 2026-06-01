import express from 'express';

const router = express.Router();

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function parseRepoUrl(url) {
  const m = url.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/|$)/);
  if (!m) throw new Error('Invalid GitHub URL');
  return { owner: m[1], repo: m[2] };
}

// Load repo: returns compact file tree + README snippet (token-efficient)
router.post('/load', async (req, res) => {
  try {
    const { url } = req.body;
    const { owner, repo } = parseRepoUrl(url);

    // Fetch default branch
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: ghHeaders() });
    if (!repoRes.ok) throw new Error(`Repo not found (${repoRes.status})`);
    const repoData = await repoRes.json();
    const branch = repoData.default_branch || 'main';

    // Fetch full tree (recursive, paths only — very token-efficient)
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: ghHeaders() }
    );
    if (!treeRes.ok) throw new Error(`Could not fetch tree (${treeRes.status})`);
    const treeData = await treeRes.json();

    // Keep only files (not dirs), drop binary/lockfiles to save tokens
    const SKIP = /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip|lock|map)$/i;
    const files = (treeData.tree || [])
      .filter(n => n.type === 'blob' && !SKIP.test(n.path))
      .map(n => ({ path: n.path, size: n.size }));

    // Fetch README (truncated)
    let readme = '';
    try {
      const readmeRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/readme`,
        { headers: { ...ghHeaders(), Accept: 'application/vnd.github.raw+json' } }
      );
      if (readmeRes.ok) {
        const text = await readmeRes.text();
        readme = text.slice(0, 800) + (text.length > 800 ? '\n…(truncated)' : '');
      }
    } catch { /* readme optional */ }

    res.json({
      owner,
      repo,
      branch,
      description: repoData.description || '',
      language: repoData.language || '',
      stars: repoData.stargazers_count,
      fileCount: files.length,
      files,       // full list of paths + sizes
      readme
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Fetch a single file's content
router.post('/file', async (req, res) => {
  try {
    const { owner, repo, path, branch = 'main' } = req.body;
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      { headers: ghHeaders() }
    );
    if (!fileRes.ok) throw new Error(`File not found (${fileRes.status})`);
    const data = await fileRes.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    res.json({ path, content, sha: data.sha, branch });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Edit (create or update) a file — commits directly to branch
router.post('/edit', async (req, res) => {
  try {
    const { owner, repo, path, content, message, branch, sha } = req.body;
    if (!owner || !repo || !path || content === undefined || !message)
      throw new Error('owner, repo, path, content, and message are required');

    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN not configured');

    const body = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch: branch || 'main'
    };
    if (sha) body.sha = sha; // required for updates, omit for new files

    const editRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );
    if (!editRes.ok) {
      const err = await editRes.json();
      throw new Error(err.message || editRes.status);
    }
    const data = await editRes.json();
    res.json({
      success: true,
      path,
      sha: data.content?.sha,
      commitSha: data.commit?.sha,
      commitUrl: data.commit?.html_url
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Create a branch from another branch
router.post('/branch', async (req, res) => {
  try {
    const { owner, repo, branch, from = 'main' } = req.body;
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN not configured');

    // Get SHA of source branch
    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${from}`,
      { headers: ghHeaders() }
    );
    if (!refRes.ok) throw new Error(`Source branch "${from}" not found`);
    const refData = await refRes.json();
    const sha = refData.object.sha;

    // Create new branch
    const branchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      {
        method: 'POST',
        headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha })
      }
    );
    if (!branchRes.ok) {
      const err = await branchRes.json();
      throw new Error(err.message || branchRes.status);
    }
    res.json({ success: true, branch, from, sha });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
