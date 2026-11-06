import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { EvaluationService } from './evaluation.service';
import { EvaluationsRepository } from './evaluations.repository';
import { ExecutionService } from './execution.service';
import { ExperimentsController } from './experiments.controller';
import { ExperimentsRepository } from './experiments.repository';
import { ExperimentsService } from './experiments.service';
import { HERMES_ONESHOT, HermesOneshotProcess } from './hermes-oneshot';
import { RunsController } from './runs.controller';
import { RunsRepository } from './runs.repository';

@Module({
  imports: [DatabaseModule, TasksModule],
  controllers: [ExperimentsController, RunsController],
  providers: [
    ExperimentsRepository,
    ExperimentsService,
    RunsRepository,
    EvaluationsRepository,
    EvaluationService,
    ExecutionService,
    HermesOneshotProcess,
    { provide: HERMES_ONESHOT, useExisting: HermesOneshotProcess },
  ],
  exports: [ExperimentsService, ExecutionService],
})
export class ExperimentsModule {}
