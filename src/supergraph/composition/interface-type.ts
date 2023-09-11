import { DirectiveNode } from 'graphql';
import { Deprecated, Description, InterfaceType } from '../../subgraph/state.js';
import { createInterfaceTypeNode } from './ast.js';
import { convertToConst } from './common.js';
import type { Key, MapByGraph, TypeBuilder } from './common.js';

export function interfaceTypeBuilder(): TypeBuilder<InterfaceType, InterfaceTypeState> {
  return {
    visitSubgraphState(graph, state, typeName, type) {
      const interfaceTypeState = getOrCreateInterfaceType(state, typeName);

      type.tags.forEach(tag => interfaceTypeState.tags.add(tag));

      if (type.inaccessible) {
        interfaceTypeState.inaccessible = true;
      }

      if (type.isDefinition) {
        interfaceTypeState.hasDefinition = true;
      }

      // First description wins
      if (type.description && !interfaceTypeState.description) {
        interfaceTypeState.description = type.description;
      }

      type.ast.directives.forEach(directive => {
        interfaceTypeState.ast.directives.push(directive);
      });

      type.interfaces.forEach(interfaceName => interfaceTypeState.interfaces.add(interfaceName));
      type.implementedBy.forEach(objectTypeName =>
        interfaceTypeState.implementedBy.add(objectTypeName),
      );

      interfaceTypeState.byGraph.set(graph.id, {
        extension: type.extension,
        keys: type.keys,
        interfaces: type.interfaces,
        implementedBy: type.implementedBy,
      });

      for (const field of type.fields.values()) {
        const fieldState = getOrCreateInterfaceField(interfaceTypeState, field.name, field.type);

        field.tags.forEach(tag => fieldState.tags.add(tag));

        if (!field.type.endsWith('!') && fieldState.type.endsWith('!')) {
          // Replace the non-null type with a nullable type
          fieldState.type = field.type;
        }

        if (field.inaccessible) {
          fieldState.inaccessible = true;
        }

        // First deprecation wins
        if (field.deprecated && !fieldState.deprecated) {
          fieldState.deprecated = field.deprecated;
        }

        // First description wins
        if (field.description && !fieldState.description) {
          fieldState.description = field.description;
        }

        field.ast.directives.forEach(directive => {
          fieldState.ast.directives.push(directive);
        });

        fieldState.byGraph.set(graph.id, {
          type: field.type,
          override: field.override,
          provides: field.provides,
          requires: field.requires,
        });

        for (const arg of field.args.values()) {
          const argState = getOrCreateArg(fieldState, arg.name, arg.type);

          arg.tags.forEach(tag => argState.tags.add(tag));

          if (arg.type.endsWith('!')) {
            argState.type = arg.type;
          }

          if (arg.deprecated && !argState.deprecated) {
            argState.deprecated = arg.deprecated;
          }

          // First description wins
          if (arg.description && !argState.description) {
            argState.description = arg.description;
          }

          if (typeof arg.defaultValue === 'string') {
            argState.defaultValue = arg.defaultValue;
          }

          arg.ast.directives.forEach(directive => {
            argState.ast.directives.push(directive);
          });

          argState.byGraph.set(graph.id, {
            type: arg.type,
            defaultValue: arg.defaultValue,
          });
        }
      }
    },
    composeSupergraphNode(interfaceType, graphs) {
      return createInterfaceTypeNode({
        name: interfaceType.name,
        fields: Array.from(interfaceType.fields.values()).map(field => {
          return {
            name: field.name,
            type: field.type,
            inaccessible: field.inaccessible,
            tags: Array.from(field.tags),
            deprecated: field.deprecated,
            description: field.description,
            ast: {
              directives: convertToConst(field.ast.directives),
            },
            arguments: Array.from(field.args.values())
              .filter(arg => {
                // ignore the argument if it's not available in all subgraphs implementing the field
                if (arg.byGraph.size !== field.byGraph.size) {
                  return false;
                }

                return true;
              })
              .map(arg => {
                return {
                  name: arg.name,
                  type: arg.type,
                  tags: Array.from(arg.tags),
                  defaultValue: arg.defaultValue,
                  deprecated: arg.deprecated,
                  description: arg.description,
                  ast: {
                    directives: convertToConst(arg.ast.directives),
                  },
                };
              }),
            join: {
              field:
                // Not sure if it's correct for 100% of cases.
                // The idea here is to no emit `@join__field` if all graphs have the same field (with the same type)
                // It probably needs to be more complex than that, but it's a good start.
                field.byGraph.size === interfaceType.byGraph.size
                  ? []
                  : Array.from(field.byGraph.entries()).map(([graphName, meta]) => ({
                      graph: graphName.toUpperCase(),
                      type: meta.type === field.type ? undefined : meta.type,
                      override: meta.override ?? undefined,
                      provides: meta.provides ?? undefined,
                      requires: meta.requires ?? undefined,
                    })),
            },
          };
        }),
        tags: Array.from(interfaceType.tags),
        inaccessible: interfaceType.inaccessible,
        description: interfaceType.description,
        interfaces: Array.from(interfaceType.interfaces),
        ast: {
          directives: convertToConst(interfaceType.ast.directives),
        },
        join: {
          type: Array.from(interfaceType.byGraph)
            .map(([graphId, meta]) => {
              if (meta.keys.length && graphs.get(graphId)!.version !== 'v1.0') {
                return meta.keys.map(key => ({
                  graph: graphId,
                  key: key.fields,
                  extension: meta.extension,
                }));
              }

              return [
                {
                  graph: graphId,
                },
              ];
            })
            .flat(1),
          implements:
            interfaceType.interfaces.size > 0
              ? Array.from(interfaceType.byGraph.entries())
                  .map(([graphId, meta]) => {
                    if (meta.interfaces.size) {
                      return Array.from(meta.interfaces).map(iface => ({
                        graph: graphId,
                        interface: iface,
                      }));
                    }

                    return [];
                  })
                  .flat(1)
              : [],
        },
      });
    },
  };
}

