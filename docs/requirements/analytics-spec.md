# 统计与分析：详细方案

> 本文基于 2026-11-04 已确认的 Q1–Q15 决策，定义云端过磅统计与分析的第一期实现方案。  
> 2026-11-04：第一版已实现并通过后端、前端与 PostgreSQL 集成测试；本文保留为设计与验收依据。

## 1. 范围

### 1.1 本期范围

在“统计与分析”一级菜单下新增 5 个二级页面，并保留现有“客户对账”：

1. 经营总览
2. 进出厂分析
3. 物料分析
4. 供收方分析
5. 数据质量
6. 客户对账（现有，保持现状）

统计对象为云端已接收的过磅单，数据来源包括：

- `wb_cloud_ticket` 及其 `snapshot` 快照；
- `wb_cloud_site`、`wb_cloud_material`、`wb_cloud_category`、`wb_cloud_party` 等主数据；
- `wb_cloud_ticket_change` 及 `latest_*` 同步接收信息。

### 1.2 本期不做

- 不新增权限角色；新增菜单先全部授权给现有 `ADMIN`。
- 不做化验指标、承运商、库存、金额、合同、生产、设备、照片、打印分析。
- 不做实时在厂车辆、待二次过磅任务、排队时长。
- 不做退货、调拨、内部转运等业务类型；当前只按 `inbound/outbound` 统计。
- 不做“公司-厂区”映射；公司维度只到厂区。
- 不改现有客户对账的筛选、默认月份、导出逻辑。

### 1.3 数据边界

云端是厂端同步上来的“已出单”数据，不是实时全量生产数据。页面必须展示数据截止时间和最近接收时间，并提示统计结果会随补传变化。

## 2. 已确认决策

| 决策 | 结论 |
|---|---|
| 菜单结构 | 一级“统计与分析”，二级：经营总览 / 进出厂分析 / 物料分析 / 供收方分析 / 数据质量 / 客户对账 |
| 命名 | “出入库分析”改为“进出厂分析” |
| 净流入 | 默认按物料/分类展示；总额=各物料/分类入厂净重−出厂净重，允许负数；标注“过磅净流入” |
| 公司维度 | 无法人实体，只按厂区；不做公司-厂区映射 |
| 买卖语义 | 只统计采购入厂/销售出厂；确认无退货、调拨、内部转运 |
| 核心口径 | 有效单=`valid`；按 `issuedAt` 北京时间归期；车次=有效单据数；平均单次净重=净重/车次；扣量率=净重调整/(毛重−皮重)；作废率=作废/(有效+作废)；调整率同时给单数占比和重量占比；重开=新单 `previousTicketNo` 非空 |
| 时长/隔日 | 两次确认间隔=`secondConfirmedAt−firstConfirmedAt`；超长单默认 >24 小时；隔日完成单=两次确认跨北京日期；重开单剔除并单独标记；云端不做待过磅隔日车 |
| 同比/新增回归 | 先做接口和空态，标注“数据积累中”，满 12 个月再启用，不作为默认 KPI |
| 性能 | 先加派生列和索引，再做聚合 |
| 图表/导出 | ECharts；CSV 先做，Excel 二期；筛选同步 URL；图表点击下钻；手动 + 5 分钟自动刷新 |
| 权限 | 暂不新增角色；菜单权限码保留，先全部授权给 `ADMIN` |
| 扣量 | 本期只做扣量分析；不做化验指标、承运商、库存、金额 |
| 导出 | 当前筛选全部行，上限 5 万行 |
| 总览首屏 | 有效车次、入厂净重、出厂净重、过磅净流入、活跃供收方、扣量率；下方趋势/结构/Top/异常 |

## 3. 信息架构与菜单

### 3.1 菜单与路由

| 顺序 | 菜单 | 路由 | `component` | `permissionCode` | 图标 |
|---|---|---|---|---|---|
| 1 | 经营总览 | `/analytics/overview` | `weighbridge/analytics/overview/index` | `weighbridge:analytics:overview` | `layout-dashboard` |
| 2 | 进出厂分析 | `/analytics/flow` | `weighbridge/analytics/flow/index` | `weighbridge:analytics:flow` | `arrow-left-right` |
| 3 | 物料分析 | `/analytics/materials` | `weighbridge/analytics/materials/index` | `weighbridge:analytics:materials` | `package` |
| 4 | 供收方分析 | `/analytics/parties` | `weighbridge/analytics/parties/index` | `weighbridge:analytics:parties` | `users` |
| 5 | 数据质量 | `/analytics/quality` | `weighbridge/analytics/quality/index` | `weighbridge:analytics:quality` | `shield-check` |
| 6 | 客户对账 | `/analytics/reconciliation` | `weighbridge/analytics/statement/index` | `weighbridge:analytics:statement` | `file-search` |

实现要求：

- 在 `web/src/lib/menu-icons.ts` 增加 `layout-dashboard`、`arrow-left-right`、`shield-check` 三个 lucide 图标映射；`package`、`users`、`file-search` 已存在。
- 在 `web/src/config/paths.ts` 增加 5 个路径常量。
- 在 `web/src/config/routes.tsx` 注册 5 个懒加载页面，`menuPath` 与菜单权限码一致。
- 客户对账页面和详情页保持现有实现，只调整父菜单和排序。
- 菜单种子新增 `server/migrations/seed/00013_analytics_menus.sql`；现有客户对账 `sort_order` 调整为 6，新菜单为 1–5。
- 新菜单先全部插入 `sys_role_menu` 给 `ADMIN`，不新增角色。
- 菜单显隐沿用现有 `menuPath` 守卫；本期不新增接口级权限校验。

### 3.2 权限说明

当前系统只有 `ADMIN` 一个角色，后端接口只校验登录态，不按 `permissionCode` 做接口级拦截。本期沿用现状：

- 菜单：只有 `ADMIN` 可见。
- 接口：任何已登录用户可访问；这是现有系统的行为，不是本期新增的安全边界。
- 后续需要按领导/化验室/过磅管理员/对账分权时，再新增角色并分配二级菜单；本期不返工菜单权限码。

## 4. 数据与指标口径

### 4.1 全局规则

- 时区：`Asia/Shanghai`（北京时间）。
- 业务量归期：按 `issued_at` 的北京日期；不按同步接收时间。
- 有效口径：所有流量/结构/对比页面只统计 `status='valid'`。
- 作废：作废单不计入流量；只在“数据质量”页面统计。
- 重开：原单作废不计；新单为有效单，计入一次车次；重开单在时长统计中默认剔除。
- 净重：以数据库 `final_net_milli_tonne` 为准；快照 `finalNet` 仅用于展示/核对。
- 扣量未知：旧协议单据若快照无 `netAdjustment`，标记 `adjustment_known=false`，不当作 0。
- 重量单位：使用整数 **milli-tonne（0.001 吨）**，字段后缀 `MilliTonne`。
- 比率：使用整数 **basis point（0.01%）**，字段后缀 `Bp`；分母为 0 时返回 `null`。
- 时长：秒，字段后缀 `Seconds`；样本不足时返回 `null`。
- 日期参数：`from`/`to` 均为 `YYYY-MM-DD`，包含 `to` 当天；后端转换为 `[from 00:00, to+1 00:00)`。
- 默认日期：未传时默认当前月（北京时间）。
- 最大范围：聚合查询最多 5 年；导出最多 5 万行；超出返回 400，提示缩小范围。

