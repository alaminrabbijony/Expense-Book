import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack } from "expo-router";
import { StatusBar, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { PALETTES, schemeOf } from "@/theme/palette";

/*
 * Load the icon fonts once, as soon as the app starts.
 *
 * An icon draws an EMPTY <Text /> until its font has loaded
 * (@expo/vector-icons 15.1.1, createIconSet.js line 79). The swipe buttons
 * are nothing but icons, so without this the first swipe after a launch can
 * show a blank red block. Started here, at module load, the fonts have the
 * whole launch to arrive before anyone swipes.
 *
 * TWO FONTS NOW. A category's icon can come from either: Ionicons, or
 * MaterialCommunityIcons for the thousands of things Ionicons has no
 * picture of. Each font is a separate file and each needs its own call —
 * loading one does nothing for the other.
 *
 * They start together and finish independently, so the line says which one
 * it is talking about. A blank glyph on a card while another font's icons
 * draw fine is otherwise very hard to read.
 *
 * A failure is logged rather than thrown: the font then loads itself on
 * first use, which is the same as not preloading at all.
 */
function preloadIconFont(label: string, load: () => Promise<void>) {
  const startedAt = Date.now();
  load()
    .then(() => {
      if (__DEV__) {
        console.log(
          `icon font loaded: ${label} after ${Date.now() - startedAt}ms`,
        );
      }
    })
    .catch((e: unknown) => {
      if (__DEV__) console.warn(`icon font failed to preload: ${label}`, e);
    });
}

preloadIconFont("Ionicons", () => Ionicons.loadFont());
preloadIconFont("MaterialCommunityIcons", () =>
  MaterialCommunityIcons.loadFont(),
);

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

/*
 * THE CLOCK AND BATTERY ICONS, FOR THE WHOLE APP, IN ONE PLACE.
 *
 * React Native's StatusBar is not a normal component. Every mounted one goes
 * into a stack inside the module, and THE MOST RECENTLY MOUNTED ONE WINS —
 * so two of them in the tree is not two settings, it is a race decided by
 * mount order.
 *
 * That is why this cannot stay per screen. Tab screens mount the first time
 * they are visited and then stay mounted, so a StatusBar on the Categories
 * tab would keep winning after a switch back to Home. In light mode that
 * would put dark icons on Home's black page: a screen broken by a screen
 * that is not even on top.
 *
 * So: one here, and the hardcoded "light-content" ones came OUT of
 * comp/ExpenseListScreen.tsx and comp/CategoryPage.tsx. If a third turns up
 * anywhere, it silently takes over from this one.
 *
 * ITS OWN COMPONENT, not useColorScheme() in RootLayout, and that is the
 * point of it being three lines. The hook re-renders the component that
 * calls it. Called here, a theme switch re-renders this and nothing else.
 * Called in RootLayout, it would re-render the component that wraps the
 * gesture root, the keyboard provider and the whole navigation tree.
 */
function ThemedStatusBar() {
  const scheme = schemeOf(useColorScheme());
  return <StatusBar barStyle={PALETTES[scheme].statusBar} />;
}

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
      <ThemedStatusBar />

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