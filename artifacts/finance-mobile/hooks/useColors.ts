import colors from "@/constants/colors";
import { useSettings } from "@/contexts/SettingsContext";

export function useColors() {
  const { settings } = useSettings();
  const isDark = settings.theme === "dark";
  const palette = isDark
    ? (colors as Record<string, typeof colors.light>).dark ?? colors.light
    : colors.light;
  return { ...palette, radius: colors.radius };
}
