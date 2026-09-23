import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

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
      <Stack />
    </GestureHandlerRootView>
  );
}