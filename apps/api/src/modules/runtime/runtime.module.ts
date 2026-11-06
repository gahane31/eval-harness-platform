import { Module } from '@nestjs/common';
import { AGENT_RUNTIME } from './agent-runtime';
import { HERMES_COMMANDS } from './hermes/hermes-command';
import { HermesProcess } from './hermes/hermes-process';
import { HermesRuntime } from './hermes/hermes-runtime';
import { RuntimeController } from './runtime.controller';
import { RuntimeService } from './runtime.service';

@Module({
  controllers: [RuntimeController],
  providers: [
    HermesProcess,
    { provide: HERMES_COMMANDS, useExisting: HermesProcess },
    HermesRuntime,
    { provide: AGENT_RUNTIME, useExisting: HermesRuntime },
    RuntimeService,
  ],
  exports: [AGENT_RUNTIME],
})
export class RuntimeModule {}
