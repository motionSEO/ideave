const IDEAVE_POINTER_CURSOR_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 29 29' fill='none'>" +
  "<path d='M26.8334 13.5L1.50004 1.5L13.5 26.8333L16.1667 16.1667L26.8334 13.5Z' " +
  "fill='%231E1E1E' stroke='%231E1E1E' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/>" +
  "</svg>";

const IDEAVE_POINTER_CURSOR_DATA_URI = `data:image/svg+xml,${IDEAVE_POINTER_CURSOR_SVG}`;

export const IDEAVE_POINTER_CURSOR_HOTSPOT = "2 2";

export const IDEAVE_DEFAULT_CURSOR =
  `url("${IDEAVE_POINTER_CURSOR_DATA_URI}") ${IDEAVE_POINTER_CURSOR_HOTSPOT}, auto`;

export const IDEAVE_POINTER_CURSOR =
  `url("${IDEAVE_POINTER_CURSOR_DATA_URI}") ${IDEAVE_POINTER_CURSOR_HOTSPOT}, pointer`;

/** layout `<style>` injection — Tailwind cursor utilities보다 우선 적용 */
export const IDEAVE_CURSOR_STYLES = `
  html,
  body,
  button,
  a,
  label,
  summary,
  [role="button"],
  .cursor-pointer,
  .cursor-default {
    cursor: ${IDEAVE_DEFAULT_CURSOR};
  }

  input[type="text"],
  input[type="search"],
  input:not([type]),
  textarea,
  [contenteditable="true"] {
    cursor: text;
  }

  .cursor-move {
    cursor: move;
  }

  :disabled,
  .disabled\\:cursor-not-allowed:disabled {
    cursor: not-allowed;
  }
`;
