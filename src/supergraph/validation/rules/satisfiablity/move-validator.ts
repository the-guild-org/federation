import type { Logger } from '../../../../utils/logger';
import { Edge, isEntityEdge, isFieldEdge } from './edge';
import { SatisfiabilityError } from './errors';
import type { Field } from './fields';
import { PathFinder } from './finder';
import type { Graph } from './graph';
import { OperationPath } from './operation-path';

type MoveRequirement = {
  id: string;
  field: Field;
  paths: OperationPath[];
};

type EdgeResolvabilityResult =
  | {
      success: true;
      errors: undefined;
    }
  | {
      success: false;
      errors: SatisfiabilityError[];
    };

export class MoveValidator {
  private cache: Map<string, EdgeResolvabilityResult> = new Map();
  private logger: Logger;
  private pathFinder: PathFinder;

  constructor(
    logger: Logger,
    private supergraph: Graph,
  ) {
    this.logger = logger.create('MoveValidator');
    this.pathFinder = new PathFinder(logger, supergraph, this);
  }

  private canResolveFields(
    fields: Field[],
    path: OperationPath,
    visitedEdges: Edge[],
  ): EdgeResolvabilityResult {
    // TODO: adjust cache key to have required fields instead of edge.move
    const cacheKey =
      JSON.stringify(fields) +
      ' | ' +
      ' | ' +
      visitedEdges
        .map(e => e.toString())
        .sort()
        .join(',');
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const requirements: MoveRequirement[] = [];

    for (const field of fields) {
      requirements.push({
        id: field.typeName + '.' + field.fieldName,
        field,
        paths: [path.clone()],
      });
    }

    // it should look for complex paths lazily
    // Look for direct paths
    while (requirements.length > 0) {
      // it's important to pop from the end as we want to process the last added requirement first
      const requirement = requirements.pop();

      if (!requirement) {
        break;
      }

      const result = this.validateRequirement(requirement, visitedEdges);

      if (result.success === false) {
        this.cache.set(cacheKey, result);
        return result;
      }

      for (const innerRequirement of result.requirements) {
        // at this point we should have a list of ignored tails
        requirements.push(innerRequirement);
      }
    }

    this.cache.set(cacheKey, {
      success: true,
      errors: undefined,
    });

    return {
      success: true,
      errors: undefined,
    };
  }

  private validateRequirement(
    requirement: MoveRequirement,
    visitedEdges: Edge[],
  ):
    | {
        success: true;
        requirements: MoveRequirement[];
      }
    | {
        success: false;
        errors: SatisfiabilityError[];
      } {
    const nextPaths: OperationPath[] = [];
    const errors: SatisfiabilityError[] = [];

    for (const path of requirement.paths) {
      const directPathsResult = this.pathFinder.findDirectPaths(
        path,
        requirement.field.typeName,
        requirement.field.fieldName,
        visitedEdges,
      );
      if (directPathsResult.success) {
        nextPaths.push(...directPathsResult.paths);
      } else {
        errors.push(...directPathsResult.errors);
      }
    }

    // we could add these as lazy
    if (nextPaths.length === 0) {
      // try complex paths
      for (const path of requirement.paths) {
        const indirectPathsResult = this.pathFinder.findIndirectPaths(
          path,
          requirement.field.typeName,
          requirement.field.fieldName,
          visitedEdges,
        );

        if (indirectPathsResult.success) {
          nextPaths.push(...indirectPathsResult.paths);
        } else {
          errors.push(...indirectPathsResult.errors);
        }
      }
    }

    if (nextPaths.length === 0) {
      // cannot advance
      return {
        success: false,
        errors: errors.filter(e =>
          e.isMatchingField(requirement.field.typeName, requirement.field.fieldName),
        ),
      };
    }

    if (!requirement.field.selectionSet || requirement.field.selectionSet.length === 0) {
      // we reached the end of the path
      return {
        success: true,
        requirements: [],
      };
    }

    return {
      success: true,
      requirements: requirement.field.selectionSet.map(field => ({
        id: requirement.id + '.' + field.typeName + '.' + field.fieldName,
        field,
        paths: nextPaths.slice(),
      })),
    };
  }

