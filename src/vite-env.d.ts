/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly IP_HARD_WARE?: string;
  readonly VITE_IP_HARD_WARE?: string;
  readonly HARDWARE_BASE_URLS?: string;
  readonly VITE_HARDWARE_BASE_URLS?: string;
  readonly HARDWARE_OPEN_PATH?: string;
  readonly VITE_HARDWARE_OPEN_PATH?: string;
  readonly HARDWARE_OPEN_PATHS?: string;
  readonly VITE_HARDWARE_OPEN_PATHS?: string;
  readonly HARDWARE_STATUS_PATH?: string;
  readonly VITE_HARDWARE_STATUS_PATH?: string;
  readonly HARDWARE_STATUS_PATHS?: string;
  readonly VITE_HARDWARE_STATUS_PATHS?: string;
  readonly HARDWARE_BOX_ID_MAP?: string;
  readonly VITE_HARDWARE_BOX_ID_MAP?: string;
  readonly HARDWARE_TIMEOUT_MS?: string;
  readonly VITE_HARDWARE_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
