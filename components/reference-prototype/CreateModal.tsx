"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  CloseButton,
  DEFAULT_CLOSE_BUTTON_CLASS,
} from "@/components/reference-prototype/CloseIcon";

const MODAL_CLASS =
  "relative z-[1] flex w-[800px] max-w-[calc(100vw-2rem)] flex-col rounded-[5px] bg-white p-10 shadow-xl";

const DROPZONE_BASE_CLASS =
  "flex h-[406px] w-[720px] max-w-full shrink-0 flex-col rounded-[5px] border bg-[var(--grey-H0,#F0F0F0)] px-6 py-5 transition-colors";

const DROPZONE_ERROR_COLOR = "#FF4D4D";

const DROPZONE_TEXT_CLASS =
  "text-center font-[family-name:var(--font-pretendard)] text-[14px] font-medium leading-normal";

const DROPZONE_HINT_CLASS =
  "text-center font-[family-name:var(--font-pretendard)] text-[12px] font-medium leading-normal";

const LINK_LABEL_CLASS =
  "font-[family-name:var(--font-pretendard)] text-[14px] font-medium leading-normal text-black";

const URL_INPUT_WRAPPER_CLASS =
  "flex w-full items-center gap-[10px] self-stretch rounded-[5px] border border-[var(--silver,#E5E5E5)] bg-[var(--grey-H0,#F0F0F0)] p-[10px]";

const URL_INPUT_CLASS =
  "min-w-0 flex-1 border-0 bg-transparent font-[family-name:var(--font-pretendard)] text-[14px] font-medium leading-normal text-[#222222] outline-none placeholder:font-[family-name:var(--font-pretendard)] placeholder:text-[14px] placeholder:font-medium placeholder:leading-normal placeholder:text-[var(--hint-text-border,#848484)]";

const CONTENT_STACK_CLASS =
  "flex w-[720px] max-w-full flex-col items-start gap-6 self-stretch";

const LINK_SECTION_CLASS = "flex flex-col items-start gap-2 self-stretch";

const MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 2;

type CreateModalProps = {
  open: boolean;
  onClose: () => void;
  onUploaded?: () => void;
};

function DropzoneErrorIcon() {
  return (
    <span
      className="font-[family-name:var(--font-pretendard)] text-[32px] font-bold leading-none"
      style={{ color: DROPZONE_ERROR_COLOR }}
      aria-hidden
    >
      !
    </span>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 7H11M11 7L7.5 3.5M11 7L7.5 10.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

async function uploadFile(file: File): Promise<{ ok: boolean; error?: string }> {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const result = (await response.json()) as { error?: string; details?: string };

    if (!response.ok) {
      const message = result.details
        ? `${result.error ?? "업로드 실패"} ${result.details}`
        : (result.error ?? "업로드에 실패했습니다.");
      return { ok: false, error: message };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
    };
  }
}

async function fileFromImageUrl(url: string): Promise<File | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) {
      return null;
    }
    const extension = blob.type.split("/")[1] ?? "png";
    return new File([blob], `url-upload.${extension}`, { type: blob.type });
  } catch {
    return null;
  }
}

function validateImageFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "이미지 파일만 업로드할 수 있습니다.";
  }
  if (file.size > MAX_BYTES) {
    return "Ideave는 10MB 이하의 이미지만 업로드할 수 있습니다.";
  }
  return null;
}

