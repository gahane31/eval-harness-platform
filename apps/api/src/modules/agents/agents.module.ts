import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { AgentMapper } from './agents.mapper';
import { AgentsController } from './agents.controller';
import { AgentsRepository } from './agents.repository';
import { AgentsService } from './agents.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AgentsController],
  providers: [AgentsRepository, AgentsService, AgentMapper],
})
export class AgentsModule {}
