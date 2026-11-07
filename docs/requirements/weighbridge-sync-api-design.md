# 厂云同步接口设计草案

本文件描述现行厂区编码归属协议（版本 3，兼容版本 2），并记录摘要同步与对账协议（schemaVersion 4、schemaVersion 5）的云端接口设计。厂端已实现版本 3、v4 与 v5；云端接收端源码已兼容版本 2、3、v4 和 v5；实际部署版本、真实业务库连接、双端真实联调及现场验收状态须另行核实，不能据此视为已上线。新方案目标以[厂云同步契约](cloud-sync-contract.md)为准；新方案不要求兼容或迁移现有单据协议。现行版本 3 部分描述当前实现，v4 与 v5 部分为云端源码实现，已有 Go 单元测试、隔离 PostgreSQL 集成测试和 v5 HTTP 路由联调测试，尚未部署或与厂端真实联调。仅描述本次过磅同步，不定义整个平台资料模型。

## 通用约定

- 云端业务 API 使用 `/api/v1` 与 `{code,message,data}` 响应。厂端不使用凭据，资料请求及单据变化均携带厂区编码，云端以该编码查找启用厂区并决定数据归属；编码不是来源认证。云端不登记或校验地磅编码，厂端内部主键不进入协议。
- 各接口采用版本化的消息结构，未知结果重试采用相同变化标识和相同内容。成功必须代表云端事务已提交；业务失败、认证失败、依赖未满足和临时故障不得误判为成功。错误码及客户端分类见接口说明。
- 重量使用十进制吨数字符串，最多三位小数；运算转换为整数千分吨，不使用二进制浮点。带符号差额为原始值减最终值。时间传输包含时区，出单日期和统计按北京时间；历史缺失值保留空值，不由当前资料补写。

## 完整资料集

本地 Server 请求完整资料，返回分类、物料、主体及联系人，含稳定编码、状态、业务字段和关联。返回须来自同一数据库一致快照；第一版可一次响应完整资料，避免分页期间混合版本。数据规模超过接口限制时再设计带固定快照的分页；不能静默截断。本地完整校验并在单个事务中生效，失败保留上一版。

字段按本地业务规格整理：分类编码、名称、状态；物料编码、名称、分类编码、规格、状态、备注；主体编码、名称、简称、企业或个人、多项业务身份、电话、地址、信用代码、备注、状态；联系人稳定标识、姓名、电话、用途、备注、默认标志及所属主体。联系人稳定标识由云端生成并在更新时保持。分类编码及资料编码是跨系统标识，不依赖双方内部数字主键。

## 单据变化

变化类型为出单、作废和重开。公共信息包括稳定变化标识、厂区编码、单号及变化类型；重开还包含原单号。出单和重开携带票面标题、车牌、方向、物料编码名称规格、供收方编码名称、两次确认时间、出单人和时间、原始毛皮净重、最终毛皮净重、调整前后值与差额、来源、备注、调整人和时间、司机与联系人姓名电话；以本地实际快照及有效规格逐项映射。作废携带原因、操作人及时间，不覆盖原单快照。照片、承运方单据快照、被替代称重记录及打印信息不进入载荷。

云端保存变化标识及请求内容的校验值，同一厂同一标识同内容重复返回原结果；同标识不同内容拒绝。单据与去重结果同事务提交。云端只允许合法状态推进，原单未创建或未作废时不能接收关联重开；依赖尚未满足应可在前序成功后重试。厂端保证同单据变化顺序且先确认原单创建和作废，再上传新单。

## 实施前核对

基础资料与单据字段已对照当前双方实现；字段空值与快照映射见共享契约。不得将重新生成的事件标识当作同一次重试，也不得把恢复备份导致流水号倒退的处理视为已决定。

## 接口（版本 3，兼容版本 2）

- `GET /api/v1/weighbridge/sync/master?siteCode=F001`：不传凭据。云端验证厂区编码存在且启用，返回 `schemaVersion=2`、`siteCode` 及 `categories`、`materials`、`parties` 数组；`siteCode` 回显已核对的请求编码，厂端须检查其与请求时编码一致。身份与资料来自同一一致快照。无需 `scaleCodes`。资料协议不随单据版本变化，仍为版本 2。
### 完整资料 JSON 字段（版本 2）

响应使用 `{ "code": 200, "message": "...", "data": { ... } }`；厂端同时检查 HTTP 状态及业务码。所有集合（包括空资料集和主体的空联系人）都是数组，不是 null。编码在各自类型内唯一，资料以编码关联，不使用内部数据库主键：

- `categories`：`code`、`name` 为字符串，`enabled` 为布尔值。
- `materials`：`code`、`name`、`spec`、`remark` 为字符串，`categoryCode` 是分类编码字符串或 null，`enabled` 为布尔值。非空分类编码必须存在于同一快照，包括停用分类。
- `parties`：`code`、`name`、`shortName`、`nature`、`phone`、`address`、`creditCode`、`remark` 为字符串；`nature` 为 `enterprise` 或 `individual`；`isSupplier`、`isCustomer`、`isCarrier`、`enabled` 为布尔值，至少一种业务身份为真。
- `contacts`：`id` 为云端生成的正整数稳定标识，在主体更新时保持；`name`、`phone`、`purpose`、`remark` 为字符串，`isDefault` 为布尔值。有联系人时恰有一个默认联系人，无联系人时为空数组。联系人归属由所在主体表达。

