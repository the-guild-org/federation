import type {
  ConstDirectiveNode,
  DirectiveDefinitionNode,
  DirectiveNode,
  TypeDefinitionNode,
} from 'graphql';
import type { FederationVersion } from '../../specifications/federation.js';

export type MapByGraph<T> = Map<string, T>;

export interface Key {
  fields: string;
  resolvable: boolean;
}

export interface Graph {
  name: string;
  id: string;
  version: FederationVersion;
  url?: string;
}

export interface TypeBuilder<T, S> {
  visitSubgraphState(graph: Graph, state: Map<string, S>, typeName: string, type: T): void;
  composeSupergraphNode(
    type: S,
    graphMap: Map<string, Graph>,
    helpers: {
      graphNameToId(graphName: string): string | null;
    },
  ): TypeDefinitionNode | DirectiveDefinitionNode;
}

export function convertToConst(nodes: DirectiveNode[]): ConstDirectiveNode[] {
  return nodes as ConstDirectiveNode[];
}
