import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-xs">
        <h1 className="mb-1 text-center text-3xl font-bold tracking-tight">
          tv<span className="text-accent">box</span>
        </h1>
        <p className="mb-8 text-center text-sm text-ink-faint">
          What we&rsquo;re watching.
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
