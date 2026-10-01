import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

/*
 * Load the icon font once, as soon as the app starts.
 *
 * An Ionicons icon draws an EMPTY <Text /> until its font has loaded
 * (@expo/vector-icons 15.1.1, createIconSet.js line 79). The swipe buttons
 * are nothing but icons, so without this the first swipe after a launch can
 * show a blank red block. Started here, at module load, the font has the
 * whole launch to arrive before anyone swipes.
 *
 * The dev line says when it finished, so a blank block can be told apart
 * from a slow load. A failure is logged rather than thrown: the icon then
 * loads itself on first use, which is the same as not preloading at all.
 */
const iconFontStartedAt = Date.now();
Ionicons.loadFont()
  .then(() => {
    if (__DEV__) {
      console.log(`icon font loaded after ${Date.now() - iconFontStartedAt}ms`);
    }
  })
  .catch((e: unknown) => {
    if (__DEV__) console.warn("icon font failed to preload", e);
  });

/*
 * The root Stack holds one screen: the (tabs) group. Every screen inside it
 * draws its own top, so the Stack's header is switched off here, once.
 * Without this, the Stack draws its own header bar above the tabs, the same
 * kind of bar the list screen used to hide for itself.
 *
 * The Stack stays, rather than becoming a plain Slot, so that a screen can
 * later be pushed on top of the tabs.
 *
 * Module level, like every options object in this app: one object for the
 * life of the app, never a new one per render.
 */
const STACK_OPTIONS = { headerShown: false };

export default function RootLayout() {
  return (
    // No style prop, on purpose.
    //
    // GestureHandlerRootView.tsx line 21 is `style={style ?? styles.container}`
    // and its own default on line 27 is { flex: 1 }. The ?? REPLACES, it does
    // not merge — so passing any style object without flex: 1 in it collapses
    // this View to zero height and the app renders blank. Passing nothing at
    // all is the version that cannot be got wrong.
    <GestureHandlerRootView>
      {/* Every KeyboardAvoidingView from react-native-keyboard-controller
          reads the keyboard's movement from this provider. Outside it, that
          view silently never moves; the only sign is a dev warning saying
          "Couldn't find real values for `KeyboardContext`".

          Here, at the root, it also reaches inside every Modal: a Modal is a
          separate native window but the same React tree, and React context
          follows the tree.

          No props. The library detects edge-to-edge by itself. */}
      <KeyboardProvider>
        <Stack screenOptions={STACK_OPTIONS} />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
