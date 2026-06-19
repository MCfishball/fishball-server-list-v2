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

export const initialPosts: Post[] = [
  {
    id: "demo-post-1",
    title: "FishBall V2 更新公告：全新论坛体验与反作弊系统升级",
    author: "FishBall_官方",
    category: "服务器讨论",
    tag: "官方",
    age: "刚刚",
    comments: 48,
    likes: 152,
    avatar: "🐡",
    pinned: true,
    highlighted: true,
    official: true,
    content:
      "欢迎来到 FishBall V2。我们重新设计了社区讨论体验，并为服务器主和玩家带来了更透明的审核机制。请在评论区留下你的建议。",
  },
  {
    id: "demo-post-2",
    title: "【生存】四季生存服 1.20.4 招募长期玩家",
    author: "WindPlayer",
    category: "服务器讨论",
    tag: "生存",
    age: "18 分钟前",
    comments: 12,
    likes: 23,
    avatar: "🧑",
    content:
      "一个专注长期建设的原版生存社区。我们有稳定的存档、友好的玩家和每周社区活动，欢迎建筑党和红石玩家。",
  },
  {
    id: "demo-post-3",
    title: "村民交易价格突然变高了怎么办？",
    author: "MC_小萌新",
    category: "求助",
    tag: "机制",
    age: "32 分钟前",
    comments: 8,
    likes: 15,
    avatar: "👨",
    content:
      "服务器里的村民交易突然涨价，没有打过村民。请问可能是什么机制导致的？有没有恢复价格的方法？",
  },
  {
    id: "demo-post-4",
    title: "今天在主城广场遇到的暖心事 ❤️",
    author: "甜菜不甜",
    category: "闲聊",
    tag: "日常",
    age: "1 小时前",
    comments: 6,
    likes: 18,
    avatar: "👩",
    content:
      "刚加入服务器时不熟悉规则，一位老玩家带我逛了主城，还送了全套工具。Minecraft 社区最珍贵的还是人与人之间的连接。",
  },
  {
    id: "demo-post-5",
    title: "关于领地插件 WorldGuard 的使用问题",
    author: "Redstone_Tech",
    category: "服务器讨论",
    tag: "插件",
    age: "2 小时前",
    comments: 14,
    likes: 21,
    avatar: "🧔",
    content:
      "正在配置 WorldGuard，希望实现出生点保护但允许玩家使用按钮和压力板，有经验的服主能分享一下 flags 配置吗？",
  },
  {
    id: "demo-post-6",
    title: "你们最喜欢的建筑风格是什么？",
    author: "建筑大佬",
    category: "闲聊",
    tag: "建筑",
    age: "3 小时前",
    comments: 27,
    likes: 64,
    avatar: "🧑‍🎨",
    content:
      "最近在研究中世纪与日式建筑，想看看大家平时最喜欢哪种建筑风格，也欢迎晒出自己的作品。",
  },
  {
    id: "demo-post-7",
    title: "服务器一直连接超时，求大佬看看",
    author: "卡顿选手",
    category: "求助",
    tag: "网络",
    age: "4 小时前",
    comments: 9,
    likes: 11,
    avatar: "🐼",
    content:
      "从昨天开始连接服务器一直超时，其他网站和游戏正常，已经重启过路由器和客户端。",
  },
  {
    id: "demo-post-8",
    title: "史莱姆区块位置分享（1.20.4 实测可用）",
    author: "SlimeFinder",
    category: "服务器讨论",
    tag: "攻略",
    age: "7 小时前",
    comments: 22,
    likes: 37,
    avatar: "🟩",
    content:
      "整理了主世界附近几个已经实测的史莱姆区块，附带刷怪塔选址和照明建议。",
  },
];

export const servers = [
  ["像素王国生存", "987 / 2000", "🏰"],
  ["方块大陆 RPG", "756 / 1500", "⛰️"],
  ["极限空岛生存", "512 / 1000", "🏝️"],
  ["梦想生活 Towny", "432 / 800", "🌳"],
  ["地狱生存挑战", "321 / 600", "🌋"],
];
