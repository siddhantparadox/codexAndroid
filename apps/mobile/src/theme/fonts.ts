import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  useFonts as useFraunces
} from "@expo-google-fonts/fraunces";
import {
  AzeretMono_400Regular,
  AzeretMono_500Medium,
  useFonts as useAzeret
} from "@expo-google-fonts/azeret-mono";
import {
  Commissioner_400Regular,
  Commissioner_500Medium,
  Commissioner_600SemiBold,
  useFonts as useCommissioner
} from "@expo-google-fonts/commissioner";

export function useAppFonts(): boolean {
  const [frauncesLoaded] = useFraunces({ Fraunces_600SemiBold, Fraunces_700Bold });
  const [commLoaded] = useCommissioner({
    Commissioner_400Regular,
    Commissioner_500Medium,
    Commissioner_600SemiBold
  });
  const [azeretLoaded] = useAzeret({
    AzeretMono_400Regular,
    AzeretMono_500Medium
  });

  return frauncesLoaded && commLoaded && azeretLoaded;
}

export const fontFamilies = {
  display: "Fraunces_700Bold",
  displayAlt: "Fraunces_600SemiBold",
  body: "Commissioner_400Regular",
  bodyMedium: "Commissioner_500Medium",
  bodySemibold: "Commissioner_600SemiBold",
  mono: "AzeretMono_400Regular",
  monoMedium: "AzeretMono_500Medium"
} as const;
