import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
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
  await prisma.agent.deleteMany();
}
