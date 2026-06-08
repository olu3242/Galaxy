export type DocumentStatus = 'draft' | 'published' | 'archived';
export type PermissionLevel = 'view' | 'edit' | 'admin';

export interface KnowledgeDocument {
  id: string;
  organizationId: string;
  categoryId: string | null;
  title: string;
  content: string;
  status: DocumentStatus;
  authorId: string;
  tags: string[];
  metadata: Record<string, unknown>;
  version: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCategory {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeTag {
  id: string;
  organizationId: string;
  name: string;
  color: string | null;
  createdAt: string;
}

export interface KnowledgeVersion {
  id: string;
  organizationId: string;
  documentId: string;
  version: number;
  content: string;
  changedBy: string;
  changeNote: string;
  createdAt: string;
}

export interface KnowledgeComment {
  id: string;
  organizationId: string;
  documentId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgePermission {
  id: string;
  organizationId: string;
  documentId: string;
  memberId: string | null;
  roleId: string | null;
  level: PermissionLevel;
  createdAt: string;
}

export interface KnowledgeActivity {
  id: string;
  organizationId: string;
  documentId: string;
  actorId: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface KnowledgeDocumentRow {
  id: string;
  organization_id: string;
  category_id: string | null;
  title: string;
  content: string;
  status: string;
  author_id: string;
  tags: string[];
  metadata: Record<string, unknown>;
  version: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
