import {
  apiListEnvelopeSchema,
  apiSuccessEnvelopeSchema,
  taskSuiteDetailResponseSchema,
  taskSuiteResponseSchema,
  type TaskSuiteCreateRequest,
  type TaskSuiteTasksRequest,
  type TaskSuiteUpdateRequest,
} from '@eval/shared';
import { z } from 'zod';
import { listAllAgents } from './agents';
import { request } from './client';

const suiteEnvelope = apiSuccessEnvelopeSchema(taskSuiteResponseSchema);
const suitesEnvelope = apiListEnvelopeSchema(taskSuiteResponseSchema);
const detailEnvelope = apiSuccessEnvelopeSchema(taskSuiteDetailResponseSchema);
const deletedEnvelope = apiSuccessEnvelopeSchema(z.object({ id: z.uuid() }).strict());

export interface TaskSuiteDetailView {
  id: string;
  name: string;
  description: string | null;
  tasks: Array<{ id: string; name: string; version: number }>;
}

export interface SuiteDirectoryEntry {
  suiteId: string;
  suiteName: string;
  agentId: string;
  agentName: string;
  taskCount: number;
}

export interface SuiteDirectory {
  agents: Array<{ id: string; name: string }>;
  suites: SuiteDirectoryEntry[];
}

export async function loadSuiteDirectory(): Promise<SuiteDirectory> {
  const agents = await listAllAgents();
  const suitesByAgent = await Promise.all(
    agents.map(async (agent) => ({ agent, suites: await listAllTaskSuites(agent.id) })),
  );
  return {
    agents: agents.map((agent) => ({ id: agent.id, name: agent.name })),
    suites: suitesByAgent.flatMap(({ agent, suites }) =>
      suites.map((suite) => ({
        suiteId: suite.id,
        suiteName: suite.name,
        agentId: agent.id,
        agentName: agent.name,
        taskCount: suite.taskCount,
      })),
    ),
  };
}

export async function addTaskToSuite(agentId: string, suiteId: string, taskId: string) {
  const suite = await getTaskSuite(agentId, suiteId);
  const taskIds = suite.data.tasks.map((task) => task.id);
  if (taskIds.includes(taskId)) {
    return suite;
  }
  return replaceSuiteTasks(agentId, suiteId, { taskIds: [...taskIds, taskId] });
}

export async function listAllTaskSuites(agentId: string) {
  const first = await listTaskSuites(agentId, 1, 100);
  const items = [...first.data];
  for (let page = 2; page <= first.meta.totalPages; page += 1) {
    const next = await listTaskSuites(agentId, page, 100);
    items.push(...next.data);
  }
  return items;
}

export function listTaskSuites(agentId: string, page = 1, pageSize = 100) {
  return request(
    `/agents/${agentId}/task-suites?page=${page}&pageSize=${pageSize}`,
    suitesEnvelope,
  );
}

export function createTaskSuite(agentId: string, body: TaskSuiteCreateRequest) {
  return request(`/agents/${agentId}/task-suites`, suiteEnvelope, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getTaskSuite(
  agentId: string,
  suiteId: string,
): Promise<{ data: TaskSuiteDetailView }> {
  const response = await request(`/agents/${agentId}/task-suites/${suiteId}`, detailEnvelope);
  return { data: toDetailView(response.data) };
}

export async function updateTaskSuite(
  agentId: string,
  suiteId: string,
  body: TaskSuiteUpdateRequest,
): Promise<{ data: TaskSuiteDetailView }> {
  const response = await request(`/agents/${agentId}/task-suites/${suiteId}`, detailEnvelope, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return { data: toDetailView(response.data) };
}

export async function replaceSuiteTasks(
  agentId: string,
  suiteId: string,
  body: TaskSuiteTasksRequest,
): Promise<{ data: TaskSuiteDetailView }> {
  const response = await request(
    `/agents/${agentId}/task-suites/${suiteId}/tasks`,
    detailEnvelope,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
  return { data: toDetailView(response.data) };
}

function toDetailView(suite: {
  id: string;
  name: string;
  description: string | null;
  tasks: Array<{ id: string; name: string; version: number }>;
}): TaskSuiteDetailView {
  return {
    id: suite.id,
    name: suite.name,
    description: suite.description,
    tasks: suite.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      version: task.version,
    })),
  };
}

export function deleteTaskSuite(agentId: string, suiteId: string) {
  return request(`/agents/${agentId}/task-suites/${suiteId}`, deletedEnvelope, {
    method: 'DELETE',
  });
}
