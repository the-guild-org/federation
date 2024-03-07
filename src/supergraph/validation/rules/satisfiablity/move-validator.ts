import type { Logger } from '../../../../utils/logger';
import { Edge, isEntityEdge, isFieldEdge } from './edge';
import { SatisfiabilityError } from './errors';
import type { Field, Fields } from './fields';
import { concatIfNotExistsFields, concatIfNotExistsString, PathFinder } from './finder';
import type { Graph } from './graph';
import { OperationPath } from './operation-path';

type MoveRequirement = {
  paths: OperationPath[];
} & (
  | {
      field: Field;
    }
  | {
      type: {
        parentTypeName: string;
        childTypeName: string;
        field: Field;
      };
    }
);

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
    this.pathFinder = new PathFinder(this.logger, supergraph, this);
  }

  private canResolveFields(
    fields: Field[],
    path: OperationPath,
    visitedEdges: Edge[],
    visitedGraphs: string[],
    visitedFields: Fields[],
  ): EdgeResolvabilityResult {
    // TODO: adjust cache key to have required fields instead of edge.move
    const cacheKey =
      JSON.stringify(fields) +
      ' | ' +
      visitedGraphs.join(',') +
      visitedFields.join(',') +
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
      requirements.unshift({
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

      const result = this.validateRequirement(
        requirement,
        visitedEdges,
        visitedGraphs,
        visitedFields,
      );

      if (result.success === false) {
        this.cache.set(cacheKey, result);
        return result;
      }

      for (const innerRequirement of result.requirements) {
        // at this point we should have a list of ignored tails
        requirements.unshift(innerRequirement);
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
    visitedGraphs: string[],
    visitedFields: Fields[],
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

    if ('type' in requirement) {
      for (const path of requirement.paths) {
        const directPathsResult = this.pathFinder.findDirectPaths(
          path,
          requirement.type.childTypeName,
          null,
          visitedEdges,
        );
        if (directPathsResult.success) {
          if (this.logger.isEnabled) {
            this.logger.log(() => 'Possible direct paths:');
            for (const path of directPathsResult.paths) {
              this.logger.log(() => ' ' + path.toString());
            }
          }
          nextPaths.push(...directPathsResult.paths);
        } else {
          errors.push(...directPathsResult.errors);
        }
      }

      // // we could add these as lazy
      // try indirect paths
      for (const path of requirement.paths) {
        const indirectPathsResult = this.pathFinder.findIndirectPaths(
          path,
          requirement.type.childTypeName,
          null,
          visitedEdges,
          visitedGraphs,
          visitedFields,
        );

        if (indirectPathsResult.success) {
          if (this.logger.isEnabled) {
            this.logger.log(() => 'Possible indirect paths:');
            for (const path of indirectPathsResult.paths) {
              this.logger.log(() => ' ' + path.toString());
            }
          }
          nextPaths.push(...indirectPathsResult.paths);
        } else {
          errors.push(...indirectPathsResult.errors);
        }
      }

      if (nextPaths.length === 0) {
        if (this.logger.isEnabled) {
          this.logger.log(() => 'Could not resolve from:');
          for (const path of requirement.paths) {
            this.logger.log(() => ' ' + path.toString());
          }
        }

        // cannot advance
        return {
          success: false,
          errors,
        };
      }

      if (!requirement.type.field) {
        // we reached the end of the path
        return {
          success: true,
          requirements: [],
        };
      }

      return {
        success: true,
        requirements: [
          {
            field: requirement.type.field,
            paths: nextPaths.slice(),
          },
        ],
      };
    }

    const possibleTypes =
      /* KAMIL: this was originally equal to [requirement.field.typeName] - kind of */ this.supergraph.possibleTypesOf(
        requirement.field.typeName,
      );

    const needsAbstractMove = !possibleTypes.includes(requirement.field.typeName);

    if (needsAbstractMove) {
      const requirements: MoveRequirement[] = [];
      for (const possibleType of possibleTypes) {
        // we need to move to an abstract type first
        const abstractMoveRequirement: MoveRequirement = {
          type: {
            parentTypeName: requirement.field.typeName,
            childTypeName: possibleType,
            field: {
              ...requirement.field,
              typeName: possibleType,
            },
          },
          paths: requirement.paths,
        };

        requirements.push(abstractMoveRequirement);
      }

      this.logger.log(() => 'Abstract move');

      return {
        success: true,
        requirements,
      };
    }

    for (const path of requirement.paths) {
      const directPathsResult = this.pathFinder.findDirectPaths(
        path,
        requirement.field.typeName,
        requirement.field.fieldName,
        visitedEdges,
      );
      if (directPathsResult.success) {
        if (this.logger.isEnabled) {
          this.logger.log(() => 'Possible direct paths:');
          for (const path of directPathsResult.paths) {
            this.logger.log(() => ' ' + path.toString());
          }
        }
        nextPaths.push(...directPathsResult.paths);
      } else {
        errors.push(...directPathsResult.errors);
      }
    }

    // we could add make it lazy
    for (const path of requirement.paths) {
      const indirectPathsResult = this.pathFinder.findIndirectPaths(
        path,
        requirement.field.typeName,
        requirement.field.fieldName,
        visitedEdges,
        visitedGraphs,
        visitedFields,
      );

      if (indirectPathsResult.success) {
        if (this.logger.isEnabled) {
          this.logger.log(() => 'Possible indirect paths:');
          for (const path of indirectPathsResult.paths) {
            this.logger.log(() => ' ' + path.toString());
          }
        }
        nextPaths.push(...indirectPathsResult.paths);
      } else {
        errors.push(...indirectPathsResult.errors);
      }
    }

    if (nextPaths.length === 0) {
      this.logger.log(
        () =>
          `Failed to resolve field ${requirement.field.typeName}.${requirement.field.fieldName} from:`,
      );
      if (this.logger.isEnabled) {
        for (const path of requirement.paths) {
          this.logger.log(() => ` ` + path);
        }
      }

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
        field,
        paths: nextPaths.slice(),
      })),
    };
  }

  isExternal(edge: Edge): boolean {
    if (!isFieldEdge(edge)) {
      return false;
    }

    if (edge.move.provided) {
      return false;
    }

    if (!edge.head.typeState) {
      return false;
    }

    if (edge.head.typeState.kind !== 'object') {
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
    if (isFedV1 && objectTypeStateInGraph.extension && fieldState.usedAsKey) {
      return false;
    }

    if (!fieldStateInGraph.usedAsKey) {
      return true;
    }

    // ignore if other fields in graph are external
    let hasNonExternalFields = false;
    if (isFedV1) {
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
    visitedGraphs: string[],
    visitedFields: Fields[],
  ):
    | {
        success: true;
        error: undefined;
      }
    | {
        success: false;
        error: SatisfiabilityError;
      } {
    this.logger.group(() => 'Checking resolvability of ' + edge);
    this.logger.log(() => 'Visited graphs: ' + visitedGraphs.join(','));
    const resolvability = edge.getResolvability(
      concatIfNotExistsString(visitedGraphs, edge.tail.graphName),
    );

    if (resolvability) {
      this.logger.groupEnd(() =>
        resolvability.success
          ? `Can move to ${edge}`
          : `Cannot move to ${edge} (already visited: ${resolvability.error.kind})`,
      );

      return resolvability;
    }

    if (isFieldEdge(edge)) {
      if (this.isOverridden(edge)) {
        this.logger.groupEnd(() => 'Cannot move to ' + edge + ' because it is overridden');
        return edge.setResolvable(
          false,
          visitedGraphs,
          SatisfiabilityError.forMissingField(
            edge.tail.graphName,
            edge.move.typeName,
            edge.move.fieldName,
          ),
        );
      }

      if (edge.move.requires) {
        this.logger.log(() => 'Detected @requires');

        const newVisitedGraphs = concatIfNotExistsString(visitedGraphs, edge.tail.graphName);
        const newVisitedFields = concatIfNotExistsFields(visitedFields, edge.move.requires);
        this.logger.log(() => 'Visited graphs: ' + newVisitedGraphs.join(','));
        if (
          this.canResolveFields(
            edge.move.requires.fields,
            path,
            visitedEdges.concat(edge),
            newVisitedGraphs,
            newVisitedFields,
          ).success
        ) {
          this.logger.groupEnd(() => 'Can move to ' + edge);
          return edge.setResolvable(true, newVisitedGraphs);
        }

        this.logger.groupEnd(
          () => 'Cannot move to ' + edge + ' because @require is not resolvable',
        );

        return {
          success: false,
          error: SatisfiabilityError.forRequire(
            edge.head.graphName,
            edge.move.typeName,
            edge.move.fieldName,
          ),
        };
      } else if (this.isExternal(edge)) {
        this.logger.groupEnd(
          () => 'Cannot move to ' + edge + ' because it is external and cross-graph',
        );
        return edge.setResolvable(
          false,
          visitedGraphs,
          SatisfiabilityError.forExternal(
            edge.head.graphName,
            edge.move.typeName,
            edge.move.fieldName,
          ),
        );
      }
    } else if (isEntityEdge(edge)) {
      this.logger.log(() => 'Detected @key');
      const newVisitedGraphs = concatIfNotExistsString(visitedGraphs, edge.tail.graphName);
      const newVisitedFields = concatIfNotExistsFields(visitedFields, edge.move.keyFields);
      this.logger.log(() => 'Visited graphs: ' + newVisitedGraphs.join(','));
      if (
        this.canResolveFields(
          edge.move.keyFields.fields,
          path,
          visitedEdges.concat(edge),
          newVisitedGraphs,
          newVisitedFields,
        ).success
      ) {
        this.logger.groupEnd(() => 'Can move to ' + edge);
        return edge.setResolvable(true, newVisitedGraphs);
      }

      this.logger.groupEnd(
        () => 'Cannot move to ' + edge + ' because key fields are not resolvable',
      );

      return edge.setResolvable(
        false,
        newVisitedGraphs,
        SatisfiabilityError.forKey(
          edge.head.graphName,
          edge.tail.graphName,
          edge.head.typeName,
          edge.move.keyFields.toString(),
        ),
      );
    }

    this.logger.groupEnd(() => 'Can move to ' + edge);

    return edge.setResolvable(true, visitedGraphs);
  }
}
