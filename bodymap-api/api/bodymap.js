
const { Resvg } = require("@resvg/resvg-js");
const sharp = require("sharp");
const { FRONT_SVG, BACK_SVG } = require("../lib/svgTemplates");

// Default width for the generated image
const DEFAULT_WIDTH = 1200;

module.exports = async (req, res) => {
    try {
        const { query } = req;
        const { view = "front", ...muscles } = query;

        // Select the base SVG template
        let svgTemplate = view === "back" ? BACK_SVG : FRONT_SVG;

        // Iterate over muscle parameters and update fill colors in the SVG
        Object.keys(muscles).forEach((muscle) => {
            const color = muscles[muscle];
            // Target the group ID for the muscle. 
            // The assumption is that the group <g id="muscle"> contains paths that will inherit the fill or set it explicitly.
            // Based on the SVG provided, path has fill="currentColor".
            // We can try adding style="color: #HEX" to the group, or replacing existing fill attributes if any.
            // Since the paths use currentColor, setting 'style="color: ..."' on the use/g should work, 
            // BUT these are direct paths inside groups. 

            // A robust way given the SVG structure:
            // <g id="muscleName" class="bodymap"> ... </g>
            // We can use regex to find the group and inject the color.

            // Regex explanation:
            // Look for id="muscle"
            // Then find the closing > of that group tag or any subsequent tag if we want to be simple? 
            // Actually, better: inject `style="color: #${color}"` into the group tag.
            // The tag looks like: <g id="calves" class="bodymap">

            const regex = new RegExp(`(<g id="${muscle}"[^>]*)>`, "g");
            if (regex.test(svgTemplate)) {
                // Inject color style. If input lacks #, add it.
                const hexColor = color.startsWith("#") ? color : `#${color}`;
                svgTemplate = svgTemplate.replace(regex, `$1 style="color: ${hexColor}">`);
            }
        });

        // Initialize Resvg
        const opts = {
            fitTo: {
                mode: "width",
                value: DEFAULT_WIDTH,
            },
            font: {
                loadSystemFonts: false, // Ensure consistent rendering
            },
        };

        const resvg = new Resvg(svgTemplate, opts);
        const pngData = resvg.render();
        const pngBuffer = pngData.asPng();

        // Optimize with Sharp (convert to WebP)
        const optimizedBuffer = await sharp(pngBuffer)
            .webp({ quality: 80 }) // 80 is a good balance for web
            .toBuffer();

        // Set headers and send response
        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // Cache for long time since params dictate content
        res.status(200).send(optimizedBuffer);

    } catch (error) {
        console.error("Error generating image:", error);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};
