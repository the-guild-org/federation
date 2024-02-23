import { isFieldEdge, type Edge } from './edge';
import { FieldMove } from './moves';
import type { Node } from './node';

type Step = FieldStep | AbstractStep;

type FieldStep = {
  fieldName: string;
  typeName: string;
};

type AbstractStep = {
  typeName: string;
};

export class OperationPath {
  private previousNodes: Node[] = [];
  private previousEdges: Edge[] = [];
  private previousSteps: Step[] = [];
  private _isPossible = true;

  constructor(private _rootNode: Node) {}

  move(edge: Edge): OperationPath {
    if (this.isEdgeVisited(edge)) {
      this._isPossible = false;
      return this;
    }

    this.advance(edge);

    return this;
  }

  isPossible() {
    return this._isPossible === true;
  }

  clone() {
    const newPath = new OperationPath(this._rootNode);

    newPath.previousNodes = this.previousNodes.slice();
    newPath.previousEdges = this.previousEdges.slice();
    newPath.previousSteps = this.previousSteps.slice();
    newPath._isPossible = this._isPossible;

    return newPath;
  }

  depth() {
    return this.previousEdges.length;
  }

  edge(): Edge | undefined {
    return this.previousEdges[this.previousEdges.length - 1];
  }

  steps(): Step[] {
    return this.previousSteps;
  }

  tail(): Node | undefined {
    return this.edge()?.tail;
  }

  rootNode() {
    return this._rootNode;
  }

  isVisitedEdge(edge: Edge) {
    return this.previousEdges.includes(edge);
  }

  toString() {
    let str = ' *';
    for (let i = 0; i < this.previousEdges.length; i++) {
      const edge = this.previousEdges[i];
      if (edge) {
        str += ' --> ' + edge;
      }
    }

    return str;
  }

  private advance(edge: Edge) {
    this.previousEdges.push(edge);
    this.previousNodes.push(edge.head);
    this.previousSteps.push(
      isFieldEdge(edge)
        ? {
            typeName: edge.move.typeName,
            fieldName: edge.move.fieldName,
          }
        : {
            typeName: edge.tail.typeName,
          },
    );
  }

  private isEdgeVisited(visitingEdge: Edge) {
    return this.previousEdges.includes(visitingEdge);
  }
}
