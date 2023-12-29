import { ASTVisitor } from 'graphql';
import { validateDirectiveAgainstOriginal } from '../../../helpers.js';
import type { SubgraphValidationContext } from '../../validation-context.js';
import { FederationImports } from "../../../../specifications/federation.js";

// new utilities for @interfaceObject (trkohler)
export const allowedInterfaceObjectVersion = ["v2.3", "v2.4", "v2.5", "v2.6"]
export const importsAllowInterfaceObject = (imports: FederationImports) => {
  const allowed = imports.some((importItem) => importItem.name == "@interfaceObject") && imports.some((importItem) => importItem.name == "@key")
  return allowed
}

export function InterfaceObjectRules(context: SubgraphValidationContext): ASTVisitor {
  return {
    DirectiveDefinition(node) {
      // it matches every directive definition
      validateDirectiveAgainstOriginal(node, 'interfaceObject', context);
    },
    Directive(node) {
      // it matches every directive
      if (!context.isAvailableFederationDirective('interfaceObject', node)) {
        return;
      }

      if (!context.satisfiesVersionRange('> v2.3')) {
        return;
      }

    },
  };
}
