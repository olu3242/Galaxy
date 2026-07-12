'use client';

import { useState } from 'react';

export interface OrgNode {
  id: string;
  name: string;
  level: string;
  code?: string;
  memberCount?: number;
  children?: OrgNode[];
  isActive?: boolean;
}

const LEVEL_COLOR: Record<string, string> = {
  platform: '#6366f1',
  organization: '#8b5cf6',
  division: '#06b6d4',
  region: '#0ea5e9',
  branch: '#10b981',
  department: '#f59e0b',
  team: '#f97316',
};

function TreeNode({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const color = LEVEL_COLOR[node.level] ?? '#94a3b8';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 8px',
          marginLeft: `${depth * 20}px`,
          borderRadius: '6px',
          cursor: hasChildren ? 'pointer' : 'default',
          fontSize: '13px',
        }}
        onClick={() => hasChildren && setExpanded((e) => !e)}
      >
        <span
          style={{ width: '16px', textAlign: 'center', color: 'var(--muted)', fontSize: '10px' }}
        >
          {hasChildren ? (expanded ? '▼' : '▶') : '·'}
        </span>
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{node.name}</span>
        {node.code && (
          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>({node.code})</span>
        )}
        <span
          style={{
            fontSize: '10px',
            color,
            background: color + '18',
            padding: '1px 5px',
            borderRadius: '3px',
            marginLeft: '4px',
          }}
        >
          {node.level}
        </span>
        {node.memberCount !== undefined && (
          <span style={{ color: 'var(--muted)', fontSize: '11px', marginLeft: 'auto' }}>
            {node.memberCount} members
          </span>
        )}
      </div>
      {expanded &&
        hasChildren &&
        node.children?.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} />)}
    </div>
  );
}

export function OrganizationTree({
  root,
  title = 'Org Hierarchy',
}: {
  root: OrgNode;
  title?: string;
}) {
  return (
    <div className="mc-card">
      <span className="mc-label" style={{ display: 'block', marginBottom: '12px' }}>
        {title}
      </span>
      <TreeNode node={root} />
    </div>
  );
}
