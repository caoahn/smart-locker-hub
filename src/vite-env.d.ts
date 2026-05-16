/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly IP_HARD_WARE?: string;
  readonly VITE_IP_HARD_WARE?: string;
  readonly HARDWARE_OPEN_PATH?: string;
  readonly VITE_HARDWARE_OPEN_PATH?: string;
  readonly HARDWARE_TIMEOUT_MS?: string;
  readonly VITE_HARDWARE_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
