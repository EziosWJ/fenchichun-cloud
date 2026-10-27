import type { ReactNode } from 'react';
import { App, Button, type ButtonProps } from 'antd';
import { Trash2 } from 'lucide-react';
import { getApiErrorMessage } from '../lib/api/errors';
import { deleteConfirmContent } from '../config/messages';

interface ConfirmDeleteProps {
  entityName: string;
  title?: string;
  description?: ReactNode;
  onConfirm: () => Promise<void> | void;
  successMessage?: string;
  label?: string;
  buttonProps?: ButtonProps;
  children?: never;
}

export function ConfirmDelete({
  entityName,
  title,
  description,
  onConfirm,
  successMessage = '删除成功',
  label = '删除',
  buttonProps,
}: ConfirmDeleteProps) {
  const { modal, message } = App.useApp();

  const handleClick = () => {
    modal.confirm({
      title: title ?? `删除${entityName ? `“${entityName}”` : '记录'}`,
      content: description ?? deleteConfirmContent(entityName),
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await onConfirm();
          message.success(successMessage);
        } catch (error) {
          message.error(getApiErrorMessage(error));
        }
      },
    });
  };

  return (
    <Button
      danger
      type="default"
      size="middle"
      icon={<Trash2 size={15} aria-hidden="true" />}
      onClick={handleClick}
      {...buttonProps}
    >
      {label}
    </Button>
  );
}
