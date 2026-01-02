// CommonJS (compatible con el runtime default de Vercel/Node cuando no hay `"type": "module"`)
const { readFileSync } = require("fs");
const { join } = require("path");

// Cargar SVGs desde archivos (este archivo vive en /lib)
const FRONT_SVG = readFileSync(join(__dirname, "front.svg"), "utf-8");
const BACK_SVG = readFileSync(join(__dirname, "back.svg"), "utf-8");

module.exports = { FRONT_SVG, BACK_SVG };

