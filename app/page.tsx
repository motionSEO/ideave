import { Suspense } from "react";
import { ReferencePrototypePage } from "../components/reference-prototype/ReferencePrototypePage";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f6f6f4]" aria-hidden />}>
      <ReferencePrototypePage />
    </Suspense>
  );
}
