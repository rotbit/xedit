/**
 * 通用词：按钮、相对日期、单位这类各处都会用到的短文案。
 * key 是中文原文；值写成母语产品的说法——按钮和标题 Title Case，句子 Sentence case。
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

  // 相对日期（今天页标题、待办日期列、侧栏入口共用）
  今天: "Today",
  昨天: "Yesterday",
  明天: "Tomorrow",
  前一天: "Previous day",
  后一天: "Next day",

  // 时长与字数：英文按数量挑单复数（{name, 单数, 复数}）
  "{m} 分钟": "{m} min",
  "{h} 小时": "{h} hr",
  "{h} 小时 {m} 分钟": "{h} hr {m} min",
  "{n} 字": "{n} {abs, char, chars}",
  // 书名号是中文排版，英文用弯引号包标题
  "《{title}》": "“{title}”",
  收起: "Collapse",
  操作失败: "Something went wrong",
};
