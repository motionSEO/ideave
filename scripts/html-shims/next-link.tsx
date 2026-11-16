// Standalone HTML build: replaces next/link. "/" means this page, not the server root.
import type { AnchorHTMLAttributes } from "react";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean };

export default function Link({ href, prefetch, ...rest }: LinkProps) {
  void prefetch;
  if (href === "/") {
    return (
      <a
        {...rest}
        href={window.location.pathname}
        onClick={(event) => {
          event.preventDefault();
          window.location.href = window.location.pathname;
        }}
      />
    );
  }
  return <a {...rest} href={href} />;
}
