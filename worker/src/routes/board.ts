import { json, Env } from '../index';
import type { JWTPayload } from '../lib/auth';
import { sendPushToPlayer } from '../lib/sendPush';

function nanoid() { return crypto.randomUUID(); }

function parseAttachments(row: any) {
  const json = row.attachments_json;
  const parsed = json ? JSON.parse(json) : [];
  // JSON_GROUP_ARRAY returnerer '[null]' hvis ingen rækker matcher
  const attachments = Array.isArray(parsed) ? parsed.filter((a: any) => a && a.id) : [];
  const { attachments_json: _, ...rest } = row;
  return { ...rest, attachments };
}

export async function handleBoard(
  request: Request,
  env: Env,
  user: JWTPayload,
  postId?: string,
  sub?: string,         // 'comments', 'pin', 'attachments', 'read', or comment id
  commentId?: string,
): Promise<Response> {
  const isTrainer = user.role === 'admin' || user.role === 'trainer';
  const url = new URL(request.url);

  // ── POST /api/board/read ──────────────────────────────────────────────────
  if (!postId && request.method === 'POST' && url.pathname.endsWith('/read')) {
    await env.DB.prepare(`
      INSERT INTO board_reads (player_id, last_read_at) VALUES (?, datetime('now'))
      ON CONFLICT(player_id) DO UPDATE SET last_read_at = datetime('now')
    `).bind(user.sub).run();
    return json({ ok: true });
  }

  // ── GET /api/board/posts ──────────────────────────────────────────────────
  if (!postId && request.method === 'GET') {
    const page  = Number(url.searchParams.get('page') || '1');
    const limit = Number(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;
    const q = url.searchParams.get('q')?.trim() || '';

    if (q) {
      // Søgning: ingen paginering, ingen pinned-split, søg i titel+body
      const like = `%${q}%`;
      const results = await env.DB.prepare(`
        SELECT bp.*, COALESCE(p.alias, p.name) as author_name, p.avatar_url as author_avatar_url,
          (SELECT COUNT(*) FROM board_comments bc WHERE bc.post_id=bp.id AND bc.deleted=0) as comment_count,
          (SELECT COUNT(*) FROM board_attachments ba WHERE ba.post_id=bp.id) as attachment_count,
          (SELECT JSON_GROUP_ARRAY(JSON_OBJECT('id',ba.id,'type',ba.type,'filename',ba.filename,'url',ba.url,'size_bytes',ba.size_bytes)) FROM board_attachments ba WHERE ba.post_id=bp.id) as attachments_json
        FROM board_posts bp
        JOIN players p ON p.id = bp.player_id
        WHERE bp.deleted=0 AND (bp.title LIKE ? OR bp.body LIKE ?)
        ORDER BY bp.pinned DESC, bp.created_at DESC
        LIMIT 50
      `).bind(like, like).all();
      const searchPosts = (results.results as any[]).map(parseAttachments);
      return json({ pinned: [], posts: searchPosts, total: searchPosts.length, page: 1, hasMore: false });
    }

    const total = await env.DB.prepare(
      "SELECT COUNT(*) as n FROM board_posts WHERE deleted=0 AND pinned=0"
    ).first() as any;

    // Pinned altid øverst, derefter faldende created_at, med paginering (pinned excl. fra offset)
    const pinned = await env.DB.prepare(`
      SELECT bp.*, COALESCE(p.alias, p.name) as author_name, p.avatar_url as author_avatar_url,
        (SELECT COUNT(*) FROM board_comments bc WHERE bc.post_id=bp.id AND bc.deleted=0) as comment_count,
        (SELECT COUNT(*) FROM board_attachments ba WHERE ba.post_id=bp.id) as attachment_count,
        (SELECT JSON_GROUP_ARRAY(JSON_OBJECT('id',ba.id,'type',ba.type,'filename',ba.filename,'url',ba.url,'size_bytes',ba.size_bytes)) FROM board_attachments ba WHERE ba.post_id=bp.id) as attachments_json
      FROM board_posts bp
      JOIN players p ON p.id = bp.player_id
      WHERE bp.deleted=0 AND bp.pinned=1
      ORDER BY bp.created_at DESC
    `).all();

    const posts = await env.DB.prepare(`
      SELECT bp.*, COALESCE(p.alias, p.name) as author_name, p.avatar_url as author_avatar_url,
        (SELECT COUNT(*) FROM board_comments bc WHERE bc.post_id=bp.id AND bc.deleted=0) as comment_count,
        (SELECT COUNT(*) FROM board_attachments ba WHERE ba.post_id=bp.id) as attachment_count,
        (SELECT JSON_GROUP_ARRAY(JSON_OBJECT('id',ba.id,'type',ba.type,'filename',ba.filename,'url',ba.url,'size_bytes',ba.size_bytes)) FROM board_attachments ba WHERE ba.post_id=bp.id) as attachments_json
      FROM board_posts bp
      JOIN players p ON p.id = bp.player_id
      WHERE bp.deleted=0 AND bp.pinned=0
      ORDER BY bp.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return json({
      pinned: (pinned.results as any[]).map(parseAttachments),
      posts: (posts.results as any[]).map(parseAttachments),
      total: total?.n || 0,
      page,
      hasMore: offset + limit < (total?.n || 0),
    });
  }

  // ── POST /api/board/posts ─────────────────────────────────────────────────
  if (!postId && request.method === 'POST') {
    const body = await request.json() as any;
    const { body: text, title } = body;
    if (!text?.trim()) return json({ error: 'Tekst må ikke være tom' }, 400);

    const id = nanoid();
    await env.DB.prepare(`
      INSERT INTO board_posts (id, player_id, title, body, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(id, user.sub, title?.trim() || null, text.trim()).run();

    // @-mentions
    await handleMentions(env, user.sub, text, 'opslag', `/opslagstavle`);

    const post = await env.DB.prepare(`
      SELECT bp.*, COALESCE(p.alias, p.name) as author_name, p.avatar_url as author_avatar_url,
        0 as comment_count, 0 as attachment_count
      FROM board_posts bp JOIN players p ON p.id = bp.player_id WHERE bp.id=?
    `).bind(id).first();
    return json(post, 201);
  }

  // ── GET /api/board/posts/:id ──────────────────────────────────────────────
  if (postId && !sub && request.method === 'GET') {
    const post = await env.DB.prepare(`
      SELECT bp.*, COALESCE(p.alias, p.name) as author_name, p.avatar_url as author_avatar_url,
        (SELECT COUNT(*) FROM board_comments bc WHERE bc.post_id=bp.id AND bc.deleted=0) as comment_count,
        (SELECT COUNT(*) FROM board_attachments ba WHERE ba.post_id=bp.id) as attachment_count
      FROM board_posts bp JOIN players p ON p.id = bp.player_id WHERE bp.id=?
    `).bind(postId).first();
    if (!post) return json({ error: 'Ikke fundet' }, 404);
    return json(post);
  }

  // ── PUT /api/board/posts/:id ──────────────────────────────────────────────
  if (postId && !sub && request.method === 'PUT') {
    const existing = await env.DB.prepare('SELECT player_id FROM board_posts WHERE id=?').bind(postId).first() as any;
    if (!existing) return json({ error: 'Ikke fundet' }, 404);
    if (existing.player_id !== user.sub) return json({ error: 'Forbidden' }, 403);
    const { body: text, title } = await request.json() as any;
    if (!text?.trim()) return json({ error: 'Tekst må ikke være tom' }, 400);
    await env.DB.prepare(
      "UPDATE board_posts SET title=?, body=?, edited_at=datetime('now') WHERE id=?"
    ).bind(title?.trim() || null, text.trim(), postId).run();
    return json({ ok: true });
  }

  // ── DELETE /api/board/posts/:id ───────────────────────────────────────────
  if (postId && !sub && request.method === 'DELETE') {
    const existing = await env.DB.prepare('SELECT player_id FROM board_posts WHERE id=?').bind(postId).first() as any;
    if (!existing) return json({ error: 'Ikke fundet' }, 404);
    if (existing.player_id !== user.sub) return json({ error: 'Forbidden' }, 403);
    await env.DB.prepare(
      "UPDATE board_posts SET deleted=1, deleted_at=datetime('now') WHERE id=?"
    ).bind(postId).run();
    return json({ ok: true });
  }

  // ── POST /api/board/posts/:id/pin (trainer+) ──────────────────────────────
  if (postId && sub === 'pin' && request.method === 'POST') {
    if (!isTrainer) return json({ error: 'Forbidden' }, 403);
    const post = await env.DB.prepare('SELECT pinned FROM board_posts WHERE id=?').bind(postId).first() as any;
    if (!post) return json({ error: 'Ikke fundet' }, 404);
    const newPinned = post.pinned ? 0 : 1;
    await env.DB.prepare(
      'UPDATE board_posts SET pinned=?, pinned_by=? WHERE id=?'
    ).bind(newPinned, newPinned ? user.sub : null, postId).run();
    return json({ ok: true, pinned: newPinned });
  }

  // ── GET /api/board/posts/:id/comments ─────────────────────────────────────
  if (postId && sub === 'comments' && !commentId && request.method === 'GET') {
    const comments = await env.DB.prepare(`
      SELECT bc.*, COALESCE(p.alias, p.name) as author_name, p.avatar_url as author_avatar_url
      FROM board_comments bc
      JOIN players p ON p.id = bc.player_id
      WHERE bc.post_id = ?
      ORDER BY bc.created_at ASC
    `).bind(postId).all();
    return json(comments.results);
  }

  // ── POST /api/board/posts/:id/comments ────────────────────────────────────
  if (postId && sub === 'comments' && !commentId && request.method === 'POST') {
    const { body: text } = await request.json() as any;
    if (!text?.trim()) return json({ error: 'Kommentar må ikke være tom' }, 400);
    const id = nanoid();
    await env.DB.prepare(`
      INSERT INTO board_comments (id, post_id, player_id, body, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(id, postId, user.sub, text.trim()).run();

    // @-mentions
    await handleMentions(env, user.sub, text, 'kommentar', `/opslagstavle`);

    const comment = await env.DB.prepare(`
      SELECT bc.*, COALESCE(p.alias, p.name) as author_name, p.avatar_url as author_avatar_url
      FROM board_comments bc JOIN players p ON p.id = bc.player_id WHERE bc.id=?
    `).bind(id).first();
    return json(comment, 201);
  }

  // ── PUT /api/board/posts/:id/comments/:cid ────────────────────────────────
  if (postId && sub === 'comments' && commentId && request.method === 'PUT') {
    const existing = await env.DB.prepare('SELECT player_id FROM board_comments WHERE id=? AND post_id=?').bind(commentId, postId).first() as any;
    if (!existing) return json({ error: 'Ikke fundet' }, 404);
    if (existing.player_id !== user.sub) return json({ error: 'Forbidden' }, 403);
    const { body: text } = await request.json() as any;
    if (!text?.trim()) return json({ error: 'Kommentar må ikke være tom' }, 400);
    await env.DB.prepare(
      "UPDATE board_comments SET body=?, edited_at=datetime('now') WHERE id=?"
    ).bind(text.trim(), commentId).run();
    return json({ ok: true });
  }

  // ── DELETE /api/board/posts/:id/comments/:cid ─────────────────────────────
  if (postId && sub === 'comments' && commentId && request.method === 'DELETE') {
    const existing = await env.DB.prepare('SELECT player_id FROM board_comments WHERE id=? AND post_id=?').bind(commentId, postId).first() as any;
    if (!existing) return json({ error: 'Ikke fundet' }, 404);
    if (existing.player_id !== user.sub) return json({ error: 'Forbidden' }, 403);
    await env.DB.prepare(
      "UPDATE board_comments SET deleted=1, deleted_at=datetime('now') WHERE id=?"
    ).bind(commentId).run();
    return json({ ok: true });
  }

  // ── POST /api/board/posts/:id/attachments ─────────────────────────────────
  if (postId && sub === 'attachments' && request.method === 'POST') {
    const contentType = request.headers.get('Content-Type') || '';
    const isImage = contentType.startsWith('image/');
    const DOC_TYPES: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    };
    const isDoc = contentType in DOC_TYPES;
    if (!isImage && !isDoc) return json({ error: 'Kun billeder og dokumenter (PDF, Word, Excel, PowerPoint) understøttes' }, 400);

    const maxBytes = isImage ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
    const arrayBuf = await request.arrayBuffer();
    if (arrayBuf.byteLength > maxBytes) return json({ error: `Maks filstørrelse er ${isImage ? '10' : '20'} MB` }, 413);

    const ext = isImage ? (contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg') : DOC_TYPES[contentType];
    const id = nanoid();
    const r2Key = `board/${postId}/${id}.${ext}`;
    const filename = `attachment.${ext}`;
    const publicUrl = `https://pub-afc843d1587d4ae3a4aa8f3d76547493.r2.dev/${r2Key}`;

    await env.AVATARS.put(r2Key, arrayBuf, { httpMetadata: { contentType } });

    await env.DB.prepare(`
      INSERT INTO board_attachments (id, post_id, type, filename, r2_key, url, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(id, postId, isImage ? 'image' : 'document', filename, r2Key, publicUrl, arrayBuf.byteLength).run();

    return json({ id, url: publicUrl, filename, type: isImage ? 'image' : 'document', size_bytes: arrayBuf.byteLength }, 201);
  }

  // ── DELETE /api/board/attachments/:aid ────────────────────────────────────
  // Route handled at index.ts level via separate path match

  return json({ error: 'Method not allowed' }, 405);
}

// ── DELETE /api/board/attachments/:aid ────────────────────────────────────────
export async function handleBoardAttachment(
  request: Request,
  env: Env,
  user: JWTPayload,
  attachmentId: string,
): Promise<Response> {
  const att = await env.DB.prepare(
    'SELECT ba.id, ba.r2_key, bp.player_id FROM board_attachments ba JOIN board_posts bp ON bp.id=ba.post_id WHERE ba.id=?'
  ).bind(attachmentId).first() as any;
  if (!att) return json({ error: 'Ikke fundet' }, 404);
  if (att.player_id !== user.sub) return json({ error: 'Forbidden' }, 403);

  await env.AVATARS.delete(att.r2_key);
  await env.DB.prepare('DELETE FROM board_attachments WHERE id=?').bind(attachmentId).run();
  return json({ ok: true });
}

// ── @-mentions hjælpefunktion ─────────────────────────────────────────────────
async function handleMentions(
  env: Env,
  authorId: string,
  bodyText: string,
  context: string,
  url: string,
): Promise<void> {
  const allMention = bodyText.toLowerCase().includes('@alle');
  const mentionMatches = [...bodyText.matchAll(/@([\w\u00C0-\u024F\-]+)/gi)];

  if (!allMention && mentionMatches.length === 0) return;

  const authorRow = await env.DB.prepare(
    'SELECT COALESCE(alias, name) as display_name FROM players WHERE id=?'
  ).bind(authorId).first() as any;
  const authorName = authorRow?.display_name || 'Nogen';

  if (allMention) {
    const allPlayers = await env.DB.prepare(
      "SELECT id FROM players WHERE active=1 AND id != ?"
    ).bind(authorId).all();
    for (const p of allPlayers.results as any[]) {
      sendPushToPlayer(env, p.id, {
        title: `📌 ${authorName} nævnte alle`,
        body: `...i ${context === 'opslag' ? 'et opslag' : 'en kommentar'} på opslagstavlen`,
        url,
      }).catch(() => {});
    }
  } else {
    for (const match of mentionMatches) {
      const mentionName = match[1];
      const mentioned = await env.DB.prepare(
        "SELECT id FROM players WHERE active=1 AND (LOWER(alias)=LOWER(?) OR name LIKE ?) AND id != ? LIMIT 1"
      ).bind(mentionName, `${mentionName}%`, authorId).first() as any;
      if (mentioned) {
        sendPushToPlayer(env, mentioned.id, {
          title: `📌 ${authorName} nævnte dig`,
          body: `...i ${context === 'opslag' ? 'et opslag' : 'en kommentar'} på opslagstavlen`,
          url,
        }).catch(() => {});
      }
    }
  }
}
