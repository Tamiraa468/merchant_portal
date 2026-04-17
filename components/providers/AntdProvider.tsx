"use client";

import { ConfigProvider, App } from "antd";
import { AntdRegistry } from "@ant-design/nextjs-registry";

interface AntdProviderProps {
  children: React.ReactNode;
}

export default function AntdProvider({ children }: AntdProviderProps) {
  return (
    <AntdRegistry>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: "#FF6B35",
            colorLink: "#FF6B35",
            colorLinkHover: "#FF8A5C",
            borderRadius: 8,
            fontFamily: "var(--font-inter), Inter, system-ui, sans-serif",
          },
        }}
      >
        <App style={{ minHeight: "100vh", background: "transparent" }}>
          {children}
        </App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
