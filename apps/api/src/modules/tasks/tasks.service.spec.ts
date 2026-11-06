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
    expect(created.outputSchema).toBeNull();
    expect(created.expectedOutcome).toEqual({ city: 'Paris' });
    expect(created.scoringCriteria).toEqual(taskInput.scoringCriteria);
    expect(created.tags).toEqual(['geography']);
    expect(created.version).toBe(1);

    await expect(tasks.get(created.id)).resolves.toEqual(created);

    const renamed = await tasks.update(created.id, {
      name: 'Extract capital',
      description: null,
      tags: ['geography', 'europe'],
    });
    expect(renamed.version).toBe(1);
    expect(renamed.tags).toEqual(['geography', 'europe']);

    const sameCriteria = await tasks.update(created.id, {
      scoringCriteria: [
        {
          required: true,
          id: 'city',
          weight: 1,
          type: 'json_field_equals',
          params: { expected: 'Paris', path: 'city' },
        },
      ],
    });
    expect(sameCriteria.version).toBe(1);

    const rescored = await tasks.update(created.id, {
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
    expect(rescored.version).toBe(2);
    expect(rescored.scoringCriteria[0]?.type).toBe('output_contains');

    const sameOutcome = await tasks.update(created.id, {
      expectedOutcome: { city: 'Paris' },
    });
    expect(sameOutcome.version).toBe(2);

    const revised = await tasks.update(created.id, {
      input: 'Which city contains the Eiffel Tower?',
      expectedOutcome: { city: 'Lyon' },
    });
    expect(revised.version).toBe(3);
    expect(revised.input).toBe('Which city contains the Eiffel Tower?');
    expect(revised.expectedOutcome).toEqual({ city: 'Lyon' });

    const schema = { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] };
    const structured = await tasks.update(created.id, { outputSchema: schema });
    expect(structured.version).toBe(4);
    expect(structured.outputSchema).toEqual(schema);
    const sameSchema = await tasks.update(created.id, { outputSchema: schema });
    expect(sameSchema.version).toBe(4);
    const cleared = await tasks.update(created.id, { outputSchema: null });
    expect(cleared.version).toBe(5);
    expect(cleared.outputSchema).toBeNull();
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
