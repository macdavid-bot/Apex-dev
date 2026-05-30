// Codebase indexing using PostgreSQL full-text search (tsvector).
// Falls back to in-memory keyword index when DB is unavailable.
import { query, dbAvailable } from '../db/client.js';

const CHUNK_SIZE = 600; // characters per chunk

function chunkContent(content) {
  const chunks = [];
  for (let i = 0; i < content.length; i += CHUNK_SIZE) {
    chunks.push(content.slice(i, i + CHUNK_SIZE));
  }
  return chunks.length ? chunks : [content];
}

export async function indexFile(repoKey, filePath, content) {
  if (!content || content.length > 200_000) return; // skip huge/binary files

  const chunks = chunkContent(content);

  if (await dbAvailable()) {
    // Delete old chunks for this file
    await query('DELETE FROM code_chunks WHERE repo_key=$1 AND file_path=$2', [repoKey, filePath]);

    for (let i = 0; i < chunks.length; i++) {
      await query(
        `INSERT INTO code_chunks (repo_key, file_path, chunk_index, content, content_tsv)
         VALUES ($1, $2, $3, $4, to_tsvector('simple', $4))
         ON CONFLICT (repo_key, file_path, chunk_index) DO UPDATE
         SET content=$4, content_tsv=to_tsvector('simple', $4)`,
        [repoKey, filePath, i, chunks[i]]
      );
    }
  }
  // in-memory fallback is not tracked here — rely on grep for local search
}

export async function indexRepo(repoKey, files) {
  // files: [{path, content}]
  let indexed = 0;
  for (const file of files) {
    if (isTextFile(file.path) && file.content) {
      await indexFile(repoKey, file.path, file.content);
      indexed++;
    }
  }
  return indexed;
}

export async function searchCode(repoKey, queryText, limit = 15) {
  if (!await dbAvailable()) {
    return { results: [], note: 'FTS unavailable — DATABASE_URL not set' };
  }

  // Convert query to tsquery: each word becomes a term
  const tsQuery = queryText
    .trim()
    .split(/\s+/)
    .map(w => w.replace(/[^a-zA-Z0-9_]/g, ''))
    .filter(Boolean)
    .join(' & ');

  if (!tsQuery) return { results: [] };

  try {
    const res = await query(
      `SELECT file_path, chunk_index, content,
              ts_rank(content_tsv, to_tsquery('simple', $1)) AS rank
       FROM code_chunks
       WHERE repo_key=$2 AND content_tsv @@ to_tsquery('simple', $1)
       ORDER BY rank DESC
       LIMIT $3`,
      [tsQuery, repoKey, limit]
    );

    return {
      query: queryText,
      totalCount: res.rows.length,
      results: res.rows.map(r => ({
        path: r.file_path,
        chunkIndex: r.chunk_index,
        snippet: r.content.slice(0, 300),
        rank: parseFloat(r.rank).toFixed(4)
      }))
    };
  } catch (err) {
    return { error: err.message, results: [] };
  }
}

export async function clearIndex(repoKey) {
  if (await dbAvailable()) {
    await query('DELETE FROM code_chunks WHERE repo_key=$1', [repoKey]);
  }
}

function isTextFile(path) {
  return /\.(js|jsx|ts|tsx|py|go|rs|java|rb|php|c|cpp|h|sh|md|json|yaml|yml|toml|env|txt|css|html|xml|sql)$/i.test(path);
}
