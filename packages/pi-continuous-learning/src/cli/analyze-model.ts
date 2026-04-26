import type { AuthStorage } from "@mariozechner/pi-coding-agent";
import { getModel, type Api, type Model } from "@mariozechner/pi-ai";
import { DEFAULT_CONFIG } from "../config.js";
import type { Config } from "../types.js";

type AnalyzerAuthStorage = Pick<AuthStorage, "getApiKey">;

export interface AnalyzerModelResolution {
  readonly apiKey: string;
  readonly model: Model<Api>;
  readonly modelId: string;
  readonly providerId: string;
}

export async function resolveAnalyzerModel(
  config: Config,
  authStorage: AnalyzerAuthStorage,
): Promise<AnalyzerModelResolution> {
  const providerId = config.provider || DEFAULT_CONFIG.provider;
  const modelId = config.model || DEFAULT_CONFIG.model;
  const model = getModel(providerId as never, modelId as never) as
    | Model<Api>
    | undefined;

  if (!model) {
    throw new Error(`Unknown analyzer model: ${providerId}/${modelId}`);
  }

  const apiKey = await authStorage.getApiKey(providerId);
  if (!apiKey) {
    throw new Error(
      `No API key configured for provider: ${providerId}. ` +
        "Set credentials via Pi auth.json, /login, or the provider's API key environment variable.",
    );
  }

  return { apiKey, model, modelId, providerId };
}
