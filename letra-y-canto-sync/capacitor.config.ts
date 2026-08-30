import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vcgraphicdesign.letraycantos',
  appName: 'Letra y Canto Sync',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0f0f1a',
  },
};

export default config;
