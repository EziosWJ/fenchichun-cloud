# 云端过磅开发与验证入口

业务范围见 [云端过磅规格](weighbridge-cloud-spec.md)，双方共同规则见 [厂云同步契约](cloud-sync-contract.md)，当前发布范围见 [README](../../README.md#当前基线)。

- **基础资料与单据**见 [同步接口设计](weighbridge-sync-api-design.md)。核对完整快照的一致性、厂区改码、出单与作废的提交顺序、回执丢失重试、旧协议兼容和只读对账。
- **待回磅与人工补单**见 [任务与补单契约](weighbridge-task-and-manual-ticket-api.md)。按契约验证空批心跳、终止留痕、乱序、断网及跨日对账。
- **隔离联调**见 [本地厂云端到端验证](../local-weighbridge-e2e.md)。使用隔离环境，记录双端提交、协议版本、迁移和验证结果。现场验收覆盖断网期间继续出单、重启恢复、积压补传及同步滞后提示。

开发、测试及部署命令见 [README](../../README.md#快速开始)。验证以当次联调记录为准。
