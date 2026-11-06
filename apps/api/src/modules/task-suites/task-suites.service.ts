import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type PaginationQuery,
  type TaskSuiteCreateRequest,
  type TaskSuiteDetailResponse,
  type TaskSuiteResponse,
  type TaskSuiteTasksRequest,
  type TaskSuiteUpdateRequest,
} from '@eval/shared';
import { AppException } from '../../common/exceptions/app.exception';
import { buildPagination, Paginated } from '../../common/utils/pagination';
import { PrismaService } from '../../database/prisma.service';
import { TaskMapper } from '../tasks/tasks.mapper';
import {
  TaskSuitesRepository,
  type TaskSuiteDetailRecord,
  type TaskSuiteRecord,
} from './task-suites.repository';

@Injectable()
export class TaskSuitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskSuitesRepository: TaskSuitesRepository,
    private readonly taskMapper: TaskMapper,
  ) {}

  async create(agentId: string, input: TaskSuiteCreateRequest): Promise<TaskSuiteResponse> {
    await this.requireAgent(agentId);
    const suite = await this.taskSuitesRepository.create(agentId, input);
    return this.toSummary(suite);
  }

  async list(agentId: string, query: PaginationQuery): Promise<Paginated<TaskSuiteResponse>> {
    await this.requireAgent(agentId);
    const { items, total } = await this.taskSuitesRepository.list(
      agentId,
      query.page,
      query.pageSize,
    );
    return new Paginated(
      items.map((suite) => this.toSummary(suite)),
      buildPagination(query.page, query.pageSize, total),
    );
  }

  async get(agentId: string, suiteId: string): Promise<TaskSuiteDetailResponse> {
    const suite = await this.requireSuite(agentId, suiteId);
    return this.toDetail(suite);
  }

  async update(
    agentId: string,
    suiteId: string,
    input: TaskSuiteUpdateRequest,
  ): Promise<TaskSuiteDetailResponse> {
    await this.requireSuite(agentId, suiteId);
    const suite = await this.taskSuitesRepository.update(suiteId, input);
    return this.toDetail(suite);
  }

  async delete(agentId: string, suiteId: string): Promise<{ id: string }> {
    await this.requireSuite(agentId, suiteId);
    await this.taskSuitesRepository.delete(suiteId);
    return { id: suiteId };
  }

  async replaceTasks(
    agentId: string,
    suiteId: string,
    input: TaskSuiteTasksRequest,
  ): Promise<TaskSuiteDetailResponse> {
    await this.requireSuite(agentId, suiteId);
    const tasks = await this.taskSuitesRepository.findTasks(input.taskIds);
    if (tasks.length !== input.taskIds.length) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.VALIDATION_ERROR,
        'One or more tasks were not found.',
        [{ path: 'taskIds', message: 'One or more tasks were not found.' }],
      );
    }
    const blocked = tasks.find((task) => task.taskSuiteId !== null && task.taskSuiteId !== suiteId);
    if (blocked) {
      throw new AppException(
        HttpStatus.CONFLICT,
        ErrorCode.CONFLICT,
        'A task already belongs to another suite.',
        [{ path: 'taskIds', message: `Task ${blocked.id} already belongs to another suite.` }],
      );
    }
    await this.taskSuitesRepository.replaceTasks(suiteId, input.taskIds);
    const suite = await this.taskSuitesRepository.findById(suiteId);
    if (!suite) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Task suite not found.');
    }
    return this.toDetail(suite);
  }

  private async requireAgent(agentId: string): Promise<void> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true },
    });
    if (!agent) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Agent not found.');
    }
  }

  private async requireSuite(agentId: string, suiteId: string): Promise<TaskSuiteDetailRecord> {
    const suite = await this.taskSuitesRepository.findById(suiteId);
    if (!suite || suite.agentId !== agentId) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Task suite not found.');
    }
    return suite;
  }

  private toSummary(suite: TaskSuiteRecord): TaskSuiteResponse {
    return {
      id: suite.id,
      agentId: suite.agentId,
      name: suite.name,
      description: suite.description,
      taskCount: suite._count.tasks,
      createdAt: suite.createdAt.toISOString(),
      updatedAt: suite.updatedAt.toISOString(),
    };
  }

  private toDetail(suite: TaskSuiteDetailRecord): TaskSuiteDetailResponse {
    return {
      ...this.toSummary(suite),
      tasks: suite.tasks.map((task) => this.taskMapper.toResponse(task)),
    };
  }
}
