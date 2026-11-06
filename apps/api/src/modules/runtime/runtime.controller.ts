import { Controller, Get, Query } from '@nestjs/common';
import { runtimeRefreshQuerySchema, runtimeScopedQuerySchema } from '@eval/shared';
import type { RuntimeRefreshQuery, RuntimeScopedQuery } from '@eval/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RuntimeService } from './runtime.service';

@Controller('runtime')
export class RuntimeController {
  constructor(private readonly runtimeService: RuntimeService) {}

  @Get('capabilities')
  capabilities(@Query(new ZodValidationPipe(runtimeScopedQuerySchema)) query: RuntimeScopedQuery) {
    return this.runtimeService.capabilities(query);
  }

  @Get('models')
  models(@Query(new ZodValidationPipe(runtimeScopedQuerySchema)) query: RuntimeScopedQuery) {
    return this.runtimeService.models(query);
  }

  @Get('skills')
  skills(@Query(new ZodValidationPipe(runtimeScopedQuerySchema)) query: RuntimeScopedQuery) {
    return this.runtimeService.skills(query);
  }

  @Get('toolsets')
  toolsets(@Query(new ZodValidationPipe(runtimeScopedQuerySchema)) query: RuntimeScopedQuery) {
    return this.runtimeService.toolsets(query);
  }

  @Get('profiles')
  profiles(@Query(new ZodValidationPipe(runtimeRefreshQuerySchema)) query: RuntimeRefreshQuery) {
    return this.runtimeService.profiles(query);
  }
}
