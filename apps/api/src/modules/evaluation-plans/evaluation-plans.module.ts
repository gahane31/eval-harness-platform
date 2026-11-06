import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { ExperimentsModule } from '../experiments/experiments.module';
import { BatchesController } from './batches.controller';
import { BatchesService } from './batches.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [DatabaseModule, ExperimentsModule],
  controllers: [PlansController, BatchesController, DashboardController],
  providers: [PlansService, BatchesService, DashboardService],
})
export class EvaluationPlansModule {}
