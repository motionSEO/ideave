import { apiClient } from "@/shared/lib/apiClient";
import type { Tag } from "@/features/tagging/types";

type GenerateTagsResponse = {
  imageId: string;
  tags: Tag[];
};

export function generateTags(imageId: string) {
  return apiClient<GenerateTagsResponse>("/api/tags/generate", {
    method: "POST",
    body: JSON.stringify({ imageId }),
  });
}
