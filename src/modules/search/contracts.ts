export type SearchDocument={
  id:string;tenantId:string;tenantProductId?:string|null;productKey:string;
  entityType:string;entityId:string;title:string;body?:string|null;
  keywords:string[];locale?:string|null;sourceRevision?:string|null;
  metadata:Record<string,string|number|boolean|null>;updatedAt:string;
};

export type SearchQuery={
  tenantId:string;tenantProductId?:string|null;query:string;
  entityTypes?:string[];productKeys?:string[];locale?:string|null;
  limit?:number;offset?:number;
};

export type SearchResult={
  entityType:string;entityId:string;productKey:string;title:string;
  snippet?:string|null;rank:number;metadata:Record<string,string|number|boolean|null>;
};

export const SEARCH_FEATURES={
  global:"search.global",fullText:"search.full_text",filters:"search.filters",
  semantic:"search.semantic",recent:"search.recent",
} as const;

export const SEARCH_EVENT_TYPES={
  indexed:"search.document.indexed",removed:"search.document.removed",
  queryExecuted:"search.query.executed",
} as const;
