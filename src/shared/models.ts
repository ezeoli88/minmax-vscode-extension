export const DEFAULT_MODEL = "MiniMax-M3";

export const AVAILABLE_MODELS = [
  {
    id: "MiniMax-M3",
    label: "MiniMax-M3",
    description: "Latest M-series, 1M context",
    contextWindow: 1_000_000,
  },
  {
    id: "MiniMax-M2.7",
    label: "MiniMax-M2.7",
    description: "Previous gen, ~60 tps",
    contextWindow: 204_800,
  },
  {
    id: "MiniMax-M2.7-highspeed",
    label: "MiniMax-M2.7-highspeed",
    description: "Previous gen fast, ~100 tps",
    contextWindow: 204_800,
  },
  {
    id: "MiniMax-M2.5",
    label: "MiniMax-M2.5",
    description: "Legacy, ~60 tps",
    contextWindow: 204_800,
  },
  {
    id: "MiniMax-M2.5-highspeed",
    label: "MiniMax-M2.5-highspeed",
    description: "Legacy fast, ~100 tps",
    contextWindow: 204_800,
  },
  {
    id: "MiniMax-M2.1",
    label: "MiniMax-M2.1",
    description: "Legacy, ~60 tps",
    contextWindow: 204_800,
  },
  {
    id: "MiniMax-M2.1-highspeed",
    label: "MiniMax-M2.1-highspeed",
    description: "Legacy fast, ~100 tps",
    contextWindow: 204_800,
  },
] as const;

export const MODEL_IDS = AVAILABLE_MODELS.map((model) => model.id);

export function getModelContextWindow(modelId: string): number {
  return AVAILABLE_MODELS.find((model) => model.id === modelId)?.contextWindow ?? 204_800;
}
