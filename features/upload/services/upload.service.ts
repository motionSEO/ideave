import { apiClient } from "@/shared/lib/apiClient";

type UploadResponse = {
  imageId: string;
  fileName: string;
  message: string;
};

export async function uploadImage(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", { method: "POST", body: formData });
  if (!response.ok) {
    throw new Error("Upload failed");
  }
  return (await response.json()) as UploadResponse;
}

export async function healthcheck() {
  return apiClient<{ status: string }>("/api/health");
}
