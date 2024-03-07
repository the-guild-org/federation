import type { EnumTypeState } from '../../../composition/enum-type';
import type { InterfaceTypeState } from '../../../composition/interface-type';
import type { ObjectTypeState } from '../../../composition/object-type';
import type { ScalarTypeState } from '../../../composition/scalar-type';
import type { UnionTypeState } from '../../../composition/union-type';
import { lazy } from './helpers';

export class Node {
  private _toString = lazy(() => `${this.typeName}/${this.graphName}`);
  public isLeaf = false;
  private childrenIndex = new Map<string, number[]>();
  /**
   * When a Node is visited, we record names of the graphs that lead to that Node with @provides.
   */
  private visitedGraphCombos: string[][] = [];

  constructor(
    public index: number,
    public typeName: string,
    public typeState:
      | ObjectTypeState
      | InterfaceTypeState
      | EnumTypeState
      | ScalarTypeState
      | UnionTypeState
      | null,
    public graphId: string,
    public graphName: string,
  ) {
    if (this.typeState === undefined) {
      throw new Error(`Expected typeState to be defined for ${typeName} in subgraph ${graphName}`);
    }

    if (
      this.typeState === null ||
      this.typeState.kind === 'scalar' ||
      this.typeState.kind === 'enum'
    ) {
      this.isLeaf = true;
    }
  }

  withoutState() {
    this.childrenIndex = new Map();
    this.visitedGraphCombos = [];
    return this;
  }

  addFieldEdge(fieldName: string, edgeAt: number) {
    const id = `field__${fieldName}`;
    const indexes = this.childrenIndex.get(id);

    if (indexes) {
      if (!indexes.includes(edgeAt)) {
        indexes.push(edgeAt);
      }
    } else {
      this.childrenIndex.set(id, [edgeAt]);
    }
  }

  getFieldEdgeIndexes(fieldName: string) {
    return this.childrenIndex.get(`field__${fieldName}`);
  }

  addEntityEdge(typeName: string, edgeAt: number) {
    this.pushToChildrenIndex(`entity__${typeName}`, edgeAt);
  }

  getEntityEdgeIndexes(typeName: string) {
    return this.childrenIndex.get(`entity__${typeName}`);
  }

  addAbstractEdge(typeName: string, edgeAt: number) {
    this.pushToChildrenIndex(`abstract__${typeName}`, edgeAt);
  }

  getAbstractEdgeIndexes(typeName: string) {
    return this.childrenIndex.get(`abstract__${typeName}`);
  }

  addCrossGraphEdge(typeName: string, edgeAt: number) {
    this.pushToChildrenIndex(`cross-graph__${typeName}`, edgeAt);
  }

  getCrossGraphEdgeIndexes(typeName: string) {
    return this.childrenIndex.get(`cross-graph__${typeName}`);
  }

  private pushToChildrenIndex(id: string, edgeAt: number) {
    const indexes = this.childrenIndex.get(id);

    if (indexes) {
      if (!indexes.includes(edgeAt)) {
        indexes.push(edgeAt);
      }
    } else {
      this.childrenIndex.set(id, [edgeAt]);
    }
  }

  /**
   * Checks if a combination of graph names and @provides that lead to the Node, was already checked.
   */
  isGraphComboVisited(graphNameProvidesCombos: string[]) {
    return this.visitedGraphCombos.some(visitedGraphs =>
      visitedGraphs.every(g => graphNameProvidesCombos.includes(g)),
    );
  }

  setGraphComboAsVisited(graphNames: string[]) {
    this.visitedGraphCombos.push(graphNames);
  }

  toString() {
    return this._toString.get();
  }
}
