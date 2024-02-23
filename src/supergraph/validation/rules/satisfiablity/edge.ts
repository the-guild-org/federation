import { SatisfiabilityError } from './errors';
import { AbstractMove, EntityMove, FieldMove, Move } from './moves';
import { Node } from './node';

type EdgeResolvabilityResult =
  | {
      success: true;
      error: undefined;
    }
  | {
      success: false;
      error: SatisfiabilityError;
    };

export function isEntityEdge(edge: Edge): edge is Edge<EntityMove> {
  return edge.move instanceof EntityMove;
}

export function assertEntityEdge(edge: Edge): asserts edge is Edge<EntityMove> {
  if (!isEntityEdge(edge)) {
    throw new Error(`Expected edge to be Edge<EntityMove>, but got ${edge}`);
  }
}

export function isAbstractEdge(edge: Edge): edge is Edge<AbstractMove> {
  return edge.move instanceof AbstractMove;
}

export function assertAbstractEdge(edge: Edge): asserts edge is Edge<AbstractMove> {
  if (!isAbstractEdge(edge)) {
    throw new Error(`Expected edge to be Edge<AbstractMove>, but got ${edge}`);
  }
}

export function isFieldEdge(edge: Edge): edge is Edge<FieldMove> {
  return edge.move instanceof FieldMove;
}

export function assertFieldEdge(edge: Edge): asserts edge is Edge<FieldMove> {
  if (!isFieldEdge(edge)) {
    throw new Error(`Expected edge to be Edge<FieldMove>, but got ${edge}`);
  }
}

export class Edge<T = Move> {
  private resolvable: EdgeResolvabilityResult | undefined;

  constructor(
    public head: Node,
    public move: T,
    public tail: Node,
  ) {}

  isCrossGraphEdge(): boolean {
    return this.head.graphId !== this.tail.graphId;
  }

  toString() {
    return `${this.head} -(${this.move})-> ${this.tail}`;
  }

  isChecked() {
    return typeof this.resolvable !== 'undefined';
  }

  isResolvable() {
    if (this.resolvable === undefined) {
      throw new Error('Expected resolvable to be set');
    }

    return this.resolvable;
  }

  setResolvable(success: true): EdgeResolvabilityResult;
  setResolvable(success: false, error: SatisfiabilityError): EdgeResolvabilityResult;
  setResolvable(success: boolean, error?: SatisfiabilityError): EdgeResolvabilityResult {
    this.resolvable = success ? { success, error: undefined } : { success, error: error! };
    return this.resolvable;
  }
}
