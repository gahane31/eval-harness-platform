import type {
  AgentConfigurationVersion,
  ExperimentExecution,
  ExperimentResponse,
  RunDetail,
  RunSummary,
} from '../types';
import { getAgentVersion } from './agents';
import { ApiError } from './client';
import {
  getComparison,
  getEvaluationSummary,
  getRunEvaluation,
  type ConfigurationComparison,
  type ExperimentEvaluationSummary,
  type RunEvaluationView,
} from './evaluations';
import { getExecution, getRun, listRuns } from './execution';
import { getExperiment } from './experiments';

const REQUEST_CONCURRENCY = 6;
const TERMINAL_RUN_STATUSES = new Set(['COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELLED']);

export interface EvalConfigurationView {
  id: string;
  agentConfigurationId: string;
  label: string;
  version: number;
  displayOrder: number;
  role: 'baseline' | 'candidate';
  provider: string | null;
  model: string | null;
  profileId: string | null;
}

export interface EvalResults {
  experiment: ExperimentResponse;
  execution: ExperimentExecution;
  summary: ExperimentEvaluationSummary;
  comparison: ConfigurationComparison;
  configurations: EvalConfigurationView[];
  runs: RunSummary[];
  details: Map<string, RunDetail>;
  evaluations: Map<string, RunEvaluationView>;
}

export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function lane(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => lane()));
  return results;
}

export async function findRunEvaluation(runId: string): Promise<RunEvaluationView | null> {
  try {
    return await getRunEvaluation(runId);
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) {
      return null;
    }
    throw caught;
  }
}

export function orderedConfigurations(
  experiment: ExperimentResponse,
  versions: Map<string, AgentConfigurationVersion>,
): EvalConfigurationView[] {
  return experiment.configurations
    .slice()
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((configuration, index) => {
      const version = versions.get(configuration.agentConfigurationId);
      return {
        id: configuration.id,
        agentConfigurationId: configuration.agentConfigurationId,
        label: configuration.label,
        version: configuration.version,
        displayOrder: configuration.displayOrder,
        role: index === 0 ? 'baseline' : 'candidate',
        provider: version?.configSnapshot.provider ?? null,
        model: version?.configSnapshot.model ?? null,
        profileId: version?.configSnapshot.profileId ?? null,
      };
    });
}

export function configurationName(configuration: EvalConfigurationView): string {
  return configuration.model
    ? `${configuration.label} — ${configuration.model}`
    : configuration.label;
}

export async function loadConfigurationVersions(
  experiment: ExperimentResponse,
  cache = new Map<string, AgentConfigurationVersion>(),
): Promise<Map<string, AgentConfigurationVersion>> {
  const missing = experiment.configurations.filter(
    (configuration) => !cache.has(configuration.agentConfigurationId),
  );
  await mapWithLimit(missing, REQUEST_CONCURRENCY, async (configuration) => {
    const response = await getAgentVersion(configuration.agentConfigurationId);
    cache.set(configuration.agentConfigurationId, response.data);
  });
  return cache;
}

export function createEvalResultsLoader() {
  const versions = new Map<string, AgentConfigurationVersion>();
  const details = new Map<string, RunDetail>();
  const evaluations = new Map<string, RunEvaluationView>();

  async function load(experimentId: string): Promise<EvalResults> {
    const [experiment, execution, summary, comparison, runs] = await Promise.all([
      getExperiment(experimentId),
      getExecution(experimentId),
      getEvaluationSummary(experimentId),
      getComparison(experimentId),
      listRuns(experimentId),
    ]);
    await loadConfigurationVersions(experiment.data, versions);
    await mapWithLimit(runs.data, REQUEST_CONCURRENCY, async (run) => {
      const cached = details.get(run.id);
      if (!cached || cached.status !== run.status || !TERMINAL_RUN_STATUSES.has(run.status)) {
        details.set(run.id, (await getRun(run.id)).data);
      }
      if (run.status === 'COMPLETED' && !evaluations.has(run.id)) {
        const evaluation = await findRunEvaluation(run.id);
        if (evaluation) {
          evaluations.set(run.id, evaluation);
        }
      }
    });
    return {
      experiment: experiment.data,
      execution: execution.data,
      summary: summary.data,
      comparison: comparison.data,
      configurations: orderedConfigurations(experiment.data, versions),
      runs: runs.data,
      details: new Map(details),
      evaluations: new Map(evaluations),
    };
  }

  function forgetEvaluations(): void {
    evaluations.clear();
  }

  return { load, forgetEvaluations };
}

export interface EvalListMetrics {
  summary: ExperimentEvaluationSummary | null;
  execution: ExperimentExecution | null;
}

export async function loadEvalListMetrics(
  experiments: ExperimentResponse[],
): Promise<Map<string, EvalListMetrics>> {
  const entries = await mapWithLimit(experiments, REQUEST_CONCURRENCY, async (experiment) => {
    const [summary, execution] = await Promise.all([
      getEvaluationSummary(experiment.id).then(
        (response) => response.data,
        () => null,
      ),
      getExecution(experiment.id).then(
        (response) => response.data,
        () => null,
      ),
    ]);
    return [experiment.id, { summary, execution }] as const;
  });
  return new Map(entries);
}

export async function loadEvalRunDetails(experimentId: string): Promise<RunDetail[]> {
  const runs = await listRuns(experimentId);
  return mapWithLimit(runs.data, REQUEST_CONCURRENCY, async (run) => (await getRun(run.id)).data);
}
