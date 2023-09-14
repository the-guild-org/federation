import {
  DocumentNode,
  FieldNode,
  GraphQLError,
  InlineFragmentNode,
  Kind,
  ListValueNode,
  OperationTypeNode,
  print,
  SelectionSetNode,
  specifiedScalarTypes,
  ValueNode,
} from 'graphql';
import { parseFields } from '../../../subgraph/helpers.js';
import { ObjectType, TypeKind } from '../../../subgraph/state.js';
import { DepGraph } from '../../../utils/dependency-graph.js';
import { isDefined } from '../../../utils/helpers.js';
import { isList, isNonNull, stripNonNull, stripTypeModifiers } from '../../../utils/state.js';
import { ObjectTypeFieldState, ObjectTypeState } from '../../composition/object-type.js';
import { UnionTypeState } from '../../composition/union-type.js';
import type { SupergraphVisitorMap } from '../../composition/visitor.js';
import type { SupergraphState } from '../../state.js';
import type { SupergraphValidationContext } from '../validation-context.js';

function canGraphMoveToGraph(
  supergraphState: SupergraphState,
  objectTypeState: ObjectTypeState,
  sourceGraphId: string,
  targetGraphId: string,
): boolean {
  const sourceGraphKeys = objectTypeState.byGraph.get(sourceGraphId)!.keys;
  const targetGraphKeys = objectTypeState.byGraph.get(targetGraphId)!.keys;

  // no keys in both graphs? can't move.
  if (sourceGraphKeys.length === 0 && targetGraphKeys.length === 0) {
    return false;
  }

  const fieldsOfSourceGraph = Array.from(objectTypeState.fields.values()).filter(f =>
    f.byGraph.get(sourceGraphId),
  );
  const nonExternalFieldsOfSourceGraph = fieldsOfSourceGraph.filter(
    f => f.byGraph.get(sourceGraphId)!.external === false,
  );

  if (sourceGraphKeys.length === 0) {
    // if the source type has no keys,
    // we need to check if the fields resolvable by the type
    // can be used to resolve the key fields of the target graph
    return targetGraphKeys
      .filter(k => k.resolvable === true)
      .some(k => {
        const targetKeyFields = resolveFieldsFromFieldSet(
          k.fields,
          objectTypeState.name,
          targetGraphId,
          supergraphState,
        );
        return Array.from(targetKeyFields.coordinates).every(fieldPath => {
          const [typeName, fieldName] = fieldPath.split('.');

          if (typeName === objectTypeState.name) {
            const fieldState = objectTypeState.fields.get(fieldName);
            if (!fieldState) {
              throw new Error(`Field "${fieldPath}" not found in object type "${typeName}"`);
            }

            const fieldStateByGraph = fieldState.byGraph.get(targetGraphId);
            if (!fieldStateByGraph) {
              throw new Error(
                `Field "${fieldPath}" not found in object type "${typeName}" in graph "${targetGraphId}"`,
              );
            }

            return fieldStateByGraph.external === false;
          }

          const currentTypeState =
            supergraphState.objectTypes.get(typeName) ??
            supergraphState.interfaceTypes.get(typeName);

          if (!currentTypeState) {
            throw new Error(`Type "${typeName}" not found`);
          }

          const fieldState = currentTypeState.fields.get(fieldName);

          if (!fieldState) {
            throw new Error(`Field "${fieldPath}" not found in object type "${typeName}"`);
          }

          const fieldStateByGraph = fieldState.byGraph.get(targetGraphId);

          if (!fieldStateByGraph) {
            throw new Error(
              `Field "${fieldPath}" not found in object type "${typeName}" in graph "${targetGraphId}"`,
            );
          }

          if ('external' in fieldStateByGraph) {
            return fieldStateByGraph.external === false;
          }

          return true;
        });
      });
  }

  return sourceGraphKeys.some(sourceGraphKey => {
    // if a subgraph has `resolvable: false` it means that it cannot resolve a reference (it has no __resolveReference resolver)
    // That's why it's fine to not check if the @key has resolvable: false.

    // Get source key fields
    const sourceKeyFields = resolveFieldsFromFieldSet(
      sourceGraphKey.fields,
      objectTypeState.name,
      sourceGraphId,
      supergraphState,
    );

    return (
      targetGraphKeys
        // @key(resolvable: false) means this graph cannot resolve the entity by the key
        .filter(k => k.resolvable === true)
        .some(k => {
          const targetKeyFields = resolveFieldsFromFieldSet(
            k.fields,
            objectTypeState.name,
            targetGraphId,
            supergraphState,
          );

          for (const fieldPath of targetKeyFields.paths) {
            if (!sourceKeyFields.paths.has(fieldPath)) {
              // Every field of target key fields needs to be in source key fields
              return false;
            }
          }

          return true;
        })
    );
  });
}

