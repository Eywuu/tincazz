import { registerHooks } from 'node:module';

// Sapphire loads pieces with Node's native loader, which cannot map the `.js` extension in
// relative imports (NodeNext style) back to the `.ts` source. Do that mapping for tests.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && specifier.endsWith('.js')) {
        return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      }
      throw error;
    }
  },
});
