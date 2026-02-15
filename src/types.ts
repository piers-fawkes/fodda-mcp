import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface ExtendedTool extends Tool {
  isDeterministic: boolean;
}

export interface FoddaSearchRequest {
  query: string;
  limit?: number;
  use_semantic?: boolean;
}

export interface FoddaNeighborsRequest {
  seed_node_ids: string[];
  relationship_types?: string[];
  direction?: 'in' | 'out' | 'both';
  depth?: number;
  limit?: number;
}

export interface FoddaEvidenceRequest {
  for_node_id: string;
  top_k?: number;
}

export interface FoddaGraph {
  graph_id: string;
  name: string;
  version: string;
  description: string;
  node_types: string[];
  relationship_types: string[];
}

export interface FoddaScanNode {
  id: string;
  display: string;
  labels: string[];
  properties: Record<string, any>;
  _score?: number;
}

export interface FoddaEvidence {
  id: string;
  title: string;
  sourceUrl: string;
  snippet: string;
  publishedAt?: string;
  relevance?: number;
}