export function CreateModal({ open, onClose, onUploaded }: CreateModalProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [dropzoneError, setDropzoneError] = useState(false);

  const resetForm = useCallback(() => {
    setPendingFiles([]);
    setLinkUrl("");
    setIsDragging(false);
    setError("");
    setDropzoneError(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  const handleClose = useCallback(() => {
    if (isSubmitting) {
      return;
    }
    resetForm();
    onClose();
  }, [isSubmitting, onClose, resetForm]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        handleClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isSubmitting, handleClose]);

  useEffect(() => {
    if (open) {
      setError("");
      setDropzoneError(false);
    }
  }, [open]);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const next: File[] = [];
    for (const file of Array.from(fileList)) {
      const validationError = validateImageFile(file);
      if (validationError) {
        setDropzoneError(true);
        setError("");
        continue;
      }
      next.push(file);
    }

    if (next.length > 0) {
      setPendingFiles((prev) => [...prev, ...next]);
      setDropzoneError(false);
      if (next.length === Array.from(fileList).length) {
        setError("");
      }
    }
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    const filesToUpload = [...pendingFiles];
    const trimmedUrl = linkUrl.trim();

    if (filesToUpload.length === 0 && trimmedUrl) {
      const urlFile = await fileFromImageUrl(trimmedUrl);
      if (!urlFile) {
        setDropzoneError(false);
        setError("URL에서 이미지를 불러오지 못했습니다. 파일을 직접 업로드해 주세요.");
        return;
      }
      const validationError = validateImageFile(urlFile);
      if (validationError) {
        setDropzoneError(true);
        setError("");
        return;
      }
      filesToUpload.push(urlFile);
    }

    if (filesToUpload.length === 0) {
      setDropzoneError(true);
      setError("");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setDropzoneError(false);

    const failures: string[] = [];
    await runWithConcurrency(filesToUpload, UPLOAD_CONCURRENCY, async (file) => {
      const result = await uploadFile(file);
      if (!result.ok && result.error) {
        failures.push(result.error);
      }
    });

    setIsSubmitting(false);

    if (failures.length === filesToUpload.length) {
      setDropzoneError(false);
      setError(failures[0] ?? "업로드에 실패했습니다.");
      return;
    }

    onUploaded?.();
    resetForm();
    onClose();
  };

  if (!open) {
    return null;
  }

  const dropzoneLabel =
    pendingFiles.length > 0
      ? `${pendingFiles.length}개 파일 선택됨`
      : "파일을 선택하거나 여기로 끌어다 놓으세요.";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={MODAL_CLASS}
        onClick={(event) => event.stopPropagation()}
      >
        <p id={titleId} className="sr-only">
          레퍼런스 만들기
        </p>

        <form
          className="flex w-full flex-col gap-9 self-stretch"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className={CONTENT_STACK_CLASS}>
            <CloseButton
              onClick={handleClose}
              disabled={isSubmitting}
              className={`${DEFAULT_CLOSE_BUTTON_CLASS} self-end`}
            />

            <button
              type="button"
              onClick={() => {
                setDropzoneError(false);
                inputRef.current?.click();
              }}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              disabled={isSubmitting}
              aria-invalid={dropzoneError}
              className={`${DROPZONE_BASE_CLASS} ${
                dropzoneError
                  ? "border-[#FF4D4D]"
                  : "border-[var(--silver,#E5E5E5)]"
              } ${isDragging && !dropzoneError ? "ring-2 ring-[#F5F53D] ring-offset-2" : ""} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {dropzoneError ? (
                <>
                  <span className="flex flex-1 flex-col items-center justify-center gap-3">
                    <DropzoneErrorIcon />
                    <span className={`${DROPZONE_TEXT_CLASS} text-[#FF4D4D]`}>
                      파일을 선택하거나 여기로 끌어다 놓으세요.
                    </span>
                  </span>
                  <span className={`${DROPZONE_HINT_CLASS} text-[#FF4D4D]`}>
                    Ideave는 10MB 이하의 이미지만 업로드할 수 있습니다.
                  </span>
                </>
              ) : (
                <>
                  <span className="flex flex-1 flex-col items-center justify-center gap-3">
                    <Image
                      src="/create-upload-arrow.svg"
                      alt=""
                      width={24}
                      height={24}
                      className="h-6 w-6 shrink-0"
                    />
                    <span className={`${DROPZONE_TEXT_CLASS} text-[#222222]`}>{dropzoneLabel}</span>
                  </span>
                  <span className={`${DROPZONE_HINT_CLASS} text-[#848484]`}>
                    Ideave는 10MB 이하의 이미지만 업로드할 수 있습니다.
                  </span>
                </>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => addFiles(event.target.files)}
            />

            <div className={LINK_SECTION_CLASS}>
              <span className={LINK_LABEL_CLASS}>링크</span>
              <div className={URL_INPUT_WRAPPER_CLASS}>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(event) => {
                    setLinkUrl(event.target.value);
                    if (event.target.value.trim()) {
                      setDropzoneError(false);
                    }
                  }}
                  className={URL_INPUT_CLASS}
                  placeholder="URL주소"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 self-stretch">
            {error ? (
              <p className="font-[family-name:var(--font-pretendard)] text-[12px] font-medium text-red-600">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end self-stretch">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-8 shrink-0 items-center justify-center gap-2 rounded-[5px] border-0 bg-[#F5F53D] px-4 font-[family-name:var(--font-pretendard)] text-[14px] font-medium leading-none text-[#222222] transition-colors hover:bg-[color-mix(in_srgb,#FFFFFF_20%,#F5F53D)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "업로드 중…" : "업로드"}
                {!isSubmitting ? <ArrowRightIcon /> : null}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