  isExternal(edge: Edge) {
    if (!isFieldEdge(edge)) {
      return false;
    }

    if (edge.move.provided) {
      return false;
    }

    if (!edge.head.typeState) {
      return false;
    }

    if (!edge.head.typeState || edge.head.typeState.kind !== 'object') {
      return false;
    }

    const fieldState = edge.head.typeState.fields.get(edge.move.fieldName);

    if (!fieldState) {
      return false;
    }

    const objectTypeStateInGraph = edge.head.typeState.byGraph.get(edge.head.graphId);

    if (!objectTypeStateInGraph) {
      return false;
    }

    const fieldStateInGraph = fieldState.byGraph.get(edge.head.graphId);

    if (!fieldStateInGraph) {
      return false;
    }

    const external = fieldState.byGraph.get(edge.head.graphId)?.external ?? false;

    if (!external) {
      return false;
    }

    const isFedV1 = fieldStateInGraph.version === 'v1.0';
    if (isFedV1 && objectTypeStateInGraph.extension) {
      return false;
    }

    if (!fieldStateInGraph.usedAsKey) {
      return true;
    }

    // ignore if other fields in graph are external
    let hasNonExternalFields = false;
    for (const [fieldName, fieldState] of edge.head.typeState.fields) {
      if (fieldName === edge.move.fieldName) {
        continue;
      }

      const fieldStateInGraph = fieldState.byGraph.get(edge.head.graphId);

      if (!fieldStateInGraph) {
        continue;
      }

      if (!fieldStateInGraph.external) {
        hasNonExternalFields = true;
        break;
      }
    }

    if (hasNonExternalFields) {
      return false;
    }

    if (objectTypeStateInGraph.extension) {
      return false;
    }

    return true;
  }

  private isOverridden(edge: Edge) {
    if (!isFieldEdge(edge)) {
      return false;
    }

    if (!edge.head.typeState) {
      return false;
    }

    if (!edge.head.typeState || edge.head.typeState.kind !== 'object') {
      return false;
    }

    const fieldState = edge.head.typeState.fields.get(edge.move.fieldName);

    if (!fieldState) {
      return false;
    }

    if (!fieldState.override) {
      return false;
    }

    const overriddenGraphId = this.supergraph.graphNameToId(fieldState.override);

    if (!overriddenGraphId) {
      return false;
    }

    return edge.head.graphId === overriddenGraphId;
  }

  isEdgeResolvable(
    edge: Edge,
    path: OperationPath,
    visitedEdges: Edge[],
  ):
    | {
        success: true;
        error: undefined;
      }
    | {
        success: false;
        error: SatisfiabilityError;
      } {
    if (edge.isChecked()) {
      const result = edge.isResolvable();

      this.logger.log(() =>
        result.success
          ? `Can move to ${edge}`
          : `Cannot move to ${edge} (already visited: ${result.error.kind})`,
      );

      return edge.isResolvable();
    }

    if (isFieldEdge(edge)) {
      if (this.isOverridden(edge)) {
        this.logger.log(() => 'Cannot move to ' + edge + ' because it is overridden');
        return edge.setResolvable(false, SatisfiabilityError.ignored(edge));
      }

      if (edge.move.requires) {
        this.logger.log(() => 'Detected @requires');
        if (
          this.canResolveFields(edge.move.requires.fields, path, visitedEdges.concat(edge)).success
        ) {
          this.logger.log(() => 'Can move to ' + edge);
          return edge.setResolvable(true);
        }

        this.logger.log(() => 'Cannot move to ' + edge + ' because @require is not resolvable');

        return {
          success: false,
          error: SatisfiabilityError.forRequire(
            edge.head.graphName,
            edge.move.typeName,
            edge.move.fieldName,
          ),
        };
      } else if (this.isExternal(edge)) {
        this.logger.log(() => 'Cannot move to ' + edge + ' because it is external and cross-graph');
        return edge.setResolvable(
          false,
          SatisfiabilityError.forExternal(
            edge.head.graphName,
            edge.move.typeName,
            edge.move.fieldName,
          ),
        );
      }
    } else if (isEntityEdge(edge)) {
      this.logger.log(() => 'Detected @key');
      if (
        this.canResolveFields(edge.move.keyFields.fields, path, visitedEdges.concat(edge)).success
      ) {
        this.logger.log(() => 'Can move to ' + edge);
        return edge.setResolvable(true);
      }

      this.logger.log(() => 'Cannot move to ' + edge + ' because key fields are not resolvable');

      return edge.setResolvable(
        false,
        SatisfiabilityError.forKey(
          edge.head.graphName,
          edge.tail.graphName,
          edge.head.typeName,
          edge.move.keyFields.toString(),
        ),
      );
    }

    return edge.setResolvable(true);
  }

