"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { CloseButton } from "@/components/reference-prototype/CloseIcon";

type ProjectRegisterModalProps = {
  open: boolean;
  /** panel일 때 false면 닫히는 중: 오른쪽으로 밀려 들어간 뒤 open이 꺼진다. */
  shown?: boolean;
  initialProject?: { name: string; goal: string } | null;
  onClose: () => void;
  onStart: (projectName: string, goal: string) => void;
  onUpdate?: (projectName: string, goal: string) => void;
  onReset?: () => void;
  /** "panel": 화면 오른쪽에서 열리는 인덱스 패널(캔버스처럼). 기본은 가운데 모달. */
  variant?: "modal" | "panel";
};

const MODAL_CLASS =
  "relative z-[1] flex h-[370px] w-[800px] max-w-[calc(100vw-2rem)] flex-col rounded-[5px] bg-white p-10 shadow-xl";

// 오른쪽 인덱스 패널: 화면 맨 위부터 깔아 상단 고정 영역(z-50) 아래 틈까지 흰 면으로 채운다.
const PANEL_CLASS =
  "fixed bottom-0 right-0 top-0 z-[47] flex w-[400px] max-w-[calc(100vw-3rem)] flex-col bg-white px-8 pb-8 pt-[12.5rem] shadow-[-12px_0_32px_rgba(0,0,0,0.08)] transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] starting:translate-x-full";

const FIELD_LABEL_CLASS =
  "font-[family-name:var(--font-pretendard)] text-[14px] font-medium leading-normal text-[#222222]";

const INPUT_EDITABLE_CLASS =
  "flex h-8 w-full items-center rounded-[5px] border border-solid border-[var(--silver,#E5E5E5)] bg-white px-3 font-[family-name:var(--font-pretendard)] text-[14px] font-medium text-[#222222] outline-none placeholder:text-[var(--hint-text-border,#848484)]";

const INPUT_FILLED_CLASS =
  "flex h-8 w-full items-center rounded-[5px] border border-solid border-[var(--silver,#E5E5E5)] bg-[var(--grey-H0,#F0F0F0)] px-3 font-[family-name:var(--font-pretendard)] text-[14px] font-medium text-[var(--hint-text-border,#848484)] outline-none placeholder:text-[var(--hint-text-border,#848484)]";

const ACTION_BUTTON_BASE =
  "flex h-8 shrink-0 items-center justify-center gap-2 rounded-[5px] border-0 px-4 font-[family-name:var(--font-pretendard)] text-[14px] font-medium leading-none transition-colors";

const PRIMARY_BUTTON_CLASS = `${ACTION_BUTTON_BASE} bg-[#F5F53D] text-[#222222] hover:bg-[color-mix(in_srgb,#FFFFFF_20%,#F5F53D)]`;

const SECONDARY_BUTTON_CLASS = `${ACTION_BUTTON_BASE} bg-[var(--grey-H0,#F0F0F0)] text-[#222222] hover:bg-[color-mix(in_srgb,#000000_8%,#F0F0F0)]`;

const EDIT_BUTTON_DISABLED_CLASS = `${ACTION_BUTTON_BASE} cursor-not-allowed bg-[var(--grey-H0,#F0F0F0)] text-[var(--hint-text-border,#848484)]`;

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M9.5 1.5L12.5 4.5L4.75 12.25H1.75V9.25L9.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
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

