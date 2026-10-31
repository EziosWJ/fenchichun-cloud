# 厂云同步接口设计草案

本文件描述现行厂区编码归属协议（版本 3，兼容版本 2），并记录新摘要同步与对账协议（schemaVersion 4）的云端接口设计。厂端已实现版本 3，云端接收端源码已兼容版本 2 和 3；实际部署版本、隔离双端联调及长期断网、现场验收状态须另行核实。新方案目标以[厂云同步契约](cloud-sync-contract.md)为准；新方案不要求兼容或迁移现有单据协议。现行版本 3 部分描述当前实现，新协议部分为本次云端实现、等待厂端实现及双端契约测试。仅描述本次过磅同步，不定义整个平台资料模型。

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

## 新协议：摘要同步与对账（schemaVersion 4）

> 状态：云端接收、确认与对账查询已在源码实现，并通过隔离 PostgreSQL 测试；厂端尚未实现，双端契约测试和现场验收未完成。新协议与版本 2/3 单据协议并行存在，不要求兼容或迁移旧单据；既有 v2/v3 接口、迁移和数据保留，不能据此推定双端已完成或已部署。厂端四项发布内容见 [v4 厂端对接发布包](weighbridge-sync-v4-factory-release.md)。

新协议使用厂端计算的 SHA-256 摘要作为变化标识和对账依据，不再使用随机 `changeId`。云端保存厂端上传的摘要，不重新计算，也不保存完整变化载荷用于逐字段去重。新协议接口位于 `/api/v1/weighbridge/sync/v4/...`，不复用版本 2/3 的 `/sync/changes` 请求结构。

### 变化请求

```json
{
  "schemaVersion": 4,
  "digestVersion": 1,
  "digest": "<64 位小写十六进制>",
  "siteCode": "F001",
  "ticketNo": "F001-20261031-0001",
  "type": "issue",
  "ticket": { "ticketNo": "F001-20261031-0001", "previousTicketNo": null, "...": "与版本 3 ticket 相同的业务字段" }
}
```

- `type` 为 `issue`（出单）、`void`（作废）或 `reopen`（重开）。
- 出单和重开携带 `ticket`；作废携带 `void`（`reason`、`actor`、`at`），不携带 `ticket`。
- 重开还携带 `previousSiteCode`，并在 `ticket.previousTicketNo` 中携带原单号；新单按 `siteCode` 归属，原单按 `previousSiteCode` 和原单号定位。重开单允许使用新厂区编码。
- `ticket` 的业务字段与版本 3 一致：`ticketNo`、`previousTicketNo`、`title`、`plate`、`direction`、`materialCode`、`materialName`、`materialSpec`、`partyCode`、`partyName`、`firstConfirmedAt`、`secondConfirmedAt`、`issuedAt`、`issuerName`、`originalGross`、`originalTare`、`finalGross`、`finalTare`、`finalNet`、`netAdjustment`、`netAdjustmentMode`、`netAdjustmentRateBp`、`netAdjustmentCategory`、`netAdjustmentCategoryName`、`previousFinalGross`、`previousFinalTare`、`previousFinalNet`、`previousNetAdjustment`、`grossSource`、`tareSource`、`adjustmentRemark`、`adjustedBy`、`adjustedAt`、`driver`、`driverPhone`、`contactName`、`contactPhone`。空文本为 `""`；无原单号、上版重量、比例或调整人时间时对应字段为 `null`。
- `digest` 只做格式校验（64 位小写十六进制）；云端不验证它与内容是否匹配。摘要不提供来源认证。
- 新协议不使用 `changeId`；同一变化重试必须使用已保存的原载荷和原摘要。

### 摘要规则版本 1

摘要规则版本为 `1`，通过请求中的 `digestVersion` 标识。`schemaVersion` 和请求中的 `digest` 字段不参与摘要计算；`rulesVersion` 参与。字段集合或规范化规则变化时必须提升规则版本，旧版本摘要不可直接比较。

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

