# 临时往来主体首期厂云接口

两端沿用现行 HTTP 接入。请求不携带厂端凭据，云端以当前存在且启用的厂区编码定位归属。响应沿用 `{ "code": 200, "message": "...", "data": ... }`，厂端同时检查 HTTP 状态与业务码。

## 上传登记

`POST /api/v1/weighbridge/sync/temporary-parties`，JSON 请求：

```json
{
  "schemaVersion": 1,
  "siteCode": "F001",
  "temporaryCode": "T-P-550e8400-e29b-41d4-a716-446655440000",
  "version": 1,
  "name": "临时供应商",
  "nature": "enterprise",
  "isSupplier": true,
  "isCustomer": false,
  "isCarrier": false
}
```

各字段必填。临时编码使用 `T-P-` 前缀，后缀为 ASCII 字母、数字或短横线，总长最多 40 字符，区分大小写。建议本地生成 UUID 并保留编码。登记版本为 1 至 2147483647 的整数，本地首次登记使用 1，更正时递增，云端接受跳号。名称去除首尾空白后为 1 至 100 个字符。主体性质为 `enterprise` 或 `individual`，至少一项业务身份为 true。不上传证件、电话等额外字段。

成功的 `data` 为 `{"schemaVersion":1,"siteCode":"F001","temporaryCode":"T-P-550e8400-e29b-41d4-a716-446655440000","version":1,"status":"pending"}`。版本和状态是云端当前记录。厂端核对协议版本、厂区、临时编码及回执版本不小于请求版本后，可确认该上传。版本更低的重试返回现有回执。同版本同内容重试成功。同版本不同内容冲突。较新版本在 `pending` 或 `needs_info` 时覆盖旧资料并回到 `pending`。归并或停用后，较新版本冲突。

| HTTP | 响应与厂端处理 |
| --- | --- |
| 200 | 业务码 200，上传获确认。状态取 `pending`、`needs_info`、`merged`、`disabled` 之一 |
| 400 | `data.kind` 为 `invalid`。格式、资料或协议错误，需处理原请求 |
| 401 | `data.kind` 为 `invalid_site`。厂区编码缺失、无效或停用，需检查配置 |
| 409 | `data.kind` 为 `version_conflict`（同版本内容不同）或 `finalized`（已归并或停用后上传新版）。终止原载荷自动重试并提示处理 |
| 500 | `data.kind` 为 `temporary`。可用原载荷退避重试。网络故障或未知结果亦可重试 |

## 全量资料内的处理结果

`GET /api/v1/weighbridge/sync/master?siteCode=F001` 保持 `data.schemaVersion: 2`，同一数据库快照新增 `data.temporaryPartyResults` 数组。新云端总是返回该数组，允许空数组。旧云端缺少该字段时按无结果处理。只返回请求厂的终态记录，当前有效厂区编码校验和当前资料同步错误语义照旧。

```json
{
  "temporaryCode": "T-P-550e8400-e29b-41d4-a716-446655440000",
  "version": 1,
  "status": "merged",
  "formalPartyCode": "C-P-0001"
}
```

`version` 为总部处理时核对的登记版本。归并结果的 `status` 为 `merged`，`formalPartyCode` 是同一快照 `parties` 中的正式编码。停用结果为 `disabled`，`formalPartyCode` 为 `null`。待确认和待补资料记录继续供现场使用。厂端应按临时编码应用结果，保留本地主体与历史快照。归并切换还须在同一本地事务确认正式主体已入库、启用且覆盖该临时主体当前所需业务身份，未满足时等待下一次同步。主体性质可不同，以总部确认的业务归属为准。停用移出新开单候选。已生效的归并状态长期保留。
