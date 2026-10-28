# 厂云同步接口设计草案

本文件描述厂区编码归属协议（版本 2）。两端已实现，隔离双端联调已执行；长期断网和现场验收仍待完成。业务约束以[厂云同步契约](cloud-sync-contract.md)及本地有效规格为准。仅描述本次过磅同步，不定义整个平台资料模型。

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

## 接口（版本 2）

- `GET /api/v1/weighbridge/sync/master?siteCode=F001`：不传凭据。云端验证厂区编码存在且启用，返回 `schemaVersion=2`、`siteCode` 及 `categories`、`materials`、`parties` 数组；`siteCode` 回显已核对的请求编码，厂端须检查其与请求时编码一致。身份与资料来自同一一致快照。无需 `scaleCodes`。
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

### 单据变化接口（版本 2）
- `POST /api/v1/weighbridge/sync/changes`：不传凭据。请求包含 `schemaVersion=2`、`changeId`、`siteCode`、`ticketNo`、`type`（`issue`、`void`、`reopen`）。`siteCode` 是该单据出单时的厂区编码；云端按此编码验证并归属。地磅编码不参与协议或云端校验。
- 出单和重开携带 `ticket`，作废携带 `void` 的 `reason`、`actor`、`at`。重开还携带 `previousSiteCode` 和 `ticket.previousTicketNo`，以原单的出单厂区编码及原单号定位原单，即使新旧编码不同。原单必须已作废，不能重复重开；新单按新单的 `siteCode` 归属。厂端必须先获得原单出单和作废确认，再发送重开。
- 单据 `ticket` 包含 `ticketNo`、`title`、`plate`、`direction`、`materialCode`／`materialName`／`materialSpec`、`partyCode`／`partyName`、`firstConfirmedAt`／`secondConfirmedAt`、`issuedAt`／`issuerName`、`originalGross`／`originalTare`／`finalGross`／`finalTare`、`previousFinalGross`／`previousFinalTare`、`grossSource`／`tareSource`、`adjustmentRemark`／`adjustedBy`／`adjustedAt`、`driver`／`driverPhone`／`contactName`／`contactPhone`。单据号须与变化头一致；重量为十进制吨字符串。字段空值和本地映射见共享契约。
- 厂端待发送变化固定原始载荷及变化标识；未知结果重试不改内容。云端以厂区编码与变化标识去重，相同内容返回原确认，不同内容或相同厂区单号冲突返回 409，不覆盖。未登记或停用的编码、前序缺失及临时故障应明确返回失败，不能误判成功。
- 互换编码只影响后续按该编码上送的单据，不移动已接收数据；云端改码时旧编码不再接受请求，历史关联保留，待上传旧编码须先处理。两端须覆盖改码、互换、重开跨编码、冲突及重试的契约测试。

云端仅支持版本 2；本次不迁移旧数据库。请求编码不存在或停用返回 HTTP 401；参数、未知字段或协议版本错误返回 400；重复标识内容不同、单号冲突或前序状态不满足返回 409。云端不验证物理来源。

## 云端厂区管理与改码边界

管理端使用 `GET/POST /api/v1/weighbridge/sites` 和 `PUT /api/v1/weighbridge/sites/{code}`，创建和修改载荷仅包含 `code`、`name`。已接收单据保留出单编码，按当前厂区编码查询仍可找到；历史编码保留给原厂，可改回但不能分配给其他厂。改码后旧编码的资料和变化请求均被拒绝，待上传旧编码变化应在改码前完成同步，或另行制定明确的数据处理方案。历史原单可用 `previousSiteCode` 和 `previousTicketNo` 定位，重开的新单按新编码归属。
