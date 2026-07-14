'use client';

import { useState } from 'react';
import { useApiClient, useKnowledgeDocs, useKnowledgeSearch } from '../../../lib/api';
import type { KnowledgeDoc } from '../../../lib/api';

function DocCard({ doc, onPublish }: { doc: KnowledgeDoc; onPublish: (id: string) => void }) {
  const statusColor =
    doc.status === 'published' ? '#22c55e' : doc.status === 'draft' ? '#f59e0b' : 'var(--muted)';

  return (
    <div
      style={{
        background: 'var(--mc-card)',
        border: '1px solid var(--mc-border)',
        borderRadius: '10px',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div>
          <div
            style={{ fontSize: '14px', fontWeight: 700, color: 'var(--fg)', marginBottom: '2px' }}
          >
            {doc.title}
          </div>
          {doc.category && (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {doc.category}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: statusColor,
              border: `1px solid ${statusColor}`,
              borderRadius: '4px',
              padding: '2px 8px',
              textTransform: 'capitalize',
            }}
          >
            {doc.status}
          </span>
          {doc.status === 'draft' && (
            <button
              onClick={() => {
                onPublish(doc.id);
              }}
              style={{
                fontSize: '12px',
                padding: '3px 10px',
                borderRadius: '5px',
                border: '1px solid var(--mc-accent)',
                background: 'transparent',
                color: 'var(--mc-accent)',
                cursor: 'pointer',
              }}
            >
              Publish
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
        {doc.content.slice(0, 160)}
        {doc.content.length > 160 ? '…' : ''}
      </div>
      {doc.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {doc.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: '11px',
                background: 'var(--mc-bg)',
                color: 'var(--muted)',
                borderRadius: '4px',
                padding: '2px 7px',
                border: '1px solid var(--mc-border)',
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
        Updated {new Date(doc.updatedAt).toLocaleDateString()}
      </div>
    </div>
  );
}

export default function KnowledgePage() {
  const client = useApiClient();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data: docsData, isLoading, mutate } = useKnowledgeDocs(page, 10);
  const { data: searchData, isLoading: searching } = useKnowledgeSearch(debouncedQuery);

  const docs = debouncedQuery.length >= 2 ? (searchData?.data ?? []) : (docsData?.data ?? []);
  const total = docsData?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 10));

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (val.length >= 2 || val.length === 0) {
      setDebouncedQuery(val);
      setPage(1);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      await client.post('/api/v1/knowledge/documents', {
        body: {
          title: title.trim(),
          content: content.trim(),
          ...(category.trim() ? { category: category.trim() } : {}),
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      setTitle('');
      setContent('');
      setCategory('');
      setTags('');
      setShowCreate(false);
      setSuccessMsg('Document created.');
      void mutate();
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch {
      setCreateError('Failed to create document.');
    } finally {
      setCreating(false);
    }
  };

  const handlePublish = async (id: string) => {
    try {
      await client.patch(`/api/v1/knowledge/documents/${id}`, { body: { status: 'published' } });
      setSuccessMsg('Document published.');
      void mutate();
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch {
      setCreateError('Failed to publish document.');
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--mc-bg)',
        padding: '32px',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      }}
    >
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
          }}
        >
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--fg)', margin: 0 }}>
              Knowledge Base
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '4px 0 0' }}>
              {total} documents · searchable by AI agents
            </p>
          </div>
          <button
            onClick={() => {
              setShowCreate((v) => !v);
            }}
            style={{
              fontSize: '13px',
              fontWeight: 600,
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--mc-accent)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {showCreate ? 'Cancel' : '+ New Document'}
          </button>
        </div>

        {successMsg && (
          <div
            style={{
              background: '#22c55e22',
              border: '1px solid #22c55e',
              color: '#22c55e',
              borderRadius: '8px',
              padding: '10px 16px',
              marginBottom: '16px',
              fontSize: '13px',
            }}
          >
            {successMsg}
          </div>
        )}

        {showCreate && (
          <form
            onSubmit={(e) => {
              void handleCreate(e);
            }}
            style={{
              background: 'var(--mc-card)',
              border: '1px solid var(--mc-border)',
              borderRadius: '10px',
              padding: '20px',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--fg)' }}>
              New Document
            </div>
            <input
              type="text"
              placeholder="Title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
              required
              style={{
                padding: '9px 13px',
                borderRadius: '7px',
                border: '1px solid var(--mc-border)',
                background: 'var(--mc-bg)',
                color: 'var(--fg)',
                fontSize: '13px',
              }}
            />
            <textarea
              placeholder="Content"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
              }}
              required
              rows={5}
              style={{
                padding: '9px 13px',
                borderRadius: '7px',
                border: '1px solid var(--mc-border)',
                background: 'var(--mc-bg)',
                color: 'var(--fg)',
                fontSize: '13px',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="Category (optional)"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                }}
                style={{
                  flex: 1,
                  padding: '9px 13px',
                  borderRadius: '7px',
                  border: '1px solid var(--mc-border)',
                  background: 'var(--mc-bg)',
                  color: 'var(--fg)',
                  fontSize: '13px',
                }}
              />
              <input
                type="text"
                placeholder="Tags (comma-separated)"
                value={tags}
                onChange={(e) => {
                  setTags(e.target.value);
                }}
                style={{
                  flex: 1,
                  padding: '9px 13px',
                  borderRadius: '7px',
                  border: '1px solid var(--mc-border)',
                  background: 'var(--mc-bg)',
                  color: 'var(--fg)',
                  fontSize: '13px',
                }}
              />
            </div>
            {createError && <div style={{ color: '#ef4444', fontSize: '12px' }}>{createError}</div>}
            <button
              type="submit"
              disabled={creating}
              style={{
                alignSelf: 'flex-end',
                padding: '8px 20px',
                borderRadius: '7px',
                border: 'none',
                background: 'var(--mc-accent)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: creating ? 'not-allowed' : 'pointer',
                opacity: creating ? 0.7 : 1,
              }}
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
        )}

        <input
          type="text"
          placeholder="Search knowledge base…"
          value={searchQuery}
          onChange={(e) => {
            handleSearchChange(e.target.value);
          }}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--mc-border)',
            background: 'var(--mc-card)',
            color: 'var(--fg)',
            fontSize: '13px',
            marginBottom: '16px',
            boxSizing: 'border-box',
          }}
        />

        {(isLoading || searching) && (
          <div
            style={{
              color: 'var(--muted)',
              fontSize: '14px',
              textAlign: 'center',
              padding: '32px',
            }}
          >
            Loading…
          </div>
        )}

        {!isLoading && !searching && docs.length === 0 && (
          <div
            style={{
              color: 'var(--muted)',
              fontSize: '14px',
              textAlign: 'center',
              padding: '32px',
            }}
          >
            {debouncedQuery.length >= 2
              ? 'No results found.'
              : 'No documents yet. Create one above.'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {docs.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onPublish={(id) => {
                void handlePublish(id);
              }}
            />
          ))}
        </div>

        {!debouncedQuery && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
            <button
              onClick={() => {
                setPage((p) => Math.max(1, p - 1));
              }}
              disabled={page === 1}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid var(--mc-border)',
                background: 'var(--mc-card)',
                color: page === 1 ? 'var(--muted)' : 'var(--fg)',
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                fontSize: '13px',
              }}
            >
              Prev
            </button>
            <span style={{ padding: '6px 12px', fontSize: '13px', color: 'var(--muted)' }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => {
                setPage((p) => Math.min(totalPages, p + 1));
              }}
              disabled={page === totalPages}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid var(--mc-border)',
                background: 'var(--mc-card)',
                color: page === totalPages ? 'var(--muted)' : 'var(--fg)',
                cursor: page === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '13px',
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
