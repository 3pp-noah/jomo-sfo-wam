import JomoApp from "./App";
import PaletteComparison from "./PaletteComparison";

const DEV_VIEW = "jomo";   // change to "palette" when testing palettes
// const DEV_VIEW = "palette";

export default function AppLauncher() {
  if (DEV_VIEW === "palette") {
    return <PaletteComparison />;
  }

  return <JomoApp />;
}
