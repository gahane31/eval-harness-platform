import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/prisma.module';
import { RuntimeModule } from '../runtime/runtime.module';
import { AgentMapper } from './agents.mapper';
import { AgentsController } from './agents.controller';
import { AgentsRepository } from './agents.repository';
import { AgentsService } from './agents.service';
import { ConfigurationVersionsController } from './configuration-versions.controller';

@Module({
  imports: [DatabaseModule, RuntimeModule],
  controllers: [AgentsController, ConfigurationVersionsController],
  providers: [AgentsRepository, AgentsService, AgentMapper],
})
export class AgentsModule {}
