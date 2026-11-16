import { apiClient } from "@/shared/lib/apiClient";

type BoardKeywordsResponse = {
  keywords: string[];
};

export function extractBoardKeywords(texts: string[]) {
  return apiClient<BoardKeywordsResponse>("/api/board/keywords", {
    method: "POST",
    body: JSON.stringify({ texts }),
  });
}
