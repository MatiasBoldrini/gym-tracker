// The atlas is batched by training group offline. Each draw uses the same geometry for display and picking.
type Accessor = { bufferView: number; byteOffset?: number; count: number; componentType: number; normalized?: boolean; min?: number[]; max?: number[] };
type BufferView = { byteOffset?: number; byteStride?: number; byteLength: number };
type BodyFile = {
    accessors: Accessor[];
    bufferViews: BufferView[];
    meshes: { extras: { zone: number; bone: boolean }; primitives: { attributes: { POSITION: number; NORMAL: number }; indices: number }[] }[];
};

// Spans are in model space so framing remains responsive when the canvas resizes.
export const overview = { yaw: 20, centerY: 0, centerZ: 0, spanX: 0.84, spanY: 2 / 0.94 };
export type BodyView = typeof overview;

const vertexSource = `
attribute vec3 position, normal;
uniform vec2 rotation;
uniform vec2 center, projection;
varying vec3 faceNormal;
vec3 rotateBody(vec3 p) {
    vec3 r = vec3(rotation.x * p.x + rotation.y * p.z, p.y, rotation.x * p.z - rotation.y * p.x);
    return vec3(r.x, r.y * 0.999 - r.z * 0.045, r.y * 0.045 + r.z * 0.999);
}
void main() {
    vec3 p = rotateBody(position - vec3(0.0, center));
    gl_Position = vec4(p.xy * projection, -p.z * 0.6, 1.0);
    faceNormal = rotateBody(normal);
}`;
const fragmentSource = `
precision mediump float;
uniform vec3 surface;
uniform bool picking;
varying vec3 faceNormal;
void main() {
    if (picking) { gl_FragColor = vec4(surface, 1.0); return; }
    vec3 n = normalize(faceNormal);
    float key = max(dot(n, normalize(vec3(-0.55, 0.67, 0.68))), 0.0);
    float fill = max(dot(n, normalize(vec3(0.70, 0.38, -0.62))), 0.0);
    float sheen = pow(max(dot(n, normalize(vec3(-0.29, 0.41, 0.86))), 0.0), 18.0);
    gl_FragColor = vec4(surface * (0.66 + 0.34 * key + 0.12 * fill) + 0.05 * sheen, 1.0);
}`;

