import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.xvirtualuniverse.infinity',
  appName: 'X-Virtual-Universe-Infinity',
  webDir: 'dist/public',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
  },
};

export default config;