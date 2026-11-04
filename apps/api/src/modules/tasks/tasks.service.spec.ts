import type { INestApplication } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { createTestApp, resetDatabase } from '../../../test/create-test-app';
import { taskInput } from '../../../test/fixtures';

describe('TasksService', () => {
  let app: INestApplication;
  let tasks: TasksService;

  beforeAll(async () => {
    app = await createTestApp();
    tasks = app.get(TasksService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates, reads, and updates a task', async () => {
    const created = await tasks.create(taskInput);
    expect(created.input).toBe(taskInput.input);
    expect(created.expectedOutcome).toEqual({ city: 'Paris' });
    expect(created.scoringCriteria).toEqual(taskInput.scoringCriteria);
    expect(created.tags).toEqual(['geography']);
    expect(created.version).toBe(1);

    await expect(tasks.get(created.id)).resolves.toEqual(created);

    const updated = await tasks.update(created.id, {
      version: 2,
      tags: ['geography', 'europe'],
      scoringCriteria: [
        {
          id: 'mentions-paris',
          type: 'output_contains',
          weight: 1,
          required: true,
          params: { text: 'Paris' },
        },
      ],
    });
    expect(updated.version).toBe(2);
    expect(updated.tags).toEqual(['geography', 'europe']);
    expect(updated.scoringCriteria[0]?.type).toBe('output_contains');
  });

  it('stores an omitted description as null and paginates tasks', async () => {
    const created = await tasks.create({
      ...taskInput,
      description: undefined,
      tags: [],
    });
    expect(created.description).toBeNull();

    await tasks.create({ ...taskInput, name: 'Second task' });
    const page = await tasks.list({ page: 1, pageSize: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.meta.total).toBe(2);
    expect(page.meta.totalPages).toBe(2);

    await expect(tasks.get('22222222-2222-4222-8222-222222222222')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
