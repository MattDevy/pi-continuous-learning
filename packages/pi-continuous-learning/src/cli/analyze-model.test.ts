import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthStorage,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../config.js";
import type { Config } from "../types.js";
import { resolveAnalyzerModel } from "./analyze-model.js";

const temporaryDirectories: string[] = [];

function config(overrides: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, ...overrides };
}

function registry(apiKey: string | undefined) {
  const models = ModelRegistry.inMemory(AuthStorage.inMemory()).getAll();
  return {
    find: vi.fn((provider: string, modelId: string) =>
      models.find(
        (model) => model.provider === provider && model.id === modelId,
      ),
    ),
    getAll: vi.fn(() => models),
    getApiKeyAndHeaders: vi.fn().mockResolvedValue({ ok: true, apiKey }),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("resolveAnalyzerModel", () => {
  it("uses the configured provider and model", async () => {
    const modelRegistry = registry("codex-token");

    const result = await resolveAnalyzerModel(
      config({ provider: "openai-codex", model: "gpt-5.4-mini" }),
      modelRegistry,
    );

    expect(result.providerId).toBe("openai-codex");
    expect(result.modelId).toBe("gpt-5.4-mini");
    expect(result.model.provider).toBe("openai-codex");
    expect(result.model.id).toBe("gpt-5.4-mini");
    expect(result.apiKey).toBe("codex-token");
    expect(modelRegistry.getApiKeyAndHeaders).toHaveBeenCalledWith(result.model);
  });

  it("keeps Anthropic Haiku as the backwards-compatible default", async () => {
    const modelRegistry = registry("anthropic-token");

    const result = await resolveAnalyzerModel(config(), modelRegistry);

    expect(result.providerId).toBe("anthropic");
    expect(result.modelId).toBe("claude-haiku-4-5");
    expect(result.model.provider).toBe("anthropic");
  });

  it("loads custom provider models, credentials, and headers from models.json", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pi-cl-model-registry-"));
    temporaryDirectories.push(directory);
    const modelsPath = join(directory, "models.json");
    writeFileSync(
      modelsPath,
      JSON.stringify({
        providers: {
          "my-custom-provider": {
            baseUrl: "https://proxy.example.com/anthropic",
            api: "anthropic-messages",
            apiKey: "custom-token",
            headers: { "X-Proxy-Tenant": "continuous-learning" },
            models: [
              {
                id: "custom-model",
                name: "Custom Model",
                reasoning: true,
                input: ["text"],
                contextWindow: 100_000,
                maxTokens: 8_192,
                cost: {
                  input: 1,
                  output: 2,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
              },
            ],
          },
        },
      }),
      "utf8",
    );
    const modelRegistry = ModelRegistry.create(
      AuthStorage.inMemory(),
      modelsPath,
    );

    const result = await resolveAnalyzerModel(
      config({ provider: "my-custom-provider", model: "custom-model" }),
      modelRegistry,
    );

    expect(result.model.provider).toBe("my-custom-provider");
    expect(result.model.id).toBe("custom-model");
    expect(result.model.baseUrl).toBe("https://proxy.example.com/anthropic");
    expect(result.apiKey).toBe("custom-token");
    expect(result.headers).toEqual({
      "X-Proxy-Tenant": "continuous-learning",
    });
  });

  it("throws a provider-specific error when credentials are missing", async () => {
    await expect(
      resolveAnalyzerModel(
        config({ provider: "openai-codex", model: "gpt-5.4-mini" }),
        registry(undefined),
      ),
    ).rejects.toThrow("No API key configured for provider: openai-codex");
  });

  it("throws a provider/model-specific error for unknown model ids", async () => {
    const modelRegistry = registry("token");

    await expect(
      resolveAnalyzerModel(
        config({ provider: "openai-codex", model: "not-a-real-model" }),
        modelRegistry,
      ),
    ).rejects.toThrow("Unknown analyzer model: openai-codex/not-a-real-model");
    expect(modelRegistry.getApiKeyAndHeaders).not.toHaveBeenCalled();
  });

  it("throws a provider-specific error for unknown provider strings", async () => {
    const modelRegistry = registry("token");

    await expect(
      resolveAnalyzerModel(
        config({ provider: "not-a-real-provider", model: "claude-haiku-4-5" }),
        modelRegistry,
      ),
    ).rejects.toThrow("Unknown analyzer provider: not-a-real-provider");
    expect(modelRegistry.getApiKeyAndHeaders).not.toHaveBeenCalled();
  });
});
