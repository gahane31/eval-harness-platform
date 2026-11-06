import { createRouter, createWebHistory } from 'vue-router';
import AgentDetailPage from '../pages/AgentDetailPage.vue';
import AgentsPage from '../pages/AgentsPage.vue';
import EvalCaseComparisonPage from '../pages/EvalCaseComparisonPage.vue';
import EvalCreatePage from '../pages/EvalCreatePage.vue';
import ExperimentDetailPage from '../pages/ExperimentDetailPage.vue';
import ExperimentsPage from '../pages/ExperimentsPage.vue';
import RunDetailPage from '../pages/RunDetailPage.vue';
import TaskCreatePage from '../pages/TaskCreatePage.vue';
import TaskDetailPage from '../pages/TaskDetailPage.vue';
import TasksPage from '../pages/TasksPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/agents' },
    { path: '/agents', name: 'agents', component: AgentsPage },
    { path: '/agents/:agentId', name: 'agent-detail', component: AgentDetailPage },
    { path: '/tasks', name: 'tasks', component: TasksPage },
    { path: '/tasks/new', name: 'task-create', component: TaskCreatePage },
    { path: '/tasks/:taskId', name: 'task-detail', component: TaskDetailPage },
    { path: '/experiments', name: 'experiments', component: ExperimentsPage },
    { path: '/experiments/new', name: 'eval-create', component: EvalCreatePage },
    {
      path: '/experiments/:experimentId/cases/:caseId',
      name: 'eval-case',
      component: EvalCaseComparisonPage,
    },
    {
      path: '/experiments/:experimentId',
      name: 'experiment-detail',
      component: ExperimentDetailPage,
    },
    {
      path: '/experiments/:experimentId/runs/:runId',
      name: 'run-detail',
      component: RunDetailPage,
    },
    { path: '/:pathMatch(.*)*', redirect: '/agents' },
  ],
});