function canGraphResolveFieldDirectly(
  objectTypeSuperState: ObjectTypeState,
  fieldSuperState: ObjectTypeFieldState,
  graphId: string,
  supergraphState: SupergraphState,
): boolean {
  const objectTypeInGraph = objectTypeSuperState.byGraph.get(graphId);

  if (!objectTypeInGraph) {
    throw new Error(`Object type "${objectTypeSuperState.name}" not found in graph "${graphId}"`);
  }

  const fieldInGraph = fieldSuperState.byGraph.get(graphId);

  if (!fieldInGraph) {
    return false;
  }

  if (
    (fieldInGraph.shareable === true ||
      objectTypeSuperState.byGraph.get(graphId)!.shareable === true) &&
    // it needs to be explicitly marked as @shareable
    supergraphState.graphs.get(graphId)!.version !== 'v1.0'
  ) {
    return true;
  }

  if (fieldInGraph.external === true) {
    if (fieldInGraph.usedAsKey === true) {
      const graphHasAtLeastOneResolvableField = Array.from(
        objectTypeSuperState.fields.values(),
      ).some(f => {
        if (f.name === fieldSuperState.name) {
          return false;
        }

        const fInGraph = f.byGraph.get(graphId);

        if (!fInGraph) {
          return false;
        }

        if (fInGraph.external === true) {
          return false;
        }

        if (fInGraph.inaccessible === true) {
          return false;
        }

        if (typeof fInGraph.override === 'string') {
          return false;
        }

        return true;
      });

      if (graphHasAtLeastOneResolvableField) {
        return true;
      }
    }

    return false;
  }

  return true;
}

function canGraphResolveField(
  objectTypeSuperState: ObjectTypeState,
  fieldSuperState: ObjectTypeFieldState,
  graphId: string,
  supergraphState: SupergraphState,
  movabilityGraph: DepGraph<string>,
): boolean {
  const objectTypeInGraph = objectTypeSuperState.byGraph.get(graphId);

  if (!objectTypeInGraph) {
    throw new Error(`Object type "${objectTypeSuperState.name}" not found in graph "${graphId}"`);
  }

  const fieldInGraph = fieldSuperState.byGraph.get(graphId);

  if (
    fieldInGraph &&
    fieldInGraph.external === false &&
    canGraphResolveFieldDirectly(objectTypeSuperState, fieldSuperState, graphId, supergraphState)
  ) {
    return true;
  }

  const graphsWithField = Array.from(fieldSuperState.byGraph).filter(([g, _]) => {
    if (g === graphId) {
      return false;
    }

    const fieldInGraph = fieldSuperState.byGraph.get(g);
    if (!fieldInGraph || fieldInGraph.external === true) {
      return false;
    }

    return true;
  });

  const canMoveToGraphWithField = graphsWithField.some(([g, _]) => {
    return canGraphMoveToGraphBasedOnMovabilityGraph(movabilityGraph, graphId, g);
  });

  return canMoveToGraphWithField;
}

function canGraphMoveToGraphBasedOnMovabilityGraph(
  movabilityGraph: DepGraph<string>,
  sourceId: string,
  destinationId: string,
  visited: Set<string> = new Set(),
): boolean {
  const key = `${sourceId} => ${destinationId}`;
  if (visited.has(key)) {
    return false;
  } else {
    visited.add(key);
  }
  const deps = movabilityGraph.directDependenciesOf(sourceId);

  if (deps.includes(destinationId)) {
    return true;
  }

  return deps.some(depId =>
    canGraphMoveToGraphBasedOnMovabilityGraph(movabilityGraph, depId, destinationId, visited),
  );
}

function findLeafs(
  movabilityGraph: DepGraph<string>,
  sourceId: string,
  destinationId: string,
  leafs?: Set<string>,
  visited: Set<string> = new Set(),
) {
  const key = `${sourceId} => ${destinationId}`;
  if (leafs === undefined) {
    leafs = new Set();
  }
  const deps = movabilityGraph.directDependenciesOf(sourceId);

  if (visited.has(key)) {
    return Array.from(leafs);
  } else {
    visited.add(key);
  }

  for (const depId of deps) {
    if (!canGraphMoveToGraphBasedOnMovabilityGraph(movabilityGraph, depId, destinationId)) {
      leafs.add(depId);
      findLeafs(movabilityGraph, depId, destinationId, leafs, visited);
    }
  }

  return Array.from(leafs);
}