名称必填，其他可选文本使用空字符串；编码和联系人标识不得重复。停用资料仍在完整资料集中，厂端不得因停用而删除历史引用。未知 `schemaVersion`、不完整响应、身份不符或校验失败必须整体拒绝并保留上一版；厂区编码不存在或停用时返回业务错误，不能应用资料。厂区和地磅编码可维护，历史单据快照保留原值。

```json
{"code":200,"message":"success","data":{"schemaVersion":2,"siteCode":"F001","categories":[{"code":"C-C-0001","name":"谷物","enabled":true}],"materials":[{"code":"C-M-0001","name":"高粱","categoryCode":"C-C-0001","spec":"","remark":"","enabled":true}],"parties":[{"code":"C-P-0001","name":"供货方","shortName":"","nature":"enterprise","isSupplier":true,"isCustomer":false,"isCarrier":false,"phone":"","address":"","creditCode":"","remark":"","enabled":true,"contacts":[{"id":1,"name":"联系人","phone":"","purpose":"","remark":"","isDefault":true}]}]}}
```

资料同步以编码关联，联系人 `id` 为云端稳定标识。本地整体校验并在单个事务中生效；首次快照允许为空，但已有总部分类、物料或主体在后续快照中消失时整次同步失败，联系人可移除。隔离双端联调已执行；长期断网和现场验收仍待完成。

### 单据变化接口（版本 3，兼容版本 2）
- `POST /api/v1/weighbridge/sync/changes`：不传凭据。请求包含 `schemaVersion`（厂端新变化为 `3`，历史重试可能仍为 `2`）、`changeId`、`siteCode`、`ticketNo`、`type`（`issue`、`void`、`reopen`）。`siteCode` 是该单据出单时的厂区编码；云端按此编码验证并归属。地磅编码不参与协议或云端校验。
- 出单和重开携带 `ticket`，作废携带 `void` 的 `reason`、`actor`、`at`。重开还携带 `previousSiteCode` 和 `ticket.previousTicketNo`，以原单的出单厂区编码及原单号定位原单，即使新旧编码不同。原单必须已作废，不能重复重开；新单按新单的 `siteCode` 归属。厂端必须先获得原单出单和作废确认，再发送重开。
- 版本 2 的 `ticket` 字段与既有约定一致。版本 3 在此基础上新增 `finalNet`、`netAdjustment`、`netAdjustmentMode`、`netAdjustmentRateBp`、`netAdjustmentCategory`、`netAdjustmentCategoryName`，并在重开时新增 `previousFinalNet`、`previousNetAdjustment`；其余字段保持版本 2 的空值和映射规则。`netAdjustment` 为有符号调整量，正数扣减、负数上调；`netAdjustmentMode` 为 `amount` 或 `percent`，`netAdjustmentRateBp` 仅比例模式非空（0.01% 单位）；非零调整须携带类别。接收方以 `finalNet` 为准，并用 `finalGross − finalTare − netAdjustment` 复核；版本 3 的重开须同时校验上版最终净重和上版净重调整。
- 版本 3 的 `ticketNo` 须与变化头一致；重量为十进制吨字符串，最终净重须大于 0 且小于最终毛重。版本 2 的净重仍由最终毛重减最终皮重计算；版本 2 请求不得携带版本 3 字段，避免同一变化在两种口径间漂移。
- 厂端待发送变化固定原始载荷及变化标识；未知结果重试不改内容。云端以厂区编码与变化标识去重，相同内容返回原确认，不同内容或相同厂区单号冲突返回 409，不覆盖。未登记或停用的编码、前序缺失及临时故障应明确返回失败，不能误判成功。
- 互换编码只影响后续按该编码上送的单据，不移动已接收数据；云端改码时旧编码不再接受请求，历史关联保留，待上传旧编码须先处理。两端须覆盖改码、互换、重开跨编码、冲突及重试的契约测试。

云端兼容版本 2 和 3；本次不迁移旧数据库。请求编码不存在或停用返回 HTTP 401；参数、未知字段或协议版本错误返回 400；重复标识内容不同、单号冲突或前序状态不满足返回 409。云端不验证物理来源。

## 云端厂区管理与改码边界

管理端使用 `GET/POST /api/v1/weighbridge/sites` 和 `PUT /api/v1/weighbridge/sites/{code}`，创建和修改载荷仅包含 `code`、`name`。已接收单据保留出单编码，按当前厂区编码查询仍可找到；历史编码保留给原厂，可改回但不能分配给其他厂。改码后旧编码的资料和变化请求均被拒绝，待上传旧编码变化应在改码前完成同步，或另行制定明确的数据处理方案。历史原单可用 `previousSiteCode` 和 `previousTicketNo` 定位，重开的新单按新编码归属。

云端 seed `00010_weighbridge_master_data.sql` 初始化分类、物料、主体和联系人，并推进各类编码流水；厂端 seed 00018 仅保留版本占位。已有开发库如有编码冲突，可重建隔离开发数据库后重新迁移；云端此 seed 不支持直接回滚，需恢复备份。厂端启用同步并手动完成首次同步后使用云端资料。

## 多项净重调整协议（schemaVersion 5 / digestVersion 3）

> 状态：云端接收端源码已实现 v5 接收、保存、展示与按合计统计，保留 v4 接收和历史确认，并新增 v5 路由；已有 Go 单元测试、隔离 PostgreSQL 仓储集成测试和 v5 HTTP 路由联调测试覆盖。尚未部署、未连接真实业务库，未完成与厂端的真实联调，未验收。厂端已实现 v5 并完成隔离测试；真实联调同样未完成。以下协议不能视为已上线。

