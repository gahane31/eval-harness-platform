import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { TasksModule } from '../tasks/tasks.module';
import { TaskSuitesController } from './task-suites.controller';
import { TaskSuitesRepository } from './task-suites.repository';
import { TaskSuitesService } from './task-suites.service';

@Module({
  imports: [DatabaseModule, TasksModule],
  controllers: [TaskSuitesController],
  providers: [TaskSuitesRepository, TaskSuitesService],
})
export class TaskSuitesModule {}
