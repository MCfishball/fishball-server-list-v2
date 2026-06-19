export type Category = "全部讨论" | "服务器讨论" | "求助" | "闲聊";

export type Post = {
  id: string;
  title: string;
  author: string;
  category: Exclude<Category, "全部讨论">;
  tag: string;
  age: string;
  comments: number;
  likes: number;
  avatar: string;
  pinned?: boolean;
  highlighted?: boolean;
  official?: boolean;
  content: string;
};