### 4.2 指标定义

| 指标 | 公式/口径 | 说明 |
|---|---|---|
| 有效车次 | `count(*) where status='valid'` | 一张有效单=一次车次 |
| 入厂/出厂车次 | 按 `direction` 分组计数 | `inbound/outbound` |
| 净重 | `sum(final_net_milli_tonne)` | 最终净重 |
| 毛重/皮重 | `sum(final_gross_milli_tonne)` / `sum(final_tare_milli_tonne)` | 派生列 |
| 平均单次净重 | `净重 / 有效车次` | 分母为 0 返回 null |
| 占比 | `分组净重 / 总净重 × 10000` | 返回 bp |
| 过磅净流入 | `入厂净重 − 出厂净重` | 按物料/分类；总额为各物料之和，允许负数 |
| 净重调整 | `sum(net_adjustment_milli_tonne)` | 只统计 `adjustment_known=true` |
| 扣前净重 | `sum(pre_adjustment_net_milli_tonne)` | `finalGross − finalTare` |
| 扣量率 | `净重调整 / 扣前净重 × 10000` | 只统计已知调整单 |
| 调整单数占比 | `adjusted_tickets / adjustment_known_tickets × 10000` | `adjusted = adjustment_known AND net_adjustment ≠ 0` |
| 调整覆盖率 | `adjustment_known_tickets / valid_tickets × 10000` | 旧协议未知单会拉低覆盖率 |
| 作废率 | `void_tickets / (valid_tickets + void_tickets) × 10000` | 按出单日期归期 |
| 重开率 | `reopened_valid_tickets / valid_tickets × 10000` | 新单 `previous_ticket_no` 非空 |
| 手工来源率 | `(gross_source='manual' OR tare_source='manual') / valid_tickets × 10000` | 毛重/皮重任一手工 |
| 两次过磅间隔 | `second_confirmed_at − first_confirmed_at` | 秒；中位数/P90/最大值 |
| 隔日完成单 | `first_confirmed_date ≠ second_confirmed_date` | 北京时间；只统计有效非重开单 |
| 出单延迟 | `issued_at − second_confirmed_at` | 秒；中位数/P90 |
| 作废时长 | `voided_at − issued_at` | 秒；只统计作废单 |
| 毛重修正 | `original_gross − final_gross` | 正数表示最终值调低 |
| 皮重修正 | `original_tare − final_tare` | 正数表示最终值调低 |
| 活跃供收方 | 期间内有至少一张有效单的去重 `party_code` | 按方向分别统计 |
| 新增供收方 | 系统内首次有效单落在本期 | 标注“系统内首次”，受历史覆盖影响 |
| 回归供收方 | 本期有单、上一等长周期无单、此前有单 | 需要至少两个周期历史 |
| 沉默供收方 | 此前有单、本期无单 | 需要历史覆盖 |
| 集中度 CRn | 前 n 名净重 / 总净重 × 10000 | n=3/5/10 |
| HHI | `sum((party_net / total_net)^2) × 10000` | 样本少时仅展示，不做结论 |
| 超长单 | `weigh_interval_seconds > 86400` | 默认阈值 24 小时 |
| 时长样本 | `status='valid' AND previous_ticket_no IS NULL AND weigh_interval_seconds >= 0` | 重开单剔除；负值进异常清单 |

### 4.3 时间粒度

- `day`：北京日期 `YYYY-MM-DD`。
- `week`：ISO 周（周一开始），返回 `period` 与 `periodStart`。
- `month`：`YYYY-MM`。
- `quarter`：`YYYY-Qn`。
- `year`：`YYYY`。
- `auto`：范围 ≤31 天按日；≤180 天按周；≤730 天按月；≤1825 天按季；否则按年。
- 周/月/季/年返回 `periodStart`、`periodEnd`，前端不自行解析周期字符串。

### 4.4 对比口径

- `compare=previous`：当前范围的**前一个等长自然日窗口**。
- `compare=year`：当前范围整体前移一年；2 月 29 日按 2 月 28 日处理。
- `compare=none`：不返回对比。
- 对比返回绝对差和百分比；基期为 0 时百分比返回 `null`，前端显示“—”。
- 同比、新增/回归在数据不足时返回 `coverageComplete=false`，前端显示“数据积累中”，不隐藏整个板块。

### 4.5 数据质量注意事项

- 旧协议快照缺 `finalNet`/`netAdjustment`：净重用数据库列；扣量标记未知，不参与扣量率分母。
- 重开单可能沿用原单两次确认时间；时长统计剔除，质量页单独列出。
- `adjustedBy` 在云端快照中被回填为出单人，不能用于“实际调整人”绩效分析；出单人分析只用 `issuerName`。
- 物料分类、供收方角色来自当前主数据，不是历史快照；分类/角色变更会影响回看结果，页面需注明。
- 云端只能证明“收到”，不能证明“厂端没有积压”；同步新鲜度只展示接收侧信息。
- 车牌、司机姓名是自由文本；车辆/司机分析放二期，本期不做深度清洗。

## 5. 数据层设计

### 5.1 迁移

新增 `server/migrations/schema/00014_weighbridge_analytics.sql`（编号按实际最新迁移顺延）。

新增列：

| 列 | 类型 | 可空 | 来源/说明 |
|---|---|---|---|
| `original_gross_milli_tonne` | `BIGINT` | 是 | 快照 `originalGross` |
| `original_tare_milli_tonne` | `BIGINT` | 是 | 快照 `originalTare` |
| `final_gross_milli_tonne` | `BIGINT` | 是 | 快照 `finalGross` |
| `final_tare_milli_tonne` | `BIGINT` | 是 | 快照 `finalTare` |
| `pre_adjustment_net_milli_tonne` | `BIGINT` | 是 | `finalGross − finalTare` |
| `net_adjustment_milli_tonne` | `BIGINT` | 是 | 快照 `netAdjustment`；旧协议未知为 null |
| `adjustment_known` | `BOOLEAN NOT NULL DEFAULT FALSE` | 否 | 快照是否存在 `netAdjustment` |
| `adjusted` | `BOOLEAN NOT NULL DEFAULT FALSE` | 否 | `adjustment_known AND net_adjustment ≠ 0` |
| `adjustment_mode` | `VARCHAR(20)` | 是 | 快照 `netAdjustmentMode` |
| `adjustment_category` | `VARCHAR(80)` | 是 | 快照 `netAdjustmentCategory` |
| `adjustment_category_name` | `VARCHAR(200)` | 是 | 快照 `netAdjustmentCategoryName` |
| `first_confirmed_at` | `TIMESTAMPTZ` | 是 | 快照 `firstConfirmedAt` |
| `second_confirmed_at` | `TIMESTAMPTZ` | 是 | 快照 `secondConfirmedAt` |
| `weigh_interval_seconds` | `BIGINT` | 是 | `secondConfirmedAt − firstConfirmedAt` |
| `issued_lag_seconds` | `BIGINT` | 是 | `issuedAt − secondConfirmedAt` |
| `cross_day` | `BOOLEAN NOT NULL DEFAULT FALSE` | 否 | 两次确认的北京日期不同 |
| `gross_source` | `VARCHAR(20)` | 是 | 快照 `grossSource` |
| `tare_source` | `VARCHAR(20)` | 是 | 快照 `tareSource` |
| `issuer_name` | `VARCHAR(200)` | 是 | 快照 `issuerName` |
| `driver` | `VARCHAR(200)` | 是 | 快照 `driver`；仅用于完整度/异常提示 |
| `driver_phone` | `VARCHAR(100)` | 是 | 快照 `driverPhone` |
| `contact_name` | `VARCHAR(200)` | 是 | 快照 `contactName` |
| `contact_phone` | `VARCHAR(100)` | 是 | 快照 `contactPhone` |
| `material_name` | `VARCHAR(200)` | 是 | 快照 `materialName` |
| `material_spec` | `VARCHAR(200)` | 是 | 快照 `materialSpec` |
| `party_name` | `VARCHAR(200)` | 是 | 快照 `partyName` |
| `issued_date` | `DATE` | 是 | `issued_at` 的北京日期 |

