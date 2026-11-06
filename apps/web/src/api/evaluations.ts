import {
  apiSuccessEnvelopeSchema,
  configurationComparisonSchema,
  experimentEvaluationSummarySchema,
  runEvaluationSchema,
  type ConfigurationComparison,
  type ExperimentEvaluationSummary,
} from '@eval/shared';
import { request } from './client';

const summaryEnvelope = apiSuccessEnvelopeSchema(experimentEvaluationSummarySchema);
const comparisonEnvelope = apiSuccessEnvelopeSchema(configurationComparisonSchema);
const evaluationEnvelope = apiSuccessEnvelopeSchema(runEvaluationSchema);

export interface CriterionResultView {
  id: string;
  type: string;
  applicable: boolean;
  passed: boolean | null;
  weight: number;
  required: boolean;
  expected: unknown;
  actual: unknown;
  explanation: string;
}

export interface RunEvaluationView {
  id: string;
  runId: string;
  score: number;
  passed: boolean;
  evaluatedAt: string;
  criterionResults: CriterionResultView[];
}

export function getEvaluationSummary(id: string) {
  return request(`/experiments/${id}/evaluation`, summaryEnvelope);
}

export function getComparison(id: string) {
  return request(`/experiments/${id}/comparison`, comparisonEnvelope);
}

export function evaluateExperiment(id: string) {
  return request(`/experiments/${id}/evaluate`, summaryEnvelope, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getRunEvaluation(id: string): Promise<RunEvaluationView> {
  const response = await request(`/runs/${id}/evaluation`, evaluationEnvelope);
  return {
    id: response.data.id,
    runId: response.data.runId,
    score: response.data.score,
    passed: response.data.passed,
    evaluatedAt: response.data.evaluatedAt,
    criterionResults: response.data.criterionResults.map((criterion) => ({
      id: criterion.id,
      type: criterion.type,
      applicable: criterion.applicable,
      passed: criterion.passed,
      weight: criterion.weight,
      required: criterion.required,
      expected: criterion.expected,
      actual: criterion.actual,
      explanation: criterion.explanation,
    })),
  };
}

export type { ConfigurationComparison, ExperimentEvaluationSummary };
