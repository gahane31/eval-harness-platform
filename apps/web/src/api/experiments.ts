import {
  apiListEnvelopeSchema,
  apiSuccessEnvelopeSchema,
  experimentResponseSchema,
  type ExperimentCreateRequest,
  type ExperimentUpdateRequest,
} from '@eval/shared';
import { request } from './client';

const experimentEnvelope = apiSuccessEnvelopeSchema(experimentResponseSchema);
const experimentsEnvelope = apiListEnvelopeSchema(experimentResponseSchema);

export function listExperiments(page = 1, pageSize = 20) {
  return request(`/experiments?page=${page}&pageSize=${pageSize}`, experimentsEnvelope);
}

export async function listAllExperiments() {
  const first = await listExperiments(1, 100);
  const items = [...first.data];
  for (let page = 2; page <= first.meta.totalPages; page += 1) {
    const next = await listExperiments(page, 100);
    items.push(...next.data);
  }
  return items;
}

export function createExperiment(body: ExperimentCreateRequest) {
  return request('/experiments', experimentEnvelope, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getExperiment(id: string) {
  return request(`/experiments/${id}`, experimentEnvelope);
}

export function updateExperiment(id: string, body: ExperimentUpdateRequest) {
  return request(`/experiments/${id}`, experimentEnvelope, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
