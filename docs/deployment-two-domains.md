# 生产部署：双域名 + Caddy（管理后台 + 小程序）

服务器：`ubuntu@82.157.101.92`（`VM-0-16-ubuntu`），systemd 服务 `fenchichun`，
Caddy v2.11.9（`/opt/caddy/bin/caddy`，配置 `/etc/caddy/Caddyfile`，unit `caddy.service`）。

## 1. 拓扑

```
浏览器 fcc.admin.ezio.wang ─┐
                            ├─ Caddy :443 ── 127.0.0.1:8100 (fenchichun)
小程序 fcc.adminapi.ezio.wang ┘
```

- `fcc.admin.ezio.wang`：管理后台页面（Go 内嵌前端）+ `/api/v1`。
- `fcc.adminapi.ezio.wang`：只开放 `/api/*`、`/health`、`/ready`，其余返回 404。
- 两个域名指向同一台服务器、同一个 Go 进程。

## 2. 域名与 DNS

域名 `ezio.wang` 注册在腾讯云，DNSPod 托管（`f1g1ns1/2.dnspod.net`）。

| 记录 | 类型 | 值 | TTL |
|---|---|---|---|
| `fcc.admin` | A | `82.157.101.92` | 600 |
| `fcc.adminapi` | A | `82.157.101.92` | 600 |

新增记录：

```bash
tccli dnspod CreateRecord --Domain ezio.wang --SubDomain fcc.admin \
  --RecordType A --RecordLine 默认 --Value 82.157.101.92 --TTL 600
tccli dnspod CreateRecord --Domain ezio.wang --SubDomain fcc.adminapi \
  --RecordType A --RecordLine 默认 --Value 82.157.101.92 --TTL 600
```

> 微信小程序要求域名已 ICP 备案、HTTPS、443 端口；`ezio.wang` 的备案状态需在
> 腾讯云备案控制台确认，子域名随主域名备案。

## 3. Caddy 配置

`/etc/caddy/Caddyfile` 末尾追加：

```caddy
fcc.admin.ezio.wang {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8100
}

fcc.adminapi.ezio.wang {
	@api path /api/* /health /ready
	handle @api {
		reverse_proxy 127.0.0.1:8100
	}
	respond 404
}
```

- Caddy 自动通过 HTTP-01 向 Let's Encrypt 申请并续期证书，无需手工维护。
- 证书存放在 `/var/lib/caddy/.local/share/caddy/certificates/`。
- 修改后先校验再重载：

```bash
sudo /opt/caddy/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

- Caddy 自动把 80 端口跳转到 HTTPS；`encode` 只影响文本资源，接口响应不做压缩。

## 4. 后端配置

`/opt/fenchichun/configs/config.prod.yaml`（服务器侧，不提交 Git）追加：

```yaml
http:
  address: "127.0.0.1:8100"
  trusted_proxies:
    - 127.0.0.1

cors:
  allowed_origins:
    - https://fcc.admin.ezio.wang
```

- 只监听回环地址，公网无法再直连 8100。
- `trusted_proxies` 让服务信任 Caddy 的 `X-Forwarded-For`，限流与审计日志才能拿到真实客户端 IP。
- 后台与 API 在 `fcc.admin.ezio.wang` 下同源，浏览器请求不触发跨域；此处显式配置用于收紧原 `*`。
- 小程序 `wx.request` 不受浏览器 CORS 限制，但仍需加入微信域名白名单。

修改后重启：

```bash
sudo systemctl restart fenchichun
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8100/health
```

> 上传体积：后端单文件上限 55MB、批量 210MB。Caddy 默认不限制请求体大小，
> 如需限制可在 site 块内加 `request_body { max_size 210MB }`。

## 5. 小程序

- `miniprogram/.env.production`：

  ```
  APP_API_BASE_URL=https://fcc.adminapi.ezio.wang/api/v1
  ```

- 微信公众平台 → 开发管理 → 开发设置 → 服务器域名：
  - request 合法域名：`https://fcc.adminapi.ezio.wang`
  - 当前代码未使用 `wx.uploadFile` / `wx.downloadFile`，后续新增时再补对应域名
  - 该配置每月修改次数有限，建议一次配全
- 重新构建后上传、提审。

## 6. 发布流程

沿用 `.agents/skills/fenchichun-deploy`：

1. 本地 `task build`，产出 `bin/base-go-api`、`bin/base-go-migrate`。
2. 上传二进制与 `server/migrations/`，执行 `APP_ENV=prod ./base-go-migrate up --kind all`。
3. 替换程序，`systemctl restart fenchichun`。
4. Caddy 配置未变时无需重载。

## 7. 验证清单

- [ ] `curl -I https://fcc.admin.ezio.wang/` 返回 200，证书由 Let's Encrypt 签发
- [ ] `https://fcc.admin.ezio.wang/health`、`/ready` 正常
- [ ] `https://fcc.adminapi.ezio.wang/health` 正常
- [ ] `https://fcc.adminapi.ezio.wang/` 返回 404
- [ ] `http://fcc.admin.ezio.wang/` 308 跳转到 HTTPS
- [ ] 公网 `http://82.157.101.92:8100/health` 不可达
- [ ] 管理后台登录、菜单、文件上传下载正常
- [ ] 小程序真机登录、列表、照片上传正常
- [ ] 访问日志中客户端 IP 为真实公网 IP

## 8. 回滚

1. 程序：恢复上一版 `base-go-api`，`systemctl restart fenchichun`。
2. 配置：恢复 `config.prod.yaml.bak-*`，重启服务。
3. Caddy：还原 `/etc/caddy/Caddyfile` 后 `sudo systemctl reload caddy`。
4. DNS：在 DNSPod 删除 `fcc.admin` / `fcc.adminapi` 两条 A 记录。
5. 数据库迁移可能不可逆，回滚程序前先确认迁移状态。
