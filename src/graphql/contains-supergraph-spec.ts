import {
  federationDirectives,
  federationEnums,
  federationScalars,
} from './transform-supergraph-to-public-schema.js';

const supergraphSpecDetectionRegex = new RegExp(
  Array.from(federationScalars)
    .concat(Array.from(federationEnums))
    // "[NAME" or " NAME" for scalars and enums
    .map(name => [`\\[${name}`, `\\s${name}`])
    .flat(2)
    // "@NAME" for directives
    .concat(Array.from(federationDirectives).map(name => `@${name}`))
    .join('|'),
);

export function containsSupergraphSpec(sdl: string): boolean {
  return supergraphSpecDetectionRegex.test(sdl);
}
