import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { AGENT_RUNTIME, type AgentRuntime } from '../src/modules/runtime/agent-runtime';
import {
  HERMES_ONESHOT,
  type HermesOneshotRunner,
} from '../src/modules/experiments/hermes-oneshot';
import { createFakeRuntime } from './fake-runtime';

export async function createTestApp(
  runtime: AgentRuntime = createFakeRuntime(),
  hermes?: HermesOneshotRunner,
): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AGENT_RUNTIME)
    .useValue(runtime);
  if (hermes) {
    builder = builder.overrideProvider(HERMES_ONESHOT).useValue(hermes);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

export async function resetDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.evaluation.deleteMany();
  await prisma.executionEvent.deleteMany();
  await prisma.run.deleteMany();
  await prisma.experimentTask.deleteMany();
  await prisma.experimentConfiguration.deleteMany();
  await prisma.experiment.deleteMany();
  await prisma.agentConfiguration.deleteMany();
  await prisma.task.deleteMany();
  await prisma.taskSuite.deleteMany();
  await prisma.agent.deleteMany();
}