  // private complexPaths(
  //   path: OperationPath,
  //   requiredField: Field,
  //   visitedGraphs: string[],
  //   visitedEdges: Edge[],
  // ):
  //   | {
  //       success: true;
  //       paths: OperationPath[];
  //       errors: undefined;
  //     }
  //   | {
  //       success: false;
  //       paths: undefined;
  //       errors: ResolvabilityError[];
  //     } {
  //   const typeName = requiredField.typeName;
  //   const fieldName = requiredField.fieldName;
  //   this.logger.group(
  //     () => 'Finding complex paths to ' + typeName + '.' + fieldName + ' from ' + path,
  //   );

  //   const nextPaths: OperationPath[] = [];
  //   const pathsToCheck: OperationPath[] = [path];
  //   const errors: ResolvabilityError[] = [];
  //   let o = 0;

  //   while (pathsToCheck.length > 0) {
  //     o++;
  //     const pathToCheck = pathsToCheck.pop();

  //     if (!pathToCheck) {
  //       continue;
  //     }

  //     if (!isShortestPathToTail(pathToCheck, pathsToCheck)) {
  //       this.logger.log(() => 'Path ignored. There are other shorter paths to the same tail');
  //       continue;
  //     }

  //     const tail = pathToCheck.tail() ?? pathToCheck.rootNode();

  //     if (!this.supergraph.canReachTypeFromType(tail.typeName, typeName)) {
  //       this.logger.log(() => 'Ignored tail. Cannot reach ' + typeName + ' from ' + tail.typeName);
  //       continue;
  //     }

  //     const edges = this.supergraph
  //       .edgesOfHead(tail)
  //       .slice()
  //       .sort((a, b) => {
  //         let aScore: number;
  //         let bScore: number;

  //         if (a.move instanceof EntityMove && b.move instanceof EntityMove) {
  //           aScore = scoreKeyFields(a.move.keyFields.toString());
  //           bScore = scoreKeyFields(b.move.keyFields.toString());
  //         } else {
  //           aScore = a.move instanceof EntityMove ? 2 : a.move instanceof FieldMove ? 1 : 3;
  //           bScore = b.move instanceof EntityMove ? 2 : b.move instanceof FieldMove ? 1 : 3;
  //         }

  //         if (aScore > bScore) {
  //           return 1;
  //         }

  //         if (aScore < bScore) {
  //           return -1;
  //         }

  //         return 0;
  //       });

  //     if (!edges) {
  //       continue;
  //     }

  //     let i = 0;
  //     let accessibleTails: Node[] = [];
  //     for (const edge of edges) {
  //       this.logger.group(
  //         () => 'Checking edge #' + i++ + ': ' + edge.toString() + ' from ' + pathToCheck,
  //       );

  //       // TODO: at this point we could save up some work and register tails that we were able to advance to
  //       //       so we don't have to check all edges that lead to the same tail again
  //       //  With proper sorting, we could also avoid even more work.

  //       if (accessibleTails.includes(edge.tail)) {
  //         this.logger.groupEnd(() => 'Already accessible tail, some other edge leads to it');
  //         continue;
  //       }

  //       if (visitedEdges.includes(edge)) {
  //         this.logger.groupEnd(() => 'Excluded edge. Already visited.');
  //         continue;
  //       }

  //       if (edge.isCrossGraphEdge() && visitedGraphs.includes(edge.tail.graphId)) {
  //         this.logger.groupEnd(() => 'Excluded graph: ' + edge.tail.graphId);
  //         continue;
  //       }

  //       if (edge.isCrossGraphEdge() && edge.tail.graphId === path.tail()?.graphId) {
  //         this.logger.groupEnd(() => 'Ignored edge. We would go back to the same graph');
  //         continue;
  //       }

  //       if (
  //         edge.head.typeName !== typeName &&
  //         !this.supergraph.canReachTypeFromType(edge.tail.typeName, typeName)
  //       ) {
  //         this.logger.groupEnd(
  //           () => `Ignored edge. Cannot reach ${typeName} from ${edge.head.typeName}`,
  //         );
  //         continue;
  //       }

