const history = [];

export function saveCommand(command) {
  history.push({
    command,
    executedAt: new Date().toISOString()
  });

  return history.length;
}

export function getHistory() {
  return history;
}
