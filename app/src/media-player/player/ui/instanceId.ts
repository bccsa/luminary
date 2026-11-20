let count = 0;

/** A page-unique id for a component instance's elements, so ids that menus point at do not collide. */
export const nextInstanceId = (prefix: string): string => `${prefix}-${++count}`;
