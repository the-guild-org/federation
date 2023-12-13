export const sdl = /* GraphQL */ `
  directive @policy(
    policies: [[policy__Policy!]!]!
  ) on ENUM | FIELD_DEFINITION | INTERFACE | OBJECT | SCALAR

  scalar policy__Policy
`;
