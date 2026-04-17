"use client";

import { Drawer as AntDrawer, type DrawerProps as AntDrawerProps } from "antd";

export type DrawerProps = AntDrawerProps;

export default function Drawer(props: DrawerProps) {
  return (
    <AntDrawer
      width={520}
      styles={{
        header: { borderBottom: "1px solid #E5E7EB", padding: "16px 24px" },
        body: { padding: 24, background: "#F7F8FA" },
        ...props.styles,
      }}
      {...props}
    />
  );
}
