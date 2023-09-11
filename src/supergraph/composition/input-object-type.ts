import { Deprecated, Description, InputObjectType } from '../../subgraph/state.js';
import { createInputObjectTypeNode } from './ast.js';
import type { MapByGraph, TypeBuilder } from './common.js';

export function inputObjectTypeBuilder(): TypeBuilder<InputObjectType, InputObjectTypeState> {
  return {
    visitSubgraphState(graph, state, typeName, type) {
      const inputObjectTypeState = getOrCreateInputObjectType(state, typeName);

      type.tags.forEach(tag => inputObjectTypeState.tags.add(tag));

      if (type.inaccessible) {
        inputObjectTypeState.inaccessible = true;
      }

      const isDefinition = type.isDefinition && !type.extension;

      if (type.description && !inputObjectTypeState.description) {
        inputObjectTypeState.description = type.description;
      }

      if (type.isDefinition) {
        inputObjectTypeState.hasDefinition = true;
      }

      inputObjectTypeState.byGraph.set(graph.id, {
        inaccessible: type.inaccessible,
      });

      for (const field of type.fields.values()) {
        const fieldState = getOrCreateField(inputObjectTypeState, field.name, field.type);

        field.tags.forEach(tag => fieldState.tags.add(tag));

        if (field.type.endsWith('!') && !fieldState.type.endsWith('!')) {
          // Replace the nullable type with a non-nullable type
          fieldState.type = field.type;
        }

        if (field.inaccessible) {
          fieldState.inaccessible = true;
        }

        if (field.description && !fieldState.description) {
          fieldState.description = field.description;
        }

        // First deprecation wins
        if (field.deprecated && !fieldState.deprecated) {
          fieldState.deprecated = field.deprecated;
        }

        if (typeof field.defaultValue === 'string') {
          fieldState.defaultValue = field.defaultValue;
        }

        fieldState.byGraph.set(graph.id, {
          type: field.type,
          inaccessible: field.inaccessible,
          defaultValue: field.defaultValue,
        });
      }
    },
    composeSupergraphNode(inputObjectType) {
      return createInputObjectTypeNode({
        name: inputObjectType.name,
        tags: Array.from(inputObjectType.tags),
        inaccessible: inputObjectType.inaccessible,
        description: inputObjectType.description,
        fields: Array.from(inputObjectType.fields.values())
          .filter(field => {
            if (field.byGraph.size !== inputObjectType.byGraph.size) {
              return false;
            }

            return true;
          })
          .map(field => {
            const hasDifferentType = Array.from(field.byGraph.values()).some(
              f => f.type !== field.type,
            );

            return {
              name: field.name,
              type: field.type,
              tags: Array.from(field.tags),
              inaccessible: field.inaccessible,
              defaultValue: field.defaultValue,
              description: field.description,
              deprecated: field.deprecated,
              join: {
                field: hasDifferentType
                  ? Array.from(field.byGraph).map(([graph, fieldByGraph]) => ({
                      graph,
                      type: fieldByGraph.type,
                    }))
                  : [],
              },
            };
          }),
        join: {
          type: Array.from(inputObjectType.byGraph.keys()).map(graph => ({ graph })),
        },
      });
    },
  };
}

export interface InputObjectTypeState {
  name: string;
  tags: Set<string>;
  inaccessible: boolean;
  hasDefinition: boolean;
  description?: Description;
  byGraph: MapByGraph<InputObjectTypeStateInGraph>;
  fields: Map<string, InputObjectTypeFieldState>;
}

export type InputObjectTypeFieldState = {
  name: string;
  type: string;
  tags: Set<string>;
  inaccessible: boolean;
  defaultValue?: string;
  description?: Description;
  deprecated?: Deprecated;
  byGraph: MapByGraph<InputObjectFieldStateInGraph>;
};

type InputObjectTypeStateInGraph = {
  inaccessible: boolean;
};

type InputObjectFieldStateInGraph = {
  type: string;
  inaccessible: boolean;
  defaultValue?: string;
};

function getOrCreateInputObjectType(state: Map<string, InputObjectTypeState>, typeName: string) {
  const existing = state.get(typeName);

  if (existing) {
    return existing;
  }

  const def: InputObjectTypeState = {
    name: typeName,
    tags: new Set(),
    hasDefinition: false,
    inaccessible: false,
    byGraph: new Map(),
    fields: new Map(),
  };

  state.set(typeName, def);

  return def;
}

function getOrCreateField(
  objectTypeState: InputObjectTypeState,
  fieldName: string,
  fieldType: string,
) {
  const existing = objectTypeState.fields.get(fieldName);

  if (existing) {
    return existing;
  }

  const def: InputObjectTypeFieldState = {
    name: fieldName,
    type: fieldType,
    tags: new Set(),
    inaccessible: false,
    byGraph: new Map(),
  };

  objectTypeState.fields.set(fieldName, def);

  return def;
}
