import {
  apiListEnvelopeSchema,
  apiSuccessEnvelopeSchema,
  taskResponseSchema,
  type TaskCreateRequest,
  type TaskUpdateRequest,
} from '@eval/shared';
import { request } from './client';

const tasksListSchema = apiListEnvelopeSchema(taskResponseSchema);
const taskEnvelope = apiSuccessEnvelopeSchema(taskResponseSchema);

export function listTasks(page = 1, pageSize = 20) {
  return request(`/tasks?page=${page}&pageSize=${pageSize}`, tasksListSchema);
}

export function getTask(id: string) {
  return request(`/tasks/${id}`, taskEnvelope);
}

export function createTask(body: TaskCreateRequest) {
  return request('/tasks', taskEnvelope, { method: 'POST', body: JSON.stringify(body) });
}

export function updateTask(id: string, body: TaskUpdateRequest) {
  return request(`/tasks/${id}`, taskEnvelope, { method: 'PUT', body: JSON.stringify(body) });
}

export async function listAllTasks() {
  const first = await listTasks(1, 100);
  const items = [...first.data];
  for (let page = 2; page <= first.meta.totalPages; page += 1) {
    const next = await listTasks(page, 100);
    items.push(...next.data);
  }
  return items;
}