v5 复用 v4 的事务、去重、回执、前序等待、作废／重开关联校验和错误分类。`digest` 全局唯一，同一厂区、单号、变化类型构成唯一位次；v5 与 v4 共用 `wb_cloud_ticket_change` 和 `wb_cloud_ticket.latest_digest / latest_change_type / latest_received_at`，不新增或改写数据库结构。比例项基数已确认为最终毛重减最终皮重。

### 接口

- `POST /api/v1/weighbridge/sync/v5/changes`：上传出单、作废或重开变化；成功响应与 v4 相同，`data` 包含 `digest`、`ticketNo`、`changeType`、`receivedAt`、`duplicate`。
- `GET /api/v1/weighbridge/sync/v5/changes?siteCode=F001&digest=<64 位摘要>`：按厂区编码和摘要查询历史确认，返回 `found` 和 `confirmation`；用于回执丢失后的只读确认。
- `GET /api/v1/weighbridge/sync/v5/tickets?siteCode=F001&ticketNo=T1`：单张对账，返回 `found`、`status`、完整 `ticket` 快照（含按序 `netAdjustments`）、作废信息、最新摘要及历史变化；字段与 v4 单张对账一致。
- `POST /api/v1/weighbridge/sync/v5/reconcile`：批量对账，请求 `{"items":[{"siteCode":"F001","ticketNo":"T1"}]}`，每批 1 至 200 条，按请求顺序返回摘要和状态；字段与 v4 批量对账一致。

请求体上限沿用 v4 的 1 MiB，超出返回 HTTP 413 并按数据错误处理。

### 变化请求

```json
{
  "schemaVersion": 5,
  "digestVersion": 3,
  "digest": "<64 位小写十六进制>",
  "siteCode": "F001",
  "ticketNo": "F001-20261107-0002",
  "type": "issue",
  "ticket": {
    "ticketNo": "F001-20261107-0002",
    "...": "其余业务字段与 v4 ticket 相同",
    "finalNet": "19.3",
    "netAdjustment": "0.7",
    "netAdjustments": [
      {"mode": "percent", "amount": "0.2", "rateBp": 100, "category": "WATER", "categoryName": "水分大", "remark": "水分大"},
      {"mode": "amount", "amount": "0.5", "rateBp": null, "category": "IMPURITY", "categoryName": "杂质多", "remark": ""}
    ]
  }
}
```

- `type` 为 `issue`、`void` 或 `reopen`；出单、作废和重开均携带完整 `ticket` 快照，作废额外携带 `void`（`reason`、`actor`、`at`）。
- 重开及带原单的作废携带 `previousSiteCode`，并在 `ticket.previousTicketNo` 中携带原单号；原单须已作废且不能被重复重开。
- `ticket` 保留 `netAdjustment`（各项有符号折算吨数合计）与 `finalNet`，并携带必填数组 `netAdjustments`。每项含 `mode`（`amount`／`percent`）、`amount`（有符号吨字符串，正数扣减、负数上调）、`rateBp`（比例项整数，0.01% 单位，范围 −10000 至 10000；按吨项为 `null`）、`category`、`categoryName`、`remark`。
- 空数组表示无调整；缺失数组或 `null` 不合法，不能当作无调整。非零项 `category` 必填，`categoryName` 为出单时快照。
- v5 不再使用 v4 的 `netAdjustmentMode`、`netAdjustmentRateBp`、`netAdjustmentCategory`、`netAdjustmentCategoryName` 描述整单；厂端载荷中这些字段为空值，云端不据此解释整单（接收校验要求其为空）。`adjustmentRemark` 沿用 v4 毛皮更正备注语义，单项备注放在明细中。

### 响应

- `POST /v5/changes` 成功返回 `{code:200,message,data}`，`data` 为 `digest`、`ticketNo`、`changeType`、`receivedAt`、`duplicate`；重复摘要返回原确认，`receivedAt` 为原接收时间。
- `GET /v5/changes` 返回 `found`；找到时为 `confirmation`（含 `digest`、`ticketNo`、`changeType`、`digestVersion`、`schemaVersion`、`receivedAt`），未找到时为 `null`。
- `GET /v5/tickets` 返回与 v4 单张对账相同的字段；`ticket` 快照按原数组顺序包含 `netAdjustments`，v4 快照保持原字段形状。
- `POST /v5/reconcile` 返回与 v4 批量对账相同的逐项字段；不返回 `changes` 历史，需要历史确认时使用单张对账或摘要查询。
- 业务失败返回 `{code,message,data}`，`data` 包含机器可读分类；厂端必须读取 `category`，不能只根据 HTTP 状态推断结果。

### 校验

- 逐项校验 `mode` 与 `amount`、`rateBp` 的一致性：按吨项 `rateBp` 必须为 `null`，比例项 `rateBp` 必须非空且在范围内。
- 比例项 `amount` 必须等于 `round((finalGross − finalTare) × rateBp ÷ 10000)`，每项独立四舍五入到 0.001 吨（half away from zero）。
- 各项 `amount` 之和必须等于 `netAdjustment`；`finalNet` 必须等于 `finalGross − finalTare − netAdjustment`，且满足既有最终净重大于 0、小于最终毛重的约束。
- 新出单和更正重开均由厂端校验只允许扣减；云端接收仍兼容原协议允许的历史上调重开和已入队变化，因为新旧报文无法可靠区分。
- 非零项 `category` 必填；原始和最终毛皮重、上版重量及重开关联的校验沿用 v4。
- 校验失败返回 HTTP 400 `config_or_data / invalid_request`。云端保存厂端上传的 `digest`，不重新计算摘要，也不另存完整载荷用于逐字段去重。