- `rulesVersion` 为十进制 `1`。
- `previousSiteCode` 和 `previousTicketNo`：重开时写实际值；出单和作废时写 `null`。`previousTicketNo` 取 `ticket.previousTicketNo`，重开时必须非空。
- `ticket.ticketNo` 不重复写入摘要；它必须等于顶层 `ticketNo`，由顶层字段覆盖。

作废变化（`type=void`）继续写：

```text
voidReason
voidActor
voidAt
```

出单和重开变化继续写以下 `ticket` 字段（顺序固定）：

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

#### 规范化规则

- **文本**：按 UTF-8 原样编码，不做 Unicode 归一化、不去首尾空白、不改大小写。`null` 与空字符串 `""` 是不同值。
- **重量**：所有重量字段先按版本 3 规则解析为整数千分吨（最多三位小数，禁止空白、空串和无符号负数），再格式化为 `符号 + 整数部分 + "." + 三位小数`。例如 `30`、`30.0`、`30.000`、`030` 都编码为 `30.000`；`-0.5` 编码为 `-0.500`；`0` 编码为 `0.000`。
  - 无符号字段：`originalGross`、`originalTare`、`finalGross`、`finalTare`、`finalNet`、`previousFinalGross`、`previousFinalTare`、`previousFinalNet`。
  - 有符号字段：`netAdjustment`、`previousNetAdjustment`。负数（上调）只在重开时允许。
- **时间**：统一转换为 UTC，截断到毫秒（丢弃更小精度），格式为 `YYYY-MM-DDTHH:MM:SS.sssZ`。例如 `2026-10-30T08:00:00+08:00` 和 `2026-10-30T00:00:00Z` 编码相同；`.123999Z` 截断为 `.123Z`。
- **可空整数字段**：`netAdjustmentRateBp` 为 `null` 或十进制整数字符串，不补前导零。
- **可空文本/时间/重量字段**：为 `null` 时写 `null` 标记；非空时按上述规则写值。`adjustedBy` 为空字符串和 `null` 产生不同摘要。

#### 固定测试向量

向量文件：`server/internal/weighbridge/testdata/digest_v1_vectors.json`，包含完整请求、用途和期望摘要；Go 参考实现为 `server/internal/weighbridge/digest.go`，单元测试为 `server/internal/weighbridge/sync_v4_test.go`。该参考实现只用于文档、向量和测试，接收路径不调用。厂端应使用同一向量校验自身实现。

| 向量 | 用途 | 期望摘要（小写十六进制） |
| --- | --- | --- |
| `issue-basic` | 最小出单；空文本与 null | `2b3e99b61b4f39f4c8c5828d9a66db1d24134985c752312de1a41a30783b6e3f` |
| `issue-normalized` | 不同重量写法与时区，结果必须与 `issue-basic` 相同 | `2b3e99b61b4f39f4c8c5828d9a66db1d24134985c752312de1a41a30783b6e3f` |
| `issue-adjusted` | 净重扣减、调整人、毫秒时间 | `61ed117d0f0b1bfb0c7983d06510b3ce0589be5a3b186c1a38684b92a882d569` |
| `issue-adjusted-truncated` | 时间截断到毫秒，结果必须与 `issue-adjusted` 相同 | `61ed117d0f0b1bfb0c7983d06510b3ce0589be5a3b186c1a38684b92a882d569` |
| `issue-empty-adjusted-by` | 空字符串与 null 不同，结果必须与 `issue-basic` 不同 | `82afb678d77bd51c4223ddda30aaaf6f2ee4a64ce8cab1213d213f421f81a290` |
| `issue-delimited-text` | 文本含冒号、换行和非 ASCII 字符 | `dfbd454aef19b57d7f96db290f576faf7a83278731625740b91c459a25b15da7` |
| `void-basic` | 作废只覆盖标识和作废信息 | `12f637a36002535feeddb7754c0781c9021ba23d64f6e55665a56827a2453235` |
| `void-normalized` | 作废时间 UTC 等价写法，结果必须与 `void-basic` 相同 | `12f637a36002535feeddb7754c0781c9021ba23d64f6e55665a56827a2453235` |
| `reopen-same-site` | 同厂区重开及上版净重 | `bece0a7568457f0c8cd349dbe18a83e314b5f30181ab3ef9f7ed239013a7a41c` |
| `reopen-cross-site` | 新单 F001、原单旧编码 F000 | `9bf2f7802cbdb3f0fffded279e084366ac16649d63222d55f5cff1f54615427d` |
| `reopen-negative-adjustment` | 重开允许负数（上调）调整 | `dd711753dd074af0ca17b608c9b96fc4d252a83f2546f5e2ff1194ac41162623` |

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

