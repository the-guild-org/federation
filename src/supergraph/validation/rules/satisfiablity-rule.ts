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
import { InterfaceTypeState } from '../../composition/interface-type.js';
import { ObjectTypeFieldState, ObjectTypeState } from '../../composition/object-type.js';
import { UnionTypeState } from '../../composition/union-type.js';
import type { SupergraphVisitorMap } from '../../composition/visitor.js';
import type { SupergraphState } from '../../state.js';
import type { SupergraphValidationContext } from '../validation-context.js';

// The whole satisfiability rule is a mess and could be reduced to a much simpler piece of code.
// 1. Find a field that does exist only in some graphs and is not external.
// 2. Check if the field can be resolved by resolving an entity (via Query._entities) by only using keys.
// 3. Check if the missing key fields can be added to the internal query (created by the query planner) and fill the gaps by resolving the missing key fields from other graphs that have the field.
// And probably more and more things that will create a mess anyway :D

function isSatisfiableQueryPath(
  supergraphState: SupergraphState,
  queryPath: Array<
    | {
        typeName: string;
        fieldName: string;
      }
    | {
        typeName: string;
      }
  >,
): boolean {
  const root = queryPath[0];
  const leaf = queryPath[queryPath.length - 1];

  // split query path into parts
  // 1. from root to leaf
  // 2. from root to shareable/entity field -> from shareable/entity field to leaf

  if ('fieldName' in root) {
    const rootType = supergraphState.objectTypes.get(root.typeName);
    if (!rootType) {
      throw new Error(`Type "${root.typeName}" not found in Supergraph state`);
    }
    const rootField = rootType.fields.get(root.fieldName);

    if (!rootField) {
      throw new Error(`Field "${root.typeName}.${root.fieldName}" not found in Supergraph state`);
    }

    const graphsWithRootField = Array.from(rootField.byGraph)
      .filter(([_, f]) => f.external === false)
      .map(([g, _]) => g);

    if (!('fieldName' in leaf)) {
      throw new Error('Leaf field is missing in the query path');
    }

    const leafType = supergraphState.objectTypes.get(leaf.typeName);

    if (!leafType) {
      throw new Error(`Type "${leaf.typeName}" not found in Supergraph state`);
    }

    const leafField = leafType.fields.get(leaf.fieldName);

    if (!leafField) {
      throw new Error(`Field "${leaf.typeName}.${leaf.fieldName}" not found in Supergraph state`);
    }

    if (
      graphsWithRootField.some(graphWithRootField =>
        canTraverseToField(leafField.name, supergraphState, leafType, graphWithRootField),
      )
    ) {
      // can resolve
      return true;
    }

    // root-to-leaf path is not satisfiable
    // let's try to go from root and advance to the leaf
    // by resolving every step of the path, one by one.

    function canAdvance(stepIndex: number, fromGraphId: string): boolean {
      const step = queryPath[stepIndex];

      if (!('fieldName' in step)) {
        return canAdvance(stepIndex + 1, fromGraphId);
      }

      const typeState = supergraphState.objectTypes.get(step.typeName);

      if (!typeState) {
        throw new Error(`Type "${step.typeName}" not found in Supergraph state`);
      }

      const fieldState = typeState.fields.get(step.fieldName);

      if (!fieldState) {
        throw new Error(`Field "${step.typeName}.${step.fieldName}" not found in Supergraph state`);
      }

      const accessibleTargetGraphs = new Set<string>();
      if (
        !canTraverseToField(
          fieldState.name,
          supergraphState,
          typeState,
          fromGraphId,
          accessibleTargetGraphs,
        )
      ) {
        return false;
      }

      if (step === leaf) {
        return true;
      }

      return Array.from(accessibleTargetGraphs).some(graphId => canAdvance(stepIndex + 1, graphId));
    }

    const canResolveStepByStep = graphsWithRootField.some(graphId => {
      return canAdvance(0, graphId);
    });

    if (canResolveStepByStep) {
      return true;
    }
  } else {
    throw new Error('Root field is missing in the query path');
  }

  // cannot resolve
  return false;
}

