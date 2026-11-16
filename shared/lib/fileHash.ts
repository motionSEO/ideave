import { createHash } from "node:crypto";

export function computeFileSha256Hex(buffer: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(buffer)).digest("hex");
}
