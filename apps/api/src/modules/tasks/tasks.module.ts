import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { TaskMapper } from './tasks.mapper';
import { TasksController } from './tasks.controller';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TasksController],
  providers: [TasksRepository, TasksService, TaskMapper],
})
export class TasksModule {}
