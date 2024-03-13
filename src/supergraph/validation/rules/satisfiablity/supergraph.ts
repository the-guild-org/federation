import { OperationTypeNode } from 'graphql';
import { Logger, LoggerContext } from '../../../../utils/logger.js';
import type { SupergraphState } from '../../../state.js';
import { SUPERGRAPH_ID } from './constants.js';
import { FieldsResolver } from './fields.js';
import { Graph } from './graph.js';
import { MoveValidator } from './move-validator.js';
import { Step } from './operation-path.js';
import { Walker } from './walker.js';

export class Supergraph {
  private supergraph: Graph;
  private mergedGraph: Graph;
  private fieldsResolver: FieldsResolver;
  private moveRequirementChecker: MoveValidator;
  private logger = new Logger('Supergraph', new LoggerContext());

  constructor(supergraphState: SupergraphState) {
    this.fieldsResolver = new FieldsResolver(supergraphState);
    this.supergraph = new Graph(
      this.logger,
      SUPERGRAPH_ID,
      'supergraph',
      supergraphState,
      this.fieldsResolver,
      true,
    );
    this.mergedGraph = new Graph(
      this.logger,
      SUPERGRAPH_ID,
      'merged',
      supergraphState,
      this.fieldsResolver,
    );
    for (const [id, subgraphState] of supergraphState.subgraphs) {
      this.mergedGraph.addSubgraph(
        new Graph(
          this.logger,
          id,
          subgraphState.graph.name,
          supergraphState,
          this.fieldsResolver,
          false,
        )
          .addFromRoots()
          .addFromEntities()
          .addUnreachableTypes(),
      );
    }

    this.mergedGraph.joinSubgraphs();
    this.supergraph.addFromRoots();

    this.moveRequirementChecker = new MoveValidator(this.logger, this.mergedGraph);
  }

  validate() {
    return new Walker(
      this.logger,
      this.moveRequirementChecker,
      this.supergraph,
      this.mergedGraph,
    ).walk('dfs');
  }

  validateOperation(operation: OperationTypeNode, steps: Step[]) {
    return new Walker(
      this.logger,
      this.moveRequirementChecker,
      this.supergraph,
      this.mergedGraph,
    ).walkTrail(operation, steps);
  }
}
