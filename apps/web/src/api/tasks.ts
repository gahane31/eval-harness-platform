import { apiListEnvelopeSchema, taskResponseSchema } from '@eval/shared';
import { request } from './client';

const tasksListSchema = apiListEnvelopeSchema(taskResponseSchema);

export function listTasks(page = 1, pageSize = 20) {
  return request(`/tasks?page=${page}&pageSize=${pageSize}`, tasksListSchema);
}
