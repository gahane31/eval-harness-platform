import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ErrorCode,
  experimentExecutionSchema,
  experimentTaskSnapshotSchema,
  runDetailSchema,
  runSummarySchema,
  runUsageSchema,
  storedAgentDraftConfigSchema,
  type ExperimentExecution,
  type RunDetail,
  type RunSummary,
  type RunUsage,
} from '@eval/shared';
import { AppException } from '../../common/exceptions/app.exception';
import { HERMES_REASONING_LEVELS } from '../runtime/hermes/hermes.constants';
import { EvaluationService } from './evaluation.service';
import { ExperimentsRepository, type ExperimentRecord } from './experiments.repository';
import {
  HERMES_EXECUTION_TIMEOUT_MS,
  HERMES_ONESHOT,
  type HermesOneshotRequest,
  type HermesOneshotResult,
  type HermesOneshotRunner,
} from './hermes-oneshot';
import { RunsRepository, type RunFinish, type RunRecord } from './runs.repository';
import {
  buildTaskPrompt,
  inspectStructuredOutput,
} from '../../structured-output/structured-output';

const TERMINAL_FAILURE = new Set(['FAILED', 'TIMED_OUT', 'CANCELLED']);

interface ExecutionPlan {
  experimentConfigurationId: string;
  profileId: string;
  provider: string;
  model: string;
  reasoning?: string;
  systemPrompt: string;
  experimentTaskId: string;
  prompt: string;
}

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    private readonly experimentsRepository: ExperimentsRepository,
    private readonly runsRepository: RunsRepository,
    private readonly evaluationService: EvaluationService,
    @Inject(HERMES_ONESHOT) private readonly hermes: HermesOneshotRunner,
  ) {}

  async start(id: string): Promise<ExperimentExecution> {
    const experiment = await this.requireExperiment(id);
    if (experiment.status !== 'DRAFT') {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Only a draft experiment can be started.',
      );
    }
    const plans = this.plans(experiment);
    const claimed = await this.experimentsRepository.claimDraft(id);
    if (!claimed) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Only a draft experiment can be started.',
      );
    }
    void this.execute(id, plans).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Experiment execution stopped.';
      this.logger.error(message);
    });
    return this.getExecution(id);
  }

  async getExecution(id: string): Promise<ExperimentExecution> {
    const experiment = await this.requireExperiment(id);
    const runs = await this.runsRepository.listForExperiment(id);
    const planned = experiment.configurations.length * experiment.experimentTasks.length;
    const completed = runs.filter((run) => run.status === 'COMPLETED').length;
    const failed = runs.filter((run) => TERMINAL_FAILURE.has(run.status)).length;
    const running = runs.filter((run) => run.status === 'RUNNING').length;
    const execution = {
      experimentId: experiment.id,
      status: experiment.status,
      planned,
      completed,
      failed,
      pending: Math.max(0, planned - completed - failed - running),
      startedAt: experiment.startedAt?.toISOString() ?? null,
      completedAt: experiment.completedAt?.toISOString() ?? null,
    };
    const parsed = experimentExecutionSchema.safeParse(execution);
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored experiment execution is invalid.',
      );
    }
    return parsed.data;
  }

  async listRuns(experimentId: string): Promise<RunSummary[]> {
    await this.requireExperiment(experimentId);
    const runs = await this.runsRepository.listForExperiment(experimentId);
    return runs.map((run) => this.toSummary(run));
  }

  async getRun(id: string): Promise<RunDetail> {
    const run = await this.runsRepository.findById(id);
    if (!run) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Run not found.');
    }
    const parsed = runDetailSchema.safeParse({
      ...this.summaryFields(run),
      hermesProfile: run.hermesProfile,
      finalOutput: run.finalOutput,
      error: run.error,
      structuredOutput: this.structuredOutput(run),
      usage: this.readUsage(run.usage),
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
    });
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored run is invalid.',
      );
    }
    return parsed.data;
  }

  private async execute(experimentId: string, plans: ExecutionPlan[]): Promise<void> {
    for (const plan of plans) {
      const run = await this.runsRepository.create({
        experimentId,
        experimentConfigurationId: plan.experimentConfigurationId,
        experimentTaskId: plan.experimentTaskId,
        hermesProfile: plan.profileId,
        runtimeSnapshot: {
          profileId: plan.profileId,
          provider: plan.provider,
          model: plan.model,
          reasoning: plan.reasoning ?? null,
          systemPromptApplied: plan.systemPrompt.length > 0,
        },
      });
      try {
        await this.runsRepository.markRunning(run.id);
        const result = await this.hermes.execute(this.request(plan));
        await this.runsRepository.finish(run.id, this.outcome(result));
      } catch {
        await this.runsRepository
          .finish(run.id, {
            status: 'FAILED',
            finalOutput: null,
            processExitCode: null,
            error: 'Execution failed before a result was stored.',
            usage: null,
            durationMs: null,
            hermesSessionId: null,
          })
          .catch(() => undefined);
      }
    }
    try {
      await this.evaluationService.evaluateMissing(experimentId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Evaluation failed.';
      this.logger.error(message);
    }
    await this.experimentsRepository.completeRunning(experimentId);
  }

  private request(plan: ExecutionPlan): HermesOneshotRequest {
    return {
      profileId: plan.profileId,
      provider: plan.provider,
      model: plan.model,
      ...(plan.reasoning === undefined ? {} : { reasoning: plan.reasoning }),
      systemPrompt: plan.systemPrompt,
      prompt: plan.prompt,
      timeoutMs: HERMES_EXECUTION_TIMEOUT_MS,
    };
  }

  private outcome(result: HermesOneshotResult): RunFinish {
    const sessionId =
      typeof result.usage?.session_id === 'string' && result.usage.session_id.length > 0
        ? result.usage.session_id
        : null;
    return {
      status: this.runStatus(result),
      finalOutput: result.stdout,
      processExitCode: result.exitCode,
      error: this.runError(result),
      usage: result.usage,
      durationMs: result.durationMs,
      hermesSessionId: sessionId,
    };
  }

  private runStatus(result: HermesOneshotResult): RunFinish['status'] {
    if (result.timedOut) {
      return 'TIMED_OUT';
    }
    if (this.runError(result) === null) {
      return 'COMPLETED';
    }
    return 'FAILED';
  }

  private runError(result: HermesOneshotResult): string | null {
    if (result.timedOut) {
      return 'Execution timed out after 180 seconds.';
    }
    if (result.launchFailed) {
      return 'Hermes could not be started.';
    }
    if (result.outputLimitExceeded) {
      return 'Hermes output exceeded the capture limit.';
    }
    if (result.exitCode !== 0) {
      return result.exitCode === null
        ? 'Hermes exited without a status code.'
        : `Hermes exited with code ${result.exitCode}.`;
    }
    if (result.usageError) {
      return result.usageError;
    }
    if (result.usage?.completed !== true) {
      return 'Hermes finished without a completed turn.';
    }
    return null;
  }

  private plans(experiment: ExperimentRecord): ExecutionPlan[] {
    if (experiment.configurations.length === 0 || experiment.experimentTasks.length === 0) {
      throw this.invalid('An experiment needs a published configuration and a task.');
    }
    const plans: ExecutionPlan[] = [];
    for (const configuration of experiment.configurations) {
      const snapshot = storedAgentDraftConfigSchema.safeParse(
        configuration.agentConfiguration.configSnapshot,
      );
      if (!snapshot.success) {
        throw this.invalid(`Published configuration ${configuration.label} cannot be read.`);
      }
      const config = snapshot.data;
      if (config.profileId === undefined) {
        throw this.invalid(
          `Published configuration ${configuration.label} has no Hermes profile. The default profile is not used.`,
        );
      }
      if (config.skills.length > 0 || config.toolsets.length > 0) {
        throw this.invalid(
          `Published configuration ${configuration.label} selects skills or toolsets. Those settings are not applied.`,
        );
      }
      if (config.memory.enabled) {
        throw this.invalid(
          `Published configuration ${configuration.label} enables memory. That setting is not applied.`,
        );
      }
      if (
        config.reasoning !== undefined &&
        !HERMES_REASONING_LEVELS.some((level) => level === config.reasoning)
      ) {
        throw this.invalid(
          `Published configuration ${configuration.label} uses a reasoning level Hermes does not accept.`,
        );
      }
      for (const task of experiment.experimentTasks) {
        const taskSnapshot = experimentTaskSnapshotSchema.safeParse(task.taskSnapshot);
        if (!taskSnapshot.success) {
          throw new AppException(
            HttpStatus.INTERNAL_SERVER_ERROR,
            ErrorCode.INTERNAL_ERROR,
            'Stored experiment task is invalid.',
          );
        }
        plans.push({
          experimentConfigurationId: configuration.id,
          profileId: config.profileId,
          provider: config.provider,
          model: config.model,
          ...(config.reasoning === undefined ? {} : { reasoning: config.reasoning }),
          systemPrompt: config.systemPrompt,
          experimentTaskId: task.id,
          prompt: buildTaskPrompt(taskSnapshot.data.input, taskSnapshot.data.outputSchema),
        });
      }
    }
    return plans;
  }

  private toSummary(run: RunRecord): RunSummary {
    const parsed = runSummarySchema.safeParse(this.summaryFields(run));
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored run is invalid.',
      );
    }
    return parsed.data;
  }

  private summaryFields(run: RunRecord) {
    const task = experimentTaskSnapshotSchema.safeParse(run.experimentTask.taskSnapshot);
    if (!task.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored experiment task is invalid.',
      );
    }
    return {
      id: run.id,
      experimentId: run.experimentId,
      experimentConfigurationId: run.experimentConfigurationId,
      configurationLabel: run.experimentConfiguration.label,
      configurationVersion: run.experimentConfiguration.agentConfiguration.version,
      experimentTaskId: run.experimentTaskId,
      taskName: task.data.name,
      status: run.status,
      durationMs: run.durationMs,
      processExitCode: run.processExitCode,
      hermesSessionId: run.hermesSessionId,
    };
  }

  private structuredOutput(run: RunRecord) {
    const task = experimentTaskSnapshotSchema.safeParse(run.experimentTask.taskSnapshot);
    if (!task.success) {
      return null;
    }
    return inspectStructuredOutput(run.finalOutput, task.data.outputSchema);
  }

  private readUsage(value: unknown): RunUsage | null {
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = runUsageSchema.safeParse(value);
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored run usage is invalid.',
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

  private invalid(message: string): AppException {
    return new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, message, [
      { path: 'configurations', message },
    ]);
  }
}
