import {
  apiSuccessEnvelopeSchema,
  dashboardSchema,
  evaluationBatchSchema,
  evaluationPlanSchema,
  type EvaluationPlanWrite,
} from '@eval/shared';
import { z } from 'zod';
import { request } from './client';

const dashboardEnvelope = apiSuccessEnvelopeSchema(dashboardSchema);
const planEnvelope = apiSuccessEnvelopeSchema(evaluationPlanSchema);
const plansEnvelope = apiSuccessEnvelopeSchema(z.array(evaluationPlanSchema));
const batchEnvelope = apiSuccessEnvelopeSchema(evaluationBatchSchema);

export function getDashboard() {
  return request('/dashboard', dashboardEnvelope);
}

export function listEvaluationPlans() {
  return request('/evaluation-plans', plansEnvelope);
}

export function getEvaluationPlan(id: string) {
  return request(`/evaluation-plans/${id}`, planEnvelope);
}

export function createEvaluationPlan(body: EvaluationPlanWrite) {
  return request('/evaluation-plans', planEnvelope, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateEvaluationPlan(id: string, body: EvaluationPlanWrite) {
  return request(`/evaluation-plans/${id}`, planEnvelope, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function startEvaluationBatch() {
  return request('/evaluation-batches', batchEnvelope, { method: 'POST' });
}

export function getEvaluationBatch(id: string) {
  return request(`/evaluation-batches/${id}`, batchEnvelope);
}
