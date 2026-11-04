import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function readPackageName(directory: string): string | undefined {
  const packagePath = path.join(directory, 'package.json');
  if (!existsSync(packagePath)) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'name' in parsed) {
      const name = parsed.name;
      return typeof name === 'string' ? name : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function findPackageRoot(startDir: string, packageName: string): string {
  let current = path.resolve(startDir);
  const filesystemRoot = path.parse(current).root;

  while (true) {
    if (readPackageName(current) === packageName) {
      return current;
    }
    if (current === filesystemRoot) {
      break;
    }
    current = path.dirname(current);
  }

  throw new Error(`Could not locate package ${packageName}.`);
}

export function findRepoRoot(startDir: string): string {
  return findPackageRoot(startDir, 'eval-harness-platform');
}

export function findApiPackageRoot(startDir: string): string {
  return findPackageRoot(startDir, '@eval/api');
}
