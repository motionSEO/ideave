// Standalone HTML build: replaces next/navigation with plain browser history.
export function useRouter() {
  return {
    replace(href: string) {
      void href;
      // The page is served from a file/static host, so only strip the query string.
      window.history.replaceState(null, "", window.location.pathname);
    },
    push(href: string) {
      void href;
      window.history.pushState(null, "", window.location.pathname);
    },
    prefetch() {},
    back() {
      window.history.back();
    },
    refresh() {
      window.location.reload();
    },
  };
}

export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}

export function usePathname() {
  return "/";
}
