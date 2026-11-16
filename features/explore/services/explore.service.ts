import { apiClient } from "@/shared/lib/apiClient";

type SearchImagesResponse = {
  query: { tag: string | null };
  images: Array<{ id: string; title: string }>;
};

export function searchImagesByTag(tag: string) {
  return apiClient<SearchImagesResponse>(`/api/images/search?tag=${encodeURIComponent(tag)}`);
}