function canTraverseToField(
  fieldName: string,
  supergraphState: SupergraphState,
  entityState: ObjectTypeState,
  sourceGraphId: string,
  accessibleTargetGraphs: Set<string> = new Set(),
  visitedGraphs: Set<string> = new Set(),
  collectedFieldPaths: Set<string> = new Set(),
) {
  const objectTypeStateInSourceGraph = entityState.byGraph.get(sourceGraphId);
  const sourceGraphKeys = objectTypeStateInSourceGraph?.keys || [];

  const fieldState = entityState.fields.get(fieldName);

  if (!fieldState) {
    throw new Error(`Field "${entityState.name}.${fieldName}" not found in Supergraph state`);
  }

  const fieldStateInSourceGraph = fieldState.byGraph.get(sourceGraphId);

  if (fieldStateInSourceGraph && fieldStateInSourceGraph.external === false) {
    accessibleTargetGraphs.add(sourceGraphId);
    return true;
  }

  for (const targetGraphId of entityState.byGraph.keys()) {
    if (targetGraphId === sourceGraphId) {
      continue;
    }

    if (visitedGraphs.has(targetGraphId)) {
      continue;
    }

    const fieldState = entityState.fields.get(fieldName);

    if (!fieldState) {
      throw new Error(`Field "${entityState.name}.${fieldName}" not found in Supergraph state`);
    }

    const objectTypeStateInTargetGraph = entityState.byGraph.get(targetGraphId);
    const targetGraphKeys = objectTypeStateInTargetGraph?.keys || [];

    // no keys in both graphs? can't move.
    if (sourceGraphKeys.length === 0 && targetGraphKeys.length === 0) {
      continue;
    }

    for (const targetKey of targetGraphKeys) {
      if (!targetKey.resolvable) {
        continue;
      }

      const targetKeyFields = resolveFieldsFromFieldSet(
        targetKey.fields,
        entityState.name,
        targetGraphId,
        supergraphState,
      );

      let resolvableFieldPaths = new Set<string>();

      for (const [requiredFieldPath, { typeName, fieldName }] of targetKeyFields.pairs) {
        if (collectedFieldPaths.has(requiredFieldPath)) {
          resolvableFieldPaths.add(requiredFieldPath);
          continue;
        }

        const objectType = supergraphState.objectTypes.get(typeName);
        if (!objectType) {
          throw new Error(`Type "${typeName}" not found in Supergraph state`);
        }

        const field = objectType.fields.get(fieldName);
        if (!field) {
          throw new Error(`Field "${typeName}.${fieldName}" not found in Supergraph state`);
        }

        const fieldInGraph = field.byGraph.get(sourceGraphId);

        if (!fieldInGraph) {
          break;
        }

        const fieldInGraphIsExternal = fieldInGraph.external === true;
        // it looks like the field is resolved by a parent field
        // When a field is resolved by a parent field, even if it's marked as external, it's actually resolved by the parent.
        const fieldIsDirectlyAccessed =
          requiredFieldPath.indexOf('.') === requiredFieldPath.lastIndexOf('.');

        if (fieldInGraphIsExternal && fieldIsDirectlyAccessed) {
          break;
        }

        resolvableFieldPaths.add(requiredFieldPath);
      }

      if (resolvableFieldPaths.size !== targetKeyFields.paths.size) {
        continue;
      }

      // looks like we can traverse to the graph

      if (fieldState.byGraph.has(targetGraphId)) {
        accessibleTargetGraphs.add(targetGraphId);
        return true;
      }

      const canResolve = canTraverseToField(
        fieldName,
        supergraphState,
        entityState,
        targetGraphId,
        accessibleTargetGraphs,
        new Set([...visitedGraphs, targetGraphId]),
        new Set([...collectedFieldPaths, ...resolvableFieldPaths]),
      );

      if (canResolve) {
        accessibleTargetGraphs.add(targetGraphId);
        return true;
      }
    }
  }

  return false;
}

