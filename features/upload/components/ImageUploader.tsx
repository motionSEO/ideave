"use client";

import { useEffect, useRef, useState } from "react";

const MAX_FILES = 100;
const UPLOAD_CONCURRENCY = 2;

type SavedImage = {
  id: string;
  imageUrl: string;
  tags: string[];
  createdAt: string | null;
};

type UploadStatus = "pending" | "processing" | "complete" | "failed";

type UploadQueueItem = {
  id: string;
  file: File;
  status: UploadStatus;
  error?: string;
};

type UploadApiResult = {
  error?: string;
  details?: string;
  warning?: string;
  geminiUnavailable?: boolean;
  image?: SavedImage;
  analysis?: {
    colorTone: string;
    mood: string;
    style: string;
  };
};

const STATUS_LABEL: Record<UploadStatus, string> = {
  pending: "대기",
  processing: "처리중",
  complete: "완료",
  failed: "실패",
};

function statusClassName(status: UploadStatus): string {
  switch (status) {
    case "processing":
      return "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200";
    case "complete":
      return "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200";
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  let nextIndex = 0;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const current = items[nextIndex];
      nextIndex += 1;
      await worker(current);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  );
}

export function ImageUploader() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string>("");
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [savedImages, setSavedImages] = useState<SavedImage[]>([]);
  const [quotaNotice, setQuotaNotice] = useState<string>("");

  useEffect(() => {
    const fetchSaved = async () => {
      try {
        const response = await fetch("/api/images/search");
        const result = (await response.json()) as {
          images?: SavedImage[];
        };
        if (response.ok) {
          setSavedImages(result.images ?? []);
        }
      } catch {
        // Keep UI usable even when loading history fails.
      }
    };

    void fetchSaved();
  }, []);

  const updateQueueItem = (id: string, patch: Partial<UploadQueueItem>) => {
    setUploadQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const uploadSingle = async (item: UploadQueueItem) => {
    updateQueueItem(item.id, { status: "processing", error: undefined });

    const formData = new FormData();
    formData.append("file", item.file);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as UploadApiResult;

      if (!response.ok) {
        const message = result.details
          ? `${result.error ?? "업로드 실패"} ${result.details}`
          : (result.error ?? "태그 생성 중 오류가 발생했습니다.");
        updateQueueItem(item.id, { status: "failed", error: message });
        return;
      }

      updateQueueItem(item.id, { status: "complete", error: undefined });

      if (result.geminiUnavailable && result.warning) {
        setQuotaNotice(result.warning);
      }

      if (result.image) {
        setSavedImages((prev) => [result.image!, ...prev]);
      }
    } catch (err) {
      updateQueueItem(item.id, {
        status: "failed",
        error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
      });
    }
  };

  const onSelect = async (fileList?: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const files = Array.from(fileList);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    if (imageFiles.length > MAX_FILES) {
      setError(`한 번에 최대 ${MAX_FILES}장까지 선택할 수 있습니다.`);
      return;
    }

    if (imageFiles.length < files.length) {
      setError("이미지가 아닌 파일은 제외되었습니다.");
    } else {
      setError("");
    }

    setQuotaNotice("");

    const queueItems: UploadQueueItem[] = imageFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
    }));

    setUploadQueue((prev) => [...queueItems, ...prev]);
    setIsUploading(true);

    try {
      await runWithConcurrency(queueItems, UPLOAD_CONCURRENCY, uploadSingle);
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const completedCount = uploadQueue.filter((item) => item.status === "complete").length;
  const failedCount = uploadQueue.filter((item) => item.status === "failed").length;
  const processingCount = uploadQueue.filter((item) => item.status === "processing").length;

  return (
    <section className="space-y-3 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
      <h2 className="text-lg font-semibold">Upload</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        이미지를 한 번에 최대 {MAX_FILES}장까지 선택해 업로드할 수 있습니다. Gemini가 색감/분위기/스타일과
        오브젝트 태그를 자동 생성하며, 동일한 이미지 내용은 중복 등록되지 않습니다.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black"
        >
          {isUploading ? "업로드 중..." : "이미지 선택"}
        </button>
        <span className="text-sm text-zinc-500">
          {isUploading
            ? `처리 중 ${processingCount} · 완료 ${completedCount} · 실패 ${failedCount}`
            : "파일을 선택하지 않았습니다"}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void onSelect(event.target.files)}
      />

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {quotaNotice ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          {quotaNotice}
        </p>
      ) : null}

      {uploadQueue.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">업로드 진행</h3>
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
            {uploadQueue.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-sm odd:bg-zinc-50 dark:odd:bg-zinc-900/40"
              >
                <span className="min-w-0 flex-1 truncate" title={item.file.name}>
                  {item.file.name}
                </span>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClassName(item.status)}`}
                  >
                    {STATUS_LABEL[item.status]}
                  </span>
                  {item.error ? (
                    <span className="max-w-[14rem] text-right text-xs text-red-600 dark:text-red-400">
                      {item.error}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2 pt-2">
        <h3 className="text-sm font-semibold">저장된 이미지</h3>
        {savedImages.length === 0 ? (
          <p className="text-sm text-zinc-500">아직 저장된 이미지가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {savedImages.map((image) => (
              <li key={image.id} className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.imageUrl}
                  alt="uploaded reference"
                  className="h-32 w-full rounded-md object-cover"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {image.tags.map((tag) => (
                    <span
                      key={`${image.id}-${tag}`}
                      className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-600"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
