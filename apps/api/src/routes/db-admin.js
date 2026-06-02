import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Client } from 'ssh2';
import { queryOne, dbAvailable } from '../../../../services/db/client.js';
import { sessions as vpsSessions } from '../../../../services/vps/sessions.js';

const router = express.Router();

// Store uploads in /tmp with original extension
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, '/tmp'),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `db-backup-${Date.now()}-${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500 MB

async function getServer(id) {
  try { return await queryOne('SELECT * FROM ssh_sessions WHERE id=$1', [id]); } catch {}
  return vpsSessions.get(id) || null;
}

// SSE helper for long-running restore
function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// POST /db-admin/import — upload .sql/.dump and restore locally
router.post('/import', upload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  const fileName = req.file.originalname;

  if (!await dbAvailable()) {
    fs.unlink(filePath, () => {});
    return res.status(503).json({ error: 'No database connected — cannot restore backup' });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(503).json({ error: 'DATABASE_URL not configured' });

  // Use SSE for progress
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sendSSE(res, 'progress', { message: `Received ${fileName} (${(req.file.size / 1024).toFixed(1)} KB)` });

  const { exec } = await import('child_process');
  const isCustom = fileName.endsWith('.dump') || req.query.format === 'custom';
  const cmd = isCustom
    ? `pg_restore --no-owner --no-privileges -d "${dbUrl}" "${filePath}" 2>&1`
    : `psql "${dbUrl}" < "${filePath}" 2>&1`;

  sendSSE(res, 'progress', { message: `Running ${isCustom ? 'pg_restore' : 'psql'}…` });

  exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
    fs.unlink(filePath, () => {});
    if (err) {
      sendSSE(res, 'error', { message: err.message, output: (stdout || stderr || '').slice(0, 2000) });
    } else {
      sendSSE(res, 'done', { message: 'Restore complete', output: (stdout || '').slice(0, 1000) });
    }
    res.end();
  });
});

// POST /db-admin/import-to-vps — upload .sql and restore on a VPS server
router.post('/import-to-vps', upload.single('backup'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { server_id, database_url } = req.body;
  if (!server_id) return res.status(400).json({ error: 'server_id is required' });

  const server = await getServer(server_id);
  if (!server) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'VPS server not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const localPath  = req.file.path;
  const remotePath = `/tmp/${path.basename(req.file.path)}`;
  const dbUrl      = database_url || 'postgresql://localhost/app';

  sendSSE(res, 'progress', { message: `Uploading ${req.file.originalname} to VPS via SFTP…` });

  const conn = new Client();
  conn.on('ready', () => {
    conn.sftp((sftpErr, sftp) => {
      if (sftpErr) {
        fs.unlink(localPath, () => {});
        sendSSE(res, 'error', { message: sftpErr.message });
        conn.end(); return res.end();
      }

      sftp.fastPut(localPath, remotePath, {}, (putErr) => {
        fs.unlink(localPath, () => {});
        if (putErr) {
          sendSSE(res, 'error', { message: putErr.message });
          conn.end(); return res.end();
        }

        sendSSE(res, 'progress', { message: 'File uploaded. Running restore…' });

        const isCustom = req.file.originalname.endsWith('.dump');
        const cmd = isCustom
          ? `pg_restore --no-owner --no-privileges -d "${dbUrl}" "${remotePath}" 2>&1; rm -f "${remotePath}"`
          : `psql "${dbUrl}" < "${remotePath}" 2>&1; rm -f "${remotePath}"`;

        conn.exec(cmd, (execErr, stream) => {
          if (execErr) {
            sendSSE(res, 'error', { message: execErr.message });
            conn.end(); return res.end();
          }
          let out = '';
          stream.on('data', d => { out += d; });
          stream.stderr.on('data', d => { out += d; });
          stream.on('close', code => {
            conn.end();
            if (code === 0) {
              sendSSE(res, 'done', { message: 'VPS restore complete', output: out.slice(0, 1000) });
            } else {
              sendSSE(res, 'error', { message: `Exited with code ${code}`, output: out.slice(0, 2000) });
            }
            res.end();
          });
        });
      });
    });
  }).on('error', err => {
    fs.unlink(localPath, () => {});
    sendSSE(res, 'error', { message: err.message });
    res.end();
  }).connect({
    host: server.host, port: server.port || 22,
    username: server.username,
    ...(server.private_key ? { privateKey: server.private_key } : { password: server.password || '' })
  });
});

// GET /db-admin/export — dump local DB and stream as download
router.get('/export', async (req, res) => {
  if (!await dbAvailable()) return res.status(503).json({ error: 'No database connected' });
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(503).json({ error: 'DATABASE_URL not configured' });

  const filename = `apex-dev-backup-${new Date().toISOString().slice(0,10)}.sql`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/sql');

  const { spawn } = await import('child_process');
  const proc = spawn('pg_dump', ['--no-owner', '--no-privileges', dbUrl]);
  proc.stdout.pipe(res);
  proc.on('error', err => res.status(500).json({ error: err.message }));
});

export default router;
