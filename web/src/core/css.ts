/**
 * The scoped name of a CSS Module class. Throws when the module has no such
 * class, which would otherwise leave an element unstyled without a word.
 */
export function cls(module: CSSModuleClasses, name: string): string {
  const scoped = module[name];
  if (scoped === undefined) {
    throw new Error(`the CSS module has no class .${name}`);
  }
  return scoped;
}
