/** Response shapes of /api/admin/* (the server has already converted BigInt to number) */

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
  /** Last sign-in time; null if never signed in (including old users from before the signIn event shipped) */
  lastLoginAt: string | null;
  /** Last active date (UTC+8 YYYY-MM-DD); null if never recorded */
  lastActiveDate: string | null;
  bannedAt: string | null;
  banReason: string | null;
  /** Bytes; null = use the global default, 0 = unlimited */
  storageQuota: number | null;
  storageUsed: number;
  docCount: number;
  assetCount: number;
  admin: boolean;
  /** Enabled features stored in the DB (excluding the derived "all on by default" for admins); the list uses this for the AI badge */
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
    /** Last sign-in time; null if never signed in (including old users from before the signIn event shipped) */
    lastLoginAt: string | null;
    /** Last active date (UTC+8 YYYY-MM-DD); null if never recorded */
    lastActiveDate: string | null;
    bannedAt: string | null;
    banReason: string | null;
    storageQuota: number | null;
    admin: boolean;
    logins: string[];
    /** Enabled features stored in the DB; admins ignore this and have everything on by default */
    permissions: Permission[];
    /** Daily usage cap; null = use the site default (see default* in totals) */
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
