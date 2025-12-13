/**
 * Models routes - HTTP API for model providers and availability
 */

import { Router, type Request, type Response } from "express";

interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
}

interface ProviderStatus {
  available: boolean;
  hasApiKey: boolean;
  error?: string;
}

export function createModelsRoutes(): Router {
  const router = Router();

  // Get available models
  router.get("/available", async (_req: Request, res: Response) => {
    try {
      const models: ModelDefinition[] = [
        {
          id: "claude-opus-4-5-20251101",
          name: "Claude Opus 4.5",
          provider: "anthropic",
          contextWindow: 200000,
          maxOutputTokens: 16384,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: "claude-sonnet-4-20250514",
          name: "Claude Sonnet 4",
          provider: "anthropic",
          contextWindow: 200000,
          maxOutputTokens: 16384,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: "claude-3-5-sonnet-20241022",
          name: "Claude 3.5 Sonnet",
          provider: "anthropic",
          contextWindow: 200000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: "claude-3-5-haiku-20241022",
          name: "Claude 3.5 Haiku",
          provider: "anthropic",
          contextWindow: 200000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: "gpt-4o",
          name: "GPT-4o",
          provider: "openai",
          contextWindow: 128000,
          maxOutputTokens: 16384,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: "gpt-4o-mini",
          name: "GPT-4o Mini",
          provider: "openai",
          contextWindow: 128000,
          maxOutputTokens: 16384,
          supportsVision: true,
          supportsTools: true,
        },
        {
          id: "o1",
          name: "o1",
          provider: "openai",
          contextWindow: 200000,
          maxOutputTokens: 100000,
          supportsVision: true,
          supportsTools: false,
        },
        {
          id: "gpt-5.2",
          name: "GPT-5.2 (Codex)",
          provider: "openai",
          contextWindow: 256000,
          maxOutputTokens: 32768,
          supportsVision: true,
          supportsTools: true,
        },
      ];

      res.json({ success: true, models });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  // Check provider status
  router.get("/providers", async (_req: Request, res: Response) => {
    try {
      const providers: Record<string, ProviderStatus> = {
        anthropic: {
          available: !!process.env.ANTHROPIC_API_KEY,
          hasApiKey: !!process.env.ANTHROPIC_API_KEY,
        },
        openai: {
          available: !!process.env.OPENAI_API_KEY,
          hasApiKey: !!process.env.OPENAI_API_KEY,
        },
        google: {
          available: !!process.env.GOOGLE_API_KEY,
          hasApiKey: !!process.env.GOOGLE_API_KEY,
        },
      };

      res.json({ success: true, providers });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
