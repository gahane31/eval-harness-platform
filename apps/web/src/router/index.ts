import { createRouter, createWebHistory } from 'vue-router';
import AgentsPage from '../pages/AgentsPage.vue';
import ExperimentsPage from '../pages/ExperimentsPage.vue';
import TasksPage from '../pages/TasksPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/agents' },
    { path: '/agents', name: 'agents', component: AgentsPage },
    { path: '/tasks', name: 'tasks', component: TasksPage },
    { path: '/experiments', name: 'experiments', component: ExperimentsPage },
    { path: '/:pathMatch(.*)*', redirect: '/agents' },
  ],
});