### 去重、状态约束与错误分类

去重顺序与状态约束沿用 v4：

1. `siteCode` 必须是当前启用厂区编码，否则按配置/数据错误拒绝；旧编码不能写入新变化。
2. 同一 `digest` 已存在且厂区、单号、变化类型一致：返回原确认（`duplicate=true`，`receivedAt` 为原接收时间），不重复执行业务。
3. 同一 `(siteCode, ticketNo, type)` 已存在但摘要不同：返回内容冲突，不覆盖。
4. 状态约束：`issue` 要求新单不存在；`void` 要求原单存在且为 `valid`；`reopen` 要求新单不存在、原单厂区编码为已知历史编码、原单存在且已作废、原单未被重开。

失败响应继续使用 `{code,message,data}`，`data` 包含机器可读分类：

| `category` | HTTP | `retryable` | 含义 | 厂端处理 |
| --- | --- | --- | --- | --- |
| `temporary` | 503 | true | 云端暂时不可用或事务未完成，结果未知 | 按退避重试原变化；不生成新摘要 |
| `predecessor_pending` | 409 | true | 出单或作废前序尚未获得确认 | 等待前序确认后重试；不跳过前序 |
| `config_or_data` | 400 | false | 厂区编码不存在/停用、协议或字段不符合约定 | 提示管理员处理；不自动循环重试 |
| `conflict` | 409 | false | 摘要、单号或状态冲突，不能覆盖 | 暂停该单据及依赖它的重开；其他单据继续 |

v5 的 `digestVersion=3` 与 v4 的 `digestVersion=2` 不可直接比较；同一 `(siteCode, ticketNo, type)` 位次在 v4/v5 间共用，按位次与摘要判定重复或冲突。

### 摘要规则版本 3

摘要输入为以下字节串的 SHA-256，输出 64 位小写十六进制。

1. 固定前缀 `wb-change-digest\n`（UTF-8）。
2. 按固定顺序写入字段。每个字段编码为：字段名 ASCII 字节 + `:` + 值 UTF-8 字节长度（十进制） + `:` + 值 UTF-8 字节 + `\n`；空值编码为字段名 + `:null\n`。

固定字段顺序：

```text
rulesVersion
siteCode
ticketNo
changeType
previousSiteCode
previousTicketNo
ticket.title ... ticket.netAdjustment（与版本 2 相同的字段顺序）
netAdjustmentsCount
netAdjustments.<i>.mode
netAdjustments.<i>.amount
netAdjustments.<i>.rateBp
netAdjustments.<i>.category
netAdjustments.<i>.categoryName
netAdjustments.<i>.remark
previousFinalGross
previousFinalTare
previousFinalNet
previousNetAdjustment
grossSource
tareSource
adjustmentRemark
adjustedBy
adjustedAt
driver
driverPhone
contactName
contactPhone
voidReason（仅作废）
voidActor（仅作废）
voidAt（仅作废）
```

- `rulesVersion` 为十进制 `3`；`previousSiteCode` 和 `previousTicketNo` 无原单时写 `null`。
- `ticket` 字段顺序与版本 2 相同，仍包含 `netAdjustment` 与 `finalNet`，但不再写入 v4 的四个单据级单项字段。
- `netAdjustmentsCount` 后按数组顺序逐项写入六个字段；`amount` 规范化为三位小数字符串，按吨项 `rateBp` 写 `null`。顺序参与摘要，同一合计但明细或顺序不同视为不同变化。
- 重量、时间和可空字段的规范化沿用版本 2：重量统一为三位小数，时间转换为 UTC 并截断到毫秒。
- 作废保留该版快照，因此上述明细进入作废摘要；上版净重调整仍只写合计 `previousNetAdjustment`。

### 固定测试向量

厂端向量文件为 `server/internal/weighing/testdata/digest_v3_vectors.json`；云端复制为 `server/internal/weighbridge/testdata/digest_v3_vectors.json`，两份文件逐字节一致。参考实现为 `server/internal/weighbridge/digest.go` 的 `CanonicalChangeDigestV3`，只用于文档、向量和测试，接收路径不调用。

| 向量 | 用途 | expectedDigest |
| --- | --- | --- |
| `issue-basic` | 最小 v5 出单；`netAdjustments` 为空数组 | `bb2b2bae029babdf632c54f2a45c5ab42f650366689a138c9d19ccec6a74f789` |
| `issue-multi-items` | 比例扣水分 + 按吨扣杂质；合计与明细均参与摘要 | `fd1b85bcf8081a638ae887d94e7d8f34674038b75cd448579fb9ac64e0fd7f65` |

两个向量均为自洽报文：明细合计等于 `netAdjustment`，`finalNet` 等于 `finalGross − finalTare − netAdjustment`，比例项折算与 `rateBp` 一致。`expectedDigest` 直接按文件字面载荷计算，厂端生产函数 `computeChangeDigestV5` 与云端 `CanonicalChangeDigestV3` 结果一致。

### 存储、展示与统计

- 使用现有 `wb_cloud_ticket.snapshot` 保存完整 v5 `ticket`（含明细及顺序），不新增或改写数据库结构；旧 v4 快照保持原样并可查询。
- 单据详情展示各项调整；总体查询、汇总和供应商统计继续使用合计与最终净重。
- 按类别、方式报表将含多项调整的单据归为“多项调整”（内部 `mode`／`category` 编码为 `multi`，展示名“多项调整”），重量使用该单调整合计，不拆分类别统计；单调整项按该项归类。
- 历史 v4 单项按原字段展示为一项，无调整展示为空；更老协议继续标记未知。

