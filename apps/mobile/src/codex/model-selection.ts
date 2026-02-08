import type { ModelSummary } from "./bootstrap";

export const resolveSelectedModelId = (
  models: ModelSummary[],
  preferredModelId: string | null
): string | null => {
  if (models.length === 0) {
    return null;
  }

  if (
    preferredModelId &&
    models.some((model) => model.id === preferredModelId)
  ) {
    return preferredModelId;
  }

  return models[0]?.id ?? null;
};

