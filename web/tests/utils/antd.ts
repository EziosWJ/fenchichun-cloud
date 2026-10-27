import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

export async function chooseSelectOption(
  user: ReturnType<typeof userEvent.setup>,
  scope: HTMLElement | Document,
  label: string,
  option: string,
  searchText?: string,
): Promise<void> {
  const scoped = scope instanceof Document ? screen : within(scope);
  await user.click(scoped.getByLabelText(label));
  if (searchText) {
    await user.type(scoped.getByLabelText(label), searchText);
  }
  const dropdown = await waitFor(() => {
    const candidates = Array.from(document.querySelectorAll('.ant-select-dropdown')).filter(
      (element) => !element.className.includes('hidden'),
    );
    const element = candidates[candidates.length - 1];
    if (!element) throw new Error(`dropdown for ${label} not found`);
    return element as HTMLElement;
  });
  const matches = await waitFor(
    () => {
      const elements = Array.from(dropdown.querySelectorAll('.ant-select-item-option')).filter(
        (element) => element.textContent?.trim() === option,
      );
      if (elements.length === 0) throw new Error(`option ${option} not found`);
      return elements;
    },
    { timeout: 6000 },
  );
  await user.click(matches[matches.length - 1] as HTMLElement);
}

export function setFieldValue(
  label: string,
  value: string,
  scope?: HTMLElement | Document,
): void {
  const scoped = scope
    ? scope instanceof Document
      ? screen
      : within(scope)
    : screen;
  fireEvent.change(scoped.getByLabelText(label), { target: { value } });
}
