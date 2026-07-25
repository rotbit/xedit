import { Suspense } from "react";
import { Home } from "@/features/workspace/Home";

export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
