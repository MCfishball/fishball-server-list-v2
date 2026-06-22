import {
  Bell,
  ChevronDown,
  CircleHelp,
  Clock3,
  Crown,
  Edit3,
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
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Category, Post } from "./data";
import {
  createComment,
  createPost as createDatabasePost,
  ForumPostingLimits,
  ForumComment,
  getPost,
  getCurrentPostingLimits,
  highlightPost,
  listComments,
  listCurrentUserLikes,
  listPosts,
  setPostLike,
  softDeletePost,
  subscribeToForumChanges,
  updatePost as updateDatabasePost,
} from "./lib/forum-api";
import { getCurrentSession, onAuthSessionChange } from "./lib/supabase";

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

export function App({ initialPostId }: { initialPostId?: string } = {}) {
  const [activeCategory, setActiveCategory] = useState<Category>("全部讨论");
  const [query, setQuery] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [liked, setLiked] = useState<Set<string>>(() => new Set());
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [forumError, setForumError] = useState("");
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [postingLimits, setPostingLimits] = useState<ForumPostingLimits | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const isAdmin = postingLimits?.role === "admin";

  useEffect(() => {
    let active = true;

    void getCurrentSession()
      .then((currentSession) => {
        if (active) setSession(currentSession);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });

    const unsubscribe = onAuthSessionChange((nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!initialPostId) return;

    let active = true;
    void getPost(initialPostId)
      .then((post) => {
        if (active) setSelectedPost(post);
      })
      .catch((error) => {
        if (active) showToast(error instanceof Error ? error.message : "帖子加载失败");
      });

    return () => {
      active = false;
    };
  }, [initialPostId]);

  useEffect(() => {
    if (!session?.user.id) {
      setLiked(new Set());
      setPostingLimits(null);
      return;
    }

    void Promise.all([
      listCurrentUserLikes().then(setLiked).catch(() => setLiked(new Set())),
      getCurrentPostingLimits().then(setPostingLimits).catch(() => setPostingLimits(null)),
    ]);
  }, [session?.user.id]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [databasePosts, databaseLikes] = await Promise.all([
          listPosts(),
          listCurrentUserLikes().catch(() => new Set<string>()),
        ]);
        if (!active) return;
        setPosts(databasePosts);
        setLiked(databaseLikes);
        setForumError("");
      } catch (error) {
        if (!active) return;
        setPosts([]);
        setForumError(error instanceof Error ? error.message : "论坛数据加载失败");
      } finally {
        if (active) setLoadingPosts(false);
      }
    };

    void load();
    const unsubscribe = subscribeToForumChanges(() => void load());
    return () => {
      active = false;
      unsubscribe();
    };
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

  const refreshForumData = async () => {
    const [databasePosts, databaseLikes, nextPostingLimits] = await Promise.all([
      listPosts(),
      listCurrentUserLikes().catch(() => new Set<string>()),
      getCurrentPostingLimits().catch(() => null),
    ]);

    setPosts(databasePosts);
    setLiked(databaseLikes);
    if (nextPostingLimits) setPostingLimits(nextPostingLimits);
    return databasePosts;
  };

  const canManagePost = (post: Post) => Boolean(session?.user.id && (post.userId === session.user.id || isAdmin));

  const openPost = (post: Post) => {
    setSelectedPost(post);
    window.history.replaceState(null, "", `/forum/posts/${post.id}`);
  };

  const closePost = () => {
    setSelectedPost(null);
    if (window.location.pathname.startsWith("/forum/posts/")) {
      window.history.replaceState(null, "", "/forum");
    }
  };

  const toggleLike = async (postId: string) => {
    const willLike = !liked.has(postId);
    try {
      await setPostLike(postId, willLike);
      const [databasePosts, databaseLikes] = await Promise.all([
        listPosts(),
        listCurrentUserLikes(),
      ]);
      setPosts(databasePosts);
      setLiked(databaseLikes);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "点赞失败");
    }
  };

  const createPost = async (post: Pick<Post, "title" | "content" | "category">) => {
    try {
      await createDatabasePost(post);
      const [databasePosts, nextPostingLimits] = await Promise.all([
        listPosts(),
        getCurrentPostingLimits().catch(() => null),
      ]);
      setPosts(databasePosts);
      if (nextPostingLimits) setPostingLimits(nextPostingLimits);
      setComposerOpen(false);
      setActiveCategory("全部讨论");
      showToast("帖子已发布");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "发布失败");
      return false;
    }
  };

  const editPost = async (post: Post, input: Pick<Post, "title" | "content">) => {
    try {
      const updatedPost = await updateDatabasePost(post.id, input);
      const refreshedPosts = await refreshForumData();
      const refreshedPost = refreshedPosts.find((item) => item.id === post.id) ?? {
        ...post,
        ...updatedPost,
        title: input.title,
        content: input.content,
        edited: true,
      };

      setSelectedPost((current) => (current?.id === post.id ? refreshedPost : current));
      setEditingPost(null);
      showToast("修改成功");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "修改帖子失败");
      return false;
    }
  };

  const deletePost = async (post: Post) => {
    if (!window.confirm("确认删除这篇帖子吗？删除后不会恢复，并且仍然计入今日发帖次数。")) {
      return;
    }

    try {
      await softDeletePost(post.id);
      await refreshForumData();
      setSelectedPost(null);
      setEditingPost(null);
      if (window.location.pathname.startsWith("/forum/posts/")) {
        window.history.replaceState(null, "", "/forum");
      }
      showToast("帖子已删除");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "删除帖子失败");
    }
  };

  const promotePost = async (postId: string) => {
    try {
      await highlightPost(postId);
      setPosts(await listPosts());
      showToast("VIP 高亮已保存到数据库");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "高亮失败");
    }
  };

  return (
    <div className="app">
      <Header
        query={query}
        onQuery={setQuery}
        mobileNavOpen={mobileNavOpen}
        onToggleMobileNav={() => setMobileNavOpen((value) => !value)}
        session={session}
        authReady={authReady}
      />

      <main className="layout">
        <Sidebar
          activeCategory={activeCategory}
          onSelect={(category) => {
            setActiveCategory(category);
            setMobileNavOpen(false);
          }}
          onCompose={() => {
            if (!session) {
              showToast("请先在 V1 登录，再通过主站“论坛”入口进入");
              return;
            }
            setComposerOpen(true);
          }}
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

          <div className="post-list" aria-busy={loadingPosts}>
            {loadingPosts ? (
              <div className="empty-state">
                <Clock3 size={34} />
                <h2>正在读取论坛</h2>
                <p>帖子只从 Supabase 数据库加载。</p>
              </div>
            ) : forumError ? (
              <div className="empty-state">
                <CircleHelp size={34} />
                <h2>论坛暂时无法加载</h2>
                <p>{forumError}</p>
              </div>
            ) : visiblePosts.length ? (
              visiblePosts.map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  isLiked={liked.has(post.id)}
                  canManage={canManagePost(post)}
                  onLike={() => toggleLike(post.id)}
                  onOpen={() => openPost(post)}
                  onEdit={() => setEditingPost(post)}
                  onDelete={() => deletePost(post)}
                />
              ))
            ) : (
              <div className="empty-state">
                <Search size={34} />
                <h2>{posts.length ? "没有找到相关讨论" : "暂无真实帖子"}</h2>
                <p>
                  {posts.length
                    ? "换一个关键词，或浏览其他分类。"
                    : "发布第一条来自 Supabase 的讨论。"}
                </p>
              </div>
            )}
          </div>

        </section>

        <RightRail onFeedback={() => window.location.assign("/feedback")} />
      </main>

      <Footer />

      {composerOpen ? (
        <Composer
          onClose={() => setComposerOpen(false)}
          onCreate={createPost}
          postingLimits={postingLimits}
        />
      ) : null}
      {editingPost ? (
        <EditPostModal
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSave={(input) => editPost(editingPost, input)}
        />
      ) : null}
      {selectedPost ? (
        <PostDialog
          post={posts.find((post) => post.id === selectedPost.id) ?? selectedPost}
          isLiked={liked.has(selectedPost.id)}
          onLike={() => toggleLike(selectedPost.id)}
          onClose={closePost}
          onPromote={() => promotePost(selectedPost.id)}
          canInteract={Boolean(session)}
          canManage={canManagePost(selectedPost)}
          onEdit={() => setEditingPost(posts.find((post) => post.id === selectedPost.id) ?? selectedPost)}
          onDelete={() => deletePost(posts.find((post) => post.id === selectedPost.id) ?? selectedPost)}
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
  session,
  authReady,
}: {
  query: string;
  onQuery: (value: string) => void;
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
  session: Session | null;
  authReady: boolean;
}) {
  const accountName = session?.user.email?.split("@")[0] ?? "社区账户";

  return (
    <header className="header">
      <button
        className="mobile-menu"
        onClick={onToggleMobileNav}
        aria-label={mobileNavOpen ? "关闭导航" : "打开导航"}
      >
        {mobileNavOpen ? <X /> : <Menu />}
      </button>
      <a className="brand" href="/" aria-label="Minecraft 论坛首页">
        <span className="brand-cube">F</span>
        <strong>Minecraft 论坛</strong>
        <span className="version">V2</span>
      </a>
      <a className="v1-bridge-link" href="https://mcfishball.top">
        返回首页
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
          <strong>{accountName}</strong>
          <span>{authReady ? (session ? "已登录 · 可参与讨论" : "请先登录") : "正在恢复登录状态…"}</span>
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
  canManage,
  onLike,
  onOpen,
  onEdit,
  onDelete,
}: {
  post: Post;
  isLiked: boolean;
  canManage: boolean;
  onLike: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const actionButtons = canManage ? (
    <span className="post-row-actions">
      <button
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
      >
        <Edit3 size={14} /> 编辑
      </button>
      <button
        className="danger"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 size={14} /> 删除
      </button>
    </span>
  ) : null;

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
        {post.edited && <span className="edited-label">已编辑</span>}
        {actionButtons}
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
            {post.edited && <span>已编辑</span>}
          </span>
        </span>
      </button>
      <span className={`post-author ${post.official ? "official" : ""}`}>
        {post.author}
      </span>
      <span className="post-age">{post.age}</span>
      <PostMetrics post={post} isLiked={isLiked} onLike={onLike} />
      {actionButtons}
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
        {post.likes}
      </button>
    </span>
  );
}

