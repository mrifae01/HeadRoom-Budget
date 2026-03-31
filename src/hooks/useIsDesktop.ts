import { useWindowDimensions, Platform } from 'react-native';

/**
 * Returns true when running in a web browser at desktop width (≥ 768 px).
 * Reactively updates on window resize.
 */
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= 768;
}
