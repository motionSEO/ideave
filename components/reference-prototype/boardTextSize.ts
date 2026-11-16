export const BOARD_TEXT_FONT_SIZE = 18;
export const BOARD_TEXT_PAD_X = 16;
export const BOARD_TEXT_PAD_Y = 16;
export const BOARD_TEXT_MIN_WIDTH = 120;
export const BOARD_TEXT_MIN_HEIGHT = 40;
export const BOARD_TEXT_MAX_WIDTH = 360;

export function measureBoardTextBox(
  text: string,
  fontSize = BOARD_TEXT_FONT_SIZE,
): { width: number; height: number } {
  const value = text.length > 0 ? text : " ";

  if (typeof document === "undefined") {
    const estimated = Math.round(value.length * fontSize * 0.95);
    const width = Math.min(
      BOARD_TEXT_MAX_WIDTH,
      Math.max(BOARD_TEXT_MIN_WIDTH, estimated + BOARD_TEXT_PAD_X),
    );
    const lines = Math.max(1, Math.ceil(estimated / (BOARD_TEXT_MAX_WIDTH - BOARD_TEXT_PAD_X)));
    return {
      width,
      height: Math.max(BOARD_TEXT_MIN_HEIGHT, Math.round(fontSize * 1.5 * lines) + BOARD_TEXT_PAD_Y),
    };
  }

  const el = document.createElement("div");
  el.style.position = "absolute";
  el.style.left = "-9999px";
  el.style.top = "0";
  el.style.visibility = "hidden";
  el.style.pointerEvents = "none";
  el.style.fontFamily = "var(--font-pretendard), sans-serif";
  el.style.fontSize = `${fontSize}px`;
  el.style.fontWeight = "500";
  el.style.lineHeight = "1.5";
  el.style.whiteSpace = "nowrap";
  el.style.wordBreak = "keep-all";
  el.style.overflowWrap = "normal";
  el.style.width = "auto";
  el.style.maxWidth = "none";
  el.style.padding = "0";
  el.style.margin = "0";
  el.textContent = value;
  document.body.appendChild(el);

  let contentWidth = Math.ceil(el.offsetWidth);
  const maxContentWidth = BOARD_TEXT_MAX_WIDTH - BOARD_TEXT_PAD_X;
  if (contentWidth > maxContentWidth) {
    el.style.whiteSpace = "pre-wrap";
    el.style.overflowWrap = "break-word";
    el.style.wordBreak = "keep-all";
    el.style.width = `${maxContentWidth}px`;
    el.style.maxWidth = `${maxContentWidth}px`;
    contentWidth = maxContentWidth;
  }

  const contentHeight = Math.ceil(el.offsetHeight);
  el.remove();

  return {
    width: Math.max(BOARD_TEXT_MIN_WIDTH, contentWidth + BOARD_TEXT_PAD_X),
    height: Math.max(BOARD_TEXT_MIN_HEIGHT, contentHeight + BOARD_TEXT_PAD_Y),
  };
}
