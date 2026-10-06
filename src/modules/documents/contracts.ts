export type DocumentStatus="draft"|"active"|"superseded"|"archived"|"deleted";

export type PlatformDocument={
  id:string;tenantId:string;tenantProductId?:string|null;
  documentKey?:string|null;title:string;documentType:string;status:DocumentStatus;
  ownerUserId?:string|null;locale?:string|null;tags:string[];
  currentVersion:number;metadata:Record<string,unknown>;
};

export type DocumentVersion={
  documentId:string;version:number;storageRef:string;fileName:string;
  mimeType:string;sizeBytes:number;sha256:string;
  source:"upload"|"generated"|"import"|"provider";
  createdBy?:string|null;createdAt:string;notes?:string|null;
};

export type DocumentEntityLink={
  documentId:string;tenantId:string;entityType:string;entityId:string;relationship:string;
};

export type DocumentTemplate={
  id:string;tenantId?:string|null;productKey?:string|null;templateKey:string;
  name:string;locale:string;documentType:string;bodyRef:string;version:number;
  status:"draft"|"active"|"retired";variables:string[];
};

export const DOCUMENT_FEATURES={
  library:"documents.library",versions:"documents.versions",links:"documents.links",
  templates:"documents.templates",generation:"documents.generation",signatures:"documents.signatures",
  evidencePacks:"documents.evidence_packs",retention:"documents.retention",
} as const;

export const DOCUMENT_EVENT_TYPES={
  created:"document.created",versionAdded:"document.version.added",
  linked:"document.linked",superseded:"document.superseded",archived:"document.archived",
  signatureRequested:"document.signature.requested",signed:"document.signed",
} as const;
