import { db } from './drizzle-client.js';

export async function saveWorkflowHistory(workflow) {
  return {
    saved: true,
    workflow,
    storedAt: new Date().toISOString()
  };
}

export async function saveRepairHistory(repair) {
  return {
    saved: true,
    repair,
    storedAt: new Date().toISOString()
  };
}

export async function saveDeploymentHistory(deployment) {
  return {
    saved: true,
    deployment,
    storedAt: new Date().toISOString()
  };
}