说明：

- 派生列是为了查询性能，不替代 `snapshot`；快照仍是业务原始事实。
- 不新增 `material_category_id`；分类通过 `material_code` 关联当前主数据。
- 不新增车牌/司机派生列；车辆/司机分析二期再做。
- 所有列对旧数据允许 null；新写入的合法快照应尽量填满。

### 5.2 回填

Schema migration 只做 DDL；回填放在 seed migration `00014_analytics_backfill.sql`，避免违反“schema 迁移不写业务 DML”的仓库约束。回填从 `snapshot::jsonb` 取值。示例：

```sql
UPDATE wb_cloud_ticket
SET
  original_gross_milli_tonne = round(NULLIF(snapshot::jsonb->>'originalGross','')::numeric * 1000)::bigint,
  original_tare_milli_tonne = round(NULLIF(snapshot::jsonb->>'originalTare','')::numeric * 1000)::bigint,
  final_gross_milli_tonne = round(NULLIF(snapshot::jsonb->>'finalGross','')::numeric * 1000)::bigint,
  final_tare_milli_tonne = round(NULLIF(snapshot::jsonb->>'finalTare','')::numeric * 1000)::bigint,
  pre_adjustment_net_milli_tonne =
    round(NULLIF(snapshot::jsonb->>'finalGross','')::numeric * 1000)::bigint
    - round(NULLIF(snapshot::jsonb->>'finalTare','')::numeric * 1000)::bigint,
  net_adjustment_milli_tonne = round(NULLIF(snapshot::jsonb->>'netAdjustment','')::numeric * 1000)::bigint,
  adjustment_known = NULLIF(snapshot::jsonb->>'netAdjustment','') IS NOT NULL,
  adjusted = NULLIF(snapshot::jsonb->>'netAdjustment','') IS NOT NULL
             AND NULLIF(snapshot::jsonb->>'netAdjustment','')::numeric <> 0,
  adjustment_mode = NULLIF(snapshot::jsonb->>'netAdjustmentMode',''),
  adjustment_category = NULLIF(snapshot::jsonb->>'netAdjustmentCategory',''),
  adjustment_category_name = NULLIF(snapshot::jsonb->>'netAdjustmentCategoryName',''),
  first_confirmed_at = NULLIF(snapshot::jsonb->>'firstConfirmedAt','')::timestamptz,
  second_confirmed_at = NULLIF(snapshot::jsonb->>'secondConfirmedAt','')::timestamptz,
  weigh_interval_seconds = EXTRACT(EPOCH FROM (
    NULLIF(snapshot::jsonb->>'secondConfirmedAt','')::timestamptz
    - NULLIF(snapshot::jsonb->>'firstConfirmedAt','')::timestamptz
  ))::bigint,
  issued_lag_seconds = EXTRACT(EPOCH FROM (
    issued_at - NULLIF(snapshot::jsonb->>'secondConfirmedAt','')::timestamptz
  ))::bigint,
  cross_day = (
    (NULLIF(snapshot::jsonb->>'firstConfirmedAt','')::timestamptz AT TIME ZONE 'Asia/Shanghai')::date
    <> (NULLIF(snapshot::jsonb->>'secondConfirmedAt','')::timestamptz AT TIME ZONE 'Asia/Shanghai')::date
  ),
  gross_source = NULLIF(snapshot::jsonb->>'grossSource',''),
  tare_source = NULLIF(snapshot::jsonb->>'tareSource',''),
  issuer_name = NULLIF(snapshot::jsonb->>'issuerName',''),
  driver = NULLIF(snapshot::jsonb->>'driver',''),
  driver_phone = NULLIF(snapshot::jsonb->>'driverPhone',''),
  contact_name = NULLIF(snapshot::jsonb->>'contactName',''),
  contact_phone = NULLIF(snapshot::jsonb->>'contactPhone',''),
  material_name = NULLIF(snapshot::jsonb->>'materialName',''),
  material_spec = NULLIF(snapshot::jsonb->>'materialSpec',''),
  party_name = NULLIF(snapshot::jsonb->>'partyName',''),
  issued_date = (issued_at AT TIME ZONE 'Asia/Shanghai')::date;
```

注意：

- `NULLIF(...,'')` 处理空字符串；`round(...)::bigint` 处理小数。
- 回填后跑校验 SQL：净重、派生毛皮重、调整字段与快照抽样一致。
- 不在迁移中修改 `final_net_milli_tonne`；它已经是权威净重列。

### 5.3 写入路径

新增 `deriveTicketAnalytics(snapshot TicketSnapshot, finalNet int64) analyticsFields`（或等价 helper），在以下位置调用：

- `createTicketV4`：插入 `wb_cloud_ticket` 时写入派生列。
- legacy `ApplyChange` 的 `issue/reopen` 插入分支：同样写入。
- 作废更新不改变重量/时间字段，不需要重算；`voided_at` 已存在。
- 重开新单使用新快照，正常写入。

约束：派生逻辑与 migration 回填必须使用同一套规则；用单元测试覆盖 v2/v3/v4 快照、旧数据缺失调整、跨日、负间隔等样例。

### 5.4 索引

建议新增：

```sql
CREATE INDEX idx_wb_cloud_ticket_analytics_issued
  ON wb_cloud_ticket (issued_date, status);
CREATE INDEX idx_wb_cloud_ticket_analytics_site
  ON wb_cloud_ticket (site_code, issued_date);
CREATE INDEX idx_wb_cloud_ticket_analytics_direction
  ON wb_cloud_ticket (direction, issued_date);
CREATE INDEX idx_wb_cloud_ticket_analytics_material
  ON wb_cloud_ticket (material_code, issued_date);
CREATE INDEX idx_wb_cloud_ticket_analytics_party
  ON wb_cloud_ticket (party_code, issued_date);
CREATE INDEX idx_wb_cloud_ticket_analytics_issuer
  ON wb_cloud_ticket (issuer_name, issued_date);
CREATE INDEX idx_wb_cloud_ticket_analytics_adjustment
  ON wb_cloud_ticket (adjustment_category)
  WHERE adjustment_known;
```

