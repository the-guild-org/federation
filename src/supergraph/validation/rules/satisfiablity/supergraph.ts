import { Logger, LoggerContext } from '../../../../utils/logger';
import type { SupergraphState } from '../../../state';
import { SUPERGRAPH_ID } from './constants';
import { FieldsResolver } from './fields';
import { Graph } from './graph';
import { MoveValidator } from './move-validator';
import { Walker } from './walker';

export class Supergraph {
  private supergraph: Graph;
  private mergedGraph: Graph;
  private fieldsResolver: FieldsResolver;
  private moveRequirementChecker: MoveValidator;
  private logger = new Logger('Supergraph', new LoggerContext());

  constructor(supergraphState: SupergraphState) {
    this.logger.log(() => 'Creating Supergraph');
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
}