function RightRail({ onFeedback }: { onFeedback: () => void }) {
  return (
    <aside className="right-rail">
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
  postingLimits,
}: {
  onClose: () => void;
  onCreate: (post: Pick<Post, "title" | "content" | "category">) => Promise<boolean>;
  postingLimits: ForumPostingLimits | null;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<Post["category"]>("服务器讨论");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 3 || content.trim().length < 10 || isDailyLimitExceeded) return;
    setSubmitting(true);
    await onCreate({
      title: title.trim(),
      content: content.trim(),
      category,
    });
    setSubmitting(false);
  };

  const postingLimitText = (() => {
    if (!postingLimits) return "正在读取今日发帖额度…";
    if (postingLimits.role === "admin") return "管理员发帖不限每日数量，也不限制冷却时间";
    if (postingLimits.role === "vip") {
      return `今日还可发布 ${postingLimits.remainingToday ?? 0} / 3 篇帖子`;
    }
    return `今日还可发布 ${postingLimits.remainingToday ?? 0} / 1 篇帖子`;
  })();

  const cooldownText =
    postingLimits?.role === "admin"
      ? "无冷却"
      : postingLimits
        ? `发帖冷却 ${postingLimits.cooldownSeconds} 秒${
            postingLimits.cooldownRemainingSeconds > 0
              ? `，还需等待 ${postingLimits.cooldownRemainingSeconds} 秒`
              : ""
          }`
        : "正在读取冷却时间…";

  const isDailyLimitExceeded =
    Boolean(postingLimits) &&
    postingLimits?.role !== "admin" &&
    (postingLimits?.remainingToday ?? 0) <= 0;

  const dailyLimitWarning =
    isDailyLimitExceeded && postingLimits?.role === "vip"
      ? "VIP用户每天最多发布 3 个帖子，今日发帖额度已用完。"
      : isDailyLimitExceeded
        ? "普通用户每天最多发布 1 个帖子，开通 VIP 可提升至 3 个。今日发帖额度已用完。"
        : "";

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal composer" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <h2>发布新帖子</h2>
            <p>清晰描述你的话题，更容易获得高质量回复。</p>
            <p className="posting-limit-hint">
              {postingLimitText} · {cooldownText}
            </p>
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
                content.trim().length < 10 ||
                isDailyLimitExceeded
              }
            >
              <Send size={16} /> {submitting ? "发布中…" : "发布帖子"}
            </button>
          </div>
        </div>
        {dailyLimitWarning ? (
          <p className="form-status limit-warning" role="alert">
            {dailyLimitWarning}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function EditPostModal({
  post,
  onClose,
  onSave,
}: {
  post: Post;
  onClose: () => void;
  onSave: (input: Pick<Post, "title" | "content">) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content);
  const [submitting, setSubmitting] = useState(false);
  const titleValid = title.trim().length >= 3;
  const contentValid = content.trim().length >= 10;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!titleValid || !contentValid) return;

    setSubmitting(true);
    const saved = await onSave({
      title: title.trim(),
      content: content.trim(),
    });
    setSubmitting(false);

    if (saved) onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal composer" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <h2>编辑帖子</h2>
            <p>只能修改标题和正文，已删除帖子不能再编辑。</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={19} />
          </button>
        </div>

        <label>
          标题
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题至少 3 个字"
            maxLength={160}
          />
        </label>
        {!titleValid ? <p className="form-status limit-warning">标题至少 3 个字。</p> : null}

        <label>
          正文
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="内容至少 10 个字"
            rows={7}
            maxLength={20000}
          />
        </label>
        {!contentValid ? <p className="form-status limit-warning">内容至少 10 个字。</p> : null}

        <div className="modal-footer">
          <span>{content.length} / 20000</span>
          <div>
            <button type="button" className="secondary-button" onClick={onClose}>
              取消
            </button>
            <button className="primary-button" disabled={submitting || !titleValid || !contentValid}>
              <Send size={16} /> {submitting ? "保存中…" : "保存修改"}
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
  canInteract,
  canManage,
  onEdit,
  onDelete,
}: {
  post: Post;
  isLiked: boolean;
  onLike: () => void;
  onClose: () => void;
  onPromote: () => void;
  canInteract: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [comment, setComment] = useState("");
  const [commentStatus, setCommentStatus] = useState("");

  useEffect(() => {
    void listComments(post.id)
      .then(setComments)
      .catch(() => setCommentStatus("评论加载失败"));
  }, [post.id]);

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    setCommentStatus("");
    try {
      await createComment(post.id, comment.trim());
      setComments(await listComments(post.id));
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
            {post.edited && !post.isDeleted ? <span>已编辑</span> : null}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={19} />
          </button>
        </div>
        {post.isDeleted ? (
          <div className="deleted-post-state">
            <Trash2 size={28} />
            <h2>该帖子已被作者删除</h2>
            <p>删除不会恢复发帖额度，这篇帖子仍然计入作者今日发帖次数。</p>
          </div>
        ) : (
          <>
        <h2>{post.title}</h2>
        <div className="dialog-author">
          <span className="post-avatar">{post.avatar}</span>
          <div>
            <strong>{post.author}</strong>
          </div>
        </div>
        <p className="dialog-content">{post.content}</p>
        <div className="dialog-actions">
          <button
            className={isLiked ? "secondary-button liked" : "secondary-button"}
            onClick={onLike}
            disabled={!canInteract}
          >
            <ThumbsUp size={16} fill={isLiked ? "currentColor" : "none"} />
            {isLiked ? "已点赞" : "点赞"} · {post.likes}
          </button>
          <button className="vip-button" onClick={onPromote}>
            <Sparkles size={16} /> VIP 高亮
          </button>
          {canManage ? (
            <>
              <button className="secondary-button" onClick={onEdit}>
                <Edit3 size={16} /> 编辑
              </button>
              <button className="danger-button" onClick={onDelete}>
                <Trash2 size={16} /> 删除
              </button>
            </>
          ) : null}
        </div>
        <div className="comments">
          <h3>评论 {comments.length}</h3>
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
              placeholder={canInteract ? "友善地参与讨论…" : "请先在 V1 登录"}
              aria-label="发表评论"
              disabled={!canInteract}
            />
            <button disabled={!canInteract || !comment.trim()} aria-label="发送评论">
              <Send size={17} />
            </button>
          </form>
          {commentStatus ? <p className="form-status">{commentStatus}</p> : null}
        </div>
          </>
        )}
      </article>
    </div>
  );
}

function Footer() {
  return (
    <footer>
      <span>© 2026 Minecraft 论坛</span>
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
