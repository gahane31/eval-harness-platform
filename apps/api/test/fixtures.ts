import type { AgentCreateRequest, AgentDraftConfig, TaskCreateRequest } from '@eval/shared';

export const draftConfig: AgentDraftConfig = {
  profileId: 'default',
  provider: 'openai-api',
  model: 'gpt-5.4-mini',
  reasoning: 'medium',
  systemPrompt: 'Answer with the requested format.',
  skills: [],
  toolsets: [],
  memory: { enabled: false },
};

export const selectedCapabilitiesDraft: AgentDraftConfig = {
  ...draftConfig,
  skills: ['summarize'],
  toolsets: ['web'],
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
  tags: ['geography'],
};
