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
            colorPrimary: "#2563eb",
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