现有 `idx_wb_cloud_ticket_issued (issued_at, status)` 保留，用于按时间精确查询；新增索引服务分析页。

### 5.5 查询策略

- 分析接口不再加载快照到 Go 里逐行解析；改为 Repository 内 SQL 聚合。
- 使用 `COUNT(*) FILTER (WHERE direction='inbound')`、`SUM(...) FILTER (...)` 做行列转换。
- 周期分组使用 `date_trunc`/`to_char`，仅限 Repository 层；Service 不依赖具体数据库方言。
- 对比周期由 Service 计算起止日期，再调用 Repository 两次或一次条件聚合。
- 分页表（物料、供收方、异常）使用 `LIMIT/OFFSET`；趋势图最多返回 1000 个周期点。
- 超过 1000 个周期点时，自动提升粒度或返回 400；前端提示缩小范围。

### 5.6 性能目标

- 设计量级：3 厂区合计日均 300 单、保留 5 年，约 55 万行；预留至日均 1000 单（约 180 万行）。
- 目标：常用页面在 100 万行数据量下 P95 < 1 秒；导出 5 万行 < 5 秒。
- 若实际超过 500 万行或 P95 > 2 秒，再评估日聚合表 `wb_cloud_ticket_daily`；本期不提前建。

## 6. 后端 API

### 6.1 通用约定

- 前缀：`/api/v1/weighbridge/analytics`。
- 统一响应：`{ code, message, data }`，成功 `code=200`。
- 鉴权：沿用现有 Bearer Token；本期不增加 `permissionCode` 接口校验。
- 重量：`*MilliTonne int64`；比率：`*Bp int64`；时长：`*Seconds int64`。
- 空值：分母为 0、样本不足、旧数据未知时返回 `null`，前端显示“—”。
- 时间：RFC3339；日期参数 `YYYY-MM-DD`。
- 分页：`records`/`total`/`page`/`pageSize`；前端统一转换。
- 导出：`text/csv; charset=utf-8`，带 BOM；文件名包含范围、厂区、方向。

通用查询参数：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `from` | string | 当前月 1 日 | 开始日期，含 |
| `to` | string | 当前月末 | 结束日期，含 |
| `siteCode` | string | 全部 | 厂区编码 |
| `direction` | string | 全部 | `inbound/outbound`；供收方接口必填 |
| `materialCode` | string | 全部 | 物料编码 |
| `categoryCode` | string | 全部 | 物料分类编码 |
| `partyCode` | string | 全部 | 供收方编码 |
| `issuerName` | string | 全部 | 出单人（数据质量页） |
| `keyword` | string | 空 | 物料/供收方名称或编码模糊搜索 |
| `granularity` | string | `auto` | `auto/day/week/month/quarter/year` |
| `compare` | string | `previous` | `none/previous/year` |
| `topN` | int | 10 | 1–50 |
| `page` | int | 1 | 分页 |
| `pageSize` | int | 20 | 1–100 |
| `sortBy` | string | `net` | 表格排序字段 |
| `sortOrder` | string | `desc` | `asc/desc` |

公共类型：

```ts
type Bp = number; // 0.01%，10000 = 100%

interface Freshness {
  dataThrough: string | null;
  lastReceivedAt: string | null;
  historyStart: string | null;
  siteReceipts: Array<{
    siteCode: string;
    siteName: string;
    lastReceivedAt: string | null;
    receivedChanges: number;
  }>;
}

interface ComparisonMetric {
  current: number;
  previous: number;
  delta: number;
  deltaBp: Bp | null;
}

interface ComparisonSummary {
  validTickets: ComparisonMetric;
  inboundTickets: ComparisonMetric;
  outboundTickets: ComparisonMetric;
  inboundNetMilliTonne: ComparisonMetric;
  outboundNetMilliTonne: ComparisonMetric;
  netFlowMilliTonne: ComparisonMetric;
  adjustmentNetMilliTonne: ComparisonMetric;
  voidTickets: ComparisonMetric;
}

interface TrendPoint {
  period: string;
  periodStart: string;
  periodEnd: string;
  inboundTickets: number;
  inboundNetMilliTonne: number;
  outboundTickets: number;
  outboundNetMilliTonne: number;
  netFlowMilliTonne: number;
  voidTickets: number;
  voidRateBp: Bp | null;
}

interface TrendSeries {
  granularity: 'day' | 'week' | 'month' | 'quarter' | 'year';
  points: TrendPoint[];
}

interface StructureRow {
  key: string;
  label: string;
  netMilliTonne: number;
  shareBp: Bp | null;
}

interface TopRow {
  code: string;
  name: string;
  direction?: 'inbound' | 'outbound';
  netMilliTonne: number;
  ticketCount: number;
  shareBp: Bp | null;
}

interface AlertRow {
  type: string;
  level: 'info' | 'warning' | 'error';
  count: number;
  message: string;
}
```

### 6.2 接口清单

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/analytics/overview` | 经营总览 |
| GET | `/analytics/flow` | 进出厂分析 |
| GET | `/analytics/materials` | 物料分析 |
| GET | `/analytics/materials/supplier-quality` | 核心原料供应商扣量稳定性 |
| GET | `/analytics/materials/byproduct-flow` | 副产品出库流向 |
| GET | `/analytics/parties` | 供收方分析 |
| GET | `/analytics/parties/detail` | 供收方详情抽屉 |
| GET | `/analytics/quality` | 数据质量 |
| GET | `/analytics/flow/export` | 进出厂 CSV |
| GET | `/analytics/materials/export` | 物料 CSV |
| GET | `/analytics/parties/export` | 供收方 CSV |
| GET | `/analytics/quality/export` | 数据质量 CSV |

筛选选项复用现有接口：

- 厂区：`GET /api/v1/weighbridge/sites`
- 物料/分类：`GET /api/v1/weighbridge/master/materials`、`/master/categories`
- 供收方：`GET /api/v1/weighbridge/master/parties`

### 6.3 经营总览

`GET /analytics/overview`

返回结构：

```ts
interface OverviewSummary {
  validTickets: number;
  inboundTickets: number;
  inboundNetMilliTonne: number;
  outboundTickets: number;
  outboundNetMilliTonne: number;
  netFlowMilliTonne: number;
  activeSites: number;
  activeSuppliers: number;
  activeCustomers: number;
  avgNetPerTicketMilliTonne: number | null;
  adjustedTickets: number;
  adjustmentNetMilliTonne: number;
  adjustmentWeightRateBp: Bp | null;
  adjustmentCoverageBp: Bp | null;
  voidTickets: number;
  voidRateBp: Bp | null;
}

