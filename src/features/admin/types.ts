/** /api/admin/* 的响应形状（服务端已把 BigInt 转成 number） */

import type { Permission } from "@/lib/permissionKeys";

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
  /** 库里存的开通项（不含管理员「默认全开」的推导，列表上据此标 AI 徽标） */
  permissions: Permission[];
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
    /** 库里存的开通项；管理员不看这个，默认全开 */
    permissions: Permission[];
    /** 每日次数上限；null=用站点默认（见 totals 里的 default*） */
    aiReviewDailyLimit: number | null;
    aiCoverDailyLimit: number | null;
  };
  totals: {
    docCount: number;
    trashCount: number;
    assetCount: number;
    storageUsed: number;
    defaultQuota: number;
    defaultAiReviewDailyLimit: number;
    defaultAiCoverDailyLimit: number;
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
