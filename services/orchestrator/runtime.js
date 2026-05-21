export async function runTask(task, context = {}) {
  return {
    ok: true,
    task,
    context,
    output: 'Task runtime initialized',
    createdAt: new Date().toISOString()
  };
}
