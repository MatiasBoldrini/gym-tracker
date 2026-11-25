// Rebuild from a local copy of the pinned GLB, or fetch it with no arguments.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Document, NodeIO, getBounds } from "@gltf-transform/core";
import { KHRDracoMeshCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import draco from "draco3dgltf";
import { mat3, mat4, vec3 } from "gl-matrix";
import { MeshoptSimplifier } from "meshoptimizer";

const source = "https://raw.githubusercontent.com/tiralonghipol/free-muscles/605dd1ca351421ad874a03f673a2a3f915ab254e/public/anatomy.glb";
const expectedHash = "f2100ae79cd7fc1d759248b7bbe928a461f93087b1a53a964edc47837d821c67";
const bytes = process.argv[2] ? await readFile(process.argv[2]) : await fetch(source).then(async response => {
    if (!response.ok) throw new Error(`No se pudo descargar el atlas (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
});
if (createHash("sha256").update(bytes).digest("hex") !== expectedHash) throw new Error("El archivo no corresponde al modelo de Free Muscle fijado.");

const io = new NodeIO().registerExtensions([KHRDracoMeshCompression, KHRMeshQuantization])
    .registerDependencies({ "draco3d.decoder": await draco.createDecoderModule() });
const atlas = await io.readBinary(bytes);
await MeshoptSimplifier.ready;
const bounds = getBounds(atlas.getRoot().listScenes()[0]);
const center = vec3.lerp(vec3.create(), bounds.min, bounds.max, 0.5);
const scale = 2 / (bounds.max[1] - bounds.min[1]);

// IDs are used by the weekly training data. Bone, neck and unassigned tissue stay neutral.
const groups = [
    { name: "Huesos", zone: 0, sources: [] },
    { name: "Otros tejidos", zone: 0, sources: ["neck"] },
    { name: "Pecho", zone: 1, sources: ["chest"] },
    { name: "Espalda", zone: 2, sources: ["middle back", "lower back", "traps", "lats"] },
    { name: "Hombros", zone: 3, sources: ["shoulders"] },
    { name: "Brazos", zone: 4, sources: ["biceps", "triceps", "forearms"] },
    { name: "Abdomen", zone: 5, sources: ["abdominals"] },
    { name: "Glúteos", zone: 6, sources: ["glutes"] },
    { name: "Piernas", zone: 7, sources: ["quadriceps", "hamstrings", "calves", "adductors", "abductors"] },
].map(group => ({ ...group, positions: [], normals: [], indices: [] }));

for (const node of atlas.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const { kind, group: sourceGroup } = node.getExtras();
    const batch = kind === "bone" ? groups[0] : kind === "other" ? groups[1]
        : groups.find(group => group.sources.includes(sourceGroup));
    if (!batch) throw new Error("Grupo desconocido en Free Muscle: " + node.getName());
    const matrix = node.getWorldMatrix();
    const normalMatrix = mat3.normalFromMat4(mat3.create(), matrix);
    const mirrored = mat4.determinant(matrix) < 0;
    for (const part of mesh.listPrimitives()) {
        const pos = part.getAttribute("POSITION").getArray();
        const norm = part.getAttribute("NORMAL").getArray();
        const input = Uint32Array.from(part.getIndices().getArray());
        // Simplify each named piece independently so even small muscles remain distinct.
        const target = Math.min(input.length, Math.max(36, Math.round(input.length / 10) * 3));
        const [indices] = MeshoptSimplifier.simplify(input, pos, 3, target, 0.012);
        const first = batch.positions.length / 3;
        const [remap] = MeshoptSimplifier.compactMesh(indices);
        const xyz = vec3.create(), normal = vec3.create();
        for (let i = 0; i < remap.length; i++) {
            if (remap[i] === 0xffffffff) continue;
            const offset = (first + remap[i]) * 3;
            vec3.transformMat4(xyz, pos.subarray(i * 3, i * 3 + 3), matrix);
            vec3.transformMat3(normal, norm.subarray(i * 3, i * 3 + 3), normalMatrix);
            vec3.normalize(normal, normal);
            for (let axis = 0; axis < 3; axis++) {
                batch.positions[offset + axis] = Math.round((xyz[axis] - center[axis]) * scale * 32767);
                batch.normals[offset + axis] = Math.round(normal[axis] * 127);
            }
        }
        for (let i = 0; i < indices.length; i += 3) {
            batch.indices.push(first + indices[i], first + indices[i + (mirrored ? 2 : 1)], first + indices[i + (mirrored ? 1 : 2)]);
        }
    }
}
const doc = new Document();
doc.createExtension(KHRMeshQuantization).setRequired(true);
doc.getRoot().getAsset().copyright = "Free Muscle by tiralonghipol, from Z-Anatomy (Gauthier Kervyn et al.) and BodyParts3D © DBCLS. Adapted for Gym Tracker. CC BY-SA 4.0.";
const scene = doc.createScene("Fatiga");
const buffer = doc.createBuffer();
function attribute(array, type, normalized = false) {
    return doc.createAccessor().setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer);
}
for (const group of groups) {
    if (!group.indices.length || group.positions.length / 3 > 65535) throw new Error("Geometría inesperada para " + group.name);
    const part = doc.createPrimitive().setAttribute("POSITION", attribute(Int16Array.from(group.positions), "VEC3", true))
        .setAttribute("NORMAL", attribute(Int8Array.from(group.normals), "VEC3", true))
        .setIndices(attribute(Uint16Array.from(group.indices), "SCALAR"));
    const mesh = doc.createMesh(group.name).setExtras({ zone: group.zone, bone: group === groups[0] }).addPrimitive(part);
    scene.addChild(doc.createNode(group.name).setMesh(mesh));
}
const file = await io.writeBinary(doc);
await writeFile(new URL("../apps/web/src/components/fatigue/body.glb", import.meta.url), file);
console.log(`${groups.length} mallas, ${groups.reduce((n, group) => n + group.indices.length / 3, 0)} triángulos, ${file.byteLength} bytes.`);
