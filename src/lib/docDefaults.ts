// 文章的两个兜底字段值。服务端（API 路由、Prisma 写入）与客户端（store、侧栏、本地库）
// 都要拿它们做默认值与比较，所以放在两侧都无依赖的 lib 里，避免服务端去 import
// features/workspace（那边带 "use client" 的模块会被一起拖进服务端图）。

/** 无分类文章的归属；同时是保留名，不允许用户新建同名分类 */
export const UNCATEGORIZED = "未分类";

/** 没填标题时的占位标题。空标题一律落成它，所以它也是「没有标题」的判据 */
export const UNTITLED_DOC = "未命名文章";
