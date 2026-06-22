import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/App.tsx", "utf8");
const api = readFileSync("src/lib/forum-api.ts", "utf8");
const data = readFileSync("src/data.ts", "utf8");
const cleanup = readFileSync(
  "supabase/migrations/202606190005_remove_fake_forum_data.sql",
  "utf8",
);
const postLimits = readFileSync(
  "supabase/migrations/202606220006_v2_forum_post_limits.sql",
  "utf8",
);
const softDelete = readFileSync(
  "supabase/migrations/202606220007_v2_forum_author_edit_soft_delete.sql",
  "utf8",
);
const auth = readFileSync("src/lib/supabase.ts", "utf8");
const forumPostApi = readFileSync("api/forum/posts/[id].js", "utf8");

assert.doesNotMatch(app, /initialPosts|demo-comment|isSupabaseConfigured\s*\?/);
assert.doesNotMatch(data, /demo-post|initialPosts/);
assert.doesNotMatch(data, /像素王国|方块大陆|热门服务器/);
assert.match(api, /\.from\("posts"\)\s*\.select\("\*"\)/s);
assert.match(api, /\.eq\("is_deleted", false\)/);
assert.match(api, /\.from\("comments"\)/);
assert.match(api, /\.from\("post_likes"\)/);
assert.match(api, /requireUserId\(\)/);
assert.match(api, /postgres_changes/);
assert.match(api, /getCurrentPostingLimits/);
assert.match(api, /普通用户每天最多发布 1 个帖子，开通 VIP 可提升至 3 个/);
assert.match(api, /VIP用户每天最多发布 3 个帖子/);
assert.match(api, /updatePost/);
assert.match(api, /softDeletePost/);
assert.match(api, /\/api\/forum\/posts\/\$\{encodeURIComponent\(postId\)\}/);
assert.match(cleanup, /delete from public\.posts/i);
assert.match(cleanup, /supabase_realtime/);
assert.match(auth, /supabase\.auth\.getSession\(\)/);
assert.match(auth, /supabase\.auth\.onAuthStateChange/);
assert.match(auth, /persistSession: true/);
assert.doesNotMatch(app, /isLoggedIn|mock user|localStorage.*user/i);
assert.doesNotMatch(app, /VIP.*10|10.*篇|10.*帖子/i);
assert.doesNotMatch(api, /VIP.*10|10.*篇|10.*帖子/i);
assert.match(app, /今日还可发布 \$\{postingLimits\.remainingToday \?\? 0\} \/ 1 篇帖子/);
assert.match(app, /今日还可发布 \$\{postingLimits\.remainingToday \?\? 0\} \/ 3 篇帖子/);
assert.match(app, /管理员发帖不限每日数量，也不限制冷却时间/);
assert.match(app, /isDailyLimitExceeded/);
assert.match(app, /role="alert"/);
assert.match(app, /今日发帖额度已用完/);
assert.match(app, /普通用户每天最多发布 1 个帖子，开通 VIP 可提升至 3 个。今日发帖额度已用完。/);
assert.match(app, /VIP用户每天最多发布 3 个帖子，今日发帖额度已用完。/);
assert.match(postLimits, /Normal users: 1 post/);
assert.match(postLimits, /VIP users:\s+3 posts/);
assert.match(postLimits, /Admins:\s+unlimited posts/);
assert.match(postLimits, /daily_limit := 3/);
assert.match(postLimits, /cooldown_seconds := 20/);
assert.match(postLimits, /daily_limit := 1/);
assert.match(postLimits, /cooldown_seconds := 60/);
assert.match(postLimits, /VIP用户每天最多发布 3 个帖子/);
assert.match(postLimits, /普通用户每天最多发布 1 个帖子，开通 VIP 可提升至 3 个/);
assert.match(postLimits, /posts_enforce_create_limits/);
assert.match(postLimits, /count\(\*\)::integer, max\(created_at\)/);
assert.doesNotMatch(postLimits, /is_deleted\s*=\s*false/, "daily posting limit must include soft-deleted posts");
assert.doesNotMatch(postLimits, /daily_limit := 10|10 posts|10 个帖子|10 篇帖子/);
assert.match(softDelete, /add column if not exists is_deleted boolean not null default false/);
assert.match(softDelete, /add column if not exists deleted_at timestamptz/);
assert.match(softDelete, /add column if not exists deleted_by uuid/);
assert.match(softDelete, /add column if not exists edited_at timestamptz/);
assert.match(softDelete, /fishball_v2_update_post/);
assert.match(softDelete, /fishball_v2_soft_delete_post/);
assert.match(softDelete, /set is_deleted = true/);
assert.match(softDelete, /using \(false\)/, "physical DELETE policy should be disabled");
assert.doesNotMatch(softDelete, /delete from public\.posts/i, "soft-delete migration must not physically delete posts");
assert.match(forumPostApi, /method === "PATCH"/);
assert.match(forumPostApi, /method === "DELETE"/);
assert.match(forumPostApi, /请先登录/);
assert.match(forumPostApi, /你没有权限操作这个帖子/);
assert.match(forumPostApi, /fishball_v2_update_post/);
assert.match(forumPostApi, /fishball_v2_soft_delete_post/);
assert.doesNotMatch(forumPostApi, /\.from\("posts"\)\.delete\(\)/);
assert.match(app, /确认删除这篇帖子吗？删除后不会恢复，并且仍然计入今日发帖次数。/);
assert.match(app, /该帖子已被作者删除/);
assert.match(app, /已编辑/);
assert.match(app, /编辑帖子/);
assert.match(app, /保存修改/);

console.log("Forum regression checks passed");
