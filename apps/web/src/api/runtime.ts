import {
  apiSuccessEnvelopeSchema,
  runtimeCapabilitiesSchema,
  runtimeModelCatalogueSchema,
  runtimeProfileCatalogueSchema,
  runtimeSkillCatalogueSchema,
  runtimeToolsetCatalogueSchema,
} from '@eval/shared';
import { request } from './client';

const capabilitiesEnvelope = apiSuccessEnvelopeSchema(runtimeCapabilitiesSchema);
const modelsEnvelope = apiSuccessEnvelopeSchema(runtimeModelCatalogueSchema);
const skillsEnvelope = apiSuccessEnvelopeSchema(runtimeSkillCatalogueSchema);
const toolsetsEnvelope = apiSuccessEnvelopeSchema(runtimeToolsetCatalogueSchema);
const profilesEnvelope = apiSuccessEnvelopeSchema(runtimeProfileCatalogueSchema);

export function listRuntimeProfiles(refresh = false) {
  const refreshQuery = refresh ? '?refresh=true' : '';
  return request(`/runtime/profiles${refreshQuery}`, profilesEnvelope);
}

export function getRuntimeCapabilities(profile: string, refresh = false) {
  return request(`/runtime/capabilities?${scopeQuery(profile, refresh)}`, capabilitiesEnvelope);
}

export function listRuntimeModels(profile: string, refresh = false) {
  return request(`/runtime/models?${scopeQuery(profile, refresh)}`, modelsEnvelope);
}

export function listRuntimeSkills(profile: string, refresh = false) {
  return request(`/runtime/skills?${scopeQuery(profile, refresh)}`, skillsEnvelope);
}

export function listRuntimeToolsets(profile: string, refresh = false) {
  return request(`/runtime/toolsets?${scopeQuery(profile, refresh)}`, toolsetsEnvelope);
}

function scopeQuery(profile: string, refresh: boolean): string {
  const params = new URLSearchParams({ profile });
  if (refresh) {
    params.set('refresh', 'true');
  }
  return params.toString();
}