export function createBodyRenderer(canvas: HTMLCanvasElement, file: ArrayBuffer) {
    const context = canvas.getContext("webgl", { alpha: true, antialias: true, powerPreference: "low-power" });
    if (!context) throw new Error("WebGL no está disponible");
    const gl = context;
    const program = gl.createProgram()!;
    const buffers = new Map<number, WebGLBuffer>();
    const dispose = () => { buffers.forEach(buffer => gl.deleteBuffer(buffer)); gl.deleteProgram(program); };
    try {
        for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
            const shader = gl.createShader(type)!;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            gl.attachShader(program, shader);
            gl.deleteShader(shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("No se pudo preparar el modelo");
        gl.useProgram(program);
        const jsonBytes = new DataView(file).getUint32(12, true);
        const model: BodyFile = JSON.parse(new TextDecoder().decode(new Uint8Array(file, 20, jsonBytes)));
        function bind(target: number, index: number) {
            const view = model.bufferViews[index];
            const existing = buffers.get(index);
            if (existing) gl.bindBuffer(target, existing);
            else {
                const buffer = gl.createBuffer()!;
                buffers.set(index, buffer);
                gl.bindBuffer(target, buffer);
                gl.bufferData(target, new Uint8Array(file, 28 + jsonBytes + (view.byteOffset ?? 0), view.byteLength), gl.STATIC_DRAW);
            }
            return view;
        }
        const position = gl.getAttribLocation(program, "position");
        const normal = gl.getAttribLocation(program, "normal");
        gl.enableVertexAttribArray(position);
        gl.enableVertexAttribArray(normal);
        function attribute(location: number, accessor: Accessor) {
            const view = bind(gl.ARRAY_BUFFER, accessor.bufferView);
            gl.vertexAttribPointer(location, 3, accessor.componentType, !!accessor.normalized, view.byteStride ?? 0, accessor.byteOffset ?? 0);
        }
        const parts = model.meshes.flatMap(mesh => mesh.primitives.map(part => ({
            ...mesh.extras, position: model.accessors[part.attributes.POSITION],
            normal: model.accessors[part.attributes.NORMAL], indices: model.accessors[part.indices],
        })));
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.DITHER);
        const rotation = gl.getUniformLocation(program, "rotation");
        const center = gl.getUniformLocation(program, "center");
        const projection = gl.getUniformLocation(program, "projection");
        const surface = gl.getUniformLocation(program, "surface");
        const picking = gl.getUniformLocation(program, "picking");
        function focusView(zone: number, yaw: number): BodyView {
            const bounds = parts.find(part => part.zone === zone)?.position;
            if (!bounds?.min || !bounds.max) return { ...overview, yaw };
            const { min, max } = bounds;
            const front = Math.cos(yaw * Math.PI / 180);
            if ((zone === 2 || zone === 6) && front > -0.55) yaw = 165;
            if ((zone === 1 || zone === 5) && front < 0.55) yaw = overview.yaw;
            // A three-quarter view fits the arms and their full range on a narrow screen.
            if (zone === 4 && Math.abs(front) > 0.82) {
                yaw = front > 0 ? (yaw > 180 ? 305 : 55) : (yaw > 180 ? 235 : 125);
            }
            const angle = yaw * Math.PI / 180;
            const unit = bounds.normalized && bounds.componentType === gl.SHORT ? 1 / 32767 : 1;
            const [w, h, d] = max.map((value, i) => (value - min[i]) * unit);
            return {
                yaw, centerY: (max[1] + min[1]) * unit / 2,
                centerZ: (max[2] + min[2]) * unit / 2,
                spanX: 1.14 * (Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * d),
                spanY: Math.max(0.82, 1.14 * (h + 0.045 * Math.hypot(w, d))),
            };
        }
        function draw(view: BodyView, colors: string[], selected: number | null, pick = false) {
            const angle = view.yaw * Math.PI / 180;
            const aspect = canvas.height / canvas.width;
            const scale = 2 / Math.max(view.spanY, view.spanX * aspect);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.uniform2f(rotation, Math.cos(angle), Math.sin(angle));
            gl.uniform2f(center, view.centerY, view.centerZ);
            gl.uniform2f(projection, scale * aspect, scale);
            gl.uniform1i(picking, Number(pick));
            for (const part of parts) {
                if (pick) {
                    // One bit per channel distinguishes solid IDs from antialiased boundaries.
                    gl.uniform3f(surface, part.zone & 1, (part.zone >> 1) & 1, (part.zone >> 2) & 1);
                } else {
                    const hex = part.zone ? colors[part.zone] : part.bone ? "#e6e0d5" : "#c5b9ae";
                    const rgb = parseInt(hex.slice(1), 16);
                    const strength = selected !== null && part.zone !== selected ? 0.12 : 1;
                    const channel = (value: number) => strength * (value & 255) / 255 + (1 - strength) * 0.85;
                    gl.uniform3f(surface, channel(rgb >> 16), channel(rgb >> 8), channel(rgb));
                }
                attribute(position, part.position);
                attribute(normal, part.normal);
                bind(gl.ELEMENT_ARRAY_BUFFER, part.indices.bufferView);
                gl.drawElements(gl.TRIANGLES, part.indices.count, part.indices.componentType, part.indices.byteOffset ?? 0);
            }
        }
        return { draw, focusView, dispose, pick(view: BodyView, colors: string[], selected: number | null, x: number, y: number) {
            draw(view, colors, selected, true);
            const pixel = new Uint8Array(4);
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            draw(view, colors, selected);
            if (pixel[3] !== 255 || pixel.some(channel => channel !== 0 && channel !== 255)) return null;
            const id = Number(pixel[0] > 0) + 2 * Number(pixel[1] > 0) + 4 * Number(pixel[2] > 0);
            return id || null;
        } };
    } catch (error) { dispose(); throw error; }
}