export function SatisfiabilityRule(
  context: SupergraphValidationContext,
  supergraphState: SupergraphState,
): SupergraphVisitorMap {
  const typeDependencies = buildOutputTypesDependencies(supergraphState);
  /**
   * Map of graph IDs to a set of graph IDs that the graph can move to.
   */
  let currentMovabilityGraphType: string;
  let movabilityGraph: DepGraph<string>;

  return {
    // ObjectType runs before ObjectTypeField
    ObjectType(objectState) {
      // I want to check which graph can move to which graph.
      // Once I know it,
      // I can quickly check if a missing field
      // can be resolved by talking to a graph
      // that can move to the graph that has the field.
      currentMovabilityGraphType = objectState.name;
      movabilityGraph = new DepGraph({
        circular: true,
      });

      const graphIds = Array.from(objectState.byGraph.keys());

      for (const sourceGraphId of objectState.byGraph.keys()) {
        movabilityGraph.addNode(sourceGraphId);
      }

      for (const sourceGraphId of objectState.byGraph.keys()) {
        const otherGraphIds = graphIds.filter(g => g !== sourceGraphId);

        for (const destGraphId of otherGraphIds) {
          if (canGraphMoveToGraph(supergraphState, objectState, sourceGraphId, destGraphId)) {
            movabilityGraph.addDependency(sourceGraphId, destGraphId);
          }
        }
      }
    },
    ObjectTypeField(objectState, fieldState) {
      if (currentMovabilityGraphType !== objectState.name) {
        throw new Error('ObjectTypeField runs before ObjectType! This should not happen.');
      }

      if (
        objectState.name === 'Query' ||
        objectState.name === 'Mutation' ||
        objectState.name === 'Subscription'
      ) {
        return;
      }

      // ignore if type is defined in only one subgraph
      if (objectState.byGraph.size === 1) {
        return;
      }

      // Root types are normalized at this point
      const dependenciesOfObjectType = typeDependencies.dependentsOf(objectState.name);
      const isReachableByRootType = {
        query: dependenciesOfObjectType.includes('Query'),
        mutation: dependenciesOfObjectType.includes('Mutation'),
        subscription: dependenciesOfObjectType.includes('Subscription'),
      };
      const isReachable =
        isReachableByRootType.query ||
        isReachableByRootType.mutation ||
        isReachableByRootType.subscription;

      // ignore if type is not reachable from the root (Query/Mutation/Subscription) type.
      if (!isReachable) {
        return;
      }

      const objectStateGraphPairs = Array.from(objectState.byGraph);
      const fieldStateGraphPairs = Array.from(fieldState.byGraph);

      // ignore type or field if annotated with `@inaccessible`
      if (
        objectStateGraphPairs.some(
          ([_, objectTypeStateInGraph]) => objectTypeStateInGraph.inaccessible === true,
        ) ||
        fieldStateGraphPairs.some(
          ([_, fieldStateInGraph]) => fieldStateInGraph.inaccessible === true,
        )
      ) {
        return;
      }

      const isFieldShareableInAllSubgraphs = Array.from(fieldState.byGraph).every(
        ([graphId, fieldStateInGraph]) => {
          const fieldShareable =
            fieldStateInGraph.shareable &&
            // and if it's not Fed v1
            context.subgraphStates.get(graphId)!.version !== 'v1.0';
          const typeShareable = objectState.byGraph.get(graphId)!.shareable === true;

          return fieldShareable || typeShareable;
        },
      );
      if (isFieldShareableInAllSubgraphs) {
        return;
      }

      // ignore if it's part of key fields in all subgraphs
      if (
        fieldState.byGraph.size === objectState.byGraph.size &&
        fieldStateGraphPairs.every(
          ([_, f]) => f.usedAsKey === true && f.external === false && !f.override,
        )
      ) {
        return;
      }

      const keysInAllGraphs = objectStateGraphPairs.every(([_, o]) => o.keys.length > 0);
      const uniqueKeyFieldsSet = new Set(
        objectStateGraphPairs
          .map(([_, o]) => o.keys.map(k => k.fields /*.replace(/\,/g, '')*/))
          .flat(1),
      );

      // ignore if `@key(fields:)` is identical in all subgraphs
      if (keysInAllGraphs && uniqueKeyFieldsSet.size === 1) {
        return;
      }

      const aggregatedErrorByRootType: Record<
        'Query' | 'Mutation' | 'Subscription',
        {
          query: string | null;
          reasons: Array<[string, string[]]>;
        }
      > = {
        Query: {
          query: null,
          reasons: [],
        },
        Mutation: {
          query: null,
          reasons: [],
        },
        Subscription: {
          query: null,
          reasons: [],
        },
      };

      if (uniqueKeyFieldsSet.size > 0) {
        //
        // We're dealing with entities
        //

        // We should do it the other way around.
        // 1. Find a field that does not exist in all graphs or is not shareable in all graphs or is external etc.
        // 2. Create a list of graphs that needs to resolve that field from the original graph.
        // 3. See if they key provided by those graphs can fullfil the key of the original graph.

        for (const graphId of objectState.byGraph.keys()) {
          // we need to run it for each root type
          if (
            canGraphResolveField(objectState, fieldState, graphId, supergraphState, movabilityGraph)
          ) {
            continue;
          }

          const fieldStateInGraph = fieldState.byGraph.get(graphId);

          if (fieldStateInGraph?.external === true) {
            const objectStateInGraph = objectState.byGraph.get(graphId)!;
            if (objectStateInGraph.extension === true) {
              // if a field is marked as external but defined in type extension, it's fine
              continue;
            }

            // if a field is marked as external but required by some other field, it's fine
            if (fieldStateInGraph.required) {
              continue;
            }

            // if a field is marked as external but provided by some other field, it's fine
            if (fieldStateInGraph.provided) {
              continue;
            }
          }

          const subgraphState = context.subgraphStates.get(graphId)!;
          const schemaDefinitionOfGraph = subgraphState.schema;
          const rootTypes = (
            [
              schemaDefinitionOfGraph.queryType
                ? ([
                    'Query',
                    subgraphState.types.get(schemaDefinitionOfGraph.queryType) as ObjectType,
                  ] as const)
                : undefined,
              schemaDefinitionOfGraph.mutationType
                ? ([
                    'Mutation',
                    subgraphState.types.get(schemaDefinitionOfGraph.mutationType) as ObjectType,
                  ] as const)
                : undefined,
              schemaDefinitionOfGraph.subscriptionType
                ? ([
                    'Subscription',
                    subgraphState.types.get(schemaDefinitionOfGraph.subscriptionType) as ObjectType,
                  ] as const)
                : undefined,
            ] as const
          ).filter(isDefined);

          // ignore a graph if it doesn't have a root type that could reach the field
          if (rootTypes.length === 0) {
            continue;
          }

          const otherGraphIds = objectStateGraphPairs
            .filter(([g, _]) => g !== graphId)
            .map(([g, _]) => g);

          const graphsWithField = fieldStateGraphPairs
            .filter(([g, _]) =>
              canGraphResolveFieldDirectly(objectState, fieldState, g, supergraphState),
            )
            .map(([g, _]) => g);

          // Dependencies of current graph that cannot resolve the field by jumping between graphs
          const leafs = graphsWithField.map(g => findLeafs(movabilityGraph, graphId, g)).flat(1);

          // If there are no leafs, it means that the field is resolvable by jumping between graphs.
          // It's only true if the graph can jump to at least one graph.
          if (leafs.length === 0 && movabilityGraph.directDependenciesOf(graphId).length > 0) {
            continue;
          }

          for (const [normalizedName, rootType] of rootTypes) {
            const query = printExampleQuery(
              supergraphState,
              normalizedName,
              Array.from(rootType.fields.keys()),
              objectState.name,
              fieldState.name,
              dependenciesOfObjectType,
            );
            const reasons: Array<[string, string[]]> = [];

            const canBeIndirectlyResolved = leafs.length > 0;

            const cannotMoveToList = (sourceGraphId: string) =>
              canBeIndirectlyResolved
                ? graphsWithField
                    .map(gid => {
                      const keys = objectState.byGraph.get(gid)!.keys.map(k => k.fields);

                      if (keys.length > 0) {
                        return objectState.byGraph
                          .get(gid)!
                          .keys.map(k => k.fields)
                          .map(
                            fields =>
                              `cannot move to subgraph "${context.graphIdToName(
                                gid,
                              )}" using @key(fields: "${fields}") of "${
                                objectState.name
                              }", the key field(s) cannot be resolved from subgraph "${context.graphIdToName(
                                sourceGraphId,
                              )}".`,
                          );
                      }

                      return `cannot move to subgraph "${context.graphIdToName(
                        gid,
                      )}", which has field "${objectState.name}.${
                        fieldState.name
                      }", because type "${
                        objectState.name
                      }" has no @key defined in subgraph "${context.graphIdToName(gid)}".`;
                    })
                    .flat(1)
                : otherGraphIds
                    .filter(g => !movabilityGraph.directDependenciesOf(graphId).includes(g))
                    .map(gid => {
                      const keys = objectState.byGraph.get(gid)!.keys.map(k => k.fields);

                      if (keys.length > 0) {
                        return objectState.byGraph
                          .get(gid)!
                          .keys.map(k => k.fields)
                          .map(
                            fields =>
                              `cannot move to subgraph "${context.graphIdToName(
                                gid,
                              )}" using @key(fields: "${fields}") of "${
                                objectState.name
                              }", the key field(s) cannot be resolved from subgraph "${context.graphIdToName(
                                sourceGraphId,
                              )}".`,
                          );
                      }

                      return `cannot move to subgraph "${context.graphIdToName(
                        gid,
                      )}", which has field "${objectState.name}.${
                        fieldState.name
                      }", because type "${
                        objectState.name
                      }" has no @key defined in subgraph "${context.graphIdToName(gid)}".`;
                    })
                    .flat(1);

            const fromSubgraphs = [graphId].concat(leafs);

            if (!fieldStateInGraph) {
              fromSubgraphs.forEach(gid => {
                reasons.push([
                  gid,
                  [`cannot find field "${objectState.name}.${fieldState.name}".`].concat(
                    cannotMoveToList(gid),
                  ),
                ]);
              });
            } else if (fieldStateInGraph.external) {
              fromSubgraphs.forEach(gid => {
                reasons.push([
                  gid,
                  [
                    `field "${objectState.name}.${fieldState.name}" is not resolvable because marked @external.`,
                  ].concat(cannotMoveToList(gid)),
                ]);
              });
            } else {
              console.log(
                'can NOT resolve field',
                fieldState.name,
                'in graph',
                graphId,
                'reason: unknown',
              );
            }

            if (!query || reasons.length === 0) {
              continue;
            }

            context.reportError(
              new GraphQLError(
                [
                  'The following supergraph API query:',
                  query,
                  'cannot be satisfied by the subgraphs because:',
                  ...reasons.map(([gid, reasons]) => {
                    return (
                      `- from subgraph "${context.graphIdToName(gid)}":\n` +
                      reasons.map(r => `  - ${r}`).join('\n')
                    );
                  }),
                ].join('\n'),
                {
                  extensions: {
                    code: 'SATISFIABILITY_ERROR',
                  },
                },
              ),
            );
          }
        }
      } else {
        //
        // We're dealing with non-entities
        //
        const graphsWithoutField = objectStateGraphPairs.filter(
          ([graphId]) => !fieldState.byGraph.has(graphId),
        );
        const graphsWithField = fieldStateGraphPairs.map(([graphId]) => graphId);

        for (const [graphId] of graphsWithoutField) {
          const subgraphState = context.subgraphStates.get(graphId)!;

          // check if everything that refers to the object type is shareable
          const isShareableWithOtherGraphs = Array.from(subgraphState.types.values())
            .filter(t => dependenciesOfObjectType.includes(t.name))
            .every(t => {
              if (t.kind === TypeKind.OBJECT) {
                if (
                  t.shareable &&
                  // it needs to be explicitly marked as @shareable
                  subgraphState.version !== 'v1.0'
                ) {
                  return true;
                }

                const fields = Array.from(t.fields.values());

                if (
                  fields
                    .filter(f => stripTypeModifiers(f.type) === objectState.name)
                    .every(
                      f =>
                        f.shareable === true &&
                        // it needs to be explicitly marked as @shareable
                        subgraphState.version !== 'v1.0',
                    )
                ) {
                  return true;
                }
              }

              return false;
            });

          if (isShareableWithOtherGraphs) {
            continue;
          }

          // if graph has no resolvable fields, ignore it as it's not possible that a gateway will call it
          const graphHasAtLeastOneResolvableField = Array.from(objectState.fields.values()).some(
            f => {
              const fieldInGraph = f.byGraph.get(graphId);

              if (!fieldInGraph) {
                return false;
              }

              if (fieldInGraph.inaccessible === true) {
                return false;
              }

              return true;
            },
          );

          if (!graphHasAtLeastOneResolvableField) {
            continue;
          }

          const schemaDefinitionOfGraph = subgraphState.schema;
          const rootTypes = (
            [
              schemaDefinitionOfGraph.queryType
                ? ([
                    'Query',
                    subgraphState.types.get(schemaDefinitionOfGraph.queryType) as ObjectType,
                  ] as const)
                : undefined,
              schemaDefinitionOfGraph.mutationType
                ? ([
                    'Mutation',
                    subgraphState.types.get(schemaDefinitionOfGraph.mutationType) as ObjectType,
                  ] as const)
                : undefined,
              schemaDefinitionOfGraph.subscriptionType
                ? ([
                    'Subscription',
                    subgraphState.types.get(schemaDefinitionOfGraph.subscriptionType) as ObjectType,
                  ] as const)
                : undefined,
            ] as const
          ).filter(isDefined);

          // ignore a graph if it doesn't have a root type that could reach the field
          if (rootTypes.length === 0) {
            continue;
          }

          for (const [normalizedName, rootType] of rootTypes) {
            const rootTypeFields = Array.from(rootType.fields.keys()).filter(
              f => f !== '_entities' && f !== '_service',
            );

            if (rootTypeFields.length === 0) {
              // ignore if root type has no fields
              continue;
            }

            const supergraphRootType = supergraphState.objectTypes.get(normalizedName)!;
            const rootFieldsReferencingObjectType = Array.from(
              supergraphRootType.fields.values(),
            ).filter(f => {
              const fieldOutputTypeName = stripTypeModifiers(f.type);

              return (
                fieldOutputTypeName === objectState.name ||
                dependenciesOfObjectType.includes(fieldOutputTypeName)
              );
            });

            if (rootFieldsReferencingObjectType.length === 0) {
              // ignore if root type doesn't have a field referencing (directly or indirectly) the object type
              continue;
            }

            const graphIdsImplementingObjectType = Array.from(objectState.byGraph.keys());
            // if root field pointing to the object type is the same in all subgraphs implementing the object type, we can ignore it
            if (
              rootFieldsReferencingObjectType.every(field =>
                graphIdsImplementingObjectType.every(g => field.byGraph.has(g)),
              )
            ) {
              continue;
            }

            // check if all root fields of the current graph (that does not define the field)
            // are also defined in graphs that define the missing field.
            const areRootFieldsShared = graphsWithField.every(g => {
              const localVersion = context.subgraphStates.get(g)!.version;

              if (localVersion !== 'v1.0') {
                // TODO: check if we should consider looking for @shareable here (for non-v1 graphs)
                return false;
              }

              const localSubgraph = context.subgraphStates.get(g)!;
              const localSchemaDefinition = localSubgraph.schema;
              const localRootTypeName =
                normalizedName === 'Query'
                  ? localSchemaDefinition.queryType
                  : normalizedName === 'Mutation'
                  ? localSchemaDefinition.mutationType
                  : normalizedName === 'Subscription'
                  ? localSchemaDefinition.subscriptionType
                  : undefined;

              if (!localRootTypeName) {
                return true;
              }

              const localRootType = localSubgraph.types.get(localRootTypeName) as ObjectType;
              const localRootFields = Array.from(localRootType.fields.keys());

              return rootFieldsReferencingObjectType.every(f => localRootFields.includes(f.name));
            });

            if (areRootFieldsShared) {
              continue;
            }

            if (!aggregatedErrorByRootType[normalizedName].query) {
              aggregatedErrorByRootType[normalizedName].query = printExampleQuery(
                supergraphState,
                normalizedName,
                rootTypeFields,
                objectState.name,
                fieldState.name,
                dependenciesOfObjectType,
              );
            }

            // TODO: make sure it's always one graph that has the field, otherwise we need to handle it differently
            const firstFieldImplementingGraph = graphsWithField[0];
            const graphNameOwningField = context.graphIdToName(firstFieldImplementingGraph);

            aggregatedErrorByRootType[normalizedName].reasons.push([
              graphId,
              [
                `cannot find field "${objectState.name}.${fieldState.name}".`,
                `cannot move to subgraph "${graphNameOwningField}", which has field "${objectState.name}.${fieldState.name}", because type "${objectState.name}" has no @key defined in subgraph "${graphNameOwningField}".`,
              ],
            ]);
          }
        }
      }

      for (const rootTypeName in aggregatedErrorByRootType) {
        const details =
          aggregatedErrorByRootType[rootTypeName as keyof typeof aggregatedErrorByRootType];

        if (!details.query || details.reasons.length === 0) {
          continue;
        }

        context.reportError(
          new GraphQLError(
            [
              'The following supergraph API query:',
              details.query,
              'cannot be satisfied by the subgraphs because:',
              ...details.reasons.map(([graphId, reasons]) => {
                return (
                  `- from subgraph "${context.graphIdToName(graphId)}":\n` +
                  reasons.map(r => `  - ${r}`).join('\n')
                );
              }),
            ].join('\n'),
            {
              extensions: {
                code: 'SATISFIABILITY_ERROR',
              },
            },
          ),
        );
      }
    },
  };
}

