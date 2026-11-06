import { Inject, Injectable } from '@nestjs/common';
import type { RuntimeRefreshQuery, RuntimeScopedQuery } from '@eval/shared';
import { AGENT_RUNTIME, type AgentRuntime, type RuntimeScope } from './agent-runtime';

@Injectable()
export class RuntimeService {
  constructor(@Inject(AGENT_RUNTIME) private readonly runtime: AgentRuntime) {}

  capabilities(query: RuntimeScopedQuery) {
    return this.runtime.getCapabilities(scopeFrom(query));
  }

  models(query: RuntimeScopedQuery) {
    return this.runtime.getModels(scopeFrom(query));
  }

  skills(query: RuntimeScopedQuery) {
    return this.runtime.getSkills(scopeFrom(query));
  }

  toolsets(query: RuntimeScopedQuery) {
    return this.runtime.getToolsets(scopeFrom(query));
  }

  profiles(query: RuntimeRefreshQuery) {
    return this.runtime.getProfiles({ refresh: query.refresh === 'true' });
  }
}

function scopeFrom(query: RuntimeScopedQuery): RuntimeScope {
  return { profile: query.profile, refresh: query.refresh === 'true' };
}
