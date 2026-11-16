import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ReferencePrototypePage } from "@/components/reference-prototype/ReferencePrototypePage";

createRoot(document.getElementById("root")!).render(
  <Suspense fallback={<div className="min-h-screen bg-[#f6f6f4]" aria-hidden />}>
    <ReferencePrototypePage />
  </Suspense>,
);
