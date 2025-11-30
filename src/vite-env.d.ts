/// <reference types="vite/client" />

interface ImportMetaEnv {
  // ThirdWeb Configuration
  readonly VITE_THIRDWEB_CLIENT_ID: string;
  
  // Treasury wallet for receiving payments
  readonly VITE_TREASURY_WALLET: `0x${string}`;
  
  // Network configuration
  readonly VITE_USE_MAINNET: string;
  
  // API endpoint (optional, defaults to same origin)
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