  //       // if the edge points to a leaf node, we should check if it's the field we are looking for
  //       if (edge.tail.isLeaf) {
  //         if (!(edge.move instanceof FieldMove)) {
  //           throw new Error(
  //             `Detected a leaf node and expected move to be FieldMove, but received ${edge.move}`,
  //           );
  //         }

  //         if (edge.move.typeName !== typeName) {
  //           this.logger.groupEnd(() => 'Ignored edge. Not the type we are looking for');
  //           continue;
  //         }

  //         if (edge.move.fieldName !== fieldName) {
  //           this.logger.groupEnd(() => 'Ignored edge. Not the field we are looking for');
  //           continue;
  //         }
  //       }

  //       const newVisitedGraphs =
  //         edge.isCrossGraphEdge() && !visitedGraphs.includes(edge.tail.graphId)
  //           ? visitedGraphs.concat(edge.tail.graphId)
  //           : visitedGraphs;
  //       const newVisitedEdges = !visitedEdges.includes(edge)
  //         ? visitedEdges.concat(edge)
  //         : visitedEdges;

  //       if (edge.move instanceof FieldMove) {
  //         const isTarget = edge.head.typeName === typeName && edge.move.fieldName === fieldName;
  //         const resolvable = this.isEdgeResolvable(
  //           edge,
  //           pathToCheck,
  //           newVisitedGraphs,
  //           newVisitedEdges,
  //         );

  //         if (!resolvable.success) {
  //           errors.push(resolvable.error);
  //           this.logger.groupEnd(() => 'Not resolvable: ' + resolvable.error);
  //           continue;
  //         }

  //         const newPath = pathToCheck.clone().move(edge);

  //         if (!newPath.isPossible()) {
  //           this.logger.groupEnd(() => 'Circular - not resolvable');
  //           continue;
  //         }

  //         if (isTarget) {
  //           nextPaths.push(newPath);
  //           this.logger.groupEnd(() => 'Resolvable');
  //         } else if (edge.head.typeName !== typeName) {
  //           // Keep looking, if we are not at the target yet and we are not at the same type.
  //           pathsToCheck.push(newPath);
  //           this.logger.groupEnd(() => 'Further checking');
  //         } else {
  //           this.logger.groupEnd(() => 'Ignored edge. Not the field we are looking for');
  //         }
  //       } else if (edge.move instanceof EntityMove) {
  //         const newPath = pathToCheck.clone().move(edge);

  //         if (!newPath.isPossible()) {
  //           this.logger.groupEnd(() => 'Circular');
  //           continue;
  //         }

  //         if (edge.isCrossGraphEdge()) {
  //           const resolvable = this.isEdgeResolvable(
  //             edge,
  //             pathToCheck,
  //             newVisitedGraphs,
  //             newVisitedEdges,
  //           );

  //           if (!resolvable.success) {
  //             errors.push(resolvable.error);
  //             this.logger.groupEnd(() => 'Not resolvable: ' + resolvable.error);
  //             continue;
  //           }
  //         }

  //         accessibleTails.push(edge.tail);
  //         pathsToCheck.push(newPath);
  //         this.logger.groupEnd(() => 'Further checking (key move)');
  //       } else if (edge.move instanceof AbstractMove) {
  //         const newPath = pathToCheck.clone().move(edge);

  //         if (!newPath.isPossible()) {
  //           this.logger.groupEnd(() => 'Circular');
  //           continue;
  //         }

  //         pathsToCheck.push(newPath);
  //         this.logger.groupEnd(() => 'Further checking (abstract move)');
  //       } else {
  //         throw new Error(`Unexpected move ${edge.move}`);
  //       }
  //     }
  //   }

  //   if (nextPaths.length === 0) {
  //     this.logger.groupEnd(() => 'No paths found');

  //     return {
  //       success: false,
  //       paths: undefined,
  //       errors: errors.filter(e => e.isMatchingField(typeName, fieldName)),
  //     };
  //   }

  //   this.logger.groupEnd(() => 'Found ' + nextPaths.length + ' complex paths');

  //   return {
  //     success: true,
  //     paths: nextPaths,
  //     errors: undefined,
  //   };
  // }
}
