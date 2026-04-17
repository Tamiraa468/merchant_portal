"use client";

import { App } from "antd";

export default function useToast() {
  const { message } = App.useApp();

  return {
    success: (text = "Амжилттай хадгалагдлаа") => message.success(text),
    error: (text = "Алдаа гарлаа") => message.error(text),
    info: (text: string) => message.info(text),
    warning: (text: string) => message.warning(text),
    loading: (text: string) => message.loading(text),
  };
}
