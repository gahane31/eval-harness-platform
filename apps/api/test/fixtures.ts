import type { AgentCreateRequest, AgentDraftConfig, TaskCreateRequest } from '@eval/shared';

export const draftConfig: AgentDraftConfig = {
  provider: 'openai',
  model: 'gpt-4.1-mini',
  reasoning: 'medium',
  systemPrompt: 'Answer with the requested format.',
  skills: ['summarize'],
  toolsets: ['web'],
  memory: { enabled: false },
};

export const agentInput: AgentCreateRequest = {
  name: 'Research agent',
  description: 'Draft research configuration',
  draftConfig,
};

export const taskInput: TaskCreateRequest = {
  name: 'Extract city',
  description: 'The answer names Paris.',
  input: 'What city is the Eiffel Tower in?',
  expectedOutcome: { city: 'Paris' },
  scoringCriteria: [
    {
      id: 'city',
      type: 'json_field_equals',
      weight: 1,
      required: true,
      params: { path: 'city', expected: 'Paris' },
    },
  ],
  version: 1,
  tags: ['geography'],
};
