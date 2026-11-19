# 待回磅任务与人工补单接口契约

已确认纳入本次发布。下文的路径、字段和协议编号为实施约定，当前状态为双端开发及待验收。业务范围见 [厂云同步契约](cloud-sync-contract.md)，总部展示规则见 [云端过磅规格](weighbridge-cloud-spec.md)。

## 待回磅任务上送

`POST /api/v1/weighbridge/sync/tasks` 由厂端发起，沿用厂区编码校验和现有可信网络接入。请求采用 `schemaVersion: 1`，带 `siteCode` 和 `items`。一批属于同一厂区，最多 200 条，每条携带该任务的完整当前状态。空批次用于报告厂区已同步。厂端完成初次装载并确认积压任务后发送空批次，无新增任务时每分钟发送一次。云端接受空批次后刷新厂区最近成功同步时间。

| 字段 | 规则 |
| --- | --- |
| `taskNo`、`version` | 同一厂区下稳定的任务编号和正整数版本。业务变化递增版本，允许跳号 |
| `status` | `awaiting_second`、`terminated` 或 `completed` |
| `plate`、`direction`、`materialCode`、`materialName`、`partyCode`、`partyName`、`firstWeighedAt` | 必填的任务业务快照，方向为 `inbound` 或 `outbound`。主体尚未归并时按快照接收 |
| `termination` | 已终止时必填，含 `at`、`actor`、`reason`；其他状态为 null |
| `ticket` | 已完成时必填，含原出单的 `siteCode` 和 `ticketNo`，重开沿用该关联；其他状态为 null |

时间用带时区的 RFC 3339 字符串。云端按厂区和任务编号定位记录。同版本同内容或旧版本重试返回已保存的版本，同版本内容不同返回冲突。较新版本可更新任务快照，完成与终止均为终态。云端在事务提交后返回 `{code,message,data}`，其中 `data` 含 `schemaVersion`、`siteCode`、`receivedAt` 及逐条 `{taskNo,version}`。批次校验失败时整批拒绝。格式错误返回 400，无效或停用厂区返回 401，版本或状态冲突返回 409，临时故障为 5xx。网络故障及未知结果使用原批次重试。

按关联磅单的厂区和单号判断是否已入库。已完成且磅单尚未入库的任务显示为 `issued_pending_upload`。磅单先到时，云端收到完成状态后直接移出该任务。较晚到达的旧任务版本不能恢复待回磅状态。

## 总部只读查询

- `GET /api/v1/weighbridge/tasks` 要求总部待回磅查看权限。查询支持 `siteCode`、`plate`、`status`、`pageNum`、`pageSize`，默认状态为 `awaiting_second`，也可查询 `terminated` 和 `issued_pending_upload`。按首磅时间倒序及任务编号稳定分页。响应沿用管理端分页结构，行返回任务快照、厂区名称和展示状态，终止行另带终止信息。
- `GET /api/v1/weighbridge/task-sync-status` 使用相同权限，返回各可见厂区的 `siteCode`、`siteName`、`lastSyncedAt` 和 `awaitingCount`。正常同步但当前无待回磅时数量为 0，从未成功同步时两项均为 null。页面依据最近成功同步时间判断五分钟滞后提示。

## 人工补单的过磅单扩展

人工补单继续走正式单据的出单、作废和重开流程。使用 `POST /api/v1/weighbridge/sync/v6/changes`，人工补单及其后续变化使用 `schemaVersion: 6` 和 `digestVersion: 4`，沿用 v5 的请求结构、校验、回执和前序规则。保留已入队的旧协议载荷及原摘要。

| `ticket` 显式新增字段 | 规则 |
| --- | --- |
| `entryType` | 固定为 `manual_supplement`。以此区分历史单和人工补录回磅 |
| `firstWeighedAt`、`secondWeighedAt` | 两次实际称重时间，包含时区。首磅不晚于回磅，实际回磅不晚于出单 |

毛重和皮重来源均为 `manual`。保留确认时间字段及实际出单时间的现有语义。新摘要在 v5 单据字段序列之后、作废信息之前，按表中顺序加入 `entryType`、`firstWeighedAt`、`secondWeighedAt`，复用既有规范化方式。云端保留完整快照及标记，用实际回磅时间的北京时间日期查询对账；普通磅单继续按既有规则查询。补单原因和现场凭证留在厂端。

现有磅单列表新增可选 `entryType=manual_supplement`。人工补单详情增加上述三项字段。对账继续沿用现有请求参数，日期筛选、汇总、明细和导出统一使用适用的业务日期。旧协议单据保留原快照，人工补录回磅不会因重量来源字段而被归类为人工补单。

发布先部署云端新增接收与查询能力，再开启厂端发送。双端验收覆盖首次同步、空批、断网补传、终止留痕、出单状态与磅单乱序、跨日对账，以及旧单据不被误归类。
