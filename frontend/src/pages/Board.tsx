import { useState, useEffect, useRef, useCallback } from 'react';
import { api, BoardPost, BoardComment, Player, displayName } from '../lib/api';
import { useAuth } from '../lib/auth';

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'lige nu';
  if (diffMin < 60) return `${diffMin} min siden`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} t siden`;
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function Avatar({ name, url, size = 32 }: { name?: string; url?: string; size?: number }) {
  if (url) return (
    <img
      src={url}
      alt={name}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
    />
  );
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--cfc-bg-hover)',
      border: '0.5px solid var(--cfc-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: 'var(--cfc-text-muted)',
      flexShrink: 0,
    }}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

function highlightMentions(text: string): React.ReactNode {
  const parts = text.split(/(@[\w\u00C0-\u024F\-]+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} style={{ background: '#1a2a4a', color: '#5b8dd9', borderRadius: 3, padding: '0 2px' }}>
        {part}
      </span>
    ) : part
  );
}

// Simple @-mention autocomplete textarea
function MentionTextarea({
  value,
  onChange,
  onKeyDown,
  placeholder,
  players,
  minHeight = 60,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  players: Player[];
  minHeight?: number;
}) {
  const [suggestions, setSuggestions] = useState<{ id: string; label: string }[]>([]);
  const [mentionStart, setMentionStart] = useState(-1);
  const [selectedSug, setSelectedSug] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    onChange(val);
    const pos = e.target.selectionStart;
    const before = val.slice(0, pos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx !== -1 && (atIdx === 0 || /\s/.test(before[atIdx - 1]))) {
      const query = before.slice(atIdx + 1).toLowerCase();
      const sugs: { id: string; label: string }[] = [];
      if ('alle'.startsWith(query)) sugs.push({ id: '__alle__', label: '@alle' });
      players.filter(p => p.active && (
        (p.alias?.toLowerCase().startsWith(query)) ||
        p.name.toLowerCase().startsWith(query)
      )).slice(0, 6).forEach(p => sugs.push({ id: p.id, label: `@${p.alias?.trim() || p.name.split(' ')[0]}` }));
      setSuggestions(sugs);
      setMentionStart(atIdx);
      setSelectedSug(0);
    } else {
      setSuggestions([]);
      setMentionStart(-1);
    }
  }

  function applySuggestion(label: string) {
    const pos = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, mentionStart);
    const after = value.slice(pos);
    const newVal = `${before}${label} ${after}`;
    onChange(newVal);
    setSuggestions([]);
    setMentionStart(-1);
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = before.length + label.length + 1;
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
        textareaRef.current.focus();
      }
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedSug(s => Math.min(s + 1, suggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedSug(s => Math.max(s - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applySuggestion(suggestions[selectedSug].label); return; }
      if (e.key === 'Escape') { setSuggestions([]); return; }
    }
    onKeyDown?.(e);
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{
          width: '100%', boxSizing: 'border-box',
          minHeight,
          background: 'var(--cfc-bg-primary)',
          border: '0.5px solid var(--cfc-border)',
          borderRadius: 6, padding: '8px 10px',
          color: 'var(--cfc-text-primary)', fontSize: 14,
          resize: 'vertical', fontFamily: 'inherit',
        }}
      />
      {suggestions.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0,
          background: 'var(--cfc-bg-card)',
          border: '0.5px solid var(--cfc-border)',
          borderRadius: 6, overflow: 'hidden',
          zIndex: 100, minWidth: 140,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.id}
              onMouseDown={e => { e.preventDefault(); applySuggestion(s.label); }}
              style={{
                padding: '7px 12px',
                cursor: 'pointer',
                background: i === selectedSug ? 'var(--cfc-bg-hover)' : 'transparent',
                color: 'var(--cfc-text-primary)',
                fontSize: 13,
              }}
            >
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Comments ──────────────────────────────────────────────────────────────────
function CommentsSection({
  postId,
  players,
  currentPlayerId,
  isTrainer,
}: {
  postId: string;
  players: Player[];
  currentPlayerId: string;
  isTrainer: boolean;
}) {
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  useEffect(() => {
    api.getBoardComments(postId).then(setComments).finally(() => setLoading(false));
  }, [postId]);

  async function submitComment() {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const c = await api.createBoardComment(postId, newComment.trim());
      setComments(prev => [...prev, c]);
      setNewComment('');
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(commentId: string) {
    if (!editBody.trim()) return;
    await api.updateBoardComment(postId, commentId, editBody.trim());
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, body: editBody.trim(), edited_at: new Date().toISOString() } : c));
    setEditingId(null);
  }

  async function deleteComment(commentId: string) {
    if (!confirm('Slet kommentar?')) return;
    await api.deleteBoardComment(postId, commentId);
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, deleted: 1 } : c));
  }

  if (loading) return <div style={{ padding: '8px 0', color: 'var(--cfc-text-muted)', fontSize: 13 }}>Henter kommentarer…</div>;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {comments.map(c => (
          <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {c.deleted ? (
              <span style={{ color: 'var(--cfc-text-subtle)', fontStyle: 'italic', fontSize: 13 }}>[Denne kommentar er slettet]</span>
            ) : (
              <>
                <Avatar name={c.author_name} url={c.author_avatar_url} size={26} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--cfc-text-primary)' }}>{c.author_name}</span>
                    <span style={{ fontSize: 11, color: 'var(--cfc-text-subtle)' }}>{fmtDate(c.created_at)}{c.edited_at ? ' · redigeret' : ''}</span>
                    {c.player_id === currentPlayerId && (
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button onClick={() => { setEditingId(c.id); setEditBody(c.body); }} className="btn btn-sm" style={{ padding: '1px 6px', fontSize: 11 }}>Rediger</button>
                        <button onClick={() => deleteComment(c.id)} className="btn btn-sm" style={{ padding: '1px 6px', fontSize: 11, color: '#e57373' }}>Slet</button>
                      </div>
                    )}
                  </div>
                  {editingId === c.id ? (
                    <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                      <MentionTextarea value={editBody} onChange={setEditBody} players={players} minHeight={40} />
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => saveEdit(c.id)} className="btn btn-sm btn-primary">Gem</button>
                        <button onClick={() => setEditingId(null)} className="btn btn-sm">Annullér</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, color: 'var(--cfc-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {highlightMentions(c.body)}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <MentionTextarea
            value={newComment}
            onChange={setNewComment}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
            placeholder="Skriv en kommentar… (Enter sender, Shift+Enter = linjeskift)"
            players={players}
            minHeight={40}
          />
        </div>
        <button
          onClick={submitComment}
          disabled={submitting || !newComment.trim()}
          className="btn btn-primary btn-sm"
          style={{ padding: '8px 14px', flexShrink: 0 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────
function PostCard({
  post,
  currentPlayerId,
  isTrainer,
  players,
  onEdit,
  onDelete,
  onPin,
}: {
  post: BoardPost;
  currentPlayerId: string;
  isTrainer: boolean;
  players: Player[];
  onEdit: (post: BoardPost) => void;
  onDelete: (postId: string) => void;
  onPin: (postId: string) => void;
}) {
  const [commentsOpen, setCommentsOpen] = useState(false);

  return (
    <div style={{
      background: 'var(--cfc-bg-card)',
      border: `0.5px solid ${post.pinned ? '#2a3a1a' : 'var(--cfc-border)'}`,
      borderRadius: 10,
      padding: '14px 16px',
      position: 'relative',
    }}>
      {post.pinned && (
        <div style={{
          position: 'absolute', top: 10, right: 12,
          fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: '#5a9e5a', background: '#162416',
          padding: '2px 7px', borderRadius: 4,
        }}>📌 Fastgjort</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        <Avatar name={post.author_name} url={post.author_avatar_url} size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--cfc-text-primary)' }}>{post.author_name}</span>
            <span style={{ fontSize: 12, color: 'var(--cfc-text-subtle)' }}>{fmtDate(post.created_at)}{post.edited_at ? ' · redigeret' : ''}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {isTrainer && (
            <button
              onClick={() => onPin(post.id)}
              className="btn btn-sm"
              title={post.pinned ? 'Frigør' : 'Fastgør'}
              style={{ padding: '3px 8px', fontSize: 12, color: post.pinned ? '#5a9e5a' : 'var(--cfc-text-muted)' }}
            >
              📌
            </button>
          )}
          {post.player_id === currentPlayerId && (
            <>
              <button onClick={() => onEdit(post)} className="btn btn-sm" style={{ padding: '3px 8px', fontSize: 12 }}>Rediger</button>
              <button onClick={() => onDelete(post.id)} className="btn btn-sm" style={{ padding: '3px 8px', fontSize: 12, color: '#e57373' }}>Slet</button>
            </>
          )}
        </div>
      </div>

      {/* Titel */}
      {post.title && (
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--cfc-text-primary)', fontFamily: 'Georgia, serif', marginBottom: 6 }}>
          {post.title}
        </div>
      )}

      {/* Body */}
      <div style={{ fontSize: 14, color: 'var(--cfc-text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55, marginBottom: 10 }}>
        {highlightMentions(post.body)}
      </div>

      {/* Attachments */}
      {post.attachments && post.attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {post.attachments.map(att => (
            att.type === 'image' ? (
              <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer">
                <img
                  src={att.url}
                  alt={att.filename}
                  style={{ maxWidth: 200, maxHeight: 150, borderRadius: 6, objectFit: 'cover', border: '0.5px solid var(--cfc-border)' }}
                />
              </a>
            ) : (
              <a
                key={att.id}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px',
                  background: 'var(--cfc-bg-hover)',
                  border: '0.5px solid var(--cfc-border)',
                  borderRadius: 6,
                  color: 'var(--cfc-text-primary)',
                  fontSize: 13, textDecoration: 'none',
                }}
              >
                📄 {att.filename}
                <span style={{ color: 'var(--cfc-text-subtle)', fontSize: 11 }}>
                  ({Math.round(att.size_bytes / 1024)} KB)
                </span>
              </a>
            )
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '0.5px solid var(--cfc-border)', paddingTop: 8, marginTop: 4 }}>
        <button
          onClick={() => setCommentsOpen(o => !o)}
          className="btn btn-sm"
          style={{ padding: '4px 10px', fontSize: 12, color: 'var(--cfc-text-muted)', background: 'transparent' }}
        >
          💬 {post.comment_count > 0 ? `${post.comment_count} kommentar${post.comment_count !== 1 ? 'er' : ''}` : 'Kommenter'}
        </button>
      </div>

      {commentsOpen && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--cfc-border)' }}>
          <CommentsSection
            postId={post.id}
            players={players}
            currentPlayerId={currentPlayerId}
            isTrainer={isTrainer}
          />
        </div>
      )}
    </div>
  );
}

// ── Post modal ────────────────────────────────────────────────────────────────
function PostModal({
  initial,
  players,
  onSave,
  onClose,
}: {
  initial?: BoardPost;
  players: Player[];
  onSave: (post: BoardPost) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!initial;

  async function submit() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      let post: BoardPost;
      if (isEdit) {
        await api.updateBoardPost(initial!.id, body.trim(), title.trim() || undefined);
        post = { ...initial!, title: title.trim() || undefined, body: body.trim(), edited_at: new Date().toISOString() };
      } else {
        post = await api.createBoardPost(body.trim(), title.trim() || undefined);
        // Upload attachments
        for (const file of files) {
          try {
            const att = await api.uploadBoardAttachment(post.id, file);
            post.attachments = [...(post.attachments ?? []), att];
          } catch (e: any) {
            alert(`Kunne ikke uploade ${file.name}: ${e.message}`);
          }
        }
      }
      onSave(post);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--cfc-bg-card)',
        border: '0.5px solid var(--cfc-border)',
        borderRadius: 10, padding: 20,
        width: '100%', maxWidth: 560,
        maxHeight: '90dvh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>{isEdit ? 'Rediger opslag' : 'Nyt opslag'}</h3>
        <input
          className="input"
          style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}
          placeholder="Titel (valgfri)"
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={120}
        />
        <MentionTextarea
          value={body}
          onChange={setBody}
          placeholder="Hvad vil du dele?"
          players={players}
          minHeight={100}
        />
        {!isEdit && (
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => fileRef.current?.click()}
              className="btn btn-sm"
              style={{ fontSize: 12, color: 'var(--cfc-text-muted)' }}
            >
              📎 Vedhæft fil
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              multiple
              style={{ display: 'none' }}
              onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])}
            />
            {files.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {files.map((f, i) => (
                  <div key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'var(--cfc-bg-hover)',
                    border: '0.5px solid var(--cfc-border)',
                    borderRadius: 4, padding: '2px 6px', fontSize: 12,
                  }}>
                    {f.name}
                    <button
                      onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: '#e57373', cursor: 'pointer', padding: 0, fontSize: 12 }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-sm">Annullér</button>
          <button onClick={submit} disabled={saving || !body.trim()} className="btn btn-primary btn-sm">
            {saving ? 'Gemmer…' : isEdit ? 'Gem ændringer' : 'Del opslag'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Board() {
  const { player, isTrainer } = useAuth();
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [pinned, setPinned] = useState<BoardPost[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editPost, setEditPost] = useState<BoardPost | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [activeQ, setActiveQ] = useState('');

  const load = useCallback(async (p = 1, q = '') => {
    setLoading(true);
    try {
      const [boardData, playersData] = await Promise.all([
        api.getBoardPosts(p, q || undefined),
        p === 1 ? api.getPlayers().catch(() => [] as Player[]) : Promise.resolve(players),
      ]);
      if (p === 1) {
        setPinned(q ? [] : boardData.pinned);
        setPosts(boardData.posts);
        setPlayers(playersData as Player[]);
      } else {
        setPosts(prev => [...prev, ...boardData.posts]);
      }
      setHasMore(boardData.hasMore);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
    api.markBoardRead().catch(() => {});
  }, []);

  function handleNewPost(post: BoardPost) {
    setPosts(prev => [post, ...prev]);
    setShowModal(false);
  }

  function handleEditSave(updated: BoardPost) {
    setPosts(prev => prev.map(p => p.id === updated.id ? updated : p));
    setPinned(prev => prev.map(p => p.id === updated.id ? updated : p));
    setEditPost(null);
  }

  async function handleDelete(postId: string) {
    if (!confirm('Slet opslag?')) return;
    await api.deleteBoardPost(postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
    setPinned(prev => prev.filter(p => p.id !== postId));
  }

  async function handlePin(postId: string) {
    const res = await api.pinBoardPost(postId);
    const update = (p: BoardPost) => p.id === postId ? { ...p, pinned: res.pinned, pinned_by: player?.id } : p;
    if (res.pinned) {
      // Move to pinned
      const post = posts.find(p => p.id === postId) ?? pinned.find(p => p.id === postId);
      if (post) {
        const updated = { ...post, pinned: 1 };
        setPinned(prev => [updated, ...prev.filter(p => p.id !== postId)]);
        setPosts(prev => prev.filter(p => p.id !== postId));
      }
    } else {
      // Move back to posts
      const post = pinned.find(p => p.id === postId);
      if (post) {
        const updated = { ...post, pinned: 0 };
        setPosts(prev => [updated, ...prev]);
        setPinned(prev => prev.filter(p => p.id !== postId));
      }
    }
  }

  function doSearch() {
    const q = searchQ.trim();
    setActiveQ(q);
    setPage(1);
    load(1, q);
  }

  function clearSearch() {
    setSearchQ('');
    setActiveQ('');
    setPage(1);
    load(1, '');
  }

  if (!player) return null;

  const allPosts = [...pinned, ...posts];

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontFamily: 'Georgia, serif', fontSize: 20 }}>Opslagstavle</h2>
        <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm">
          + Nyt opslag
        </button>
      </div>

      {/* Søgefelt */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <input
          className="input"
          style={{ flex: 1, fontSize: 13 }}
          placeholder="Søg i opslag…"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
        />
        <button className="btn btn-sm btn-primary" onClick={doSearch}>Søg</button>
        {activeQ && <button className="btn btn-sm btn-secondary" onClick={clearSearch}>Ryd</button>}
      </div>
      {activeQ && (
        <div style={{ fontSize: 13, color: 'var(--cfc-text-muted)', marginBottom: 10 }}>
          Søgeresultater for "{activeQ}" — {allPosts.length} opslag
        </div>
      )}

      {loading && posts.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" />
        </div>
      ) : allPosts.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '3rem 1rem',
          color: 'var(--cfc-text-muted)', fontSize: 14,
        }}>
          Ingen opslag endnu. Vær den første til at dele noget!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {allPosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              currentPlayerId={player.id}
              isTrainer={!!isTrainer}
              players={players}
              onEdit={setEditPost}
              onDelete={handleDelete}
              onPin={handlePin}
            />
          ))}
          {hasMore && (
            <button
              onClick={() => { const next = page + 1; setPage(next); load(next, activeQ); }}
              disabled={loading}
              className="btn btn-sm"
              style={{ alignSelf: 'center', color: 'var(--cfc-text-muted)' }}
            >
              {loading ? 'Henter…' : 'Vis flere'}
            </button>
          )}
        </div>
      )}

      {showModal && (
        <PostModal
          players={players}
          onSave={handleNewPost}
          onClose={() => setShowModal(false)}
        />
      )}

      {editPost && (
        <PostModal
          initial={editPost}
          players={players}
          onSave={handleEditSave}
          onClose={() => setEditPost(null)}
        />
      )}
    </div>
  );
}
