import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  experimentResponseSchema,
  experimentTaskSnapshotSchema,
  type ExperimentCreateRequest,
  type ExperimentResponse,
  type ExperimentTaskSnapshot,
  type ExperimentUpdateRequest,
  type PaginationQuery,
} from '@eval/shared';
import { z } from 'zod';
import type { Task } from '../../generated/prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { buildPagination, Paginated } from '../../common/utils/pagination';
import { TaskMapper } from '../tasks/tasks.mapper';
import {
  ExperimentsRepository,
  type ExperimentRecord,
  type ExperimentWrite,
} from './experiments.repository';

@Injectable()
export class ExperimentsService {
  constructor(
    private readonly experimentsRepository: ExperimentsRepository,
    private readonly taskMapper: TaskMapper,
  ) {}

  async create(input: ExperimentCreateRequest): Promise<ExperimentResponse> {
    const agent = await this.experimentsRepository.findAgent(input.agentId);
    if (!agent) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Agent not found.');
    }
    const write = await this.selection(input.agentId, input, new Map());
    const experiment = await this.experimentsRepository.create(input.agentId, {
      ...write,
      name: input.name,
      description: input.description ?? null,
    });
    return await this.toResponse(experiment);
  }

  async list(query: PaginationQuery): Promise<Paginated<ExperimentResponse>> {
    const { items, total } = await this.experimentsRepository.list(query.page, query.pageSize);
    return new Paginated(
      await Promise.all(items.map((experiment) => this.toResponse(experiment))),
      buildPagination(query.page, query.pageSize, total),
    );
  }

  async get(id: string): Promise<ExperimentResponse> {
    return await this.toResponse(await this.requireExperiment(id));
  }

  async update(id: string, input: ExperimentUpdateRequest): Promise<ExperimentResponse> {
    const existing = await this.requireExperiment(id);
    if (existing.status !== 'DRAFT') {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'Only a draft experiment can be edited.',
      );
    }
    const kept = new Map(
      existing.experimentTasks.map((task) => [task.taskId, this.readSnapshot(task.taskSnapshot)]),
    );
    const write = await this.selection(existing.agentId, input, kept);
    const experiment = await this.experimentsRepository.replace(id, {
      ...write,
      name: input.name,
      description: input.description ?? null,
    });
    return await this.toResponse(experiment);
  }

  private async requireExperiment(id: string): Promise<ExperimentRecord> {
    const experiment = await this.experimentsRepository.findById(id);
    if (!experiment) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Experiment not found.');
    }
    return experiment;
  }

  private async selection(
    agentId: string,
    input: Pick<ExperimentCreateRequest, 'configurationIds' | 'taskSuiteIds' | 'taskIds'>,
    keptSnapshots: Map<string, ExperimentTaskSnapshot>,
  ): Promise<Omit<ExperimentWrite, 'name' | 'description'>> {
    const configurations = await this.experimentsRepository.findConfigurations(
      input.configurationIds,
    );
    if (configurations.length !== input.configurationIds.length) {
      throw this.invalid(
        'configurationIds',
        'One or more published configurations were not found.',
      );
    }
    if (configurations.some((configuration) => configuration.agentId !== agentId)) {
      throw this.invalid('configurationIds', 'Selected configurations must belong to this agent.');
    }
    const configurationById = new Map(
      configurations.map((configuration) => [configuration.id, configuration]),
    );

    const suites = await this.experimentsRepository.findSuites(input.taskSuiteIds);
    if (suites.length !== input.taskSuiteIds.length) {
      throw this.invalid('taskSuiteIds', 'One or more task suites were not found.');
    }
    if (suites.some((suite) => suite.agentId !== agentId)) {
      throw this.invalid('taskSuiteIds', 'Selected task suites must belong to this agent.');
    }
    const suiteById = new Map(suites.map((suite) => [suite.id, suite]));

    const directTasks = await this.experimentsRepository.findTasks(input.taskIds);
    if (directTasks.length !== input.taskIds.length) {
      throw this.invalid('taskIds', 'One or more tasks were not found.');
    }
    const taskById = new Map<string, Task>();
    for (const suite of suites) {
      for (const task of suite.tasks) {
        taskById.set(task.id, task);
      }
    }
    for (const task of directTasks) {
      taskById.set(task.id, task);
    }

    const orderedTaskIds: string[] = [];
    const seen = new Set<string>();
    const addTask = (taskId: string) => {
      if (seen.has(taskId)) {
        return;
      }
      seen.add(taskId);
      orderedTaskIds.push(taskId);
    };
    for (const suiteId of input.taskSuiteIds) {
      for (const task of suiteById.get(suiteId)?.tasks ?? []) {
        addTask(task.id);
      }
    }
    for (const taskId of input.taskIds) {
      addTask(taskId);
    }
    if (orderedTaskIds.length === 0) {
      throw this.invalid('taskIds', 'Select at least one task.');
    }

    return {
      taskSuiteIds: input.taskSuiteIds,
      configurations: input.configurationIds.map((id, displayOrder) => {
        const configuration = configurationById.get(id);
        if (!configuration) {
          throw this.invalid(
            'configurationIds',
            'One or more published configurations were not found.',
          );
        }
        return {
          agentConfigurationId: configuration.id,
          label: `Version ${configuration.version}`,
          displayOrder,
        };
      }),
      tasks: orderedTaskIds.map((taskId, executionOrder) => {
        const task = taskById.get(taskId);
        if (!task) {
          throw this.invalid('taskIds', 'One or more tasks were not found.');
        }
        return {
          taskId,
          executionOrder,
          taskSnapshot: keptSnapshots.get(taskId) ?? this.snapshot(task),
        };
      }),
    };
  }

  private snapshot(task: Task): ExperimentTaskSnapshot {
    const response = this.taskMapper.toResponse(task);
    return {
      name: response.name,
      description: response.description,
      input: response.input,
      expectedOutcome: response.expectedOutcome,
      scoringCriteria: response.scoringCriteria,
      outputSchema: response.outputSchema,
      version: response.version,
      tags: response.tags,
    };
  }

  private readSnapshot(value: unknown): ExperimentTaskSnapshot {
    const parsed = experimentTaskSnapshotSchema.safeParse(value);
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored experiment task is invalid.',
      );
    }
    return parsed.data;
  }

  private async toResponse(experiment: ExperimentRecord): Promise<ExperimentResponse> {
    const suiteIds = readSuiteIds(experiment.taskSuiteIds);
    const response = {
      id: experiment.id,
      agentId: experiment.agentId,
      agentName: experiment.agent.name,
      name: experiment.name,
      description: experiment.description,
      status: experiment.status,
      configurations: experiment.configurations.map((configuration) => ({
        id: configuration.id,
        agentConfigurationId: configuration.agentConfigurationId,
        label: configuration.label,
        displayOrder: configuration.displayOrder,
        version: configuration.agentConfiguration.version,
        configHash: configuration.agentConfiguration.configHash,
      })),
      tasks: experiment.experimentTasks.map((task) => ({
        id: task.id,
        taskId: task.taskId,
        executionOrder: task.executionOrder,
        taskSnapshot: this.readSnapshot(task.taskSnapshot),
      })),
      configurationCount: experiment.configurations.length,
      uniqueTaskCount: experiment.experimentTasks.length,
      plannedExecutionCount: experiment.configurations.length * experiment.experimentTasks.length,
      createdAt: experiment.createdAt.toISOString(),
    };
    return this.withSuites(response, suiteIds);
  }

  private async withSuites(
    response: Omit<ExperimentResponse, 'taskSuites'>,
    suiteIds: string[],
  ): Promise<ExperimentResponse> {
    const suites =
      suiteIds.length === 0 ? [] : await this.experimentsRepository.findSuitesByIds(suiteIds);
    const suiteById = new Map(suites.map((suite) => [suite.id, suite]));
    const taskSuites = suiteIds.flatMap((id) => {
      const suite = suiteById.get(id);
      return suite ? [{ id: suite.id, name: suite.name, description: suite.description }] : [];
    });
    const parsed = experimentResponseSchema.safeParse({ ...response, taskSuites });
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Stored experiment is invalid.',
      );
    }
    return parsed.data;
  }

  private invalid(path: string, message: string): AppException {
    return new AppException(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, message, [
      { path, message },
    ]);
  }
}

function readSuiteIds(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  const parsed = z.array(z.uuid()).safeParse(value);
  if (!parsed.success) {
    throw new AppException(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_ERROR,
      'Stored experiment is invalid.',
    );
  }
  return parsed.data;
}
