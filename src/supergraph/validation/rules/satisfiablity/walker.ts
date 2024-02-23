import type { Logger } from '../../../../utils/logger';
import { isAbstractEdge, isFieldEdge, type Edge } from './edge';
import { SatisfiabilityError } from './errors';
import { PathFinder } from './finder';
import type { Graph } from './graph';
import type { MoveValidator } from './move-validator';
import { AbstractMove, FieldMove } from './moves';
import type { Node } from './node';
import { OperationPath } from './operation-path';

export class WalkTracker {
  private errors: SatisfiabilityError[] = [];

  constructor(
    public superPath: OperationPath,
    public paths: OperationPath[],
  ) {}

  move(edge: Edge) {
    if (isFieldEdge(edge) || isAbstractEdge(edge)) {
      return new WalkTracker(this.superPath.clone().move(edge), []);
    }

    throw new Error('Expected edge to be FieldMove or AbstractMove');
  }

  addPath(path: OperationPath) {
    this.paths.push(path);
    this.errors = [];
  }

  addError(error: SatisfiabilityError) {
    this.errors.push(error);
  }

  isPossible() {
    return this.paths.length > 0;
  }

  givesEmptyResult() {
    const lastEdge = this.superPath.edge();
    return (
      this.paths.length === 0 && this.errors.length === 0 && !!lastEdge && isAbstractEdge(lastEdge)
    );
  }

  isEdgeVisited(edge: Edge) {
    return this.superPath.isVisitedEdge(edge);
  }

  listErrors() {
    return this.errors
      .filter(
        (error, i, all) =>
          !error.isIgnored() && all.findIndex(e => e.toString() === error.toString()) === i,
      )
      .filter(error => {
        if (error.kind !== 'KEY') {
          return true;
        }

        // remove key resolution errors that does not lead to the field we are looking for
        const steps = this.superPath.steps();
        const lastStep = steps[steps.length - 1];

        if (!lastStep || lastStep.typeName !== error.typeName) {
          return true;
        }

        return true;
      });
  }
}

export class Walker {
  private logger: Logger;
  private pathFinder: PathFinder;

  constructor(
    logger: Logger,
    private moveChecker: MoveValidator,
    private supergraph: Graph,
    private mergedGraph: Graph,
  ) {
    this.logger = logger.create('Walker');
    this.pathFinder = new PathFinder(logger, this.mergedGraph, this.moveChecker);
  }

  walk(method: 'bfs' | 'dfs' = 'bfs') {
    if (method === 'dfs') {
      return this.dfs();
    }

    return this.bfs();
  }

  private nextStep(
    state: WalkTracker,
    superTail: Node,
    next: (nextState: WalkTracker, edge: Edge) => void,
  ) {
    const graphsLeadingToNode = Array.from(
      new Set(
        state.paths.map(p => {
          const edge = p.edge();
          const tail = p.tail() ?? p.rootNode();
          const tailGraphName = tail.graphName;

          // To prevent a scenario where multiple paths converge on the same Node,
          // differing fundamentally – some with the "@provides" directive and others without – we must differentiate them
          // not solely by the graph names leading to the Node,
          // but also by the presence of provided fields.
          // Simply marking a Node as visited and successfully checked after traversing a path with a @provided field,
          // using only graph names, results in a flaw.
          // This is because other paths leading to the same Node, lacking a @provided field,
          // will also be incorrectly marked as resolvable.
          // This inaccuracy arises because the Node contains an @external field, making it non-resolvable (non-provided field).
          if (edge && isFieldEdge(edge) && edge.move.provides) {
            return `${tailGraphName}#provides`;
          }

          return tailGraphName;
        }),
      ),
    );

    if (superTail.isGraphComboVisited(graphsLeadingToNode)) {
      this.logger.log(() => 'Node already visited: ' + superTail);
      return;
    }

    superTail.setGraphComboAsVisited(graphsLeadingToNode);

    const superEdges = this.supergraph.edgesOfHead(superTail);

    for (const superEdge of superEdges) {
      this.logger.group(
        () => 'Attempt to advance to ' + superEdge + ' (' + state.paths.length + ' paths)',
      );

      this.logger.group(() => 'Possible paths: [');
      for (let i = 0; i < state.paths.length; i++) {
        const path = state.paths[i];
        this.logger.log(() => path.toString(), ` `);
      }
      this.logger.groupEnd(() => ']');

      if (state.isEdgeVisited(superEdge)) {
        this.logger.groupEnd(() => 'Edge already visited: ' + superEdge);
        continue;
      }

      if (!(isFieldEdge(superEdge) || isAbstractEdge(superEdge))) {
        throw new Error('Expected edge to have a FieldMove or AbstractMove');
      }

      const nextState = state.move(superEdge);
      const shortestPathPerTail = new Map<Node, OperationPath>();
      const isFieldMove = isFieldEdge(superEdge);

      for (const path of state.paths) {
        const directPathsResult = this.pathFinder.findDirectPaths(
          path,
          isFieldMove ? superEdge.move.typeName : superEdge.tail.typeName,
          isFieldMove ? superEdge.move.fieldName : null,
          [],
        );

        // Special case when it's an abstract type and there are no direct paths
        if (directPathsResult.success && directPathsResult.paths.length === 0) {
          continue;
        }

        if (directPathsResult.success) {
          for (const directPath of directPathsResult.paths) {
            const tail = directPath.tail() ?? directPath.rootNode();
            const shortestByTail = shortestPathPerTail.get(tail);

            if (!shortestByTail || shortestByTail.depth() > directPath.depth()) {
              shortestPathPerTail.set(tail, directPath);
            }
          }
        } else {
          for (const error of directPathsResult.errors) {
            nextState.addError(error);
          }
        }

        if (directPathsResult.success && superEdge.tail.isLeaf) {
          this.logger.log(() => 'Reached leaf node, no need to find indirect paths');
          continue;
        }

        const indirectPathsResult = this.pathFinder.findIndirectPaths(
          path,
          isFieldMove ? superEdge.move.typeName : superEdge.tail.typeName,
          isFieldMove ? superEdge.move.fieldName : null,
          [],
        );

        if (indirectPathsResult.success) {
          for (const indirectPath of indirectPathsResult.paths) {
            const tail = indirectPath.tail() ?? indirectPath.rootNode();
            const shortestByTail = shortestPathPerTail.get(tail);

            if (!shortestByTail || shortestByTail.depth() >= indirectPath.depth()) {
              shortestPathPerTail.set(tail, indirectPath);
            }
          }
        } else {
          for (const error of indirectPathsResult.errors) {
            nextState.addError(error);
          }
        }
      }

      for (const shortestPathByTail of shortestPathPerTail.values()) {
        nextState.addPath(shortestPathByTail);
      }
      next(nextState, superEdge);
    }
  }

