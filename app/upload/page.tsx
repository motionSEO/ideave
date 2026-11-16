"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CreateModal } from "@/components/reference-prototype/CreateModal";

export default function UploadPage() {
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  return (
    <CreateModal
      open
      onClose={() => router.push("/")}
      onUploaded={() => router.push("/")}
    />
  );
}