### 兼容与边界

- v4 接口与摘要规则保持原样，v5 作为新协议并行存在；不迁移 v2/v3/v4 历史数据。
- 厂端已入队的旧变化保留原协议、载荷及摘要并按原版本重试；新单据及新变化按 v5 上传，不降级为丢失明细的旧载荷。
- 更新后操作人员不再对旧单执行作废或重开；旧云端单据仍可查询，历史快照不改写。不存在需要上传的 v4 待处理变化。
- 云端继续保存厂端摘要而不独立重算；摘要一致不表示云端已独立校验业务内容。v4 与 v5 摘要版本不同时不得直接判为内容冲突。

## 新协议：摘要同步与对账（schemaVersion 4）

> 状态：云端接收、确认与对账查询已在源码实现，并通过隔离 PostgreSQL 测试；厂端已实现并完成隔离双端测试；实际部署、长期断网运行及现场验收应按两端当前交付记录核实。新协议与版本 2/3 单据协议并行存在，不要求兼容或迁移旧单据；既有 v2/v3 接口、迁移和数据保留，不能据此推定双端已完成或已部署。厂端四项发布内容见 [v4 厂端对接发布包](weighbridge-sync-v4-factory-release.md)。

新协议使用厂端计算的 SHA-256 摘要作为变化标识和对账依据，不再使用随机 `changeId`。云端保存厂端上传的摘要，不重新计算，也不保存完整变化载荷用于逐字段去重。新协议接口位于 `/api/v1/weighbridge/sync/v4/...`，不复用版本 2/3 的 `/sync/changes` 请求结构。

### 变化请求

```json
{
  "schemaVersion": 4,
  "digestVersion": 2,
  "digest": "<64 位小写十六进制>",
  "siteCode": "F001",
  "ticketNo": "F001-20261031-0001",
  "type": "issue",
  "ticket": { "ticketNo": "F001-20261031-0001", "previousTicketNo": null, "...": "与版本 3 ticket 相同的业务字段" }
}
```

- `type` 为 `issue`（出单）、`void`（作废）或 `reopen`（重开）。
- 出单、作废和重开均携带完整单据快照 `ticket`；作废额外携带 `void`（`reason`、`actor`、`at`），云端不以作废载荷覆盖已保存的业务快照。
- 重开还携带 `previousSiteCode`，并在 `ticket.previousTicketNo` 中携带原单号；新单按 `siteCode` 归属，原单按 `previousSiteCode` 和原单号定位。重开单允许使用新厂区编码。
- `ticket` 的业务字段与版本 3 一致：`ticketNo`、`previousTicketNo`、`title`、`plate`、`direction`、`materialCode`、`materialName`、`materialSpec`、`partyCode`、`partyName`、`firstConfirmedAt`、`secondConfirmedAt`、`issuedAt`、`issuerName`、`originalGross`、`originalTare`、`finalGross`、`finalTare`、`finalNet`、`netAdjustment`、`netAdjustmentMode`、`netAdjustmentRateBp`、`netAdjustmentCategory`、`netAdjustmentCategoryName`、`previousFinalGross`、`previousFinalTare`、`previousFinalNet`、`previousNetAdjustment`、`grossSource`、`tareSource`、`adjustmentRemark`、`adjustedBy`、`adjustedAt`、`driver`、`driverPhone`、`contactName`、`contactPhone`。空文本为 `""`；无原单号、上版重量、比例或调整人时间时对应字段为 `null`。
- `digest` 只做格式校验（64 位小写十六进制）；云端不验证它与内容是否匹配。摘要不提供来源认证。
- 新协议不使用 `changeId`；同一变化重试必须使用已保存的原载荷和原摘要。

### 摘要规则版本 2

摘要规则版本为 `2`，通过请求中的 `digestVersion` 标识。`schemaVersion` 和请求中的 `digest` 字段不参与摘要计算；`rulesVersion` 参与。字段集合或规范化规则变化时必须提升规则版本，旧版本摘要不可直接比较。

#### 规范化输入

摘要输入是以下字节串的 SHA-256，输出为 64 位小写十六进制：

1. 固定前缀 `wb-change-digest\n`（UTF-8）。
2. 按下列固定顺序写入字段。每个字段编码为：字段名 ASCII 字节 + `:` + 值 UTF-8 字节长度（十进制） + `:` + 值 UTF-8 字节 + `\n`。可空字段为 `null` 时编码为字段名 + `:null\n`。长度前缀保证值中出现冒号、换行或非 ASCII 字符时无歧义。

固定字段顺序：

```text
rulesVersion
siteCode
ticketNo
changeType
previousSiteCode
previousTicketNo
```

- `rulesVersion` 为十进制 `2`。
- `previousSiteCode` 和 `previousTicketNo`：重开及重开单作废时写实际值；普通出单及其作废时写 `null`。`previousTicketNo` 取 `ticket.previousTicketNo`。
- `ticket.ticketNo` 不重复写入摘要；它必须等于顶层 `ticketNo`，由顶层字段覆盖。

所有变化继续写以下 `ticket` 字段（顺序固定）：

