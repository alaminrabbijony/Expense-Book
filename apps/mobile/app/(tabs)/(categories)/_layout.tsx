import { Stack } from "expo-router";

/*
 * The Categories tab's own stack.
 *
 * Without this file, every screen under (tabs)/ is a tab screen, and opening
 * one is a tab SWITCH — which React Navigation's backBehavior 'firstRoute'
 * then sends back to Home. With it, a page opens inside this tab: the tab bar
 * stays on screen, and ‹ pops back to the list it was opened from.
 *
 * The screen inside is categories.tsx, NOT index.tsx. A group folder's name is
 * stripped out of the URL, so an index here would answer "/" — and (home)'s
 * index already does. Nothing warns about that: the duplicate check compares
 * patterns, and "(tabs)/(home)" and "(tabs)/(categories)" are different
 * strings. The same reason (all)'s list file is called all.tsx.
 *
 * Module level, so the options object is the same one on every render.
 * expo-router calls setOptions again whenever it is a new object.
 *
 * No type annotation on purpose: the inferred type is assignable, and
 * importing the navigator's own options type would add an import for a
 * package this file does not otherwise need.
 */
const STACK_OPTIONS = { headerShown: false };

export default function CategoriesStackLayout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}