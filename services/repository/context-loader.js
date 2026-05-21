export function loadTargetedContext(file, startLine = 1, endLine = 50) {
  const lines = file.content.split('\n');

  const extracted = lines.slice(startLine - 1, endLine);

  return {
    path: file.path,
    startLine,
    endLine,
    content: extracted.join('\n'),
  };
}