```text
title
plate
direction
materialCode
materialName
materialSpec
partyCode
partyName
firstConfirmedAt
secondConfirmedAt
issuedAt
issuerName
originalGross
originalTare
finalGross
finalTare
finalNet
netAdjustment
netAdjustmentMode
netAdjustmentRateBp
netAdjustmentCategory
netAdjustmentCategoryName
previousFinalGross
previousFinalTare
previousFinalNet
previousNetAdjustment
grossSource
tareSource
adjustmentRemark
adjustedBy
adjustedAt
driver
driverPhone
contactName
contactPhone
```

作废变化在以上字段之后继续写 `voidReason`、`voidActor`、`voidAt`，按该顺序编码。

#### 规范化规则

- **文本**：按 UTF-8 原样编码，不做 Unicode 归一化、不去首尾空白、不改大小写。`null` 与空字符串 `""` 是不同值。
- **重量**：所有重量字段先按版本 3 规则解析为整数千分吨（最多三位小数，禁止空白、空串和无符号负数），再格式化为 `符号 + 整数部分 + "." + 三位小数`。例如 `30`、`30.0`、`30.000`、`030` 都编码为 `30.000`；`-0.5` 编码为 `-0.500`；`0` 编码为 `0.000`。
  - 无符号字段：`originalGross`、`originalTare`、`finalGross`、`finalTare`、`finalNet`、`previousFinalGross`、`previousFinalTare`、`previousFinalNet`。
  - 有符号字段：`netAdjustment`、`previousNetAdjustment`。负数（上调）只在重开时允许。
- **时间**：统一转换为 UTC，截断到毫秒（丢弃更小精度），格式为 `YYYY-MM-DDTHH:MM:SS.sssZ`。例如 `2026-10-30T08:00:00+08:00` 和 `2026-10-30T00:00:00Z` 编码相同；`.123999Z` 截断为 `.123Z`。
- **可空整数字段**：`netAdjustmentRateBp` 为 `null` 或十进制整数字符串，不补前导零。
- **可空文本/时间/重量字段**：为 `null` 时写 `null` 标记；非空时按上述规则写值。`adjustedBy` 为空字符串和 `null` 产生不同摘要。

#### 固定测试向量

向量文件：`server/internal/weighbridge/testdata/digest_v2_vectors.json`，包含完整请求、用途和期望摘要；Go 参考实现为 `server/internal/weighbridge/digest.go`，单元测试为 `server/internal/weighbridge/sync_v4_test.go`。该参考实现只用于文档、向量和测试，接收路径不调用。厂端应使用同一向量校验自身实现。

| 向量 | 用途 | 期望摘要 |
| --- | --- | --- |
| `issue-basic` | 最小出单；可选文本为空字符串、可空字段为 null | `90d2aff38d8ed4f051e7403ac0ee86a04016f864936d5fab060fb7d131214fbd` |
| `issue-normalized` | 同一业务内容使用不同重量写法和时区，摘要必须与 issue-basic 相同 | `90d2aff38d8ed4f051e7403ac0ee86a04016f864936d5fab060fb7d131214fbd` |
| `issue-adjusted` | 含净重扣减、调整人和毫秒级调整时间 | `baf6c46a6b1e3d321d85b4e04d9f085fe111bbf689b24b5728e18ba9ae5ac3ac` |
| `issue-adjusted-truncated` | 时间截断到毫秒；摘要必须与 issue-adjusted 相同 | `baf6c46a6b1e3d321d85b4e04d9f085fe111bbf689b24b5728e18ba9ae5ac3ac` |
| `issue-empty-adjusted-by` | 空字符串与 null 不同，摘要必须与 issue-basic 不同 | `e54d6c3b0577192dac7e74c5563fd77fa845aff47ea3dcbe20e942876ff88cec` |
| `issue-delimited-text` | 文本包含冒号和换行；长度前缀保证无歧义 | `322cb4aa0a1e5a923200bb70e5b5b3925ebc0212153639228b03b9f197b289e7` |
| `void-basic` | 作废完整业务快照及作废信息；等价时间格式一致 | `a24323e3f50bd7b90f4aaf2b3d3fb563f8d8262aca652b51da8ca3170877b6ab` |
| `void-normalized` | 作废完整业务快照及作废信息；等价时间格式一致 | `a24323e3f50bd7b90f4aaf2b3d3fb563f8d8262aca652b51da8ca3170877b6ab` |
| `reopen-same-site` | 同厂区重开，携带原单关联和上版净重 | `fedf8924697ce8e03eebc7fc2cf0f733c08accaf0c9c637e222295c125020296` |
| `reopen-cross-site` | 新单使用 F001、原单使用旧编码 F000；previousSiteCode 参与摘要 | `642539bfec15d3ee9d7dc7f4179ffdce7e135ef104a893264d41e2891138850e` |
| `reopen-negative-adjustment` | 重开允许负数（上调）调整，负数按有符号千分吨规范化 | `e2f265dfa8897d4e225344a60421320508fbf9efd7749820e5eab502b96a1781` |
| `void-reopened-cross-site` | 跨厂重开单作废，摘要包含原单关联和完整业务快照 | `6d3965f1fa6c004b205531f8faa4e10f4f131cff934563fb3f9c5aa59264acdd` |

### 云端接收、去重与状态约束

云端在同一个数据库事务中保存业务结果、该变化摘要和单据最新变化摘要，事务提交后才返回成功。数据表为 `wb_cloud_ticket_change`（历史摘要）和 `wb_cloud_ticket.latest_digest / latest_change_type / latest_received_at`（最新摘要）。历史摘要第一阶段不自动清理。

去重顺序：

