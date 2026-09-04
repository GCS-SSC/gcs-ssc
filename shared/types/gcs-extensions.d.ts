declare module '#gcs-extensions/registry' {
  import type { Component } from 'vue'
  import type { GcsClientExtensionManifest } from '~~/shared/utils/extensions'

  export const gcsExtensions: GcsClientExtensionManifest[]
  export const gcsExtensionComponents: Record<string, Component>
  export const getGcsExtensions: () => GcsClientExtensionManifest[]
  export const getGcsExtensionByKey: (key: string) => GcsClientExtensionManifest | null
  export const getGcsExtensionComponent: (name: string) => Component | null
}

declare module '#gcs-extensions/metadata' {
  import type { GcsClientExtensionManifest } from '~~/shared/utils/extensions'

  export const gcsExtensions: GcsClientExtensionManifest[]
  export const getGcsExtensions: () => GcsClientExtensionManifest[]
  export const getGcsExtensionByKey: (key: string) => GcsClientExtensionManifest | null
}

declare module '#gcs-extensions/server-registry' {
  import type { GcsRegisteredExtension } from '~~/shared/utils/extensions'

  export const gcsExtensions: GcsRegisteredExtension[]
  export const getGcsExtensions: () => GcsRegisteredExtension[]
  export const getGcsExtensionByKey: (key: string) => GcsRegisteredExtension | null
  export const loadGcsExtensionModule: (id: string) => Promise<unknown>
}