export function ProjectRegisterModal({
  open,
  initialProject = null,
  onClose,
  onStart,
  onUpdate,
  onReset,
  variant = "modal",
  shown = true,
}: ProjectRegisterModalProps) {
  const isPanel = variant === "panel";
  const titleId = useId();
  const [projectName, setProjectName] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const hasExistingProject = Boolean(initialProject);

  const isReadOnlyView = hasExistingProject && !isEditingFields;
  const inputsEditable = !hasExistingProject || isEditingFields;
  const editButtonActive = hasExistingProject && !isEditingFields;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (confirmResetOpen) {
        setConfirmResetOpen(false);
        return;
      }
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, confirmResetOpen]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setProjectName(initialProject?.name ?? "");
    setGoal(initialProject?.goal ?? "");
    setError("");
    // 오른쪽 패널은 열자마자 바로 고칠 수 있게 수정 상태로 연다.
    setIsEditingFields(isPanel);
    setConfirmResetOpen(false);
  }, [open, initialProject, isPanel]);

  if (!open) {
    return null;
  }

  const inputClass = isReadOnlyView ? INPUT_FILLED_CLASS : INPUT_EDITABLE_CLASS;

  const validate = () => {
    const name = projectName.trim();
    const goalLine = goal.trim();

    if (!name || !goalLine) {
      setError("프로젝트 주제와 프로젝트 스타일 및 무드를 모두 입력해 주세요.");
      return null;
    }

    return { name, goalLine };
  };

  const handleEnterEditMode = () => {
    if (!editButtonActive) {
      return;
    }
    setIsEditingFields(true);
    setError("");
  };

  const resetProjectForm = () => {
    onReset?.();
    setProjectName("");
    setGoal("");
    setError("");
    setIsEditingFields(isPanel);
    setConfirmResetOpen(false);
  };

  const requestResetConfirm = () => {
    setConfirmResetOpen(true);
  };

  const handleStart = (event: FormEvent) => {
    event.preventDefault();

    if (hasExistingProject && !isEditingFields) {
      onClose();
      return;
    }

    const values = validate();
    if (!values) {
      return;
    }

    if (hasExistingProject) {
      (onUpdate ?? onStart)(values.name, values.goalLine);
    } else {
      onStart(values.name, values.goalLine);
      setProjectName("");
      setGoal("");
    }
    setError("");
  };

  return (
    <div
      className={isPanel ? "contents" : "fixed inset-0 z-[100] flex items-center justify-center p-4"}
      role="presentation"
      onClick={isPanel ? undefined : onClose}
    >
      {isPanel ? null : <div className="absolute inset-0 bg-black/50" aria-hidden />}
      <div
        role="dialog"
        aria-modal={isPanel ? undefined : "true"}
        aria-labelledby={titleId}
        className={isPanel ? `${PANEL_CLASS} ${shown ? "translate-x-0" : "translate-x-full"}` : MODAL_CLASS}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-4">
            <h2
              id={titleId}
              className="min-w-0 text-left font-[family-name:var(--font-pretendard)] text-[24px] font-medium leading-normal text-[#222222]"
            >
              프로젝트 등록
            </h2>
            <CloseButton onClick={onClose} />
          </div>
          <p className="font-[family-name:var(--font-pretendard)] text-[14px] font-medium leading-normal text-[#848484]">
            수집할 레퍼런스의 주제와 스타일 및 무드 설정
          </p>
        </div>

        <form className="mt-6 flex min-h-0 flex-1 flex-col" onSubmit={handleStart}>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className={FIELD_LABEL_CLASS}>프로젝트 주제</span>
              <input
                type="text"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                readOnly={isReadOnlyView}
                aria-readonly={isReadOnlyView}
                className={inputClass}
                placeholder="예: 홍보 포스터, 전시 리플렛"
                maxLength={60}
                autoFocus={inputsEditable}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className={FIELD_LABEL_CLASS}>프로젝트 스타일 및 무드</span>
              <input
                type="text"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                readOnly={isReadOnlyView}
                aria-readonly={isReadOnlyView}
                className={inputClass}
                placeholder="예: 레트로, 따뜻한, 미니멀"
                maxLength={120}
              />
            </label>
          </div>

          {error ? (
            <p className="mt-3 font-[family-name:var(--font-pretendard)] text-[12px] font-medium text-red-600">
              {error}
            </p>
          ) : null}

          <div className={`flex justify-end gap-2 ${isPanel ? "mt-6 flex-wrap" : "mt-auto pt-4"}`}>
            <button type="button" onClick={requestResetConfirm} className={SECONDARY_BUTTON_CLASS}>
              초기화
            </button>
            {/* 오른쪽 패널은 늘 수정 상태라 수정 버튼이 없다. */}
            {isPanel ? null : <button
              type="button"
              onClick={handleEnterEditMode}
              disabled={!editButtonActive}
              className={editButtonActive ? PRIMARY_BUTTON_CLASS : EDIT_BUTTON_DISABLED_CLASS}
              aria-disabled={!editButtonActive}
            >
              프로젝트 수정
              <EditIcon />
            </button>}
            <button type="submit" className={PRIMARY_BUTTON_CLASS}>
              프로젝트 시작
              <ArrowRightIcon />
            </button>
          </div>
        </form>
      </div>

      {confirmResetOpen ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="presentation"
          onClick={(event) => {
            event.stopPropagation();
            setConfirmResetOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/50" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${titleId}-reset`}
            className="relative z-[1] w-[520px] max-w-[calc(100vw-2rem)] rounded-[5px] bg-white p-10 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p
              id={`${titleId}-reset`}
              className="whitespace-pre-line font-[family-name:var(--font-pretendard)] text-[16px] font-medium leading-normal text-[#222222]"
            >
              {"프로젝트를 초기화하시겠습니까?\n저장된 프로젝트 정보와 캔버스의 모든 내용이 삭제됩니다."}
            </p>
            <div className="mt-8 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className={SECONDARY_BUTTON_CLASS}
              >
                취소
              </button>
              <button type="button" onClick={resetProjectForm} className={PRIMARY_BUTTON_CLASS}>
                초기화
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
