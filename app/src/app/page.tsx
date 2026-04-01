"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { isLoggedIn, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      router.replace(isLoggedIn ? "/schedule" : "/login");
    }
  }, [isLoading, isLoggedIn, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-green-500" />
    </div>
  );
}
