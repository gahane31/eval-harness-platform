import {
  agentConfigurationVersionSchema,
  agentResponseSchema,
  apiListEnvelopeSchema,
  apiSuccessEnvelopeSchema,
  configurationValidationSchema,
  publishConfigurationResponseSchema,
  type AgentCreateRequest,
  type AgentDraftConfig,
  type AgentUpdateRequest,
  MAX_PAGE_SIZE,
} from '@eval/shared';
import { request } from './client';

const agentEnvelope = apiSuccessEnvelopeSchema(agentResponseSchema);
const agentsEnvelope = apiListEnvelopeSchema(agentResponseSchema);
const validationEnvelope = apiSuccessEnvelopeSchema(configurationValidationSchema);
const publishEnvelope = apiSuccessEnvelopeSchema(publishConfigurationResponseSchema);
const versionsEnvelope = apiListEnvelopeSchema(agentConfigurationVersionSchema);
const versionEnvelope = apiSuccessEnvelopeSchema(agentConfigurationVersionSchema);

export function listAgents(page = 1, pageSize = 20) {
  return request(`/agents?page=${page}&pageSize=${pageSize}`, agentsEnvelope);
}

export async function listAllAgents() {
  const first = await listAgents(1, MAX_PAGE_SIZE);
  const items = [...first.data];
  if (first.meta.totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: first.meta.totalPages - 1 }, (_, index) =>
        listAgents(index + 2, MAX_PAGE_SIZE),
      ),
    );
    for (const response of rest) {
      items.push(...response.data);
    }
  }
  return items;
}

export function getAgent(id: string) {
  return request(`/agents/${id}`, agentEnvelope);
}

export function createAgent(body: AgentCreateRequest) {
  return request('/agents', agentEnvelope, { method: 'POST', body: JSON.stringify(body) });
}

export function updateAgent(id: string, body: AgentUpdateRequest) {
  return request(`/agents/${id}`, agentEnvelope, { method: 'PUT', body: JSON.stringify(body) });
}

export function saveAgentDraft(id: string, draft: AgentDraftConfig) {
  return request(`/agents/${id}/configuration`, agentEnvelope, {
    method: 'PUT',
    body: JSON.stringify(draft),
  });
}

export function validateAgentDraft(id: string) {
  return request(`/agents/${id}/configuration/validate`, validationEnvelope, { method: 'POST' });
}

export function publishAgentVersion(id: string) {
  return request(`/agents/${id}/configuration-versions`, publishEnvelope, { method: 'POST' });
}

export function listAgentVersions(id: string, page = 1, pageSize = 20) {
  return request(
    `/agents/${id}/configuration-versions?page=${page}&pageSize=${pageSize}`,
    versionsEnvelope,
  );
}

export function getAgentVersion(versionId: string) {
  return request(`/configuration-versions/${versionId}`, versionEnvelope);
}