function canGraphMoveToGraphByEntity(
  supergraphState: SupergraphState,
  entityName: string,
  sourceGraphId: string,
  targetGraphId: string,
): boolean {
  const objectTypeState = supergraphState.objectTypes.get(entityName);

  if (!objectTypeState) {
    throw new Error(`Type "${entityName}" not found in supergraph state`);
  }

  const objectTypeStateInSourceGraph = objectTypeState.byGraph.get(sourceGraphId);
  const objectTypeStateInTargetGraph = objectTypeState.byGraph.get(targetGraphId);

  const sourceGraphKeys = objectTypeStateInSourceGraph?.keys || [];
  const targetGraphKeys = objectTypeStateInTargetGraph?.keys || [];

  // no keys in both graphs? can't move.
  if (sourceGraphKeys.length === 0 && targetGraphKeys.length === 0) {
    return false;
  }

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

    const hasNonKeyFields = Array.from(objectTypeState.fields).some(([_, fState]) => {
      const f = fState.byGraph.get(sourceGraphId);

      if (f && f.usedAsKey === false) {
        return true;
      }

      return false;
    });

    // if all fields of the source key are external, and not required or provided, the graph cannot move to another graph
    if (
      Array.from(sourceKeyFields.coordinates).every(fieldPath => {
        const [typeName, fieldName] = fieldPath.split('.');
        const objectTypeState = supergraphState.objectTypes.get(typeName);

        if (!objectTypeState) {
          throw new Error(`Type "${typeName}" not found`);
        }

        const fieldState = objectTypeState.fields.get(fieldName);
        if (!fieldState) {
          throw new Error(`Field "${fieldPath}" not found in object type "${typeName}"`);
        }

        const fieldStateByGraph = fieldState.byGraph.get(sourceGraphId);
        if (!fieldStateByGraph) {
          throw new Error(
            `Field "${fieldPath}" not found in object type "${typeName}" in graph "${sourceGraphId}"`,
          );
        }

        return (
          !hasNonKeyFields &&
          objectTypeState.byGraph.get(sourceGraphId)!.extension !== true &&
          fieldStateByGraph.external === true &&
          fieldStateByGraph.usedAsKey
        );
      })
    ) {
      return false;
    }

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

function createMemoizedQueryPathFinder() {
  const memoizedQueryPaths = new Map<
    string,
    Array<
      Array<
        | {
            fieldName: string;
            typeName: string;
          }
        | {
            typeName: string;
          }
      >
    >
  >();

  return function findQueryPathsMemoized(
    supergraphState: SupergraphState,
    rootTypeName: 'Query' | 'Mutation' | 'Subscription',
    /**
     * Fields to start with. These fields should belong to a root type that is owned by the subgraph.
     */
    rootTypeFieldsToStartWith: string[],
    leafTypeName: string,
    leafFieldName: string,
    typesInBetweenRootAndLeaf: string[] = [],
  ) {
    const rootType = supergraphState.objectTypes.get(rootTypeName)!;
    const paths: Array<
      Array<
        | { typeName: string; fieldName: string }
        | {
            typeName: string;
          }
      >
    > = [];

    for (const rootFieldName of rootTypeFieldsToStartWith) {
      const key = JSON.stringify({
        rootFieldName,
        rootTypeName,
        leafTypeName,
        leafFieldName,
        typesInBetweenRootAndLeaf, // it's always equal, but let's make it more safe
      });

      const memoized = memoizedQueryPaths.get(key);
      if (memoized) {
        return memoized;
      }

      const rootFieldState = rootType.fields.get(rootFieldName);
      if (rootFieldState) {
        const fieldOutputTypeName = stripTypeModifiers(rootFieldState.type);

        const referencedType =
          supergraphState.objectTypes.get(fieldOutputTypeName) ??
          supergraphState.unionTypes.get(fieldOutputTypeName) ??
          supergraphState.interfaceTypes.get(fieldOutputTypeName);

        if (!referencedType) {
          // console.warn('Only object types and union types are supported:', fieldOutputTypeName);
          continue;
        }

        findQueryPathInType(
          new Set(),
          supergraphState,
          referencedType,
          leafTypeName,
          leafFieldName,
          path => {
            const memoized = memoizedQueryPaths.get(key);

            if (memoized) {
              memoized.push(path);
            } else {
              memoizedQueryPaths.set(key, [path]);
            }
            paths.push(path);
          },
          typesInBetweenRootAndLeaf,
          [
            {
              typeName: rootTypeName,
              fieldName: rootFieldName,
            },
          ],
        );
      }
    }

    return paths;
  };
}

export function SatisfiabilityRule(
  context: SupergraphValidationContext,
  supergraphState: SupergraphState,
): SupergraphVisitorMap {
  const typeDependencies = buildOutputTypesDependencies(supergraphState);
  let movabilityGraph = new Map<string, DepGraph<string>>();

  function getMovabilityGraphForType(typeName: string) {
    const existingMovabilityGraph = movabilityGraph.get(typeName);

    if (existingMovabilityGraph) {
      return existingMovabilityGraph;
    }

    const objectState = supergraphState.objectTypes.get(typeName);

    if (!objectState) {
      throw new Error(`State of object type "${typeName}" not found in Supergraph state`);
    }

    const graph = new DepGraph<string>({
      circular: true,
    });

    const graphIds = Array.from(objectState.byGraph.keys());

    for (const sourceGraphId of objectState.byGraph.keys()) {
      graph.addNode(sourceGraphId);
    }

    for (const sourceGraphId of objectState.byGraph.keys()) {
      const otherGraphIds = graphIds.filter(g => g !== sourceGraphId);

      for (const destGraphId of otherGraphIds) {
        if (
          canGraphMoveToGraphByEntity(supergraphState, objectState.name, sourceGraphId, destGraphId)
        ) {
          graph.addDependency(sourceGraphId, destGraphId);
        }
      }
    }

    movabilityGraph.set(typeName, graph);

    return graph;
  }

  return {
    ObjectTypeField(objectState, fieldState) {
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

      // TODO: this is incorrect as @shareable does't mean it can be resolved here and there, it only means that the field has the same semantics in all subgraphs
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

      const currentObjectTypeMovabilityGraph = getMovabilityGraphForType(objectState.name);

      if (!currentObjectTypeMovabilityGraph) {
        throw new Error(
          `Movability graph for object type "${objectState.name}" not found in Supergraph state`,
        );
      }

      const findQueryPaths = createMemoizedQueryPathFinder();

      if (uniqueKeyFieldsSet.size > 0) {
        //
        // We're dealing with entities
        //

        // We should do it the other way around.
        // 1. Find a field that does not exist in all graphs or is not shareable in all graphs or is external etc.
        // 2. Create a list of graphs that needs to resolve that field from the original graph.
        // 3. See if they key provided by those graphs can fullfil the key of the original graph.

        for (const graphId of objectState.byGraph.keys()) {
          const fieldStateInGraph = fieldState.byGraph.get(graphId);

          // we need to run it for each root type
          if (
            canGraphResolveField(
              objectState,
              fieldState,
              graphId,
              supergraphState,
              currentObjectTypeMovabilityGraph,
            )
          ) {
            continue;
          }

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
          const leafs = graphsWithField
            .map(g => findLeafs(currentObjectTypeMovabilityGraph, graphId, g))
            .flat(1);

          // If there are no leafs, it means that the field is resolvable by jumping between graphs.
          // It's only true if the graph can jump to at least one graph.
          if (
            leafs.length === 0 &&
            currentObjectTypeMovabilityGraph.directDependenciesOf(graphId).length > 0
          ) {
            continue;
          }

          for (const [normalizedName, rootType] of rootTypes) {
            const paths = findQueryPaths(
              supergraphState,
              normalizedName,
              Array.from(rootType.fields.keys()),
              objectState.name,
              fieldState.name,
              dependenciesOfObjectType,
            );

            // to validate a query path, we need to
            // check if the query path can be extended with some set of fields,
            // to query a missing field using Query._entities of a subgraph that has the field
            // It's obviously not ideal, as we would like to check if the query path can be resolved at every step
            // leading to the possible extension of selection set.
            // For now, it's good enough, we're still experimenting here anyway... We will add it soon.

            const nonResolvablePaths = paths.filter(
              queryPath => !isSatisfiableQueryPath(supergraphState, queryPath),
            );

            if (nonResolvablePaths.length === 0) {
              continue;
            }

            let shortestPath = nonResolvablePaths[0];
            for (let i = 0; i < nonResolvablePaths.length; i++) {
              const curr = nonResolvablePaths[i];

              if (shortestPath.length > curr.length) {
                shortestPath = curr;
              }

              if (shortestPath.length === curr.length) {
                shortestPath = curr;
              }
            }

            const query = printQueryPath(supergraphState, shortestPath);
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
                    .filter(
                      g =>
                        !currentObjectTypeMovabilityGraph.directDependenciesOf(graphId).includes(g),
                    )
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

          // TODO: this is incorrect as @shareable does't mean it can be resolved here and there, it only means that the field has the same semantics in all subgraphs
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

          // Check if we can move to a graph that has the field via entity type

          // find entity types referencing the object type
          const entityTypesReferencingLookingObject = dependenciesOfObjectType
            .map(typeName => supergraphState.objectTypes.get(typeName))
            .filter(
              (t): t is ObjectTypeState =>
                // entity type is an object type with @key
                !!t && Array.from(t.byGraph.values()).some(tg => tg.keys.length > 0),
            );

          const graphIdsUnableToResolveFieldViaEntityType: string[] = [];
          for (const [graphId] of graphsWithoutField) {
            // a list of entity types defined in the currently checked graph
            const localEntityTypes = entityTypesReferencingLookingObject.filter(et =>
              et.byGraph.has(graphId),
            );
            const isFieldResolvableThroughEntity = localEntityTypes.some(et =>
              // check if a graph without the field
              // can move (via entity type) to at least one graph with the field
              graphsWithField.some(targetGraphId =>
                canGraphMoveToGraphByEntity(supergraphState, et.name, graphId, targetGraphId),
              ),
            );

            if (!isFieldResolvableThroughEntity) {
              graphIdsUnableToResolveFieldViaEntityType.push(graphId);
            }
          }

          if (graphIdsUnableToResolveFieldViaEntityType.length === 0) {
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

            // findQueryPaths(
            //   supergraphState,
            //   normalizedName,
            //   Array.from(rootType.fields.keys()),
            //   objectState.name,
            //   fieldState.name,
            //   dependenciesOfObjectType,
            // );

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
                // gateway won't be able to call the graph and resolve the field,
                // so we should mark the graph as not resolvable and not shared.
                return false;
              }

              const localRootType = localSubgraph.types.get(localRootTypeName) as ObjectType;
              const localRootFields = Array.from(localRootType.fields.keys());

              return rootFieldsReferencingObjectType.every(f => localRootFields.includes(f.name));
            });

            if (areRootFieldsShared) {
              continue;
            }

            const paths = findQueryPaths(
              supergraphState,
              normalizedName,
              Array.from(rootType.fields.keys()),
              objectState.name,
              fieldState.name,
              dependenciesOfObjectType,
            );

            const nonResolvablePaths = paths.filter(
              queryPath => !isSatisfiableQueryPath(supergraphState, queryPath),
            );

            if (nonResolvablePaths.length === 0) {
              continue;
            }

            if (!aggregatedErrorByRootType[normalizedName].query) {
              aggregatedErrorByRootType[normalizedName].query = printExampleQuery(
                supergraphState,
                normalizedName,
                rootTypeFields,
                objectState.name,
                fieldState.name,
                graphId,
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

function printLine(msg: string, indentLevel: number) {
  return '  '.repeat(indentLevel + 1) + msg;
}

function printQueryPath(
  supergraphState: SupergraphState,
  queryPath: Array<
    | { typeName: string; fieldName: string }
    | {
        typeName: string;
      }
  >,
) {
  const lines: string[] = [];

  let endsWithScalar = false;

  for (let i = 0; i < queryPath.length; i++) {
    const point = queryPath[i];

    if ('fieldName' in point) {
      const fieldState = supergraphState.objectTypes
        .get(point.typeName)
        ?.fields.get(point.fieldName);

      if (!fieldState) {
        throw new Error(
          `Field "${point.typeName}.${point.fieldName}" not found in Supergraph state`,
        );
      }

      const args = Array.from(fieldState.args)
        .filter(([_, argState]) => isNonNull(argState.type))
        .map(
          ([name, argState]) =>
            `${name}: ${print(createEmptyValueNode(argState.type, supergraphState))}`,
        )
        .join(', ');
      const argsPrinted = args.length > 0 ? `(${args})` : '';

      if (i == queryPath.length - 1) {
        const outputTypeName = stripTypeModifiers(fieldState.type);
        endsWithScalar =
          supergraphState.scalarTypes.has(outputTypeName) ||
          supergraphState.enumTypes.has(outputTypeName) ||
          specifiedScalarTypes.some(s => s.name === outputTypeName);

        if (endsWithScalar) {
          lines.push(printLine(`${point.fieldName}${argsPrinted}`, i));
        } else {
          lines.push(printLine(`${point.fieldName}${argsPrinted} {`, i));
        }
      } else {
        lines.push(printLine(`${point.fieldName}${argsPrinted} {`, i));
      }
    } else {
      lines.push(printLine(`... on ${point.typeName} {`, i));
    }
  }

  if (!endsWithScalar) {
    lines.push(printLine('...', lines.length));
  }

  const len = lines.length - 1;
  for (let i = 0; i < len; i++) {
    lines.push(printLine('}', len - i - 1));
  }

  if (queryPath[0].typeName === 'Query') {
    lines.unshift('{');
  } else if (queryPath[0].typeName === 'Mutation') {
    lines.unshift('mutation {');
  } else {
    lines.unshift('subscription {');
  }
  lines.push('}');

  return lines.join('\n');
}

function findQueryPathInType(
  visitedTypes: Set<string>,
  supergraphState: SupergraphState,
  typeState: ObjectTypeState | InterfaceTypeState | UnionTypeState,
  leafTypeName: string,
  leafFieldName: string,
  onQueryPathFound: (
    path: Array<
      | { typeName: string; fieldName: string }
      | {
          typeName: string;
        }
    >,
  ) => void,
  typesInBetweenRootAndLeaf: string[] = [],
  currentPath: Array<
    | { typeName: string; fieldName: string }
    | {
        typeName: string;
      }
  > = [],
) {
  if (typeState.name !== leafTypeName) {
    if (!typesInBetweenRootAndLeaf.includes(typeState.name)) {
      return;
    }

    if (visitedTypes.has(typeState.name)) {
      return;
    }

    visitedTypes.add(typeState.name);
  }

  if ('fields' in typeState) {
    for (const [fieldName, fieldState] of typeState.fields) {
      if (fieldName === leafFieldName && typeState.name === leafTypeName) {
        onQueryPathFound(currentPath.concat([{ typeName: typeState.name, fieldName }]));
        return;
      }

      const fieldOutputTypeName = stripTypeModifiers(fieldState.type);
      const referencedType =
        supergraphState.objectTypes.get(fieldOutputTypeName) ??
        supergraphState.unionTypes.get(fieldOutputTypeName) ??
        supergraphState.interfaceTypes.get(fieldOutputTypeName);

      if (!referencedType) {
        // console.warn('Only object types and union types are supported:', fieldOutputTypeName);
        continue;
      }

      if (referencedType.name === typeState.name) {
        // circular reference
        return;
      }

      findQueryPathInType(
        visitedTypes,
        supergraphState,
        referencedType,
        leafTypeName,
        leafFieldName,
        onQueryPathFound,
        typesInBetweenRootAndLeaf,
        currentPath.concat([{ typeName: typeState.name, fieldName }]),
      );
    }
  } else {
    for (const member of typeState.members) {
      const referencedType =
        supergraphState.objectTypes.get(member) ??
        supergraphState.unionTypes.get(member) ??
        supergraphState.interfaceTypes.get(member);

      if (!referencedType) {
        // console.warn('Only object types and union types are supported:', member);
        continue;
      }

      if (referencedType.name === typeState.name) {
        // circular reference
        return;
      }

      findQueryPathInType(
        visitedTypes,
        supergraphState,
        referencedType,
        leafTypeName,
        leafFieldName,
        onQueryPathFound,
        typesInBetweenRootAndLeaf,
        currentPath.concat([{ typeName: member }]),
      );
    }
  }
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
  graphId: string,
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
  pairs: Array<
    [
      string,
      {
        typeName: string;
        fieldName: string;
      },
    ]
  >;
} {
  const paths = new Set<string>();
  const coordinates = new Set<string>();
  const selectionSet = parseFields(fields);

  if (!selectionSet) {
    return {
      coordinates,
      paths,
      pairs: [],
    };
  }

  const pairs: Array<
    [
      string,
      {
        typeName: string;
        fieldName: string;
      },
    ]
  > = [];

  findFieldPathsFromSelectionSet(
    paths,
    coordinates,
    pairs,
    typeName,
    selectionSet,
    typeName,
    graphId,
    supergraphState,
  );

  return {
    coordinates,
    paths,
    pairs,
  };
}

function findFieldPathsFromSelectionSet(
  fieldPaths: Set<string>,
  coordinates: Set<string>,
  pairs: Array<
    [
      string,
      {
        typeName: string;
        fieldName: string;
      },
    ]
  >,
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
          pairs.push([innerPath, { typeName: t, fieldName: selection.name.value }]);
          coordinates.add(`${t}.${selection.name.value}`);
        }
      } else {
        pairs.push([innerPath, { typeName, fieldName: selection.name.value }]);
        coordinates.add(`${typeName}.${selection.name.value}`);
      }

      if (selection.selectionSet) {
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
          pairs,
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
        pairs,
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