// TODO: support interfaces
// This could be built during the "visiting" phase of each subgraph
function buildOutputTypesDependencies(supergraphState: SupergraphState) {
  const graph = new DepGraph({
    circular: true,
  });

  for (const [typeName, typeState] of supergraphState.objectTypes) {
    if (typeName === '_Service') {
      continue;
    }

    graph.addNode(typeName);

    for (const [_, fieldState] of typeState.fields) {
      const referencedTypeName = stripTypeModifiers(fieldState.type);

      if (!graph.hasNode(referencedTypeName)) {
        graph.addNode(referencedTypeName);
      }

      graph.addDependency(typeName, referencedTypeName);
    }
  }

  for (const [typeName, typeState] of supergraphState.unionTypes) {
    if (typeName === '_Entity') {
      continue;
    }

    graph.addNode(typeName);

    for (const memberType of typeState.members) {
      const referencedTypeName = memberType;

      if (!graph.hasNode(referencedTypeName)) {
        graph.addNode(referencedTypeName);
      }

      graph.addDependency(typeName, referencedTypeName);
    }
  }

  return graph;
}

// Why only one query? To match what Apollo does and cut of the performance cost of checking all possible queries.
function printExampleQuery(
  supergraphState: SupergraphState,
  rootTypeName: 'Query' | 'Mutation' | 'Subscription',
  /**
   * Fields to start with. These fields should belong to a root type that is owned by the subgraph.
   */
  rootTypeFieldsToStartWith: string[],
  leafTypeName: string,
  leafFieldName: string,
  typesInBetweenRootAndLeaf: string[] = [],
): string | null {
  const rootType = supergraphState.objectTypes.get(rootTypeName)!;
  // TODO: prevent infinite loops

  function visitType(
    typeState: ObjectTypeState | UnionTypeState,
    descendants: Array<FieldNode | InlineFragmentNode>,
    visitedTypes: string[],
  ): Array<FieldNode | InlineFragmentNode> | null {
    if (visitedTypes.includes(typeState.name)) {
      // circular reference
      return null;
    }

    if ('members' in typeState) {
      for (const member of typeState.members) {
        const result =
          member === leafTypeName
            ? visitLeafType(
                supergraphState.objectTypes.get(member)!,
                descendants.concat([
                  {
                    kind: Kind.INLINE_FRAGMENT,
                    typeCondition: {
                      kind: Kind.NAMED_TYPE,
                      name: {
                        kind: Kind.NAME,
                        value: member,
                      },
                    },
                    selectionSet: {
                      kind: Kind.SELECTION_SET,
                      selections: [],
                    },
                  },
                ]),
              )
            : visitType(
                supergraphState.objectTypes.get(member)!,
                descendants.concat([
                  {
                    kind: Kind.INLINE_FRAGMENT,
                    typeCondition: {
                      kind: Kind.NAMED_TYPE,
                      name: {
                        kind: Kind.NAME,
                        value: member,
                      },
                    },
                    selectionSet: {
                      kind: Kind.SELECTION_SET,
                      selections: [],
                    },
                  },
                ]),
                visitedTypes.concat(typeState.name),
              );

        if (result) {
          return result;
        }
      }

      return null;
    }

    // Iterate over all fields in reversed order.
    // The output of Apollo uses always the last field, we should match it to make the compatibility checking easier for us.
    for (const [fieldName, fieldState] of Array.from(typeState.fields.entries()).reverse()) {
      // if it's a root type, ignore fields that are not in the list
      if (typeState.name === rootTypeName && !rootTypeFieldsToStartWith.includes(fieldName)) {
        continue;
      }

      const fieldOutputTypeName = stripTypeModifiers(fieldState.type);

      if (fieldOutputTypeName === leafTypeName) {
        return visitLeafType(
          supergraphState.objectTypes.get(fieldOutputTypeName)!,
          descendants.concat([
            {
              kind: Kind.FIELD,
              name: {
                kind: Kind.NAME,
                value: fieldName,
              },
              arguments: Array.from(fieldState.args).map(([argName, argState]) => ({
                kind: Kind.ARGUMENT,
                name: {
                  kind: Kind.NAME,
                  value: argName,
                },
                value: createEmptyValueNode(argState.type, supergraphState),
              })),
            },
          ]),
        );
        // if it's referencing a type in between the root and the leaf, visit it
      } else if (
        typesInBetweenRootAndLeaf.includes(fieldOutputTypeName) &&
        // but only if it wasn't visited yet (to make it possible to scan other types)
        !visitedTypes.includes(fieldOutputTypeName)
      ) {
        const referencedType =
          supergraphState.objectTypes.get(fieldOutputTypeName)! ??
          supergraphState.unionTypes.get(fieldOutputTypeName)!;

        return visitType(
          referencedType,
          descendants.concat([
            {
              kind: Kind.FIELD,
              name: {
                kind: Kind.NAME,
                value: fieldName,
              },
              arguments: Array.from(fieldState.args).map(([argName, argState]) => ({
                kind: Kind.ARGUMENT,
                name: {
                  kind: Kind.NAME,
                  value: argName,
                },
                value: createEmptyValueNode(argState.type, supergraphState),
              })),
            },
          ]),
          visitedTypes.concat(typeState.name),
        );
      }
    }

    return null;
  }

  function visitLeafType(
    objectTypeState: ObjectTypeState,
    descendants: Array<FieldNode | InlineFragmentNode>,
  ) {
    for (const [fieldName, fieldState] of objectTypeState.fields) {
      if (fieldName !== leafFieldName) {
        continue;
      }

      const fieldOutputTypeName = stripTypeModifiers(fieldState.type);
      const isObjectSpreadCapable =
        supergraphState.objectTypes.has(fieldOutputTypeName) ||
        supergraphState.interfaceTypes.has(fieldOutputTypeName) ||
        supergraphState.unionTypes.has(fieldOutputTypeName);

      return descendants.concat([
        {
          kind: Kind.FIELD,
          name: {
            kind: Kind.NAME,
            value: fieldName,
          },
          arguments: Array.from(fieldState.args).map(([argName, argState]) => ({
            kind: Kind.ARGUMENT,
            name: {
              kind: Kind.NAME,
              value: argName,
            },
            value: createEmptyValueNode(argState.type, supergraphState),
          })),
          selectionSet: isObjectSpreadCapable
            ? // Print `{ ... }` at this point
              {
                kind: Kind.SELECTION_SET,
                selections: [
                  {
                    kind: Kind.FRAGMENT_SPREAD,
                    name: {
                      kind: Kind.NAME,
                      value: '',
                    },
                  },
                ],
              }
            : undefined,
        },
      ]);
    }

    return null;
  }

  const tree = visitType(rootType, [], []);

  let currentField: FieldNode | InlineFragmentNode | null = null;

  if (!tree) {
    return null;
  }

  tree.reverse();

  for (const field of tree) {
    if (!currentField) {
      currentField = {
        ...field,
      };
    } else {
      currentField = {
        ...field,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: [currentField],
        },
      };
    }
  }

  const query: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        kind: Kind.OPERATION_DEFINITION,
        operation:
          rootTypeName === 'Query'
            ? OperationTypeNode.QUERY
            : rootTypeName === 'Mutation'
            ? OperationTypeNode.MUTATION
            : OperationTypeNode.SUBSCRIPTION,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: [currentField!],
        },
      },
    ],
  };

  return print(query);
}