interface OverviewData {
  summary: OverviewSummary;
  comparison: {
    previous: ComparisonSummary;
    year: ComparisonSummary;
  };
  trend: TrendSeries;
  materialStructure: StructureRow[];
  topMaterials: TopRow[];
  topParties: TopRow[];
  alerts: AlertRow[];
  freshness: Freshness;
}
```

`ComparisonSummary` 的每个指标均为 `ComparisonMetric`（`current` / `previous` / `delta` / `deltaBp`）；前端按 `delta` 和 `deltaBp` 渲染增减，基期为 0 时 `deltaBp=null`。

`alerts` 本期只做简单规则：

- 作废率高于阈值；
- 调整覆盖率低于 100%；
- 存在超长单/负间隔；
- 最近接收时间超过 2 小时（可配置）；
- 存在旧协议无调整字段的单据。

### 6.4 进出厂分析

`GET /analytics/flow`

返回：

```ts
interface FlowSummary extends OverviewSummary {
  inboundAvgNetMilliTonne: number | null;
  outboundAvgNetMilliTonne: number | null;
}

interface FlowData {
  summary: FlowSummary;
  comparison: { previous: ComparisonSummary; year: ComparisonSummary };
  trend: {
    granularity: string;
    points: FlowPoint[];
  };
  siteComparison: FlowSiteRow[];
  duration: {
    sampleTickets: number;
    medianSeconds: number | null;
    p90Seconds: number | null;
    maxSeconds: number | null;
    crossDayTickets: number;
    crossDayRateBp: number | null;
    reopenedExcludedTickets: number;
  };
  freshness: Freshness;
}

