"use client";

import { useEffect, useState } from "react";
import { Bell, Menu } from "lucide-react";
import { Badge } from "antd";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import type { User } from "@supabase/supabase-js";

const ROLE_LABEL: Record<string, string> = {
  admin: "Администратор",
  org_user: "Гүйлгээний менежер",
  merchant: "Худалдаачин",
  courier: "Хүргэлтийн ажилтан",
  customer: "Үйлчлүүлэгч",
};

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      setUser(user);
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (!cancelled) setProfile(data);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const name =
    profile?.full_name?.trim() ||
    user?.email?.split("@")[0] ||
    "Хэрэглэгч";
  const role = profile?.role ? ROLE_LABEL[profile.role] ?? profile.role : "—";
  const initial = name.charAt(0).toUpperCase();

  return (
    <header
      className="sticky top-0 z-20 h-16 bg-white border-b border-[#E5E7EB]
                 flex items-center justify-between px-4 md:px-8"
    >
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100"
        aria-label="Цэс нээх"
      >
        <Menu className="w-5 h-5 text-gray-700" />
      </button>

      <div className="hidden md:block" />

      <div className="flex items-center gap-4">
        <button
          className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Мэдэгдэл"
        >
          <Badge dot color="#FF6B35" offset={[-2, 2]}>
            <Bell className="w-5 h-5 text-gray-600" />
          </Badge>
        </button>

        <div className="flex items-center gap-3 pl-3 pr-2 py-1.5 rounded-lg">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-semibold text-[#111827] leading-tight">{name}</div>
            <div className="text-[11px] text-[#6B7280] leading-tight">{role}</div>
          </div>
          <div
            className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FF6B35] to-[#FF8A5C]
                       flex items-center justify-center text-white text-sm font-semibold"
            aria-hidden="true"
          >
            {initial}
          </div>
        </div>
      </div>
    </header>
  );
}
