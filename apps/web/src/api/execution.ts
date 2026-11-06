import {
  apiSuccessEnvelopeSchema,
  experimentExecutionSchema,
  runDetailSchema,
  runSummarySchema,
} from '@eval/shared';
import { z } from 'zod';
import { request } from './client';

const executionEnvelope = apiSuccessEnvelopeSchema(experimentExecutionSchema);
const runsEnvelope = apiSuccessEnvelopeSchema(z.array(runSummarySchema));
const runEnvelope = apiSuccessEnvelopeSchema(runDetailSchema);

export function startExperiment(id: string) {
  return request(`/experiments/${id}/start`, executionEnvelope, { method: 'POST' });
}

export function getExecution(id: string) {
  return request(`/experiments/${id}/execution`, executionEnvelope);
}

export function listRuns(id: string) {
  return request(`/experiments/${id}/runs`, runsEnvelope);
}

export function getRun(id: string) {
  return request(`/runs/${id}`, runEnvelope);
}
