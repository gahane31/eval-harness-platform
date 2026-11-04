import { agentResponseSchema, apiListEnvelopeSchema } from '@eval/shared';
import { request } from './client';

const agentsListSchema = apiListEnvelopeSchema(agentResponseSchema);

export function listAgents(page = 1, pageSize = 20) {
  return request(`/agents?page=${page}&pageSize=${pageSize}`, agentsListSchema);
}
