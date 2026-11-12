import { get, post, put, del } from '../../lib/api/client';

export interface DeductionCategory {
  code: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
}

export interface DeductionRange {
  minValue: string;
  maxValue: string | null;
  rateBp: number;
  sortOrder: number;
}

export interface DeductionRule {
  id: number;
  code: string;
  materialCode: string;
  materialName: string;
  categoryCode: string;
  categoryName: string;
  mode: 'amount' | 'percent';
  basisField: '' | 'moisture';
  amountMilliTonne: number;
  version: number;
  effectiveFrom: string;
  enabled: boolean;
  remark: string;
  ranges: DeductionRange[];
}

export interface DeductionRangeInput {
  minValue: string;
  maxValue: string;
  rateBp: number;
}

export interface DeductionEvaluation {
  ruleId: number;
  ruleCode: string;
  ruleVersion: number;
  categoryCode: string;
  categoryName: string;
  mode: 'amount' | 'percent';
  basisField?: string;
  basisValue?: string;
  amountMilliTonne: number;
  rateBp?: number;
  explanation?: string;
}

export interface DeductionRuleInput {
  code: string;
  materialCode: string;
  categoryCode: string;
  mode: 'amount' | 'percent';
  basisField: '' | 'moisture';
  amountMilliTonne: number;
  effectiveFrom: string;
  enabled: boolean;
  remark: string;
  ranges: DeductionRangeInput[];
}

const base = '/grain-intake';

export const deductionCategories = () => get<DeductionCategory[]>(`${base}/deduction-categories`);
export const deductionPreview = (materialCode: string, moisture: string) =>
  get<DeductionEvaluation[]>(`${base}/deduction-preview`, { materialCode, moisture });
export const deductionRules = (materialCode?: string) => get<DeductionRule[]>(`${base}/deduction-rules`, materialCode ? { materialCode } : undefined);
export const saveDeductionRule = (input: DeductionRuleInput, id?: number) => id
  ? put<DeductionRule>(`${base}/deduction-rules/${id}`, input)
  : post<DeductionRule>(`${base}/deduction-rules`, input);
export const deleteDeductionRule = (id: number) => del<void>(`${base}/deduction-rules/${id}`);