interface FlowSiteRow {
  siteCode: string;
  siteName: string;
  inboundTickets: number;
  inboundNetMilliTonne: number;
  outboundTickets: number;
  outboundNetMilliTonne: number;
  netFlowMilliTonne: number;
  avgNetPerTicketMilliTonne: number | null;
  voidTickets: number;
  voidRateBp: number | null;
  adjustedTickets: number;
  adjustmentWeightRateBp: number | null;
  adjustmentCoverageBp: number | null;
}
```

`FlowPoint`：

```ts
{
  period: string;
  periodStart: string;
  periodEnd: string;
  inboundTickets: number;
  inboundNetMilliTonne: number;
  outboundTickets: number;
  outboundNetMilliTonne: number;
  netFlowMilliTonne: number;
  avgNetPerTicketMilliTonne: number | null;
  voidTickets: number;
  voidRateBp: number | null;
}
```

`siteComparison` 按厂区返回入厂/出厂车次、净重、净流入、平均单次、作废率、扣量率。

### 6.5 物料分析

`GET /analytics/materials`

返回：

```ts
interface MaterialsData {
  summary: {
    materialCount: number;
    inboundNetMilliTonne: number;
    outboundNetMilliTonne: number;
    adjustmentNetMilliTonne: number;
    adjustmentWeightRateBp: number | null;
    adjustmentCoverageBp: number | null;
    lastIssuedAt: string | null;
  };
  records: MaterialRow[];
  total: number;
  page: number;
  pageSize: number;
  trend: {
    granularity: string;
    series: Array<{
      materialCode: string;
      materialName: string;
      points: Array<{ period: string; netMilliTonne: number }>;
    }>;
  };
  structure: StructureRow[];
  topAdjustments: MaterialRow[];
  freshness: Freshness;
}
```

`MaterialRow`：

```ts
{
  materialCode: string;
  materialName: string;
  materialSpec: string;
  categoryCode: string | null;
  categoryName: string | null;
  inboundTickets: number;
  inboundNetMilliTonne: number;
  outboundTickets: number;
  outboundNetMilliTonne: number;
  totalTickets: number;
  totalNetMilliTonne: number;
  avgNetPerTicketMilliTonne: number | null;
  shareBp: number | null;
  adjustedTickets: number;
  adjustmentNetMilliTonne: number;
  adjustmentWeightRateBp: number | null;
  adjustmentCoverageBp: number | null;
  lastIssuedAt: string | null;
}
```

`trend` 默认取净重 Top 5 物料；`topN` 可调。

### 6.6 供收方分析

`GET /analytics/parties?direction=inbound|outbound`

返回：

```ts
interface PartiesData {
  summary: {
    activeParties: number;
    totalNetMilliTonne: number;
    avgNetPerPartyMilliTonne: number | null;
    newParties: number;
    returningParties: number;
    dormantParties: number;
    coverageComplete: boolean;
    historyStart: string | null;
  };
  records: PartyRow[];
  ranking: PartyRow[];
  total: number;
  page: number;
  pageSize: number;
  freshness: Freshness;
}
```

`PartyRow`：

```ts
{
  partyCode: string;
  partyName: string;
  nature: string;
  direction: string;
  ticketCount: number;
  netMilliTonne: number;
  avgNetPerTicketMilliTonne: number | null;
  shareBp: number | null;
  firstIssuedAt: string | null;
  lastIssuedAt: string | null;
  avgIntervalSeconds: number | null;
  medianIntervalSeconds: number | null;
  activeMonths: number;
  monthlyNetCvBp: number | null;
  adjustedTickets: number;
  adjustmentNetMilliTonne: number;
  adjustmentWeightRateBp: number | null;
  adjustmentCoverageBp: number | null;
  voidTickets: number;
  voidRateBp: number | null;
}
```

`GET /analytics/parties/detail?direction=&partyCode=&from=&to=`

返回：

```ts
{
  party: PartyRow;
  trend: TrendSeries;
  materials: MaterialRow[];
  sites: Array<{ siteCode: string; siteName: string; tickets: number; netMilliTonne: number; shareBp: number | null }>;
  recentTickets: Array<{
    siteCode: string;
    ticketNo: string;
    issuedAt: string;
    plate: string;
    materialName: string;
    netMilliTonne: number;
    adjustmentMilliTonne: number;
  }>;
}
```

新增/回归：

- 计算“系统内首次”时，以云端最早有效单为历史起点。
- `coverageComplete=false` 时前端不显示“真新增”结论，只显示“系统内首次”及覆盖率提示。
- 回归需要前一等长周期；不足两个周期时返回 0 并标记 `coverageComplete=false`。

### 6.7 数据质量

`GET /analytics/quality`

返回：

```ts
interface QualityData {
  summary: {
    totalTickets: number;
    validTickets: number;
    voidTickets: number;
    voidRateBp: number | null;
    reopenedTickets: number;
    reopenRateBp: number | null;
    adjustedTickets: number;
    adjustmentTicketRateBp: number | null;
    adjustmentNetMilliTonne: number;
    adjustmentWeightRateBp: number | null;
    adjustmentCoverageBp: number | null;
    manualWeightTickets: number;
    manualWeightRateBp: number | null;
    correctionTickets: number;
    anomalyTickets: number;
  };
  voidAnalysis: {
    trend: TrendSeries;
    reasons: Array<{ reason: string; tickets: number; shareBp: number | null }>;
    bySite: Array<{ siteCode: string; siteName: string; tickets: number; voidTickets: number; voidRateBp: number | null }>;
    byParty: Array<{ partyCode: string; partyName: string; tickets: number; voidTickets: number; voidRateBp: number | null }>;
    byMaterial: Array<{ materialCode: string; materialName: string; tickets: number; voidTickets: number; voidRateBp: number | null }>;
  };
  reopenAnalysis: {
    trend: TrendSeries;
    chains: Array<{
      originalTicketNo: string;
      newTicketNo: string;
      siteCode: string;
      originalIssuedAt: string | null;
      originalVoidedAt: string | null;
      newIssuedAt: string | null;
      reopenLagSeconds: number | null;
      crossDay: boolean;
    }>;
    medianReopenLagSeconds: number | null;
  };
  adjustmentAnalysis: {
    byCategory: Array<{ category: string; categoryName: string; tickets: number; adjustmentNetMilliTonne: number; rateBp: number | null }>;
    byMaterial: MaterialRow[];
    byParty: PartyRow[];
    modes: Array<{ mode: string; tickets: number; shareBp: number | null }>;
    trend: TrendSeries;
  };
  correctionAnalysis: {
    tickets: number;
    grossCorrectionMilliTonne: number;
    tareCorrectionMilliTonne: number;
    bySite: Array<{ siteCode: string; siteName: string; tickets: number; grossCorrectionMilliTonne: number; tareCorrectionMilliTonne: number }>;
  };
  missingFields: Array<{ field: string; label: string; missingCount: number; missingRateBp: number | null }>;
  anomalies: Array<{
    ticketNo: string;
    siteCode: string;
    issuedAt: string;
    type: string;
    detail: string;
  }>;
  issuerStats: Array<{
    issuerName: string;
    tickets: number;
    voidTickets: number;
    voidRateBp: number | null;
    reopenedTickets: number;
    adjustedTickets: number;
    adjustmentTicketRateBp: number | null;
  }>;
  freshness: Freshness;
}
```

异常类型本期：

- `net_too_small`：净重 < 0.1 吨；
- `gross_not_positive` / `tare_not_positive`；
- `gross_le_tare`；
- `interval_negative`；
- `interval_over_24h`；
- `issued_lag_over_24h`；
- `void_latency_over_7d`；
- `duplicate_plate_same_day`（提示项，不必然是异常，需人工判断）；
- `missing_driver` / `missing_driver_phone` / `missing_contact`；
- `missing_adjustment_category`（有调整但无类别）；
- `legacy_adjustment_unknown`（旧协议无调整字段）；
- `orphan_material` / `orphan_party`（编码在主数据中不存在）。

阈值集中放在 Service 常量中，后续可配置；本期不做页面配置。

### 6.8 导出

| 接口 | 内容 |
|---|---|
| `/analytics/flow/export` | 周期汇总表：周期、入厂车次/净重、出厂车次/净重、净流入、平均单次、作废率 |
| `/analytics/materials/export` | 物料汇总：编码、名称、规格、分类、入厂/出厂、合计、平均、占比、扣量、扣量率、最后过磅 |
| `/analytics/parties/export` | 供收方汇总：方向、编码、名称、车次、净重、平均、占比、首末过磅、扣量率、作废率 |
| `/analytics/quality/export` | 质量明细：单号、厂区、出单时间、方向、物料、供收方、状态、作废原因、重开标识、调整、间隔、来源、出单人、异常类型 |

导出规则：

- 使用当前筛选条件，忽略分页。
- 最多 5 万行；超出返回 400，提示缩小日期范围。
- CSV 带 UTF-8 BOM，沿用现有客户对账导出方式。
- 文件名格式：`进出厂分析-{from}至{to}.csv`、`物料分析-...`、`供收方分析-...`、`数据质量-...`。
- CSV 保持纯表格，不写首行注释；数据截止时间由文件名和页面提示体现。质量明细额外包含 `dataThrough` 列。

### 6.9 后端实现位置

- 继续放在 `server/internal/weighbridge`，新增：
  - `analytics.go`：DTO、指标类型、helper；
  - `analytics_repository.go`：SQL 聚合；
  - `analytics_service.go`：周期计算、对比、导出编排；
  - `analytics_handler.go`：路由、参数校验、CSV；
  - 对应 `_test.go`。
- 在 `Store` 接口增加分析查询方法，由 `Repository` 实现；`Service` 提供对应方法，`analytics_service.go` 负责周期/对比编排。
- 在 `RegisterManagementRoutes` 中调用 `RegisterAnalyticsRoutes(authenticated, handler)`。
- 不新建微服务/独立模块；后续分析范围扩大再评估拆分。
- Swagger 注解与 DTO 同步；`swag init` 后提交生成文件。

## 7. 前端设计

### 7.1 依赖

- 新增 `echarts`（pnpm）；采用 `echarts/core` + 按需注册，避免全量包。
- 不引入第二套 UI/图标/HTTP 体系；图标继续 lucide-react。
- 不引入 `echarts-for-react`，用本地 `EChart` 包装组件控制生命周期和 ResizeObserver。

### 7.2 文件结构

```text
web/src/
├── components/charts/
│   ├── EChart.tsx
│   └── ChartCard.tsx
├── features/analytics/
│   ├── api.ts                 # 扩展类型和请求
│   ├── format.ts              # 复用并补充 bp/时长格式化
│   ├── filters.tsx            # 公共筛选条
│   └── metrics.tsx            # KPI 卡、指标说明
├── pages/analytics/
│   ├── OverviewPage.tsx
│   ├── FlowPage.tsx
│   ├── MaterialsPage.tsx
│   ├── PartiesPage.tsx
│   ├── QualityPage.tsx
│   ├── StatementPage.tsx      # 现有，保持
│   └── StatementDetailPage.tsx
└── ...
```

### 7.3 公共筛选

统一筛选条：

- 日期范围（RangePicker）+ 快捷：本月、上月、近 3 个月、本年、自定义。
- 厂区 Select。
- 方向 Segmented（总览/进出厂/物料/质量可“全部/入厂/出厂”；供收方必选一个）。
- 物料/分类 Select（可搜索）。
- 供收方 Select（可搜索；供收方页用关键词）。
- 对比开关（环比/同比/无）。
- 粒度 Select（自动/日/周/月/季/年；默认自动）。
- 重置。

状态同步：

- 复用 `useListUrlState`，把 `from`、`to`、`siteCode`、`direction`、`materialCode`、`categoryCode`、`partyCode`、`compare`、`granularity` 作为 filters。
- 页面首次进入时写入默认值（当前月、compare=previous、granularity=auto），避免 URL 空态。
- 切换筛选重置页码。

### 7.4 图表

`EChart.tsx` 要求：

- `useRef` 初始化；`option` 变化时 `setOption(option, { notMerge: true })`。
- `ResizeObserver` 监听容器，窗口/侧栏变化自适应。
- 卸载时 `dispose`。
- 支持 `height`、`loading`、`empty`；空数据不渲染空图，显示 `Empty`。
- 统一色板与 Ant Design token 对齐；入厂/出厂固定色，避免每个页面不一致。
- 图表 tooltip 使用中文单位（吨/车/百分比）。

本期图表类型：

- 折线/柱状：趋势、对比。
- 堆叠柱：入厂/出厂结构。
- 饼/环：分类占比、作废原因。
- 横向条形：Top 供收方/物料。
- 表格：所有明细/汇总，保留 Ant Design Table/DataTable。

### 7.5 页面规格

#### 7.5.1 经营总览

- 筛选：日期、厂区、对比；不做方向筛选（总览同时展示入厂/出厂）。
- KPI 6 个：有效车次、入厂净重、出厂净重、过磅净流入、活跃供收方、扣量率。
- 次级 KPI：作废率、调整覆盖率、平均单次、数据截止。
- 趋势图：入厂/出厂净重双线 + 净流入柱；支持日/周/月/季/年。
- 结构图：物料分类环图。
- Top 图：Top 5 供货方 + Top 5 收货方横向条形。
- 异常提示：列表/卡片，点击跳数据质量。
- 数据新鲜度：页脚展示数据截止、最近接收、历史起点。
- 下钻：KPI/图表点击跳对应页面并带筛选。

#### 7.5.2 进出厂分析

- 筛选：日期、厂区、物料、分类、对比、粒度。
- KPI：入厂车次/净重、出厂车次/净重、过磅净流入、平均单次、扣量率、作废率。
- 趋势：入厂/出厂净重与车次；对比期虚线/浅色。
- 汇总表：周期、入厂车次、入厂净重、出厂车次、出厂净重、净流入、平均单次、作废率。
- 厂区对比：表格/分组柱。
- 时长面板：样本数、中位数、P90、最大、隔日完成单/占比、剔除重开单数；附口径说明。
- 下钻：行点击跳 `/weighbridge/tickets`，带 `from/to/siteCode/direction/materialCode`。
- 导出：周期汇总 CSV。

#### 7.5.3 物料分析

- 筛选：日期、厂区、方向、分类、物料关键词。
- KPI：物料数、入厂净重、出厂净重、扣量合计、扣量率、最后过磅时间。
- 汇总表：物料、规格、分类、入厂车次/净重、出厂车次/净重、合计净重、平均单次、占比、扣量、扣量率、最后过磅。
- 趋势：Top 5 物料净重折线。
- 结构：分类环图 + 物料横向条形/矩形树图。
- 扣量榜：按扣量率/扣量重量排序 Top 10。
- 下钻：物料行跳单据列表，带 `materialCode/from/to/siteCode/direction`。
- 导出：物料汇总 CSV。

#### 7.5.4 供收方分析

- 方向 Tab：入厂供货方 / 出厂客户。
- 筛选：日期、厂区、物料、关键词；方向由 Tab 决定，不再使用方向下拉。
- KPI：活跃供收方、累计供货/提货量、户均量、企业/个人数量、新增/回归、数据覆盖。
- 全量排名图：展示当前方向全部供收方，不再限制 Top 10；图表支持缩放/滚动。
- 汇总表：排名、供收方、企业/个人、频次、累计量、平均单次、占比、供货间隔/提货周期、活跃月数、月度波动 CV、平均扣重率、调整车次、作废率、最后过磅。
- 取消集中度：不展示 CR3/CR5/CR10、HHI、Pareto，后端响应也移除相关字段。
- 详情抽屉：展示趋势、主要物料、厂区分布、最近 5 张单据、平均扣重率、间隔和月度波动。
- 导出：供收方汇总 CSV。
- 新增/回归：`coverageComplete=false` 时只展示“系统内首次”，并提示历史覆盖不足。

#### 7.5.5 数据质量

- 筛选：日期、厂区、物料、供收方、出单人（可选）。
- KPI：总单、作废单/率、重开单/率、调整单/率、调整覆盖率、手工来源率、异常单数。
- 作废分析：趋势、原因环图、按厂区/供收方/物料表。
- 重开分析：趋势、重开链表格、重开间隔中位数、跨日重开。
- 扣量分析：按类别/物料/供收方、方式分布、覆盖率提示。
- 毛皮重修正：单数、修正量、按厂区表。
- 缺失字段：字段、缺失数、缺失率。
- 异常清单：类型、单号、厂区、时间、详情；点击跳单据详情/列表。
- 出单人：出单量、作废率、重开率、调整率。
- 同步新鲜度：各厂区最后接收时间、接收延迟、旧协议覆盖。
- 导出：质量明细 CSV。

#### 7.5.6 客户对账

- 保持现有 `StatementPage`、`StatementDetailPage`、API、默认月份、方向、导出不变。
- 仅菜单父级和排序调整；不接入新分析筛选。
- 现有详情页继续从客户对账列表进入。

### 7.6 下钻

- 统一跳转 `/weighbridge/tickets`，使用现有查询参数：
  `siteCode`、`direction`、`status`、`from`、`to`、`materialCode`、`partyCode`、`keyword`。
- 本期分析页下钻只使用上述已支持参数。
- 若后续要按 `issuerName`、`grossSource/tareSource`、`adjustmentCategory` 下钻，再扩展 `TicketQuery` 和过磅单查询页筛选；本期不做。
- 供收方详情抽屉内的“查看全部单据”跳单据列表，带 `partyCode/direction/from/to`。

### 7.7 加载、空态、错误与新鲜度

- 每个页面必须有 loading、error、empty 三种状态。
- 空态区分：
  - 当前筛选无数据；
  - 数据尚未同步（最近接收时间过旧）；
  - 历史不足（同比/新增回归）。
- 错误使用后端 `message`，提供“重试”。
- 页面顶部或底部展示：
  - 数据截止：`dataThrough`
  - 最近接收：`lastReceivedAt`
  - 历史起点：`historyStart`
  - 提示“统计结果会随厂端补传变化”。

### 7.8 刷新与缓存

- TanStack Query：`staleTime=60s`，`refetchInterval=5min`（页面可见时）。
- 手动刷新按钮。
- 切换筛选/分页立即请求；不保留旧页面数据造成误读（可 `placeholderData` 但需标注）。
- 不做 WebSocket/SSE 实时推送。

## 8. 测试与验收

### 8.1 后端

- 单元测试：
  - 毫吨/比率/时长换算；
  - 周期边界（北京时间、周一开始、季度、闰年）；
  - 对比窗口（等长、同比）；
  - 调整未知/为 0/正/负；
  - 重开单剔除时长；
  - 净流入负数；
  - 作废率分母；
  - 新增/回归覆盖不足。
- PostgreSQL 集成测试：
  - 固定 fixture 覆盖有效/作废/重开/旧协议/跨日/负间隔/缺字段；
  - 校验每个接口汇总与手写 SQL 一致；
  - 校验导出 CSV 行数/表头/BOM；
  - 校验分页/排序/筛选。
- 性能测试：
  - 100 万行 fixture，P95 < 1s；
  - 导出 5 万行 < 5s。

### 8.2 前端

- 组件测试：
  - 筛选写入 URL、切换重置页码；
  - KPI/表格/图表空态；
  - 错误提示与重试；
  - 导出按钮调用参数正确；
  - 下钻 URL 参数正确；
  - 数据新鲜度展示。
- 页面测试：
  - 5 个页面路由可达；
  - 菜单只有 ADMIN 可见；
  - 客户对账回归不变。

### 8.3 验收清单

- [ ] 6 个二级菜单顺序、图标、权限码正确。
- [ ] 5 个新页面可打开，客户对账不受影响。
- [ ] 所有流量指标排除作废单，重开只计新单。
- [ ] 日期按北京时间归期；周边界为周一。
- [ ] 过磅净流入按物料/分类展示，总额允许负数。
- [ ] 扣量率排除旧协议未知单，并显示覆盖率。
- [ ] 时长统计剔除重开单，隔日完成单按北京日期。
- [ ] 同比/新增/回归在历史不足时显示“数据积累中”。
- [ ] 导出为当前筛选全部行，上限 5 万行，CSV 带 BOM。
- [ ] 数据截止/最近接收时间可见。
- [ ] 所有查询在目标数据量下满足性能目标。
- [ ] 无新增角色；新菜单先授权给 ADMIN。
- [ ] `task backend:check`、`task frontend:lint`、`task frontend:build` 通过。

## 9. 实施顺序

建议按以下工作包推进，每个工作包独立验证：

1. **数据层**：迁移、派生列、回填、写入路径、索引、单元/集成测试。
2. **后端公共层**：通用查询参数、周期/对比 helper、CSV helper、Swagger。
3. **经营总览 API + 页面**：先打通最短链路，验证图表/筛选/新鲜度。
4. **进出厂分析 API + 页面**：复用总览组件，验证周期表/对比/时长。
5. **物料分析 API + 页面**：验证分页、分类 join、扣量。
6. **供收方分析 API + 页面**：验证方向、集中度、详情抽屉。
7. **数据质量 API + 页面**：验证作废/重开/调整/异常/出单人。
8. **导出**：4 个 CSV 接口 + 前端下载。
9. **菜单/路由**：种子、图标、路由、ADMIN 授权。
10. **回归与性能**：客户对账回归、100 万行基准、验收清单。

依赖关系：

- 工作包 1 是所有查询的前提。
- 工作包 2 是 3–8 的前提。
- 工作包 3 的图表/筛选组件可被 4–7 复用。
- 菜单/路由可在页面开发中先行，便于联调；最终以种子为准。

## 10. 风险与假设

| 风险/假设 | 影响 | 处理 |
|---|---|---|
| 旧协议 7 张单缺调整字段 | 扣量率被低估 | 标记未知、显示覆盖率、不并入分母 |
| 重开单继承原单确认时间 | 时长/隔日被拉高 | 剔除重开单，质量页单独列示 |
| 同步延迟/补传 | 页面数字会变化 | 展示数据截止/最近接收，提示非实时 |
| 历史不足 | 同比/新增/回归不可用 | 空态 + “数据积累中”，满 12 个月再启用 |
| 主数据分类/角色变更 | 回看分类/角色与历史不一致 | 页面注明“按当前主数据”；名称用快照 |
| 数据量增长 | 查询变慢 | 派生列+索引；超过 500 万行再评估日聚合表 |
| ECharts 体积 | 首屏变慢 | 按需注册、懒加载页面、代码分割 |
| 无角色权限 | 所有 ADMIN 可见全部菜单 | 本期接受；后续加角色/菜单授权 |
| 接口无 permissionCode 校验 | 登录用户可访问 | 沿用现状；后续随角色体系补充 |
| 导出大结果集 | 内存/响应时间 | 5 万行上限；后续可改流式/异步 |
| 车牌/司机自由文本 | 车辆/司机分析不可靠 | 本期不做深度车辆/司机分析 |

## 11. 后续可扩展（不在本期）

- 车辆/司机/承运商分析（需同步承运商、车牌规范化）。
- 化验指标与扣量相关性（需化验数据）。
- 库存/金额/合同/结算（需新业务模块）。
- 待二次过磅/在厂车辆/排队（需同步本地任务状态）。
- 日聚合表、异步导出、Excel。
- 角色权限、厂区数据范围、接口级授权。
- 贡献度归因、Pareto/ABC、供收方留存 cohort、季节性、预测。

## 12. 物料分析扩展（2026-11-05 实现）

### 12.1 物料净重趋势

物料分析页的“物料净重趋势”改为展示当前筛选下的**全部物料**，不再按 Top N 截取；标题同步改为“物料净重趋势（全部物料）”。物料较多时图例使用可滚动图例。

### 12.2 核心原料扣量稳定性

范围：物料分类 `C-C-0001`（酿酒原料）和 `C-C-0002`（酿酒辅料）的入厂有效单。

口径：

- 每车扣量率 = `net_adjustment_milli_tonne / pre_adjustment_net_milli_tonne`，其中扣前净重为最终毛重减最终皮重。
- 样本：`adjustment_known=true` 且扣前净重大于 0 的有效单；旧协议未知调整单不进入样本。
- 按供应商汇总：样本车次、总车次、调整车次、调整覆盖率、加权扣量率、平均/中位数/P90/标准差/CV/最小/最大扣量率、物料种类、首次/最后过磅时间。
- 趋势：按样本车次 Top 5 供应商展示周期平均扣量率。
- “个人/企业”来自当前 `wb_cloud_party.nature`，不是单据快照。

接口：`GET /api/v1/weighbridge/analytics/materials/supplier-quality`

### 12.3 副产品出库流向

范围：物料分类 `C-C-0005`（副产品，当前为酒糟等）的出厂有效单。

统计：

- 按客户/个人汇总车次、出库净重、平均单车、占比、首次/最后采购时间、涉及物料。
- 活跃客户数、CR3/CR5/CR10、HHI、第一大客户占比。
- 按物料拆分、按月出库趋势、Top 客户出库量。
- “核心客户”按采购量/频次识别；当前没有价格/金额字段，不能表达利润贡献或低价损失。

接口：`GET /api/v1/weighbridge/analytics/materials/byproduct-flow`

## 13. 供收方分析扩展（2026-11-05 实现）

### 13.1 页面结构

供收方分析改为两个方向 Tab：

- 入厂供货方
- 出厂客户

方向不再使用筛选条下拉；列表以全量可排序表格为主，图表展示当前方向全部供收方，不再限制 Top 10。集中度相关字段和图表已移除。

### 13.2 供应商/客户维度

`PartyRow` 新增：

- `nature`：企业/个人，来自当前 `wb_cloud_party.nature`。
- `avgIntervalSeconds` / `medianIntervalSeconds`：同一供收方相邻两次有效过磅的平均/中位间隔。
- `activeMonths`：有有效单据的月份数。
- `monthlyNetCvBp`：月度净重变异系数，反映采购/供货波动。

列表可按累计量、频次、平均单次、间隔、月度波动、作废率、最后过磅排序；“排名”按累计净重排名。供应商/客户绩效采用多维度展示，不生成不透明的综合分。

### 13.3 承运商

当前厂云同步契约不上送承运商编码/名称，云端过磅单快照没有承运商字段，因此本期不做承运商 Tab。后续如启用，需扩展同步字段并处理历史数据补传。
