"use client";

import { Search } from "lucide-react";
import Input from "./Input";
import type { InputHTMLAttributes } from "react";

interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  placeholder?: string;
}

export default function SearchBar({
  placeholder = "Хайх…",
  className = "",
  ...rest
}: SearchBarProps) {
  return (
    <Input
      type="search"
      role="searchbox"
      placeholder={placeholder}
      leftIcon={<Search className="w-4 h-4" />}
      className={className}
      {...rest}
    />
  );
}
