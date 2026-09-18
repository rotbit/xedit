# 数据可靠性与性能改造验证记录（2026-09-18）

本次改动围绕「输入 / 滚动 / 切文档 / 搜索 / 同步的流畅度」与「不丢数据」，不改产品交互。
下面是问题 ↔ 文件、验证命令与结果、实测数字、残余风险、迁移与手测清单。

## 1. 问题 ↔ 改动

### 数据可靠性
| 问题（按当前代码核实） | 改动 |
|---|---|
| 慢响应清掉后来的编辑：`pushMirrorDoc` 收到响应无条件清 dirty | `docStore.ts` 镜像加 `rev`（本地修订号）与 `baseUpdatedAt`；`markMirrorSynced(id, confirmedRev, serverUpdatedAt)` 只在 rev 相等时清 dirty |
| 跨文档串状态：`saveDocument` await 后不核对当前文档 | `useEditorSave.ts` 只在 docId 仍相同、且内容未再改时写 saveState |
| 无上传队列：自动/手动/后台各自发 PUT | `sync.ts` 每篇单飞队列，在途期间的编辑合并到下一轮；网络异常/5xx 有界重试（1s、3s） |
| 本地新文档上传丢响应会重复创建、上传期间的编辑被删 | POST 带 `clientKey`（= 本地 id），服务端幂等；上传后与服务端整行比对，本地更新的写成 dirty 镜像再删本地副本 |
| 服务端无条件覆盖 | `documents.ts` `updateDocument` 接受 `baseUpdatedAt`，走 `updateMany` 原子条件更新；不匹配回 409 附服务端当前版本；客户端先把云端版本归档为历史版本再以新基线重推一次，并 toast |
| 换账号直接 `clearMirror` 删 dirty 草稿；无快照时一律当同一人 | 新增 `mirrorOwner.ts`（镜像归属独立于登录快照）、`orphanDrafts.ts`（换账号/登出前把 dirty 篇挪进 `xedit-orphan-drafts`，同账号回来自动领回）；归属未知的草稿不认领、不上传 |
| 旧账号在途请求写进新账号状态 | `sessionEpoch.ts` 会话代际；`clearMirror`、换账号、登出都 bump；sync 各步回来核对代际 |
| stash 写失败时旧账号 dirty 篇可能被新账号推上去 | `xedit-sync-hold` 闸门：归属未落定期间 sync 一律不推、不 drain |
| 探测无超时/在途结果无法作废 | `sessionProbe.ts` 8s AbortController 超时、代际号、finally 释放 inFlight；只有 200 且 body 明确无 user 才算登出；探测期间重新登录过则旧结果作废 |
| 本地写失败被当成已保存 | `persistEditorDocument` 捕获写失败返回 `local-error`；状态行显示「本地保存失败」，toast 一次；`saveMirrorLocal` 先写正文后写索引，不留半截 |
| 页面隐藏 keepalive 绕过版本安全 | keepalive 带 `baseUpdatedAt`；该篇正在飞时不发 keepalive |

### 性能
| 问题 | 改动 |
|---|---|
| `applyServerDoc` 每篇全量读写索引 | `applyServerDocs(docs)` 整批一次读、一次写、一次通知；内容相同跳过；单篇写失败记录并继续 |
| 侧栏搜索每次算全部摘要、`indexOf` 每次读全文 | `searchDocIds` 只判命中；`docIndex` 按 `{updatedAt, chars}` 失效，不读正文 |
| livePreview 对代码/引用/列表块逐行遍历整块 | `eachLine` 只遍历「块 ∩ 可见区（各扩 2 行）」，first/last 仍按真实块首尾 |
| 同步滚动锚点不感知图片/字体/字号变化；frontmatter 行号偏移 | ResizeObserver + 图片 load 委托 + `fonts.ready` 标脏，下一帧再量；`renderMarkdown` 把剥掉的 frontmatter 行数作为 `env.lineOffset` 平移 `token.map` |
| 预览对任何附件事件重渲染；分屏也算大纲 | 附件事件带 `detail.keys`，与当前正文无关不重渲染；云端模式不订阅；`useOutline(…, enabled)` 只在阅读模式查 DOM |
| 改设置重写整篇正文 | `xedit-store`（设置）与 `xedit-store-doc`（草稿）分键；老键内容首次加载自动搬家 |

## 2. 验证命令与结果（本机，2026-09-18）
```
npx tsc --noEmit        # 仅剩 src/features/landing/components/Comparison.tsx（用户未跟踪 WIP）的既有报错
npm run lint            # 无输出
npx vitest run          # Test Files 16 passed, Tests 94 passed
npm run build           # 在剔除 Comparison.tsx 的干净 worktree 中：Compiled successfully
npx prisma validate / generate   # 通过
```
无法运行的：本机没有 PostgreSQL，`prisma migrate` 与真库并发压测未跑；服务端条件更新的原子性由数据库保证，单测用的是假 prisma。浏览器端长任务/帧率未测（见第 6 节手测）。

