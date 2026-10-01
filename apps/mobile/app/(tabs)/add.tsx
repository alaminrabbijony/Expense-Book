/*
 * The route behind the + in the tab bar. Never shown.
 *
 * The tab bar draws one item per route, so the + needs a route of its own to
 * have a slot in the bar. Its button never navigates here (AddTabButton in
 * _layout.tsx), so tapping + never mounts this screen.
 */
export default function AddPlaceholder() {
  return null;
}
