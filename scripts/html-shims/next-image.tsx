// Standalone HTML build: replaces next/image with a plain <img>.
import type { ImgHTMLAttributes } from "react";

type ImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  priority?: boolean;
  unoptimized?: boolean;
  fill?: boolean;
  quality?: number;
};

export default function Image({ priority, unoptimized, fill, quality, ...rest }: ImageProps) {
  void priority;
  void unoptimized;
  void quality;
  const style = fill
    ? { position: "absolute" as const, inset: 0, width: "100%", height: "100%", ...rest.style }
    : rest.style;
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...rest} style={style} />;
}
