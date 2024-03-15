import { FederationVersion } from '../specifications/federation';

export function satisfiesVersionRange(
  version: FederationVersion,
  range: `${'<' | '>=' | '>'} ${FederationVersion}`,
) {
  const [sign, ver] = range.split(' ') as ['<' | '>=' | '>', FederationVersion];
  const versionInRange = parseFloat(ver.replace('v', ''));
  const detectedVersion = parseFloat(version.replace('v', ''));

  if (sign === '<') {
    return detectedVersion < versionInRange;
  }

  if (sign === '>') {
    return detectedVersion > versionInRange;
  }

  return detectedVersion >= versionInRange;
}
