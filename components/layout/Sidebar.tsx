"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  Truck,
  BarChart3,
  DollarSign,
  Settings,
  Store,
  X,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: "/dashboard",  label: "Хяналтын самбар",      Icon: LayoutDashboard },
  { href: "/orders",     label: "Захиалга",             Icon: ClipboardList },
  { href: "/products",   label: "Бүтээгдэхүүн",         Icon: Package },
  { href: "/tasks",      label: "Хүргэлтийн даалгавар", Icon: Truck },
  { href: "/analytics",  label: "Аналитик",             Icon: BarChart3 },
  { href: "/financials", label: "Санхүү",               Icon: DollarSign },
  { href: "/settings",   label: "Тохиргоо",             Icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.push("/auth/login");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 z-40 h-screen w-[240px]
                    bg-[#1A1A1A] text-white flex flex-col shrink-0
                    transition-transform duration-200 ease-out
                    ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        aria-label="Үндсэн цэс"
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-white/5">
          <Link href="/dashboard" className="flex items-center gap-2 text-white!">
            <div className="w-8 h-8 rounded-lg bg-[#FF6B35] flex items-center justify-center">
              <Store className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base tracking-tight">Merchant</span>
          </Link>
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded hover:bg-white/10"
            aria-label="Цэс хаах"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active =
              pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                            transition-colors duration-150
                            ${
                              active
                                ? "bg-[#FF6B35]! text-white!"
                                : "text-white! hover:bg-[rgba(255,107,53,0.08)]! hover:text-[#FF6B35]!"
                            }`}
              >
                <item.Icon
                  className="w-[18px] h-[18px] shrink-0"
                  strokeWidth={active ? 2.25 : 2}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/5">
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium
                       text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors duration-150
                       disabled:opacity-60"
          >
            <LogOut className="w-[18px] h-[18px] shrink-0" />
            <span>{signingOut ? "Гарч байна…" : "Гарах"}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
