import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorCode,
  type PaginationQuery,
  type TaskCreateRequest,
  type TaskResponse,
  type TaskUpdateRequest,
} from '@eval/shared';
import { AppException } from '../../common/exceptions/app.exception';
import { buildPagination, Paginated } from '../../common/utils/pagination';
import { TaskMapper } from './tasks.mapper';
import { TasksRepository } from './tasks.repository';

@Injectable()
export class TasksService {
  constructor(
    private readonly tasksRepository: TasksRepository,
    private readonly taskMapper: TaskMapper,
  ) {}

  async create(input: TaskCreateRequest): Promise<TaskResponse> {
    const task = await this.tasksRepository.create(input);
    return this.taskMapper.toResponse(task);
  }

  async list(query: PaginationQuery): Promise<Paginated<TaskResponse>> {
    const { items, total } = await this.tasksRepository.list(query.page, query.pageSize);
    return new Paginated(
      items.map((task) => this.taskMapper.toResponse(task)),
      buildPagination(query.page, query.pageSize, total),
    );
  }

  async get(id: string): Promise<TaskResponse> {
    const task = await this.requireTask(id);
    return this.taskMapper.toResponse(task);
  }

  async update(id: string, input: TaskUpdateRequest): Promise<TaskResponse> {
    await this.requireTask(id);
    const task = await this.tasksRepository.update(id, input);
    return this.taskMapper.toResponse(task);
  }

  private async requireTask(id: string) {
    const task = await this.tasksRepository.findById(id);
    if (!task) {
      throw new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Task not found.');
    }
    return task;
  }
}
