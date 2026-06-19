import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("src/App.tsx", "utf8");
const api = readFileSync("src/lib/forum-api.ts", "utf8");
const data = readFileSync("src/data.ts", "utf8");
const cleanup = readFileSync(
  "supabase/migrations/202606190005_remove_fake_forum_data.sql",
  "utf8",
);
const auth = readFileSync("src/lib/supabase.ts", "utf8");

assert.doesNotMatch(app, /initialPosts|demo-comment|isSupabaseConfigured\s*\?/);
assert.doesNotMatch(data, /demo-post|initialPosts/);
assert.doesNotMatch(data, /像素王国|方块大陆|热门服务器/);
assert.match(api, /\.from\("posts"\)\s*\.select\("\*"\)/s);
assert.match(api, /\.from\("comments"\)/);
assert.match(api, /\.from\("post_likes"\)/);
assert.match(api, /requireUserId\(\)/);
assert.match(api, /postgres_changes/);
assert.match(cleanup, /delete from public\.posts/i);
assert.match(cleanup, /supabase_realtime/);
assert.match(auth, /supabase\.auth\.getSession\(\)/);
assert.match(auth, /supabase\.auth\.onAuthStateChange/);
assert.match(auth, /persistSession: true/);
assert.doesNotMatch(app, /isLoggedIn|mock user|localStorage.*user/i);

console.log("Forum regression checks passed");
