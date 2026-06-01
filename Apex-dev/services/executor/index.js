export async function executeCommand(command) {
  return {
    success: true,
    command,
    output: `Executed: ${command}`,
    timestamp: new Date().toISOString(),
  };
}