1. 请求中的 `siteCode` 必须是当前启用厂区编码；否则按配置/数据错误拒绝。旧编码不能写入新变化。
2. 同一 `digest` 已存在：若厂区、单号、变化类型均一致，返回原确认（`duplicate=true`，`receivedAt` 为原接收时间），不重复执行业务，也不把单据最新摘要退回旧值；若身份不一致，返回内容冲突。
3. 同一 `(siteCode, ticketNo, type)` 已存在但摘要不同：返回内容冲突，不覆盖。
4. 按状态约束处理：

| 变化 | 约束 | 不满足时 |
| --- | --- | --- |
| `issue` | `(siteCode, ticketNo)` 在云端不存在 | `conflict / ticket_exists` |
| `void` | 原单存在且状态为 `valid` | 缺失为 `predecessor_pending / ticket_missing`；已作废为 `conflict / ticket_not_valid` |
| `reopen` | 新单不存在；`previousSiteCode` 是已知历史编码；原单存在；原单已作废；原单未被重开 | 新单已存在 `conflict / ticket_exists`；编码未知 `config_or_data / previous_site_not_found`；原单缺失 `predecessor_pending / original_missing`；未作废 `predecessor_pending / original_not_void`；已重开 `conflict / original_already_reopened` |

- 作废只更新原单状态、原因、操作人和时间，不覆盖业务和重量快照；重开以新单号新增并保存原单关联。较早变化不会覆盖较晚状态：已处理的出单重试只返回原确认，之后的作废或重开不会被旧出单回退；同一位置的另一摘要会冲突。
- 并发写入按当前厂区行锁串行化；重开还会锁定原单行。唯一索引 `(issued_site_code, ticket_no, change_type)` 和 `digest` 作为最后防线。
- 云端不校验摘要与内容是否匹配，因此不能发现厂端摘要计算错误、相同摘要搭配不同内容，或云端业务结果后来被单独修改。摘要一致不表示云端独立校验了业务内容。

### 错误类别

失败响应继续使用 `{code,message,data}`；`data` 包含机器可读分类：

```json
{"category":"predecessor_pending","reason":"original_not_void","retryable":true}
```

| `category` | HTTP | `retryable` | 含义 | 厂端处理 |
| --- | --- | --- | --- | --- |
| `temporary` | 503 | true | 云端暂时不可用或事务未完成，结果未知 | 按退避重试原变化；不生成新摘要 |
| `predecessor_pending` | 409 | true | 出单或作废前序尚未获得确认 | 等待前序确认后重试；不跳过前序 |
| `config_or_data` | 400 | false | 厂区编码不存在/停用、协议或字段不符合约定 | 提示管理员处理；不要自动循环重试 |
| `conflict` | 409 | false | 摘要、单号或状态冲突，不能覆盖 | 暂停该单据及依赖它的重开；其他单据继续 |

`reason` 是更细的原因（如 `site_not_found_or_disabled`、`ticket_missing`、`original_not_void`、`change_conflict`、`digest_reused`、`original_already_reopened`）。厂端不得只根据 HTTP 状态推断结果，必须读取 `category`。云端管理读取接口在非 `ADMIN` 账号下返回 403。

单据变化及批量对账 JSON 请求体上限均为 1 MiB（1,048,576 字节）；超过上限在解码前受限，返回 HTTP 413，响应 `data` 为 `null`，厂端按数据错误提示处理，不自动循环重试。

### 厂端只读对账

- `GET /api/v1/weighbridge/sync/v4/tickets?siteCode=F001&ticketNo=T1`
  - 返回 `found`、`status`、完整单据快照 `ticket`、`voidReason`、`voidedBy`、`voidedAt`、`latestDigest`、`latestDigestVersion`、`latestChangeType`、`latestReceivedAt`、`previousSiteCode`、`previousTicketNo`、`reopenedBy` 和 `changes`（每项含 `digest`、`changeType`、`digestVersion`、`schemaVersion`、`receivedAt`）。未找到时 `ticket` 和作废信息为 `null`。
  - `ticket.netAdjustmentCategory`、`netAdjustmentCategoryName` 为空字符串时省略；`netAdjustmentRateBp`、`previousFinalNet`、`previousNetAdjustment` 为 `null` 时省略。字段差异比较须先将这些省略值分别还原为空字符串或 `null`。
  - 厂区编码按出单时编码查询；历史编码只读，允许在改码后继续查询旧编码已接收的变化和单据。
  - 单据不存在返回 200 且 `found=false`，这是对账的正常结果；厂区编码从未登记返回 400 `config_or_data / site_not_found`。
  - 该接口不验证厂端身份，完整快照包括司机和联系人等信息；按约定仅在可信网络内开放，并应限制网络访问范围。厂端自身仅向有权限的管理员展示差异详情。
- `POST /api/v1/weighbridge/sync/v4/reconcile`
  - 请求为 `{"items":[{"siteCode":"F001","ticketNo":"T1"}, ...]}`，每批 1 至 200 条。
  - 按请求顺序逐项返回 `siteCode`、`ticketNo`、`found`、`status`、`latestDigest`、`latestDigestVersion`、`latestChangeType`、`latestReceivedAt`、`previousSiteCode`、`previousTicketNo`、`reopenedBy` 和 `error`。
  - 单项格式错误或厂区编码不存在只把 `error` 放入该项，不影响其他项；空批次或超过 200 条整批返回 400 `config_or_data / invalid_request`。允许重复项，不做去重。
  - 批量结果不返回 `changes`；需要历史确认时对具体单据使用单张对账接口。
