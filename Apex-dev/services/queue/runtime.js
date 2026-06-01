export const tasks = [];

export function registerTask(task) {
  tasks.push(task);
  return tasks.length;
}

export function listTasks() {
  return tasks;
}
