export type TableDensity = 'compact' | 'default' | 'comfortable';
export type SelectionMode = 'page' | 'all';

export interface TablePreferences {
  hiddenColumns: string[];
  density: TableDensity;
  selectionMode: SelectionMode;
}

const DEFAULT_PREFERENCES: TablePreferences = {
  hiddenColumns: [],
  density: 'default',
  selectionMode: 'page',
};

function storageKey(tableKey: string): string {
  return `admin-table-prefs:${tableKey}`;
}

export function loadTablePreferences(tableKey: string): TablePreferences {
  try {
    const raw = window.localStorage.getItem(storageKey(tableKey));
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<TablePreferences>;
    return {
      hiddenColumns: Array.isArray(parsed.hiddenColumns)
        ? parsed.hiddenColumns.filter((item): item is string => typeof item === 'string')
        : [],
      density:
        parsed.density === 'compact' || parsed.density === 'comfortable' || parsed.density === 'default'
          ? parsed.density
          : 'default',
      selectionMode: parsed.selectionMode === 'all' ? 'all' : 'page',
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveTablePreferences(tableKey: string, preferences: TablePreferences): void {
  try {
    window.localStorage.setItem(storageKey(tableKey), JSON.stringify(preferences));
  } catch {
    // 存储不可用时忽略，表格仍可使用默认偏好。
  }
}

export const TABLE_DENSITY_LABELS: Record<TableDensity, string> = {
  compact: '紧凑',
  default: '默认',
  comfortable: '宽松',
};
