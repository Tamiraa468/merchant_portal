"use client";

import { Tabs as AntTabs, type TabsProps as AntTabsProps } from "antd";

export type TabsProps = AntTabsProps;

export default function Tabs(props: TabsProps) {
  return (
    <AntTabs
      tabBarStyle={{
        marginBottom: 16,
        borderBottom: "1px solid #E5E7EB",
        ...props.tabBarStyle,
      }}
      {...props}
    />
  );
}
