import { Redirect } from 'expo-router';

// Análises is now part of Início; old links land there.
export default function AnalysesMoved() {
  return <Redirect href="/" />;
}
