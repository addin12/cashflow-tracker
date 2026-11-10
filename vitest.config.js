import { configDefaults, defineConfig } from 'vitest/config';

// The sandbox a mutation run (Stryker) leaves in the project must never be picked up as tests.
export default defineConfig({ test: { exclude: [...configDefaults.exclude, '.stryker-tmp/**'] } });
