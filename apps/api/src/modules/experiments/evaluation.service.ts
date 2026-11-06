import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  configurationComparisonSchema,
  ErrorCode,
  experimentEvaluationSummarySchema,
  experimentTaskSnapshotSchema,
  runEvaluationSchema,
  scoringCriteriaSchema,
  type ConfigurationComparison,
  type ExperimentEvaluationSummary,
  type RunEvaluation,
} from '@eval/shared';
import { AppException } from '../../common/exceptions/app.exception';
import { evaluateOutput, hasScorableCriteria, type CriterionEvaluation } from './evaluate-output';
import { EvaluationsRepository, type EvaluationRunRecord } from './evaluations.repository';
import { ExperimentsRepository, type ExperimentRecord } from './experiments.repository';
import {
  inspectStructuredOutput,
  structuredValueForEvaluation,
} from '../../structured-output/structured-output';

const EXECUTION_FAILURE = new Set(['FAILED', 'TIMED_OUT', 'CANCELLED']);

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private readonly experimentsRepository: ExperimentsRepository,
    private readonly evaluationsRepository: EvaluationsRepository,
  ) {}

  async evaluateMissing(experimentId: string): Promise<void> {
    await this.evaluate(experimentId, false);
  }

  async evaluate(experimentId: string, reevaluate: boolean): Promise<ExperimentEvaluationSummary> {
    const experiment = await this.requireExperiment(experimentId);
    const runs = await this.evaluationsRepository.listForExperiment(experimentId);
    for (const run of runs) {
      try {
        await this.evaluateRun(run, experiment.passThreshold, reevaluate);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Evaluation failed.';
        this.logger.error(message);
      }
    }
    return this.summary(experimentId);
  }

  async summary(experimentId: string): Promise<ExperimentEvaluationSummary> {
    const experiment = await this.requireExperiment(experimentId);
    const runs = await this.evaluationsRepository.listForExperiment(experimentId);
    return this.toSummary(experiment, runs);
  }

  async comparison(experimentId: string): Promise<ConfigurationComparison> {
    const experiment = await this.requireExperiment(experimentId);
    const runs = await this.evaluationsRepository.listForExperiment(experimentId);
    const configurations = experiment.configurations.map((configuration) => {
      const configurationRuns = runs.filter(
        (run) => run.experimentConfigurationId === configuration.id,
      );
      const evaluated = configurationRuns.flatMap((run) =>
        run.evaluation ? [run.evaluation] : [],
      );
      return {
        experimentConfigurationId: configuration.id,
        label: configuration.label,
        version: configuration.agentConfiguration.version,
        completedRuns: configurationRuns.filter((run) => run.status === 'COMPLETED').length,
        evaluatedRuns: evaluated.length,
        averageScore: average(evaluated.map((item) => item.score)),
        passRate: rate(evaluated),
        passedEvaluations: evaluated.filter((item) => item.passed).length,
        failedEvaluations: evaluated.filter((item) => !item.passed).length,
      };
    });
    const tasks = experiment.experimentTasks.map((task) => ({
      experimentTaskId: task.id,
      taskName: this.taskName(task.taskSnapshot),
      scores: experiment.configurations.map((configuration) => ({
        experimentConfigurationId: configuration.id,
        score: this.taskScore(runs, task.id, configuration.id),
      })),
    }));
    const parsed = configurationComparisonSchema.safeParse({
      experimentId,
      configurations,
      tasks,
    });
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored comparison is invalid.',
      );
    }
    return parsed.data;
  }

  async getForRun(runId: string): Promise<RunEvaluation> {
    const evaluation = await this.evaluationsRepository.findByRunId(runId);
    if (!evaluation) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Evaluation not found.');
    }
    return this.toEvaluation(evaluation);
  }

  private async evaluateRun(
    run: EvaluationRunRecord,
    passThreshold: number,
    reevaluate: boolean,
  ): Promise<void> {
    if (run.evaluation && !reevaluate) {
      return;
    }
    if (run.status !== 'COMPLETED' || run.finalOutput === null) {
      return;
    }
    const snapshot = experimentTaskSnapshotSchema.safeParse(run.experimentTask.taskSnapshot);
    if (!snapshot.success) {
      return;
    }
    const criteria = scoringCriteriaSchema.safeParse(snapshot.data.scoringCriteria);
    if (!criteria.success || !hasScorableCriteria(criteria.data)) {
      return;
    }
    const structured = inspectStructuredOutput(run.finalOutput, snapshot.data.outputSchema);
    if (structured && (!structured.parsed || structured.schemaValid !== true)) {
      return;
    }
    const result = evaluateOutput(
      run.finalOutput,
      criteria.data,
      passThreshold,
      structuredValueForEvaluation(structured),
    );
    if (!result.evaluable || result.score === null || result.passed === null) {
      return;
    }
    const write = {
      score: result.score,
      passed: result.passed,
      criterionResults: result.criterionResults,
    };
    if (run.evaluation) {
      await this.evaluationsRepository.update(run.id, write);
      return;
    }
    await this.evaluationsRepository.create(run.id, write);
  }

  private toSummary(
    experiment: ExperimentRecord,
    runs: EvaluationRunRecord[],
  ): ExperimentEvaluationSummary {
    const evaluated = runs.flatMap((run) => (run.evaluation ? [run.evaluation] : []));
    const passedEvaluations = evaluated.filter((item) => item.passed).length;
    let notEvaluated = 0;
    let notEvaluable = 0;
    for (const run of runs) {
      if (run.status !== 'COMPLETED' || run.evaluation) {
        continue;
      }
      if (run.finalOutput !== null && this.scorable(run)) {
        notEvaluated += 1;
      } else {
        notEvaluable += 1;
      }
    }
    const summary = {
      experimentId: experiment.id,
      passThreshold: experiment.passThreshold,
      planned: experiment.configurations.length * experiment.experimentTasks.length,
      completedRuns: runs.filter((run) => run.status === 'COMPLETED').length,
      failedRuns: runs.filter((run) => EXECUTION_FAILURE.has(run.status)).length,
      evaluatedRuns: evaluated.length,
      passedEvaluations,
      failedEvaluations: evaluated.length - passedEvaluations,
      notEvaluated,
      notEvaluable,
      averageScore: average(evaluated.map((item) => item.score)),
      passRate: rate(evaluated),
    };
    const parsed = experimentEvaluationSummarySchema.safeParse(summary);
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored evaluation summary is invalid.',
      );
    }
    return parsed.data;
  }

  private scorable(run: EvaluationRunRecord): boolean {
    const snapshot = experimentTaskSnapshotSchema.safeParse(run.experimentTask.taskSnapshot);
    if (!snapshot.success) {
      return false;
    }
    const criteria = scoringCriteriaSchema.safeParse(snapshot.data.scoringCriteria);
    if (!criteria.success || !hasScorableCriteria(criteria.data)) {
      return false;
    }
    const structured = inspectStructuredOutput(run.finalOutput, snapshot.data.outputSchema);
    return structured === null || (structured.parsed && structured.schemaValid === true);
  }

  private taskScore(
    runs: EvaluationRunRecord[],
    experimentTaskId: string,
    experimentConfigurationId: string,
  ): number | null {
    const scores = runs.flatMap((run) =>
      run.experimentTaskId === experimentTaskId &&
      run.experimentConfigurationId === experimentConfigurationId &&
      run.evaluation
        ? [run.evaluation.score]
        : [],
    );
    return average(scores);
  }

  private taskName(value: unknown): string {
    const snapshot = experimentTaskSnapshotSchema.safeParse(value);
    if (!snapshot.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored experiment task is invalid.',
      );
    }
    return snapshot.data.name;
  }

  private toEvaluation(evaluation: {
    id: string;
    runId: string;
    score: number;
    passed: boolean;
    criterionResults: unknown;
    evaluatedAt: Date;
  }): RunEvaluation {
    const parsed = runEvaluationSchema.safeParse({
      id: evaluation.id,
      runId: evaluation.runId,
      score: evaluation.score,
      passed: evaluation.passed,
      criterionResults: evaluation.criterionResults as CriterionEvaluation[],
      evaluatedAt: evaluation.evaluatedAt.toISOString(),
    });
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored evaluation is invalid.',
      );
    }
    return parsed.data;
  }

  private async requireExperiment(id: string): Promise<ExperimentRecord> {
    const experiment = await this.experimentsRepository.findById(id);
    if (!experiment) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Experiment not found.');
    }
    return experiment;
  }
}

function average(scores: number[]): number | null {
  if (scores.length === 0) {
    return null;
  }
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function rate(evaluations: Array<{ passed: boolean }>): number | null {
  if (evaluations.length === 0) {
    return null;
  }
  return evaluations.filter((item) => item.passed).length / evaluations.length;
}