function createEmptyValueNode(fullType: string, supergraphState: SupergraphState): ValueNode {
  if (isList(fullType)) {
    return {
      kind: Kind.LIST,
      values: [],
    } as ListValueNode;
  }

  if (isNonNull(fullType)) {
    const innerType = stripNonNull(fullType);

    return createEmptyValueNode(innerType, supergraphState);
  }

  if (supergraphState.enumTypes.has(fullType)) {
    const enumState = supergraphState.enumTypes.get(fullType)!;
    return {
      kind: Kind.ENUM,
      value: Array.from(enumState.values.keys())[0],
    };
  }

  if (supergraphState.scalarTypes.has(fullType)) {
    return {
      kind: Kind.STRING,
      value: 'A string value',
    };
  }

  if (supergraphState.inputObjectTypes.has(fullType)) {
    const inputObjectTypeState = supergraphState.inputObjectTypes.get(fullType)!;

    return {
      kind: Kind.OBJECT,
      fields: Array.from(inputObjectTypeState.fields)
        .filter(([_, fieldState]) => isNonNull(fieldState.type))
        .map(([fieldName, fieldState]) => ({
          kind: Kind.OBJECT_FIELD,
          name: {
            kind: Kind.NAME,
            value: fieldName,
          },
          value: createEmptyValueNode(fieldState.type, supergraphState),
        })),
    };
  }

  const specifiedScalar = specifiedScalarTypes.find(s => s.name === fullType);

  if (!specifiedScalar) {
    throw new Error(`Type "${fullType}" is not defined.`);
  }

  if (specifiedScalar.name === 'String') {
    return {
      kind: Kind.STRING,
      value: 'A string value',
    };
  }

  if (specifiedScalar.name === 'Int' || specifiedScalar.name === 'Float') {
    return {
      kind: Kind.INT,
      value: '0',
    };
  }

  if (specifiedScalar.name === 'Boolean') {
    return {
      kind: Kind.BOOLEAN,
      value: true,
    };
  }

  if (specifiedScalar.name === 'ID') {
    return {
      kind: Kind.STRING,
      value: '<any id>',
    };
  }

  throw new Error(`Type "${fullType}" is not supported.`);
}

