import { DirectiveNode } from 'graphql';
import type { FederationVersion } from '../../specifications/federation.js';
import { Deprecated, Description, ObjectType } from '../../subgraph/state.js';
import { createObjectTypeNode, JoinFieldAST } from './ast.js';
import type { Key, MapByGraph, TypeBuilder } from './common.js';
import { convertToConst } from './common.js';

export function isRealExtension(meta: ObjectTypeStateInGraph, version: FederationVersion) {
  return meta.extension
    ? meta.extensionType !== '@extends' && version === 'v1.0'
      ? false
      : true
    : false;
}

export function objectTypeBuilder(): TypeBuilder<ObjectType, ObjectTypeState> {
  return {
    visitSubgraphState(graph, state, typeName, type) {
      const objectTypeState = getOrCreateObjectType(state, typeName);

      type.tags.forEach(tag => objectTypeState.tags.add(tag));

      if (type.inaccessible) {
        objectTypeState.inaccessible = true;
      }

      if (type.authenticated) {
        objectTypeState.authenticated = true;
      }

      if (type.policies) {
        objectTypeState.policies.push(...type.policies);
      }

      if (type.scopes) {
        objectTypeState.scopes.push(...type.scopes);
      }

      const isDefinition =
        type.isDefinition && (graph.version === 'v1.0' ? type.extensionType !== '@extends' : true);

      if (type.description && !objectTypeState.description) {
        objectTypeState.description = type.description;
      }

      if (isDefinition) {
        objectTypeState.hasDefinition = true;
      }

      if (type.ast.directives) {
        type.ast.directives.forEach(directive => {
          objectTypeState.ast.directives.push(directive);
        });
      }

      type.interfaces.forEach(interfaceName => objectTypeState.interfaces.add(interfaceName));

      objectTypeState.byGraph.set(graph.id, {
        extension: type.extension,
        extensionType: type.extensionType,
        external: type.external,
        keys: type.keys,
        inaccessible: type.inaccessible,
        shareable: type.shareable,
        interfaces: type.interfaces,
      });

      for (const field of type.fields.values()) {
        const fieldState = getOrCreateField(objectTypeState, field.name, field.type);

        field.tags.forEach(tag => fieldState.tags.add(tag));

        const usedAsKey = type.fieldsUsedAsKeys.has(field.name);

        if (usedAsKey) {
          fieldState.usedAsKey = true;
        }

        // It's the first time we visited a non-external field, we should force the type on that field to match the local type
        const isExternal =
          graph.version === 'v1.0'
            ? field.external && isRealExtension(type, graph.version)
            : field.external;
        const shouldForceType =
          // If it's not an external field and it's first time we visited a non-external field,
          // we should force the type but only if it's not used as a key
          // If it's used as a key, some other logic applies. Federation v2 is such a mess...
          !usedAsKey && !isExternal && !fieldState.internal.seenNonExternal;
        const shouldChangeType =
          shouldForceType ||
          // If it's an external field, let's ignore it
          (!isExternal &&
            // if the field type is nullable and
            !field.type.endsWith('!') &&
            // the existing type is non-null
            fieldState.type.endsWith('!'));

        if (shouldChangeType) {
          // Replace the non-null type with a nullable type
          fieldState.type = field.type;
        }

        if (!fieldState.internal.seenNonExternal && !isExternal) {
          fieldState.internal.seenNonExternal = true;
        }

        if (field.inaccessible) {
          fieldState.inaccessible = true;
        }

        if (field.authenticated) {
          fieldState.authenticated = true;
        }

        if (field.policies) {
          fieldState.policies.push(...field.policies);
        }

        if (field.scopes) {
          fieldState.scopes.push(...field.scopes);
        }

        if (field.override) {
          fieldState.override = field.override;
        }

        if (field.description && !fieldState.description) {
          fieldState.description = field.description;
        }

        // First deprecation wins
        if (field.deprecated && !fieldState.deprecated) {
          fieldState.deprecated = field.deprecated;
        }

        field.ast.directives.forEach(directive => {
          fieldState.ast.directives.push(directive);
        });

        fieldState.byGraph.set(graph.id, {
          type: field.type,
          external: field.external,
          inaccessible: field.inaccessible,
          override: field.override,
          provides: field.provides,
          requires: field.requires,
          provided: field.provided,
          required: field.required,
          shareable: field.shareable,
          used: field.used,
          usedAsKey,
        });

        for (const arg of field.args.values()) {
          const argState = getOrCreateArg(fieldState, arg.name, arg.type);

          arg.tags.forEach(tag => argState.tags.add(tag));

          if (arg.type.endsWith('!')) {
            argState.type = arg.type;
          }

          if (arg.inaccessible) {
            argState.inaccessible = true;
          }

          if (!field.external) {
            // If the field is not external, it means that it's defined in the current graph
            argState.description = arg.description;
          }

          if (arg.deprecated && !argState.deprecated) {
            argState.deprecated = arg.deprecated;
          }

          arg.ast.directives.forEach(directive => {
            argState.ast.directives.push(directive);
          });

          if (typeof arg.defaultValue === 'string') {
            argState.defaultValue = arg.defaultValue;
          }

          argState.byGraph.set(graph.id, {
            type: arg.type,
            inaccessible: arg.inaccessible,
            defaultValue: arg.defaultValue,
          });
        }
      }
    },
    composeSupergraphNode(objectType, graphs) {
      const isQuery = objectType.name === 'Query';

      return createObjectTypeNode({
        name: objectType.name,
        ast: {
          // DirectiveNode and ConstDirectiveNode are identical (except the readonly shit...)
          directives: convertToConst(objectType.ast.directives),
        },
        description: objectType.description,
        fields: Array.from(objectType.fields.values()).map(field => {
          const fieldInGraphs = Array.from(field.byGraph.entries());

          const hasDifferentOutputType = fieldInGraphs.some(
            ([_, meta]) => meta.type !== field.type,
          );
          const isDefinedEverywhere =
            field.byGraph.size === (isQuery ? graphs.size : objectType.byGraph.size);
          let joinFields: JoinFieldAST[] = [];

          const differencesBetweenGraphs = {
            override: false,
            type: false,
            external: false,
            provides: false,
            requires: false,
          };

          for (const [graphId, meta] of fieldInGraphs) {
            if (meta.external) {
              differencesBetweenGraphs.external = field.usedAsKey
                ? objectType.byGraph.get(graphId)!.extension !== true
                : true;
            }
            if (meta.override !== null) {
              differencesBetweenGraphs.override = true;
            }
            if (meta.provides !== null) {
              differencesBetweenGraphs.provides = true;
            }
            if (meta.requires !== null) {
              differencesBetweenGraphs.requires = true;
            }
            if (meta.type !== field.type) {
              differencesBetweenGraphs.type = true;
            }
          }

          if (isQuery) {
            // If it's a Query type, we don't need to emit `@join__field` directives when there's only one graph
            // We do not have to emit `@join__field` if the field is shareable in every graph as well.

            if (differencesBetweenGraphs.override) {
              const graphsWithOverride = fieldInGraphs.filter(
                ([_, meta]) => meta.override !== null,
              );

              joinFields = graphsWithOverride.map(([graphId, meta]) => ({
                graph: graphId,
                override: meta.override ?? undefined,
                type: differencesBetweenGraphs.type ? meta.type : undefined,
                external: meta.external ?? undefined,
                provides: meta.provides ?? undefined,
                requires: meta.requires ?? undefined,
              }));
            } else {
              joinFields =
                graphs.size > 1 && !isDefinedEverywhere
                  ? fieldInGraphs.map(([graphId, meta]) => ({
                      graph: graphId,
                      provides: differencesBetweenGraphs.provides
                        ? meta.provides ?? undefined
                        : undefined,
                    }))
                  : [];
            }
          } else if (isDefinedEverywhere) {
            const hasDifferencesBetweenGraphs = Object.values(differencesBetweenGraphs).some(
              value => value === true,
            );

            // An override is a special case, we need to emit `@join__field` only for graphs where @override was applied
            if (differencesBetweenGraphs.override) {
              const graphsWithOverride = fieldInGraphs.filter(
                ([_, meta]) => meta.override !== null,
              );

              joinFields = graphsWithOverride.map(([graphId, meta]) => ({
                graph: graphId,
                override: meta.override ?? undefined,
                type: differencesBetweenGraphs.type ? meta.type : undefined,
                external: meta.external ?? undefined,
                provides: meta.provides ?? undefined,
                requires: meta.requires ?? undefined,
              }));
            } else if (hasDifferencesBetweenGraphs) {
              joinFields = fieldInGraphs.map(([graphId, meta]) => ({
                graph: graphId,
                type: differencesBetweenGraphs.type ? meta.type : undefined,
                override: meta.override ?? undefined,
                external: meta.external
                  ? // mark field as external if it's annotated with @external, but it's not used as a key on the extension type
                    field.usedAsKey && objectType.byGraph.get(graphId)!.extension === true
                    ? false
                    : true
                  : undefined,
                provides: meta.provides ?? undefined,
                requires: meta.requires ?? undefined,
              }));
            }
          } else {
            // An override is a special case, we need to emit `@join__field` only for graphs where @override was applied
            if (differencesBetweenGraphs.override) {
              const graphsWithOverride = fieldInGraphs.filter(
                ([_, meta]) => meta.override !== null,
              );

              joinFields = graphsWithOverride.map(([graphId, meta]) => ({
                graph: graphId,
                override: meta.override ?? undefined,
                type: differencesBetweenGraphs.type ? meta.type : undefined,
                external: meta.external ?? undefined,
                provides: meta.provides ?? undefined,
                requires: meta.requires ?? undefined,
              }));
            } else {
              joinFields = fieldInGraphs.map(([graphId, meta]) => ({
                graph: graphId,
                type: hasDifferentOutputType ? meta.type : undefined,
                override: meta.override ?? undefined,
                external: meta.external ?? undefined,
                provides: meta.provides ?? undefined,
                requires: meta.requires ?? undefined,
              }));
            }
          }

          return {
            name: field.name,
            type: field.type,
            inaccessible: field.inaccessible,
            authenticated: field.authenticated,
            policies: field.policies,
            scopes: field.scopes,
            tags: Array.from(field.tags),
            description: field.description,
            deprecated: field.deprecated,
            ast: {
              directives: convertToConst(field.ast.directives),
            },
            join: {
              field: joinFields,
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
                  inaccessible: arg.inaccessible,
                  tags: Array.from(arg.tags),
                  defaultValue: arg.defaultValue,
                  description: arg.description,
                  deprecated: arg.deprecated,
                  ast: {
                    directives: convertToConst(arg.ast.directives),
                  },
                };
              }),
          };
        }),
        interfaces: Array.from(objectType.interfaces),
        tags: Array.from(objectType.tags),
        inaccessible: objectType.inaccessible,
        authenticated: objectType.authenticated,
        policies: objectType.policies,
        scopes: objectType.scopes,
        join: {
          type: isQuery
            ? // if it's a Query, we need to annotate the object type with `@join__type` pointing to all subgraphs
              Array.from(graphs.values()).map(graph => ({
                graph: graph.id,
              }))
            : // If it's not a Query, we follow the regular logic
              Array.from(objectType.byGraph.entries())
                .map(([graphId, meta]) => {
                  if (meta.keys.length) {
                    return meta.keys.map(key => ({
                      graph: graphId,
                      key: key.fields,
                      // To support Fed v1, we need to only apply `extension: true` when it's a type annotated with @extends (not by using `extend type` syntax, this needs to be ignored)
                      extension: isRealExtension(meta, graphs.get(graphId)!.version),
                      resolvable: key.resolvable,
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
            objectType.interfaces.size > 0
              ? Array.from(objectType.byGraph.entries())
                  .map(([graph, meta]) => {
                    if (meta.interfaces.size > 0) {
                      return Array.from(meta.interfaces).map(interfaceName => ({
                        graph: graph.toUpperCase(),
                        interface: interfaceName,
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

export type ObjectTypeState = {
  name: string;
  tags: Set<string>;
  inaccessible: boolean;
  authenticated: boolean;
  policies: string[][];
  scopes: string[][];
  hasDefinition: boolean;
  byGraph: MapByGraph<ObjectTypeStateInGraph>;
  interfaces: Set<string>;
  fields: Map<string, ObjectTypeFieldState>;
  description?: Description;
  ast: {
    directives: DirectiveNode[];
  };
};

export type ObjectTypeFieldState = {
  name: string;
  type: string;
  tags: Set<string>;
  inaccessible: boolean;
  authenticated: boolean;
  policies: string[][];
  scopes: string[][];
  usedAsKey: boolean;
  override: string | null;
  byGraph: MapByGraph<FieldStateInGraph>;
  args: Map<string, ObjectTypeFieldArgState>;
  description?: Description;
  deprecated?: Deprecated;
  ast: {
    directives: DirectiveNode[];
  };
  internal: {
    seenNonExternal: boolean;
  };
};

export type ObjectTypeFieldArgState = {
  name: string;
  type: string;
  tags: Set<string>;
  inaccessible: boolean;
  defaultValue?: string;
  byGraph: MapByGraph<ArgStateInGraph>;
  description?: Description;
  deprecated?: Deprecated;
  ast: {
    directives: DirectiveNode[];
  };
};

export type ObjectTypeStateInGraph = {
  extension: boolean;
  extensionType?: '@extends' | 'extend';
  external: boolean;
  keys: Key[];
  interfaces: Set<string>;
  inaccessible: boolean;
  shareable: boolean;
};

type FieldStateInGraph = {
  type: string;
  external: boolean;
  inaccessible: boolean;
  used: boolean;
  override: string | null;
  provides: string | null;
  requires: string | null;
  provided: boolean;
  required: boolean;
  shareable: boolean;
  usedAsKey: boolean;
};

type ArgStateInGraph = {
  type: string;
  inaccessible: boolean;
  defaultValue?: string;
};

function getOrCreateObjectType(state: Map<string, ObjectTypeState>, typeName: string) {
  const existing = state.get(typeName);

  if (existing) {
    return existing;
  }

  const def: ObjectTypeState = {
    name: typeName,
    tags: new Set(),
    hasDefinition: false,
    inaccessible: false,
    authenticated: false,
    policies: [],
    scopes: [],
    interfaces: new Set(),
    byGraph: new Map(),
    fields: new Map(),
    ast: {
      directives: [],
    },
  };

  state.set(typeName, def);

  return def;
}

function getOrCreateField(objectTypeState: ObjectTypeState, fieldName: string, fieldType: string) {
  const existing = objectTypeState.fields.get(fieldName);

  if (existing) {
    return existing;
  }

  const def: ObjectTypeFieldState = {
    name: fieldName,
    type: fieldType,
    tags: new Set(),
    inaccessible: false,
    authenticated: false,
    policies: [],
    scopes: [],
    usedAsKey: false,
    override: null,
    byGraph: new Map(),
    args: new Map(),
    ast: {
      directives: [],
    },
    internal: {
      seenNonExternal: false,
    },
  };

  objectTypeState.fields.set(fieldName, def);

  return def;
}

function getOrCreateArg(fieldState: ObjectTypeFieldState, argName: string, argType: string) {
  const existing = fieldState.args.get(argName);

  if (existing) {
    return existing;
  }

  const def: ObjectTypeFieldArgState = {
    name: argName,
    type: argType,
    tags: new Set(),
    inaccessible: false,
    byGraph: new Map(),
    ast: {
      directives: [],
    },
  };

  fieldState.args.set(argName, def);

  return def;
}
