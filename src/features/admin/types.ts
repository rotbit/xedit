/** /api/admin/* 的响应形状（服务端已把 BigInt 转成 number） */

export interface Overview {
  users: { total: number; banned: number; newThisWeek: number };
  docs: { total: number };
  assets: { count: number; bytes: number };
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  /** 最近一次登录时间；从未登录过（含 signIn 事件上线前的老用户）为 null */
  lastLoginAt: string | null;
  /** 最近活跃日期（东八区 YYYY-MM-DD）；从未打过点为 null */
  lastActiveDate: string | null;
  bannedAt: string | null;
  banReason: string | null;
  /** 字节；null=用全局默认，0=不限制 */
  storageQuota: number | null;
  storageUsed: number;
  docCount: number;
  assetCount: number;
  admin: boolean;
}

export interface UserListResp {
  total: number;
  page: number;
  pageSize: number;
  defaultQuota: number;
  users: AdminUser[];
}

export interface UserDetailResp {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    createdAt: string;
    /** 最近一次登录时间；从未登录过（含 signIn 事件上线前的老用户）为 null */
    lastLoginAt: string | null;
    /** 最近活跃日期（东八区 YYYY-MM-DD）；从未打过点为 null */
    lastActiveDate: string | null;
    bannedAt: string | null;
    banReason: string | null;
    storageQuota: number | null;
    admin: boolean;
    logins: string[];
  };
  totals: {
    docCount: number;
    trashCount: number;
    assetCount: number;
    storageUsed: number;
    defaultQuota: number;
  };
  docs: {
    id: string;
    title: string;
    category: string;
    updatedAt: string;
    deletedAt: string | null;
  }[];
  assets: {
    id: string;
    url: string;
    size: number;
    mime: string;
    source: string;
    createdAt: string;
  }[];
}
