import { create } from 'zustand';

export const useWorkflowStore = create((set) => ({
  workflows: [],
  setWorkflows: (workflows) => set({ workflows }),
  activeWorkflow: null,
  setActiveWorkflow: (workflow) => set({ activeWorkflow: workflow })
}));
