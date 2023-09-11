import { Description, UnionType } from '../../subgraph/state.js';
import { createUnionTypeNode } from './ast.js';
import type { MapByGraph, TypeBuilder } from './common.js';

export function unionTypeBuilder(): TypeBuilder<UnionType, UnionTypeState> {
  return {
    visitSubgraphState(graph, state, typeName, type) {
      const unionTypeState = getOrCreateUnionType(state, typeName);

      type.tags.forEach(tag => unionTypeState.tags.add(tag));

      if (type.inaccessible) {
        unionTypeState.inaccessible = true;
      }

      if (type.isDefinition) {
        unionTypeState.hasDefinition = true;
      }

      // First description wins
      if (type.description && !unionTypeState.description) {
        unionTypeState.description = type.description;
      }

      unionTypeState.byGraph.set(graph.id, {
        members: type.members,
      });

      for (const member of type.members) {
        unionTypeState.members.add(member);
      }
    },
    composeSupergraphNode(unionType) {
      return createUnionTypeNode({
        name: unionType.name,
        members: Array.from(unionType.members),
        tags: Array.from(unionType.tags),
        inaccessible: unionType.inaccessible,
        description: unionType.description,
        join: {
          type: Array.from(unionType.byGraph.keys()).map(graphName => ({
            graph: graphName.toUpperCase(),
          })),
          unionMember: Array.from(unionType.byGraph.entries())
            .map(([graphName, meta]) => {
              const graph = graphName.toUpperCase();
              return Array.from(meta.members).map(member => ({ graph, member }));
            })
            .flat(1),
        },
      });
    },
  };
}

export type UnionTypeState = {
  name: string;
  tags: Set<string>;
  hasDefinition: boolean;
  description?: Description;
  inaccessible: boolean;
  byGraph: MapByGraph<UnionTypeInGraph>;
  members: Set<string>;
};

type UnionTypeInGraph = {
  members: Set<string>;
};

function getOrCreateUnionType(state: Map<string, UnionTypeState>, typeName: string) {
  const existing = state.get(typeName);

  if (existing) {
    return existing;
  }

  const def: UnionTypeState = {
    name: typeName,
    members: new Set(),
    tags: new Set(),
    inaccessible: false,
    hasDefinition: false,
    byGraph: new Map(),
  };

  state.set(typeName, def);

  return def;
}