  private dfs() {
    const unreachable = new Set<WalkTracker>();

    const dfs = (superTail: Node, state: WalkTracker) => {
      if (superTail.isLeaf) {
        return;
      }

      this.nextStep(state, superTail, (nextState, superEdge) => {
        if (nextState.isPossible()) {
          this.logger.groupEnd(
            () => 'Advanced to ' + superEdge + ' with ' + nextState.paths.length + ' paths',
          );
          dfs(superEdge.tail, nextState);
        } else if (nextState.givesEmptyResult()) {
          this.logger.groupEnd(() => 'Federation will resolve an empty object for ' + superEdge);
        } else {
          unreachable.add(nextState);
          this.logger.log(() => 'Dead end', '🚨 ');
          if (this.logger.isEnabled) {
            for (const path of state.paths) {
              this.logger.log(() => path.toString());
            }
          }
          this.logger.groupEnd(() => 'Unreachable path ' + nextState.superPath.toString());
        }
      });
    };

    const rootNodes = ['Query', 'Mutation', 'Subscription']
      .map(name => this.supergraph.nodeOf(name, false))
      .filter((node): node is Node => !!node);

    for (const rootNode of rootNodes) {
      dfs(
        rootNode,
        new WalkTracker(
          new OperationPath(rootNode),
          this.mergedGraph.nodesOf(rootNode.typeName, false).map(n => new OperationPath(n)),
        ),
      );
    }

    return unreachable;
  }

  private bfs() {
    const unreachable = new Set<WalkTracker>();
    const queue: WalkTracker[] = [];

    const rootNodes = ['Query', 'Mutation', 'Subscription']
      .map(name => this.supergraph.nodeOf(name, false))
      .filter((node): node is Node => !!node);

    for (const rootNode of rootNodes) {
      queue.push(
        new WalkTracker(
          new OperationPath(rootNode),
          this.mergedGraph.nodesOf(rootNode.typeName, false).map(n => new OperationPath(n)),
        ),
      );
    }

    while (queue.length > 0) {
      const state = queue.pop();

      if (!state) {
        throw new Error('Unexpected end of queue');
      }

      const superTail = state.superPath.tail() ?? state.superPath.rootNode();

      if (superTail.isLeaf) {
        continue;
      }

      this.nextStep(state, superTail, (nextState, superEdge) => {
        if (nextState.isPossible()) {
          this.logger.groupEnd(
            () => 'Advanced to ' + superEdge + ' with ' + nextState.paths.length + ' paths',
          );
          queue.push(nextState);
        } else if (nextState.givesEmptyResult()) {
          this.logger.groupEnd(() => 'Federation will resolve an empty object for ' + superEdge);
        } else {
          unreachable.add(nextState);
          this.logger.log(() => 'Dead end', '🚨 ');
          if (this.logger.isEnabled) {
            for (const path of state.paths) {
              this.logger.log(() => path.toString());
            }
          }
          this.logger.groupEnd(() => 'Unreachable path ' + nextState.superPath.toString());
        }
      });
    }

    return unreachable;
  }
}
