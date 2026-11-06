import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDatabase } from '../../../test/create-test-app';
import { agentInput, draftConfig, taskInput } from '../../../test/fixtures';
import { AgentsService } from '../agents/agents.service';
import { TasksService } from '../tasks/tasks.service';
import { TaskSuitesService } from '../task-suites/task-suites.service';
import { ExperimentsService } from './experiments.service';

describe('ExperimentsService', () => {
  let app: INestApplication;
  let experiments: ExperimentsService;
  let agents: AgentsService;
  let tasks: TasksService;
  let suites: TaskSuitesService;

  beforeAll(async () => {
    app = await createTestApp();
    experiments = app.get(ExperimentsService);
    agents = app.get(AgentsService);
    tasks = app.get(TasksService);
    suites = app.get(TaskSuitesService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('snapshots unique tasks and keeps that snapshot when the task later changes', async () => {
    const agent = await agents.create(agentInput);
    const firstVersion = await agents.publish(agent.id);
    await agents.updateDraftConfig(agent.id, {
      ...draftConfig,
      systemPrompt: 'A second published prompt.',
    });
    const secondVersion = await agents.publish(agent.id);
    const suiteTask = await tasks.create(taskInput);
    const extraTask = await tasks.create({
      ...taskInput,
      name: 'Standalone task',
      tags: ['extra'],
    });
    const suite = await suites.create(agent.id, { name: 'Cities' });
    await suites.replaceTasks(agent.id, suite.id, { taskIds: [suiteTask.id] });

    const created = await experiments.create({
      name: 'Compare prompts',
      agentId: agent.id,
      configurationIds: [firstVersion.id, secondVersion.id],
      taskSuiteIds: [suite.id],
      taskIds: [suiteTask.id, extraTask.id],
    });

    expect(created.status).toBe('DRAFT');
    expect(created.configurationCount).toBe(2);
    expect(created.uniqueTaskCount).toBe(2);
    expect(created.plannedExecutionCount).toBe(4);
    expect(created.tasks.map((task) => task.taskId)).toEqual([suiteTask.id, extraTask.id]);
    expect(created.taskSuites.map((item) => item.id)).toEqual([suite.id]);
    expect(created.tasks[0]?.taskSnapshot).toMatchObject({
      name: taskInput.name,
      version: 1,
      tags: ['geography'],
    });
    expect(created.configurations.map((item) => item.displayOrder)).toEqual([0, 1]);

    await tasks.update(suiteTask.id, { input: 'Changed after the experiment was created.' });
    const reread = await experiments.get(created.id);
    expect(reread.tasks[0]?.taskSnapshot.input).toBe(taskInput.input);

    const edited = await experiments.update(created.id, {
      name: 'Compare prompts again',
      configurationIds: [secondVersion.id],
      taskSuiteIds: [suite.id],
      taskIds: [extraTask.id],
    });
    expect(edited.configurationCount).toBe(1);
    expect(edited.plannedExecutionCount).toBe(2);
    expect(edited.tasks[0]?.taskSnapshot.input).toBe(taskInput.input);
    expect(edited.tasks[0]?.taskSnapshot.version).toBe(1);
  });

  it('rejects a configuration or suite from another agent', async () => {
    const agent = await agents.create(agentInput);
    const other = await agents.create({ ...agentInput, name: 'Other agent' });
    const published = await agents.publish(agent.id);
    const otherPublished = await agents.publish(other.id);
    const task = await tasks.create(taskInput);
    const foreignSuite = await suites.create(other.id, { name: 'Foreign' });
    await suites.replaceTasks(other.id, foreignSuite.id, { taskIds: [task.id] });

    await expect(
      experiments.create({
        name: 'Wrong configuration',
        agentId: agent.id,
        configurationIds: [otherPublished.id],
        taskSuiteIds: [],
        taskIds: [task.id],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(
      experiments.create({
        name: 'Wrong suite',
        agentId: agent.id,
        configurationIds: [published.id],
        taskSuiteIds: [foreignSuite.id],
        taskIds: [],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await experiments.list({ page: 1, pageSize: 20 })).toMatchObject({
      items: [],
      meta: { total: 0 },
    });
  });
});
