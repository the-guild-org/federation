import { FieldNode, InlineFragmentNode, Kind, SelectionSetNode } from 'graphql';
import { parseFields } from '../../../../subgraph/helpers.js';
import { stripTypeModifiers } from '../../../../utils/state.js';
import { SupergraphState } from '../../../state.js';

export type Field =
  | {
      typeName: string;
      fieldName: string;
      selectionSet: null;
    }
  | {
      typeName: string;
      fieldName: string;
      selectionSet: Array<Field>;
    };

export class Fields {
  constructor(
    private typeName: string,
    private source: string,
    public fields: Field[],
  ) {}

  contains(typeName: string, fieldName: string) {
    return this._contains(typeName, fieldName, this.fields);
  }

  equals(other: Fields) {
    if (this.typeName !== other.typeName) {
      return false;
    }

    if (this.source === other.source) {
      return true;
    }

    return this._fieldsEqual(this.fields, other.fields);
  }

  private _fieldsEqual(fields: Field[], otherFields: Field[]): boolean {
    if (fields.length !== otherFields.length) {
      return false;
    }

    for (let i = 0; i < fields.length; i++) {
      // Fields are sorted by typeName and fieldName, so we can compare them directly.
      // See: FieldsResolver#sortFields
      const field = fields[i];
      const otherField = otherFields[i];

      // Compare typeName and fieldName
      if (field.typeName !== otherField.typeName || field.fieldName !== otherField.fieldName) {
        return false;
      }

      const areEqual =
        // Compare selectionSet if both are arrays
        // Otherwise, compare nullability of selectionSet
        Array.isArray(field.selectionSet) && Array.isArray(otherField.selectionSet)
          ? this._fieldsEqual(field.selectionSet, otherField.selectionSet)
          : field.selectionSet === otherField.selectionSet;

      // Avoid unnecessary iterations if we already know that fields are not equal
      if (!areEqual) {
        return false;
      }
    }

    return true;
  }

  private _contains(typeName: string, fieldName: string, fields: Field[]): boolean {
    return fields.some(
      f =>
        (f.typeName === typeName && f.fieldName === fieldName) ||
        (f.selectionSet ? this._contains(typeName, fieldName, f.selectionSet) : false),
    );
  }

  toString() {
    return this.source;
  }
}

export class FieldsResolver {
  private cache: Map<string, Fields> = new Map();

  constructor(private supergraphState: SupergraphState) {}

  resolve(typeName: string, keyFields: string): Fields {
    const key = this.keyFactory(typeName, keyFields);

    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    const typeState = this.supergraphState.objectTypes.get(typeName);

    if (!typeState) {
      throw new Error(`Expected an object type when resolving keyFields of ${typeName}`);
    }

    const selectionSetNode = parseFields(keyFields);

    if (!selectionSetNode) {
      throw new Error(`Expected a selection set when resolving keyFields of ${typeName}`);
    }

    const fields = new Fields(
      typeName,
      keyFields,
      this.resolveSelectionSetNode(typeName, selectionSetNode),
    );
    this.cache.set(key, fields);

    return fields;
  }

  private keyFactory(typeName: string, keyFields: string) {
    return `${typeName}/${keyFields}`;
  }

  private resolveFieldNode(typeName: string, fieldNode: FieldNode, fields: Field[]) {
    const typeState =
      this.supergraphState.objectTypes.get(typeName) ??
      this.supergraphState.interfaceTypes.get(typeName);

    if (!typeState) {
      throw new Error(`Type "${typeName}" is not defined.`);
    }

    if (fieldNode.name.value === '__typename') {
      return;
    }

    if (!typeState.fields.has(fieldNode.name.value)) {
      throw new Error(
        `Type "${typeName.toString()}" does not have field "${fieldNode.name.value}".`,
      );
    }

    if (fieldNode.selectionSet) {
      const outputType = stripTypeModifiers(typeState.fields.get(fieldNode.name.value)!.type);

      fields.push({
        fieldName: fieldNode.name.value,
        typeName,
        selectionSet: this.resolveSelectionSetNode(outputType, fieldNode.selectionSet),
      });
    } else {
      // it's a leaf
      fields.push({
        typeName,
        fieldName: fieldNode.name.value,
        selectionSet: null,
      });
    }
  }

  private resolveInlineFragmentNode(fragmentNode: InlineFragmentNode, fields: Field[]) {
    if (!fragmentNode.typeCondition?.name.value) {
      throw new Error(`Inline fragment without type condition is not supported.`);
    }

    const typeName = fragmentNode.typeCondition.name.value;

    const typeState =
      this.supergraphState.objectTypes.get(typeName) ??
      this.supergraphState.interfaceTypes.get(typeName);

    if (!typeState) {
      throw new Error(`Type "${typeName}" is not defined.`);
    }

    for (const selection of fragmentNode.selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        this.resolveFieldNode(typeName, selection, fields);
      } else {
        throw new Error(`Inline fragment within an inline fragment is not supported.`);
      }
    }
  }

  private resolveSelectionSetNode(
    typeName: string,
    selectionSetNode: SelectionSetNode,
    fields: Field[] = [],
  ): Field[] {
    for (const selection of selectionSetNode.selections) {
      if (selection.kind === Kind.FIELD) {
        this.resolveFieldNode(typeName, selection, fields);
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        this.resolveInlineFragmentNode(selection, fields);
      } else {
        throw new Error(`Fragment spread is not supported.`);
      }
    }

    return this.sortFields(fields);
  }

  private sortFields(fields: Field[]) {
    return fields.sort((a, b) =>
      `${a.typeName}.${a.fieldName}`.localeCompare(`${b.typeName}.${b.fieldName}`),
    );
  }
}
