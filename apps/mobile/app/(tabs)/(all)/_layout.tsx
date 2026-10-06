import { Stack } from "expo-router";

/*
 * The All tab's own stack. Same reason as Home's: a title page opened from an
 * All card is pushed inside this stack, so the back arrow returns to All's
 * list rather than to the first tab.
 */
const STACK_OPTIONS = { headerShown: false };

export default function AllStackLayout() {
  return <Stack screenOptions={STACK_OPTIONS} />;
}