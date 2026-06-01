export async function fetchWorkflows() {
  const response = await fetch('/workflow');

  if (!response.ok) {
    throw new Error('Failed to fetch workflows');
  }

  return response.json();
}

export async function executeWorkflow(payload) {
  const response = await fetch('/workflow/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error('Workflow execution failed');
  }

  return response.json();
}
