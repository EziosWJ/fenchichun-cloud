import { get, getPage, post, put } from '../../lib/api/client';
import type { PaginatedResult } from '../../types/api';

export interface Category { code: string; name: string; enabled: boolean }
export interface Material { code: string; name: string; categoryCode: string | null; spec: string; remark: string; enabled: boolean }
export interface Contact { id: number; name: string; phone: string; purpose: string; remark: string; isDefault: boolean }
export interface Party { code: string; name: string; shortName: string; nature: string; isSupplier: boolean; isCustomer: boolean; isCarrier: boolean; phone: string; address: string; creditCode: string; remark: string; enabled: boolean; contacts: Contact[] }
export interface Ticket { ticketNo: string; previousTicketNo?: string | null; title: string; plate: string; direction: string; materialCode: string; materialName: string; materialSpec: string; partyCode: string; partyName: string; firstConfirmedAt: string; secondConfirmedAt: string; originalGross: string; originalTare: string; finalGross: string; finalTare: string; previousFinalGross: string | null; previousFinalTare: string | null; grossSource: string; tareSource: string; adjustmentRemark: string; adjustedBy: string | null; adjustedAt: string | null; driver: string; driverPhone: string; contactName: string; contactPhone: string; issuedAt: string; issuerName: string }
export interface TicketRecord { siteCode: string; status: string; ticket: Ticket; voidReason: string | null; voidedAt: string | null }
export interface DirectionTotal { direction: string; materialCode: string; partyCode: string; count: number; netMilliTonne: number }
export interface SiteInput { code: string; name: string }
export interface Site extends SiteInput { enabled: boolean }
const base = '/weighbridge';
export const categories = () => get<Category[]>(`${base}/master/categories`);
export const materials = () => get<Material[]>(`${base}/master/materials`);
export const parties = () => get<Party[]>(`${base}/master/parties`);
export const saveCategory = (input: Omit<Category, 'code'>, code?: string) => code ? put<Category>(`${base}/master/categories/${encodeURIComponent(code)}`, input) : post<Category>(`${base}/master/categories`, input);
export const saveMaterial = (input: Omit<Material, 'code'>, code?: string) => code ? put<Material>(`${base}/master/materials/${encodeURIComponent(code)}`, input) : post<Material>(`${base}/master/materials`, input);
export const saveParty = (input: Omit<Party, 'code'>, code?: string) => code ? put<Party>(`${base}/master/parties/${encodeURIComponent(code)}`, input) : post<Party>(`${base}/master/parties`, input);
export const createSite = (input: SiteInput) => post<Site>(`${base}/sites`, input);
export const updateSite = (site: SiteInput, original: Site) => put<void>(`${base}/sites/${encodeURIComponent(original.code)}`, site);
export const sites = () => get<Site[]>(`${base}/sites`);
export const tickets = (params: Record<string, unknown>): Promise<PaginatedResult<TicketRecord>> => getPage<TicketRecord>(`${base}/tickets`, params);
export const totals = (params: Record<string, unknown>) => get<DirectionTotal[]>(`${base}/ticket-totals`, params);
