import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { Config } from "../types.js";

type AnalyzerModelRegistry = Pick<
  ModelRegistry,
  "find" | "getAll" | "getApiKeyAndHeaders"
>;

export interface AnalyzerModelResolution {
  readonly apiKey: string;
  readonly model: Model<Api>;
  readonly modelId: string;
  readonly providerId: string;
  readonly headers?: Record<string, string>;
}

export async function resolveAnalyzerModel(
  config: Config,
  modelRegistry: AnalyzerModelRegistry,
): Promise<AnalyzerModelResolution> {
  const providerId = config.provider;
  const modelId = config.model;

  const providerModels = modelRegistry
    .getAll()
    .filter((candidate) => candidate.provider === providerId);
  if (providerModels.length === 0) {
    throw new Error(`Unknown analyzer provider: ${providerId}`);
  }

  const model = modelRegistry.find(providerId, modelId);

  if (!model) {
    throw new Error(`Unknown analyzer model: ${providerId}/${modelId}`);
  }

  const auth = await modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    throw new Error(
      `Could not resolve analyzer credentials for provider ${providerId}: ${auth.error}`,
    );
  }

  const apiKey = auth.apiKey;
  if (!apiKey) {
    throw new Error(
      `No API key configured for provider: ${providerId}. ` +
        "Set credentials via Pi auth.json, /login, or the provider's API key environment variable.",
    );
  }

  return {
    apiKey,
    model,
    modelId,
    providerId,
    ...(auth.headers ? { headers: auth.headers } : {}),
  };
}
