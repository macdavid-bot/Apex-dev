import { query, queryOne, dbAvailable } from '../db/client.js';

let inMemDomains = new Map();
let inMemSeq = 1;

function makeId() { return `dom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

export async function listDomains() {
  if (await dbAvailable()) {
    const r = await query('SELECT * FROM domains ORDER BY created_at DESC').catch(() => ({ rows: [] }));
    return r.rows;
  }
  return [...inMemDomains.values()];
}

export async function getDomain(id) {
  if (await dbAvailable()) return queryOne('SELECT * FROM domains WHERE id=$1', [id]).catch(() => null);
  return inMemDomains.get(id) || null;
}

export async function addDomain({ server_id, domain, app_port = 3000, ssl = false, notes = '' }) {
  const id = makeId();
  if (await dbAvailable()) {
    const r = await queryOne(
      `INSERT INTO domains (id, server_id, domain, app_port, ssl, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
      [id, server_id, domain, app_port, ssl, notes]
    );
    return r;
  }
  const rec = { id, server_id, domain, app_port, ssl, notes, status: 'pending', created_at: new Date().toISOString() };
  inMemDomains.set(id, rec);
  return rec;
}

export async function updateDomain(id, fields) {
  const allowed = ['status', 'ssl', 'app_port', 'notes', 'nginx_path'];
  const sets = [];
  const vals = [];
  let idx = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { sets.push(`${k}=$${idx++}`); vals.push(v); }
  }
  if (!sets.length) return getDomain(id);
  if (await dbAvailable()) {
    vals.push(id);
    return queryOne(`UPDATE domains SET ${sets.join(',')} WHERE id=$${idx} RETURNING *`, vals).catch(() => null);
  }
  const rec = inMemDomains.get(id);
  if (rec) { Object.assign(rec, fields); inMemDomains.set(id, rec); }
  return rec;
}

export async function deleteDomain(id) {
  if (await dbAvailable()) {
    await query('DELETE FROM domains WHERE id=$1', [id]).catch(() => {});
    return;
  }
  inMemDomains.delete(id);
}

export function buildNginxConfig({ domain, app_port, ssl = false }) {
  if (ssl) {
    return `server {
    listen 80;
    server_name ${domain};
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${domain};

    ssl_certificate     /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    client_max_body_size 50M;

    location / {
        proxy_pass         http://127.0.0.1:${app_port};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}`;
  }

  return `server {
    listen 80;
    server_name ${domain};

    client_max_body_size 50M;

    location / {
        proxy_pass         http://127.0.0.1:${app_port};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}`;
}

export function formatDomainsForPrompt(domains) {
  if (!domains.length) return '';
  const lines = domains.map(d =>
    `- ${d.domain} → port ${d.app_port}  |  server: ${d.server_id}  |  SSL: ${d.ssl ? 'yes' : 'no'}  |  status: ${d.status}`
  );
  return `**Registered Domains:**\n${lines.join('\n')}`;
}
