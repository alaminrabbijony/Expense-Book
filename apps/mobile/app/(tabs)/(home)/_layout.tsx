import { Stack } from "expo-router";

/*
 * Home's own stack, inside the Home tab.
 *
 * Without this file every route in this folder is a tab screen, so opening a
 * title page would be a tab switch — and a tab switch sends the back arrow to
 * the first tab. A push inside this stack pops back to Home instead, and the
 * tab bar keeps drawing underneath the pushed page.
 *
 * The screens are deliberately not listed. expo-router builds them from the
 * folder, walking files before subfolders, so index.tsx comes before
 * title/[id].tsx and the tab opens on the list.
 *
 * headerShown: false, like the root stack and the tab layout: every screen in
 * this app draws its own top.
 *
 * Module level, so the object is never rebuilt on a render.
 */
const STACK_OPTIONS = { headerShown: false };

export default function HomeStackLayout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}