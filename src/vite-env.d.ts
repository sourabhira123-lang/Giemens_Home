interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_JURIVANA_URL?: string;
  readonly VITE_CONTACT_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
