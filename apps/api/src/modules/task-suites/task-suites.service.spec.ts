import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDatabase } from '../../../test/create-test-app';
import { agentInput, taskInput } from '../../../test/fixtures';
import { AgentsService } from '../agents/agents.service';
import { TasksService } from '../tasks/tasks.service';
import { TaskSuitesService } from './task-suites.service';

describe('TaskSuitesService', () => {
  let app: INestApplication;
  let suites: TaskSuitesService;
  let agents: AgentsService;
  let tasks: TasksService;

  beforeAll(async () => {
    app = await createTestApp();
    suites = app.get(TaskSuitesService);
    agents = app.get(AgentsService);
    tasks = app.get(TasksService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a suite, assigns tasks, and leaves them standalone when the suite is deleted', async () => {
    const agent = await agents.create(agentInput);
    const first = await tasks.create(taskInput);
    const second = await tasks.create({ ...taskInput, name: 'Second task' });
    const suite = await suites.create(agent.id, { name: 'Cities', description: 'Location tasks' });

    const assigned = await suites.replaceTasks(agent.id, suite.id, {
      taskIds: [first.id, second.id],
    });
    expect(assigned.tasks.map((task) => task.id)).toEqual([first.id, second.id]);
    expect(assigned.taskCount).toBe(2);
    expect((await tasks.get(first.id)).taskSuiteId).toBe(suite.id);

    const removed = await suites.replaceTasks(agent.id, suite.id, { taskIds: [second.id] });
    expect(removed.tasks.map((task) => task.id)).toEqual([second.id]);
    expect((await tasks.get(first.id)).taskSuiteId).toBeNull();

    await suites.delete(agent.id, suite.id);
    expect((await tasks.get(second.id)).taskSuiteId).toBeNull();
    await expect(suites.get(agent.id, suite.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a task that already belongs to another suite', async () => {
    const agent = await agents.create(agentInput);
    const other = await agents.create({ ...agentInput, name: 'Other agent' });
    const task = await tasks.create(taskInput);
    const first = await suites.create(agent.id, { name: 'First' });
    const second = await suites.create(other.id, { name: 'Second' });
    await suites.replaceTasks(agent.id, first.id, { taskIds: [task.id] });

    await expect(
      suites.replaceTasks(other.id, second.id, { taskIds: [task.id] }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await tasks.get(task.id)).taskSuiteId).toBe(first.id);
  });
});
