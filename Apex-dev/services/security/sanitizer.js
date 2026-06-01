export function sanitizeCommand(command = '') {
  const blocked = ['rm -rf', 'shutdown', 'reboot'];

  const dangerous = blocked.some((item) => command.includes(item));

  return {
    safe: !dangerous,
    command,
    checkedAt: new Date().toISOString()
  };
}
