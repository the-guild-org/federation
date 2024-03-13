import type { Logger } from '../../../../utils/logger.js';
import { Edge, isAbstractEdge, isEntityEdge, isFieldEdge } from './edge.js';
import { SatisfiabilityError } from './errors.js';
import { Fields } from './fields.js';
import type { Graph } from './graph.js';
import type { MoveValidator } from './move-validator.js';
import type { OperationPath } from './operation-path.js';

export function concatIfNotExistsString(list: string[], item: string): string[] {
  if (list.includes(item)) {
    return list;
  }

  return list.concat(item);
}

export function concatIfNotExistsFields(list: Fields[], item: Fields): Fields[] {
  if (list.some(f => f.equals(item))) {
    return list;
  }

  return list.concat(item);
}

type PathFinderResult =
  | {
      success: true;
      paths: OperationPath[];
      errors: undefined;
    }
  | {
      success: false;
      paths: undefined;
      errors: SatisfiabilityError[];
    };

export class PathFinder {
  constructor(
    private logger: Logger,
    private graph: Graph,
    private moveValidator: MoveValidator,
  ) {}

  findDirectPaths(
    path: OperationPath,
    typeName: string,
    fieldName: string | null,
    visitedEdges: Edge[],
  ): PathFinderResult {
    const nextPaths: OperationPath[] = [];
    const errors: SatisfiabilityError[] = [];
    const tail = path.tail() ?? path.rootNode();
    const isFieldTarget = fieldName !== null;
    const id = isFieldTarget ? `${typeName}.${fieldName}` : `... on ${typeName}`;

    this.logger.group(() => 'Direct paths to ' + id + ' from: ' + tail);

    const edges = isFieldTarget
      ? this.graph.fieldEdgesOfHead(tail, fieldName)
      : this.graph.abstractEdgesOfHead(tail);

    this.logger.log(() => 'Checking ' + edges.length + ' edges');

    let i = 0;
    for (const edge of edges) {
      this.logger.group(() => 'Checking #' + i++ + ' ' + edge);
      if (edge.isCrossGraphEdge()) {
        this.logger.groupEnd(() => 'Cross graph edge: ' + edge);
        continue;
      }

      if (visitedEdges.includes(edge)) {
        this.logger.groupEnd(() => 'Already visited: ' + edge);
        continue;
      }

      if (!isFieldTarget) {
        if (isAbstractEdge(edge) && edge.tail.typeName === typeName) {
          this.logger.groupEnd(() => 'Resolvable: ' + edge);
          const newPath = path.clone().move(edge);
          nextPaths.push(newPath);
          continue;
        }
      }

      if (
        isFieldTarget &&
        isFieldEdge(edge) &&
        edge.move.typeName === typeName &&
        edge.move.fieldName === fieldName
      ) {
        const resolvable = this.moveValidator.isEdgeResolvable(edge, path, [], [], []);
        if (!resolvable.success) {
          errors.push(resolvable.error);
          this.logger.groupEnd(() => 'Not resolvable: ' + edge);
          continue;
        }

        this.logger.groupEnd(() => 'Resolvable: ' + edge);
        const newPath = path.clone().move(edge);
        nextPaths.push(newPath);
        continue;
      }

      this.logger.groupEnd(() => 'Not matching');
    }

    this.logger.groupEnd(() => 'Found ' + nextPaths.length + ' direct paths');

    // TODO: we will have to adjust pushed errors as we moved Abstract and Field moves here, to direct paths finder.
    if (nextPaths.length === 0) {
      // In case of no errors, we know that there were no edges matching the field name.
      if (errors.length === 0) {
        if (isFieldTarget) {
          errors.push(SatisfiabilityError.forMissingField(tail.graphName, typeName, fieldName));

          // find graphs with the same type and field name, but no @key defined
          const typeNodes = this.graph.nodesOf(typeName);
          for (const typeNode of typeNodes) {
            const edges = this.graph.fieldEdgesOfHead(typeNode, fieldName);
            for (const edge of edges) {
              if (
                isFieldEdge(edge) &&
                edge.move.typeName === typeName &&
                edge.move.fieldName === fieldName &&
                !this.moveValidator.isExternal(edge)
              ) {
                const typeStateInGraph =
                  edge.head.typeState &&
                  edge.head.typeState.kind === 'object' &&
                  edge.head.typeState.byGraph.get(edge.head.graphId);
                const keys = typeStateInGraph
                  ? typeStateInGraph.keys.filter(key => key.resolvable)
                  : [];

                if (keys.length === 0) {
                  errors.push(
                    SatisfiabilityError.forNoKey(
                      tail.graphName,
                      edge.tail.graphName,
                      typeName,
                      fieldName,
                    ),
                  );
                }
              }
            }
          }
        } else {
          // This is a special case where we are looking for an abstract type, but there are no edges leading to it.
          // It's completely fine, as abstract types are not resolvable by themselves and Federation will handle it (return empty result).
          return {
            success: true,
            errors: undefined,
            paths: [],
          };
        }
      }

      return {
        success: false,
        errors,
        paths: undefined,
      };
    }

    return {
      success: true,
      paths: nextPaths,
      errors: undefined,
    };
  }

