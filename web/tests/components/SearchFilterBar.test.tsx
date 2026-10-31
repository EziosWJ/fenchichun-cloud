import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from 'antd';
import { FilterField, SearchFilterBar } from '../../src/components/SearchFilterBar';
import { AppProviders } from '../../src/app/AppProviders';
import { createTestQueryClient } from '../utils/renderWithProviders';

function renderBar(dirty = false) {
  return render(
    <AppProviders client={createTestQueryClient()}>
      <SearchFilterBar onSubmit={() => undefined} onReset={() => undefined} dirty={dirty}>
        <FilterField label="名称或编码" wide>
          <Input aria-label="名称或编码" />
        </FilterField>
      </SearchFilterBar>
    </AppProviders>,
  );
}

describe('SearchFilterBar', () => {
  it('exposes a persistent visible label for each filter field', () => {
    renderBar();
    expect(screen.getByText('名称或编码')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '名称或编码' })).toBeInTheDocument();
  });

  it('associates the dirty hint with the search form', () => {
    renderBar(true);
    const form = screen.getByRole('search', { name: '搜索与筛选' });
    const hint = screen.getByRole('status');
    expect(hint).toHaveTextContent('条件已修改，点击查询生效');
    expect(form).toHaveAttribute('aria-describedby', hint.id);
  });

  it('does not describe the form when filters are clean', () => {
    renderBar(false);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('search', { name: '搜索与筛选' })).not.toHaveAttribute('aria-describedby');
  });
});
