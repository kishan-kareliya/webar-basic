/**
 * glTF I/O setup — creates a NodeIO instance with all known extensions registered.
 *
 * Registering extensions means gltf-transform can read and decode them
 * (e.g. Draco gets auto-decoded on read). Without registration, models
 * using those extensions would fail to load or lose data silently.
 */
import { NodeIO } from "@gltf-transform/core";
import {
  KHRDracoMeshCompression,
  KHRMaterialsUnlit,
  KHRMaterialsSpecular,
  KHRMaterialsIOR,
  KHRMaterialsVolume,
  KHRMaterialsTransmission,
  KHRMaterialsSheen,
  KHRMaterialsClearcoat,
  KHRMeshQuantization,
  KHRTextureBasisu,
  KHRTextureTransform,
} from "@gltf-transform/extensions";

/**
 * Create a configured NodeIO instance ready to read/write GLB files.
 */
export function createIO() {
  return new NodeIO().registerExtensions([
    KHRDracoMeshCompression,
    KHRMaterialsUnlit,
    KHRMaterialsSpecular,
    KHRMaterialsIOR,
    KHRMaterialsVolume,
    KHRMaterialsTransmission,
    KHRMaterialsSheen,
    KHRMaterialsClearcoat,
    KHRMeshQuantization,
    KHRTextureBasisu,
    KHRTextureTransform,
  ]);
}
