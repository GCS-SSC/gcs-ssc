declare module '#gcs-extensions/registry' {
  import type { Component } from 'vue'
  import type { GcsClientExtensionManifest } from '~~/shared/utils/extensions'

  const gcsExtensions: GcsClientExtensionManifest[]
  const gcsExtensionComponents: Record<string, Component>
  const getGcsExtensions: () => GcsClientExtensionManifest[]
  const getGcsExtensionByKey: (key: string) => GcsClientExtensionManifest | null
  const getGcsExtensionComponent: (name: string) => Component | null
}

declare module '#gcs-extensions/metadata' {
  import type { GcsClientExtensionManifest } from '~~/shared/utils/extensions'

  const gcsExtensions: GcsClientExtensionManifest[]
  const getGcsExtensions: () => GcsClientExtensionManifest[]
  const getGcsExtensionByKey: (key: string) => GcsClientExtensionManifest | null
}

declare module '#gcs-extensions/server-registry' {
  import type { GcsRegisteredExtension } from '~~/shared/utils/extensions'

  const gcsExtensions: GcsRegisteredExtension[]
  const getGcsExtensions: () => GcsRegisteredExtension[]
  const getGcsExtensionByKey: (key: string) => GcsRegisteredExtension | null
  const loadGcsExtensionModule: (id: string) => Promise<unknown>
}
