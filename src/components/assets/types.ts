/** Shared image library types: the asset itself and "documents referencing it"; the data layer and all views align on this */

export interface Asset {
  id: string;
  key: string;
  url: string;
  size: number;
  mime: string;
  source: string;
  createdAt: string;
  /** Pixel dimensions: null for older files that weren't recorded at upload; backfilled once grid thumbnails measure them */
  width: number | null;
  height: number | null;
}

/** Documents referencing this asset (/api/assets/[id]/usage) */
export interface UsageDoc {
  id: string;
  title: string;
  category: string;
  updatedAt: string;
  deletedAt: string | null;
}
