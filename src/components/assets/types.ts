/** 图片库共享类型：素材本身与「引用它的文章」，数据层与各视图都按这一份对齐 */

export interface Asset {
  id: string;
  key: string;
  url: string;
  size: number;
  mime: string;
  source: string;
  createdAt: string;
  /** 像素尺寸：入库时没记的历史文件为 null，由网格里的缩略图量出来后补录 */
  width: number | null;
  height: number | null;
}

/** 引用该素材的文章（/api/assets/[id]/usage） */
export interface UsageDoc {
  id: string;
  title: string;
  category: string;
  updatedAt: string;
  deletedAt: string | null;
}
