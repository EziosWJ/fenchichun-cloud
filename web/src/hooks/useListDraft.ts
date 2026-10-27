import { useEffect, useState } from 'react';

export interface ListDraft {
  keyword: string;
  filters: Record<string, string>;
}

export function useListDraft(keyword: string, filters: Record<string, string>) {
  const [draft, setDraft] = useState<ListDraft>({ keyword, filters });
  const serialized = JSON.stringify(filters);

  useEffect(() => {
    setDraft({ keyword, filters });
    // filters 以序列化结果作为依赖，避免对象引用变化造成重复重置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, serialized]);

  return {
    draft,
    setKeyword: (value: string) => setDraft((current) => ({ ...current, keyword: value })),
    setFilter: (key: string, value: string | undefined) =>
      setDraft((current) => {
        const next = { ...current.filters };
        if (value) next[key] = value;
        else delete next[key];
        return { ...current, filters: next };
      }),
    reset: () => setDraft({ keyword: '', filters: {} }),
  };
}
