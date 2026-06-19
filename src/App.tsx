import {
  Bell,
  ChevronDown,
  CircleHelp,
  Clock3,
  Crown,
  FileText,
  Flame,
  Heart,
  Home,
  LockKeyhole,
  Menu,
  MessageSquare,
  Pin,
  Plus,
  Search,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Category, initialPosts, Post, servers } from "./data";
import {
  createComment,
  createPost as createDatabasePost,
  ForumComment,
  listComments,
  listPosts,
  setPostLike,
} from "./lib/forum-api";
import { isSupabaseConfigured } from "./lib/supabase";

const categories: { label: Category; icon: typeof Home }[] = [
  { label: "全部讨论", icon: MessageSquare },
  { label: "服务器讨论", icon: Server },
  { label: "求助", icon: CircleHelp },
  { label: "闲聊", icon: UsersRound },
];

const categoryClass: Record<Post["category"], string> = {
  服务器讨论: "green",
  求助: "blue",
  闲聊: "purple",
};

export function App() {
  const [activeCategory, setActiveCategory] = useState<Category>("全部讨论");
  const [query, setQuery] = useState("");
  const [posts, setPosts] = useState(initialPosts);
  const [liked, setLiked] = useState<Set<string>>(() => new Set());
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void listPosts()
      .then((databasePosts) => {
        if (databasePosts.length) setPosts(databasePosts);
      })
      .catch(() => showToast("论坛数据加载失败，已保留当前内容"));
  }, []);

  const visiblePosts = useMemo(() => {
    return posts.filter((post) => {
      const categoryMatches =
        activeCategory === "全部讨论" || post.category === activeCategory;
      const queryMatches =
        !deferredQuery ||
        `${post.title} ${post.author} ${post.tag}`.toLowerCase().includes(deferredQuery);
      return categoryMatches && queryMatches;
    });
  }, [activeCategory, deferredQuery, posts]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const toggleLike = async (postId: string) => {
    const willLike = !liked.has(postId);
    if (isSupabaseConfigured) {
      try {
        await setPostLike(postId, willLike);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "点赞失败");
        return;
      }
    }

    setLiked((current) => {
      const next = new Set(current);
      next.has(postId) ? next.delete(postId) : next.add(postId);
      return next;
    });
  };

  const createPost = async (post: Post) => {
    try {
      const savedPost = isSupabaseConfigured
        ? await createDatabasePost(post)
        : post;
      setPosts((current) => [savedPost, ...current]);
      setComposerOpen(false);
      setActiveCategory("全部讨论");
      showToast("帖子已发布");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "发布失败");
      return false;
    }
  };

  return (
    <div className="app">
      <Header
        query={query}
        onQuery={setQuery}
        mobileNavOpen={mobileNavOpen}
        onToggleMobileNav={() => setMobileNavOpen((value) => !value)}
      />

      <main className="layout">
        <Sidebar
          activeCategory={activeCategory}
          onSelect={(category) => {
            setActiveCategory(category);
            setMobileNavOpen(false);
          }}
          onCompose={() => setComposerOpen(true)}
          mobileNavOpen={mobileNavOpen}
        />

        <section className="feed" aria-label="论坛帖子">
          <div className="feed-heading">
            <div>
              <h1>社区广场</h1>
              <p>与玩家和服务器主分享经验，找到同路人。</p>
            </div>
            <div className="feed-actions">
              <button className="filter-button">
                最新回复 <ChevronDown size={15} />
              </button>
              <button className="filter-button desktop-only">
                全部标签 <ChevronDown size={15} />
              </button>
            </div>
          </div>

          <div className="mobile-categories" aria-label="论坛分类">
            {categories.map(({ label }) => (
              <button
                className={activeCategory === label ? "active" : ""}
                key={label}
                onClick={() => setActiveCategory(label)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="post-list">
            {visiblePosts.length ? (
              visiblePosts.map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  isLiked={liked.has(post.id)}
                  onLike={() => toggleLike(post.id)}
                  onOpen={() => setSelectedPost(post)}
                />
              ))
            ) : (
              <div className="empty-state">
                <Search size={34} />
                <h2>没有找到相关讨论</h2>
                <p>换一个关键词，或浏览其他分类。</p>
              </div>
            )}
          </div>

          <nav className="pagination" aria-label="分页">
            <button className="active">1</button>
            <button>2</button>
            <button>3</button>
            <button>4</button>
            <button>下一页</button>
          </nav>
        </section>

        <RightRail onFeedback={() => window.location.assign("/feedback")} />
      </main>

      <Footer />

      {composerOpen ? (
        <Composer onClose={() => setComposerOpen(false)} onCreate={createPost} />
      ) : null}
      {selectedPost ? (
        <PostDialog
          post={selectedPost}
          isLiked={liked.has(selectedPost.id)}
          onLike={() => toggleLike(selectedPost.id)}
          onClose={() => setSelectedPost(null)}
          onPromote={() => showToast("VIP 高亮已应用")}
        />
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function Header({
  query,
  onQuery,
  mobileNavOpen,
  onToggleMobileNav,
}: {
  query: string;
  onQuery: (value: string) => void;
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
}) {
  return (
    <header className="header">
      <button
        className="mobile-menu"
        onClick={onToggleMobileNav}
        aria-label={mobileNavOpen ? "关闭导航" : "打开导航"}
      >
        {mobileNavOpen ? <X /> : <Menu />}
      </button>
      <a className="brand" href="/" aria-label="FishBall 首页">
        <span className="brand-cube">F</span>
        <strong>FishBall</strong>
        <span className="version">V2</span>
      </a>
      <a className="v1-bridge-link" href="https://mcfishball.top">
        ← 返回 V1 主站
      </a>
      <nav className="main-nav" aria-label="主导航">
        <a href="/">
          <Server size={18} /> 服务器
        </a>
        <a className="active" href="/forum">
          <MessageSquare size={18} /> 论坛
        </a>
        <a href="/submit-server">
          <Plus size={18} /> 提交服务器
        </a>
      </nav>
      <label className="search">
        <Search size={17} />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="搜索帖子、用户或服务器…"
          aria-label="搜索论坛"
        />
        <kbd>/</kbd>
      </label>
      <button className="icon-button" aria-label="通知">
        <Bell size={19} />
      </button>
      <button className="profile">
        <span className="avatar">🧑</span>
        <span className="profile-copy">
          <strong>FishBall_玩家</strong>
          <span>
            LV.12 <em>VIP</em>
          </span>
        </span>
        <ChevronDown size={15} />
      </button>
    </header>
  );
}

function Sidebar({
  activeCategory,
  onSelect,
  onCompose,
  mobileNavOpen,
}: {
  activeCategory: Category;
  onSelect: (category: Category) => void;
  onCompose: () => void;
  mobileNavOpen: boolean;
}) {
  return (
    <aside className={`sidebar ${mobileNavOpen ? "open" : ""}`}>
      <button className="compose-button" onClick={onCompose}>
        <FileText size={18} /> 发布帖子
      </button>
      <nav aria-label="论坛分类">
        {categories.map(({ label, icon: Icon }) => (
          <button
            className={activeCategory === label ? "active" : ""}
            key={label}
            onClick={() => onSelect(label)}
          >
            <Icon size={19} /> {label}
          </button>
        ))}
      </nav>
      <div className="sidebar-note">
        <Crown size={18} />
        <div>
          <strong>VIP 社区特权</strong>
          <span>帖子置顶 · 高亮展示</span>
        </div>
      </div>
      <div className="pixel-ground" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </aside>
  );
}

function PostRow({
  post,
  isLiked,
  onLike,
  onOpen,
}: {
  post: Post;
  isLiked: boolean;
  onLike: () => void;
  onOpen: () => void;
}) {
  if (post.pinned) {
    return (
      <article className="pinned-post">
        <Pin size={19} fill="currentColor" />
        <button className="post-title" onClick={onOpen}>
          <span className="vip-label">VIP</span>
          {post.title}
        </button>
        <span className="pinned-author">{post.avatar} {post.author}</span>
        <PostMetrics post={post} isLiked={isLiked} onLike={onLike} />
        <span className="pin-label">置顶</span>
      </article>
    );
  }

  return (
    <article className="post-row">
      <button className="post-main" onClick={onOpen}>
        <span className="post-avatar">{post.avatar}</span>
        <span className="post-copy">
          <span className="post-title">{post.title}</span>
          <span className="post-tags">
            <span className={categoryClass[post.category]}>{post.category}</span>
            <span>{post.tag}</span>
          </span>
        </span>
      </button>
      <span className={`post-author ${post.official ? "official" : ""}`}>
        {post.author}
      </span>
      <span className="post-age">{post.age}</span>
      <PostMetrics post={post} isLiked={isLiked} onLike={onLike} />
    </article>
  );
}

function PostMetrics({
  post,
  isLiked,
  onLike,
}: {
  post: Post;
  isLiked: boolean;
  onLike: () => void;
}) {
  return (
    <span className="metrics">
      <span title="评论">
        <MessageSquare size={16} /> {post.comments}
      </span>
      <button className={isLiked ? "liked" : ""} onClick={onLike} title="点赞">
        <ThumbsUp size={16} fill={isLiked ? "currentColor" : "none"} />
        {post.likes + (isLiked ? 1 : 0)}
      </button>
    </span>
  );
}

function RightRail({ onFeedback }: { onFeedback: () => void }) {
  return (
    <aside className="right-rail">
      <section className="rail-section">
        <div className="rail-heading">
          <h2>热门服务器</h2>
          <button>查看全部</button>
        </div>
        <ol className="server-ranking">
          {servers.map(([name, players, icon], index) => (
            <li key={name}>
              <span className={`rank rank-${index + 1}`}>{index + 1}</span>
              <span className="server-icon">{icon}</span>
              <span className="server-copy">
                <strong>{name}</strong>
                <span>{players}</span>
              </span>
              <span className="online-dot" title="在线" />
            </li>
          ))}
        </ol>
      </section>
      <section className="rail-section rules">
        <h2>社区公约</h2>
        <Rule icon={ShieldCheck} title="遵守法律法规" copy="不发布违法或危险内容。" />
        <Rule icon={Heart} title="友善交流" copy="尊重他人，文明发言。" />
        <Rule icon={Flame} title="禁止广告" copy="禁止引流或无关推广。" />
        <Rule icon={LockKeyhole} title="保护隐私" copy="不公开他人私人资料。" />
        <button className="text-button">查看完整公约 →</button>
      </section>
      <button className="feedback-button" onClick={onFeedback}>
        <MessageSquare size={16} /> 反馈建议
      </button>
    </aside>
  );
}

function Rule({
  icon: Icon,
  title,
  copy,
}: {
  icon: typeof Home;
  title: string;
  copy: string;
}) {
  return (
    <div className="rule">
      <Icon size={19} />
      <div>
        <strong>{title}</strong>
        <span>{copy}</span>
      </div>
    </div>
  );
}

function Composer({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (post: Post) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Post["category"]>("服务器讨论");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 3 || content.trim().length < 10) return;
    setSubmitting(true);
    await onCreate({
      id: crypto.randomUUID(),
      title: title.trim(),
      content: content.trim(),
      category,
      tag: "新帖",
      author: "FishBall_玩家",
      age: "刚刚",
      comments: 0,
      likes: 0,
      avatar: "🧑",
    });
    setSubmitting(false);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal composer" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <h2>发布新帖子</h2>
            <p>清晰描述你的话题，更容易获得高质量回复。</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={19} />
          </button>
        </div>
        <label>
          分类
          <select value={category} onChange={(e) => setCategory(e.target.value as Post["category"])}>
            <option>服务器讨论</option>
            <option>求助</option>
            <option>闲聊</option>
          </select>
        </label>
        <label>
          标题
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="一句话说明你想讨论的内容"
            maxLength={160}
          />
        </label>
        <label>
          正文
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="补充背景、版本和你已经尝试过的方法…"
            rows={7}
            maxLength={20000}
          />
        </label>
        <div className="modal-footer">
          <span>{content.length} / 20000</span>
          <div>
            <button type="button" className="secondary-button" onClick={onClose}>
              取消
            </button>
            <button
              className="primary-button"
              disabled={
                submitting ||
                title.trim().length < 3 ||
                content.trim().length < 10
              }
            >
              <Send size={16} /> {submitting ? "发布中…" : "发布帖子"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function PostDialog({
  post,
  isLiked,
  onLike,
  onClose,
  onPromote,
}: {
  post: Post;
  isLiked: boolean;
  onLike: () => void;
  onClose: () => void;
  onPromote: () => void;
}) {
  const [comments, setComments] = useState<ForumComment[]>(
    isSupabaseConfigured
      ? []
      : [{
          id: "demo-comment",
          author: "方块旅人",
          body: "这个话题很有帮助，感谢分享！",
          age: "12 分钟前",
        }],
  );
  const [comment, setComment] = useState("");
  const [commentStatus, setCommentStatus] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void listComments(post.id)
      .then(setComments)
      .catch(() => setCommentStatus("评论加载失败"));
  }, [post.id]);

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    setCommentStatus("");
    try {
      const savedComment = isSupabaseConfigured
        ? await createComment(post.id, comment.trim())
        : {
            id: crypto.randomUUID(),
            author: "FishBall_玩家",
            body: comment.trim(),
            age: "刚刚",
          };
      setComments((current) => [...current, savedComment]);
      setComment("");
    } catch (error) {
      setCommentStatus(error instanceof Error ? error.message : "评论发布失败");
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <article className="modal post-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <div className="dialog-meta">
            <span className={categoryClass[post.category]}>{post.category}</span>
            <span>{post.age}</span>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={19} />
          </button>
        </div>
        <h2>{post.title}</h2>
        <div className="dialog-author">
          <span className="post-avatar">{post.avatar}</span>
          <div>
            <strong>{post.author}</strong>
            <span>LV.18 · 社区成员</span>
          </div>
        </div>
        <p className="dialog-content">{post.content}</p>
        <div className="dialog-actions">
          <button className={isLiked ? "secondary-button liked" : "secondary-button"} onClick={onLike}>
            <ThumbsUp size={16} fill={isLiked ? "currentColor" : "none"} />
            {isLiked ? "已点赞" : "点赞"} · {post.likes + (isLiked ? 1 : 0)}
          </button>
          <button className="vip-button" onClick={onPromote}>
            <Sparkles size={16} /> VIP 高亮
          </button>
        </div>
        <div className="comments">
          <h3>评论 {post.comments + comments.length}</h3>
          {comments.map((item, index) => (
            <div className="comment" key={`${item.author}-${index}`}>
              <span className="comment-avatar"><UserRound size={17} /></span>
              <div>
                <strong>{item.author}</strong>
                <p>{item.body}</p>
                <span>{item.age}</span>
              </div>
            </div>
          ))}
          <form className="comment-form" onSubmit={submitComment}>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="友善地参与讨论…"
              aria-label="发表评论"
            />
            <button disabled={!comment.trim()} aria-label="发送评论">
              <Send size={17} />
            </button>
          </form>
          {commentStatus ? <p className="form-status">{commentStatus}</p> : null}
        </div>
      </article>
    </div>
  );
}

function Footer() {
  return (
    <footer>
      <span>© 2026 FishBall Community</span>
      <nav>
        <a href="#">关于我们</a>
        <a href="#">帮助中心</a>
        <a href="/feedback">反馈建议</a>
        <a href="#">API</a>
        <a href="#">状态页面</a>
      </nav>
    </footer>
  );
}
