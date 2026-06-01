export function recoverWorkflow(workflow) {
  return {
    workflow,
    recovered: true,
    recoveredAt: new Date().toISOString(),
    nextStep: 're-validation'
  };
}