  findIndirectPaths(
    path: OperationPath,
    typeName: string,
    fieldName: string | null,
    visitedEdges: Edge[],
    visitedGraphs: string[],
    visitedFields: Fields[],
  ): PathFinderResult {
    const errors: SatisfiabilityError[] = [];
    const tail = path.tail() ?? path.rootNode();
    const sourceGraphName = tail.graphName;
    const isFieldTarget = fieldName !== null;
    const id = isFieldTarget ? `${typeName}.${fieldName}` : `... on ${typeName}`;

    this.logger.group(() => 'Indirect paths to ' + id + ' from: ' + tail);

    const queue: [string[], Fields[], OperationPath][] = [[visitedGraphs, visitedFields, path]];
    const finalPaths: OperationPath[] = [];
    const shortestPathPerGraph = new Map<string, OperationPath>();
    const edgesToIgnore: Edge[] = visitedEdges.slice();

    while (queue.length > 0) {
      const item = queue.pop();

      if (!item) {
        throw new Error('Unexpected end of queue');
      }

      const [visitedGraphs, visitedFields, path] = item;
      const tail = path.tail() ?? path.rootNode();
      const edges = this.graph.crossGraphEdgesOfHead(tail);

      if (!this.graph.canReachTypeFromType(tail.typeName, typeName)) {
        this.logger.log(() => 'Cannot reach ' + typeName + ' from ' + tail.typeName);
        continue;
      }

      this.logger.log(() => 'At path: ' + path);
      this.logger.log(() => 'Checking ' + edges.length + ' edges');
      let i = 0;
      for (const edge of edges) {
        this.logger.group(() => 'Checking #' + i++ + ' ' + edge);
        this.logger.log(() => 'Visited graphs: ' + visitedGraphs.join(','));

        if (visitedGraphs.includes(edge.tail.graphName)) {
          this.logger.groupEnd(() => 'Ignore: already visited graph');
          continue;
        }

        if (!edge.isCrossGraphEdge()) {
          this.logger.groupEnd(() => 'Not cross-graph edge');
          continue;
        }

        if (edgesToIgnore.includes(edge)) {
          this.logger.groupEnd(() => 'Ignore: already visited edge');
          continue;
        }

        if (edge.tail.graphName === sourceGraphName && !isAbstractEdge(edge)) {
          // Prevent a situation where we are going back to the same graph
          // The only exception is when we are moving to an abstract type
          this.logger.groupEnd(() => 'Ignore: we are back to the same graph');
          continue;
        }

        if (isFieldTarget && isEntityEdge(edge)) {
          if (visitedFields.some(f => f.equals(edge.move.keyFields))) {
            // A huge win for performance, is when you do less work :D
            // We can ignore an edge that has already been visited with the same key fields / requirements.
            // The way entity-move edges are created, where every graph points to every other graph:
            //  Graph A: User @key(id) @key(name)
            //  Graph B: User @key(id)
            //  Edges in a merged graph:
            //    - User/A @key(id) -> User/B
            //    - User/B @key(id) -> User/A
            //    - User/B @key(name) -> User/A
            // Allows us to ignore an edge with the same key fields.
            // That's because in some other path, we will or already have checked the other edge.
            this.logger.groupEnd(() => 'Ignore: already visited fields');
            continue;
          }

          const shortestPathToThisGraph = shortestPathPerGraph.get(edge.tail.graphName);
          if (shortestPathToThisGraph && shortestPathToThisGraph.depth() <= path.depth()) {
            this.logger.groupEnd(() => 'Already found a shorter path to ' + edge.tail);
            continue;
          }

          const resolvable = this.moveValidator.isEdgeResolvable(
            edge,
            path,
            edgesToIgnore.concat(edge),
            visitedGraphs,
            visitedFields,
          );

          if (!resolvable.success) {
            errors.push(resolvable.error);
            this.logger.groupEnd(() => 'Not resolvable: ' + resolvable.error);
            continue;
          }

          const newPath = path.clone().move(edge);

          this.logger.log(
            () => 'From indirect path, look for direct paths to ' + id + ' from: ' + edge,
          );
          const direct = this.findDirectPaths(newPath, typeName, fieldName, [edge]);

          if (direct.success) {
            this.logger.groupEnd(
              () => 'Resolvable: ' + edge + ' with ' + direct.paths.length + ' paths',
            );

            finalPaths.push(...direct.paths);
            continue;
          }

          errors.push(...direct.errors);

          setShortest(newPath, shortestPathPerGraph);

          queue.push([
            concatIfNotExistsString(visitedGraphs, edge.tail.graphName),
            concatIfNotExistsFields(visitedFields, edge.move.keyFields),
            newPath,
          ]);
          this.logger.log(() => 'Did not find direct paths');
          this.logger.groupEnd(() => 'Adding to queue: ' + newPath);
        } else if (isFieldTarget && isFieldEdge(edge)) {
          this.logger.log(() => 'Cross graph field move:' + edge.move);
          if (path.isVisitedEdge(edge)) {
            this.logger.groupEnd(() => 'Already visited');
            continue;
          }

          if (isFieldTarget && edge.move.requires?.contains(typeName, fieldName)) {
            errors.push(SatisfiabilityError.forRequire(tail.graphName, typeName, fieldName));
            this.logger.groupEnd(() => 'Ignored');
            continue;
          }

          if (edge.move.requires && visitedFields.some(f => f.equals(edge.move.requires!))) {
            // double check if we should ignore it for non field target
            this.logger.groupEnd(() => 'Ignore: already visited fields');
            continue;
          }

          const resolvable = this.moveValidator.isEdgeResolvable(
            edge,
            path,
            visitedEdges.concat(edge),
            visitedGraphs,
            edge.move.requires
              ? concatIfNotExistsFields(visitedFields, edge.move.requires)
              : visitedFields,
          );

          if (!resolvable.success) {
            errors.push(resolvable.error);
            this.logger.groupEnd(() => 'Not resolvable: ' + resolvable.error);
            continue;
          }

          setShortest(path.clone().move(edge), shortestPathPerGraph);
          this.logger.groupEnd(() => 'Resolvable: ' + edge);
        } else if (!isFieldTarget && isAbstractEdge(edge)) {
          if (shortestPathPerGraph.has(edge.tail.graphName)) {
            this.logger.groupEnd(() => 'Already found a shorter path to ' + edge.tail);
            continue;
          }

          const newPath = path.clone().move(edge);
          setShortest(newPath, shortestPathPerGraph);
          finalPaths.push(newPath);
          this.logger.groupEnd(() => 'Resolvable');
        } else {
          this.logger.groupEnd(() => 'Ignored...');
        }
      }
    }

    this.logger.groupEnd(() => 'Found ' + finalPaths.length + ' indirect paths');

    if (finalPaths.length === 0) {
      return {
        success: false,
        errors,
        paths: undefined,
      };
    }

    return {
      success: true,
      paths: finalPaths,
      errors: undefined,
    };
  }
}

function setShortest(path: OperationPath, shortestPathPerGraph: Map<string, OperationPath>) {
  const edge = path.edge();

  if (!edge) {
    throw new Error('Unexpected end of path');
  }

  const shortest = shortestPathPerGraph.get(edge.tail.graphName);

  if (!shortest || shortest.depth() > path.depth()) {
    shortestPathPerGraph.set(edge.tail.graphName, path);
  }
}
