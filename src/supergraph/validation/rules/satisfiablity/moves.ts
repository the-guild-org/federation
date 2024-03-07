import type { Fields } from './fields';
import { lazy } from './helpers';

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
    public requires: Fields | null = null,
    public provides: Fields | null = null,
    public provided: boolean = false,
  ) {}

  toString() {
    return this._toString.get();
  }
}

export class AbstractMove implements Move {
  toString() {
    return `🔮`;
  }
}

export class EntityMove implements Move {
  private _toString = lazy(() => `🔑 ${this.keyFields}`);

  constructor(public keyFields: Fields) {}

  toString() {
    return this._toString.get();
  }
}
