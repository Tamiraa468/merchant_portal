"use client";

import { Store } from "lucide-react";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="min-h-screen flex flex-col md:flex-row bg-white">
      {/* Left brand panel */}
      <aside
        className="bg-[#1A1A1A] text-white
                   md:w-1/2 md:min-h-screen
                   px-6 py-8 md:px-10 md:py-12
                   flex flex-col justify-between"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#FF6B35] flex items-center justify-center">
            <Store className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">Merchant</span>
        </div>

        <div className="hidden md:block max-w-md mt-12 md:mt-0">
          <h1 className="text-[28px] leading-tight font-medium text-white">
            Бизнесээ нэг дороос удирдаарай
          </h1>
          <p className="text-sm text-[#9CA3AF] mt-3">
            Захиалга, бүтээгдэхүүн, хүргэлт, санхүүгийн мэдээллээ шинэ систем дээр хянаарай.
          </p>
        </div>

        <div className="hidden md:flex items-center gap-2 mt-12">
          <span className="h-1.5 w-6 rounded-full bg-[#FF6B35]" />
          <span className="h-1.5 w-3 rounded-full bg-white/20" />
          <span className="h-1.5 w-3 rounded-full bg-white/20" />
        </div>
      </aside>

      {/* Right form panel */}
      <section className="flex-1 flex items-center justify-center px-6 py-10 md:py-16">
        <div className="w-full max-w-[360px]">{children}</div>
      </section>
    </main>
  );
}
