"use client";

import { Modal as AntModal, type ModalProps as AntModalProps } from "antd";

export interface ModalProps extends Omit<AntModalProps, "okText" | "cancelText"> {
  okText?: string;
  cancelText?: string;
}

export default function Modal({
  okText = "Хадгалах",
  cancelText = "Цуцлах",
  okButtonProps,
  cancelButtonProps,
  ...rest
}: ModalProps) {
  return (
    <AntModal
      okText={okText}
      cancelText={cancelText}
      okButtonProps={{
        style: { background: "#FF6B35", borderColor: "#FF6B35", borderRadius: 8 },
        ...okButtonProps,
      }}
      cancelButtonProps={{
        style: { borderRadius: 8 },
        ...cancelButtonProps,
      }}
      styles={{
        body: { padding: 0, paddingTop: 8 },
        header: { marginBottom: 16 },
        ...rest.styles,
      }}
      {...rest}
    />
  );
}