### 厂端只读对账

- `GET /api/v1/weighbridge/sync/v4/tickets?siteCode=F001&ticketNo=T1`
  - 返回 `found`、`status`、`latestDigest`、`latestDigestVersion`、`latestChangeType`、`latestReceivedAt`、`previousSiteCode`、`previousTicketNo`、`reopenedBy` 和 `changes`（每项含 `digest`、`changeType`、`digestVersion`、`schemaVersion`、`receivedAt`）。
  - 厂区编码按出单时编码查询；历史编码只读，允许在改码后继续查询旧编码已接收的变化和单据。
  - 单据不存在返回 200 且 `found=false`，这是对账的正常结果；厂区编码从未登记返回 400 `config_or_data / site_not_found`。
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
- 厂端启用 v4 前必须先处理 v2/v3 待上传队列：按原协议完成上传，或由维护人员明确决定作废/保留。云端不自动清空队列、不自动转换旧变化。
- 同一单据不要混用两种协议。已通过 v2/v3 出单的单据，其作废/重开继续使用 v2/v3 直至该单据处理完毕；新单据使用 v4。混用会使 v4 历史不完整，不得据此判为对账一致。
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

- 本次不迁移 v2/v3 单据。旧单据的 `latestDigest` 为 `null`，也不会出现在新协议的历史变化表中；其业务数据仍可通过既有过磅单查询查看。新协议历史只包含按 v4 接收的变化。厂端应对同一单据统一使用一种单据协议；云端不阻止 v2/v3 与 v4 混用，但混用会使新协议历史不完整，不应据此判断对账结果。
- 云端保存厂端上传的摘要，不重新计算；因此必须由厂端保证规范化实现正确。协议演进或摘要规则版本不同导致不可比较时，由厂端显示待核查。
- 云端不提供覆盖、删除或修改厂端单据的业务操作，也不提供“直接修复云端单据”的按钮；差异处理由管理员和厂端按契约流程进行。
- 第一阶段不自动清理历史摘要；后续清理策略另行确定。
- 已实现：接收、去重、状态约束、事务回滚、错误分类、单张/批量/旧编码只读对账、管理页查询、后端菜单与前端路由、固定测试向量。待完成：厂端实现、双端契约测试、长期断网与现场验收。

### 实施与验证记录

- Schema migration：`server/migrations/schema/00013_weighbridge_sync_receipts.sql`；菜单 seed：`server/migrations/seed/00011_weighbridge_sync_menu.sql`。
- 后端单元测试：`server/internal/weighbridge/sync_v4_test.go`；测试向量：`server/internal/weighbridge/testdata/digest_v1_vectors.json`；参考实现：`server/internal/weighbridge/digest.go`。
- PostgreSQL 集成测试：`server/integration/weighbridge_sync_integration_test.go`，覆盖出单、作废、重开、重复上传、回执丢失后的确认、前序未满足、冲突、跨编码关联、旧编码历史确认、改码后拒绝写入、事务回滚、单张/批量对账及批量上限；使用 Docker 临时隔离数据库。
- 前端页面：`web/src/pages/weighbridge/SyncPage.tsx`；测试：`web/tests/weighbridge/SyncPage.test.tsx`。
