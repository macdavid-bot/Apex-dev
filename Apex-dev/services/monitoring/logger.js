const logs = [];

export function writeLog(level, message) {
  logs.push({
    level,
    message,
    createdAt: new Date().toISOString()
  });

  return logs.length;
}

export function getLogs() {
  return logs;
}
