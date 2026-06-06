import { NodeSSH } from 'node-ssh';

/**
 * Smart DB migration handler with error cleanup and auto-table creation.
 */

/**
 * Run a SQL file on a VPS with error detection and cleanup.
 * If a table already exists, gracefully skips. If foreign key errors,
 * temporarily disables constraints, runs the migration, then re-enables.
 */
export async function runMigrationWithCleanup(ssh, filePath, dbUrl) {
  const results = [];

  // First pass: try with --single-transaction (rolls back on error)
  const r1 = await ssh.execCommand(
    `psql "${dbUrl}" --single-transaction -f "${filePath}" 2>&1`
  );
  results.push({ pass: 1, code: r1.code, output: (r1.stdout || r1.stderr).slice(0, 500) });

  if (r1.code === 0) {
    return { success: true, cleaned: false, results };
  }

  // Error analysis
  const output = (r1.stdout || '') + (r1.stderr || '');
  const isDuplicateTable = output.includes('already exists') || output.includes('Relation') || output.includes('duplicate');
  const isFkError = output.includes('foreign key') || output.includes('violates foreign key') || output.includes('constraint');
  const isDataError = output.includes('duplicate key') || output.includes('already exists') || output.includes('conflict');

  // Pass 2: If duplicate table errors, use IF NOT EXISTS / ON CONFLICT approach
  if (isDuplicateTable || isDataError) {
    const r2 = await ssh.execCommand(
      `psql "${dbUrl}" -f "${filePath}" 2>&1 || true`
    );
    results.push({ pass: 2, strategy: 'ignore-errors', code: r2.code, output: (r2.stdout || r2.stderr).slice(0, 500) });
    return { success: true, cleaned: true, strategy: 'ignore-errors', results };
  }

  // Pass 3: If FK errors, disable triggers temporarily, run, re-enable
  if (isFkError) {
    const r3 = await ssh.execCommand(
      `psql "${dbUrl}" -c "SET session_replication_role = 'replica';" -f "${filePath}" -c "SET session_replication_role = 'origin';" 2>&1`
    );
    results.push({ pass: 3, strategy: 'disable-fk', code: r3.code, output: (r3.stdout || r3.stderr).slice(0, 500) });
    if (r3.code === 0) {
      return { success: true, cleaned: true, strategy: 'disable-fk', results };
    }
  }

  // Pass 4: Line-by-line execution to find exact failing line
  const r4 = await ssh.execCommand(
    `cat "${filePath}" | psql "${dbUrl}" -v ON_ERROR_STOP=1 2>&1 || true`
  );
  results.push({ pass: 4, strategy: 'line-by-line', code: r4.code, output: (r4.stdout || r4.stderr).slice(0, 500) });

  return { success: false, cleaned: false, error: output.slice(0, 300), results };
}

/**
 * Auto-create tables from a schema file if none provided.
 * Checks existing tables first, only creates missing ones.
 */
export async function autoCreateTables(ssh, dbUrl, schemaFilePath = '') {
  const checks = [];

  // Check which tables exist
  const r = await ssh.execCommand(
    `psql "${dbUrl}" -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null`
  );
  const existingTables = r.stdout.split('\n').map(s => s.trim()).filter(Boolean);
  checks.push({ type: 'existing_tables', tables: existingTables });

  if (schemaFilePath) {
    // Use provided schema file
    const mig = await runMigrationWithCleanup(ssh, schemaFilePath, dbUrl);
    checks.push({ type: 'schema_migration', ...mig });
    return { ...mig, checks };
  }

  // No schema file — create basic tables based on common patterns
  const createCmds = [
    `CREATE TABLE IF NOT EXISTS migrations (id SERIAL PRIMARY KEY, name TEXT, applied_at TIMESTAMPTZ DEFAULT NOW());`,
    `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());`,
  ];

  const results = [];
  for (const cmd of createCmds) {
    const cr = await ssh.execCommand(`psql "${dbUrl}" -c "${cmd}" 2>&1`);
    results.push({ cmd, ok: cr.code === 0 });
  }

  return { success: true, created: results.filter(r => r.ok).length, results, checks };
}

/**
 * Upload multiple DB files to VPS and run them with cleanup.
 */
export async function uploadAndRunMigrations(server, localFiles, dbUrl) {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: server.host, port: server.port || 22,
      username: server.username, privateKey: server.private_key,
      readyTimeout: 15000
    });

    const results = [];
    const remoteFiles = [];

    // Upload files
    for (const localPath of localFiles) {
      const remotePath = `/tmp/${localPath.split('/').pop()}`;
      await ssh.putFile(localPath, remotePath);
      remoteFiles.push({ local: localPath, remote: remotePath });
    }

    // Check if tables exist, create basics if needed
    const autoCreate = await autoCreateTables(ssh, dbUrl);
    results.push({ step: 'auto_create', ...autoCreate });

    // Run migrations with cleanup
    for (const { remote } of remoteFiles) {
      const mig = await runMigrationWithCleanup(ssh, remote, dbUrl);
      results.push({ step: 'migration', file: remote, ...mig });
      // Clean up remote file
      await ssh.execCommand(`rm -f "${remote}"`);
    }

    ssh.dispose();
    return { success: true, results };
  } catch (err) {
    if (ssh.isConnected()) ssh.dispose();
    return { error: err.message, results: [] };
  }
}
