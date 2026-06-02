import express from 'express';
import { Client } from 'ssh2';
import { listDomains, getDomain, addDomain, updateDomain, deleteDomain, buildNginxConfig } from '../../../../services/domains/manager.js';
import { queryOne } from '../../../../services/db/client.js';
import { sessions as vpsSessions } from '../../../../services/vps/sessions.js';

const router = express.Router();

async function getServer(id) {
  try { return await queryOne('SELECT * FROM ssh_sessions WHERE id=$1', [id]); } catch {}
  return vpsSessions.get(id) || null;
}

function sshExec(server, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let out = '', err = '';
    conn.on('ready', () => {
      conn.exec(command, (e, stream) => {
        if (e) { conn.end(); return reject(e); }
        stream.on('data', d => { out += d; });
        stream.stderr.on('data', d => { err += d; });
        stream.on('close', () => { conn.end(); resolve({ stdout: out, stderr: err }); });
      });
    }).on('error', reject).connect({
      host: server.host, port: server.port || 22,
      username: server.username,
      ...(server.private_key ? { privateKey: server.private_key } : { password: server.password || '' })
    });
  });
}

function sshWriteFile(server, remotePath, content) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((e, sftp) => {
        if (e) { conn.end(); return reject(e); }
        const stream = sftp.createWriteStream(remotePath);
        stream.on('close', () => { conn.end(); resolve(); });
        stream.on('error', err => { conn.end(); reject(err); });
        stream.end(content);
      });
    }).on('error', reject).connect({
      host: server.host, port: server.port || 22,
      username: server.username,
      ...(server.private_key ? { privateKey: server.private_key } : { password: server.password || '' })
    });
  });
}

// GET /domains
router.get('/', async (req, res) => {
  try { res.json(await listDomains()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /domains — register + optionally deploy nginx config
router.post('/', async (req, res) => {
  const { server_id, domain, app_port = 3000, ssl = false, notes = '', deploy = false } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain is required' });

  try {
    const rec = await addDomain({ server_id, domain, app_port: parseInt(app_port), ssl, notes });

    if (deploy && server_id) {
      const server = await getServer(server_id);
      if (!server) return res.status(404).json({ error: 'VPS server not found', domain: rec });

      const nginxConf = buildNginxConfig({ domain, app_port: parseInt(app_port), ssl });
      const confPath = `/etc/nginx/sites-available/${domain}`;
      const enabledPath = `/etc/nginx/sites-enabled/${domain}`;

      await sshWriteFile(server, confPath, nginxConf);
      await sshExec(server, `ln -sf ${confPath} ${enabledPath} && nginx -t && systemctl reload nginx`);

      if (ssl) {
        await sshExec(server, `certbot --nginx -d ${domain} --non-interactive --agree-tos -m webmaster@${domain} || true`);
        await updateDomain(rec.id, { ssl: true });
      }

      await updateDomain(rec.id, { status: 'active', nginx_path: confPath });
      return res.json({ ...rec, status: 'active', nginx_path: confPath, deployed: true });
    }

    res.json(rec);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /domains/:id
router.get('/:id', async (req, res) => {
  const d = await getDomain(req.params.id).catch(() => null);
  if (!d) return res.status(404).json({ error: 'not found' });
  res.json(d);
});

// PATCH /domains/:id
router.patch('/:id', async (req, res) => {
  try { res.json(await updateDomain(req.params.id, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /domains/:id/deploy — apply nginx config to VPS
router.post('/:id/deploy', async (req, res) => {
  try {
    const d = await getDomain(req.params.id);
    if (!d) return res.status(404).json({ error: 'domain not found' });

    const server = await getServer(d.server_id);
    if (!server) return res.status(404).json({ error: 'VPS server not found' });

    const nginxConf = buildNginxConfig({ domain: d.domain, app_port: d.app_port, ssl: d.ssl });
    const confPath  = `/etc/nginx/sites-available/${d.domain}`;
    const enabledPath = `/etc/nginx/sites-enabled/${d.domain}`;

    await sshWriteFile(server, confPath, nginxConf);
    const { stderr } = await sshExec(server, `ln -sf ${confPath} ${enabledPath} && nginx -t && systemctl reload nginx`);

    if (stderr && stderr.includes('error')) {
      return res.status(500).json({ error: stderr });
    }

    if (req.body.ssl) {
      await sshExec(server, `certbot --nginx -d ${d.domain} --non-interactive --agree-tos -m webmaster@${d.domain} || true`);
    }

    await updateDomain(d.id, { status: 'active', nginx_path: confPath });
    res.json({ success: true, domain: d.domain, nginx_path: confPath });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /domains/:id
router.delete('/:id', async (req, res) => {
  try {
    const d = await getDomain(req.params.id);
    if (d?.server_id && d?.domain && req.query.undeploy === 'true') {
      const server = await getServer(d.server_id).catch(() => null);
      if (server) {
        await sshExec(server, `rm -f /etc/nginx/sites-enabled/${d.domain} /etc/nginx/sites-available/${d.domain} && nginx -t && systemctl reload nginx`).catch(() => {});
      }
    }
    await deleteDomain(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
