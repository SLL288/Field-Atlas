# 实地地图 · 利比里亚

面向实地工作者的坐标转换、KML/KMZ 导出与矿权参考地图工具。

## 中文界面

开发环境打开 http://localhost:5173/?lang=zh ，也可在页面右上角选择「简体中文」。
语言选择会保存在此浏览器中，刷新和离线打开时仍然生效。
应用包含中文导航、表单、照片核对、项目、设置、矿权来源说明与警告。
官方矿权编号、持有人名称等原始数据保持不变，避免改变登记信息。

## 本地运行

需要 Node.js 20.19 或更高版本：
```sh
npm ci
npm run dev
```

生产构建：
```sh
npm test
npm run build
npm start
```
生产中文入口为 http://localhost:3001/?lang=zh 。
部署需要 HTTPS、持久化数据目录和持续运行的单个 Node 后端进程。

## MME 数据多久更新一次？

后端约每 6 小时检查一次官方公开数据源。
普通「刷新」按钮检查中央缓存是否需要更新，不会让每部手机直接下载政府数据。
管理员可请求提前检查，但两次检查至少间隔 15 分钟。
源站故障或更新校验失败时，保留上一次有效数据并显示时间戳。
只有后端持续运行时，自动检查才会执行；启动时也会检查过期缓存。

官方数据目前包含 500 条公开记录，其中 402 个有效地图要素被接受。
98 条无效多边形被隔离，因此重叠分析覆盖不完整，应用会明确显示警告。
完整来源说明见 [MME_DATA_SOURCE.md](docs/MME_DATA_SOURCE.md)。

## 手写坐标照片

点击「识别照片 / 截图」，裁剪到坐标区域，可旋转和增强对比度。
- 印刷体：在设备上识别。
- 手写内容：可使用服务器识别；需要管理员在服务器 .env 配置 OPENAI_API_KEY 后重启。
- 无服务时：可对照照片逐行手动录入，或尝试本地识别。
- 无法辨认的数字必须保留为 ?，不能根据邻近点猜测补全。
- 创建地图前，必须核对数字并确认带号、半球及 WGS84 基准。

支持粘贴「424749/923027」这类使用斜线分隔的东、北坐标。
照片中的六位数字本身不能证明坐标系是 UTM 29N。
详见 [照片识别说明](docs/PHOTO_RECOGNITION.md)。

## 测试

```sh
npm test
npm run build
node scripts/ocr-smoke.mjs
node scripts/chinese-photo-smoke.mjs
```
浏览器脚本需先启动开发服务，并安装 Google Chrome。
中文照片测试使用 OCR 测试生成的图片，请按上述顺序运行。
手写服务器调用经过模拟响应测试；当前未配置 API key，未进行真实模型识别测试。

## 后台绘图与导出记录

每次绘图或生成 KML、KMZ、GeoJSON、CSV 文件，都会保存到后台，默认目录为 `data/activity/`。每个操作单独保存坐标 GeoJSON、生成的文件及元数据；`logs/YYYY-MM-DD.jsonl` 按 UTC 日期记录操作，方便以后查看。

```sh
npm run activity:logs
npm run activity:logs -- --date 2026-09-08
npm run activity:logs -- --id EVENT_UUID
```

离线操作先存入浏览器队列，联网且网页打开时重试；重新打开网页也会重试。上传前清除浏览器数据可能丢失待上传记录。设置页面显示待上传数量和手动重试按钮。

可通过服务器 `ACTIVITY_DIR` 修改目录。记录包含匿名浏览器/会话标识，不代表已验证的用户身份；不保存原始照片。服务器默认不自动删除记录，请持久化并备份该目录。详见 [后台存档说明](docs/ACTIVITY_ARCHIVE.md)。

## 当前位置

本机 `http://localhost` 或 `http://127.0.0.1` 可请求定位。手机访问电脑的 `http://192.168.x.x:5173` 需要改为 HTTPS；手机上的 localhost 指手机本身。请允许浏览器的网站定位权限，并在系统设置中为浏览器开启定位服务。高精度定位失败时应用会重试普通定位，并显示具体错误原因。电脑定位精度取决于设备和网络，不能保证 GPS 精度。

GitHub 上传仅保存源代码，不会自动上线网站。请将 Node 后端与前端一起部署到支持 HTTPS 和持久化数据目录的服务器；GitHub Pages 无法单独运行此后端。

## Cloudflare 完整部署

已添加 Worker 后端与 Pages API 转发。先启用 R2 和适合坐标计算的 Workers 付费计划，再在项目目录执行：

```sh
git pull --ff-only
npm ci
npx wrangler login
npm run cf:bucket
npm run cf:deploy
```

在现有 Pages 项目 → Settings → Bindings 中添加 Service binding：变量名 `BACKEND`，服务 `field-atlas-backend`，保存后重新部署 Pages。现有构建命令仍为 `npm run build`，输出目录 `dist`。

打开 `/api/health` 应返回 JSON。首次打开 `/api/mme` 会启动采集，请稍等几分钟；之后每六小时检查更新。R2 的 `activity/events/` 保存每次操作的文件，`activity/logs/日期/` 保存操作记录。无需电脑持续开机。

Cloudflare 尚未在本机登录，因此代码提交不代表已完成云端部署。详细步骤、管理员密钥和故障排查见 [Cloudflare 部署说明](docs/CLOUDFLARE.md)。
