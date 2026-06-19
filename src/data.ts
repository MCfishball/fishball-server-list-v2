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

export const servers = [
  ["像素王国生存", "987 / 2000", "🏰"],
  ["方块大陆 RPG", "756 / 1500", "⛰️"],
  ["极限空岛生存", "512 / 1000", "🏝️"],
  ["梦想生活 Towny", "432 / 800", "🌳"],
  ["地狱生存挑战", "321 / 600", "🌋"],
];
