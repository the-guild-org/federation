import { lazy } from './helpers.js';
import type { Selection } from './selection.js';

export interface Move {
  toString(): string;
}

export class FieldMove implements Move {
  private _toString = lazy(() => {
    let str = this.fieldName;

    if (this.requires) {
      str += ` @require(${this.requires})`;
    }

    if (this.provides) {
      str += ` @provides(${this.provides})`;
    }

    if (this.provided) {
      str += ' @provided';
    }

    return str;
  });

  constructor(
    public typeName: string,
    public fieldName: string,
    public requires: Selection | null = null,
    public provides: Selection | null = null,
    public provided: boolean = false,
  ) {}

  toString() {
    return this._toString.get();
  }
}

export class AbstractMove implements Move {
  private _toString = lazy(() => (this.keyFields ? `🔮 🔑 ${this.keyFields}` : `🔮`));

  constructor(public keyFields?: Selection) {}

  toString() {
    return this._toString.get();
  }
}

export class EntityMove implements Move {
  private _toString = lazy(() => `🔑 ${this.keyFields}`);

  constructor(public keyFields: Selection) {}

  toString() {
    return this._toString.get();
  }
}