export type InterfaceTypeState = {
  name: string;
  tags: Set<string>;
  inaccessible: boolean;
  hasDefinition: boolean;
  description?: Description;
  byGraph: MapByGraph<InterfaceTypeInGraph>;
  interfaces: Set<string>;
  implementedBy: Set<string>;
  fields: Map<string, InterfaceTypeFieldState>;
  ast: {
    directives: DirectiveNode[];
  };
};

type InterfaceTypeFieldState = {
  name: string;
  type: string;
  tags: Set<string>;
  inaccessible: boolean;
  deprecated?: Deprecated;
  description?: Description;
  byGraph: MapByGraph<FieldStateInGraph>;
  args: Map<string, InterfaceTypeFieldArgState>;
  ast: {
    directives: DirectiveNode[];
  };
};

export type InterfaceTypeFieldArgState = {
  name: string;
  type: string;
  tags: Set<string>;
  defaultValue?: string;
  description?: Description;
  deprecated?: Deprecated;
  byGraph: MapByGraph<ArgStateInGraph>;
  ast: {
    directives: DirectiveNode[];
  };
};

type InterfaceTypeInGraph = {
  extension: boolean;
  keys: Key[];
  interfaces: Set<string>;
  implementedBy: Set<string>;
};

type FieldStateInGraph = {
  type: string;
  override: string | null;
  provides: string | null;
  requires: string | null;
};

type ArgStateInGraph = {
  type: string;
  defaultValue?: string;
};

function getOrCreateInterfaceType(state: Map<string, InterfaceTypeState>, typeName: string) {
  const existing = state.get(typeName);

  if (existing) {
    return existing;
  }

  const def: InterfaceTypeState = {
    name: typeName,
    tags: new Set(),
    inaccessible: false,
    hasDefinition: false,
    byGraph: new Map(),
    fields: new Map(),
    interfaces: new Set(),
    implementedBy: new Set(),
    ast: {
      directives: [],
    },
  };

  state.set(typeName, def);

  return def;
}

function getOrCreateInterfaceField(
  interfaceTypeState: InterfaceTypeState,
  fieldName: string,
  fieldType: string,
) {
  const existing = interfaceTypeState.fields.get(fieldName);

  if (existing) {
    return existing;
  }

  const def: InterfaceTypeFieldState = {
    name: fieldName,
    type: fieldType,
    tags: new Set(),
    inaccessible: false,
    byGraph: new Map(),
    args: new Map(),
    ast: {
      directives: [],
    },
  };

  interfaceTypeState.fields.set(fieldName, def);

  return def;
}

function getOrCreateArg(fieldState: InterfaceTypeFieldState, argName: string, argType: string) {
  const existing = fieldState.args.get(argName);

  if (existing) {
    return existing;
  }

  const def: InterfaceTypeFieldArgState = {
    name: argName,
    type: argType,
    tags: new Set(),
    byGraph: new Map(),
    ast: {
      directives: [],
    },
  };

  fieldState.args.set(argName, def);

  return def;
}
