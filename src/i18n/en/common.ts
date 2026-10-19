/**
 * Common words: short strings used everywhere, like buttons, relative dates and units.
 * Keys are the Chinese originals; values should read like a native product -- Title Case for buttons and titles, Sentence case for sentences.
 */
export const common: Record<string, string> = {
  确定: "OK",
  取消: "Cancel",
  删除: "Delete",
  保存: "Save",
  关闭: "Close",
  搜索: "Search",
  打开: "Open",
  编辑: "Edit",
  复制: "Copy",
  重命名: "Rename",
  移动: "Move",
  新建: "New",
  导入: "Import",
  导出: "Export",
  恢复: "Restore",
  重试: "Retry",
  返回: "Back",
  完成: "Done",
  设置: "Settings",
  "加载中…": "Loading…",
  未命名文章: "Untitled",
  未分类: "Uncategorized",

  // Relative dates (shared by the Today page title, todo date column and sidebar entry)
  今天: "Today",
  昨天: "Yesterday",
  明天: "Tomorrow",
  上周: "Last week",

  // Durations and word counts: English picks singular/plural by count ({name, singular, plural})
  "{m} 分钟": "{m} min",
  "{h} 小时": "{h} hr",
  "{h} 小时 {m} 分钟": "{h} hr {m} min",
  "{n} 字": "{n} {abs, char, chars}",
  // 《》 title marks are Chinese typography; English wraps titles in curly quotes
  "《{title}》": "“{title}”",
  收起: "Collapse",
  展开: "Expand",
  操作失败: "Something went wrong",
};