- `GET /api/v1/weighbridge/sync/v4/changes?siteCode=F001&digest=<64 位摘要>`
  - 返回某一摘要是否已被接收及原确认（`found`、`confirmation`）。用于回执丢失后按旧编码和原摘要只读确认。
  - 已失败的摘要不会返回确认；旧编码的写入仍然被拒绝。
- 云端不主动读取厂端数据库，不要求厂端上报积压或对账结果。摘要相同只表示双方记录的最新变化摘要一致，不是云端独立内容校验；接收时间不是厂端在线或全部上传的证明。
- 厂端应在自身实现中结合变化历史与上传进度判断“待同步”“冲突”“待核查”；不同摘要规则版本不可直接比较，不得直接判为内容冲突。

### 旧队列处置边界

- 云端保留 v2/v3 的 `/api/v1/weighbridge/sync/changes` 接口和既有数据，不自动删除、不自动迁移；v4 与 v2/v3 并行存在，不能据此推定旧协议已下线。
- v4 不兼容 v2/v3：不能把 v4 摘要当作 v2/v3 变化的重试标识，也不能用 v4 接口补传 v2/v3 载荷；反之亦然。
- 新方案不要求厂端兼容或迁移旧单据协议；在干净环境验证。现有测试环境及数据先保留，备份、清理或重建另行决定，不自动清空队列或转换旧变化。
- 不以混用协议的单据认定 v4 历史完整或对账一致；现有测试数据如需继续使用，须另行确定处理方案。
- v4 写入只接受当前启用厂区编码；v2/v3 旧编码写入继续按现行规则拒绝。旧编码的已接收摘要变化只能通过 v4 只读对账查询。
- v2/v3 接口的下线需另行发布；在明确下线前，云端不拒绝合法的 v2/v3 请求。

### 云端管理页面接口

以下接口使用登录态，仅 `ADMIN` 可访问；菜单 `weighbridge:sync`（前端组件 `weighbridge/sync/index`）也只分配给 `ADMIN`。菜单显隐不替代服务端授权。

- `GET /api/v1/weighbridge/sync/receipts/sites`
  - 按当前厂区返回 `siteCode`、`siteName`、`enabled`、`receivedChanges`、`lastReceivedAt`、`lastTicketNo`、`lastChangeType`、`lastIssuedSiteCode`。
  - 通过单据当前归属厂区聚合，因此改码后旧出单编码的历史变化仍计入原厂。`receivedChanges` 是云端已接收变化数，不是厂端待同步数。
- `GET /api/v1/weighbridge/sync/receipts/ticket?siteCode=F001&ticketNo=T1`
  - 返回云端保存的业务快照、作废信息、最新摘要及其规则版本、历史变化确认，以及原单和重开单关联，供有权限的管理员核对差异。
  - 页面只展示云端已知的接收结果，不展示厂端积压数量或在线状态；接收时间不表示数据完整。

### 与契约的边界及已知限制

- 本次不迁移 v2/v3 单据。旧单据的 `latestDigest` 为 `null`，也不会出现在新协议的历史变化表中；其业务数据仍可通过既有过磅单查询查看。新协议历史包含按 v4 或 v5 接收的变化。厂端应对同一单据统一使用一种单据协议；云端不阻止 v2/v3 与 v4/v5 混用，但混用会使新协议历史不完整，不应据此判断对账结果。
- 云端保存厂端上传的摘要，不重新计算；因此必须由厂端保证规范化实现正确。协议演进或摘要规则版本不同导致不可比较时，由厂端显示待核查。
- 云端不提供覆盖、删除或修改厂端单据的业务操作，也不提供“直接修复云端单据”的按钮；差异处理由管理员和厂端按契约流程进行。
- 第一阶段不自动清理历史摘要；后续清理策略另行确定。
- 已实现：接收、去重、状态约束、事务回滚、错误分类、单张/批量/旧编码只读对账、管理页查询、后端菜单与前端路由、固定测试向量；v5 接收、保存、展示与按合计统计，v4 历史确认与 v5 路由复用同一套事务和对账逻辑。待完成：部署、连接真实业务库、双端真实联调、长期断网与现场验收。

### 实施与验证记录

- Schema migration：`server/migrations/schema/00013_weighbridge_sync_receipts.sql`；菜单 seed：`server/migrations/seed/00011_weighbridge_sync_menu.sql`。
- 后端单元测试：`server/internal/weighbridge/sync_v4_test.go`；测试向量：`server/internal/weighbridge/testdata/digest_v2_vectors.json`；参考实现：`server/internal/weighbridge/digest.go`。
- v5 实现：接收类型与校验 `server/internal/weighbridge/sync_v5.go`、路由 `server/internal/weighbridge/sync_v5_handler.go`、共享事务 `server/internal/weighbridge/sync_v4_repository.go`；摘要参考实现 `server/internal/weighbridge/digest.go` 的 `CanonicalChangeDigestV3`；共享向量 `server/internal/weighbridge/testdata/digest_v3_vectors.json`；报表多项归类见 `server/internal/weighbridge/analytics_fields.go`。
- PostgreSQL 集成测试：`server/integration/weighbridge_sync_integration_test.go`，覆盖出单、作废、重开、重复上传、回执丢失后的确认、前序未满足、冲突、跨编码关联、旧编码历史确认、改码后拒绝写入、事务回滚、单张/批量对账及批量上限；v5 专项集成测试为 `server/integration/weighbridge_sync_v5_integration_test.go`；均使用 Docker 临时隔离数据库。
- 前端页面：`web/src/pages/weighbridge/SyncPage.tsx`；测试：`web/tests/weighbridge/SyncPage.test.tsx`。
