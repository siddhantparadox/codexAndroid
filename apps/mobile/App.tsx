import { StatusBar } from "expo-status-bar";
import React from "react";
import { SafeAreaView, StyleSheet, Text } from "react-native";
import { getAppTitle } from "./src/config";

export const App = (): React.ReactElement => {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>{getAppTitle()}</Text>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f6f7fb"
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827"
  }
});

export default App;