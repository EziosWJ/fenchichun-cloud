# 登录页背景图

登录页采用「全幅照片 + 暖棕黑遮罩 + 暖白抽屉」的沉浸式头部。照片资源位于：

- `public/ui-kit/login-hero-sorghum.jpg`
- 页面引用：`src/pages/login/index.wxml`

## 当前素材（临时占位）

当前图片仅用于界面方案评审，**上线前必须替换为酒厂自有照片或已确认授权的素材**。

| 项 | 内容 |
| --- | --- |
| 文件 | `Sorghum field in Mexico.jpg` |
| 作者 | Tomascastelazo |
| 授权 | CC BY-SA 3.0 |
| 来源 | https://commons.wikimedia.org/wiki/File:Sorghum_field_in_Mexico.jpg |
| 处理 | 裁剪 `900 × 1200`、降饱和 10%、轻微柔化、JPEG 质量 68 |

CC BY-SA 3.0 要求署名并以相同方式共享；若正式上线保留该图，需要在小程序内提供可见署名，并确认衍生使用的合规性。更稳妥的做法是换成酒厂自有的高粱田、厂区或窖池照片。

## 替换要求

- 比例建议 `3:4` 竖图，最低 `900 × 1200`，主体（高粱、厂区、窖池）在上半部。
- 顶部 `30%` 区域尽量偏暗、纹理简洁，避免与象牙白品牌字冲突。
- 单张控制在 `300KB` 以内；导出前不要自行压暗，遮罩由页面 CSS 统一处理。
- 保持文件名不变即可直接替换，无需改代码。

## 页面结构

- 照片层：`.login-hero`，高度 `68vh`，`mode="aspectFill"`。
- 遮罩层：`.login-hero__scrim`，暖棕黑 `rgb(30 24 20)` 渐变。
- 品牌层：象牙白粮穗标记 + 宋体「汾池春」+ 细分隔线。
- 抽屉层：`.login-drawer`，暖白底、顶部 `48rpx` 圆角，内放白色登录卡。
- 登录页 `navigationStyle` 为 `custom`，状态栏高度取自 `wx.getWindowInfo().statusBarHeight`。