// TODO: it should return a list of paths
// TODO: it should return a list of schema coordinates
function resolveFieldsFromFieldSet(
  fields: string,
  typeName: string,
  graphId: string,
  supergraphState: SupergraphState,
): {
  paths: Set<string>;
  coordinates: Set<string>;
} {
  const paths = new Set<string>();
  const coordinates = new Set<string>();
  const selectionSet = parseFields(fields);

  if (!selectionSet) {
    return {
      coordinates,
      paths,
    };
  }

  findFieldPathsFromSelectionSet(
    paths,
    coordinates,
    typeName,
    selectionSet,
    typeName,
    graphId,
    supergraphState,
  );

  return {
    coordinates,
    paths,
  };
}

function findFieldPathsFromSelectionSet(
  fieldPaths: Set<string>,
  coordinates: Set<string>,
  typeName: string | string[],
  selectionSet: SelectionSetNode,
  currentPath: string,
  graphId: string,
  supergraphState: SupergraphState,
): void {
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const innerPath = `${currentPath}.${selection.name.value}`;
      fieldPaths.add(innerPath);

      if (Array.isArray(typeName)) {
        for (const t of typeName) {
          coordinates.add(`${t}.${selection.name.value}`);
        }
      } else {
        coordinates.add(`${typeName}.${selection.name.value}`);
      }

      if (selection.selectionSet) {
        // TODO: resolve field type
        // const outputType = supergraphState.objectTypes.get(typeName as string) ?
        const types = (Array.isArray(typeName) ? typeName : [typeName]).map(tName => {
          const outputType =
            supergraphState.objectTypes.get(tName) ?? supergraphState.interfaceTypes.get(tName);

          if (!outputType) {
            throw new Error(`Type "${tName}" is not defined.`);
          }

          return outputType;
        });

        const typesWithField = types.filter(t => t.fields.has(selection.name.value));

        if (typesWithField.length === 0) {
          throw new Error(
            `Type "${typeName.toString()}" does not have field "${selection.name.value}".`,
          );
        }

        const outputTypes = typesWithField.map(t =>
          stripTypeModifiers(t.fields.get(selection.name.value)!.type),
        );

        findFieldPathsFromSelectionSet(
          fieldPaths,
          coordinates,
          outputTypes,
          selection.selectionSet,
          innerPath,
          graphId,
          supergraphState,
        );
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      if (!selection.typeCondition) {
        throw new Error(`Inline fragment without type condition is not supported.`);
      }

      // TODO: if `User` is the only possible type, we could use `me.id` instead. For now it's fine. We will improve it later if needed.

      // Use `me.(User).id` when `id` is defined in `... on User` inline fragment.
      findFieldPathsFromSelectionSet(
        fieldPaths,
        coordinates,
        selection.typeCondition.name.value,
        selection.selectionSet,
        `${currentPath}.(${selection.typeCondition.name.value})`,
        graphId,
        supergraphState,
      );
    } else {
      throw new Error(`Fragment spread is not supported.`);
    }
  }
}
