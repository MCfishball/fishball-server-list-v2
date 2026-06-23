export type Category = "全部讨论" | "服务器讨论" | "求助" | "闲聊";

export type Post = {
  id: string;
  userId: string;
  title: string;
  author: string;
  authorUrl?: string;
  category: Exclude<Category, "全部讨论">;
  tag: string;
  age: string;
  comments: number;
  likes: number;
  avatar: string;
  pinned?: boolean;
  highlighted?: boolean;
  official?: boolean;
  edited?: boolean;
  isDeleted?: boolean;
  deletedAt?: string | null;
  content: string;
};