## 3. 实测数字（node 环境单测断言值，非浏览器）
| 指标 | 改前 | 改后 |
|---|---|---|
| 同步 100 篇：索引 localStorage get / set 次数 | 100 / 100 | 1 / 1 |
| 同步 100 篇：`xedit:docs-changed` 派发次数 | 100 | 1 |
| 3000 行代码块、视口 51 行：eachLine 访问行数 | 3000 | 55 |
| 引用嵌套列表 1003 行、视口 21 行：装饰条数 | 5205 | 116 |
| 1000 篇搜索单次耗时 | searchDocs 2.49ms | searchDocIds 0.95ms |
| 元信息不变连查 100 次：正文读取次数 | 100 | 1 |
| 改一次设置：正文键写入次数 | 1 | 0 |

推断而非实测：浏览器里输入卡顿的改善程度取决于块长度与视口，上表只证明工作量上限被限制。

## 4. 残余风险
- 不带 `baseUpdatedAt` 的旧客户端（旧 Mac 版、飞书同步）仍是后写覆盖；MCP 按设计无条件更新。
- keepalive 请求拿不到响应，若被判 409 会静默失败，内容保持 dirty 等下轮正规处理。
- 同一 `clientKey` 在文档软删后重试会拿回回收站那篇。
- 归属未知的孤儿草稿目前没有 UI 找回入口，数据在 `xedit-orphan-drafts`。
- 条件更新的时间戳由应用层生成（`base + 1ms` 兜底），多实例时钟回拨会让时间戳略早。

## 5. 迁移与回滚
- `prisma/migrations/20260918000000_document_client_key`：只加可空列 `clientKey` 与唯一索引 `(userId, clientKey)`。代码与迁移可任意先后上线。
- 回滚：`DROP INDEX "Document_userId_clientKey_key"; ALTER TABLE "Document" DROP COLUMN "clientKey";`，并删掉 `_prisma_migrations` 对应行。
- 本地存储新增键：`xedit-mirror-owner`、`xedit-orphan-drafts`、`xedit-sync-hold`、`xedit-store-doc`；镜像索引新增 `rev`、`baseUpdatedAt` 字段，老索引按缺省兼容；回退旧版本代码不会丢数据（旧代码忽略新字段，`xedit-store` 老键仍在但不再含正文——回退后草稿以 store 首次加载为准）。

## 6. 浏览器手测清单
1. 长代码块 / 引用块中段用中文输入法连续输入、拖选出视口、⌘A、撤销重做、删除 ``` 边界。
2. 快速滚动 3000 行代码块、目录跳转，观察边缘行是否晚一拍上色。
3. 双屏模式：多图文档图片陆续加载时滚动对齐；切字号/主题后立即滚动；带 frontmatter 的文档对齐。
4. 阅读模式目录生成与跳转；分屏 ↔ 阅读切换目录不丢。
5. 两台设备（或两个浏览器）同时编辑同一篇：后保存的一方应看到冲突 toast，版本历史里有另一份。
6. A 账号有未同步草稿 → 登出 → B 登录 → 再回 A：草稿被找回并同步。
7. 断网编辑 → 联网：只有一次 PUT，最新内容上云；页面隐藏时的保存不重复。

### 6.1 手测结果（2026-09-18，本地 dev、未登录本地模式、Chrome 自动化）

测试稿：3129 行 / 12.7 万字符，含 frontmatter、3 张图、40 行引用、3000 行 js 代码块、30 段结尾。

| 项 | 结果 | 说明 |
| --- | --- | --- |
| 1 | 通过 | 粘贴即时；代码块中段输入、拖选 25 行、⇧PageDown 跨虚拟视口选到 1785 行、⌘A 两段式（先选围栏内容再全文）、⌘Z/⌘⇧Z、删掉结尾 ``` 后整篇立即按代码重渲染无卡顿、撤销恢复。真实输入法合成无法用工具模拟。 |
| 2 | 通过 | 代码块内 60 格滚轮后可视 32 行全部着色（未着色 0 行）；目录跳「第四节」落点距顶 12px，「第二节」收敛到顶。百毫秒内的上色延迟工具测不出。 |
| 3 | 通过（编辑→预览方向） | 图一后「引用第 9 行」两侧对齐；图三/第四节区域顶行差约 1 行。字号 16.5→18px + 切主题后滚一下编辑器，预览顶行仍对齐（偏差 ≤1 行）。预览→编辑方向工具触发不了 pointerenter，未验。 |
| 4 | 通过 | 阅读模式大纲 5 级标题齐全，跳「第三节」落点偏移 0px；阅读 ↔ 分屏来回切换目录不丢、无报错。退出阅读回到「编辑」而非「分屏」是原有设计（useEditorViewMode 未改）。 |
| 5–7 | 未跑 | 本机没有 PostgreSQL，登录/云端链路起不来；对应逻辑由 tests/ 下单测覆盖。 |

其他观察：控制台仅有原有的落地页 hydration 文案不一致（StartWritingButton「开始写作 / 继续编辑本地文稿」，Home.tsx 未在本次改动内），无其他错误。切换主题后预览滚动位置归零，要等编辑器再滚一次才重新对齐——不属本次改动范围，待确认是否原有行为。
