export const sdl = /* GraphQL */ `
  directive @requiresScopes(
    scopes: [[requiresScopes__Scope!]!]!
  ) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM

  scalar requiresScopes__Scope
`;
