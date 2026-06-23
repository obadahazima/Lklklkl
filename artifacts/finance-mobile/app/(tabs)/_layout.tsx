import { useAuth } from "@clerk/expo";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Redirect, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { Feather } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/contexts/SettingsContext";
import { useTr } from "@/lib/i18n";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(getToken);
  }, [getToken]);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f6f9" }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <>{children}</>;
}

function NativeTabLayout() {
  const { settings } = useSettings();
  const { showClients, showTrips, showStudios } = settings;

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>الرئيسية</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="transactions">
        <Icon sf={{ default: "arrow.left.arrow.right", selected: "arrow.left.arrow.right.circle.fill" }} />
        <Label>المعاملات</Label>
      </NativeTabs.Trigger>
      {showClients && (
        <NativeTabs.Trigger name="clients">
          <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
          <Label>العملاء</Label>
        </NativeTabs.Trigger>
      )}
      {showTrips && (
        <NativeTabs.Trigger name="trips">
          <Icon sf={{ default: "shippingbox", selected: "shippingbox.fill" }} />
          <Label>الرحلات</Label>
        </NativeTabs.Trigger>
      )}
      {showStudios && (
        <NativeTabs.Trigger name="studios">
          <Icon sf={{ default: "building.2", selected: "building.2.fill" }} />
          <Label>الاستوديوهات</Label>
        </NativeTabs.Trigger>
      )}
      <NativeTabs.Trigger name="chat">
        <Icon sf={{ default: "bubble.left", selected: "bubble.left.fill" }} />
        <Label>المساعد</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <Label>الإعدادات</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function TopTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const { settings } = useSettings();
  const { showClients, showTrips, showStudios } = settings;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";

  const hiddenRoutes = new Set<string>([
    ...(!showClients ? ["clients"] : []),
    ...(!showTrips ? ["trips"] : []),
    ...(!showStudios ? ["studios"] : []),
  ]);

  return (
    <SafeAreaView
      edges={["top"]}
      style={{
        backgroundColor: isIOS ? "transparent" : colors.card,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      {isIOS && (
        <BlurView
          intensity={90}
          tint={isDark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRowContent}
        style={styles.tabRow}
      >
        {state.routes
          .map((route, originalIndex) => ({ route, originalIndex }))
          .filter(({ route }) => !hiddenRoutes.has(route.name))
          .map(({ route, originalIndex }) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === originalIndex;
            const label = typeof options.title === "string" ? options.title : route.name;
            const iconEl = options.tabBarIcon?.({
              focused: isFocused,
              color: isFocused ? colors.primary : colors.mutedForeground,
              size: 21,
            });

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                style={[
                  styles.tabItem,
                  { borderBottomColor: isFocused ? colors.primary : "transparent" },
                ]}
              >
                {iconEl}
                <Text
                  style={[
                    styles.tabLabel,
                    { color: isFocused ? colors.primary : colors.mutedForeground },
                    isFocused && styles.tabLabelActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
      </ScrollView>
    </SafeAreaView>
  );
}

function ClassicTabLayout() {
  const isIOS = Platform.OS === "ios";
  const { settings } = useSettings();
  const { showClients, showTrips, showStudios } = settings;
  const t = useTr(settings.language);

  return (
    <Tabs
      tabBar={(props) => <TopTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("dashboard"),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={22} />
            ) : (
              <Feather name="home" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: t("transactions"),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="arrow.left.arrow.right" tintColor={color} size={22} />
            ) : (
              <Feather name="repeat" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: t("clients"),
          href: showClients ? undefined : null,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person.2" tintColor={color} size={22} />
            ) : (
              <Feather name="users" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: t("trips"),
          href: showTrips ? undefined : null,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="shippingbox" tintColor={color} size={22} />
            ) : (
              <Feather name="package" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="studios"
        options={{
          title: t("studios"),
          href: showStudios ? undefined : null,
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="building.2" tintColor={color} size={22} />
            ) : (
              <Feather name="home" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t("chat"),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="bubble.left" tintColor={color} size={22} />
            ) : (
              <Feather name="message-circle" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings"),
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="gearshape" tintColor={color} size={22} />
            ) : (
              <Feather name="settings" size={20} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return (
      <AuthGate>
        <NativeTabLayout />
      </AuthGate>
    );
  }
  return (
    <AuthGate>
      <ClassicTabLayout />
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: "row",
  },
  tabRowContent: {
    paddingHorizontal: 4,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 2,
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "400",
  },
  tabLabelActive: {
    fontWeight: "600",
  },
});
