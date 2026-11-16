/**
 * 레퍼런스를 캔버스로 끌 때 마우스를 따라다니는 미리보기.
 * 브라우저 기본 드래그 이미지는 3D 뒤집기 카드의 뒷면 글자까지 비쳐 찍히고 스스로 흐리게 만들어 제어가 안 되므로,
 * 기본 이미지는 투명 1px로 숨기고 잡은 사진의 복제본(살짝 투명 + 그레인)을 직접 띄운다.
 */

const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const PREVIEW_OPACITY = 0.85;
const PREVIEW_TILT_DEG = -2;
/** 미세한 필름 그레인(SVG 노이즈) */
const GRAIN_TEXTURE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

let transparentImage: HTMLImageElement | null = null;

function getTransparentImage(): HTMLImageElement {
  if (!transparentImage) {
    transparentImage = new Image();
    transparentImage.src = TRANSPARENT_PIXEL;
  }
  return transparentImage;
}

/** 첫 드래그에서도 투명 이미지가 준비돼 있도록 미리 만들어 둔다. */
if (typeof window !== "undefined") {
  getTransparentImage();
}

/** dragstart 이벤트(React·DOM 공통으로 쓰는 필드만) */
type DragStartLike = { dataTransfer: DataTransfer | null; clientX: number; clientY: number };

export function startImageDragPreview(event: DragStartLike, image: HTMLImageElement): void {
  const dataTransfer = event.dataTransfer;
  const src = image.currentSrc || image.src;
  if (!dataTransfer || !src) {
    return;
  }

  const rect = image.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  dataTransfer.setDragImage(getTransparentImage(), 0, 0);

  const preview = document.createElement("div");
  preview.setAttribute("aria-hidden", "true");
  Object.assign(preview.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    borderRadius: "8px",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "9999",
    opacity: String(PREVIEW_OPACITY),
    backgroundImage: `url("${src}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    boxShadow: "0 12px 28px rgba(0, 0, 0, 0.28)",
    transformOrigin: `${offsetX}px ${offsetY}px`,
    willChange: "transform",
  } satisfies Partial<CSSStyleDeclaration>);

  const grain = document.createElement("div");
  Object.assign(grain.style, {
    position: "absolute",
    inset: "0",
    backgroundImage: GRAIN_TEXTURE,
    mixBlendMode: "overlay",
    opacity: "0.6",
  } satisfies Partial<CSSStyleDeclaration>);
  preview.appendChild(grain);

  const place = (clientX: number, clientY: number) => {
    preview.style.transform = `translate(${clientX - offsetX}px, ${clientY - offsetY}px) rotate(${PREVIEW_TILT_DEG}deg)`;
  };
  place(event.clientX, event.clientY);
  document.body.appendChild(preview);

  const onDragOver = (moveEvent: DragEvent) => {
    // 드래그가 끝나는 순간 일부 브라우저는 (0, 0)을 보낸다.
    if (moveEvent.clientX === 0 && moveEvent.clientY === 0) {
      return;
    }
    place(moveEvent.clientX, moveEvent.clientY);
  };
  const cleanup = () => {
    document.removeEventListener("dragover", onDragOver, true);
    window.removeEventListener("dragend", cleanup, true);
    window.removeEventListener("drop", cleanup, true);
    preview.remove();
  };
  document.addEventListener("dragover", onDragOver, true);
  window.addEventListener("dragend", cleanup, true);
  window.addEventListener("drop", cleanup, true);
}
